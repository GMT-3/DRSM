import { describe, it, expect, vi, beforeEach } from 'vitest';
import { enqueueHousehold, getAllQueuedHouseholds } from '../src/offline/db';
import { flushOutbox } from '../src/offline/syncEngine';
import type { QueuedHousehold } from '../src/offline/types';

vi.mock('../src/api/client', () => ({
  api: { post: vi.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
import { api } from '../src/api/client';

function sample(overrides: Partial<QueuedHousehold> = {}): QueuedHousehold {
  return {
    clientUuid: 'sync-uuid-1',
    siteId: 'site-1',
    siteName: 'Site One',
    headOfHouseholdName: 'Household',
    persons: [],
    capturedAt: new Date().toISOString(),
    syncStatus: 'pending',
    ...overrides,
  };
}

describe('flushOutbox (client-side half of the offline sync loop)', () => {
  beforeEach(() => {
    vi.mocked(api.post).mockReset();
  });

  it('clears a record from the outbox once the server confirms it was created', async () => {
    await enqueueHousehold(sample({ clientUuid: 'flush-1' }));
    vi.mocked(api.post).mockResolvedValue({ data: { results: [{ clientUuid: 'flush-1', status: 'created' }] } });

    const result = await flushOutbox();

    expect(result.flushed).toBe(1);
    expect(result.remaining).toBe(0);
    const remaining = await getAllQueuedHouseholds();
    expect(remaining.some((r) => r.clientUuid === 'flush-1')).toBe(false);
  });

  it('leaves the record queued with the server-reported reason on a per-item error', async () => {
    await enqueueHousehold(sample({ clientUuid: 'flush-2' }));
    vi.mocked(api.post).mockResolvedValue({
      data: { results: [{ clientUuid: 'flush-2', status: 'error', error: 'site outside scope' }] },
    });

    const result = await flushOutbox();

    expect(result.flushed).toBe(0);
    const remaining = await getAllQueuedHouseholds();
    const record = remaining.find((r) => r.clientUuid === 'flush-2');
    expect(record?.syncStatus).toBe('error');
    expect(record?.syncError).toBe('site outside scope');
  });

  it('leaves everything queued untouched when the network request itself fails', async () => {
    await enqueueHousehold(sample({ clientUuid: 'flush-3' }));
    vi.mocked(api.post).mockRejectedValue(new Error('Network Error'));

    const result = await flushOutbox();

    expect(result.flushed).toBe(0);
    const remaining = await getAllQueuedHouseholds();
    expect(remaining.some((r) => r.clientUuid === 'flush-3')).toBe(true);
  });
});
