/* eslint-disable no-console */
// Seeds the pilot geographic hierarchy (Rasuwa/Nuwakot, the 26 Aug 2026
// Bhote Koshi flood pilot area per Rule.md/Prd.md) plus one demo user per
// entity type in Roles.md, so every login path can be exercised end-to-end
// (Phase 0 deliverable in Implementation.md).
import { connectDB, disconnectDB } from '../config/db';
import { Province } from '../models/Province';
import { District } from '../models/District';
import { Municipality } from '../models/Municipality';
import { Ward } from '../models/Ward';
import { Site } from '../models/Site';
import { User } from '../models/User';
import { Organization } from '../models/Organization';
import { Category } from '../models/Category';
import { hashPassword } from '../utils/password';
import { Role } from '../types/roles';

const DEMO_PASSWORD = 'Passw0rd!123';

async function upsertProvince(name: string, code: string) {
  return Province.findOneAndUpdate({ code }, { name, code }, { upsert: true, new: true });
}

async function upsertDistrict(provinceId: unknown, name: string, code: string) {
  return District.findOneAndUpdate({ code }, { provinceId, name, code }, { upsert: true, new: true });
}

async function upsertMunicipality(districtId: unknown, name: string, type: 'municipality' | 'rural_municipality') {
  return Municipality.findOneAndUpdate({ districtId, name }, { districtId, name, type }, { upsert: true, new: true });
}

async function upsertWard(municipalityId: unknown, wardNumber: number) {
  return Ward.findOneAndUpdate({ municipalityId, wardNumber }, { municipalityId, wardNumber }, { upsert: true, new: true });
}

async function upsertSite(wardId: unknown, name: string) {
  return Site.findOneAndUpdate(
    { wardId, name },
    { wardId, name, siteType: 'settlement', accessMode: 'road', lastUpdateAt: new Date() },
    { upsert: true, new: true },
  );
}

async function upsertUser(params: {
  name: string;
  email: string;
  role: Role;
  loginType: string;
  scope?: Record<string, unknown>;
  category?: string | null;
}) {
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  return User.findOneAndUpdate(
    { email: params.email },
    {
      name: params.name,
      email: params.email,
      role: params.role,
      loginType: params.loginType,
      passwordHash,
      scope: params.scope ?? {},
      category: params.category ?? null,
      active: true,
    },
    { upsert: true, new: true },
  );
}

// Modules.md module 9 "Resource Categories": the standard set of
// classifications a government admin (central, by default — see
// adminController.setCategoryActive) can extend or retire from the
// Administration > Categories screen without a code deploy. This seed just
// gives every deployment a sane starting picklist for the Resources
// module's "Category" field; it never overwrites a category an admin has
// since added, renamed the active flag on, or removed.
const DEFAULT_RESOURCE_CATEGORIES = [
  'Food & Nutrition',
  'Water',
  'Shelter',
  'Medicine & Medical Supplies',
  'Clothing & Bedding',
  'Sanitation & Hygiene',
  'Fuel & Energy',
  'Electronics',
  'Communication Equipment',
  'Tools & Equipment',
  'Transportation',
  'Search & Rescue Equipment',
  'Cash & Financial Assistance',
  'Other',
];

async function upsertCategory(kind: 'resource' | 'requirement', name: string, createdByUserId: unknown) {
  return Category.findOneAndUpdate({ kind, name }, { kind, name, createdByUserId }, { upsert: true, new: true, setDefaultsOnInsert: true });
}

/**
 * Seeds the pilot geography, one demo Organization, and one demo User per
 * Roles.md entity type, and returns every created record so other seed
 * scripts (e.g. seedTracking.ts) can build on top of the same pilot data
 * without duplicating it or requiring `npm run seed` to have been run
 * first — every upsert here is idempotent, so calling this twice is safe.
 */
