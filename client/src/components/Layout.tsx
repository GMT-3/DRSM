import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

export function Layout() {
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="app-main">
        <Header />
        <main className="app-content">
          <Outlet />
        </main>
        <footer className="app-footer">
          Better Information. Better Coordination. Better Response. Saving Lives.
        </footer>
      </div>
    </div>
  );
}
