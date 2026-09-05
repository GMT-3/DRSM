import { Fragment, useCallback, useEffect, useState, FormEvent } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { MODULES } from '../config/modules';

const MOD = MODULES.find((m) => m.key === 'transport')!;

interface RequirementOption {
  _id: string;
  siteId: string;
  category: string;
  quantityRequested: number;
  status: string;
}
interface ResourceOption {
  _id: string;
  resourceType: string;
  unit: string;
  quantity: number;
  state: string;
}
interface VehicleRow {
  _id: string;
  type: string;
  registrationNumber: string;
  active: boolean;
}
interface StorageLocationOption {
  _id: string;
  name: string;
}
interface DispatchRow {
  _id: string;
  status: string;
  cargo: { resourceType: string; quantity: number };
  destinationSiteId: string;
  expectedArrivalAt?: string | null;
  currentPosition?: { lat: number; lng: number } | null;
  dispatchedAt: string;
}
interface RouteRow {
  _id: string;
  name: string;
  fromLocation: string;
  toLocation: string;
  currentCondition: 'open' | 'degraded' | 'blocked';
  conditionNote?: string;
}
interface HouseholdOption {
  _id: string;
  headOfHouseholdName: string;
}
interface DistributionRow {
  _id: string;
  resourceType: string;
  quantity: number;
  duplicateFlag: boolean;
  distributedAt: string;
}

type TransportTab = 'dispatches' | 'vehicles' | 'routes' | 'distribution';

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

// Current build scope (Rule.md's 2026-09-05 update): tracking stops at
// Municipality/Ward confirming receipt, so 'received' is this phase's
// terminal status — 'distributed' (the beneficiary handoff) is
// next-update scope and intentionally not offered here.
const NEXT_STATUS: Record<string, string | null> = {
  dispatched: 'in_transit',
  in_transit: 'arrived',
  arrived: 'received',
  received: null,
  distributed: null,
};

