import { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/hooks/useAuth';
import { useAuth } from '@/hooks/useAuth';
import ProtectedRoute from '@/components/shared/ProtectedRoute';
import Navbar from '@/components/shared/Navbar';
import PWAInstallBanner from '@/components/shared/PWAInstallBanner';

// ── Pages (route-level code splitting) ──────────────────────────────────────
// PERF: every page was imported eagerly, producing ONE 1.08 MB JS chunk that
// every visitor downloaded and parsed before anything rendered — including
// Leaflet (~257 KB) for users who never open a map, and the coordinator and
// admin dashboards for users who can't even access those roles.
//
// After splitting, the shared chunk is ~683 KB and each role pulls only its
// own screen (PublicPortal 7 KB, CitizenPortal 38 KB, CoordinatorDashboard
// 52 KB, AdminDashboard 16 KB), with Leaflet deferred to the routes that
// actually render a map.
//
// LoginPage stays eager: it is the most common cold entry point for signed-out
// users, so a lazy chunk there would add a network round-trip to first paint
// for no benefit.
import LoginPage from '@/pages/LoginPage';

const LandingPage        = lazy(() => import('@/pages/LandingPage'));
const PublicPortal       = lazy(() => import('@/pages/PublicPortal'));
const CitizenPortal      = lazy(() => import('@/pages/CitizenPortal'));
const CoordinatorDashboard = lazy(() => import('@/pages/CoordinatorDashboard'));
const AdminDashboard     = lazy(() => import('@/pages/AdminDashboard'));
const AdminCoordinators  = lazy(() => import('@/pages/AdminCoordinators'));
const SignupPage         = lazy(() => import('@/pages/SignupPage'));

import { registerAndSubscribeToPush, resubscribePushForCurrentUser } from '@/utils/pushService';
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
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          {/* Always-on global event fetcher — keeps the store alive on ALL pages */}
          <GlobalEventFetcher />
          <PushRegistrar />
          <div className="min-h-screen bg-surface-900 flex flex-col">
            <NavbarConditional />
            <main className="flex-1">
              <Suspense fallback={<RouteFallback />}>
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
              </Suspense>
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

// ── Suspense fallback for lazily-loaded routes ──────────────────────────────
// Deliberately minimal and non-jarring: a chunk fetch on a warm connection is
// a few tens of ms, so a heavyweight skeleton would flash more than it helps.
function RouteFallback() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center bg-surface-900">
      <div className="flex flex-col items-center gap-4">
        <div className="spinner w-8 h-8" />
        <p className="text-slate-400 text-sm">Loading…</p>
      </div>
    </div>
  );
}

// ── Push registration ───────────────────────────────────────────────────────
// Lives INSIDE <AuthProvider> so it can react to sign-in. Registering at the
// top level (as before) fired once at mount — always before login — so the
// subscribe call carried no JWT and every row was stored with user_id = NULL.
function PushRegistrar() {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    // Anonymous visitors still get a subscription (broadcast-only); signed-in
    // users re-subscribe so the endpoint is re-bound to their user_id.
    if (user) resubscribePushForCurrentUser();
    else registerAndSubscribeToPush();
  }, [user, loading]);

  return null;
}

// ── Global event fetcher ─────────────────────────────────────────────────────
// Rendered once at app level, outside <Routes>. This means events are always
// fetched and kept in the Zustand store regardless of which page is active.
// Fixes: map markers disappear when navigating between pages.
function GlobalEventFetcher() {
  useDisasterEvents();
  return null;
}
