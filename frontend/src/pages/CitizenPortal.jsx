import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/services/supabaseClient';
import { useAuth } from '@/hooks/useAuth';
import useAppStore from '@/store/useAppStore';
import { backendApi } from '@/services/backendApi';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle, FileText, MapPin, Send, X,
  CheckCircle2, Clock, Eye, XCircle, CheckSquare,
  ChevronRight, Radio, Plus, ExternalLink,
} from 'lucide-react';

const STATUS_CONFIG = {
  pending_review: { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)', icon: Clock,        label: 'Pending Review' },
  under_review:   { color: '#3b82f6', bg: 'rgba(59,130,246,0.12)',  border: 'rgba(59,130,246,0.3)',  icon: Eye,          label: 'Under Review'   },
  approved:       { color: '#10b981', bg: 'rgba(16,185,129,0.12)',   border: 'rgba(16,185,129,0.3)',  icon: CheckCircle2, label: 'Approved'       },
  rejected:       { color: '#ef4444', bg: 'rgba(239,68,68,0.12)',    border: 'rgba(239,68,68,0.3)',   icon: XCircle,      label: 'Rejected'       },
  resolved:       { color: '#64748b', bg: 'rgba(100,116,139,0.12)', border: 'rgba(100,116,139,0.3)', icon: CheckSquare,  label: 'Resolved'       },
};

const SEV_CONFIG = {
  Critical: { color: '#ef4444', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.3)' },
  High:     { color: '#f97316', bg: 'rgba(249,115,22,0.12)', border: 'rgba(249,115,22,0.3)' },
  Medium:   { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)' },
  Low:      { color: '#3b82f6', bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.3)' },
};

