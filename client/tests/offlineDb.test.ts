import { describe, it, expect } from 'vitest';
import { enqueueHousehold, getAllQueuedHouseholds, removeQueuedHousehold, updateQueuedHousehold } from '../src/offline/db';
import type { QueuedHousehold } from '../src/offline/types';

// Exercises the field app's IndexedDB outbox against fake-indexeddb (jsdom
// has no native IndexedDB implementation) — this is the piece that makes
// offline registration possible at all (Tech.md), so it's worth testing for
// real rather than only through the sync-engine's mocked-network tests.
function sample(overrides: Partial<QueuedHousehold> = {}): QueuedHousehold {
  return {
    clientUuid: 'uuid-1',
    siteId: 'site-1',
    siteName: 'Site One',
    headOfHouseholdName: 'Test Household',
    persons: [{ name: 'Person A' }],
    capturedAt: new Date().toISOString(),
    syncStatus: 'pending',
    ...overrides,
  };
}

describe('offline household outbox (IndexedDB)', () => {
  it('enqueues a record and reads it back', async () => {
    await enqueueHousehold(sample());
    const all = await getAllQueuedHouseholds();
    expect(all.some((r) => r.clientUuid === 'uuid-1')).toBe(true);
  });

  it('upserts by clientUuid rather than duplicating on re-enqueue', async () => {
    await enqueueHousehold(sample({ clientUuid: 'uuid-2', headOfHouseholdName: 'First Save' }));
    await enqueueHousehold(sample({ clientUuid: 'uuid-2', headOfHouseholdName: 'Updated Save' }));
    const all = await getAllQueuedHouseholds();
    const matches = all.filter((r) => r.clientUuid === 'uuid-2');
    expect(matches).toHaveLength(1);
    expect(matches[0].headOfHouseholdName).toBe('Updated Save');
  });

  it('updateQueuedHousehold marks a record as errored without losing its data', async () => {
    await enqueueHousehold(sample({ clientUuid: 'uuid-3' }));
    await updateQueuedHousehold(sample({ clientUuid: 'uuid-3', syncStatus: 'error', syncError: 'network down' }));
    const all = await getAllQueuedHouseholds();
    const record = all.find((r) => r.clientUuid === 'uuid-3');
    expect(record?.syncStatus).toBe('error');
    expect(record?.syncError).toBe('network down');
  });

  it('removeQueuedHousehold clears a synced record from the outbox', async () => {
    await enqueueHousehold(sample({ clientUuid: 'uuid-4' }));
    await removeQueuedHousehold('uuid-4');
    const all = await getAllQueuedHouseholds();
    expect(all.some((r) => r.clientUuid === 'uuid-4')).toBe(false);
  });
});
