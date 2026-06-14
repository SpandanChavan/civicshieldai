import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';

// Silence the Supabase warnings in CI
vi.stubEnv('VITE_SUPABASE_URL', 'http://localhost:54321');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test_mock_key');
vi.stubEnv('VITE_BACKEND_URL', 'http://localhost:4000');
vi.stubEnv('VITE_ML_SERVICE_URL', 'http://localhost:10000');

// 1. Global mock for Supabase
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
    })),
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    })),
    removeChannel: vi.fn(),
  })),
}));

// 2. Global mock for socket.io-client
vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
  })),
}));

// 3. Global mock for Axios
vi.mock('axios', () => {
  const mockAxios = {
    get: vi.fn().mockResolvedValue({ data: {} }),
    post: vi.fn().mockResolvedValue({ data: {} }),
    put: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
    interceptors: {
      request: { use: vi.fn(), eject: vi.fn() },
      response: { use: vi.fn(), eject: vi.fn() },
    },
  };
  return {
    default: {
      ...mockAxios,
      create: vi.fn(() => mockAxios),
    },
  };
});

// 4. Global mock for Fetch
global.fetch = vi.fn().mockResolvedValue({
  json: vi.fn().mockResolvedValue({}),
  text: vi.fn().mockResolvedValue(''),
  ok: true,
  status: 200,
});

// 5. Global mock for IndexedDB
global.indexedDB = {
  open: vi.fn(() => {
    const req = { onsuccess: null, onerror: null, onupgradeneeded: null, result: { transaction: vi.fn(), createObjectStore: vi.fn() } };
    setTimeout(() => { if (req.onsuccess) req.onsuccess({ target: req }); }, 0);
    return req;
  }),
};

// 6. Global mock for Service Worker & Web Push
Object.defineProperty(navigator, 'serviceWorker', {
  value: {
    register: vi.fn().mockResolvedValue({
      sync: { register: vi.fn() },
      pushManager: {
        getSubscription: vi.fn().mockResolvedValue(null),
        subscribe: vi.fn().mockResolvedValue({ endpoint: 'mock-endpoint', getKey: vi.fn() }),
      },
    }),
    ready: Promise.resolve({
      sync: { register: vi.fn() },
      pushManager: {
        getSubscription: vi.fn().mockResolvedValue(null),
        subscribe: vi.fn().mockResolvedValue({ endpoint: 'mock-endpoint', getKey: vi.fn() }),
      },
    }),
  },
  writable: true,
});

window.PushManager = vi.fn();

afterEach(() => {
  cleanup();
});