const sharedStyles = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
  * { box-sizing: border-box; }
  .cp-input, .cp-textarea { transition: border-color 0.2s, box-shadow 0.2s; }
  .cp-input:focus, .cp-textarea:focus { outline: none; border-color: #00A693 !important; box-shadow: 0 0 0 3px rgba(0,166,147,0.12); }
  .cp-btn-primary { transition: all 0.2s; }
  .cp-btn-primary:hover:not(:disabled) { background: #00bfa6 !important; transform: translateY(-1px); box-shadow: 0 8px 28px rgba(0,166,147,0.45) !important; }
  .cp-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .cp-card { transition: border-color 0.15s, background 0.15s; }
  .cp-card:hover { border-color: rgba(0,166,147,0.2) !important; background: rgba(0,166,147,0.03) !important; }
  @keyframes cpPing { 75%, 100% { transform: scale(2); opacity: 0; } }
`;

export default function CitizenPortal() {
  const { user, profile } = useAuth();
  const events = useAppStore((s) => s.events);

  const [myReports, setMyReports] = useState([]);
  const [loadingReports, setLoadingReports] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [formError, setFormError] = useState('');
  const [location, setLocation] = useState(null);
  const [locationError, setLocationError] = useState('');
  const [form, setForm] = useState({
    description: '',
    reporter_name: profile?.full_name || '',
    reporter_contact: user?.email || '',
  });

  const nearbyEvents = events.filter(e => e.is_active).slice(0, 5);
  const criticalCount = events.filter(e => e.severity === 'Critical').length;

  useEffect(() => { fetchMyReports(); }, []);
  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
        () => setLocationError('Location access denied.')
      );
    }
  }, []);

  const fetchMyReports = async () => {
    setLoadingReports(true);
    try {
      const res = await backendApi.get('/incidents');
      setMyReports(res.data || []);
    } catch (e) { console.error(e); }
    finally { setLoadingReports(false); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!location) { setFormError('Location is required. Please allow location access.'); return; }
    if (form.description.trim().length < 10) { setFormError('Description must be at least 10 characters.'); return; }
    setSubmitting(true);
    try {
      await backendApi.post('/incidents', {
        description: form.description,
        reporter_name: form.reporter_name,
        reporter_contact: form.reporter_contact,
        location,
      });
      setSubmitSuccess(true);
      setShowForm(false);
      setForm({ description: '', reporter_name: profile?.full_name || '', reporter_contact: user?.email || '' });
      fetchMyReports();
      setTimeout(() => setSubmitSuccess(false), 5000);
    } catch (err) {
      setFormError(err.message || 'Failed to submit report.');
    } finally { setSubmitting(false); }
  };

  return (
    <div style={{ minHeight: 'calc(100vh - 56px)', background: 'radial-gradient(ellipse at 30% 0%, #011a14 0%, #010a08 60%, #020810 100%)', fontFamily: "'Inter', sans-serif" }}>
      <style>{sharedStyles}</style>

      {/* Ambient orbs */}
      <div style={{ position: 'fixed', top: '-10%', right: '-10%', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,166,147,0.1) 0%, transparent 70%)', filter: 'blur(50px)', pointerEvents: 'none', zIndex: 0 }} />
      <div style={{ position: 'fixed', bottom: '-10%', left: '-5%', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 70%)', filter: 'blur(45px)', pointerEvents: 'none', zIndex: 0 }} />

      <div style={{ position: 'relative', zIndex: 1 }}>

        {/* ── Hero header ───────────────────────────────── */}
        <div style={{ borderBottom: '1px solid rgba(0,166,147,0.12)', padding: '28px 0', background: 'rgba(6,14,22,0.6)', backdropFilter: 'blur(20px)' }}>
          <div style={{ maxWidth: 960, margin: '0 auto', padding: '0 24px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 12, background: 'rgba(0,166,147,0.15)', border: '1px solid rgba(0,166,147,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Radio size={18} color="#00A693" />
                  </div>
                  <div>
                    <h1 style={{ fontSize: 22, fontWeight: 900, color: 'white', margin: 0, letterSpacing: '-0.3px' }}>Citizen Portal</h1>
                    <p style={{ fontSize: 12, color: '#475569', margin: 0 }}>
                      Welcome, <span style={{ color: '#00A693', fontWeight: 600 }}>{profile?.full_name || user?.email}</span>
                    </p>
                  </div>
                </div>
              </div>

              <button id="report-incident-btn" onClick={() => setShowForm(true)}
                className="cp-btn-primary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 20px', borderRadius: 12, border: 'none', background: '#ef4444', color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 20px rgba(239,68,68,0.3)' }}>
                <Plus size={15} /> Report Incident
              </button>
            </div>

            {/* Stats row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 20 }}>
              {[
                { icon: Radio,        value: events.filter(e => e.is_active).length, label: 'Active Events', color: '#8b5cf6' },
                { icon: AlertTriangle,value: criticalCount,                           label: 'Critical',       color: '#ef4444' },
                { icon: FileText,     value: myReports.length,                        label: 'My Reports',     color: '#00A693' },
              ].map(s => {
                const IconComp = s.icon;
                return (
                  <div key={s.label} style={{ padding: '14px 16px', borderRadius: 14, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${s.color}18`, border: `1px solid ${s.color}35`, flexShrink: 0 }}>
                      <IconComp size={16} color={s.color} />
                    </div>
                    <div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: 'white', lineHeight: 1 }}>{s.value}</div>
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{s.label}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Main content ──────────────────────────────── */}
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: 28 }}>

          {/* Success banner */}
          <AnimatePresence>
            {submitSuccess && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderRadius: 12, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)' }}>
                <CheckCircle2 size={16} color="#10b981" />
                <span style={{ fontSize: 13, color: '#10b981', fontWeight: 600 }}>Report submitted! A Coordinator will review it shortly.</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Incident form ─────────────────────────────── */}
          <AnimatePresence>
            {showForm && (
              <motion.div key="incident-form"
                initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
                style={{ borderRadius: 20, border: '1px solid rgba(239,68,68,0.25)', background: 'rgba(6,14,22,0.85)', backdropFilter: 'blur(20px)', overflow: 'hidden' }}>
                {/* Form header */}
                <div style={{ padding: '18px 22px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(239,68,68,0.06)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 9, background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <AlertTriangle size={15} color="#ef4444" />
                    </div>
                    <div>
                      <h2 style={{ fontSize: 15, fontWeight: 800, color: 'white', margin: 0 }}>Report an Incident</h2>
                      <p style={{ fontSize: 11, color: '#64748b', margin: 0 }}>Your report will be reviewed by local coordinators</p>
                    </div>
                  </div>
                  <button onClick={() => setShowForm(false)} style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                    <X size={14} />
                  </button>
                </div>

                <form onSubmit={handleSubmit} style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {formError && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                      <AlertTriangle size={13} color="#ef4444" />
                      <span style={{ fontSize: 13, color: '#ef4444' }}>{formError}</span>
                    </div>
                  )}

                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 7 }}>Description *</label>
                    <textarea id="incident-description" value={form.description}
                      onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                      required placeholder="Describe what happened, extent of damage, number of people affected…"
                      className="cp-textarea"
                      style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 10, padding: '11px 14px', fontSize: 14, color: 'white', minHeight: 100, resize: 'vertical' }} />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 7 }}>Your Name</label>
                      <input value={form.reporter_name} onChange={e => setForm(f => ({ ...f, reporter_name: e.target.value }))}
                        placeholder="Full name" className="cp-input"
                        style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 10, padding: '11px 14px', fontSize: 14, color: 'white' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 7 }}>Contact</label>
                      <input value={form.reporter_contact} onChange={e => setForm(f => ({ ...f, reporter_contact: e.target.value }))}
                        placeholder="Phone / email" className="cp-input"
                        style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 10, padding: '11px 14px', fontSize: 14, color: 'white' }} />
                    </div>
                  </div>

                  {/* Location status */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8, background: location ? 'rgba(16,185,129,0.06)' : 'rgba(255,255,255,0.03)', border: `1px solid ${location ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.07)'}` }}>
                    <MapPin size={13} color={location ? '#10b981' : '#64748b'} />
                    {location ? (
                      <span style={{ fontSize: 12, color: '#10b981', fontWeight: 600 }}>Location detected: {location.lat.toFixed(4)}, {location.lon.toFixed(4)}</span>
                    ) : locationError ? (
                      <span style={{ fontSize: 12, color: '#f59e0b' }}>{locationError}</span>
                    ) : (
                      <span style={{ fontSize: 12, color: '#64748b' }}>Detecting your location…</span>
                    )}
                  </div>

                  <button type="submit" id="incident-submit-btn" disabled={submitting || !location}
                    className="cp-btn-primary"
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '13px', borderRadius: 12, border: 'none', background: '#ef4444', color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 20px rgba(239,68,68,0.3)' }}>
                    {submitting ? (
                      <><div style={{ width: 15, height: 15, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', animation: 'spin 0.7s linear infinite' }} /> Submitting…</>
                    ) : (
                      <><Send size={14} /> Submit Report</>
                    )}
                  </button>
                </form>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── My Reports ─────────────────────────────────── */}
          <section>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(0,166,147,0.12)', border: '1px solid rgba(0,166,147,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <FileText size={14} color="#00A693" />
                </div>
                <h2 style={{ fontSize: 16, fontWeight: 800, color: 'white', margin: 0 }}>My Reports</h2>
              </div>
              {myReports.length > 0 && (
                <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 999, background: 'rgba(0,166,147,0.1)', border: '1px solid rgba(0,166,147,0.2)', color: '#00A693', fontWeight: 700 }}>
                  {myReports.length} total
                </span>
              )}
            </div>

            {loadingReports ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#475569', fontSize: 13 }}>Loading your reports…</div>
            ) : myReports.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 0', borderRadius: 18, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <FileText size={36} color="#1e293b" style={{ margin: '0 auto 12px' }} />
                <p style={{ fontSize: 14, color: '#475569', margin: '0 0 16px' }}>No reports submitted yet.</p>
                <button onClick={() => setShowForm(true)}
                  style={{ padding: '9px 20px', borderRadius: 10, background: 'transparent', border: '1px solid rgba(0,166,147,0.3)', color: '#00A693', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  Submit your first report
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {myReports.map((report, i) => {
                  const s = STATUS_CONFIG[report.status] || STATUS_CONFIG.pending_review;
                  const StatusIcon = s.icon;
                  return (
                    <motion.div key={report.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                      className="cp-card"
                      style={{ padding: '16px 18px', borderRadius: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                        <p style={{ fontSize: 13, color: '#cbd5e1', flex: 1, lineHeight: 1.55, margin: 0 }}>
                          {report.description?.slice(0, 140)}{report.description?.length > 140 ? '…' : ''}
                        </p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 999, background: s.bg, border: `1px solid ${s.border}`, flexShrink: 0 }}>
                          <StatusIcon size={11} color={s.color} />
                          <span style={{ fontSize: 10, fontWeight: 700, color: s.color }}>{s.label}</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 10 }}>
                        <span style={{ fontSize: 11, color: '#334155', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Clock size={10} /> {new Date(report.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </span>
                        {report.reviewed_at && (
                          <span style={{ fontSize: 11, color: '#334155', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Eye size={10} /> Reviewed {new Date(report.reviewed_at).toLocaleDateString('en-IN')}
                          </span>
                        )}
                      </div>
                      {report.status === 'rejected' && report.rejection_reason && (
                        <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', fontSize: 12, color: '#ef4444' }}>
                          Rejection reason: {report.rejection_reason}
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            )}
          </section>

          {/* ── Active Disaster Events ────────────────────── */}
          <section>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ position: 'relative', width: 28, height: 28, flexShrink: 0 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <AlertTriangle size={14} color="#ef4444" />
                  </div>
                  {criticalCount > 0 && <div style={{ position: 'absolute', top: -2, right: -2, width: 8, height: 8, borderRadius: '50%', background: '#ef4444', animation: 'cpPing 1.5s ease infinite' }} />}
                </div>
                <h2 style={{ fontSize: 16, fontWeight: 800, color: 'white', margin: 0 }}>Active Disaster Events</h2>
              </div>
              <Link to="/portal" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#00A693', fontWeight: 600, textDecoration: 'none' }}>
                View on map <ExternalLink size={12} />
              </Link>
            </div>

            {nearbyEvents.length === 0 ? (
              <div style={{ padding: '20px', borderRadius: 14, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', textAlign: 'center' }}>
                <p style={{ fontSize: 13, color: '#475569', margin: 0 }}>No active events detected right now.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {nearbyEvents.map((event, i) => {
                  const sev = SEV_CONFIG[event.severity] || SEV_CONFIG.Low;
                  return (
                    <motion.div key={event.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }}
                      className="cp-card"
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '13px 16px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 600, color: 'white', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{event.title}</p>
                        <p style={{ fontSize: 11, color: '#475569', margin: '3px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{event.event_type} · {event.source}</p>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: sev.bg, border: `1px solid ${sev.border}`, color: sev.color, flexShrink: 0 }}>
                        {event.severity}
                      </span>
                    </motion.div>
                  );
                })}
                <Link to="/portal"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '11px', borderRadius: 12, border: '1px solid rgba(0,166,147,0.2)', background: 'rgba(0,166,147,0.04)', color: '#00A693', fontSize: 13, fontWeight: 600, textDecoration: 'none', marginTop: 4 }}>
                  View all events on map <ChevronRight size={14} />
                </Link>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
