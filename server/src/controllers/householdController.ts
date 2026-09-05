import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { Household } from '../models/Household';
import { Person, IPerson, PersonStatus, VulnerabilityFlag } from '../models/Person';
import { Site } from '../models/Site';
import { Ward } from '../models/Ward';
import { generateQrDataUrl } from '../utils/qr';
import { resolveScopedSiteIds } from '../utils/scopeResolvers';
import { ApiError } from '../utils/ApiError';

// Field roles collect data at a Site (Appflow.md); municipality_ward/central
// may also register/correct records administratively.
const REGISTER_ROLES = ['volunteer', 'police', 'army', 'municipality_ward', 'central'];

interface IncomingPerson {
  name: string;
  age?: number;
  sex?: 'male' | 'female' | 'other';
  status?: PersonStatus;
  lastKnownLocation?: string | null;
  vulnerabilityFlags?: VulnerabilityFlag[];
}

async function assertSiteInScope(req: Request, siteId: string) {
  const site = await Site.findById(siteId);
  if (!site) throw ApiError.notFound('Site not found');
  if (req.auth!.role === 'central') return site;

  const ward = await Ward.findById(site.wardId);
  if (!ward) throw ApiError.notFound('Ward not found for site');
  if (String(ward.municipalityId) !== req.auth!.scope.municipalityId) {
    throw ApiError.forbidden('Site is outside your scope');
  }
  return site;
}

async function createHouseholdWithPersons(params: {
  siteId: string;
  headOfHouseholdName: string;
  gpsLocation?: { lat: number; lng: number } | null;
  clientUuid: string;
  registeredByUserId: string;
  registeredAt?: Date;
  persons: IncomingPerson[];
}) {
  const household = await Household.create({
    siteId: params.siteId,
    headOfHouseholdName: params.headOfHouseholdName,
    gpsLocation: params.gpsLocation ?? null,
    qrCode: params.clientUuid,
    clientUuid: params.clientUuid,
    registeredByUserId: params.registeredByUserId,
    registeredAt: params.registeredAt ?? new Date(),
  });

  const persons = params.persons?.length
    ? await Person.insertMany(
        params.persons.map((p) => ({
          householdId: household._id,
          name: p.name,
          age: p.age,
          sex: p.sex,
          status: p.status ?? 'normal',
          lastKnownLocation: p.lastKnownLocation ?? null,
          vulnerabilityFlags: p.vulnerabilityFlags ?? [],
        })),
      )
    : [];

  await Site.updateOne({ _id: params.siteId }, { $set: { lastUpdateAt: new Date() } });

  return { household, persons };
}

export async function registerHousehold(req: Request, res: Response) {
  const auth = req.auth!;
  if (!REGISTER_ROLES.includes(auth.role)) {
    throw ApiError.forbidden('Only field personnel or Municipality/Ward can register a household');
  }

  const { siteId, headOfHouseholdName, gpsLocation, clientUuid, persons } = req.body as {
    siteId: string;
    headOfHouseholdName: string;
    gpsLocation?: { lat: number; lng: number } | null;
    clientUuid: string;
    persons?: IncomingPerson[];
  };

  if (!siteId || !headOfHouseholdName || !clientUuid) {
    throw ApiError.badRequest('siteId, headOfHouseholdName, and clientUuid are required');
  }

  await assertSiteInScope(req, siteId);

  const existing = await Household.findOne({ clientUuid });
  if (existing) {
    throw ApiError.badRequest('A household with this clientUuid already exists — use the sync endpoint to upsert');
  }

  const { household, persons: createdPersons } = await createHouseholdWithPersons({
    siteId,
    headOfHouseholdName,
    gpsLocation,
    clientUuid,
    registeredByUserId: auth.userId,
    persons: persons ?? [],
  });

  res.locals.auditTarget = {
    targetId: household._id,
    afterState: { household: household.toObject(), personCount: createdPersons.length },
  };
  res.status(201).json({ household, persons: createdPersons });
}

export async function listHouseholds(req: Request, res: Response) {
  const auth = req.auth!;
  let siteIds: string[] | null = null;

  if (auth.role === 'ngo_ingo' || auth.role === 'private_org' || auth.role === 'donor') {
    // Organizations don't own demographic data directly (Roles.md) — no
    // household visibility outside the shared coordination view.
    return res.json({ households: [] });
  }

  siteIds = await resolveScopedSiteIds(req);
  const query = siteIds === null ? {} : { siteId: { $in: siteIds } };
  const households = await Household.find(query).sort({ registeredAt: -1 }).limit(500);
  res.json({ households });
}

export async function getHousehold(req: Request, res: Response) {
  const household = await Household.findById(req.params.id);
  if (!household) throw ApiError.notFound('Household not found');
  await assertSiteInScope(req, String(household.siteId));
  const persons = await Person.find({ householdId: household._id }).sort({ createdAt: 1 });
  res.json({ household, persons });
}

