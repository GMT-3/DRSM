import { useCallback, useEffect, useState, FormEvent } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { MODULES } from '../config/modules';
import { ROLES, ROLE_LABELS } from '../types/roles';

const MOD = MODULES.find((m) => m.key === 'administration')!;

interface DisasterEventRow {
  _id: string;
  name: string;
  type: string;
  status: 'active' | 'closed';
  startDate: string;
}
interface CategoryRow {
  _id: string;
  kind: 'resource' | 'requirement';
  name: string;
  active: boolean;
}
interface UserRow {
  _id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
}

type AdminTab = 'boundaries' | 'events' | 'categories' | 'permissions';

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

function BoundariesPanel({ canManage }: { canManage: boolean }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await api.post('/admin/provinces', { name, code });
    setMessage(`Province "${name}" registered.`);
    setName('');
    setCode('');
  }

  return (
    <section className="panel">
      <h2>Locations &amp; Administrative Boundaries</h2>
      <p className="empty-panel-note">
        Province -&gt; District -&gt; Municipality -&gt; Ward -&gt; Site. Sites are managed from the Demographic module; this
        panel registers new national-reference boundaries (Central Government only).
      </p>
      {canManage && (
        <form className="inline-form" onSubmit={handleSubmit}>
          <label>
            Province name
            <input required value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            Code
            <input required value={code} onChange={(e) => setCode(e.target.value)} />
          </label>
          <button className="small-button" type="submit">
            Register province
          </button>
        </form>
      )}
      {message && <p className="empty-panel-note">{message}</p>}
    </section>
  );
}

function DisasterEventsPanel({ canManage }: { canManage: boolean }) {
  const [events, setEvents] = useState<DisasterEventRow[]>([]);
  const [name, setName] = useState('');
  const [type, setType] = useState('flood');
  const [startDate, setStartDate] = useState('');

  const load = useCallback(async () => {
    const res = await api.get('/admin/disaster-events');
    setEvents(res.data.events);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await api.post('/admin/disaster-events', { name, type, startDate });
    setName('');
    await load();
  }

  async function close(id: string) {
    await api.patch(`/admin/disaster-events/${id}/close`);
    await load();
  }

  return (
    <section className="panel">
      <h2>Disaster / Event Management</h2>
      {canManage && (
        <form className="inline-form" onSubmit={handleSubmit}>
          <label>
            Name
            <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Melamchi Flood 2026" />
          </label>
          <label>
            Type
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="flood">Flood</option>
              <option value="earthquake">Earthquake</option>
              <option value="landslide">Landslide</option>
              <option value="fire">Fire</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label>
            Start date
            <input required type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>
          <button className="small-button" type="submit">
            Create event
          </button>
        </form>
      )}
      {events.length === 0 && <p className="empty-panel-note">No disaster events recorded yet.</p>}
      {events.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Status</th>
              {canManage && <th></th>}
            </tr>
          </thead>
          <tbody>
            {events.map((ev) => (
              <tr key={ev._id}>
                <td>{ev.name}</td>
                <td>{ev.type}</td>
                <td>
                  <span className={`status-pill ${ev.status === 'active' ? 'status-pending' : 'status-verified'}`}>{ev.status}</span>
                </td>
                {canManage && (
                  <td>
                    {ev.status === 'active' && (
                      <button className="small-button ghost" onClick={() => close(ev._id)}>
                        Close event
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

function CategoriesPanel({ canManage }: { canManage: boolean }) {
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [kind, setKind] = useState<'resource' | 'requirement'>('resource');
  const [name, setName] = useState('');

  const load = useCallback(async () => {
    // includeInactive so this management screen also lists categories a
    // government admin previously removed, with a way to bring them back.
    const res = await api.get('/admin/categories', { params: { includeInactive: 'true' } });
    setCategories(res.data.categories ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await api.post('/admin/categories', { kind, name });
    setName('');
    await load();
  }

  async function setActive(id: string, active: boolean) {
    await api.patch(`/admin/categories/${id}/active`, { active });
    await load();
  }

  return (
    <section className="panel">
      <h2>Resource &amp; Requirement Categories</h2>
      <p className="empty-panel-note">
        Classifications available when registering inventory (e.g. Food, Shelter, Medicine, Electronics) or a requirement. Central
        government can add new categories here, or remove one so it no longer appears as an option — removing a category never affects
        records that already used it.
      </p>
      {canManage && (
        <form className="inline-form" onSubmit={handleSubmit}>
          <label>
            Kind
            <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
              <option value="resource">Resource</option>
              <option value="requirement">Requirement</option>
            </select>
          </label>
          <label>
            Name
            <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. water purification tablets" />
          </label>
          <button className="small-button" type="submit">
            Add category
          </button>
        </form>
      )}
      {categories.length === 0 && <p className="empty-panel-note">No categories defined yet.</p>}
      {categories.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Kind</th>
              <th>Name</th>
              <th>Status</th>
              {canManage && <th></th>}
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => (
              <tr key={c._id}>
                <td>{c.kind}</td>
                <td>{c.name}</td>
                <td>
                  <span className={`status-pill ${c.active ? 'status-verified' : 'status-pending'}`}>{c.active ? 'active' : 'removed'}</span>
                </td>
                {canManage && (
                  <td>
                    <button className="small-button ghost" onClick={() => setActive(c._id, !c.active)}>
                      {c.active ? 'Remove' : 'Restore'}
                    </button>
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

function PermissionsPanel({ canManage }: { canManage: boolean }) {
  const [users, setUsers] = useState<UserRow[]>([]);

  const load = useCallback(async () => {
    const res = await api.get('/admin/users');
    setUsers(res.data.users);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function changeRole(id: string, role: string) {
    await api.patch(`/admin/users/${id}/role`, { role });
    await load();
  }

  return (
    <section className="panel">
      <h2>User Permissions</h2>
      {users.length === 0 && <p className="empty-panel-note">No accounts visible in your scope.</p>}
      {users.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              {canManage && <th></th>}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u._id}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>{ROLE_LABELS[u.role as keyof typeof ROLE_LABELS] ?? u.role}</td>
                {canManage && (
                  <td>
                    <select defaultValue={u.role} onChange={(e) => changeRole(u._id, e.target.value)}>
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
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

export function Administration() {
  const { user } = useAuth();
  const [tab, setTab] = useState<AdminTab>('boundaries');

  if (!user) return null;

  const isCentral = user.role === 'central';
  const TABS: { key: AdminTab; label: string }[] = [
    { key: 'boundaries', label: 'Locations & Boundaries' },
    { key: 'events', label: 'Disaster / Event Management' },
    { key: 'categories', label: 'Resource & Requirement Categories' },
    { key: 'permissions', label: 'User Permissions' },
  ];

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

      {tab === 'boundaries' && <BoundariesPanel canManage={isCentral} />}
      {tab === 'events' && <DisasterEventsPanel canManage={isCentral} />}
      {tab === 'categories' && <CategoriesPanel canManage />}
      {tab === 'permissions' && <PermissionsPanel canManage={isCentral} />}
    </div>
  );
}
