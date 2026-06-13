import { useState, useEffect } from 'react';
import DisasterMap from '@/components/map/DisasterMap';
import MapLayers from '@/components/map/MapLayers';
import IMDLegend from '@/components/map/IMDLegend';
import AlertCard from '@/components/alerts/AlertCard';
import NDRFPanel from '@/components/resources/NDRFPanel';
import MonsoonDashboard from '@/components/dashboard/MonsoonDashboard';
import MisinformationPanel from '@/components/dashboard/MisinformationPanel';
import { useDisasterEvents } from '@/hooks/useDisasterEvents';
import useAppStore from '@/store/useAppStore';
import { useTranslation } from '@/utils/i18n';

const TABS = [
  { key: 'events',    icon: '🚨', label: 'sidebar.alerts'    },
  { key: 'monsoon',   icon: '🌧️', label: 'monsoon.active'    },
  { key: 'ndrf',      icon: '🚒', label: 'ndrf.title'        },
  { key: 'factcheck', icon: '🔍', label: 'Fact-Check'         },
];

export default function PublicPortal() {
  const events      = useAppStore((s) => s.events);
  const eventStats  = useAppStore((s) => s.eventStats);
  const isConnected = useAppStore((s) => s.isConnected);
  const { t }       = useTranslation();

  const [selectedEvent, setSelectedEvent] = useState(null);
  const [sidebarOpen, setSidebarOpen]     = useState(true);
  const [activeTab, setActiveTab]         = useState('events');

  const setUserLocation = useAppStore((s) => s.setUserLocation);

  // Ask for location on mount
  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setUserLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        },
        (err) => {
          console.log('User denied location access or error occurred:', err.message);
        }
      );
    }
  }, [setUserLocation]);

  useDisasterEvents();

  const recentCritical = events.filter(e => e.severity === 'Critical').slice(0, 5);
  const recentAll      = events.slice(0, 20);

  return (
    <div className="flex h-[calc(100vh-56px)] relative overflow-hidden">

      {/* Map — full background */}
      <div className="absolute inset-0">
        <DisasterMap onEventSelect={setSelectedEvent} />
      </div>

      {/* Layer controls (PIN search, filters, zoom) — top-left */}
      <MapLayers />

      {/* 🌦️ IMD Legend — bottom-left */}
      <div className="absolute bottom-4 left-4 z-[1000] pointer-events-auto">
        <IMDLegend />
      </div>

      {/* Critical alert banner — top-center */}
      {recentCritical.length > 0 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[900] flex gap-2 max-w-xl w-full px-4">
          <div className="glass border border-red-500/40 rounded-xl px-4 py-3 w-full animate-fade-in">
            <div className="flex items-center gap-2">
              <span className="text-red-400 text-lg animate-pulse">🚨</span>
              <div>
                <p className="text-xs font-bold text-red-400 uppercase tracking-wide">
                  {t('severity.Critical')} Alert
                </p>
                <p className="text-sm text-white font-medium">{recentCritical[0].title}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Right sidebar */}
      <div
        className={`absolute right-0 top-0 bottom-0 z-[800] flex flex-col transition-all duration-300 ${
          sidebarOpen ? 'w-full sm:w-80' : 'w-0'
        } overflow-hidden`}
      >
        <div className="glass border-l border-white/5 h-full flex flex-col w-full sm:w-80">

          {/* Stats row */}
          <div className="grid grid-cols-2 gap-2 p-3 pb-0">
            <div className="glass-card text-center py-2.5">
              <div className="text-2xl font-bold text-white">{eventStats.total || 0}</div>
              <div className="text-xs text-slate-500">{t('sidebar.alerts')}</div>
            </div>
            <div className="glass-card text-center py-2.5">
              <div className="text-2xl font-bold text-red-400">{eventStats.bySeverity?.Critical || 0}</div>
              <div className="text-xs text-slate-500">{t('severity.Critical')}</div>
            </div>
          </div>

          {/* Tab nav */}
          <div className="flex border-b border-white/5 mt-3 mx-3 rounded-xl overflow-hidden">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                id={`portal-tab-${tab.key}`}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 py-2 text-xs font-semibold transition-all duration-200 flex items-center justify-center gap-1 ${
                  activeTab === tab.key
                    ? 'bg-brand-600/30 text-brand-300 border border-brand-500/20 rounded-xl'
                    : 'text-slate-500 hover:text-white'
                }`}
              >
                {tab.icon}
              </button>
            ))}
          </div>

          {/* Tab label */}
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider px-4 pt-2 pb-1">
            {t(TABS.find(t => t.key === activeTab)?.label || '')}
          </p>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2">

            {/* Events tab */}
            {activeTab === 'events' && (
              <>
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs ${isConnected ? 'text-emerald-400' : 'text-slate-500'}`}>
                    {isConnected ? `● ${t('nav.live')}` : `○ ${t('nav.offline')}`}
                  </span>
                </div>
                {recentAll.length === 0 ? (
                  <div className="text-center py-8 text-slate-500">
                    <div className="text-3xl mb-2">📡</div>
                    <p className="text-sm">{t('sidebar.loading')}</p>
                  </div>
                ) : (
                  recentAll.map(event => (
                    <AlertCard key={event.id} event={event} onClick={setSelectedEvent} />
                  ))
                )}
              </>
            )}

            {/* Monsoon tab */}
            {activeTab === 'monsoon' && <MonsoonDashboard />}

            {/* NDRF tab */}
            {activeTab === 'ndrf' && <NDRFPanel />}

            {/* Fact-Check tab */}
            {activeTab === 'factcheck' && <MisinformationPanel />}
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

      {/* Selected event detail */}
      {selectedEvent && (
        <div className="absolute bottom-4 left-4 z-[900] glass border border-white/10 rounded-xl p-4 max-w-sm w-full animate-slide-up ml-0"
          style={{ left: '220px' }}
        >
          <div className="flex justify-between items-start mb-2">
            <span className={`severity-${selectedEvent.severity?.toLowerCase()}`}>
              {t(`severity.${selectedEvent.severity}`) || selectedEvent.severity}
            </span>
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
