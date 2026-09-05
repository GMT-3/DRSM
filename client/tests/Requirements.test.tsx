import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import * as AuthContext from '../src/context/AuthContext';
import { Requirements } from '../src/pages/Requirements';

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

const SAMPLE_REQUIREMENTS = [
  {
    _id: 'req-1',
    siteId: 'site-1',
    cluster: 'wash',
    category: 'bottled water',
    quantityRequested: 100,
    status: 'submitted',
    priorityScore: 62,
    submittedAt: new Date().toISOString(),
  },
];

describe('Requirements module — role dispatch (Modules.md, Roles.md)', () => {
  it('shows the submission form and the tab bar for a volunteer', async () => {
    mockUser('volunteer');
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/geo/sites') return Promise.resolve({ data: { sites: [] } });
      if (url === '/requirements') return Promise.resolve({ data: { requirements: SAMPLE_REQUIREMENTS } });
      return Promise.resolve({ data: {} });
    });

    render(<Requirements />);

    expect(await screen.findByText('New Requirement')).toBeInTheDocument();
    expect(screen.getByText('Requirement Overview')).toBeInTheDocument();
    expect(screen.getByText('Pending Approval')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('bottled water')).toBeInTheDocument());
  });

  it('shows Approve/Reject actions on a pending requirement for a municipality_ward reviewer, but no submission form', async () => {
    mockUser('municipality_ward');
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/geo/sites') return Promise.resolve({ data: { sites: [] } });
      if (url === '/requirements') return Promise.resolve({ data: { requirements: SAMPLE_REQUIREMENTS } });
      return Promise.resolve({ data: {} });
    });

    render(<Requirements />);

    expect(screen.queryByText('New Requirement')).not.toBeInTheDocument();
    expect(await screen.findByText('Approve')).toBeInTheDocument();
    expect(screen.getByText('Reject')).toBeInTheDocument();
  });

  it('shows the not-shared note for an organization role', async () => {
    mockUser('donor');

    render(<Requirements />);

    expect(await screen.findByText(/isn.t shared with organizations directly/)).toBeInTheDocument();
  });

  it('lets a reviewer open the Requirement History tab and view a requirement\'s trace (Roles.md "Tracking — the core requirement")', async () => {
    mockUser('municipality_ward');
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/geo/sites') return Promise.resolve({ data: { sites: [] } });
      if (url === '/requirements') return Promise.resolve({ data: { requirements: SAMPLE_REQUIREMENTS } });
      if (url === '/requirements/req-1/trace') {
        return Promise.resolve({
          data: {
            currentStage: 'approved',
            timeline: [
              { stage: 'submitted', label: 'Submitted', at: new Date().toISOString() },
              { stage: 'approved', label: 'Approved', at: new Date().toISOString() },
            ],
            scopeNote: 'Tracked through Municipality/Ward confirming receipt of this allocation.',
          },
        });
      }
      return Promise.resolve({ data: {} });
    });

    render(<Requirements />);

    fireEvent.click(await screen.findByText('Requirement History'));
    expect(await screen.findByText('bottled water')).toBeInTheDocument();

    fireEvent.click(screen.getByText('View trace'));

    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/requirements/req-1/trace'));
    expect(await screen.findByText(/Tracked through Municipality\/Ward confirming receipt/)).toBeInTheDocument();
  });
});
