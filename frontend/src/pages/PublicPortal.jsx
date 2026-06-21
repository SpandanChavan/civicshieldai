import { useState, useEffect } from 'react';
import useAppStore from '@/store/useAppStore';
import { useTranslation } from '@/utils/i18n';
import DisasterMap from '@/components/map/DisasterMap';
import MapLayers from '@/components/map/MapLayers';
import IMDLegend from '@/components/map/IMDLegend';
import AlertCard from '@/components/alerts/AlertCard';
import NDRFPanel from '@/components/resources/NDRFPanel';
import MonsoonDashboard from '@/components/dashboard/MonsoonDashboard';
import MisinformationPanel from '@/components/dashboard/MisinformationPanel';
import {
  AlertTriangle, Cloud, Truck, Search, Radio,
  Layers, SlidersHorizontal, Globe, MapPin,
  ZoomIn, ChevronLeft, ChevronRight, Maximize2,
  LayoutGrid, Activity, Flame, Waves, Wind, Mountain,
  Sun, ThermometerSun, Snowflake, Leaf, LocateFixed, Map
} from 'lucide-react';

/* ── Constants ─────────────────────────────────────── */

const TABS = [
  { key: 'events',    icon: AlertTriangle, label: 'Alerts'     },
  { key: 'monsoon',   icon: Cloud,         label: 'Monsoon'    },
  { key: 'ndrf',      icon: Truck,         label: 'NDRF'       },
  { key: 'factcheck', icon: Search,        label: 'Fact-Check' },
];

const SEV_COLORS = {
  Critical: '#ef4444', High: '#f97316', Medium: '#f59e0b', Low: '#3b82f6',
};