export async function seedGeographyAndUsers() {
  console.log('[seed] seeding pilot geography (Rasuwa/Nuwakot)...');

  const bagmati = await upsertProvince('Bagmati Province', 'P3');

  const rasuwa = await upsertDistrict(bagmati._id, 'Rasuwa', 'RSW');
  const nuwakot = await upsertDistrict(bagmati._id, 'Nuwakot', 'NWK');

  const gosaikunda = await upsertMunicipality(rasuwa._id, 'Gosaikunda Rural Municipality', 'rural_municipality');
  const bidur = await upsertMunicipality(nuwakot._id, 'Bidur Municipality', 'municipality');

  const gosaikundaWard1 = await upsertWard(gosaikunda._id, 1);
  const bidurWard5 = await upsertWard(bidur._id, 5);

  const timureSite = await upsertSite(gosaikundaWard1._id, 'Timure Settlement');
  const bidurCampSite = await upsertSite(bidurWard5._id, 'Bidur Relief Camp');

  console.log('[seed] geography seeded:', {
    province: bagmati.name,
    districts: [rasuwa.name, nuwakot.name],
    municipalities: [gosaikunda.name, bidur.name],
    sites: [timureSite.name, bidurCampSite.name],
  });

  const wfp = await Organization.findOneAndUpdate(
    { name: 'World Food Programme (demo)' },
    {
      name: 'World Food Programme (demo)',
      type: 'ingo',
      verificationStatus: 'verified',
      registrationDetails: { country: 'International', contact: 'demo@wfp.org' },
    },
    { upsert: true, new: true },
  );

  const demoUsers = [
    { name: 'Central Admin', email: 'central.admin@drms.gov.np', role: 'central' as Role, loginType: 'gov_admin' },
    {
      name: 'Rasuwa CDO',
      email: 'cdo.rasuwa@drms.gov.np',
      role: 'district_cdo' as Role,
      loginType: 'gov_email',
      scope: { provinceId: bagmati._id, districtId: rasuwa._id },
    },
    {
      name: 'Gosaikunda Municipality Officer',
      email: 'ward.gosaikunda@drms.gov.np',
      role: 'municipality_ward' as Role,
      loginType: 'gov_email',
      scope: { provinceId: bagmati._id, districtId: rasuwa._id, municipalityId: gosaikunda._id, wardId: gosaikundaWard1._id },
    },
    {
      name: 'Sita Tamang (Volunteer)',
      email: 'sita.volunteer@example.com',
      role: 'volunteer' as Role,
      loginType: 'own_email',
      category: 'food',
      scope: { provinceId: bagmati._id, districtId: rasuwa._id, municipalityId: gosaikunda._id, wardId: gosaikundaWard1._id },
    },
    {
      name: 'Insp. Karki (Police)',
      email: 'karki.police@nepalpolice.gov.np',
      role: 'police' as Role,
      loginType: 'departmental_email',
      category: 'security',
      scope: { provinceId: bagmati._id, districtId: rasuwa._id, municipalityId: gosaikunda._id, wardId: gosaikundaWard1._id },
    },
    {
      name: 'Maj. Shrestha (Army)',
      email: 'shrestha.army@nepalarmy.mil.np',
      role: 'army' as Role,
      loginType: 'departmental_email',
      category: 'logistics',
      scope: { provinceId: bagmati._id, districtId: nuwakot._id, municipalityId: bidur._id, wardId: bidurWard5._id },
    },
    {
      name: 'WFP Coordinator',
      email: 'coordinator@wfp-demo.org',
      role: 'ngo_ingo' as Role,
      loginType: 'org_email',
      scope: { organizationId: wfp._id },
    },
    {
      name: 'Himal Traders (Private Org)',
      email: 'contact@himaltraders-demo.com',
      role: 'private_org' as Role,
      loginType: 'org_email',
      scope: {},
    },
    {
      name: 'Individual Donor Demo',
      email: 'donor.demo@example.com',
      role: 'donor' as Role,
      loginType: 'org_email',
      scope: {},
    },
  ];

  const userDocs: Record<string, Awaited<ReturnType<typeof upsertUser>>> = {};
  for (const u of demoUsers) {
    userDocs[u.email] = await upsertUser(u);
  }

  console.log('\n[seed] demo accounts (all use the same password):');
  console.log(`  password: ${DEMO_PASSWORD}\n`);
  for (const u of demoUsers) {
    console.log(`  ${u.role.padEnd(18)} ${u.email}`);
  }

  const centralAdmin = userDocs['central.admin@drms.gov.np'];
  console.log('[seed] seeding default resource categories...');
  for (const name of DEFAULT_RESOURCE_CATEGORIES) {
    await upsertCategory('resource', name, centralAdmin._id);
  }

  return {
    bagmati,
    rasuwa,
    nuwakot,
    gosaikunda,
    bidur,
    gosaikundaWard1,
    bidurWard5,
    timureSite,
    bidurCampSite,
    wfp,
    users: userDocs,
  };
}

async function main() {
  await connectDB();
  await seedGeographyAndUsers();
  console.log('\n[seed] done.');
  await disconnectDB();
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[seed] failed:', err);
    process.exit(1);
  });
}
