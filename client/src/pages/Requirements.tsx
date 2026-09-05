import { Fragment, useCallback, useEffect, useMemo, useState, FormEvent } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { MODULES } from '../config/modules';

const MOD = MODULES.find((m) => m.key === 'requirements')!;

const CLUSTERS = ['health', 'wash', 'nutrition', 'shelter', 'food_security', 'protection', 'logistics', 'other'];

interface SiteOption {
  _id: string;
  name: string;
}

interface RequirementRow {
  _id: string;
  siteId: string;
  cluster: string;
  category: string;
  description?: string;
  quantityRequested: number;
  status: string;
  priorityScore: number;
  submittedAt: string;
  consolidatedIntoId?: string | null;
}

type Tab = 'overview' | 'pending' | 'approved' | 'in_progress' | 'partially_fulfilled' | 'fulfilled' | 'critical' | 'history';

const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Requirement Overview' },
  { key: 'pending', label: 'Pending Approval' },
  { key: 'approved', label: 'Approved Requirements' },
  { key: 'in_progress', label: 'Requirements in Progress' },
  { key: 'partially_fulfilled', label: 'Partially Fulfilled' },
  { key: 'fulfilled', label: 'Fulfilled Requirements' },
  { key: 'critical', label: 'Critical / Urgent' },
  { key: 'history', label: 'Requirement History' },
];

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

function priorityBadgeClass(score: number): string {
  if (score >= 70) return 'status-unverified'; // red-ish, reused from existing palette
  if (score >= 40) return 'status-pending';
  return 'status-verified';
}

