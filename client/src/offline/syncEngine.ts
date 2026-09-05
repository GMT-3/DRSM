import { api } from '../api/client';
import { getAllQueuedHouseholds, updateQueuedHousehold, removeQueuedHousehold } from './db';
import type { QueuedHousehold } from './types';

export interface SyncState {
  syncing: boolean;
  pendingCount: number;
  lastSyncAt: string | null;
  lastError: string | null;
}

let state: SyncState = { syncing: false, pendingCount: 0, lastSyncAt: null, lastError: null };
const listeners = new Set<(s: SyncState) => void>();

function setState(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l(state));
}

export function subscribeSyncState(listener: (s: SyncState) => void): () => void {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

export async function refreshPendingCount(): Promise<number> {
  const all = await getAllQueuedHouseholds();
  const pending = all.filter((r) => r.syncStatus === 'pending' || r.syncStatus === 'error').length;
  setState({ pendingCount: pending });
  return pending;
}

/**
 * Flushes every pending/error record in the outbox to the server in one
 * batch (Tech.md offline sync approach). Each record's own result decides
 * its fate — created/already_synced both clear it from the outbox (the
 * server has it either way), a per-item error leaves it queued with the
 * reason attached so the user isn't left guessing why a record won't sync.
 */
export async function flushOutbox(): Promise<{ flushed: number; remaining: number }> {
  if (state.syncing) return { flushed: 0, remaining: state.pendingCount };

  setState({ syncing: true, lastError: null });
  try {
    const all = await getAllQueuedHouseholds();
    const toSend = all.filter((r) => r.syncStatus === 'pending' || r.syncStatus === 'error');
    if (toSend.length === 0) {
      setState({ syncing: false });
      await refreshPendingCount();
      return { flushed: 0, remaining: 0 };
    }

    const res = await api.post('/households/sync', {
      items: toSend.map((r) => ({
        clientUuid: r.clientUuid,
        siteId: r.siteId,
        headOfHouseholdName: r.headOfHouseholdName,
        gpsLocation: r.gpsLocation,
        capturedAt: r.capturedAt,
        persons: r.persons,
      })),
    });

    const results = res.data.results as Array<{ clientUuid: string; status: string; error?: string }>;
    let flushed = 0;
    for (const record of toSend) {
      const result = results.find((r) => r.clientUuid === record.clientUuid);
      if (!result || result.status === 'created' || result.status === 'already_synced') {
        await removeQueuedHousehold(record.clientUuid);
        flushed += 1;
      } else {
        const updated: QueuedHousehold = { ...record, syncStatus: 'error', syncError: result.error ?? 'sync failed' };
        await updateQueuedHousehold(updated);
      }
    }

    setState({ syncing: false, lastSyncAt: new Date().toISOString() });
    const remaining = await refreshPendingCount();
    return { flushed, remaining };
  } catch (err) {
    // Network still down, or the request itself failed — leave everything
    // queued exactly as-is and try again on the next connectivity signal.
    setState({ syncing: false, lastError: err instanceof Error ? err.message : 'Sync failed' });
    await refreshPendingCount();
    return { flushed: 0, remaining: state.pendingCount };
  }
}

let started = false;
let intervalId: ReturnType<typeof setInterval> | null = null;

/**
 * Starts the background sync loop once per app session: flushes on the
 * browser's `online` event AND on a periodic probe, since Tech.md flags
 * the online/offline event alone as unreliable on some networks (it fires
 * on interface state, not actual reachability).
 */
export function startBackgroundSync(probeIntervalMs = 30000): () => void {
  if (started) return () => {};
  started = true;

  void refreshPendingCount();

  const onOnline = () => void flushOutbox();
  window.addEventListener('online', onOnline);

  intervalId = setInterval(() => {
    if (navigator.onLine) void flushOutbox();
  }, probeIntervalMs);

  return () => {
    window.removeEventListener('online', onOnline);
    if (intervalId) clearInterval(intervalId);
    started = false;
  };
}
