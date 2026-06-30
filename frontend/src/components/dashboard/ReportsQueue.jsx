import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { backendApi } from '@/services/backendApi';
import { useAuth } from '@/hooks/useAuth';
import useAppStore from '@/store/useAppStore';
import { Clock, Search, CheckCircle2, XCircle, Check, ClipboardList, MapPin, User, CheckCircle, X, Sparkles } from 'lucide-react';

const STATUS_STYLES = {
  pending_review: { color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30', label: <span className="flex items-center gap-1"><Clock size={12}/> Pending</span> },
  under_review:   { color: 'text-blue-400',  bg: 'bg-blue-500/10 border-blue-500/30',   label: <span className="flex items-center gap-1"><Search size={12}/> Reviewing</span> },
  approved:       { color: 'text-emerald-400',bg: 'bg-emerald-500/10 border-emerald-500/30', label: <span className="flex items-center gap-1"><CheckCircle2 size={12}/> Approved</span> },
  rejected:       { color: 'text-red-400',    bg: 'bg-red-500/10 border-red-500/30',     label: <span className="flex items-center gap-1"><XCircle size={12}/> Rejected</span> },
  resolved:       { color: 'text-slate-400',  bg: 'bg-slate-700/50 border-slate-600/30', label: <span className="flex items-center gap-1"><Check size={12}/> Resolved</span> },
};

function RejectModal({ report, onClose, onReject }) {
  const [reason, setReason] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-md rounded-2xl p-6 space-y-4" style={{ background: '#1a1b2e', border: '1px solid rgba(239,68,68,0.3)' }}>
        <h3 className="text-white font-bold text-lg flex items-center gap-2"><XCircle className="text-red-500" size={20} /> Reject Report</h3>
        <p className="text-slate-400 text-sm truncate">"{report.description?.slice(0, 80)}…"</p>
        <div>
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Rejection Reason *</label>
          <textarea
            className="mt-1.5 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-red-500 min-h-[80px]"
            placeholder="Explain why this report is being rejected (shown to the citizen)..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-medium text-slate-400 border border-white/10 hover:bg-white/5">
            Cancel
          </button>
          <button
            onClick={() => reason.trim().length >= 5 && onReject(reason)}
            disabled={reason.trim().length < 5}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Confirm Reject
          </button>
        </div>
      </div>
    </div>
  );
}

