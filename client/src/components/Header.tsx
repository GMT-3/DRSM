import { Bell, Wifi, WifiOff, ChevronDown } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useConnectivity } from '../context/ConnectivityContext';
import { useRealtime } from '../context/RealtimeContext';
import { ROLE_BADGE } from '../types/roles';

export function Header() {
  const { user, logout } = useAuth();
  const online = useConnectivity();
  const { unseenCount, clearUnseen, connected } = useRealtime();

  return (
    <header className="app-header">
      <div className="app-header-title">
        <h1>DISASTER RESPONSE MANAGEMENT SYSTEM</h1>
        <p>One Integrated System. Real-time Information. Faster Decisions. Better Response.</p>
      </div>

      <div className="app-header-actions">
        <button
          className="icon-button"
          aria-label="Notifications"
          title={connected ? 'Live updates connected' : 'Live updates unavailable'}
          onClick={clearUnseen}
        >
          <Bell size={18} />
          <span className="notif-badge">{unseenCount}</span>
        </button>

        <div className={`connectivity-indicator ${online ? 'online' : 'offline'}`} title={online ? 'Online' : 'Offline'}>
          {online ? <Wifi size={16} /> : <WifiOff size={16} />}
        </div>

        {user && (
          <div className="user-menu">
            <div className="user-avatar">{user.name.charAt(0).toUpperCase()}</div>
            <div className="user-meta">
              <span className="user-name">{user.name}</span>
              <span className="role-badge">{ROLE_BADGE[user.role]}</span>
            </div>
            <button className="icon-button" onClick={logout} title="Log out">
              <ChevronDown size={14} />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
