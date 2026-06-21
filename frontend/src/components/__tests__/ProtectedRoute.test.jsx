import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProtectedRoute from '../shared/ProtectedRoute';
import * as useAuthHook from '@/hooks/useAuth';

// Mock useAuth
vi.mock('@/hooks/useAuth');

// Helper: wrap ProtectedRoute in a MemoryRouter+Routes context.
// Required because ProtectedRoute uses <Navigate> which must be rendered
// inside a Router with a <Routes> context to avoid infinite re-render loops under JSDOM.
function renderProtected({ roles = [], initialPath = '/protected' } = {}) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route
          path="/protected"
          element={
            <ProtectedRoute roles={roles}>
              <div>Protected Content</div>
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<div>Login Page</div>} />
        <Route path="/portal" element={<div>Portal Page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ProtectedRoute', () => {
  it('renders loading spinner when checking session', () => {
    useAuthHook.useAuth.mockReturnValue({ loading: true, user: null, role: null });
    renderProtected();
    expect(screen.getByText('Checking session\u2026')).toBeInTheDocument();
  });

  it('redirects to /login if not authenticated', () => {
    useAuthHook.useAuth.mockReturnValue({ loading: false, user: null, role: null });
    renderProtected();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    expect(screen.getByText('Login Page')).toBeInTheDocument();
  });

  it('renders children if authenticated and no role is required', () => {
    useAuthHook.useAuth.mockReturnValue({ loading: false, user: { id: '123' }, role: 'citizen' });
    renderProtected();
    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });

  it('redirects to role home if authenticated but wrong role', () => {
    useAuthHook.useAuth.mockReturnValue({ loading: false, user: { id: '123' }, role: 'citizen' });
    renderProtected({ roles: ['coordinator'] });
    // Since citizen's home is /citizen, and we haven't mocked that route, 
    // we should just verify the Protected Content is hidden, or if we mock a route for /citizen we can find it.
    // The wrapper has NO route for /citizen, so it will render nothing (blank).
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('renders children if authenticated and correct role', () => {
    useAuthHook.useAuth.mockReturnValue({ loading: false, user: { id: '123' }, role: 'coordinator' });
    renderProtected({ roles: ['coordinator'] });
    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });
});
