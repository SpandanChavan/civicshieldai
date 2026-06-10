import { useState } from 'react';
import useAppStore from '@/store/useAppStore';
import { useAlerts } from '@/hooks/useAlerts';
import AlertCard from '@/components/alerts/AlertCard';
import AlertForm from '@/components/alerts/AlertForm';
import ResourcePanel from '@/components/resources/ResourcePanel';
import NDRFPanel from '@/components/resources/NDRFPanel';
import MonsoonDashboard from '@/components/dashboard/MonsoonDashboard';
import { useTranslation } from '@/utils/i18n';

const PANELS = [
  { id: 'events',    label: '🗺️ Events',    desc: 'Active Incidents' },
  { id: 'alerts',    label: '🚨 Alerts',    desc: 'Send Notifications' },
  { id: 'resources', label: '🚑 Resources', desc: 'Manage Assets' },
  { id: 'monsoon',   label: '🌧️ Monsoon',  desc: 'Season Dashboard' },
  { id: 'ndrf',      label: '🪖 NDRF',     desc: 'Emergency Contacts' },
];

export default function CoordinatorDashboard({ compact = false }) {
  const events = useAppStore((s) => s.events);
  const alerts = useAppStore((s) => s.alerts);
  const eventStats = useAppStore((s) => s.eventStats);
  const [activePanel, setActivePanel] = useState('events');
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [showAlertForm, setShowAlertForm] = useState(false);

  // useDisasterEvents is called at page level; we just read from the store
  const eventsLoading = events.length === 0;
  const { isLoading: alertsLoading, createAlert, isCreating } = useAlerts();

  const criticalEvents = events.filter(e => e.severity === 'Critical');
  const highEvents = events.filter(e => e.severity === 'High');

  return (
    <div className="flex flex-col h-full gap-4 p-4 overflow-hidden">

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Events', value: eventStats.total || 0, color: 'text-white', icon: '📡' },
          { label: 'Critical', value: criticalEvents.length, color: 'text-red-400', icon: '🔴' },
          { label: 'High Risk', value: highEvents.length, color: 'text-amber-400', icon: '🟠' },
          { label: 'Alerts Sent', value: alerts.filter(a => a.status === 'sent').length, color: 'text-blue-400', icon: '📨' },
        ].map(stat => (
          <div key={stat.label} className="glass-card text-center py-4">
            <div className="text-xl mb-1">{stat.icon}</div>
            <div className={`text-3xl font-bold ${stat.color}`}>{stat.value}</div>
            <div className="text-xs text-slate-500 mt-1">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Panel Tabs */}
      <div className="flex gap-1 glass rounded-xl p-1">
        {PANELS.map(p => (
          <button
            key={p.id}
            id={`panel-tab-${p.id}`}
            onClick={() => setActivePanel(p.id)}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
              activePanel === p.id
                ? 'bg-brand-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Panel Content */}
      <div className="flex-1 overflow-y-auto">
        {activePanel === 'events' && (
          <div className="space-y-2">
            {eventsLoading ? (
              <div className="flex justify-center py-12"><div className="spinner" /></div>
            ) : events.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <div className="text-4xl mb-3">📡</div>
                <p className="text-sm">Monitoring for events…</p>
              </div>
            ) : (
              events.slice(0, 50).map(event => (
                <AlertCard
                  key={event.id}
                  event={event}
                  onClick={(e) => {
                    setSelectedEvent(e);
                    setShowAlertForm(true);
                    setActivePanel('alerts');
                  }}
                />
              ))
            )}
          </div>
        )}

        {activePanel === 'alerts' && (
          <div className="space-y-4">
            <div className="glass-card">
              <h3 className="text-sm font-semibold text-white mb-3">Create New Alert</h3>
              {selectedEvent && (
                <p className="text-xs text-brand-400 mb-3 bg-brand-500/10 rounded px-2 py-1">
                  Linked to: {selectedEvent.title}
                </p>
              )}
              <AlertForm
                eventId={selectedEvent?.id}
                createAlert={createAlert}
                isCreating={isCreating}
                onSuccess={() => { setSelectedEvent(null); setShowAlertForm(false); }}
              />
            </div>

            <div>
              <h3 className="text-sm font-semibold text-slate-400 mb-2">Recent Alerts</h3>
              {alertsLoading ? (
                <div className="flex justify-center py-4"><div className="spinner" /></div>
              ) : (
                <div className="space-y-2">
                  {alerts.slice(0, 20).map(alert => (
                    <div key={alert.id} id={`alert-row-${alert.id}`} className="glass-card">
                      <div className="flex justify-between items-start gap-2">
                        <div>
                          <p className="text-sm font-medium text-white">{alert.title}</p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            <span className={`severity-${alert.severity?.toLowerCase()}`}>{alert.severity}</span>
                            {' · '}Status: <span className={alert.status === 'sent' ? 'text-emerald-400' : 'text-amber-400'}>{alert.status}</span>
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                  {alerts.length === 0 && (
                    <p className="text-center text-slate-500 text-sm py-4">No alerts sent yet</p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {activePanel === 'resources' && <ResourcePanel />}
        {activePanel === 'monsoon'   && <MonsoonDashboard />}
        {activePanel === 'ndrf'      && <NDRFPanel />}
      </div>
    </div>
  );
}
