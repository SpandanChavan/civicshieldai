/**
 * IngestionHealthPanel.jsx — B1: Data source ingestion health dashboard
 *
 * Fetches GET /api/events/ingestion-health (coordinator/admin only) and renders
 * a per-source status table: lastRun, lastCount, and any lastError.
 * Polls every 60 seconds for live updates.
 */
import { useState, useEffect, useCallback } from 'react';
import { backendApi } from '@/services/backendApi';
import { CheckCircle2, XCircle, Clock, RefreshCw, Activity } from 'lucide-react';
import { timeAgo } from '@/utils/formatDate';

const SOURCE_LABELS = {
  'Earthquake':     'USGS Earthquakes',
  'Wildfire':       'NASA FIRMS Fires',
  'GDACS':          'GDACS Global',
  'EONET':          'NASA EONET',
  'India':          '🇮🇳 India Alerts',
  'IMD':            '🇮🇳 IMD Weather',
  'NCS-Earthquake': '🇮🇳 NCS Seismology',
  'CWC-Flood':      '🇮🇳 CWC Floods',
};

function StatusBadge({ lastRun, lastError }) {
  if (!lastRun && !lastError) {
    return <span className="text-[10px] text-slate-500 flex items-center gap-1"><Clock size={11} />Not yet run</span>;
  }
  if (lastError) {
    return <span className="text-[10px] text-red-400 flex items-center gap-1"><XCircle size={11} />Error</span>;
  }
  return <span className="text-[10px] text-emerald-400 flex items-center gap-1"><CheckCircle2 size={11} />OK</span>;
}

export default function IngestionHealthPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await backendApi.get('/events/ingestion-health');
      setData(res.data);
      setLastRefresh(new Date().toISOString());
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 60_000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
          <Activity size={13} className="text-brand-400" />
          Ingestion Health
        </h3>
        <button
          id="ingestion-health-refresh"
          onClick={fetchHealth}
          className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
          title="Refresh now"
        >
          <RefreshCw size={11} />
          {lastRefresh ? `Updated ${timeAgo(lastRefresh)}` : 'Refresh'}
        </button>
      </div>

      {loading && !data && (
        <div className="text-xs text-slate-500 py-2 text-center animate-pulse">Loading ingestion status…</div>
      )}

      {error && (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {data && (
        <div className="space-y-1.5">
          {data.map(source => (
            <div
              key={source.source}
              id={`ingestion-row-${source.source.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
              className={`rounded-lg border px-3 py-2 ${
                source.lastError
                  ? 'border-red-500/20 bg-red-500/5'
                  : source.lastRun
                  ? 'border-white/5 bg-white/[0.02]'
                  : 'border-white/5 bg-transparent'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-200 truncate">
                    {SOURCE_LABELS[source.source] || source.source}
                  </p>
                  {source.lastError ? (
                    <p className="text-[10px] text-red-400/80 mt-0.5 truncate">{source.lastError}</p>
                  ) : source.lastRun ? (
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      {timeAgo(source.lastRun)} · {source.lastCount} events
                    </p>
                  ) : (
                    <p className="text-[10px] text-slate-600 mt-0.5">Pending first run</p>
                  )}
                </div>
                <StatusBadge lastRun={source.lastRun} lastError={source.lastError} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
