import { Role } from '../types/roles';

// Volunteer-request routing (per the government's operating rule): a
// requirement submitted by field personnel (volunteer/police/army) must be
// verified by the District/CDO of the district the submitting site sits
// in, or by Central — never by Ward/Municipality. Ward/Municipality can
// still verify a requirement it (or Central) submitted administratively,
// since that isn't a field-level demand routed through this rule. Kept as
// a small, pure, unit-tested function so the policy lives in one place
// rather than being re-derived at each call site (approve/reject/status).
const FIELD_SUBMIT_ROLES: Role[] = ['volunteer', 'police', 'army'];

export function canVerifyRequirement(callerRole: Role, submittedByRole: Role): boolean {
  if (callerRole === 'municipality_ward' && FIELD_SUBMIT_ROLES.includes(submittedByRole)) {
    return false;
  }
  return true;
}
