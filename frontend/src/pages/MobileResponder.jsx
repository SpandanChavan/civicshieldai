import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { incidentsApi } from '@/services/backendApi';
import { useDisasterEvents } from '@/hooks/useDisasterEvents';
import useAppStore from '@/store/useAppStore';
import AlertCard from '@/components/alerts/AlertCard';
import { timeAgo } from '@/utils/formatDate';

export default function MobileResponder() {
  const events = useAppStore((s) => s.events);
  const [tab, setTab] = useState('events'); // 'events' | 'report' | 'resources'
  const [reportForm, setReportForm] = useState({
    description: '',
    lat: '',
    lon: '',
  });
  const [reportStatus, setReportStatus] = useState(null);

  useDisasterEvents();

  const submitMutation = useMutation({
    mutationFn: (data) => incidentsApi.create(data),
    onSuccess: () => {
      setReportStatus('success');
      setReportForm({ description: '', lat: '', lon: '' });
    },
    onError: (err) => setReportStatus(`error:${err.message}`),
  });

  const handleGeolocate = () => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setReportForm(f => ({
          ...f,
          lat: pos.coords.latitude.toString(),
          lon: pos.coords.longitude.toString(),
        }));
      },
      () => alert('Unable to get location. Please enter manually.')
    );
  };

  const handleReport = (e) => {
    e.preventDefault();
    if (!reportForm.description || !reportForm.lat || !reportForm.lon) return;
    submitMutation.mutate({
      description: reportForm.description,
      location: { lat: parseFloat(reportForm.lat), lon: parseFloat(reportForm.lon) },
    });
  };

  const criticalEvents = events.filter(e => e.severity === 'Critical');

  return (
    <div className="max-w-lg mx-auto min-h-[calc(100vh-56px)] flex flex-col bg-surface-900">

      {/* Critical Banner */}
      {criticalEvents.length > 0 && (
        <div className="bg-red-600/20 border-b border-red-500/30 px-4 py-3 flex items-center gap-3">
          <span className="text-red-400 text-xl animate-pulse">🚨</span>
          <div>
            <p className="text-xs font-bold text-red-400 uppercase">Critical Event Active</p>
            <p className="text-sm text-white">{criticalEvents[0].title}</p>
          </div>
        </div>
      )}

      {/* Tab Bar */}
      <div className="flex border-b border-white/5 bg-surface-800">
        {[
          { id: 'events', label: '📡 Events' },
          { id: 'report', label: '📷 Report' },
          { id: 'checklist', label: '✅ Checklist' },
        ].map(t => (
          <button
            key={t.id}
            id={`mobile-tab-${t.id}`}
            onClick={() => { setTab(t.id); setReportStatus(null); }}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              tab === t.id
                ? 'text-brand-400 border-b-2 border-brand-400'
                : 'text-slate-400'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-4">

        {tab === 'events' && (
          <div className="space-y-3">
            <h1 className="text-base font-bold text-white">Live Events Near You</h1>
            <p className="text-xs text-slate-500">{events.length} active events being monitored</p>
            <div className="space-y-2">
              {events.slice(0, 30).map(e => (
                <AlertCard key={e.id} event={e} />
              ))}
              {events.length === 0 && (
                <div className="text-center py-12 text-slate-500">
                  <div className="text-4xl mb-3">📡</div>
                  <p>Monitoring for events…</p>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'report' && (
          <div className="space-y-4">
            <h1 className="text-base font-bold text-white">Report an Incident</h1>
            <p className="text-xs text-slate-500">Submit field observations to the operations center</p>

            {reportStatus === 'success' && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 text-center animate-fade-in">
                <div className="text-3xl mb-2">✅</div>
                <p className="text-emerald-400 font-semibold">Report submitted successfully</p>
                <p className="text-xs text-slate-400 mt-1">Operations team has been notified</p>
              </div>
            )}

            {!reportStatus && (
              <form id="incident-report-form" onSubmit={handleReport} className="space-y-4">
                <div>
                  <label htmlFor="incident-desc" className="block text-xs font-medium text-slate-400 mb-1">
                    Situation Description *
                  </label>
                  <textarea
                    id="incident-desc"
                    className="input min-h-[100px] resize-none"
                    placeholder="Describe what you see — people trapped, water level, fire spread, road blockage…"
                    value={reportForm.description}
                    onChange={(e) => setReportForm(f => ({ ...f, description: e.target.value }))}
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Location *</label>
                  <button
                    type="button"
                    id="use-my-location"
                    onClick={handleGeolocate}
                    className="btn-outline w-full justify-center mb-2"
                  >
                    📍 Use My Location
                  </button>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      id="report-lat"
                      className="input"
                      placeholder="Latitude"
                      value={reportForm.lat}
                      onChange={(e) => setReportForm(f => ({ ...f, lat: e.target.value }))}
                      required
                    />
                    <input
                      id="report-lon"
                      className="input"
                      placeholder="Longitude"
                      value={reportForm.lon}
                      onChange={(e) => setReportForm(f => ({ ...f, lon: e.target.value }))}
                      required
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  id="submit-report-btn"
                  disabled={submitMutation.isPending}
                  className="btn-primary w-full justify-center"
                >
                  {submitMutation.isPending ? 'Submitting…' : '📤 Submit Report'}
                </button>
              </form>
            )}
          </div>
        )}

        {tab === 'checklist' && (
          <div className="space-y-4">
            <h1 className="text-base font-bold text-white">Field Responder Checklist</h1>
            {[
              { category: 'On Arrival', items: ['Assess scene safety', 'Establish command post', 'Count and triage casualties', 'Request additional resources if needed'] },
              { category: 'Communication', items: ['Check in with operations center', 'Report GPS coordinates', 'Confirm radio channel', 'Update status every 30 min'] },
              { category: 'Documentation', items: ['Photograph damage', 'Record number of affected families', 'Note resource requirements', 'Submit incident report'] },
            ].map(section => (
              <div key={section.category} className="glass-card">
                <h3 className="text-sm font-semibold text-brand-400 mb-3">{section.category}</h3>
                {section.items.map((item, i) => (
                  <ChecklistItem key={i} label={item} />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ChecklistItem({ label }) {
  const [checked, setChecked] = useState(false);
  return (
    <label className="flex items-center gap-3 py-2 cursor-pointer group">
      <input
        type="checkbox"
        checked={checked}
        onChange={() => setChecked(c => !c)}
        className="accent-brand-500 w-5 h-5 rounded"
      />
      <span className={`text-sm transition-colors ${checked ? 'text-slate-500 line-through' : 'text-slate-300 group-hover:text-white'}`}>
        {label}
      </span>
    </label>
  );
}
