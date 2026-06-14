import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

/**
 * Wraps a route and redirects unauthenticated users to /login.
 * If `roles` is provided, also checks that the user's role is in the list.
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

  // Logged in but wrong role
  if (roles.length > 0 && !roles.includes(role)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-900">
        <div className="glass-card max-w-sm text-center p-8 space-y-4">
          <div className="text-5xl">🚫</div>
          <h2 className="text-xl font-bold text-white">Access Denied</h2>
          <p className="text-slate-400 text-sm">
            Your role (<span className="text-brand-400 font-semibold">{role}</span>) does not have
            permission to view this page.
          </p>
        </div>
      </div>
    );
  }

  return children;
}
