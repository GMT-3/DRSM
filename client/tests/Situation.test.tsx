import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import * as AuthContext from '../src/context/AuthContext';
import { Situation } from '../src/pages/Situation';

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

describe('Situation module — role dispatch (Modules.md module 5, Roles.md coordination view)', () => {
  it('renders the coordination panels for central government', async () => {
    mockUser('central');
    vi.mocked(api.get).mockResolvedValue({
      data: {
        criticalLocations: [{ siteId: 's1', siteName: 'Timure', maxPriorityScore: 85, openRequirementCount: 3 }],
        outstandingRequirements: { count: 1, byCluster: [{ cluster: 'wash', count: 1, quantityRequested: 100 }] },
        resourceGaps: [{ cluster: 'wash', gap: 40 }],
        supplyDemand: [{ cluster: 'wash', requested: 100, committed: 60, delivered: 0 }],
        delayedActions: [],
      },
    });

    render(<Situation />);

    expect(await screen.findByText('Critical Locations')).toBeInTheDocument();
    expect(screen.getByText('Timure')).toBeInTheDocument();
    expect(screen.getByText('Supply-Demand Status')).toBeInTheDocument();
  });

  it("shows the shared coordination view for an NGO role too (Roles.md's explicit grant)", async () => {
    mockUser('ngo_ingo');
    vi.mocked(api.get).mockResolvedValue({
      data: {
        criticalLocations: [],
        outstandingRequirements: { count: 0, byCluster: [] },
        resourceGaps: [],
        supplyDemand: [],
        delayedActions: [],
      },
    });

    render(<Situation />);

    expect(await screen.findByText('Critical Locations')).toBeInTheDocument();
  });

  it('shows a not-shared note for a donor', async () => {
    mockUser('donor');
    vi.mocked(api.get).mockResolvedValue({ data: { notShared: true } });

    render(<Situation />);

    expect(await screen.findByText(/isn.t shared with donors directly/)).toBeInTheDocument();
  });
});
