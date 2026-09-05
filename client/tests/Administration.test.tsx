import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import * as AuthContext from '../src/context/AuthContext';
import { Administration } from '../src/pages/Administration';

vi.mock('../src/api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
import { api } from '../src/api/client';

afterEach(() => {
  vi.restoreAllMocks();
});

function mockUser(role: string) {
  vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
    user: { id: 'u1', name: 'Test User', email: 't@test.local', role: role as never, loginType: 'own_email', scope: {} },
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
    adoptSession: vi.fn(),
  });
}

function defaultApiGet(url: string) {
  if (url === '/admin/disaster-events') return Promise.resolve({ data: { events: [] } });
  if (url === '/admin/categories') return Promise.resolve({ data: { categories: [] } });
  if (url === '/admin/users') return Promise.resolve({ data: { users: [] } });
  return Promise.resolve({ data: {} });
}

describe('Administration module — role dispatch (Modules.md module 9)', () => {
  it('shows the full tab bar with boundary management for central government', async () => {
    mockUser('central');
    vi.mocked(api.get).mockImplementation(defaultApiGet);

    render(<Administration />);

    expect(await screen.findByText('Locations & Boundaries')).toBeInTheDocument();
    expect(screen.getByText('Register province')).toBeInTheDocument();
  });

  it('shows a read-only boundaries note for a municipality_ward officer', async () => {
    mockUser('municipality_ward');
    vi.mocked(api.get).mockImplementation(defaultApiGet);

    render(<Administration />);

    expect(await screen.findByText('Locations & Boundaries')).toBeInTheDocument();
    expect(screen.queryByText('Register province')).not.toBeInTheDocument();
  });
});
