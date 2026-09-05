import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

type EntityKind = 'ngo' | 'ingo' | 'private' | 'donor_institutional' | 'donor_individual';

const ENTITY_OPTIONS: { value: EntityKind; label: string; needsOrgName: boolean }[] = [
  { value: 'ngo', label: 'NGO', needsOrgName: true },
  { value: 'ingo', label: 'INGO', needsOrgName: true },
  { value: 'private', label: 'Private Organization', needsOrgName: true },
  { value: 'donor_institutional', label: 'Institutional Donor', needsOrgName: true },
  { value: 'donor_individual', label: 'Individual Donor', needsOrgName: false },
];

// Public self-registration (Roles.md: NGO/INGO/Private Organizations and
// Donors register themselves; Volunteer/Police/Army and government
// accounts do NOT — those are appointed/created by an office, see
// OrganizationsUsers.tsx). Auto-adopts the returned session so a new
// registrant lands straight on their dashboard.
export function RegisterOrganization() {
  const navigate = useNavigate();
  const { adoptSession } = useAuth();

  const [entityKind, setEntityKind] = useState<EntityKind>('ngo');
  const [name, setName] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selected = ENTITY_OPTIONS.find((o) => o.value === entityKind)!;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.post('/organizations/register', {
        entityKind,
        name,
        organizationName: selected.needsOrgName ? organizationName : undefined,
        email,
        password,
      });
      adoptSession(res.data.accessToken, res.data.refreshToken, res.data.user);
      navigate('/');
    } catch (err) {
      const message =
        (err as { response?: { data?: { error?: string } } }).response?.data?.error ??
        'Registration failed. Please check your details and try again.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <ShieldAlert size={28} />
          <h1>DRMS</h1>
        </div>
        <p className="login-subtitle">Register as an NGO, INGO, Private Organization, or Donor</p>

        <form onSubmit={handleSubmit}>
          <label htmlFor="entityKind">Entity type</label>
          <select id="entityKind" value={entityKind} onChange={(e) => setEntityKind(e.target.value as EntityKind)}>
            {ENTITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          <label htmlFor="name">{selected.needsOrgName ? 'Contact person name' : 'Your name'}</label>
          <input id="name" required value={name} onChange={(e) => setName(e.target.value)} />

          {selected.needsOrgName && (
            <>
              <label htmlFor="organizationName">Organization name</label>
              <input
                id="organizationName"
                required
                value={organizationName}
                onChange={(e) => setOrganizationName(e.target.value)}
              />
            </>
          )}

          <label htmlFor="email">{selected.needsOrgName ? 'Company / organizational email' : 'Email'}</label>
          <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
          />

          {error && <div className="login-error">{error}</div>}

          <button type="submit" disabled={submitting}>
            {submitting ? 'Registering…' : 'Register'}
          </button>
        </form>

        <p className="login-footnote">
          Registrations start <strong>unverified</strong> — Central Government reviews and verifies
          organizations before their contributions count as confirmed inventory (Roles.md). Already
          have an account? <Link to="/login">Sign in</Link>.
        </p>
      </div>
    </div>
  );
}