/* ── Styles ─────────────────────────────────────────── */
const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
  * { box-sizing: border-box; }

  .pp-scroll::-webkit-scrollbar { width: 4px; }
  .pp-scroll::-webkit-scrollbar-track { background: transparent; }
  .pp-scroll::-webkit-scrollbar-thumb { background: rgba(0,166,147,0.25); border-radius: 4px; }
  .pp-scroll { scrollbar-width: thin; scrollbar-color: rgba(0,166,147,0.25) transparent; }

  .pp-type-btn { transition: all 0.15s; border: 1px solid transparent; cursor: pointer; }
  .pp-type-btn:hover { background: rgba(0,166,147,0.08) !important; border-color: rgba(0,166,147,0.2) !important; }
  .pp-type-btn.active { background: rgba(0,166,147,0.15) !important; border-color: rgba(0,166,147,0.35) !important; color: #00A693 !important; }

  .pp-sev-btn { transition: all 0.15s; cursor: pointer; border: 1px solid transparent; }
  .pp-sev-btn:hover { opacity: 0.9; }

  .pp-tab-btn { transition: all 0.15s; cursor: pointer; }
  .pp-tab-btn:hover { color: white !important; }

  .pp-map-ctrl { transition: all 0.15s; cursor: pointer; }
  .pp-map-ctrl:hover { background: rgba(0,166,147,0.12) !important; border-color: rgba(0,166,147,0.3) !important; color: #00A693 !important; }

  .pp-toggle { accent-color: #00A693; }

  @keyframes ppPingPulse { 0%, 100% { transform: scale(1); opacity: 0.6; } 50% { transform: scale(1.8); opacity: 0; } }
  @keyframes ppGlow { 0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.4); } 50% { box-shadow: 0 0 0 8px rgba(239,68,68,0); } }
`;

export default function PublicPortal() {
  const events          = useAppStore((s) => s.events);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [activeTab, setActiveTab]         = useState('events');
  const portalRightOpen = useAppStore((s) => s.portalRightOpen);

  const recentAll      = events.slice(0, 30);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)', overflow: 'hidden', background: '#06131a', fontFamily: "'Inter', sans-serif" }}>
      <style>{STYLES}</style>

      {/* ── MAIN LAYOUT ──────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>

        {/* ════ CENTER — MAP ════════════════════════════ */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden', minWidth: 0 }}>
          <DisasterMap onEventSelect={setSelectedEvent} />
          <MapLayers />
          <div className="absolute bottom-4 left-4 z-[1000] pointer-events-auto">
            <IMDLegend />
          </div>

          {/* Selected event popup — cleanly positioned inside map bounds */}
          {selectedEvent && (
            <div style={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 900, width: 340, padding: '16px 18px', borderRadius: 16, background: 'rgba(6,14,22,0.96)', backdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 20px 60px rgba(0,0,0,0.7)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 9px', borderRadius: 999, textTransform: 'uppercase', letterSpacing: '0.06em',
                  color: SEV_COLORS[selectedEvent.severity] || '#94a3b8',
                  background: `${SEV_COLORS[selectedEvent.severity] || '#94a3b8'}18`,
                  border: `1px solid ${SEV_COLORS[selectedEvent.severity] || '#94a3b8'}40`,
                }}>
                  {selectedEvent.severity}
                </span>
                <span style={{ fontSize: 10, color: '#334155', fontWeight: 600 }}>{selectedEvent.event_type}</span>
                <button onClick={() => setSelectedEvent(null)} style={{ width: 24, height: 24, borderRadius: 7, background: 'rgba(255,255,255,0.06)', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
              </div>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: 'white', margin: '0 0 6px', lineHeight: 1.4 }}>{selectedEvent.title}</h3>
              {selectedEvent.description && <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 8px', lineHeight: 1.5 }}>{selectedEvent.description}</p>}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, color: '#1e293b' }}>Source: {selectedEvent.source}</span>
                {selectedEvent.lat && <span style={{ fontSize: 10, color: '#1e293b' }}>{selectedEvent.lat?.toFixed(2)}, {selectedEvent.lon?.toFixed(2)}</span>}
              </div>
            </div>
          )}
        </div>

        {/* ════ RIGHT PANEL — Alerts & Info ════════════ */}
        <div style={{ width: portalRightOpen ? 300 : 0, flexShrink: 0, overflow: 'hidden', transition: 'width 0.25s cubic-bezier(0.4,0,0.2,1)', background: 'rgba(6,14,22,0.92)', backdropFilter: 'blur(20px)', borderLeft: '1px solid rgba(0,166,147,0.12)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ width: 300, height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: "'Inter', sans-serif" }}>

            {/* Panel header */}
            <div style={{ padding: '14px 14px 0', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <Radio size={14} color="#00A693" />
                  <span style={{ fontSize: 13, fontWeight: 800, color: 'white' }}>Intelligence Feed</span>
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 999, background: 'rgba(0,166,147,0.12)', border: '1px solid rgba(0,166,147,0.25)', color: '#00A693' }}>
                  {recentAll.length} events
                </span>
              </div>

              {/* Tab nav */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 3, padding: '3px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', marginBottom: 12 }}>
                {TABS.map(tab => {
                  const IconComp = tab.icon;
                  const isActive = activeTab === tab.key;
                  return (
                    <button key={tab.key} id={`portal-tab-${tab.key}`} onClick={() => setActiveTab(tab.key)}
                      className="pp-tab-btn"
                      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '6px 2px', borderRadius: 7, border: 'none', background: isActive ? '#00A693' : 'transparent', color: isActive ? 'white' : '#475569', transition: 'all 0.15s', boxShadow: isActive ? '0 2px 10px rgba(0,166,147,0.35)' : 'none' }}>
                      <IconComp size={12} />
                      <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Scrollable tab content */}
            <div className="pp-scroll" style={{ flex: 1, overflowY: 'auto', padding: '0 10px 12px' }}>

              {/* Events tab */}
              {activeTab === 'events' && (
                <>
                  {recentAll.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '48px 0' }}>
                      <Radio size={32} color="#1e293b" style={{ margin: '0 auto 12px' }} />
                      <p style={{ fontSize: 13, color: '#334155' }}>Loading live events…</p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      {recentAll.map(event => (
                        <AlertCard key={event.id} event={event} onClick={setSelectedEvent} />
                      ))}
                    </div>
                  )}
                </>
              )}

              {activeTab === 'monsoon'   && <MonsoonDashboard />}
              {activeTab === 'ndrf'      && <NDRFPanel />}
              {activeTab === 'factcheck' && <MisinformationPanel />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
