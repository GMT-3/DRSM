import { useCallback, useEffect, useMemo, useState, FormEvent } from 'react';
import QRCode from 'qrcode';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { MODULES } from '../config/modules';
import { enqueueHousehold, getAllQueuedHouseholds } from '../offline/db';
import { flushOutbox, subscribeSyncState, startBackgroundSync, type SyncState } from '../offline/syncEngine';
import type { QueuedHousehold, QueuedPerson } from '../offline/types';

const MOD = MODULES.find((m) => m.key === 'demographic')!;

const STATUS_OPTIONS = ['normal', 'stranded', 'displaced', 'missing', 'rescued', 'evacuated'] as const;
const VULNERABILITY_OPTIONS = [
  'pregnant',
  'recently_delivered',
  'child_under_5',
  'elderly',
  'disabled',
  'chronic_illness',
] as const;

interface SiteOption {
  _id: string;
  name: string;
  siteType: string;
  accessMode: 'road' | 'foot_only' | 'airlift_only';
  lastUpdateAt?: string;
}

interface SyncedHousehold {
  _id: string;
  siteId: string;
  headOfHouseholdName: string;
  qrCode: string;
  registeredAt: string;
}

function ModuleHeader() {
  return (
    <div className="module-card-header" style={{ marginBottom: 18 }}>
      <span className="module-card-icon" style={{ background: MOD.color }}>
        {MOD.id}
      </span>
      <h2>{MOD.name}</h2>
    </div>
  );
}

function freshnessLabel(lastUpdateAt?: string): { text: string; stale: boolean } {
  if (!lastUpdateAt) return { text: 'no updates yet', stale: true };
  const ms = Date.now() - new Date(lastUpdateAt).getTime();
  const hours = ms / (1000 * 60 * 60);
  if (hours < 1) return { text: 'updated <1h ago', stale: false };
  if (hours < 24) return { text: `updated ${Math.round(hours)}h ago`, stale: false };
  return { text: `updated ${Math.round(hours / 24)}d ago — stale`, stale: true };
}

/** Always-visible sync status bar (Design.md: offline is core, not a nice-to-have). */
function SyncStatusBar() {
  const [sync, setSync] = useState<SyncState>({ syncing: false, pendingCount: 0, lastSyncAt: null, lastError: null });

  useEffect(() => {
    const stop = startBackgroundSync();
    const unsubscribe = subscribeSyncState(setSync);
    return () => {
      stop();
      unsubscribe();
    };
  }, []);

  return (
    <div className="sync-status-bar">
      <span className={`sync-dot ${sync.pendingCount > 0 ? 'pending' : 'clear'}`} />
      {sync.syncing
        ? 'Syncing…'
        : sync.pendingCount > 0
          ? `${sync.pendingCount} record${sync.pendingCount === 1 ? '' : 's'} waiting to sync`
          : 'All records synced'}
      {sync.lastError && <span className="sync-error"> — {sync.lastError}</span>}
      <button className="small-button ghost" onClick={() => flushOutbox()} disabled={sync.syncing}>
        Sync now
      </button>
    </div>
  );
}

