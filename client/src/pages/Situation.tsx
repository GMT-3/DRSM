import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { MODULES } from '../config/modules';

const MOD = MODULES.find((m) => m.key === 'situation')!;

interface CriticalLocation {
  siteId: string;
  siteName: string;
  maxPriorityScore: number;
  openRequirementCount: number;
}
interface ByCluster {
  cluster: string;
  count: number;
  quantityRequested: number;
}
interface SupplyDemand {
  cluster: string;
  requested: number;
  committed: number;
  delivered: number;
}
interface ResourceGap {
  cluster: string;
  gap: number;
}
interface DelayedAction {
  dispatchId: string;
  status: string;
  hoursSinceDispatch: number;
  reason: string;
}
interface SituationOverview {
  criticalLocations: CriticalLocation[];
  outstandingRequirements: { count: number; byCluster: ByCluster[] };
  resourceGaps: ResourceGap[];
  supplyDemand: SupplyDemand[];
  delayedActions: DelayedAction[];
  notShared?: boolean;
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

export function Situation() {
  const { user } = useAuth();
  const [data, setData] = useState<SituationOverview | null>(null);

  useEffect(() => {
    api.get('/situation/overview').then((res) => setData(res.data));
  }, []);

  if (!user) return null;

  if (data?.notShared) {
    return (
      <div className="module-page">
        <ModuleHeader />
        <p className="empty-panel-note">The coordination view isn't shared with donors directly.</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="module-page">
        <ModuleHeader />
        <p className="empty-panel-note">Loading…</p>
      </div>
    );
  }

  return (
    <div className="module-page">
      <ModuleHeader />

      <section className="panel">
        <h2>Critical Locations</h2>
        {data.criticalLocations.length === 0 && <p className="empty-panel-note">No open critical locations right now.</p>}
        {data.criticalLocations.length > 0 && (
          <table className="data-table">
            <thead>
              <tr>
                <th>Site</th>
                <th>Max priority score</th>
                <th>Open requirements</th>
              </tr>
            </thead>
            <tbody>
              {data.criticalLocations.map((c) => (
                <tr key={c.siteId}>
                  <td>{c.siteName}</td>
                  <td>
                    <span className={`status-pill ${c.maxPriorityScore >= 80 ? 'status-pending' : 'status-verified'}`}>
                      {c.maxPriorityScore}
                    </span>
                  </td>
                  <td>{c.openRequirementCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel">
        <h2>Outstanding Requirements ({data.outstandingRequirements.count})</h2>
        {data.outstandingRequirements.byCluster.length === 0 && <p className="empty-panel-note">Nothing outstanding.</p>}
        {data.outstandingRequirements.byCluster.length > 0 && (
          <table className="data-table">
            <thead>
              <tr>
                <th>Cluster</th>
                <th>Count</th>
                <th>Quantity requested</th>
              </tr>
            </thead>
            <tbody>
              {data.outstandingRequirements.byCluster.map((b) => (
                <tr key={b.cluster}>
                  <td>{b.cluster}</td>
                  <td>{b.count}</td>
                  <td>{b.quantityRequested}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel">
        <h2>Supply-Demand Status</h2>
        {data.supplyDemand.length === 0 && <p className="empty-panel-note">No data yet.</p>}
        {data.supplyDemand.length > 0 && (
          <table className="data-table">
            <thead>
              <tr>
                <th>Cluster</th>
                <th>Requested</th>
                <th>Committed</th>
                <th>Delivered</th>
              </tr>
            </thead>
            <tbody>
              {data.supplyDemand.map((s) => (
                <tr key={s.cluster}>
                  <td>{s.cluster}</td>
                  <td>{s.requested}</td>
                  <td>{s.committed}</td>
                  <td>{s.delivered}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel">
        <h2>Resource Gaps</h2>
        {data.resourceGaps.length === 0 && <p className="empty-panel-note">No unresourced gaps identified.</p>}
        {data.resourceGaps.length > 0 && (
          <table className="data-table">
            <thead>
              <tr>
                <th>Cluster</th>
                <th>Gap (requested minus committed)</th>
              </tr>
            </thead>
            <tbody>
              {data.resourceGaps.map((g) => (
                <tr key={g.cluster}>
                  <td>{g.cluster}</td>
                  <td>{g.gap}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel">
        <h2>Delayed / At-Risk Actions</h2>
        {data.delayedActions.length === 0 && <p className="empty-panel-note">Nothing delayed or at risk right now.</p>}
        {data.delayedActions.length > 0 && (
          <table className="data-table">
            <thead>
              <tr>
                <th>Dispatch</th>
                <th>Status</th>
                <th>Hours since dispatch</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {data.delayedActions.map((d) => (
                <tr key={d.dispatchId}>
                  <td>{d.dispatchId}</td>
                  <td>{d.status}</td>
                  <td>{d.hoursSinceDispatch}</td>
                  <td>{d.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
