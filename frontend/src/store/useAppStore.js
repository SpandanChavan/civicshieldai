import { create } from 'zustand';

const useAppStore = create((set, get) => ({
  // ── Events ──────────────────────────────────────────
  events: [],
  eventStats: { byType: {}, bySeverity: {}, total: 0 },
  setEvents: (events) => set({ events }),
  addEvent: (event) =>
    set((state) => ({
      events: [event, ...state.events.filter((e) => e.id !== event.id)],
    })),
  setEventStats: (stats) => set({ eventStats: stats }),

  // ── Alerts ──────────────────────────────────────────
  alerts: [],
  setAlerts: (alerts) => set({ alerts }),
  addAlert: (alert) =>
    set((state) => ({ alerts: [alert, ...state.alerts] })),
  removeAlert: (id) =>
    set((state) => ({ alerts: state.alerts.filter((a) => a.id !== id) })),

  // ── Resources ───────────────────────────────────────
  resources: [],
  setResources: (resources) => set({ resources }),
  updateResource: (id, patch) =>
    set((state) => ({
      resources: state.resources.map((r) =>
        r.id === id ? { ...r, ...patch } : r
      ),
    })),

  // ── Incidents ───────────────────────────────────────
  incidents: [],
  setIncidents: (incidents) => set({ incidents }),
  addIncident: (incident) =>
    set((state) => ({ incidents: [incident, ...state.incidents] })),

  // ── Map State ───────────────────────────────────────
  selectedEvent: null,
  setSelectedEvent: (event) => set({ selectedEvent: event }),
  mapCenter: [20.5937, 78.9629], // India
  mapZoom: 5,
  setMapView: (center, zoom) => set({ mapCenter: center, mapZoom: zoom }),
  userLocation: null,
  setUserLocation: (loc) => set({ userLocation: loc }),

  // ── Filters ─────────────────────────────────────────
  filters: {
    eventType: 'all',
    severity: 'all',
    showHeatmap: false,
    showClusters: true,
    showResources: true,
    stateFilter: null,   // 🇮🇳 India state boundary filter
  },
  setFilter: (key, value) =>
    set((state) => ({
      filters: { ...state.filters, [key]: value },
    })),
  clearStateFilter: () => {
    window.__civicshieldStateFilter = null;
    set((state) => ({ filters: { ...state.filters, stateFilter: null } }));
  },

  // ── UI State ────────────────────────────────────────
  sidebarOpen: true,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  activePanel: 'events',  // 'events' | 'alerts' | 'resources' | 'incidents'
  setActivePanel: (panel) => set({ activePanel: panel }),
  language: 'en',         // 🌐 'en' | 'hi'
  setLanguage: (lang) => set({ language: lang }),

  // ── Realtime Connection ──────────────────────────────
  isConnected: false,
  setConnected: (status) => set({ isConnected: status }),
  lastUpdate: null,
  setLastUpdate: (ts) => set({ lastUpdate: ts }),

  // ── Notifications ────────────────────────────────────
  notifications: [],
  addNotification: (notification) =>
    set((state) => ({
      notifications: [
        { id: Date.now(), ts: new Date(), ...notification },
        ...state.notifications.slice(0, 49),
      ],
    })),
  clearNotifications: () => set({ notifications: [] }),
}));

export default useAppStore;
