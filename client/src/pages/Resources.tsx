import { Fragment, useCallback, useEffect, useState, FormEvent } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { MODULES } from '../config/modules';

const MOD = MODULES.find((m) => m.key === 'resources')!;

interface StorageLocationRow {
  _id: string;
  name: string;
  type: string;
  municipalityId?: string;
  districtId?: string;
}

interface ResourceRow {
  _id: string;
  ownerType: 'government' | 'organization';
  category?: string;
  resourceType: string;
  unit: string;
  quantity: number;
  state: 'available' | 'allocated' | 'reserved';
  storageLocationId?: string | null;
}

interface ResourceCategoryRow {
  _id: string;
  name: string;
}

interface ContributionRow {
  _id: string;
  resourceType: string;
  quantity: number;
  unit: string;
  fundAmount?: number | null;
  currency?: string | null;
  verificationStatus: 'unverified' | 'pending' | 'verified';
  receivedAt: string;
}

interface DonationRow {
  _id: string;
  donatedByOrganizationId?: string | null;
  donatedByUserId?: string | null;
  donorName?: string | null;
  amount: number;
  currency: string;
  purpose?: string | null;
  verificationStatus: 'unverified' | 'pending' | 'verified';
  receivedAt: string;
}

interface FundTotalRow {
  currency: string;
  pledged: number;
  verified: number;
  allocated: number;
  balance: number;
}

interface FundAllocationRow {
  _id: string;
  amount: number;
  currency: string;
  purpose: string;
  allocatedAt: string;
}

interface MovementRow {
  _id: string;
  quantity: number;
  reason: string;
  movedAt: string;
  toLocationId?: string | null;
}

interface SupplyOfferRow {
  _id: string;
  organizationId: string;
  quantityOffered: number;
  note?: string;
  status: 'offered' | 'accepted' | 'declined';
  resourceId?: string | null;
}

interface SupplyAssistanceRow {
  _id: string;
  requirementId: string;
  cluster: string;
  category: string;
  unit: string;
  quantityNeeded: number;
  quantityGovernmentCommitted: number;
  note?: string;
  status: 'open' | 'fulfilled' | 'cancelled';
  offers: SupplyOfferRow[];
}

interface RequirementOption {
  _id: string;
  cluster: string;
  category: string;
  quantityRequested: number;
}

type ResourceTab =
  | 'overview'
  | 'government'
  | 'organization'
  | 'storage'
  | 'available'
  | 'allocated'
  | 'reserved'
  | 'contributions'
  | 'cash-fund'
  | 'supply-assistance';

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

