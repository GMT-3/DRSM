import { useEffect, useState, useCallback } from 'react';
import { MapPin, Users, ClipboardList, AlertTriangle, Truck, ListChecks, RefreshCw } from 'lucide-react';
import { api } from '../api/client';
import { StatCard } from '../components/StatCard';
import { ModuleCard } from '../components/ModuleCard';
import { OperatingCycleStrip } from '../components/OperatingCycleStrip';
import { FeatureStrip } from '../components/FeatureStrip';
import { MODULES, modulesForRole } from '../config/modules';
import { useAuth } from '../context/AuthContext';

interface DashboardSummary {
  affectedLocations: number;
  affectedPopulation: number;
  activeRequirements: number;
  criticalRequirements: number;
  resourcesInTransit: number;
  pendingActions: number;
  lastUpdated: string;
}

export function Dashboard() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<DashboardSummary>('/dashboard/summary');
      setSummary(res.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visibleModules = user ? modulesForRole(user.role) : MODULES;

  return (
    <div className="dashboard">
      <div className="dashboard-toolbar">
        <div>
          {summary && (
            <span className="last-updated">
              Last Updated: {new Date(summary.lastUpdated).toLocaleTimeString()}
            </span>
          )}
        </div>
        <button className="refresh-button" onClick={load} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'spin' : ''} />
          Refresh
        </button>
      </div>

      <div className="stat-card-row">
        <StatCard icon={MapPin} value={summary?.affectedLocations ?? 0} label="Affected Locations" />
        <StatCard icon={Users} value={summary?.affectedPopulation ?? 0} label="Affected Population" />
        <StatCard icon={ClipboardList} value={summary?.activeRequirements ?? 0} label="Active Requirements" />
        <StatCard
          icon={AlertTriangle}
          value={summary?.criticalRequirements ?? 0}
          label="Critical Requirements"
          accent="critical"
        />
        <StatCard icon={Truck} value={summary?.resourcesInTransit ?? 0} label="Resources in Transit" />
        <StatCard icon={ListChecks} value={summary?.pendingActions ?? 0} label="Pending Actions" />
      </div>

      <div className="dashboard-mid-grid">
        <section className="panel situation-overview">
          <h2>Situation Overview</h2>
          <div className="map-placeholder">
            Map view (Leaflet, Nepal boundary layer) lands with module 1/5 data in a later phase —
            see <code>Implementation.md</code>.
          </div>
        </section>

        <section className="panel">
          <h2>Critical Requirements</h2>
          <p className="empty-panel-note">
            No requirements submitted yet — this view populates once module 2 (Necessity/Requirements)
            is built and field data starts flowing.
          </p>
        </section>

        <section className="panel">
          <h2>Recent Field Updates</h2>
          <p className="empty-panel-note">
            No field updates yet — this view populates with module 6 (Field Operations).
          </p>
        </section>
      </div>

      <OperatingCycleStrip />

      <div className="module-card-grid">
        {visibleModules.map((m) => (
          <ModuleCard key={m.key} mod={m} />
        ))}
      </div>

      <FeatureStrip />
    </div>
  );
}
