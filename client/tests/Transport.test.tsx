import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import * as AuthContext from '../src/context/AuthContext';
import { Transport } from '../src/pages/Transport';

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
  if (url === '/transport') return Promise.resolve({ data: { dispatches: [] } });
  if (url === '/vehicles') return Promise.resolve({ data: { vehicles: [] } });
  if (url === '/routes') return Promise.resolve({ data: { routes: [] } });
  if (url === '/distributions') return Promise.resolve({ data: { distributions: [] } });
  if (url === '/requirements') return Promise.resolve({ data: { requirements: [] } });
  if (url === '/resources') return Promise.resolve({ data: { resources: [] } });
  if (url === '/storage-locations') return Promise.resolve({ data: { storageLocations: [] } });
  if (url === '/households') return Promise.resolve({ data: { households: [] } });
  return Promise.resolve({ data: {} });
}

describe('Transport module — role dispatch (Modules.md, Roles.md)', () => {
  it('shows the full tab bar for a central government user', async () => {
    mockUser('central');
    vi.mocked(api.get).mockImplementation(defaultApiGet);

    render(<Transport />);

    expect(await screen.findByText('Dispatches / In Transit')).toBeInTheDocument();
    expect(screen.getByText('Vehicles & Transporters')).toBeInTheDocument();
    expect(screen.getByText('Routes & Conditions')).toBeInTheDocument();
    expect(screen.getByText('Delivery Confirmation')).toBeInTheDocument();
  });

  it('lets a volunteer see the tab bar and record a distribution, without a dispatch-creation form', async () => {
    mockUser('volunteer');
    vi.mocked(api.get).mockImplementation(defaultApiGet);

    render(<Transport />);

    expect(await screen.findByText('Dispatches / In Transit')).toBeInTheDocument();
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/transport'));
  });

  it('shows a not-shared note for a donor', async () => {
    mockUser('donor');

    render(<Transport />);

    expect(await screen.findByText(/aren't shared with donors directly/)).toBeInTheDocument();
  });
});
