import { Request, Response } from 'express';
import { CashDonation, DonationVerificationStatus } from '../models/CashDonation';
import { FundAllocation } from '../models/FundAllocation';
import { ApiError } from '../utils/ApiError';

const SUBMIT_ROLES = ['ngo_ingo', 'private_org', 'donor', 'central', 'district_cdo', 'municipality_ward'];
const GOV_ROLES = ['central', 'district_cdo', 'municipality_ward'];
const ORG_ROLES = ['ngo_ingo', 'private_org'];

/**
 * Cash & Fund Donations — the money-tracking counterpart to Resource
 * Contributions (Modules.md), kept as its own section because a cash gift
 * doesn't behave like an in-kind one: it doesn't get converted into a
 * Resource sitting at a StorageLocation, it accrues toward a spendable
 * fund balance instead (see getFundSummary / allocateFund below).
 */
export async function submitDonation(req: Request, res: Response) {
  const auth = req.auth!;
  if (!SUBMIT_ROLES.includes(auth.role)) throw ApiError.forbidden('Not permitted to submit a donation');

  const { amount, currency, purpose, donorName } = req.body as {
    amount: number;
    currency?: string;
    purpose?: string;
    donorName?: string;
  };

  if (amount === undefined || Number(amount) <= 0) throw ApiError.badRequest('amount must be greater than 0');

  const isOrg = ORG_ROLES.includes(auth.role);
  const isGov = GOV_ROLES.includes(auth.role);

  const donation = await CashDonation.create({
    donatedByOrganizationId: isOrg ? auth.scope.organizationId : null,
    donatedByUserId: !isOrg && !isGov ? auth.userId : null,
    // A government role recording a contribution on behalf of an external
    // donor (Roles.md) has no linked account to attach it to — just the name.
    donorName: isGov ? (donorName?.trim() || null) : null,
    amount: Number(amount),
    currency: currency?.trim() || 'NPR',
    purpose: purpose?.trim() || null,
    verificationStatus: 'unverified',
    receivedAt: new Date(),
  });

  res.locals.auditTarget = { targetId: donation._id, afterState: donation.toObject() };
  res.status(201).json({ donation });
}

export async function listDonations(req: Request, res: Response) {
  const auth = req.auth!;
  let query: Record<string, unknown> = {};

  // Same visibility rule as Resource Contributions (Rule.md: "All external
  // contributions must be listed centrally"): government roles see
  // everything, an organization sees its own, a donor sees their own.
  if (ORG_ROLES.includes(auth.role)) {
    query = { donatedByOrganizationId: auth.scope.organizationId };
  } else if (auth.role === 'donor') {
    query = { donatedByUserId: auth.userId };
  } else if (!GOV_ROLES.includes(auth.role)) {
    return res.json({ donations: [] });
  }

  const donations = await CashDonation.find(query).sort({ receivedAt: -1 }).limit(500);
  res.json({ donations });
}

/**
 * Central-only, mirroring resourceContributionController.verifyContribution
 * (Roles.md: "Central Government (lists every contribution, decides
 * allocation)"). Verifying just confirms the money is real and counts it
 * toward the fund balance — there's no physical inventory step to do.
 */
export async function verifyDonation(req: Request, res: Response) {
  const auth = req.auth!;
  if (auth.role !== 'central') throw ApiError.forbidden('Only Central can verify a donation');

  const donation = await CashDonation.findById(req.params.id);
  if (!donation) throw ApiError.notFound('Donation not found');
  if (donation.verificationStatus === 'verified') {
    throw ApiError.badRequest('Donation has already been verified');
  }

  const { decision } = req.body as { decision: DonationVerificationStatus };
  if (!['verified', 'unverified'].includes(decision)) {
    throw ApiError.badRequest("decision must be 'verified' or 'unverified'");
  }

  const before = donation.toObject();

  if (decision === 'verified') {
    donation.verificationStatus = 'verified';
    donation.verifiedByUserId = auth.userId as never;
    donation.verifiedAt = new Date();
  } else {
    donation.verificationStatus = 'unverified';
    donation.verifiedByUserId = null;
    donation.verifiedAt = null;
  }

  await donation.save();

  res.locals.auditTarget = { targetId: donation._id, beforeState: before, afterState: donation.toObject() };
  res.json({ donation });
}

