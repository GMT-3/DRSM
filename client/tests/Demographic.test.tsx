import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import * as AuthContext from '../src/context/AuthContext';
import { Demographic } from '../src/pages/Demographic';

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

describe('Demographic module — role dispatch (Modules.md, Roles.md)', () => {
  it('shows the offline household registration form for a volunteer', async () => {
    mockUser('volunteer');
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/geo/sites') return Promise.resolve({ data: { sites: [] } });
      if (url === '/households') return Promise.resolve({ data: { households: [] } });
      return Promise.resolve({ data: {} });
    });

    render(<Demographic />);

    expect(await screen.findByText('Register Household')).toBeInTheDocument();
    expect(screen.getByText(/head of household/i)).toBeInTheDocument();
    expect(screen.getByText(/Household members/)).toBeInTheDocument();
  });

  it('shows the population-status overview for central government', async () => {
    mockUser('central');
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/demographic/summary') {
        return Promise.resolve({
          data: {
            sites: [],
            aggregate: {
              totalPopulation: 5,
              byStatus: { normal: 3, stranded: 1, displaced: 1, missing: 0, rescued: 0, evacuated: 0 },
              byVulnerability: { pregnant: 0, recently_delivered: 0, child_under_5: 0, elderly: 0, disabled: 0, chronic_illness: 0 },
            },
          },
        });
      }
      return Promise.resolve({ data: {} });
    });

    render(<Demographic />);

    expect(await screen.findByText('Population Status')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('5')).toBeInTheDocument());
    expect(screen.getByText('Affected Locations & Site Status')).toBeInTheDocument();
  });

  it('shows the not-shared note for an organization role', async () => {
    mockUser('ngo_ingo');

    render(<Demographic />);

    expect(await screen.findByText(/isn.t shared with organizations directly/)).toBeInTheDocument();
  });
});
