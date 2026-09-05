import { NavLink } from 'react-router-dom';
import { Home, ShieldAlert, TriangleAlert } from 'lucide-react';
import { modulesForRole } from '../config/modules';
import { useAuth } from '../context/AuthContext';

// Placeholder notices until module 9 (Administration) writes real Notice
// documents and module 5 surfaces them live — Design.md specifies this
// panel is visible from anywhere in the app, not just the dashboard.
const PLACEHOLDER_NOTICES = [
  'River level rising in Koshi Province',
  'Road blocked at Araniko Highway',
];

export function Sidebar() {
  const { user } = useAuth();
  const modules = user ? modulesForRole(user.role) : [];

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <ShieldAlert size={22} strokeWidth={2.5} />
        <span>DRMS</span>
      </div>

      <nav className="sidebar-nav">
        <NavLink to="/" end className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}>
          <Home size={16} />
          <span>Dashboard</span>
        </NavLink>

        {modules.map((m) => (
          <NavLink key={m.key} to={m.path} className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}>
            <span className="module-dot" style={{ background: m.color }}>
              {m.id}
            </span>
            <span>{m.name}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-notices">
        <div className="sidebar-notices-title">Important Notices</div>
        {PLACEHOLDER_NOTICES.map((n) => (
          <div key={n} className="sidebar-notice">
            <TriangleAlert size={14} />
            <span>{n}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}
