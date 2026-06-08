import { useState } from 'react';
import DisasterMap from '@/components/map/DisasterMap';
import MapLayers from '@/components/map/MapLayers';
import AlertCard from '@/components/alerts/AlertCard';
import { useDisasterEvents } from '@/hooks/useDisasterEvents';
import useAppStore from '@/store/useAppStore';

export default function PublicPortal() {
  const events = useAppStore((s) => s.events);
  const eventStats = useAppStore((s) => s.eventStats);
  const isConnected = useAppStore((s) => s.isConnected);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useDisasterEvents();

  const recentCritical = events.filter(e => e.severity === 'Critical').slice(0, 5);
  const recentAll = events.slice(0, 20);

  return (
    <div className="flex h-[calc(100vh-56px)] relative overflow-hidden">

      {/* Map — fills the entire background */}
      <div className="absolute inset-0">
        <DisasterMap onEventSelect={setSelectedEvent} />
      </div>

      {/* Layer controls — floats over map */}
      <MapLayers />

      {/* Critical alert banner */}
      {recentCritical.length > 0 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[900] flex gap-2 max-w-xl w-full px-4">
          <div className="glass border border-red-500/40 rounded-xl px-4 py-3 w-full animate-fade-in">
            <div className="flex items-center gap-2">
              <span className="text-red-400 text-lg animate-pulse">🚨</span>
              <div>
                <p className="text-xs font-bold text-red-400 uppercase tracking-wide">Critical Alert</p>
                <p className="text-sm text-white font-medium">{recentCritical[0].title}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Right sidebar */}
      <div
        className={`absolute right-0 top-0 bottom-0 z-[800] flex flex-col transition-all duration-300 ${
          sidebarOpen ? 'w-80' : 'w-0'
        } overflow-hidden`}
      >
        <div className="glass border-l border-white/5 h-full overflow-y-auto p-4 space-y-3 w-80">

          {/* Stats */}
          <div className="grid grid-cols-2 gap-2">
            <div className="glass-card text-center py-3">
              <div className="text-2xl font-bold text-white">{eventStats.total || 0}</div>
              <div className="text-xs text-slate-500">Active Events</div>
            </div>
            <div className="glass-card text-center py-3">
              <div className="text-2xl font-bold text-red-400">{eventStats.bySeverity?.Critical || 0}</div>
              <div className="text-xs text-slate-500">Critical</div>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white">Live Events</h2>
            <span className={`text-xs ${isConnected ? 'text-emerald-400' : 'text-slate-500'}`}>
              {isConnected ? '● Live' : '○ Offline'}
            </span>
          </div>

          {/* Event list */}
          <div className="space-y-2">
            {recentAll.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <div className="text-3xl mb-2">📡</div>
                <p className="text-sm">Monitoring global events…</p>
              </div>
            ) : (
              recentAll.map(event => (
                <AlertCard key={event.id} event={event} onClick={setSelectedEvent} />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Sidebar toggle */}
      <button
        id="sidebar-toggle"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="absolute right-0 top-1/2 -translate-y-1/2 z-[900] glass border border-white/10 rounded-l-xl px-2 py-4 text-slate-400 hover:text-white transition-colors"
        aria-label="Toggle event sidebar"
      >
        {sidebarOpen ? '›' : '‹'}
      </button>

      {/* Selected event detail panel */}
      {selectedEvent && (
        <div className="absolute bottom-4 left-48 z-[900] glass border border-white/10 rounded-xl p-4 max-w-sm w-full animate-slide-up">
          <div className="flex justify-between items-start mb-2">
            <span className={`severity-${selectedEvent.severity?.toLowerCase()}`}>{selectedEvent.severity}</span>
            <button
              onClick={() => setSelectedEvent(null)}
              className="text-slate-400 hover:text-white text-lg leading-none"
              aria-label="Close event detail"
            >✕</button>
          </div>
          <h3 className="text-sm font-bold text-white mb-1">{selectedEvent.title}</h3>
          {selectedEvent.description && (
            <p className="text-xs text-slate-400">{selectedEvent.description}</p>
          )}
          <p className="text-xs text-slate-600 mt-2">Source: {selectedEvent.source}</p>
        </div>
      )}
    </div>
  );
}
