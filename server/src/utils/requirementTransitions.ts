import { Types } from 'mongoose';
import { IRequirement, RequirementStatus } from '../models/Requirement';

// Modules.md's lifecycle: submitted -> approved -> allocated -> dispatched
// -> delivered -> fulfilled/partially_fulfilled, with `rejected` a terminal
// branch off submitted/pending_approval. Shared by requirementController
// (approve/reject/manual status changes) and any later-phase module that
// advances a Requirement as a side effect of its own workflow (Phase 5's
// allocation + dispatch flow) — kept in one place so the transition matrix
// is never duplicated or allowed to drift between call sites.
export const ALLOWED_TRANSITIONS: Record<RequirementStatus, RequirementStatus[]> = {
  submitted: ['pending_approval', 'approved', 'rejected'],
  pending_approval: ['approved', 'rejected'],
  approved: ['allocated'],
  rejected: [],
  allocated: ['dispatched'],
  dispatched: ['delivered'],
  delivered: ['fulfilled', 'partially_fulfilled'],
  partially_fulfilled: ['fulfilled'],
  fulfilled: [],
};

export function appendHistory(requirement: IRequirement, status: RequirementStatus, byUserId: string, note?: string) {
  requirement.history.push({ status, byUserId: new Types.ObjectId(byUserId), at: new Date(), note });
}

/** Advances `requirement.status` if the transition is allowed; returns false (no-op) otherwise. */
export function tryAdvanceRequirementStatus(
  requirement: IRequirement,
  nextStatus: RequirementStatus,
  byUserId: string,
  note?: string,
): boolean {
  if (!ALLOWED_TRANSITIONS[requirement.status].includes(nextStatus)) return false;
  requirement.status = nextStatus;
  appendHistory(requirement, nextStatus, byUserId, note);
  return true;
}
