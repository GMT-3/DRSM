// Entity types per Roles.md. Kept as the single source of truth for role
// literals across models, middleware, and the client's role-filtered nav.

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

// loginType is derived from role, enforced at signup (Schema.md/Tech.md).
export const LOGIN_TYPE_BY_ROLE: Record<Role, string> = {
  central: 'gov_admin',
  district_cdo: 'gov_email',
  municipality_ward: 'gov_email',
  volunteer: 'own_email',
  police: 'departmental_email',
  army: 'departmental_email',
  ngo_ingo: 'org_email',
  private_org: 'org_email',
  donor: 'org_email', // company email; individual donors use own_email — enforced case-by-case at signup
};

// Field-personnel roles that use the offline-capable app and category-scoped demands.
export const FIELD_ROLES: Role[] = ['volunteer', 'police', 'army'];

// Organization-scoped roles (Schema.md: organizationId on User.scope).
export const ORG_ROLES: Role[] = ['ngo_ingo', 'private_org', 'donor'];

// Roles with a government-level administrative geo scope.
export const GOV_ROLES: Role[] = ['central', 'district_cdo', 'municipality_ward'];

export type FieldCategory =
  | 'medicine'
  | 'food'
  | 'clothes'
  | 'water'
  | 'shelter'
  | 'security'
  | 'logistics'
  | 'other';

export const FIELD_CATEGORIES: FieldCategory[] = [
  'medicine',
  'food',
  'clothes',
  'water',
  'shelter',
  'security',
  'logistics',
  'other',
];
