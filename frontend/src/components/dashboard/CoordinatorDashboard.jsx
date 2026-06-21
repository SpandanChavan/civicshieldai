import React, { useState, useEffect } from 'react';
import { getEventLatLon } from '@/utils/geoHelpers';
import useAppStore from '@/store/useAppStore';
import { useAuth } from '@/hooks/useAuth';
import { useAlerts } from '@/hooks/useAlerts';
import AlertCard from '@/components/alerts/AlertCard';
import AlertForm from '@/components/alerts/AlertForm';
import ResourcePanel from '@/components/resources/ResourcePanel';
import NDRFPanel from '@/components/resources/NDRFPanel';
import MonsoonDashboard from '@/components/dashboard/MonsoonDashboard';
import MisinformationPanel from '@/components/dashboard/MisinformationPanel';
import ReportsQueue from '@/components/dashboard/ReportsQueue';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import EmptyState from '@/components/shared/EmptyState';
import { useTranslation } from '@/utils/i18n';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ClipboardList, Map as MapIcon, Bell, Truck, CloudRain, 
  ShieldAlert, ShieldCheck, Activity, AlertTriangle, Send,
  ChevronLeft, LayoutGrid, Building2
} from 'lucide-react';

const PANELS = [
  { id: 'events',    icon: MapIcon,       label: 'Live Events',  color: 'text-rose-400',   bg: 'bg-rose-500/10',   border: 'border-rose-500/20' },
  { id: 'alerts',    icon: Bell,          label: 'Send Alerts',  color: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20' },
  { id: 'reports',   icon: ClipboardList, label: 'Reports',      color: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/20' },
  { id: 'resources', icon: Truck,         label: 'Resources',    color: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/20' },
  { id: 'monsoon',   icon: CloudRain,     label: 'Monsoon',      color: 'text-cyan-400',   bg: 'bg-cyan-500/10',   border: 'border-cyan-500/20' },
  { id: 'ndrf',      icon: ShieldAlert,   label: 'NDRF',         color: 'text-emerald-400',bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  { id: 'misinfo',   icon: ShieldCheck,   label: 'Fact-Check',   color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20' },
];

export default function CoordinatorDashboard({ compact = false, selectedMapEvent, onClearMapEvent }) {
  const events = useAppStore((s) => s.events);
  const alerts = useAppStore((s) => s.alerts);
  const eventStats = useAppStore((s) => s.eventStats);
  const { profile } = useAuth();
  
  // Drill-down State: null means "Home Grid"
  const [activeModule, setActiveModule] = useState(null); 
  const [selectedEvent, setSelectedEvent] = useState(null);

  // Watch for external map events
  useEffect(() => {
    if (selectedMapEvent) {
      setSelectedEvent(selectedMapEvent);
      setActiveModule('alerts');
    }
  }, [selectedMapEvent]);

  // 🛡️ Coordinator jurisdiction filter for left panel
  const coordinatorEvents = React.useMemo(() => {
    if (profile?.role !== 'coordinator' || !profile?.states?.bbox_north) return events;
    const st = profile.states;
    return events.filter(e => {
      const pos = getEventLatLon(e);
      if (!pos) return true; // Keep events without valid location just in case
      return (pos.lat >= st.bbox_south && pos.lat <= st.bbox_north &&
              pos.lon >= st.bbox_west && pos.lon <= st.bbox_east);
    });
  }, [events, profile]);

  const eventsLoading = events.length === 0;
  const { isLoading: alertsLoading, createAlert, isCreating } = useAlerts();

  const criticalEvents = coordinatorEvents.filter(e => e.severity === 'Critical');
  const highEvents = coordinatorEvents.filter(e => e.severity === 'High');
  const stateName = profile?.states?.name;
  const stateCode = profile?.states?.code;
  const stateCapital = profile?.states?.capital;

  const handleOpenAlertsForEvent = (event) => {
    setSelectedEvent(event);
    setActiveModule('alerts');
  };

  const renderModuleContent = () => {
    switch (activeModule) {
      case 'events':
        return (
          <div className="space-y-2 pb-4">
            {eventsLoading ? (
              <LoadingSpinner label="Fetching live events…" />
            ) : coordinatorEvents.length === 0 ? (
              <EmptyState type="empty" icon={<Activity className="text-slate-500 mx-auto" size={32}/>} title="Monitoring for events…" message={stateName ? `No active events detected in ${stateName}.` : 'Data will appear here as disasters are detected.'} />
            ) : (
              coordinatorEvents.slice(0, 50).map(event => (
                <AlertCard
                  key={event.id}
                  event={event}
                  onClick={(e) => handleOpenAlertsForEvent(e)}
                />
              ))
            )}
          </div>
        );
      case 'alerts':
        return (
          <div className="space-y-4 pb-4">
            <div className="glass-card">
              <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <Bell size={16} className="text-indigo-400" /> Create New Alert
              </h3>
              {selectedEvent && (
                <div className="flex items-center justify-between bg-indigo-500/10 border border-indigo-500/20 rounded-lg px-3 py-2 mb-3">
                  <p className="text-xs text-indigo-300 line-clamp-1 flex-1">
                    <span className="font-semibold text-indigo-200">Linked Event:</span> {selectedEvent.title}
                  </p>
                  <button onClick={() => { setSelectedEvent(null); if (onClearMapEvent) onClearMapEvent(); }} className="text-indigo-400 hover:text-indigo-200 p-1">✕</button>
                </div>
              )}
              <AlertForm
                eventId={selectedEvent?.id}
                createAlert={createAlert}
                isCreating={isCreating}
                onSuccess={() => { setSelectedEvent(null); if (onClearMapEvent) onClearMapEvent(); }}
              />
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Recent Alerts</h3>
              {alertsLoading ? (
                <LoadingSpinner size="sm" label="Loading alerts…" />
              ) : (
                <div className="space-y-2">
                  {alerts.slice(0, 20).map(alert => (
                    <div key={alert.id} id={`alert-row-${alert.id}`} className="glass-card flex items-center justify-between p-3">
                      <div>
                        <p className="text-sm font-medium text-white">{alert.title}</p>
                        <p className="text-xs text-slate-500 mt-0.5 flex gap-2">
                          <span className={`severity-${alert.severity?.toLowerCase()}`}>{alert.severity}</span>
                          <span>·</span>
                          <span className={alert.status === 'sent' ? 'text-emerald-400' : 'text-amber-400'}>{alert.status}</span>
                        </p>
                      </div>
                      <Send size={14} className="text-slate-600" />
                    </div>
                  ))}
                  {alerts.length === 0 && (
                    <EmptyState type="empty" icon={<Send className="text-slate-500 mx-auto" size={32}/>} title="No alerts sent yet" />
                  )}
                </div>
              )}
            </div>
          </div>
        );
      case 'reports':   return <ReportsQueue />;
      case 'resources': return <ResourcePanel />;
      case 'monsoon':   return <MonsoonDashboard />;
      case 'ndrf':      return <NDRFPanel />;
      case 'misinfo':   return <MisinformationPanel />;
      default:          return null;
    }
  };

  const activePanelData = PANELS.find(p => p.id === activeModule);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#0f172a] text-slate-300">
      
      {/* ── Drill-down Navigation Header ── */}
      <AnimatePresence mode="wait">
        {activeModule ? (
          <motion.div
            key="module-header"
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            className="flex-shrink-0 border-b border-white/5 bg-slate-900/80 backdrop-blur-md px-4 py-3 sticky top-0 z-10 flex items-center justify-between shadow-lg"
          >
            <button 
              onClick={() => {
                setActiveModule(null);
                if (onClearMapEvent) onClearMapEvent();
                setSelectedEvent(null);
              }}
              className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors group"
            >
              <ChevronLeft size={18} className="group-hover:-translate-x-0.5 transition-transform" />
              <span className="text-sm font-semibold">Back</span>
            </button>
            <div className={`flex items-center gap-2 ${activePanelData?.color}`}>
              {activePanelData && <activePanelData.icon size={18} />}
              <span className="text-sm font-bold">{activePanelData?.label}</span>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="home-header"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-shrink-0"
          >
            {/* ── State Scope Banner ── */}
            {stateName ? (
              <div className="px-4 py-4 flex items-center justify-between border-b border-indigo-500/20 bg-gradient-to-br from-indigo-900/40 to-slate-900">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 shadow-lg shadow-indigo-500/10">
                    <Building2 size={20} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-white font-bold text-base tracking-wide">{stateName}</span>
                      <span className="bg-indigo-500/20 border border-indigo-500/40 text-[10px] font-bold text-indigo-300 px-1.5 py-0.5 rounded uppercase tracking-wider">
                        {stateCode}
                      </span>
                    </div>
                    {stateCapital && (
                      <p className="text-xs text-indigo-200/60 mt-0.5 flex items-center gap-1">
                        <MapIcon size={12} /> {stateCapital} HQ
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end">
                  <div className="flex items-center gap-1.5 bg-emerald-500/10 px-2 py-1 rounded-full border border-emerald-500/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]" />
                    <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">Live</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="px-4 py-3 border-b border-white/5 bg-amber-500/10">
                <div className="text-xs text-amber-400 flex items-center gap-2">
                  <AlertTriangle size={14} /> No state assigned — viewing global scope
                </div>
              </div>
            )}
            
            {/* ── Critical Stats Mini-Dashboard ── */}
            <div className="p-4 pb-0 grid grid-cols-2 gap-3">
              {[
                { label: 'Active Events', value: eventStats.total || 0, color: 'text-indigo-400', bg: 'bg-indigo-500/5', border: 'border-indigo-500/10', icon: <Activity size={18} /> },
                { label: 'Critical Risk', value: criticalEvents.length, color: 'text-rose-400', bg: 'bg-rose-500/5', border: 'border-rose-500/10', icon: <AlertTriangle size={18} /> },
                { label: 'High Risk',     value: highEvents.length,     color: 'text-amber-400', bg: 'bg-amber-500/5', border: 'border-amber-500/10', icon: <AlertTriangle size={18} /> },
                { label: 'Alerts Sent',   value: alerts.filter(a => a.status === 'sent').length, color: 'text-blue-400', bg: 'bg-blue-500/5', border: 'border-blue-500/10', icon: <Send size={18} /> },
              ].map((stat, i) => (
                <div key={stat.label} className={`rounded-xl p-3 border ${stat.bg} ${stat.border} shadow-sm flex flex-col items-center justify-center text-center transition-all hover:bg-white/[0.02]`}>
                  <div className={`mb-1.5 ${stat.color} opacity-80`}>{stat.icon}</div>
                  <div className={`text-2xl font-black ${stat.color} leading-none mb-1`}>{stat.value}</div>
                  <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">{stat.label}</div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Content Area ── */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-4">
        <AnimatePresence mode="wait">
          {!activeModule ? (
            <motion.div
              key="home-grid"
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -20, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <div className="flex items-center gap-2 text-slate-400 mb-4 px-1">
                <LayoutGrid size={16} />
                <h3 className="text-xs font-bold uppercase tracking-wider">Control Modules</h3>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                {PANELS.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setActiveModule(p.id)}
                    className="flex flex-col items-center justify-center text-center p-4 rounded-2xl bg-slate-800/50 hover:bg-slate-800 border border-white/5 hover:border-white/10 transition-all group hover:shadow-lg hover:-translate-y-0.5"
                  >
                    <div className={`w-12 h-12 rounded-full ${p.bg} ${p.border} border flex items-center justify-center mb-3 group-hover:scale-110 transition-transform duration-300`}>
                      <p.icon size={24} className={p.color} />
                    </div>
                    <span className="text-sm font-bold text-slate-200 group-hover:text-white transition-colors">{p.label}</span>
                    <span className="text-[10px] text-slate-500 mt-1 line-clamp-1">{p.desc}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key={`module-${activeModule}`}
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 20, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="h-full"
            >
              {renderModuleContent()}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

    </div>
  );
}
