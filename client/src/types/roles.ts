// Mirrors server/src/types/roles.ts — kept in sync manually until the
// project introduces a shared-types package (Rule.md/Tech.md: MERN, no
// monorepo tooling locked in yet).
export const ROLES = [
  'central',
  'district_cdo',
  'municipality_ward',
  'volunteer',
  'police',
  'army',
  'ngo_ingo',
  'private_org',
  'donor',
] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  central: 'Central Government',
  district_cdo: 'District / CDO',
  municipality_ward: 'Municipality / Ward',
  volunteer: 'Volunteer',
  police: 'Police',
  army: 'Army',
  ngo_ingo: 'NGO / INGO',
  private_org: 'Private Organization',
  donor: 'Donor / Funder',
};

// Short badge text shown in the header (Design.md: "CDO Admin" style).
export const ROLE_BADGE: Record<Role, string> = {
  central: 'Central Admin',
  district_cdo: 'CDO Admin',
  municipality_ward: 'Ward Admin',
  volunteer: 'Volunteer',
  police: 'Police',
  army: 'Army',
  ngo_ingo: 'NGO/INGO',
  private_org: 'Private Org',
  donor: 'Donor',
};
