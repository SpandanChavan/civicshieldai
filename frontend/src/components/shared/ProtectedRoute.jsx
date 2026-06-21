import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

// Maps each role to its home route (used for wrong-role redirects)
const ROLE_HOME = {
  coordinator: '/dashboard',
  citizen:     '/citizen',
  admin:       '/admin',
};

/**
 * Wraps a route and:
 * 1. Redirects unauthenticated users → /login (preserving intended destination)
 * 2. Redirects wrong-role users → their own home (instead of showing a dead-end error)
 *
 * @param {string[]} roles - Allowed roles. If empty/undefined, any logged-in user is allowed.
 */
export default function ProtectedRoute({ children, roles = [] }) {
  const { user, role, loading } = useAuth();
  const location = useLocation();

  // Still resolving session — show blank while checking
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-900">
        <div className="flex flex-col items-center gap-4">
          <div className="spinner w-8 h-8" />
          <p className="text-slate-400 text-sm">Checking session…</p>
        </div>
      </div>
    );
  }

  // Not logged in → redirect to login, preserving intended destination
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Logged in but wrong role → redirect to their correct home
  if (roles.length > 0 && !roles.includes(role)) {
    const home = ROLE_HOME[role] || '/portal';
    return <Navigate to={home} replace />;
  }

  return children;
}
