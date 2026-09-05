import type { QueuedHousehold } from './types';

// Minimal IndexedDB wrapper for the field app's offline outbox (Tech.md).
// Deliberately hand-rolled rather than pulling in a wrapper library — one
// object store, three operations — so the actual browser-storage surface
// stays small and easy to reason about; tests/offline exercise it against
// fake-indexeddb (jsdom has no native IndexedDB implementation).
const DB_NAME = 'drms-field-app';
const DB_VERSION = 1;
const STORE = 'householdOutbox';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'clientUuid' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function enqueueHousehold(record: QueuedHousehold): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function getAllQueuedHouseholds(): Promise<QueuedHousehold[]> {
  const db = await openDb();
  const records = await new Promise<QueuedHousehold[]>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as QueuedHousehold[]);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return records;
}

export async function updateQueuedHousehold(record: QueuedHousehold): Promise<void> {
  return enqueueHousehold(record); // put() upserts by clientUuid either way
}

export async function removeQueuedHousehold(clientUuid: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(clientUuid);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
