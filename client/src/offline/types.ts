// Shape of one queued household registration in the field app's local
// outbox (Tech.md: "the field app writes all form submissions ... to a
// local IndexedDB queue first, regardless of connectivity"). Mirrors the
// server's /api/households and /api/households/sync payload shape.
export interface QueuedPerson {
  name: string;
  age?: number;
  sex?: 'male' | 'female' | 'other';
  status?: 'normal' | 'stranded' | 'displaced' | 'missing' | 'rescued' | 'evacuated';
  vulnerabilityFlags?: string[];
}

export interface QueuedHousehold {
  clientUuid: string;
  siteId: string;
  siteName: string; // denormalized for offline display before the site list is refetched
  headOfHouseholdName: string;
  gpsLocation?: { lat: number; lng: number } | null;
  persons: QueuedPerson[];
  capturedAt: string; // ISO timestamp, set client-side at queue time
  syncStatus: 'pending' | 'syncing' | 'synced' | 'error';
  syncError?: string;
}
