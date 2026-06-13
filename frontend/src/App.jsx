import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/hooks/useAuth';
import ProtectedRoute from '@/components/shared/ProtectedRoute';
import Navbar from '@/components/shared/Navbar';
import PWAInstallBanner from '@/components/shared/PWAInstallBanner';
import CoordinatorDashboard from '@/pages/CoordinatorDashboard';
import PublicPortal from '@/pages/PublicPortal';
import MobileResponder from '@/pages/MobileResponder';
import LoginPage from '@/pages/LoginPage';
import { useEffect } from 'react';
import { registerAndSubscribeToPush } from '@/utils/pushService';

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

export default function App() {
  useEffect(() => {
    registerAndSubscribeToPush();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <div className="min-h-screen bg-surface-900 flex flex-col">
            <Navbar />
            <main className="flex-1">
              <Routes>
                {/* Public routes */}
                <Route path="/" element={<Navigate to="/portal" replace />} />
                <Route path="/portal" element={<PublicPortal />} />
                <Route path="/login"  element={<LoginPage />} />

                {/* Protected: coordinators (and above) only */}
                <Route
                  path="/dashboard"
                  element={
                    <ProtectedRoute roles={['coordinator']}>
                      <CoordinatorDashboard />
                    </ProtectedRoute>
                  }
                />

                {/* Protected: responders + coordinators */}
                <Route
                  path="/responder"
                  element={
                    <ProtectedRoute roles={['responder', 'coordinator']}>
                      <MobileResponder />
                    </ProtectedRoute>
                  }
                />
              </Routes>
            </main>
            <PWAInstallBanner />
          </div>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