function PersonRow({
  person,
  onChange,
  onRemove,
}: {
  person: QueuedPerson;
  onChange: (next: QueuedPerson) => void;
  onRemove: () => void;
}) {
  function toggleFlag(flag: string) {
    const flags = new Set(person.vulnerabilityFlags ?? []);
    if (flags.has(flag)) flags.delete(flag);
    else flags.add(flag);
    onChange({ ...person, vulnerabilityFlags: Array.from(flags) });
  }

  return (
    <div className="person-row">
      <input
        placeholder="Name"
        required
        value={person.name}
        onChange={(e) => onChange({ ...person, name: e.target.value })}
      />
      <input
        placeholder="Age"
        type="number"
        min={0}
        value={person.age ?? ''}
        onChange={(e) => onChange({ ...person, age: e.target.value ? Number(e.target.value) : undefined })}
      />
      <select value={person.sex ?? ''} onChange={(e) => onChange({ ...person, sex: (e.target.value || undefined) as QueuedPerson['sex'] })}>
        <option value="">Sex…</option>
        <option value="male">Male</option>
        <option value="female">Female</option>
        <option value="other">Other</option>
      </select>
      <select
        value={person.status ?? 'normal'}
        onChange={(e) => onChange({ ...person, status: e.target.value as QueuedPerson['status'] })}
      >
        {STATUS_OPTIONS.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <div className="vulnerability-tags">
        {VULNERABILITY_OPTIONS.map((flag) => (
          <label key={flag} className={`vulnerability-tag ${person.vulnerabilityFlags?.includes(flag) ? 'active' : ''}`}>
            <input
              type="checkbox"
              checked={person.vulnerabilityFlags?.includes(flag) ?? false}
              onChange={() => toggleFlag(flag)}
            />
            {flag.replace(/_/g, ' ')}
          </label>
        ))}
      </div>
      <button type="button" className="small-button ghost" onClick={onRemove}>
        Remove
      </button>
    </div>
  );
}

/** Volunteer/Police/Army: offline-first household registration (Appflow.md, Tech.md). */
function FieldRegistrationView() {
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [siteId, setSiteId] = useState('');
  const [headOfHouseholdName, setHeadOfHouseholdName] = useState('');
  const [persons, setPersons] = useState<QueuedPerson[]>([{ name: '', vulnerabilityFlags: [] }]);
  const [queued, setQueued] = useState<QueuedHousehold[]>([]);
  const [synced, setSynced] = useState<SyncedHousehold[]>([]);
  const [qrPreview, setQrPreview] = useState<{ label: string; dataUrl: string } | null>(null);
  const [justQueued, setJustQueued] = useState<string | null>(null);

  const loadSites = useCallback(() => {
    api.get('/geo/sites').then((res) => setSites(res.data.sites));
  }, []);

  const loadQueued = useCallback(async () => {
    setQueued(await getAllQueuedHouseholds());
  }, []);

  const loadSynced = useCallback(() => {
    api
      .get('/households')
      .then((res) => setSynced(res.data.households))
      .catch(() => setSynced([]));
  }, []);

  useEffect(() => {
    loadSites();
    loadQueued();
    loadSynced();
    const unsubscribe = subscribeSyncState(() => {
      loadQueued();
      loadSynced();
    });
    return unsubscribe;
  }, [loadSites, loadQueued, loadSynced]);

  function updatePerson(index: number, next: QueuedPerson) {
    setPersons((prev) => prev.map((p, i) => (i === index ? next : p)));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const site = sites.find((s) => s._id === siteId);
    if (!site) return;

    const clientUuid = crypto.randomUUID();
    const record: QueuedHousehold = {
      clientUuid,
      siteId,
      siteName: site.name,
      headOfHouseholdName,
      persons: persons.filter((p) => p.name.trim().length > 0),
      capturedAt: new Date().toISOString(),
      syncStatus: 'pending',
    };

    // Write to the local queue first, unconditionally — this is what makes
    // registration work with no connectivity at all (Tech.md).
    await enqueueHousehold(record);
    setHeadOfHouseholdName('');
    setPersons([{ name: '', vulnerabilityFlags: [] }]);
    setJustQueued(clientUuid);
    await loadQueued();

    // Best-effort immediate push; if offline this just no-ops and the
    // background loop / next `online` event picks it up later.
    void flushOutbox();
  }

  async function showQueuedQr(record: QueuedHousehold) {
    const dataUrl = await QRCode.toDataURL(record.clientUuid, { margin: 1, width: 256 });
    setQrPreview({ label: record.headOfHouseholdName, dataUrl });
  }

  async function showSyncedQr(household: SyncedHousehold) {
    const res = await api.get(`/households/${household._id}/qr`);
    setQrPreview({ label: household.headOfHouseholdName, dataUrl: res.data.dataUrl });
  }

  return (
    <>
      <SyncStatusBar />

      <section className="panel">
        <h2>Register Household</h2>
        <form className="household-form" onSubmit={handleSubmit}>
          <div className="inline-form">
            <label>
              Site
              <select required value={siteId} onChange={(e) => setSiteId(e.target.value)}>
                <option value="">Select a site…</option>
                {sites.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Head of household
              <input required value={headOfHouseholdName} onChange={(e) => setHeadOfHouseholdName(e.target.value)} />
            </label>
          </div>

          <h3 className="household-form-subheading">Household members</h3>
          {persons.map((p, i) => (
            <PersonRow
              key={i}
              person={p}
              onChange={(next) => updatePerson(i, next)}
              onRemove={() => setPersons((prev) => prev.filter((_, idx) => idx !== i))}
            />
          ))}
          <button
            type="button"
            className="small-button ghost"
            onClick={() => setPersons((prev) => [...prev, { name: '', vulnerabilityFlags: [] }])}
          >
            + Add member
          </button>

          <div>
            <button className="small-button" type="submit" disabled={!siteId || !headOfHouseholdName}>
              Save household (queues offline, syncs automatically)
            </button>
          </div>
        </form>
        {justQueued && (
          <div className="temp-credential-box">
            Household queued locally. It will sync automatically the next time a connection is available — you
            don&apos;t need to wait here.
          </div>
        )}
      </section>

      {qrPreview && (
        <section className="panel qr-card">
          <h2>Household QR Card</h2>
          <div className="qr-card-body">
            <img src={qrPreview.dataUrl} alt={`QR code for ${qrPreview.label}`} />
            <div>
              <p className="qr-card-name">{qrPreview.label}</p>
              <p className="table-subtext">Scan at distribution to confirm delivery and prevent duplicates.</p>
              <button className="small-button" onClick={() => window.print()}>
                Print card
              </button>
              <button className="small-button ghost" onClick={() => setQrPreview(null)}>
                Close
              </button>
            </div>
          </div>
        </section>
      )}

      <section className="panel">
        <h2>My Households</h2>
        {queued.length === 0 && synced.length === 0 && <p className="empty-panel-note">No households registered yet.</p>}
        {(queued.length > 0 || synced.length > 0) && (
          <table className="data-table">
            <thead>
              <tr>
                <th>Head of household</th>
                <th>Site</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {queued.map((q) => (
                <tr key={q.clientUuid}>
                  <td>{q.headOfHouseholdName}</td>
                  <td>{q.siteName}</td>
                  <td>
                    <span className={`status-pill ${q.syncStatus === 'error' ? 'status-unverified' : 'status-pending'}`}>
                      {q.syncStatus === 'error' ? `error: ${q.syncError}` : 'pending sync'}
                    </span>
                  </td>
                  <td>
                    <button className="small-button ghost" onClick={() => showQueuedQr(q)}>
                      QR card
                    </button>
                  </td>
                </tr>
              ))}
              {synced.map((h) => (
                <tr key={h._id}>
                  <td>{h.headOfHouseholdName}</td>
                  <td>{sites.find((s) => s._id === h.siteId)?.name ?? '—'}</td>
                  <td>
                    <span className="status-pill status-verified">synced</span>
                  </td>
                  <td>
                    <button className="small-button ghost" onClick={() => showSyncedQr(h)}>
                      QR card
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}

interface SiteSummary {
  site: SiteOption;
  householdCount: number;
  summary: {
    totalPopulation: number;
    byStatus: Record<string, number>;
    byVulnerability: Record<string, number>;
  };
}

/** Central/District/Municipality: read-mostly demographic overview. */
function OverviewView() {
  const { user } = useAuth();
  const [sites, setSites] = useState<SiteSummary[]>([]);
  const [aggregate, setAggregate] = useState<SiteSummary['summary'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingSiteId, setSavingSiteId] = useState<string | null>(null);

  const canEditAccessMode = user?.role === 'central' || user?.role === 'municipality_ward';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/demographic/summary');
      setSites(res.data.sites);
      setAggregate(res.data.aggregate);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function updateAccessMode(siteId: string, accessMode: string) {
    setSavingSiteId(siteId);
    try {
      await api.patch(`/geo/sites/${siteId}/access-mode`, { accessMode });
      await load();
    } finally {
      setSavingSiteId(null);
    }
  }

  const statCards = useMemo(() => {
    if (!aggregate) return [];
    return [
      { label: 'Total Population', value: aggregate.totalPopulation, critical: false },
      { label: 'Stranded', value: aggregate.byStatus.stranded ?? 0, critical: (aggregate.byStatus.stranded ?? 0) > 0 },
      { label: 'Displaced', value: aggregate.byStatus.displaced ?? 0, critical: false },
      { label: 'Missing / Unaccounted', value: aggregate.byStatus.missing ?? 0, critical: (aggregate.byStatus.missing ?? 0) > 0 },
      { label: 'Rescued', value: aggregate.byStatus.rescued ?? 0, critical: false },
      { label: 'Evacuated', value: aggregate.byStatus.evacuated ?? 0, critical: false },
    ];
  }, [aggregate]);

  return (
    <>
      <section className="panel">
        <h2>Population Status</h2>
        {loading && <p className="empty-panel-note">Loading…</p>}
        {!loading && (
          <div className="stat-card-row">
            {statCards.map((c) => (
              <div key={c.label} className={`stat-card ${c.critical ? 'critical' : ''}`}>
                <div className="stat-card-value">{c.value}</div>
                <div className="stat-card-label">{c.label}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {aggregate && (
        <section className="panel">
          <h2>Demographic Composition</h2>
          <div className="stat-card-row">
            {Object.entries(aggregate.byVulnerability).map(([flag, count]) => (
              <div key={flag} className="stat-card">
                <div className="stat-card-value">{count}</div>
                <div className="stat-card-label">{flag.replace(/_/g, ' ')}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="panel">
        <h2>Affected Locations &amp; Site Status</h2>
        {!loading && sites.length === 0 && <p className="empty-panel-note">No sites registered in your scope yet.</p>}
        {sites.length > 0 && (
          <table className="data-table">
            <thead>
              <tr>
                <th>Site</th>
                <th>Households</th>
                <th>Population</th>
                <th>Access mode</th>
                <th>Last update</th>
              </tr>
            </thead>
            <tbody>
              {sites.map(({ site, householdCount, summary }) => {
                const freshness = freshnessLabel(site.lastUpdateAt);
                return (
                  <tr key={site._id}>
                    <td>
                      {site.name}
                      <div className="table-subtext">{site.siteType}</div>
                    </td>
                    <td>{householdCount}</td>
                    <td>{summary.totalPopulation}</td>
                    <td>
                      {canEditAccessMode ? (
                        <select
                          value={site.accessMode}
                          disabled={savingSiteId === site._id}
                          onChange={(e) => updateAccessMode(site._id, e.target.value)}
                        >
                          <option value="road">Road</option>
                          <option value="foot_only">Foot only</option>
                          <option value="airlift_only">Airlift only</option>
                        </select>
                      ) : (
                        <span className="status-pill status-pending">{site.accessMode.replace(/_/g, ' ')}</span>
                      )}
                    </td>
                    <td>
                      <span className={freshness.stale ? 'sync-error' : ''}>{freshness.text}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}

function OrganizationNote() {
  return (
    <section className="panel">
      <h2>Demographic Data</h2>
      <p className="empty-panel-note">
        Demographic data isn&apos;t shared with organizations directly. See the Situation &amp; Coordination module
        for the shared, aggregate coordination view.
      </p>
    </section>
  );
}

export function Demographic() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <div className="module-page">
      <ModuleHeader />
      {['volunteer', 'police', 'army'].includes(user.role) && <FieldRegistrationView />}
      {['central', 'district_cdo', 'municipality_ward'].includes(user.role) && <OverviewView />}
      {['ngo_ingo', 'private_org', 'donor'].includes(user.role) && <OrganizationNote />}
    </div>
  );
}