export async function getHouseholdQr(req: Request, res: Response) {
  const household = await Household.findById(req.params.id);
  if (!household) throw ApiError.notFound('Household not found');
  await assertSiteInScope(req, String(household.siteId));
  const dataUrl = await generateQrDataUrl(household.qrCode);
  res.json({ qrCode: household.qrCode, dataUrl });
}

export async function addPerson(req: Request, res: Response) {
  const household = await Household.findById(req.params.id);
  if (!household) throw ApiError.notFound('Household not found');
  await assertSiteInScope(req, String(household.siteId));

  const { name, age, sex, status, lastKnownLocation, vulnerabilityFlags } = req.body as IncomingPerson;
  if (!name) throw ApiError.badRequest('name is required');

  const person = await Person.create({
    householdId: household._id,
    name,
    age,
    sex,
    status: status ?? 'normal',
    lastKnownLocation: lastKnownLocation ?? null,
    vulnerabilityFlags: vulnerabilityFlags ?? [],
  });

  res.locals.auditTarget = { targetId: person._id, afterState: person.toObject() };
  res.status(201).json({ person });
}

export async function updatePerson(req: Request, res: Response) {
  const person = await Person.findById(req.params.personId);
  if (!person) throw ApiError.notFound('Person not found');
  const household = await Household.findById(person.householdId);
  if (!household) throw ApiError.notFound('Household not found');
  await assertSiteInScope(req, String(household.siteId));

  const before = person.toObject();
  const { status, vulnerabilityFlags, lastKnownLocation, name, age, sex } = req.body as Partial<IPerson>;

  if (status) person.status = status;
  if (vulnerabilityFlags) {
    // Tech.md: "vulnerability flags and demographic status fields are
    // unioned/never silently overwritten by a stale offline copy" — union
    // rather than replace so a later sync of an older client snapshot can't
    // drop a flag another update already recorded.
    const merged = new Set([...(person.vulnerabilityFlags ?? []), ...vulnerabilityFlags]);
    person.vulnerabilityFlags = Array.from(merged) as VulnerabilityFlag[];
  }
  if (lastKnownLocation !== undefined) person.lastKnownLocation = lastKnownLocation;
  if (name) person.name = name;
  if (age !== undefined) person.age = age;
  if (sex) person.sex = sex;

  await person.save();
  await Site.updateOne({ _id: household.siteId }, { $set: { lastUpdateAt: new Date() } });

  res.locals.auditTarget = { targetId: person._id, beforeState: before, afterState: person.toObject() };
  res.json({ person });
}

interface QueuedHouseholdPayload {
  clientUuid: string;
  siteId: string;
  headOfHouseholdName: string;
  gpsLocation?: { lat: number; lng: number } | null;
  capturedAt?: string;
  persons?: IncomingPerson[];
}

/**
 * Bulk upsert-by-clientUuid endpoint the field app's background sync engine
 * flushes its IndexedDB outbox to (Tech.md offline sync approach). Each
 * item is independent: one bad record never blocks the rest of the batch,
 * and re-submitting an already-synced clientUuid is a no-op rather than a
 * duplicate — the core guarantee the offline queue depends on.
 */
export async function syncHouseholds(req: Request, res: Response) {
  const auth = req.auth!;
  if (!REGISTER_ROLES.includes(auth.role)) {
    throw ApiError.forbidden('Only field personnel or Municipality/Ward can sync household records');
  }

  const items = (req.body?.items ?? []) as QueuedHouseholdPayload[];
  if (!Array.isArray(items)) throw ApiError.badRequest('items must be an array');

  const results: Array<{ clientUuid: string; status: 'created' | 'already_synced' | 'error'; error?: string; householdId?: string }> = [];

  for (const item of items) {
    try {
      if (!item.clientUuid || !item.siteId || !item.headOfHouseholdName) {
        results.push({ clientUuid: item.clientUuid ?? 'unknown', status: 'error', error: 'missing required fields' });
        continue;
      }

      const existing = await Household.findOne({ clientUuid: item.clientUuid });
      if (existing) {
        results.push({ clientUuid: item.clientUuid, status: 'already_synced', householdId: String(existing._id) });
        continue;
      }

      await assertSiteInScope(req, item.siteId);

      const { household } = await createHouseholdWithPersons({
        siteId: item.siteId,
        headOfHouseholdName: item.headOfHouseholdName,
        gpsLocation: item.gpsLocation,
        clientUuid: item.clientUuid,
        registeredByUserId: auth.userId,
        registeredAt: item.capturedAt ? new Date(item.capturedAt) : new Date(),
        persons: item.persons ?? [],
      });

      results.push({ clientUuid: item.clientUuid, status: 'created', householdId: String(household._id) });
    } catch (err) {
      results.push({
        clientUuid: item.clientUuid ?? 'unknown',
        status: 'error',
        error: err instanceof ApiError ? err.message : 'sync failed',
      });
    }
  }

  const createdIds = results.filter((r) => r.status === 'created').map((r) => new Types.ObjectId(r.householdId));
  res.locals.auditTarget = { targetId: null, afterState: { createdCount: createdIds.length, results } };
  res.json({ results });
}
