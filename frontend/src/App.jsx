import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/hooks/useAuth';
import { useAuth } from '@/hooks/useAuth';
import ProtectedRoute from '@/components/shared/ProtectedRoute';
import Navbar from '@/components/shared/Navbar';
import PWAInstallBanner from '@/components/shared/PWAInstallBanner';

// Pages
import CoordinatorDashboard from '@/pages/CoordinatorDashboard';
import PublicPortal from '@/pages/PublicPortal';
import CitizenPortal from '@/pages/CitizenPortal';
import AdminDashboard from '@/pages/AdminDashboard';
import LandingPage from '@/pages/LandingPage';
import LoginPage from '@/pages/LoginPage';
import SignupPage from '@/pages/SignupPage';
import AdminCoordinators from '@/pages/AdminCoordinators';

import { useEffect } from 'react';
import { registerAndSubscribeToPush } from '@/utils/pushService';
import { useDisasterEvents } from '@/hooks/useDisasterEvents';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      refetchInterval: 5 * 60 * 1000,
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
      throwOnError: false,
    },
    mutations: {
      throwOnError: false,
    },
  },
});

// ── Redirect coordinators/admins away from the public portal ────────────────
function RoleGuardedPortal({ children }) {
  const { user, role, loading } = useAuth();
  if (loading) return null; // wait silently
  const ROLE_HOME = { coordinator: '/dashboard', admin: '/admin' };
  if (user && ROLE_HOME[role]) return <Navigate to={ROLE_HOME[role]} replace />;
  return children;
}

export default function App() {
  useEffect(() => {
    registerAndSubscribeToPush();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          {/* Always-on global event fetcher — keeps the store alive on ALL pages */}
          <GlobalEventFetcher />
          <div className="min-h-screen bg-surface-900 flex flex-col">
            <NavbarConditional />
            <main className="flex-1">
              <Routes>
                {/* ── Default redirect ───────────────────────── */}
                <Route path="/" element={<RoleHomeRedirect />} />

                {/* ── Landing page (guests) ─────────────────── */}
                <Route path="/landing" element={<LandingPage />} />

                {/* ── Public routes (no auth required) ──────── */}
                <Route path="/portal" element={
                  <RoleGuardedPortal><PublicPortal /></RoleGuardedPortal>
                } />
                <Route path="/login"    element={<LoginPage />} />
                <Route path="/register" element={<SignupPage />} />

                {/* ── Citizen portal ─────────────────────────── */}
                <Route
                  path="/citizen"
                  element={
                    <ProtectedRoute roles={['citizen', 'coordinator', 'admin']}>
                      <CitizenPortal />
                    </ProtectedRoute>
                  }
                />

                {/* ── Coordinator dashboard ──────────────────── */}
                <Route
                  path="/dashboard"
                  element={
                    <ProtectedRoute roles={['coordinator']}>
                      <CoordinatorDashboard />
                    </ProtectedRoute>
                  }
                />

                {/* ── Admin routes ───────────────────────────── */}
                <Route
                  path="/admin"
                  element={
                    <ProtectedRoute roles={['admin']}>
                      <AdminDashboard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin/coordinators"
                  element={
                    <ProtectedRoute roles={['admin']}>
                      <AdminCoordinators />
                    </ProtectedRoute>
                  }
                />

                {/* ── Catch-all ──────────────────────────────── */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </main>
            <PWAInstallBanner />
          </div>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

// ── Only show Navbar on non-landing, non-auth routes ──────────────────────
function NavbarConditional() {
  const location = useLocation();
  const hideOn = ['/', '/landing', '/login', '/register'];
  if (hideOn.includes(location.pathname)) return null;
  return <Navbar />;
}

// ── Smart default redirect based on role ────────────────────────────────────
function RoleHomeRedirect() {
  const { user, role, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/landing" replace />;
  const ROLE_HOME = { coordinator: '/dashboard', citizen: '/citizen', admin: '/admin' };
  return <Navigate to={ROLE_HOME[role] || '/portal'} replace />;
}

// ── Global event fetcher ─────────────────────────────────────────────────────
// Rendered once at app level, outside <Routes>. This means events are always
// fetched and kept in the Zustand store regardless of which page is active.
// Fixes: map markers disappear when navigating between pages.
function GlobalEventFetcher() {
  useDisasterEvents();
  return null;
}