function StorageLocationsPanel({ canManage }: { canManage: boolean }) {
  const [locations, setLocations] = useState<StorageLocationRow[]>([]);
  const [name, setName] = useState('');
  const [type, setType] = useState('warehouse');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/storage-locations');
      setLocations(res.data.storageLocations);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await api.post('/storage-locations', { name, type });
    setName('');
    await load();
  }

  return (
    <section className="panel">
      <h2>Regional Storage Units</h2>
      {canManage && (
        <form className="inline-form" onSubmit={handleSubmit}>
          <label>
            Name
            <input required value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            Type
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="warehouse">Warehouse</option>
              <option value="store">Store</option>
              <option value="collection_center">Collection center</option>
              <option value="other">Other</option>
            </select>
          </label>
          <button className="small-button" type="submit">
            Register location
          </button>
        </form>
      )}
      {loading && <p className="empty-panel-note">Loading…</p>}
      {!loading && locations.length === 0 && <p className="empty-panel-note">No storage locations registered yet.</p>}
      {locations.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
            </tr>
          </thead>
          <tbody>
            {locations.map((l) => (
              <tr key={l._id}>
                <td>{l.name}</td>
                <td>{l.type.replace(/_/g, ' ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function MovementHistory({ resourceId, onClose }: { resourceId: string; onClose: () => void }) {
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [locations, setLocations] = useState<StorageLocationRow[]>([]);
  const [reason, setReason] = useState<'transfer' | 'distribution' | 'adjustment'>('distribution');
  const [quantity, setQuantity] = useState('');
  const [toLocationId, setToLocationId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await api.get('/inventory-movements', { params: { resourceId } });
    setMovements(res.data.movements);
  }, [resourceId]);

  useEffect(() => {
    load();
    api.get('/storage-locations').then((res) => setLocations(res.data.storageLocations));
  }, [load]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post('/inventory-movements', {
        resourceId,
        reason,
        quantity: Number(quantity),
        toLocationId: reason === 'transfer' ? toLocationId : undefined,
      });
      setQuantity('');
      await load();
    } catch (err) {
      setError((err as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'Failed to record movement.');
    }
  }

  return (
    <tr>
      <td colSpan={6}>
        <div className="panel" style={{ margin: '8px 0' }}>
          <h2>Inventory Movement</h2>
          <form className="inline-form" onSubmit={handleSubmit}>
            <label>
              Reason
              <select value={reason} onChange={(e) => setReason(e.target.value as typeof reason)}>
                <option value="distribution">Distribution</option>
                <option value="transfer">Transfer</option>
                <option value="adjustment">Adjustment</option>
              </select>
            </label>
            <label>
              Quantity {reason === 'adjustment' && '(use a negative number to reduce)'}
              <input required type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </label>
            {reason === 'transfer' && (
              <label>
                To location
                <select required value={toLocationId} onChange={(e) => setToLocationId(e.target.value)}>
                  <option value="">Select…</option>
                  {locations.map((l) => (
                    <option key={l._id} value={l._id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button className="small-button" type="submit">
              Record movement
            </button>
            <button className="small-button ghost" type="button" onClick={onClose}>
              Close
            </button>
          </form>
          {error && <div className="login-error">{error}</div>}
          {movements.length === 0 && <p className="empty-panel-note">No movements recorded yet.</p>}
          {movements.length > 0 && (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Reason</th>
                  <th>Quantity</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m) => (
                  <tr key={m._id}>
                    <td>{m.reason}</td>
                    <td>{m.quantity}</td>
                    <td>{new Date(m.movedAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </td>
    </tr>
  );
}

function InventoryPanel({ tab, canAdd, ownerLabel }: { tab: ResourceTab; canAdd: boolean; ownerLabel: string }) {
  const [resources, setResources] = useState<ResourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<ResourceCategoryRow[]>([]);
  const [category, setCategory] = useState('');
  const [resourceType, setResourceType] = useState('');
  const [unit, setUnit] = useState('');
  const [quantity, setQuantity] = useState('');
  const [historyFor, setHistoryFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (tab === 'government') params.ownerType = 'government';
      if (tab === 'organization') params.ownerType = 'organization';
      if (['available', 'allocated', 'reserved'].includes(tab)) params.state = tab;
      const res = await api.get('/resources', { params });
      setResources(res.data.resources);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  const loadCategories = useCallback(async () => {
    // The picklist for "Category" (food, shelter, medicine, ...) is
    // admin-configurable from Administration > Categories; central
    // government can add or retire entries there without a code change.
    const res = await api.get('/categories', { params: { kind: 'resource' } });
    const rows: ResourceCategoryRow[] = res.data.categories ?? [];
    setCategories(rows);
    setCategory((current) => current || rows[0]?.name || '');
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (canAdd) loadCategories();
  }, [canAdd, loadCategories]);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    await api.post('/resources', { category, resourceType, unit, quantity: Number(quantity) });
    setResourceType('');
    setUnit('');
    setQuantity('');
    await load();
  }

  async function setState(id: string, state: string) {
    await api.patch(`/resources/${id}/state`, { state });
    await load();
  }

  return (
    <section className="panel">
      <h2>{ownerLabel}</h2>
      {canAdd && (
        <form className="inline-form" onSubmit={handleAdd}>
          <label>
            Category
            <select required value={category} onChange={(e) => setCategory(e.target.value)}>
              {categories.length === 0 && <option value="">No categories yet</option>}
              {categories.map((c) => (
                <option key={c._id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Resource type
            <input required value={resourceType} onChange={(e) => setResourceType(e.target.value)} placeholder="e.g. rice" />
          </label>
          <label>
            Unit
            <input required value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="e.g. kg" />
          </label>
          <label>
            Quantity
            <input required type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </label>
          <button className="small-button" type="submit" disabled={categories.length === 0}>
            Add to inventory
          </button>
        </form>
      )}
      {loading && <p className="empty-panel-note">Loading…</p>}
      {!loading && resources.length === 0 && <p className="empty-panel-note">Nothing in this view yet.</p>}
      {resources.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Category</th>
              <th>Type</th>
              <th>Quantity</th>
              <th>Owner</th>
              <th>State</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {resources.map((r) => (
              <Fragment key={r._id}>
                <tr key={r._id}>
                  <td>{r.category || 'Uncategorized'}</td>
                  <td>{r.resourceType}</td>
                  <td>
                    {r.quantity} {r.unit}
                  </td>
                  <td>{r.ownerType}</td>
                  <td>
                    <span className={`status-pill ${r.state === 'available' ? 'status-verified' : 'status-pending'}`}>{r.state}</span>
                  </td>
                  <td>
                    {['available', 'allocated', 'reserved']
                      .filter((s) => s !== r.state)
                      .map((s) => (
                        <button key={s} className="small-button ghost" onClick={() => setState(r._id, s)}>
                          Mark {s}
                        </button>
                      ))}
                    <button className="small-button ghost" onClick={() => setHistoryFor(historyFor === r._id ? null : r._id)}>
                      History
                    </button>
                  </td>
                </tr>
                {historyFor === r._id && <MovementHistory resourceId={r._id} onClose={() => setHistoryFor(null)} />}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function ContributionsPanel({ canSubmit, canVerify }: { canSubmit: boolean; canVerify: boolean }) {
  const [contributions, setContributions] = useState<ContributionRow[]>([]);
  const [locations, setLocations] = useState<StorageLocationRow[]>([]);
  const [resourceType, setResourceType] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('');
  const [fundAmount, setFundAmount] = useState('');
  const [verifyLocation, setVerifyLocation] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const res = await api.get('/resource-contributions');
    setContributions(res.data.contributions);
  }, []);

  useEffect(() => {
    load();
    if (canVerify) api.get('/storage-locations').then((res) => setLocations(res.data.storageLocations));
  }, [load, canVerify]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await api.post('/resource-contributions', {
      resourceType,
      quantity: Number(quantity),
      unit,
      fundAmount: fundAmount ? Number(fundAmount) : undefined,
    });
    setResourceType('');
    setQuantity('');
    setUnit('');
    setFundAmount('');
    await load();
  }

  async function verify(id: string, decision: 'verified' | 'unverified') {
    await api.patch(`/resource-contributions/${id}/verify`, { decision, storageLocationId: verifyLocation[id] });
    await load();
  }

  return (
    <section className="panel">
      <h2>Resource Contributions</h2>
      {canSubmit && (
        <form className="inline-form" onSubmit={handleSubmit}>
          <label>
            Resource type
            <input required value={resourceType} onChange={(e) => setResourceType(e.target.value)} placeholder="e.g. medicine, cash" />
          </label>
          <label>
            Quantity
            <input required type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </label>
          <label>
            Unit
            <input required value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="e.g. box, lump_sum" />
          </label>
          <label>
            Fund amount (optional)
            <input type="number" value={fundAmount} onChange={(e) => setFundAmount(e.target.value)} />
          </label>
          <button className="small-button" type="submit">
            Submit contribution
          </button>
        </form>
      )}
      {contributions.length === 0 && <p className="empty-panel-note">No contributions yet.</p>}
      {contributions.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Quantity</th>
              <th>Status</th>
              {canVerify && <th></th>}
            </tr>
          </thead>
          <tbody>
            {contributions.map((c) => (
              <tr key={c._id}>
                <td>{c.resourceType}</td>
                <td>
                  {c.quantity} {c.unit}
                  {c.fundAmount ? ` (fund: ${c.fundAmount} ${c.currency ?? ''})` : ''}
                </td>
                <td>
                  <span className={`status-pill ${c.verificationStatus === 'verified' ? 'status-verified' : 'status-pending'}`}>
                    {c.verificationStatus}
                  </span>
                </td>
                {canVerify && c.verificationStatus !== 'verified' && (
                  <td>
                    <select
                      value={verifyLocation[c._id] ?? ''}
                      onChange={(e) => setVerifyLocation((prev) => ({ ...prev, [c._id]: e.target.value }))}
                    >
                      <option value="">Location…</option>
                      {locations.map((l) => (
                        <option key={l._id} value={l._id}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                    <button className="small-button" disabled={!verifyLocation[c._id]} onClick={() => verify(c._id, 'verified')}>
                      Verify
                    </button>
                  </td>
                )}
                {canVerify && c.verificationStatus === 'verified' && <td></td>}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}



/**
 * Cash & Fund Donations (user requirement, 2026-09-05): money tracked as
 * its own section rather than folded into ContributionsPanel above, since
 * cash behaves differently from an in-kind contribution — it accrues
 * toward a spendable fund balance (Verified − Allocated) instead of
 * converting into a warehoused Resource. Central verifies incoming
 * donations and records how the verified balance gets spent
 * (allocations); every role can see the running totals for transparency.
 */
function CashDonationsPanel({
  canSubmit,
  canVerify,
  canAllocate,
  isGovRole,
}: {
  canSubmit: boolean;
  canVerify: boolean;
  canAllocate: boolean;
  isGovRole: boolean;
}) {
  const [donations, setDonations] = useState<DonationRow[]>([]);
  const [totals, setTotals] = useState<FundTotalRow[]>([]);
  const [allocations, setAllocations] = useState<FundAllocationRow[]>([]);
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('NPR');
  const [purpose, setPurpose] = useState('');
  const [donorName, setDonorName] = useState('');
  const [allocAmount, setAllocAmount] = useState('');
  const [allocCurrency, setAllocCurrency] = useState('NPR');
  const [allocPurpose, setAllocPurpose] = useState('');

  const load = useCallback(async () => {
    const [donationsRes, summaryRes, allocationsRes] = await Promise.all([
      api.get('/donations'),
      api.get('/donations/summary'),
      api.get('/donations/allocations'),
    ]);
    setDonations(donationsRes.data.donations ?? []);
    setTotals(summaryRes.data.totals ?? []);
    setAllocations(allocationsRes.data.allocations ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await api.post('/donations', {
      amount: Number(amount),
      currency,
      purpose: purpose.trim() || undefined,
      donorName: donorName.trim() || undefined,
    });
    setAmount('');
    setPurpose('');
    setDonorName('');
    await load();
  }

  async function verify(id: string, decision: 'verified' | 'unverified') {
    await api.patch(`/donations/${id}/verify`, { decision });
    await load();
  }

  async function handleAllocate(e: FormEvent) {
    e.preventDefault();
    await api.post('/donations/allocations', { amount: Number(allocAmount), currency: allocCurrency, purpose: allocPurpose });
    setAllocAmount('');
    setAllocPurpose('');
    await load();
  }

  return (
    <section className="panel">
      <h2>Cash &amp; Fund Donations</h2>

      {totals.length === 0 && <p className="empty-panel-note">No donations recorded yet.</p>}
      {totals.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Currency</th>
              <th>Pledged</th>
              <th>Verified</th>
              <th>Allocated</th>
              <th>Balance</th>
            </tr>
          </thead>
          <tbody>
            {totals.map((t) => (
              <tr key={t.currency}>
                <td>{t.currency}</td>
                <td>{t.pledged.toLocaleString()}</td>
                <td>{t.verified.toLocaleString()}</td>
                <td>{t.allocated.toLocaleString()}</td>
                <td>{t.balance.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {canSubmit && (
        <form className="inline-form" onSubmit={handleSubmit}>
          <label>
            Amount
            <input required type="number" min={0.01} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <label>
            Currency
            <input required value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} placeholder="NPR" />
          </label>
          <label>
            Purpose (optional)
            <input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="e.g. flood relief" />
          </label>
          {isGovRole && (
            <label>
              Donor name (optional)
              <input value={donorName} onChange={(e) => setDonorName(e.target.value)} placeholder="recording on someone's behalf" />
            </label>
          )}
          <button className="small-button" type="submit">
            Submit donation
          </button>
        </form>
      )}

      {donations.length === 0 && <p className="empty-panel-note">Nothing submitted yet.</p>}
      {donations.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Amount</th>
              <th>Donor</th>
              <th>Purpose</th>
              <th>Status</th>
              {canVerify && <th></th>}
            </tr>
          </thead>
          <tbody>
            {donations.map((d) => (
              <tr key={d._id}>
                <td>
                  {d.amount.toLocaleString()} {d.currency}
                </td>
                <td>{d.donorName || (d.donatedByOrganizationId ? 'Organization' : d.donatedByUserId ? 'Donor account' : '—')}</td>
                <td>{d.purpose || '—'}</td>
                <td>
                  <span className={`status-pill ${d.verificationStatus === 'verified' ? 'status-verified' : 'status-pending'}`}>
                    {d.verificationStatus}
                  </span>
                </td>
                {canVerify && (
                  <td>
                    {d.verificationStatus !== 'verified' && (
                      <button className="small-button" onClick={() => verify(d._id, 'verified')}>
                        Verify
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {(canAllocate || allocations.length > 0) && (
        <>
          <h3 style={{ marginTop: 24 }}>Fund Allocations</h3>
          {canAllocate && (
            <form className="inline-form" onSubmit={handleAllocate}>
              <label>
                Amount
                <input required type="number" min={0.01} step="0.01" value={allocAmount} onChange={(e) => setAllocAmount(e.target.value)} />
              </label>
              <label>
                Currency
                <input required value={allocCurrency} onChange={(e) => setAllocCurrency(e.target.value.toUpperCase())} placeholder="NPR" />
              </label>
              <label>
                Purpose
                <input
                  required
                  value={allocPurpose}
                  onChange={(e) => setAllocPurpose(e.target.value)}
                  placeholder="e.g. tents for Gosaikunda Ward 1"
                />
              </label>
              <button className="small-button" type="submit">
                Allocate
              </button>
            </form>
          )}
          {allocations.length === 0 && <p className="empty-panel-note">No allocations recorded yet.</p>}
          {allocations.length > 0 && (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Amount</th>
                  <th>Purpose</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {allocations.map((a) => (
                  <tr key={a._id}>
                    <td>
                      {a.amount.toLocaleString()} {a.currency}
                    </td>
                    <td>{a.purpose}</td>
                    <td>{new Date(a.allocatedAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </section>
  );
}

/**
 * Supply Assistance (user requirement, 2026-09-04): Central opens a
 * request describing a shortfall against an approved Requirement once it
 * finds its own stock falls short; NGOs/INGOs offer quantities; Central
 * accepts or declines each offer, and an accepted offer converts straight
 * into inventory (the same pledge -> Resource pattern ContributionsPanel
 * uses above, reused here rather than reinvented).
 */
function SupplyAssistancePanel({ canCreate, canOffer, canDecide }: { canCreate: boolean; canOffer: boolean; canDecide: boolean }) {
  const [requests, setRequests] = useState<SupplyAssistanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [requirements, setRequirements] = useState<RequirementOption[]>([]);
  const [locations, setLocations] = useState<StorageLocationRow[]>([]);
  const [requirementId, setRequirementId] = useState('');
  const [quantityNeeded, setQuantityNeeded] = useState('');
  const [quantityGovernmentCommitted, setQuantityGovernmentCommitted] = useState('');
  const [unit, setUnit] = useState('');
  const [category, setCategory] = useState('');
  const [note, setNote] = useState('');
  const [offerQuantity, setOfferQuantity] = useState<Record<string, string>>({});
  const [acceptLocation, setAcceptLocation] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/supply-assistance');
      setRequests(res.data.supplyAssistanceRequests ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    if (canCreate) {
      api.get('/requirements', { params: { status: 'approved' } }).then((res) => setRequirements(res.data.requirements ?? []));
      api.get('/storage-locations').then((res) => setLocations(res.data.storageLocations ?? []));
    }
  }, [load, canCreate]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post('/supply-assistance', {
        requirementId,
        quantityNeeded: Number(quantityNeeded),
        quantityGovernmentCommitted: quantityGovernmentCommitted ? Number(quantityGovernmentCommitted) : undefined,
        unit,
        category,
        note: note || undefined,
      });
      setRequirementId('');
      setQuantityNeeded('');
      setQuantityGovernmentCommitted('');
      setUnit('');
      setCategory('');
      setNote('');
      await load();
    } catch (err) {
      setError(
        (err as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'Failed to open supply assistance request.',
      );
    }
  }

  async function handleOffer(requestId: string) {
    const quantity = Number(offerQuantity[requestId] ?? '');
    if (!quantity) return;
    await api.post(`/supply-assistance/${requestId}/offers`, { quantityOffered: quantity });
    setOfferQuantity((prev) => ({ ...prev, [requestId]: '' }));
    await load();
  }

  async function decide(requestId: string, offerId: string, decision: 'accepted' | 'declined') {
    await api.patch(`/supply-assistance/${requestId}/offers/${offerId}`, {
      decision,
      storageLocationId: decision === 'accepted' ? acceptLocation[offerId] : undefined,
    });
    await load();
  }

  return (
    <section className="panel">
      <h2>Supply Assistance</h2>
      <p className="empty-panel-note">
        When government stock falls short of an approved requirement, Central asks NGOs/INGOs to help cover the gap — accepted offers
        convert straight into inventory Central can allocate and dispatch.
      </p>
      {canCreate && (
        <form className="inline-form" onSubmit={handleCreate}>
          <label>
            Requirement
            <select required value={requirementId} onChange={(e) => setRequirementId(e.target.value)}>
              <option value="">Select…</option>
              {requirements.map((r) => (
                <option key={r._id} value={r._id}>
                  {r.cluster} / {r.category} ({r.quantityRequested})
                </option>
              ))}
            </select>
          </label>
          <label>
            Category
            <input required value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. bottled water" />
          </label>
          <label>
            Unit
            <input required value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="e.g. case" />
          </label>
          <label>
            Quantity needed from NGOs/INGOs
            <input required type="number" min={1} value={quantityNeeded} onChange={(e) => setQuantityNeeded(e.target.value)} />
          </label>
          <label>
            Government already sending (optional)
            <input
              type="number"
              min={0}
              value={quantityGovernmentCommitted}
              onChange={(e) => setQuantityGovernmentCommitted(e.target.value)}
            />
          </label>
          <label>
            Note (optional)
            <input value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <button className="small-button" type="submit">
            Request assistance
          </button>
        </form>
      )}
      {error && <div className="login-error">{error}</div>}
      {loading && <p className="empty-panel-note">Loading…</p>}
      {!loading && requests.length === 0 && <p className="empty-panel-note">No supply assistance requests yet.</p>}
      {requests.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Cluster / Category</th>
              <th>Needed</th>
              <th>Govt sending</th>
              <th>Status</th>
              <th>Offers</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r._id}>
                <td>
                  {r.cluster} / {r.category}
                </td>
                <td>
                  {r.quantityNeeded} {r.unit}
                </td>
                <td>
                  {r.quantityGovernmentCommitted} {r.unit}
                </td>
                <td>
                  <span className={`status-pill ${r.status === 'fulfilled' ? 'status-verified' : 'status-pending'}`}>{r.status}</span>
                </td>
                <td>
                  {r.offers.length === 0 && <p className="empty-panel-note" style={{ margin: 0 }}>No offers yet.</p>}
                  {r.offers.map((o) => (
                    <div key={o._id} style={{ marginBottom: 4 }}>
                      <span
                        className={`status-pill ${
                          o.status === 'accepted' ? 'status-verified' : o.status === 'declined' ? 'status-pending' : ''
                        }`}
                      >
                        {o.status}
                      </span>{' '}
                      {o.quantityOffered} {r.unit}
                      {canDecide && o.status === 'offered' && (
                        <>
                          {' '}
                          <select
                            value={acceptLocation[o._id] ?? ''}
                            onChange={(e) => setAcceptLocation((prev) => ({ ...prev, [o._id]: e.target.value }))}
                          >
                            <option value="">Location…</option>
                            {locations.map((l) => (
                              <option key={l._id} value={l._id}>
                                {l.name}
                              </option>
                            ))}
                          </select>
                          <button
                            className="small-button"
                            disabled={!acceptLocation[o._id]}
                            onClick={() => decide(r._id, o._id, 'accepted')}
                          >
                            Accept
                          </button>
                          <button className="small-button ghost" onClick={() => decide(r._id, o._id, 'declined')}>
                            Decline
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                  {canOffer && r.status === 'open' && (
                    <div>
                      <input
                        type="number"
                        min={1}
                        style={{ width: 80 }}
                        value={offerQuantity[r._id] ?? ''}
                        onChange={(e) => setOfferQuantity((prev) => ({ ...prev, [r._id]: e.target.value }))}
                      />
                      <button className="small-button" onClick={() => handleOffer(r._id)}>
                        Offer supplies
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export function Resources() {
  const { user } = useAuth();
  const [tab, setTab] = useState<ResourceTab>('overview');

  if (!user) return null;

  const isGovRole = ['central', 'district_cdo', 'municipality_ward'].includes(user.role);
  const isOrgRole = ['ngo_ingo', 'private_org'].includes(user.role);
  const isDonor = user.role === 'donor';

  const GOV_TABS: { key: ResourceTab; label: string }[] = [
    { key: 'overview', label: 'Resource Overview' },
    { key: 'government', label: 'Government Inventory' },
    { key: 'organization', label: 'Organization Inventory' },
    { key: 'storage', label: 'Regional Storage Units' },
    { key: 'available', label: 'Available Resources' },
    { key: 'allocated', label: 'Allocated Resources' },
    { key: 'reserved', label: 'Reserved Resources' },
    { key: 'contributions', label: 'Resource Contributions' },
    { key: 'cash-fund', label: 'Cash & Fund Donations' },
    { key: 'supply-assistance', label: 'Supply Assistance' },
  ];

  return (
    <div className="module-page">
      <ModuleHeader />

      {isGovRole && (
        <section className="panel">
          <div className="tab-bar">
            {GOV_TABS.map((t) => (
              <button key={t.key} className={`tab-button ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)} type="button">
                {t.label}
              </button>
            ))}
          </div>
        </section>
      )}

      {isGovRole && tab === 'storage' && <StorageLocationsPanel canManage />}
      {isGovRole && tab === 'contributions' && <ContributionsPanel canSubmit canVerify={user.role === 'central'} />}
      {isGovRole && tab === 'cash-fund' && (
        <CashDonationsPanel
          canSubmit
          canVerify={user.role === 'central'}
          canAllocate={user.role === 'central'}
          isGovRole
        />
      )}
      {isGovRole && tab === 'supply-assistance' && (
        <SupplyAssistancePanel canCreate={user.role === 'central'} canOffer={false} canDecide={user.role === 'central'} />
      )}
      {isGovRole && !['storage', 'contributions', 'cash-fund', 'supply-assistance'].includes(tab) && (
        <InventoryPanel tab={tab} canAdd={tab === 'overview' || tab === 'government'} ownerLabel="Resource Inventory" />
      )}

      {isOrgRole && (
        <>
          <InventoryPanel tab="organization" canAdd ownerLabel="My Organization's Inventory" />
          <ContributionsPanel canSubmit canVerify={false} />
          <CashDonationsPanel canSubmit canVerify={false} canAllocate={false} isGovRole={false} />
          <SupplyAssistancePanel canCreate={false} canOffer canDecide={false} />
        </>
      )}

      {isDonor && (
        <>
          <ContributionsPanel canSubmit canVerify={false} />
          <CashDonationsPanel canSubmit canVerify={false} canAllocate={false} isGovRole={false} />
        </>
      )}
    </div>
  );
}