async function currentBalances() {
  const [verifiedByCurrency, allocatedByCurrency] = await Promise.all([
    CashDonation.aggregate<{ _id: string; total: number }>([
      { $match: { verificationStatus: 'verified' } },
      { $group: { _id: '$currency', total: { $sum: '$amount' } } },
    ]),
    FundAllocation.aggregate<{ _id: string; total: number }>([{ $group: { _id: '$currency', total: { $sum: '$amount' } } }]),
  ]);
  const verifiedMap = new Map(verifiedByCurrency.map((r) => [r._id, r.total]));
  const allocatedMap = new Map(allocatedByCurrency.map((r) => [r._id, r.total]));
  return { verifiedMap, allocatedMap };
}

/**
 * A transparent, any-authenticated-role read of the fund ledger — how
 * much has been pledged, how much of that is verified, how much has been
 * allocated/spent, and what's left — grouped by currency. Matches this
 * app's "Transparent & Accountable: track every resource from source to
 * delivery" principle (Design.md feature strip): donors and organizations
 * can see the fund they contributed to is actually being tracked, not
 * just government.
 */
export async function getFundSummary(_req: Request, res: Response) {
  const [pledgedByCurrency, verifiedByCurrency, allocatedByCurrency] = await Promise.all([
    CashDonation.aggregate<{ _id: string; total: number }>([{ $group: { _id: '$currency', total: { $sum: '$amount' } } }]),
    CashDonation.aggregate<{ _id: string; total: number }>([
      { $match: { verificationStatus: 'verified' } },
      { $group: { _id: '$currency', total: { $sum: '$amount' } } },
    ]),
    FundAllocation.aggregate<{ _id: string; total: number }>([{ $group: { _id: '$currency', total: { $sum: '$amount' } } }]),
  ]);

  const pledgedMap = new Map(pledgedByCurrency.map((r) => [r._id, r.total]));
  const verifiedMap = new Map(verifiedByCurrency.map((r) => [r._id, r.total]));
  const allocatedMap = new Map(allocatedByCurrency.map((r) => [r._id, r.total]));

  const currencies = new Set([...pledgedMap.keys(), ...verifiedMap.keys(), ...allocatedMap.keys()]);
  const totals = Array.from(currencies).map((currency) => {
    const pledged = pledgedMap.get(currency) ?? 0;
    const verified = verifiedMap.get(currency) ?? 0;
    const allocated = allocatedMap.get(currency) ?? 0;
    return { currency, pledged, verified, allocated, balance: verified - allocated };
  });

  res.json({ totals });
}

/**
 * Central-only spending decision against the verified fund balance
 * (Roles.md: Central "decides allocation"). Refuses to overdraw a
 * currency's balance rather than letting the ledger go negative.
 */
export async function allocateFund(req: Request, res: Response) {
  const auth = req.auth!;
  if (auth.role !== 'central') throw ApiError.forbidden('Only Central can allocate fund');

  const { amount, currency, purpose } = req.body as { amount: number; currency: string; purpose: string };
  if (amount === undefined || Number(amount) <= 0) throw ApiError.badRequest('amount must be greater than 0');
  if (!currency) throw ApiError.badRequest('currency is required');
  if (!purpose || !purpose.trim()) throw ApiError.badRequest('purpose is required');

  const normalizedCurrency = currency.trim().toUpperCase();
  const { verifiedMap, allocatedMap } = await currentBalances();
  const balance = (verifiedMap.get(normalizedCurrency) ?? 0) - (allocatedMap.get(normalizedCurrency) ?? 0);

  if (Number(amount) > balance) {
    throw ApiError.badRequest(`Insufficient verified fund balance in ${normalizedCurrency}: available ${balance}, requested ${amount}`);
  }

  const allocation = await FundAllocation.create({
    amount: Number(amount),
    currency: normalizedCurrency,
    purpose: purpose.trim(),
    allocatedByUserId: auth.userId,
    allocatedAt: new Date(),
  });

  res.locals.auditTarget = { targetId: allocation._id, afterState: allocation.toObject() };
  res.status(201).json({ allocation });
}

export async function listAllocations(_req: Request, res: Response) {
  const allocations = await FundAllocation.find().sort({ allocatedAt: -1 }).limit(500);
  res.json({ allocations });
}
