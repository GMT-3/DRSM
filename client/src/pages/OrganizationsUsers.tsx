import { useCallback, useEffect, useState, FormEvent } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { MODULES } from '../config/modules';

const MOD = MODULES.find((m) => m.key === 'organizations')!;

interface OrganizationRow {
  _id: string;
  name: string;
  type: string;
  verificationStatus: 'unverified' | 'pending' | 'verified';
  createdAt?: string;
}

interface FieldPersonnelRow {
  _id: string;
  name: string;
  email: string;
  role: 'volunteer' | 'police' | 'army';
  category: string;
  active: boolean;
  scope: { municipalityId?: string; wardId?: string };
}

interface WardOption {
  _id: string;
  wardNumber: number;
}

interface DistrictOption {
  _id: string;
  name: string;
}

const FIELD_CATEGORIES = ['medicine', 'food', 'clothes', 'water', 'shelter', 'security', 'logistics', 'other'];

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

/** Central: organization verification queue. */
function OrganizationVerificationQueue() {
  const [orgs, setOrgs] = useState<OrganizationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/organizations');
      setOrgs(res.data.organizations);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function verify(id: string, decision: 'verified' | 'unverified') {
    setBusyId(id);
    try {
      await api.patch(`/organizations/${id}/verify`, { decision });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="panel">
      <h2>Organization Verification</h2>
      {loading && <p className="empty-panel-note">Loading…</p>}
      {!loading && orgs.length === 0 && <p className="empty-panel-note">No organizations registered yet.</p>}
      {orgs.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {orgs.map((o) => (
              <tr key={o._id}>
                <td>{o.name}</td>
                <td>{o.type}</td>
                <td>
                  <span className={`status-pill status-${o.verificationStatus}`}>{o.verificationStatus}</span>
                </td>
                <td>
                  {o.verificationStatus !== 'verified' ? (
                    <button className="small-button" disabled={busyId === o._id} onClick={() => verify(o._id, 'verified')}>
                      Verify
                    </button>
                  ) : (
                    <button className="small-button ghost" disabled={busyId === o._id} onClick={() => verify(o._id, 'unverified')}>
                      Revoke
                    </button>
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

/** Central: create District/CDO or Municipality/Ward accounts. */
function GovAccountForm() {
  const [role, setRole] = useState<'district_cdo' | 'municipality_ward'>('district_cdo');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [districts, setDistricts] = useState<DistrictOption[]>([]);
  const [municipalities, setMunicipalities] = useState<DistrictOption[]>([]);
  const [districtId, setDistrictId] = useState('');
  const [municipalityId, setMunicipalityId] = useState('');
  const [result, setResult] = useState<{ email: string; tempPassword: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get('/geo/districts').then((res) => setDistricts(res.data.districts));
  }, []);

  useEffect(() => {
    if (role === 'municipality_ward') {
      api.get('/geo/municipalities').then((res) => setMunicipalities(res.data.municipalities));
    }
  }, [role]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setSubmitting(true);
    try {
      const res = await api.post('/users/gov-accounts', {
        name,
        email,
        role,
        districtId: role === 'district_cdo' ? districtId : undefined,
        municipalityId: role === 'municipality_ward' ? municipalityId : undefined,
      });
      setResult({ email: res.data.user.email, tempPassword: res.data.tempPassword });
      setName('');
      setEmail('');
    } catch (err) {
      setError((err as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'Failed to create account.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="panel">
      <h2>Create Government Account</h2>
      <form className="inline-form" onSubmit={handleSubmit}>
        <label>
          Role
          <select value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
            <option value="district_cdo">District / CDO</option>
            <option value="municipality_ward">Municipality / Ward</option>
          </select>
        </label>
        <label>
          Name
          <input required value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Government email
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        {role === 'district_cdo' ? (
          <label>
            District
            <select required value={districtId} onChange={(e) => setDistrictId(e.target.value)}>
              <option value="">Select a district…</option>
              {districts.map((d) => (
                <option key={d._id} value={d._id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label>
            Municipality
            <select required value={municipalityId} onChange={(e) => setMunicipalityId(e.target.value)}>
              <option value="">Select a municipality…</option>
              {municipalities.map((m) => (
                <option key={m._id} value={m._id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <button className="small-button" type="submit" disabled={submitting}>
          {submitting ? 'Creating…' : 'Create account'}
        </button>
      </form>
      {error && <div className="login-error">{error}</div>}
      {result && (
        <div className="temp-credential-box">
          Account created for <strong>{result.email}</strong>. Temporary password (shown once — share it
          with the appointee out-of-band): <code>{result.tempPassword}</code>
        </div>
      )}
    </section>
  );
}

/** Municipality/Ward: appoint Volunteer/Police/Army + manage the roster. */
function FieldPersonnelPanel() {
  const [roster, setRoster] = useState<FieldPersonnelRow[]>([]);
  const [wards, setWards] = useState<WardOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'volunteer' | 'police' | 'army'>('volunteer');
  const [category, setCategory] = useState('food');
  const [wardId, setWardId] = useState('');
  const [result, setResult] = useState<{ email: string; tempPassword: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rosterRes, wardsRes] = await Promise.all([api.get('/users/field-personnel'), api.get('/geo/wards')]);
      setRoster(rosterRes.data.users);
      setWards(wardsRes.data.wards);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setSubmitting(true);
    try {
      const res = await api.post('/users/field-personnel', { name, email, role, category, wardId });
      setResult({ email: res.data.user.email, tempPassword: res.data.tempPassword });
      setName('');
      setEmail('');
      await load();
    } catch (err) {
      setError((err as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'Failed to appoint.');
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(id: string, nextActive: boolean) {
    setBusyId(id);
    try {
      await api.patch(`/users/field-personnel/${id}/active`, { active: nextActive });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <section className="panel">
        <h2>Appoint Field Personnel</h2>
        <form className="inline-form" onSubmit={handleSubmit}>
          <label>
            Name
            <input required value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            Email
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label>
            Role
            <select value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
              <option value="volunteer">Volunteer</option>
              <option value="police">Police</option>
              <option value="army">Army</option>
            </select>
          </label>
          <label>
            Category
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {FIELD_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label>
            Ward
            <select required value={wardId} onChange={(e) => setWardId(e.target.value)}>
              <option value="">Select a ward…</option>
              {wards.map((w) => (
                <option key={w._id} value={w._id}>
                  Ward {w.wardNumber}
                </option>
              ))}
            </select>
          </label>
          <button className="small-button" type="submit" disabled={submitting}>
            {submitting ? 'Appointing…' : 'Appoint'}
          </button>
        </form>
        {error && <div className="login-error">{error}</div>}
        {result && (
          <div className="temp-credential-box">
            Appointed <strong>{result.email}</strong>. Temporary password (shown once): <code>{result.tempPassword}</code>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>Field Personnel Roster</h2>
        {loading && <p className="empty-panel-note">Loading…</p>}
        {!loading && roster.length === 0 && <p className="empty-panel-note">No field personnel appointed yet.</p>}
        {roster.length > 0 && (
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Category</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {roster.map((u) => (
                <tr key={u._id}>
                  <td>
                    {u.name}
                    <div className="table-subtext">{u.email}</div>
                  </td>
                  <td>{u.role}</td>
                  <td>{u.category}</td>
                  <td>
                    <span className={`status-pill ${u.active ? 'status-verified' : 'status-unverified'}`}>
                      {u.active ? 'active' : 'inactive'}
                    </span>
                  </td>
                  <td>
                    <button
                      className="small-button ghost"
                      disabled={busyId === u._id}
                      onClick={() => toggleActive(u._id, !u.active)}
                    >
                      {u.active ? 'Deactivate' : 'Reactivate'}
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

/** District/CDO: read-only field-personnel visibility across their district. */
function DistrictFieldRosterReadOnly() {
  const [roster, setRoster] = useState<FieldPersonnelRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get('/users/field-personnel')
      .then((res) => setRoster(res.data.users))
      .finally(() => setLoading(false));
  }, []);

  return (
    <section className="panel">
      <h2>Field Personnel (District)</h2>
      {loading && <p className="empty-panel-note">Loading…</p>}
      {!loading && roster.length === 0 && <p className="empty-panel-note">No field personnel in your district yet.</p>}
      {roster.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th>Category</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {roster.map((u) => (
              <tr key={u._id}>
                <td>{u.name}</td>
                <td>{u.role}</td>
                <td>{u.category}</td>
                <td>
                  <span className={`status-pill ${u.active ? 'status-verified' : 'status-unverified'}`}>
                    {u.active ? 'active' : 'inactive'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/** NGO/INGO/Private Org/Donor: their own organization + verification status. */
function OwnOrganizationView() {
  const [org, setOrg] = useState<OrganizationRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get('/organizations')
      .then((res) => setOrg(res.data.organizations[0] ?? null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <section className="panel">
      <h2>Your Organization</h2>
      {loading && <p className="empty-panel-note">Loading…</p>}
      {!loading && !org && (
        <p className="empty-panel-note">
          No organization on file for your account (individual donor accounts have none).
        </p>
      )}
      {org && (
        <div>
          <p style={{ margin: '0 0 8px' }}>
            <strong>{org.name}</strong> — {org.type}
          </p>
          <span className={`status-pill status-${org.verificationStatus}`}>{org.verificationStatus}</span>
          {org.verificationStatus !== 'verified' && (
            <p className="empty-panel-note" style={{ marginTop: 10 }}>
              Central Government reviews new registrations before contributions count as confirmed
              inventory (Roles.md). This can take a few days.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

export function OrganizationsUsers() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <div>
      <ModuleHeader />
      {user.role === 'central' && (
        <>
          <OrganizationVerificationQueue />
          <GovAccountForm />
        </>
      )}
      {user.role === 'municipality_ward' && <FieldPersonnelPanel />}
      {user.role === 'district_cdo' && <DistrictFieldRosterReadOnly />}
      {['ngo_ingo', 'private_org', 'donor'].includes(user.role) && <OwnOrganizationView />}
      {['volunteer', 'police', 'army'].includes(user.role) && (
        <section className="panel">
          <p className="empty-panel-note">
            Organization and user management is handled by your Municipality/Ward office — nothing to
            manage here for your role.
          </p>
        </section>
      )}
    </div>
  );
}
