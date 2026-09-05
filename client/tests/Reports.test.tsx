import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import * as AuthContext from '../src/context/AuthContext';
import { Reports } from '../src/pages/Reports';

vi.mock('../src/api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
  API_BASE_URL: '/api',
  getAccessToken: () => 'test-token',
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

describe('Reports module — role dispatch (Modules.md module 8)', () => {
  it('shows the report type tab bar and data for central government', async () => {
    mockUser('central');
    vi.mocked(api.get).mockResolvedValue({ data: { rows: [{ cluster: 'wash', category: 'water', status: 'submitted' }] } });

    render(<Reports />);

    expect(await screen.findByText('Export CSV')).toBeInTheDocument();
    expect(screen.getByText('Requirement Reports')).toBeInTheDocument();
    expect(screen.getAllByText('Unfulfilled Requirements').length).toBeGreaterThan(0);
  });

  it('restricts the module to government roles', async () => {
    mockUser('ngo_ingo');
    vi.mocked(api.get).mockResolvedValue({ data: { rows: [] } });

    render(<Reports />);

    expect(await screen.findByText('Reports & Analytics is restricted to government roles.')).toBeInTheDocument();
  });
});
