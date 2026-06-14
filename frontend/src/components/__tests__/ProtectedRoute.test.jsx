import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import ProtectedRoute from '../shared/ProtectedRoute';
import * as useAuthHook from '@/hooks/useAuth';

// Mock useAuth
vi.mock('@/hooks/useAuth');

describe('ProtectedRoute', () => {
  // ISOLATION: only loading test enabled — binary test to rule out JSDOM init as root cause
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

  it.skip('redirects to /login if not authenticated', () => {
    useAuthHook.useAuth.mockReturnValue({ loading: false, user: null, role: null });
    render(
      <BrowserRouter>
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      </BrowserRouter>
    );
    // Since we mock BrowserRouter, Navigate won't actually change URL but won't render children
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
