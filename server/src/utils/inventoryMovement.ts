import { ResourceState } from '../models/Resource';

export type MovementReason = 'transfer' | 'distribution' | 'adjustment';

export interface ResourceSnapshot {
  quantity: number;
  state: ResourceState;
  storageLocationId: string | null;
}

export interface MovementRequest {
  reason: MovementReason;
  quantity: number;
  toLocationId?: string | null;
}

export interface MovementResult {
  resource: ResourceSnapshot;
  error?: string;
}

/**
 * Pure inventory-movement arithmetic (Modules.md: "Inventory Movement...
 * Records movement of resources between storage locations or into the
 * distribution system"). Kept DB-free so the quantity/location/state math
 * is unit-testable without mongodb-memory-server; the controller is the
 * only place that loads/saves the actual Resource document.
 *
 * - transfer: relocates the resource. This schema doesn't split a Resource
 *   across two locations, so a transfer must move the full quantity
 *   currently on hand — a partial transfer would need to fork off a new
 *   Resource record, which is out of scope for this phase.
 * - distribution: reduces on-hand quantity (goods leaving inventory into
 *   the distribution system) — never below zero.
 * - adjustment: a signed correction (quantity may be negative) — a stock
 *   count correcting a paper/physical mismatch — never below zero either.
 *
 * State is derived from the resulting quantity: a resource that hits 0
 * stays whatever state it was (nothing meaningful to allocate/reserve),
 * otherwise state is left untouched — movements don't change
 * available/allocated/reserved on their own; that's a separate, explicit
 * state-change action (see resourceController.updateResourceState).
 */
export function applyMovement(current: ResourceSnapshot, movement: MovementRequest): MovementResult {
  if (movement.quantity <= 0 && movement.reason !== 'adjustment') {
    return { resource: current, error: 'quantity must be positive' };
  }

  if (movement.reason === 'transfer') {
    if (movement.quantity !== current.quantity) {
      return { resource: current, error: 'a transfer must move the full quantity currently on hand' };
    }
    if (!movement.toLocationId) {
      return { resource: current, error: 'toLocationId is required for a transfer' };
    }
    return { resource: { ...current, storageLocationId: movement.toLocationId } };
  }

  if (movement.reason === 'distribution') {
    if (movement.quantity > current.quantity) {
      return { resource: current, error: 'cannot distribute more than is currently on hand' };
    }
    return { resource: { ...current, quantity: current.quantity - movement.quantity } };
  }

  // adjustment — signed delta
  const nextQuantity = current.quantity + movement.quantity;
  if (nextQuantity < 0) {
    return { resource: current, error: 'adjustment would take quantity below zero' };
  }
  return { resource: { ...current, quantity: nextQuantity } };
}
