import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import * as AuthContext from '../src/context/AuthContext';
import { Resources } from '../src/pages/Resources';

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

const SAMPLE_RESOURCES = [
  { _id: 'res-1', ownerType: 'government', resourceType: 'rice', unit: 'kg', quantity: 500, state: 'available' },
];

const SAMPLE_CONTRIBUTIONS = [
  { _id: 'con-1', resourceType: 'medicine', quantity: 10, unit: 'box', verificationStatus: 'unverified', receivedAt: new Date().toISOString() },
];

const SAMPLE_SUPPLY_ASSISTANCE = [
  {
    _id: 'sa-1',
    requirementId: 'req-1',
    cluster: 'wash',
    category: 'bottled water',
    unit: 'case',
    quantityNeeded: 100,
    quantityGovernmentCommitted: 50,
    status: 'open',
    offers: [],
  },
];

function defaultApiGet(url: string) {
  if (url === '/resources') return Promise.resolve({ data: { resources: SAMPLE_RESOURCES } });
  if (url === '/resource-contributions') return Promise.resolve({ data: { contributions: SAMPLE_CONTRIBUTIONS } });
  if (url === '/storage-locations') return Promise.resolve({ data: { storageLocations: [] } });
  if (url === '/inventory-movements') return Promise.resolve({ data: { movements: [] } });
  if (url === '/supply-assistance') return Promise.resolve({ data: { supplyAssistanceRequests: SAMPLE_SUPPLY_ASSISTANCE } });
  if (url === '/requirements') return Promise.resolve({ data: { requirements: [] } });
  return Promise.resolve({ data: {} });
}

describe('Resources module — role dispatch (Modules.md, Roles.md)', () => {
  it('shows the full tab bar and government inventory for a central government user', async () => {
    mockUser('central');
    vi.mocked(api.get).mockImplementation(defaultApiGet);

    render(<Resources />);

    expect(await screen.findByText('Government Inventory')).toBeInTheDocument();
    expect(screen.getByText('Regional Storage Units')).toBeInTheDocument();
    expect(screen.getByText('Resource Contributions')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('rice')).toBeInTheDocument());
  });

  it("shows only this organization's inventory and contributions for an NGO role, with no verify controls", async () => {
    mockUser('ngo_ingo');
    vi.mocked(api.get).mockImplementation(defaultApiGet);

    render(<Resources />);

    expect(await screen.findByText("My Organization's Inventory")).toBeInTheDocument();
    expect(screen.getByText('Resource Contributions')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('medicine')).toBeInTheDocument());
    expect(screen.queryByText('Verify')).not.toBeInTheDocument();
  });

  it('shows only the contributions panel for a donor', async () => {
    mockUser('donor');
    vi.mocked(api.get).mockImplementation(defaultApiGet);

    render(<Resources />);

    expect(await screen.findByText('Resource Contributions')).toBeInTheDocument();
    expect(screen.queryByText('Government Inventory')).not.toBeInTheDocument();
    expect(screen.queryByText("My Organization's Inventory")).not.toBeInTheDocument();
  });

  it("shows the Supply Assistance tab for central, with the open request but no donor's create form for NGOs", async () => {
    mockUser('central');
    vi.mocked(api.get).mockImplementation(defaultApiGet);

    render(<Resources />);

    expect(await screen.findByText('Supply Assistance')).toBeInTheDocument();
  });

  it('lets an NGO see and offer against an open supply assistance request', async () => {
    mockUser('ngo_ingo');
    vi.mocked(api.get).mockImplementation(defaultApiGet);

    render(<Resources />);

    await waitFor(() => expect(screen.getByText('Offer supplies')).toBeInTheDocument());
  });
});
