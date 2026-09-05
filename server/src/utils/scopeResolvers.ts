import { Request } from 'express';
import { Ward } from '../models/Ward';
import { Site } from '../models/Site';
import { StorageLocation } from '../models/StorageLocation';
import { buildScopeFilter } from '../middleware/scope';

/**
 * Resolves the Ward ids visible to the caller's scope. Reused by any
 * module (Requirements, Resources, Transport, Field Ops, Dashboard, ...)
 * that needs to restrict a Site-linked collection to the caller's subtree,
 * so the geo -> Ward -> Site scoping chain is derived in exactly one place.
 * Returns `null` for central (no restriction needed).
 */
export async function resolveScopedWardIds(req: Request): Promise<string[] | null> {
  if (req.auth?.role === 'central') return null;
  const wardFilter = buildScopeFilter(req, { municipalityId: 'municipalityId', wardId: '_id' });
  const wards = await Ward.find(wardFilter).select('_id');
  return wards.map((w) => String(w._id));
}

/** Resolves the Site ids visible to the caller's scope. `null` = unrestricted (central). */
export async function resolveScopedSiteIds(req: Request): Promise<string[] | null> {
  const wardIds = await resolveScopedWardIds(req);
  if (wardIds === null) return null;
  if (wardIds.length === 0) return [];
  const sites = await Site.find({ wardId: { $in: wardIds } }).select('_id');
  return sites.map((s) => String(s._id));
}

/**
 * Resolves the StorageLocation ids visible to the caller's scope
 * (Resources & Inventory, module 4). StorageLocation carries its own
 * province/district/municipality fields directly (Schema.md) rather than
 * hanging off the Ward -> Site chain, so it gets its own resolver instead
 * of reusing resolveScopedSiteIds. `null` = unrestricted (central).
 */
export async function resolveScopedStorageLocationIds(req: Request): Promise<string[] | null> {
  const filter = buildScopeFilter(req, { districtId: 'districtId', municipalityId: 'municipalityId' });
  if (req.auth?.role === 'central') return null;
  const locations = await StorageLocation.find(filter).select('_id');
  return locations.map((l) => String(l._id));
}
