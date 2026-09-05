import { useCallback, useEffect, useState, FormEvent } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { MODULES } from '../config/modules';

const MOD = MODULES.find((m) => m.key === 'field-ops')!;

interface FieldReportRow {
  _id: string;
  reportType: string;
  payload: Record<string, unknown>;
  capturedAt: string;
  syncStatus: string;
}
interface PriorityCaseRow {
  _id: string;
  caseType: string;
  severity: string;
  status: string;
  notifiedLevels: string[];
  reportedAt: string;
}
interface NoticeRow {
  _id: string;
  title: string;
  body: string;
  category: string;
  issuedAt: string;
}
interface SiteOption {
  _id: string;
  name: string;
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

function NoticesPanel() {
  const [notices, setNotices] = useState<NoticeRow[]>([]);

  useEffect(() => {
    api.get('/notices').then((res) => setNotices(res.data.notices));
  }, []);

  if (notices.length === 0) return null;

  return (
    <section className="panel">
      <h2>Important Notices</h2>
      <table className="data-table">
        <thead>
          <tr>
            <th>Title</th>
            <th>Category</th>
            <th>Issued</th>
          </tr>
        </thead>
        <tbody>
          {notices.map((n) => (
            <tr key={n._id}>
              <td>
                {n.title}
                <div style={{ fontSize: 12, opacity: 0.8 }}>{n.body}</div>
              </td>
              <td>{n.category.replace(/_/g, ' ')}</td>
              <td>{new Date(n.issuedAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function FieldReportsPanel({ canSubmit }: { canSubmit: boolean }) {
  const [reports, setReports] = useState<FieldReportRow[]>([]);
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [siteId, setSiteId] = useState('');
  const [reportType, setReportType] = useState<'hazard_route_report' | 'rescue_evacuation_report'>('hazard_route_report');
  const [description, setDescription] = useState('');
  const [pendingCount, setPendingCount] = useState(0);

  const load = useCallback(async () => {
    const res = await api.get('/field-reports', { params: { mine: 'true' } });
    setReports(res.data.reports);
  }, []);

  useEffect(() => {
    load();
    if (canSubmit) api.get('/geo/sites').then((res) => setSites(res.data.sites));
  }, [load, canSubmit]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setPendingCount((c) => c + 1);
    try {
      await api.post('/field-reports', {
        siteId,
        reportType,
        payload: { description },
        clientUuid: `fr-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        capturedAt: new Date().toISOString(),
      });
      setDescription('');
      await load();
    } finally {
      setPendingCount((c) => Math.max(0, c - 1));
    }
  }

  return (
    <section className="panel">
      <h2>Field Reports</h2>
      <p className="empty-panel-note">
        {pendingCount > 0 ? `Pending synchronization: ${pendingCount} report(s) sending…` : 'All records synced.'}
      </p>
      {canSubmit && (
        <form className="inline-form" onSubmit={handleSubmit}>
          <label>
            Site
            <select required value={siteId} onChange={(e) => setSiteId(e.target.value)}>
              <option value="">Select…</option>
              {sites.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Report type
            <select value={reportType} onChange={(e) => setReportType(e.target.value as typeof reportType)}>
              <option value="hazard_route_report">Hazard / Route Report</option>
              <option value="rescue_evacuation_report">Rescue / Evacuation Report</option>
            </select>
          </label>
          <label>
            Description
            <input required value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What happened / what's needed" />
          </label>
          <button className="small-button" type="submit">
            Submit report
          </button>
        </form>
      )}
      {reports.length === 0 && <p className="empty-panel-note">No field reports yet.</p>}
      {reports.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Description</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => (
              <tr key={r._id}>
                <td>{r.reportType.replace(/_/g, ' ')}</td>
                <td>{String(r.payload?.description ?? '—')}</td>
                <td>{new Date(r.capturedAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function PriorityCasePanel({ canReport, canManage }: { canReport: boolean; canManage: boolean }) {
  const [cases, setCases] = useState<PriorityCaseRow[]>([]);
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [siteId, setSiteId] = useState('');
  const [caseType, setCaseType] = useState('medical_emergency');
  const [severity, setSeverity] = useState<'high' | 'critical'>('high');

  const load = useCallback(async () => {
    const res = await api.get('/priority-cases');
    setCases(res.data.priorityCases);
  }, []);

  useEffect(() => {
    load();
    if (canReport) api.get('/geo/sites').then((res) => setSites(res.data.sites));
  }, [load, canReport]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await api.post('/priority-cases', { siteId, caseType, severity });
    await load();
  }

  const NEXT: Record<string, string | undefined> = { reported: 'acknowledged', acknowledged: 'dispatched', dispatched: 'resolved' };

  async function advance(id: string, current: string) {
    const next = NEXT[current];
    if (!next) return;
    await api.patch(`/priority-cases/${id}/status`, { status: next });
    await load();
  }

  return (
    <section className="panel">
      <h2>Priority / Emergency Cases</h2>
      <p className="empty-panel-note">
        A critical case notifies Municipality and District immediately, and Province too if severity is critical — the skip-level
        escalation Rule.md requires.
      </p>
      {canReport && (
        <form className="inline-form" onSubmit={handleSubmit}>
          <label>
            Site
            <select required value={siteId} onChange={(e) => setSiteId(e.target.value)}>
              <option value="">Select…</option>
              {sites.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Case type
            <select value={caseType} onChange={(e) => setCaseType(e.target.value)}>
              <option value="maternal_emergency">Maternal emergency</option>
              <option value="medical_emergency">Medical emergency</option>
              <option value="mass_casualty">Mass casualty</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label>
            Severity
            <select value={severity} onChange={(e) => setSeverity(e.target.value as typeof severity)}>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </label>
          <button className="small-button" type="submit">
            Report emergency
          </button>
        </form>
      )}
      {cases.length === 0 && <p className="empty-panel-note">No priority cases reported.</p>}
      {cases.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Case</th>
              <th>Severity</th>
              <th>Status</th>
              <th>Notified</th>
              {canManage && <th></th>}
            </tr>
          </thead>
          <tbody>
            {cases.map((c) => (
              <tr key={c._id}>
                <td>{c.caseType.replace(/_/g, ' ')}</td>
                <td>
                  <span className={`status-pill ${c.severity === 'critical' ? 'status-pending' : 'status-verified'}`}>{c.severity}</span>
                </td>
                <td>{c.status}</td>
                <td>{c.notifiedLevels.join(', ')}</td>
                {canManage && (
                  <td>
                    {NEXT[c.status] && (
                      <button className="small-button ghost" onClick={() => advance(c._id, c.status)}>
                        Mark {NEXT[c.status]}
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export function FieldOperations() {
  const { user } = useAuth();
  if (!user) return null;

  const isFieldRole = ['volunteer', 'police', 'army'].includes(user.role);
  const isGovRole = ['central', 'district_cdo', 'municipality_ward'].includes(user.role);

  if (!isFieldRole && !isGovRole) {
    return (
      <div className="module-page">
        <ModuleHeader />
        <p className="empty-panel-note">Field operations data isn't shared with organizations/donors directly.</p>
      </div>
    );
  }

  return (
    <div className="module-page">
      <ModuleHeader />
      <NoticesPanel />
      <FieldReportsPanel canSubmit={isFieldRole} />
      <PriorityCasePanel canReport={isFieldRole || isGovRole} canManage={isGovRole} />
    </div>
  );
}