/** Volunteer/Police/Army: new requirement submission (Modules.md "New Requirements"). */
function SubmissionForm({ onSubmitted }: { onSubmitted: () => void }) {
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [siteId, setSiteId] = useState('');
  const [cluster, setCluster] = useState('wash');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [quantityRequested, setQuantityRequested] = useState('');
  const [populationAffected, setPopulationAffected] = useState('');
  const [vulnerableCount, setVulnerableCount] = useState('');
  const [availableSupplyRatio, setAvailableSupplyRatio] = useState('0');
  const [hazardActive, setHazardActive] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get('/geo/sites').then((res) => setSites(res.data.sites));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post('/requirements', {
        siteId,
        cluster,
        category,
        description: description || undefined,
        quantityRequested: Number(quantityRequested),
        populationAffected: populationAffected ? Number(populationAffected) : undefined,
        vulnerableCount: vulnerableCount ? Number(vulnerableCount) : undefined,
        availableSupplyRatio: Number(availableSupplyRatio),
        hazardActive,
      });
      setCategory('');
      setDescription('');
      setQuantityRequested('');
      setPopulationAffected('');
      setVulnerableCount('');
      setAvailableSupplyRatio('0');
      setHazardActive(false);
      onSubmitted();
    } catch (err) {
      setError((err as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'Failed to submit requirement.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="panel">
      <h2>New Requirement</h2>
      <form className="inline-form" onSubmit={handleSubmit}>
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
          Cluster
          <select value={cluster} onChange={(e) => setCluster(e.target.value)}>
            {CLUSTERS.map((c) => (
              <option key={c} value={c}>
                {c.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </label>
        <label>
          Category / item
          <input required value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. bottled water" />
        </label>
        <label>
          Quantity requested
          <input required type="number" min={1} value={quantityRequested} onChange={(e) => setQuantityRequested(e.target.value)} />
        </label>
        <label>
          Population affected
          <input type="number" min={0} value={populationAffected} onChange={(e) => setPopulationAffected(e.target.value)} />
        </label>
        <label>
          Vulnerable count
          <input type="number" min={0} value={vulnerableCount} onChange={(e) => setVulnerableCount(e.target.value)} />
        </label>
        <label>
          Supply already available (0-1)
          <input
            type="number"
            min={0}
            max={1}
            step={0.1}
            value={availableSupplyRatio}
            onChange={(e) => setAvailableSupplyRatio(e.target.value)}
          />
        </label>
        <label className="checkbox-label">
          <input type="checkbox" checked={hazardActive} onChange={(e) => setHazardActive(e.target.checked)} />
          Active hazard at site
        </label>
        <label style={{ flexBasis: '100%' }}>
          Description
          <input value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <button className="small-button" type="submit" disabled={submitting || !siteId || !category || !quantityRequested}>
          {submitting ? 'Submitting…' : 'Submit requirement'}
        </button>
      </form>
      {error && <div className="login-error">{error}</div>}
    </section>
  );
}

interface TrackingTimelineEntry {
  stage: string;
  label: string;
  at: string;
  note?: string;
}
interface TrackingTraceResult {
  currentStage: string;
  timeline: TrackingTimelineEntry[];
  scopeNote: string;
}

function stageBadgeClass(stage: string): string {
  if (['delivered', 'fulfilled'].includes(stage)) return 'status-verified';
  if (stage === 'rejected') return 'status-unverified';
  return 'status-pending';
}

/**
 * "Requirement History" (Modules.md, module 2) — the live tracking system
 * Roles.md/Prd.md describe: the complete lifecycle for a single
 * requirement (submitted -> approved -> allocated -> dispatched -> in
 * transit -> delivered), pulled from `GET /requirements/:id/trace` rather
 * than just the Requirement's own status field, so it also shows the
 * allocations and dispatches raised against it. Current build scope ends
 * at Municipality/Ward confirming receipt — see the trailing scope note
 * rendered from the API response.
 */
function RequirementHistoryPanel({ requirements, loading }: { requirements: RequirementRow[]; loading: boolean }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [traces, setTraces] = useState<Record<string, TrackingTraceResult>>({});
  const [traceLoading, setTraceLoading] = useState<string | null>(null);

  async function toggleTrace(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (!traces[id]) {
      setTraceLoading(id);
      try {
        const res = await api.get(`/requirements/${id}/trace`);
        setTraces((prev) => ({ ...prev, [id]: res.data }));
      } finally {
        setTraceLoading(null);
      }
    }
  }

  return (
    <section className="panel">
      <h2>Requirement History</h2>
      <p className="table-subtext" style={{ marginBottom: 8 }}>
        The complete lifecycle for each requirement in one place — submitted, approved, allocated, dispatched, and delivered —
        for accountability and to reconstruct what happened.
      </p>
      {loading && <p className="empty-panel-note">Loading…</p>}
      {!loading && requirements.length === 0 && <p className="empty-panel-note">No requirements to show yet.</p>}
      {requirements.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Cluster / Category</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {requirements.map((r) => (
              <Fragment key={r._id}>
                <tr>
                  <td>
                    {r.category}
                    <div className="table-subtext">{r.cluster.replace(/_/g, ' ')}</div>
                  </td>
                  <td>
                    <span className="status-pill status-pending">{r.status.replace(/_/g, ' ')}</span>
                  </td>
                  <td>
                    <button className="small-button ghost" type="button" onClick={() => toggleTrace(r._id)}>
                      {expandedId === r._id ? 'Hide trace' : 'View trace'}
                    </button>
                  </td>
                </tr>
                {expandedId === r._id && (
                  <tr>
                    <td colSpan={3}>
                      {traceLoading === r._id && <p className="empty-panel-note">Loading trace…</p>}
                      {traces[r._id] && (
                        <div className="tracking-timeline">
                          {traces[r._id].timeline.map((entry, idx) => (
                            <div key={idx} className="tracking-timeline-entry">
                              <span className={`status-pill ${stageBadgeClass(entry.stage)}`}>{entry.label}</span>{' '}
                              <span className="table-subtext">{new Date(entry.at).toLocaleString()}</span>
                              {entry.note && <span className="table-subtext"> — {entry.note}</span>}
                            </div>
                          ))}
                          <p className="table-subtext" style={{ marginTop: 8 }}>
                            {traces[r._id].scopeNote}
                          </p>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export function Requirements() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('overview');
  const [requirements, setRequirements] = useState<RequirementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [consolidateSiteId, setConsolidateSiteId] = useState('');
  const [consolidateDescription, setConsolidateDescription] = useState('');
  const [consolidateError, setConsolidateError] = useState<string | null>(null);
  const [sites, setSites] = useState<SiteOption[]>([]);

  const isFieldRole = user ? ['volunteer', 'police', 'army'].includes(user.role) : false;
  const isReviewRole = user ? ['municipality_ward', 'district_cdo', 'central'].includes(user.role) : false;
  const isOrgRole = user ? ['ngo_ingo', 'private_org', 'donor'].includes(user.role) : false;

  const load = useCallback(async () => {
    if (isOrgRole) {
      setRequirements([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (tab === 'pending') params.status = 'submitted';
      if (tab === 'approved') params.status = 'approved';
      if (tab === 'partially_fulfilled') params.status = 'partially_fulfilled';
      if (tab === 'fulfilled') params.status = 'fulfilled';
      if (tab === 'critical') params.critical = 'true';

      const res = await api.get('/requirements', { params });
      let rows: RequirementRow[] = res.data.requirements;
      if (tab === 'in_progress') {
        rows = rows.filter((r) => ['allocated', 'dispatched'].includes(r.status));
      }
      setRequirements(rows);
    } finally {
      setLoading(false);
    }
  }, [tab, isOrgRole]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!isOrgRole) api.get('/geo/sites').then((res) => setSites(res.data.sites));
  }, [isOrgRole]);

  useEffect(() => {
    setSelected(new Set());
  }, [tab]);

  async function approve(id: string) {
    setBusyId(id);
    try {
      await api.patch(`/requirements/${id}/approve`, {});
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function reject(id: string) {
    const note = window.prompt('Reason for rejecting this requirement:');
    if (!note) return;
    setBusyId(id);
    try {
      await api.patch(`/requirements/${id}/reject`, { note });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function advanceStatus(id: string, status: string) {
    setBusyId(id);
    try {
      await api.patch(`/requirements/${id}/status`, { status });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function consolidate(e: FormEvent) {
    e.preventDefault();
    setConsolidateError(null);
    try {
      await api.post('/requirements/consolidate', {
        requirementIds: Array.from(selected),
        siteId: consolidateSiteId,
        description: consolidateDescription || undefined,
      });
      setSelected(new Set());
      setConsolidateSiteId('');
      setConsolidateDescription('');
      await load();
    } catch (err) {
      setConsolidateError(
        (err as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'Failed to consolidate.',
      );
    }
  }

  const nextStatusOptions: Record<string, string[]> = {
    approved: ['allocated'],
    allocated: ['dispatched'],
    dispatched: ['delivered'],
    delivered: ['fulfilled', 'partially_fulfilled'],
    partially_fulfilled: ['fulfilled'],
  };

  const canConsolidateHere = isReviewRole && tab === 'approved';

  const rows = useMemo(() => requirements, [requirements]);

  if (!user) return null;

  return (
    <div className="module-page">
      <ModuleHeader />

      {isFieldRole && <SubmissionForm onSubmitted={load} />}

      {isOrgRole ? (
        <section className="panel">
          <h2>Requirements</h2>
          <p className="empty-panel-note">
            Requirement data isn&apos;t shared with organizations directly. See the Situation &amp; Coordination
            module for the shared, aggregate coordination view.
          </p>
        </section>
      ) : (
        <section className="panel">
          <div className="tab-bar">
            {TABS.map((t) => (
              <button
                key={t.key}
                className={`tab-button ${tab === t.key ? 'active' : ''}`}
                onClick={() => setTab(t.key)}
                type="button"
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'history' ? (
            <RequirementHistoryPanel requirements={rows} loading={loading} />
          ) : (
            <>
          {canConsolidateHere && selected.size >= 2 && (
            <form className="inline-form" onSubmit={consolidate} style={{ marginBottom: 12 }}>
              <label>
                Combine into site
                <select required value={consolidateSiteId} onChange={(e) => setConsolidateSiteId(e.target.value)}>
                  <option value="">Select a site…</option>
                  {sites.map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ flexBasis: '40%' }}>
                Combined description
                <input value={consolidateDescription} onChange={(e) => setConsolidateDescription(e.target.value)} />
              </label>
              <button className="small-button" type="submit">
                Consolidate {selected.size} requirements
              </button>
            </form>
          )}
          {consolidateError && <div className="login-error">{consolidateError}</div>}

          {loading && <p className="empty-panel-note">Loading…</p>}
          {!loading && rows.length === 0 && <p className="empty-panel-note">No requirements in this view yet.</p>}
          {rows.length > 0 && (
            <table className="data-table">
              <thead>
                <tr>
                  {canConsolidateHere && <th></th>}
                  <th>Cluster / Category</th>
                  <th>Quantity</th>
                  <th>Status</th>
                  <th>Priority</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r._id}>
                    {canConsolidateHere && (
                      <td>
                        <input
                          type="checkbox"
                          disabled={r.status !== 'approved'}
                          checked={selected.has(r._id)}
                          onChange={() => toggleSelected(r._id)}
                        />
                      </td>
                    )}
                    <td>
                      {r.category}
                      <div className="table-subtext">{r.cluster.replace(/_/g, ' ')}</div>
                    </td>
                    <td>{r.quantityRequested}</td>
                    <td>
                      <span className="status-pill status-pending">{r.status.replace(/_/g, ' ')}</span>
                    </td>
                    <td>
                      <span className={`status-pill ${priorityBadgeClass(r.priorityScore)}`}>{r.priorityScore}</span>
                    </td>
                    <td>
                      {isReviewRole && r.status === 'submitted' && (
                        <>
                          <button className="small-button" disabled={busyId === r._id} onClick={() => approve(r._id)}>
                            Approve
                          </button>{' '}
                          <button className="small-button ghost" disabled={busyId === r._id} onClick={() => reject(r._id)}>
                            Reject
                          </button>
                        </>
                      )}
                      {isReviewRole &&
                        nextStatusOptions[r.status]?.map((next) => (
                          <button
                            key={next}
                            className="small-button ghost"
                            disabled={busyId === r._id}
                            onClick={() => advanceStatus(r._id, next)}
                          >
                            Mark {next.replace(/_/g, ' ')}
                          </button>
                        ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