function DispatchesPanel({ canCreate }: { canCreate: boolean }) {
  const [dispatches, setDispatches] = useState<DispatchRow[]>([]);
  const [requirements, setRequirements] = useState<RequirementOption[]>([]);
  const [resources, setResources] = useState<ResourceOption[]>([]);
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [locations, setLocations] = useState<StorageLocationOption[]>([]);
  const [requirementId, setRequirementId] = useState('');
  const [resourceId, setResourceId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [originLocationId, setOriginLocationId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [posInputs, setPosInputs] = useState<Record<string, { lat: string; lng: string }>>({});

  const load = useCallback(async () => {
    const res = await api.get('/transport');
    setDispatches(res.data.dispatches);
  }, []);

  useEffect(() => {
    load();
    if (canCreate) {
      api.get('/requirements', { params: { status: 'approved' } }).then((res) => setRequirements(res.data.requirements));
      api.get('/resources', { params: { state: 'available' } }).then((res) => setResources(res.data.resources));
      api.get('/vehicles').then((res) => setVehicles(res.data.vehicles));
      api.get('/storage-locations').then((res) => setLocations(res.data.storageLocations));
    }
  }, [load, canCreate]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const requirement = requirements.find((r) => r._id === requirementId);
      const resource = resources.find((r) => r._id === resourceId);
      if (!requirement || !resource) return;

      const allocationRes = await api.post('/allocations', {
        requirementId,
        resourceId,
        quantityAllocated: resource.quantity,
      });

      await api.post('/transport', {
        resourceAllocationId: allocationRes.data.allocation._id,
        vehicleId,
        originLocationId,
        destinationSiteId: requirement.siteId,
        cargo: { resourceType: resource.resourceType, quantity: resource.quantity },
      });

      setRequirementId('');
      setResourceId('');
      setVehicleId('');
      setOriginLocationId('');
      await load();
    } catch (err) {
      setError((err as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'Failed to create dispatch.');
    }
  }

  async function advance(id: string) {
    const current = dispatches.find((d) => d._id === id);
    if (!current) return;
    const next = NEXT_STATUS[current.status];
    if (!next) return;
    await api.patch(`/transport/${id}/status`, { status: next });
    await load();
  }

  async function sendPosition(id: string) {
    const input = posInputs[id];
    if (!input?.lat || !input?.lng) return;
    await api.patch(`/transport/${id}/position`, { lat: Number(input.lat), lng: Number(input.lng) });
    await load();
  }

  return (
    <section className="panel">
      <h2>Dispatches &amp; In-Transit Tracking</h2>
      {canCreate && (
        <form className="inline-form" onSubmit={handleCreate}>
          <label>
            Approved requirement
            <select required value={requirementId} onChange={(e) => setRequirementId(e.target.value)}>
              <option value="">Select…</option>
              {requirements.map((r) => (
                <option key={r._id} value={r._id}>
                  {r.category} ({r.quantityRequested})
                </option>
              ))}
            </select>
          </label>
          <label>
            Available resource
            <select required value={resourceId} onChange={(e) => setResourceId(e.target.value)}>
              <option value="">Select…</option>
              {resources.map((r) => (
                <option key={r._id} value={r._id}>
                  {r.resourceType} — {r.quantity} {r.unit}
                </option>
              ))}
            </select>
          </label>
          <label>
            Vehicle
            <select required value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
              <option value="">Select…</option>
              {vehicles.map((v) => (
                <option key={v._id} value={v._id}>
                  {v.type} — {v.registrationNumber}
                </option>
              ))}
            </select>
          </label>
          <label>
            Origin storage location
            <select required value={originLocationId} onChange={(e) => setOriginLocationId(e.target.value)}>
              <option value="">Select…</option>
              {locations.map((l) => (
                <option key={l._id} value={l._id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <button className="small-button" type="submit">
            Allocate &amp; dispatch
          </button>
        </form>
      )}
      {error && <div className="login-error">{error}</div>}
      {dispatches.length === 0 && <p className="empty-panel-note">No dispatches yet.</p>}
      {dispatches.length > 0 && (
        <p className="table-subtext" style={{ marginBottom: 8 }}>
          Delivery is confirmed once a dispatch is marked <strong>received</strong> at the Municipality/Ward. Beneficiary-level
          distribution confirmation is next-update scope.
        </p>
      )}
      {dispatches.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Cargo</th>
              <th>Status</th>
              <th>Expected arrival</th>
              <th>Last position</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {dispatches.map((d) => (
              <Fragment key={d._id}>
                <tr>
                  <td>
                    {d.cargo.resourceType} ({d.cargo.quantity})
                  </td>
                  <td>
                    <span className={`status-pill ${d.status === 'received' || d.status === 'distributed' ? 'status-verified' : 'status-pending'}`}>{d.status}</span>
                  </td>
                  <td>{d.expectedArrivalAt ? new Date(d.expectedArrivalAt).toLocaleDateString() : '—'}</td>
                  <td>{d.currentPosition ? `${d.currentPosition.lat.toFixed(3)}, ${d.currentPosition.lng.toFixed(3)}` : '—'}</td>
                  <td>
                    {NEXT_STATUS[d.status] && (
                      <button className="small-button ghost" onClick={() => advance(d._id)}>
                        Mark {NEXT_STATUS[d.status]}
                      </button>
                    )}
                  </td>
                </tr>
                <tr>
                  <td colSpan={5}>
                    <input
                      placeholder="lat"
                      style={{ width: 80, marginRight: 4 }}
                      value={posInputs[d._id]?.lat ?? ''}
                      onChange={(e) => setPosInputs((prev) => ({ ...prev, [d._id]: { ...prev[d._id], lat: e.target.value } }))}
                    />
                    <input
                      placeholder="lng"
                      style={{ width: 80, marginRight: 4 }}
                      value={posInputs[d._id]?.lng ?? ''}
                      onChange={(e) => setPosInputs((prev) => ({ ...prev, [d._id]: { ...prev[d._id], lng: e.target.value } }))}
                    />
                    <button className="small-button ghost" onClick={() => sendPosition(d._id)}>
                      Update position
                    </button>
                  </td>
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function VehiclesPanel({ canManage }: { canManage: boolean }) {
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [type, setType] = useState('truck');
  const [registrationNumber, setRegistrationNumber] = useState('');

  const load = useCallback(async () => {
    const res = await api.get('/vehicles');
    setVehicles(res.data.vehicles);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await api.post('/vehicles', { type, registrationNumber });
    setRegistrationNumber('');
    await load();
  }

  return (
    <section className="panel">
      <h2>Vehicles &amp; Transporters</h2>
      {canManage && (
        <form className="inline-form" onSubmit={handleSubmit}>
          <label>
            Type
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="truck">Truck</option>
              <option value="helicopter">Helicopter</option>
              <option value="boat">Boat</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label>
            Registration number
            <input required value={registrationNumber} onChange={(e) => setRegistrationNumber(e.target.value)} />
          </label>
          <button className="small-button" type="submit">
            Register vehicle
          </button>
        </form>
      )}
      {vehicles.length === 0 && <p className="empty-panel-note">No vehicles registered yet.</p>}
      {vehicles.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Registration</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {vehicles.map((v) => (
              <tr key={v._id}>
                <td>{v.type}</td>
                <td>{v.registrationNumber}</td>
                <td>{v.active ? 'Active' : 'Inactive'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function RoutesPanel({ canManage, canReportCondition }: { canManage: boolean; canReportCondition: boolean }) {
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [name, setName] = useState('');
  const [fromLocation, setFromLocation] = useState('');
  const [toLocation, setToLocation] = useState('');
  const [blockedOnly, setBlockedOnly] = useState(false);
  const [noteInputs, setNoteInputs] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const res = await api.get('/routes', { params: blockedOnly ? { condition: 'blocked' } : {} });
    setRoutes(res.data.routes);
  }, [blockedOnly]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await api.post('/routes', { name, fromLocation, toLocation });
    setName('');
    setFromLocation('');
    setToLocation('');
    await load();
  }

  async function updateCondition(id: string, currentCondition: string) {
    await api.patch(`/routes/${id}/condition`, { currentCondition, conditionNote: noteInputs[id] });
    await load();
  }

  return (
    <section className="panel">
      <h2>Routes &amp; Route Conditions</h2>
      {canManage && (
        <form className="inline-form" onSubmit={handleSubmit}>
          <label>
            Name
            <input required value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            From
            <input required value={fromLocation} onChange={(e) => setFromLocation(e.target.value)} />
          </label>
          <label>
            To
            <input required value={toLocation} onChange={(e) => setToLocation(e.target.value)} />
          </label>
          <button className="small-button" type="submit">
            Register route
          </button>
        </form>
      )}
      <label className="checkbox-label">
        <input type="checkbox" checked={blockedOnly} onChange={(e) => setBlockedOnly(e.target.checked)} />
        Show blocked / disrupted routes only
      </label>
      {routes.length === 0 && <p className="empty-panel-note">No routes to show.</p>}
      {routes.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Route</th>
              <th>Condition</th>
              {canReportCondition && <th></th>}
            </tr>
          </thead>
          <tbody>
            {routes.map((r) => (
              <tr key={r._id}>
                <td>
                  {r.name} ({r.fromLocation} → {r.toLocation})
                </td>
                <td>
                  <span className={`status-pill ${r.currentCondition === 'open' ? 'status-verified' : 'status-pending'}`}>
                    {r.currentCondition}
                  </span>
                  {r.conditionNote ? ` — ${r.conditionNote}` : ''}
                </td>
                {canReportCondition && (
                  <td>
                    <input
                      placeholder="note"
                      style={{ width: 100, marginRight: 4 }}
                      value={noteInputs[r._id] ?? ''}
                      onChange={(e) => setNoteInputs((prev) => ({ ...prev, [r._id]: e.target.value }))}
                    />
                    {['open', 'degraded', 'blocked']
                      .filter((c) => c !== r.currentCondition)
                      .map((c) => (
                        <button key={c} className="small-button ghost" onClick={() => updateCondition(r._id, c)}>
                          Mark {c}
                        </button>
                      ))}
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

function DistributionPanel({ canRecord }: { canRecord: boolean }) {
  const [distributions, setDistributions] = useState<DistributionRow[]>([]);
  const [households, setHouseholds] = useState<HouseholdOption[]>([]);
  const [householdId, setHouseholdId] = useState('');
  const [resourceType, setResourceType] = useState('');
  const [quantity, setQuantity] = useState('');

  const load = useCallback(async () => {
    const res = await api.get('/distributions');
    setDistributions(res.data.distributions);
  }, []);

  useEffect(() => {
    load();
    if (canRecord) api.get('/households').then((res) => setHouseholds(res.data.households));
  }, [load, canRecord]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await api.post('/distributions', { householdId, resourceType, quantity: Number(quantity) });
    setResourceType('');
    setQuantity('');
    await load();
  }

  return (
    <section className="panel">
      <h2>Delivery Confirmation / Distribution</h2>
      {canRecord && (
        <form className="inline-form" onSubmit={handleSubmit}>
          <label>
            Household
            <select required value={householdId} onChange={(e) => setHouseholdId(e.target.value)}>
              <option value="">Select…</option>
              {households.map((h) => (
                <option key={h._id} value={h._id}>
                  {h.headOfHouseholdName}
                </option>
              ))}
            </select>
          </label>
          <label>
            Resource type
            <input required value={resourceType} onChange={(e) => setResourceType(e.target.value)} placeholder="e.g. bottled water" />
          </label>
          <label>
            Quantity
            <input required type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </label>
          <button className="small-button" type="submit">
            Confirm distribution
          </button>
        </form>
      )}
      {distributions.length === 0 && <p className="empty-panel-note">No distributions recorded yet.</p>}
      {distributions.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Resource</th>
              <th>Quantity</th>
              <th>When</th>
              <th>Flag</th>
            </tr>
          </thead>
          <tbody>
            {distributions.map((d) => (
              <tr key={d._id}>
                <td>{d.resourceType}</td>
                <td>{d.quantity}</td>
                <td>{new Date(d.distributedAt).toLocaleString()}</td>
                <td>{d.duplicateFlag ? <span className="status-pill status-pending">possible duplicate</span> : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export function Transport() {
  const { user } = useAuth();
  const [tab, setTab] = useState<TransportTab>('dispatches');

  if (!user) return null;

  const isGovRole = ['central', 'district_cdo', 'municipality_ward'].includes(user.role);
  const isFieldRole = ['volunteer', 'police', 'army'].includes(user.role);
  const isOrgRole = ['ngo_ingo', 'private_org'].includes(user.role);
  const isDonor = user.role === 'donor';

  const TABS: { key: TransportTab; label: string }[] = [
    { key: 'dispatches', label: 'Dispatches / In Transit' },
    { key: 'vehicles', label: 'Vehicles & Transporters' },
    { key: 'routes', label: 'Routes & Conditions' },
    { key: 'distribution', label: 'Delivery Confirmation' },
  ];

  if (isDonor) {
    return (
      <div className="module-page">
        <ModuleHeader />
        <p className="empty-panel-note">Transport &amp; distribution operations aren't shared with donors directly.</p>
      </div>
    );
  }

  return (
    <div className="module-page">
      <ModuleHeader />
      <section className="panel">
        <div className="tab-bar">
          {TABS.map((t) => (
            <button key={t.key} className={`tab-button ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)} type="button">
              {t.label}
            </button>
          ))}
        </div>
      </section>

      {tab === 'dispatches' && <DispatchesPanel canCreate={isGovRole} />}
      {tab === 'vehicles' && <VehiclesPanel canManage={isGovRole || isOrgRole} />}
      {tab === 'routes' && <RoutesPanel canManage={isGovRole} canReportCondition={isGovRole || isFieldRole} />}
      {tab === 'distribution' && <DistributionPanel canRecord={isFieldRole || isGovRole} />}
    </div>
  );
}
