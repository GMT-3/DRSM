import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from '../src/components/ProtectedRoute';
import * as AuthContext from '../src/context/AuthContext';

afterEach(() => {
  vi.restoreAllMocks();
});

// Roles.md/Design.md: an unauthenticated visitor must never see a scoped
// dashboard — this is the client-side half of that guarantee (the server
// enforces the real access control; see server/tests/unit/scope.unit.test.ts).
describe('ProtectedRoute', () => {
  it('redirects to /login when there is no logged-in user', () => {
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({ user: null, loading: false, login: vi.fn(), logout: vi.fn(), adoptSession: vi.fn() });

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/login" element={<div>Login Page</div>} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <div>Secret Dashboard</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Login Page')).toBeInTheDocument();
    expect(screen.queryByText('Secret Dashboard')).not.toBeInTheDocument();
  });

  it('shows a loading state instead of redirecting while auth is still resolving', () => {
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({ user: null, loading: true, login: vi.fn(), logout: vi.fn(), adoptSession: vi.fn() });

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/login" element={<div>Login Page</div>} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <div>Secret Dashboard</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.queryByText('Login Page')).not.toBeInTheDocument();
    expect(screen.queryByText('Secret Dashboard')).not.toBeInTheDocument();
  });

  it('renders the protected children when a user is present', () => {
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: {
        id: 'u1',
        name: 'Central Admin',
        email: 'central.admin@drms.gov.np',
        role: 'central',
        loginType: 'gov_admin',
        scope: {},
      },
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
      adoptSession: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <ProtectedRoute>
          <div>Secret Dashboard</div>
        </ProtectedRoute>
      </MemoryRouter>,
    );

    expect(screen.getByText('Secret Dashboard')).toBeInTheDocument();
  });
});
