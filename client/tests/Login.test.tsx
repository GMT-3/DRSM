import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Login } from '../src/pages/Login';
import * as AuthContext from '../src/context/AuthContext';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Login page', () => {
  it('renders email/password fields and a sign-in button', () => {
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: null,
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
      adoptSession: vi.fn(),
    });

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );

    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('calls login with the entered credentials and shows an error on failure', async () => {
    const loginMock = vi.fn().mockRejectedValue(new Error('bad credentials'));
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: null,
      loading: false,
      login: loginMock,
      logout: vi.fn(),
      adoptSession: vi.fn(),
    });

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'cdo.rasuwa@drms.gov.np' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong-password' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(loginMock).toHaveBeenCalledWith('cdo.rasuwa@drms.gov.np', 'wrong-password');
    await waitFor(() => expect(screen.getByText(/invalid email or password/i)).toBeInTheDocument());
  });

  it('redirects away from /login when already authenticated', () => {
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: {
        id: 'u1',
        name: 'CDO Admin',
        email: 'cdo.rasuwa@drms.gov.np',
        role: 'district_cdo',
        loginType: 'gov_email',
        scope: {},
      },
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
      adoptSession: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Login />
      </MemoryRouter>,
    );

    // Navigate renders nothing itself — the important assertion is that the
    // login form is NOT shown to an already-authenticated user.
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
  });
});
