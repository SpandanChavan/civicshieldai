/**
 * AlertLogsDrawer.jsx — A3: Alert Delivery Logs Panel
 *
 * Shown when a coordinator clicks an alert row in the "Recent Alerts" list.
 * Fetches GET /api/alerts/:id which returns alert_logs(*) nested, then renders
 * a per-channel delivery status table.
 */
import { useState } from 'react';
import { alertsApi } from '@/services/backendApi';
import { CheckCircle2, XCircle, Loader2, Mail, MessageSquare, Bell, Radio, Hash, ChevronDown, ChevronUp } from 'lucide-react';
import { timeAgo } from '@/utils/formatDate';

const CHANNEL_ICONS = {
  email:      Mail,
  telegram:   Hash,
  whatsapp:   MessageSquare,
  sms:        MessageSquare,
  web_push:   Bell,
  multilingual: Radio,
};

function ChannelIcon({ channel }) {
  const Icon = CHANNEL_ICONS[channel] || Radio;
  return <Icon size={13} className="shrink-0" />;
}

export default function AlertLogsDrawer({ alert }) {
  const [logs, setLogs] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(false);

  const fetchLogs = async () => {
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (logs !== null) return; // already fetched
    setLoading(true);
    try {
      const data = await alertsApi.getById(alert.id);
      setLogs(data?.data?.alert_logs ?? []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const delivered = logs?.filter(l => l.delivered).length ?? 0;
  const failed    = logs?.filter(l => !l.delivered).length ?? 0;

  return (
    <div className="rounded-xl border border-white/10 bg-slate-800/60 overflow-hidden">
      {/* ── Header row — clickable to expand ── */}
      <button
        id={`alert-logs-toggle-${alert.id}`}
        onClick={fetchLogs}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/5 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{alert.title}</p>
          <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
            <span className={`severity-${alert.severity?.toLowerCase()}`}>{alert.severity}</span>
            <span>·</span>
            <span className={alert.status === 'sent' ? 'text-emerald-400' : alert.status === 'failed' ? 'text-red-400' : 'text-amber-400'}>
              {alert.status}
            </span>
            {alert.sent_at && (
              <>
                <span>·</span>
                <span>{timeAgo(alert.sent_at)}</span>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 ml-3 shrink-0">
          {open && logs !== null && (
            <span className="text-[10px] text-slate-500 font-mono">
              {delivered}✓ {failed > 0 && <span className="text-red-400">{failed}✗</span>}
            </span>
          )}
          {open ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
        </div>
      </button>

      {/* ── Delivery logs table ── */}
      {open && (
        <div className="border-t border-white/5 px-4 py-3">
          {loading && (
            <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
              <Loader2 size={13} className="animate-spin" />
              Loading delivery logs…
            </div>
          )}
          {error && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded px-2 py-1">{error}</p>
          )}
          {!loading && !error && logs !== null && (
            logs.length === 0 ? (
              <p className="text-xs text-slate-500 italic">No delivery logs recorded for this alert.</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-500 uppercase tracking-wider text-[10px]">
                    <th className="text-left pb-2 font-semibold">Channel</th>
                    <th className="text-left pb-2 font-semibold">Recipient</th>
                    <th className="text-center pb-2 font-semibold">Status</th>
                    <th className="text-left pb-2 font-semibold">Sent</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {logs.map(log => (
                    <tr key={log.id} className="align-top">
                      <td className="py-1.5 pr-2">
                        <span className="flex items-center gap-1.5 text-slate-300">
                          <ChannelIcon channel={log.channel} />
                          {log.channel}
                        </span>
                      </td>
                      <td className="py-1.5 pr-2 text-slate-400 max-w-[120px] truncate">
                        {log.recipient || '—'}
                      </td>
                      <td className="py-1.5 text-center">
                        {log.delivered ? (
                          <CheckCircle2 size={14} className="text-emerald-400 mx-auto" />
                        ) : (
                          <span className="flex flex-col items-center gap-0.5">
                            <XCircle size={14} className="text-red-400 mx-auto" />
                            {log.error_msg && (
                              <span className="text-[9px] text-red-400/70 max-w-[80px] text-center leading-tight">{log.error_msg}</span>
                            )}
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 text-slate-500">{log.sent_at ? timeAgo(log.sent_at) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          )}
        </div>
      )}
    </div>
  );
}
