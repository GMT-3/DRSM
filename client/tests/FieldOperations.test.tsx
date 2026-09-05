import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import * as AuthContext from '../src/context/AuthContext';
import { FieldOperations } from '../src/pages/FieldOperations';

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
  if (url === '/notices') return Promise.resolve({ data: { notices: [] } });
  if (url === '/field-reports') return Promise.resolve({ data: { reports: [] } });
  if (url === '/priority-cases') return Promise.resolve({ data: { priorityCases: [] } });
  if (url === '/geo/sites') return Promise.resolve({ data: { sites: [] } });
  return Promise.resolve({ data: {} });
}

describe('FieldOperations module — role dispatch (Modules.md module 6)', () => {
  it('shows the field-report submission form for a volunteer', async () => {
    mockUser('volunteer');
    vi.mocked(api.get).mockImplementation(defaultApiGet);

    render(<FieldOperations />);

    expect(await screen.findByText('Field Reports')).toBeInTheDocument();
    expect(screen.getByText('Submit report')).toBeInTheDocument();
    expect(screen.getByText('Report emergency')).toBeInTheDocument();
  });

  it('shows priority case management controls for central government, without a field-report submission form', async () => {
    mockUser('central');
    vi.mocked(api.get).mockImplementation(defaultApiGet);

    render(<FieldOperations />);

    expect(await screen.findByText('Priority / Emergency Cases')).toBeInTheDocument();
    expect(screen.queryByText('Submit report')).not.toBeInTheDocument();
  });

  it("shows a not-shared note for an organization role", async () => {
    mockUser('ngo_ingo');

    render(<FieldOperations />);

    expect(await screen.findByText(/isn.t shared with organizations\/donors directly/)).toBeInTheDocument();
  });
});
