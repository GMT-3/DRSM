import { useEffect, useState } from 'react';
import { api, API_BASE_URL, getAccessToken } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { MODULES } from '../config/modules';

const MOD = MODULES.find((m) => m.key === 'reports')!;

type ReportType = 'requirements' | 'resources' | 'inventory' | 'transport' | 'distribution' | 'unfulfilled' | 'timeline';

const REPORT_OPTIONS: { key: ReportType; label: string }[] = [
  { key: 'unfulfilled', label: 'Unfulfilled Requirements' },
  { key: 'requirements', label: 'Requirement Reports' },
  { key: 'resources', label: 'Resource Reports' },
  { key: 'inventory', label: 'Inventory Reports' },
  { key: 'transport', label: 'Transport Reports' },
  { key: 'distribution', label: 'Distribution Reports' },
  { key: 'timeline', label: 'Response Timeline' },
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

export function Reports() {
  const { user } = useAuth();
  const [reportType, setReportType] = useState<ReportType>('unfulfilled');
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const isGovRole = Boolean(user) && ['central', 'district_cdo', 'municipality_ward'].includes(user!.role);

  useEffect(() => {
    if (!isGovRole) return;
    setLoading(true);
    api
      .get(`/reports/${reportType}`)
      .then((res) => setRows(res.data.rows ?? []))
      .finally(() => setLoading(false));
  }, [reportType, isGovRole]);

  if (!user) return null;

  if (!isGovRole) {
    return (
      <div className="module-page">
        <ModuleHeader />
        <p className="empty-panel-note">Reports & Analytics is restricted to government roles.</p>
      </div>
    );
  }

  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
  const humanize = (key: string) => key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
  const exportUrl = `${API_BASE_URL}/reports/export/${reportType}`;

  async function handleExport() {
    const token = getAccessToken();
    const res = await fetch(exportUrl, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${reportType}-report.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="module-page">
      <ModuleHeader />
      <section className="panel">
        <div className="tab-bar">
          {REPORT_OPTIONS.map((r) => (
            <button
              key={r.key}
              className={`tab-button ${reportType === r.key ? 'active' : ''}`}
              onClick={() => setReportType(r.key)}
              type="button"
            >
              {r.label}
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="module-card-header" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>{REPORT_OPTIONS.find((r) => r.key === reportType)?.label}</h2>
          <button className="small-button" onClick={handleExport} style={{ marginLeft: 'auto' }}>
            Export CSV
          </button>
        </div>
        {loading && <p className="empty-panel-note">Loading…</p>}
        {!loading && rows.length === 0 && <p className="empty-panel-note">No data for this report yet.</p>}
        {!loading && rows.length > 0 && (
          <table className="data-table">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c}>{humanize(c)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  {columns.map((c) => (
                    <td key={c}>{String(row[c] ?? '')}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
