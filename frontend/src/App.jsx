import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Navbar from '@/components/shared/Navbar';
import CoordinatorDashboard from '@/pages/CoordinatorDashboard';
import PublicPortal from '@/pages/PublicPortal';
import MobileResponder from '@/pages/MobileResponder';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      refetchInterval: 5 * 60 * 1000,
      retry: 1,
      retryDelay: 3000,
      throwOnError: false,   // ← NEVER crash the component tree on query failure
    },
    mutations: {
      throwOnError: false,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="min-h-screen bg-surface-900 flex flex-col">
          <Navbar />
          <main className="flex-1">
            <Routes>
              <Route path="/" element={<Navigate to="/portal" replace />} />
              <Route path="/portal" element={<PublicPortal />} />
              <Route path="/dashboard" element={<CoordinatorDashboard />} />
              <Route path="/responder" element={<MobileResponder />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