function ApproveModal({ report, onClose, onApprove }) {
  const [eventType, setEventType] = useState(report.category || 'flood');
  // E1: pre-fill severity with the AI photo classifier's suggestion (coordinator can override)
  const [severity, setSeverity] = useState(report.ai_classification?.suggested_severity || 'Medium');

  const CATEGORIES = ['flood', 'fire', 'earthquake_damage', 'missing_person', 'road_blockage', 'medical_emergency', 'infrastructure_damage', 'landslide', 'cyclone', 'heatwave', 'other'];
  const SEVERITIES = ['Low', 'Medium', 'High', 'Critical'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-md rounded-2xl p-6 space-y-4" style={{ background: '#1a1b2e', border: '1px solid rgba(16,185,129,0.3)' }}>
        <h3 className="text-white font-bold text-lg flex items-center gap-2"><CheckCircle2 className="text-emerald-500" size={20} /> Approve Report</h3>
        <p className="text-slate-400 text-sm truncate">"{report.description?.slice(0, 80)}…"</p>
        
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Event Type *</label>
            <select
              className="mt-1.5 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 appearance-none"
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
            >
              {CATEGORIES.map(c => <option key={c} value={c} className="bg-slate-800">{c.replace('_', ' ')}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Severity *</label>
            <select
              className="mt-1.5 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 appearance-none"
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
            >
              {SEVERITIES.map(s => <option key={s} value={s} className="bg-slate-800">{s}</option>)}
            </select>
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-medium text-slate-400 border border-white/10 hover:bg-white/5">
            Cancel
          </button>
          <button
            onClick={() => onApprove({ event_type: eventType, severity })}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-500"
          >
            Confirm Approve
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ReportsQueue() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const addNotification = useAppStore(state => state.addNotification);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [approveTarget, setApproveTarget] = useState(null);
  const [filter, setFilter] = useState('pending_review');

  const stateName = profile?.states?.name;

  const { data, isLoading } = useQuery({
    queryKey: ['incidents', filter],
    queryFn: () => backendApi.get(`/incidents${filter !== 'all' ? `?status=${filter}` : ''}`),
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });

  const reports = data?.data || [];

  const approveMutation = useMutation({
    mutationFn: ({ id, payload }) => backendApi.patch(`/incidents/${id}/approve`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      setApproveTarget(null);
    },
    onError: (err) => {
      addNotification({ 
        title: 'Approval Failed', 
        message: err.response?.data?.error || err.message, 
        type: 'error' 
      });
    }
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }) => backendApi.patch(`/incidents/${id}/reject`, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      setRejectTarget(null);
    },
    onError: (err) => {
      addNotification({ 
        title: 'Rejection Failed', 
        message: err.response?.data?.error || err.message, 
        type: 'error' 
      });
    }
  });

  const pendingCount = reports.filter(r => r.status === 'pending_review').length;

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h3 className="text-sm font-bold text-white">Citizen Reports</h3>
          {stateName && <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1"><MapPin size={12} /> {stateName} jurisdiction</p>}
        </div>
        {pendingCount > 0 && (
          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse">
            {pendingCount} pending
          </span>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 rounded-xl p-1 flex-shrink-0" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
        {[
          { value: 'pending_review', label: <span className="flex items-center gap-1 justify-center"><Clock size={14}/> Pending</span> },
          { value: 'approved',       label: <span className="flex items-center gap-1 justify-center"><CheckCircle2 size={14}/> Approved</span> },
          { value: 'rejected',       label: <span className="flex items-center gap-1 justify-center"><XCircle size={14}/> Rejected</span> },
          { value: 'all',            label: <span className="flex items-center gap-1 justify-center"><ClipboardList size={14}/> All</span> },
        ].map(f => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`flex-1 py-1.5 px-1 rounded-lg text-xs font-medium transition-all ${
              filter === f.value ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Report list */}
      <div className="flex-1 overflow-y-auto space-y-3">
        {isLoading ? (
          <div className="text-center py-8 text-slate-500 text-sm">Loading reports…</div>
        ) : reports.length === 0 ? (
          <div className="text-center py-10 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <ClipboardList className="mx-auto mb-2 text-slate-500" size={32} />
            <p className="text-slate-400 text-sm">No {filter !== 'all' ? filter.replace('_', ' ') : ''} reports</p>
          </div>
        ) : (
          reports.map(report => {
            const statusStyle = STATUS_STYLES[report.status] || STATUS_STYLES.pending_review;
            const isPending = report.status === 'pending_review';
            return (
              <div
                key={report.id}
                className="rounded-xl p-3 space-y-2"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                {/* Status + time */}
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusStyle.color} ${statusStyle.bg}`}>
                    {statusStyle.label}
                  </span>
                  <span className="text-[10px] text-slate-600">
                    {new Date(report.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                {/* Description */}
                <p className="text-xs text-slate-300 leading-relaxed">
                  {report.description?.slice(0, 150)}{report.description?.length > 150 ? '…' : ''}
                </p>

                {/* Media Preview */}
                {report.media_urls?.length > 0 && (
                  <div className="w-full h-32 rounded-lg overflow-hidden border border-white/10 mt-2">
                    <img src={report.media_urls[0]} alt="Incident media" className="w-full h-full object-cover" />
                  </div>
                )}

                {/* AI photo classification (E1) */}
                {report.ai_classification?.available && (
                  <div className="flex items-center gap-1.5 text-[10px] rounded px-2 py-1 bg-indigo-500/10 border border-indigo-500/20 text-indigo-300">
                    <Sparkles size={11} className="flex-shrink-0" />
                    <span>
                      AI sees <span className="font-semibold capitalize">{report.ai_classification.damage_type?.replace('_', ' ')}</span>
                      {' '}· suggests <span className="font-semibold">{report.ai_classification.suggested_severity}</span>
                      {' '}<span className="text-indigo-400/60">({Math.round((report.ai_classification.confidence || 0) * 100)}%)</span>
                    </span>
                  </div>
                )}

                {/* Reporter info */}
                {(report.reporter_name || report.reporter_contact) && (
                  <p className="text-[10px] text-slate-500 flex items-center gap-1">
                    <User size={10} /> {report.reporter_name || 'Anonymous'}{report.reporter_contact ? ` · ${report.reporter_contact}` : ''}
                  </p>
                )}

                {/* Rejection reason */}
                {report.status === 'rejected' && report.rejection_reason && (
                  <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded px-2 py-1">
                    Reason: {report.rejection_reason}
                  </p>
                )}

                {/* Action buttons — only for pending */}
                {isPending && (
                  <div className="flex gap-2 pt-1">
                    <button
                      id={`approve-report-${report.id}`}
                      onClick={() => setApproveTarget(report)}
                      disabled={approveMutation.isPending}
                      className="flex-1 py-2 flex items-center justify-center gap-1 rounded-lg text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 disabled:opacity-50 transition-all"
                    >
                      <CheckCircle size={14} /> Approve
                    </button>
                    <button
                      id={`reject-report-${report.id}`}
                      onClick={() => setRejectTarget(report)}
                      className="flex-1 py-2 flex items-center justify-center gap-1 rounded-lg text-xs font-semibold text-red-400 bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 transition-all"
                    >
                      <X size={14} /> Reject
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Reject modal */}
      {rejectTarget && (
        <RejectModal
          report={rejectTarget}
          onClose={() => setRejectTarget(null)}
          onReject={(reason) => rejectMutation.mutate({ id: rejectTarget.id, reason })}
        />
      )}

      {/* Approve modal */}
      {approveTarget && (
        <ApproveModal
          report={approveTarget}
          onClose={() => setApproveTarget(null)}
          onApprove={(payload) => approveMutation.mutate({ id: approveTarget.id, payload })}
        />
      )}
    </div>
  );
}
