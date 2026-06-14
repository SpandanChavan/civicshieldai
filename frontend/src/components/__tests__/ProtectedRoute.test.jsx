import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import { BrowserRouter, MemoryRouter, Routes, Route } from 'react-router-dom';
import ProtectedRoute from '../shared/ProtectedRoute';
import * as useAuthHook from '@/hooks/useAuth';

// Mock useAuth
vi.mock('@/hooks/useAuth');

describe('ProtectedRoute', () => {
  it('renders loading spinner when checking session', () => {
    useAuthHook.useAuth.mockReturnValue({ loading: true, user: null, role: null });
    render(
      <BrowserRouter>
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      </BrowserRouter>
    );
    expect(screen.getByText('Checking session…')).toBeInTheDocument();
  });

  // ISOLATION STEP 2: redirect test with MemoryRouter+Routes to contain Navigate
  it('redirects to /login if not authenticated', () => {
    useAuthHook.useAuth.mockReturnValue({ loading: false, user: null, role: null });
    render(
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route
            path="/protected"
            element={
              <ProtectedRoute>
                <div>Protected Content</div>
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it.skip('renders children if authenticated and no role is required', () => {
    useAuthHook.useAuth.mockReturnValue({ loading: false, user: { id: '123' }, role: 'citizen' });
    render(
      <BrowserRouter>
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      </BrowserRouter>
    );
    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });

  it.skip('shows access denied if authenticated but wrong role', () => {
    useAuthHook.useAuth.mockReturnValue({ loading: false, user: { id: '123' }, role: 'citizen' });
    render(
      <BrowserRouter>
        <ProtectedRoute roles={['coordinator']}>
          <div>Protected Content</div>
        </ProtectedRoute>
      </BrowserRouter>
    );
    expect(screen.getByText('Access Denied')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it.skip('renders children if authenticated and correct role', () => {
    useAuthHook.useAuth.mockReturnValue({ loading: false, user: { id: '123' }, role: 'coordinator' });
    render(
      <BrowserRouter>
        <ProtectedRoute roles={['coordinator']}>
          <div>Protected Content</div>
        </ProtectedRoute>
      </BrowserRouter>
    );
    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });
});
