import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Navigate, Link } from 'react-router-dom';
import { supabase } from '@/services/supabaseClient';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Globe2, AlertTriangle, FileText, Users,
  RefreshCw, MapPin, ChevronDown, Activity,
  Shield, Clock, CheckCircle2, XCircle,
} from 'lucide-react';

const TABS = [
  { id: 'overview',     label: 'Overview',    icon: Globe2       },
  { id: 'coordinators', label: 'Coordinators',icon: Users        },
  { id: 'users',        label: 'Users',       icon: Shield       },
  { id: 'audit',        label: 'Audit Log',   icon: Activity     },
];

const ADMIN_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
  * { box-sizing: border-box; }
  .adm-table tr:hover td { background: rgba(0,166,147,0.04); }
  .adm-select { transition: border-color 0.15s; }
  .adm-select:focus { outline: none; border-color: #00A693 !important; }
  .adm-refresh:hover { background: rgba(0,166,147,0.12) !important; border-color: rgba(0,166,147,0.35) !important; color: #00A693 !important; }
  .adm-tab:hover { color: white !important; }
`;

async function apiFetch(path, options = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const headers = { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' };
  const apiBase = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:4000`;
  const res = await fetch(`${apiBase}${path}`, { headers, ...options });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Request failed');
  return json;
}

const ROLE_COLORS = {
  admin:       { color: '#ef4444', bg: 'rgba(239,68,68,0.12)',    border: 'rgba(239,68,68,0.3)'    },
  coordinator: { color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)',   border: 'rgba(139,92,246,0.3)'   },
  citizen:     { color: '#00A693', bg: 'rgba(0,166,147,0.12)',    border: 'rgba(0,166,147,0.3)'    },
};

const AUDIT_COLORS = {
  APPROVED: { color: '#10b981', bg: 'rgba(16,185,129,0.1)',  border: 'rgba(16,185,129,0.25)' },
  REJECTED: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.25)'  },
  ALERT:    { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.25)' },
  DEFAULT:  { color: '#64748b', bg: 'rgba(100,116,139,0.1)', border: 'rgba(100,116,139,0.2)' },
};

function getAuditColor(type) {
  if (type?.includes('APPROVED')) return AUDIT_COLORS.APPROVED;
  if (type?.includes('REJECTED')) return AUDIT_COLORS.REJECTED;
  if (type?.includes('ALERT'))    return AUDIT_COLORS.ALERT;
  return AUDIT_COLORS.DEFAULT;
}

export default function AdminDashboard() {
  const { role, loading } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [stats, setStats] = useState(null);
  const [coordinators, setCoordinators] = useState([]);
  const [states, setStates] = useState([]);
  const [users, setUsers] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => { if (role === 'admin') fetchAll(); }, [role]);

  const fetchAll = async () => {
    setFetching(true);
    setError(null);
    try {
      const [statsRes, coordsRes, statesRes, usersRes, auditRes] = await Promise.all([
        apiFetch('/api/admin/stats'),
        apiFetch('/api/admin/coordinators'),
        apiFetch('/api/states'),
        apiFetch('/api/admin/users'),
        apiFetch('/api/admin/audit-logs?limit=50'),
      ]);
      setStats(statsRes.data);
      setCoordinators(coordsRes.data || []);
      setStates(statesRes.data || []);
      setUsers(usersRes.data || []);
      setAuditLogs(auditRes.data || []);
    } catch (err) { setError(err.message); }
    finally { setFetching(false); }
  };

  const handleReassign = async (coordinatorId, newStateId) => {
    try {
      const updated = await apiFetch(`/api/admin/coordinators/${coordinatorId}`, { method: 'PATCH', body: JSON.stringify({ state_id: newStateId || null }) });
      setCoordinators(prev => prev.map(c => c.id === coordinatorId ? updated.data : c));
    } catch (err) { alert(`Error: ${err.message}`); }
  };

  const handleRoleChange = async (userId, newRole) => {
    try {
      await apiFetch(`/api/admin/users/${userId}`, { method: 'PATCH', body: JSON.stringify({ role: newRole }) });
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
    } catch (err) { alert(`Error: ${err.message}`); }
  };

  if (loading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#010a08' }}><LoadingSpinner /></div>;
  if (role !== 'admin') return <Navigate to="/portal" replace />;

  const STAT_CARDS = stats ? [
    { icon: Activity,      label: 'Active Events',  value: stats.totals.activeEvents,      color: '#8b5cf6' },
    { icon: AlertTriangle, label: 'Total Alerts',   value: stats.totals.totalAlerts,       color: '#ef4444' },
    { icon: FileText,      label: 'Incident Reports',value: stats.totals.totalReports,     color: '#f59e0b' },
    { icon: Users,         label: 'Coordinators',   value: stats.totals.totalCoordinators, color: '#00A693' },
  ] : [];

  return (
    <div style={{ minHeight: 'calc(100vh - 56px)', background: 'radial-gradient(ellipse at 70% 0%, #011a14 0%, #010a08 60%, #020810 100%)', fontFamily: "'Inter', sans-serif" }}>
      <style>{ADMIN_STYLES}</style>

      {/* Ambient orbs */}
      <div style={{ position: 'fixed', top: '-15%', right: '-8%', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,92,246,0.09) 0%, transparent 70%)', filter: 'blur(50px)', pointerEvents: 'none', zIndex: 0 }} />
      <div style={{ position: 'fixed', bottom: '-10%', left: '-5%', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,166,147,0.07) 0%, transparent 70%)', filter: 'blur(45px)', pointerEvents: 'none', zIndex: 0 }} />

      <div style={{ position: 'relative', zIndex: 1 }}>

        {/* ── Hero Header ─────────────────────────────── */}
        <div style={{ borderBottom: '1px solid rgba(139,92,246,0.15)', background: 'rgba(6,14,22,0.6)', backdropFilter: 'blur(20px)', padding: '28px 0' }}>
          <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 42, height: 42, borderRadius: 13, background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Shield size={20} color="#8b5cf6" />
                </div>
                <div>
                  <h1 style={{ fontSize: 22, fontWeight: 900, color: 'white', margin: 0, letterSpacing: '-0.3px' }}>Admin Command Center</h1>
                  <p style={{ fontSize: 12, color: '#475569', margin: 0 }}>Full platform visibility · All states · All data</p>
                </div>
              </div>
              <button onClick={fetchAll} className="adm-refresh"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)', color: '#64748b', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s' }}>
                <RefreshCw size={14} /> Refresh
              </button>
            </div>

            {/* Stat cards */}
            {stats && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginTop: 22 }}>
                {STAT_CARDS.map((s, i) => {
                  const IconComp = s.icon;
                  return (
                    <motion.div key={s.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
                      style={{ padding: '16px', borderRadius: 14, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 38, height: 38, borderRadius: 11, background: `${s.color}18`, border: `1px solid ${s.color}35`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <IconComp size={17} color={s.color} />
                      </div>
                      <div>
                        <div style={{ fontSize: 24, fontWeight: 900, color: 'white', lineHeight: 1 }}>{s.value ?? '—'}</div>
                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>{s.label}</div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Body ─────────────────────────────────────── */}
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '28px 28px' }}>

          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderRadius: 12, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', marginBottom: 24 }}>
              <AlertTriangle size={14} color="#ef4444" />
              <span style={{ fontSize: 13, color: '#ef4444' }}>{error}</span>
            </div>
          )}

          {/* Tab bar */}
          <div style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', marginBottom: 24, width: 'fit-content' }}>
            {TABS.map(tab => {
              const IconComp = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)} className="adm-tab"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 18px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, transition: 'all 0.15s',
                    background: isActive ? '#00A693' : 'transparent',
                    color: isActive ? 'white' : '#64748b',
                    boxShadow: isActive ? '0 4px 14px rgba(0,166,147,0.3)' : 'none',
                  }}>
                  <IconComp size={14} />{tab.label}
                </button>
              );
            })}
          </div>

          {fetching ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}><LoadingSpinner label="Loading admin data…" /></div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div key={activeTab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>

                {/* ── OVERVIEW ── */}
                {activeTab === 'overview' && stats && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    {/* State breakdown table */}
                    <div>
                      <h2 style={{ fontSize: 15, fontWeight: 800, color: 'white', margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Globe2 size={16} color="#00A693" /> State-wise Breakdown
                      </h2>
                      <div style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}>
                        <table className="adm-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
                              {['State', 'Active Events', 'Reports', 'Pending Review'].map(h => (
                                <th key={h} style={{ padding: '12px 18px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {stats.stateBreakdown.filter(s => s.events > 0 || s.reports > 0).slice(0, 15).map((s, i) => (
                              <tr key={s.code} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                                <td style={{ padding: '12px 18px', fontWeight: 600, color: 'white', fontSize: 13 }}>
                                  {s.name} <span style={{ fontSize: 10, color: '#334155', fontWeight: 700 }}>({s.code})</span>
                                </td>
                                <td style={{ padding: '12px 18px', color: '#8b5cf6', fontWeight: 700, fontSize: 14 }}>{s.events}</td>
                                <td style={{ padding: '12px 18px', color: '#94a3b8', fontSize: 13 }}>{s.reports}</td>
                                <td style={{ padding: '12px 18px' }}>
                                  {s.pendingReports > 0
                                    ? <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b' }}>{s.pendingReports} pending</span>
                                    : <span style={{ color: '#1e293b' }}>—</span>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Status cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                      {[
                        { title: 'Reports by Status',  data: stats.reportsByStatus,  icon: FileText,      color: '#f59e0b' },
                        { title: 'Alerts by Status',   data: stats.alertsByStatus,   icon: AlertTriangle, color: '#ef4444' },
                      ].map(card => {
                        const IconComp = card.icon;
                        return (
                          <div key={card.title} style={{ padding: '20px', borderRadius: 16, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                            <h3 style={{ fontSize: 13, fontWeight: 800, color: 'white', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 7 }}>
                              <IconComp size={14} color={card.color} /> {card.title}
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                              {Object.entries(card.data || {}).map(([status, count]) => (
                                <div key={status} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                  <span style={{ fontSize: 12, color: '#64748b', textTransform: 'capitalize' }}>{status.replace(/_/g, ' ')}</span>
                                  <span style={{ fontSize: 14, fontWeight: 700, color: 'white' }}>{count}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ── COORDINATORS ── */}
                {activeTab === 'coordinators' && (
                  <div style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}>
                    <table className="adm-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
                          {['Name', 'Current State', 'Reassign to'].map(h => (
                            <th key={h} style={{ padding: '14px 20px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {coordinators.length === 0 ? (
                          <tr><td colSpan={3} style={{ padding: '40px', textAlign: 'center', color: '#475569', fontSize: 13 }}>No coordinators found.</td></tr>
                        ) : coordinators.map(c => (
                          <tr key={c.id} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                            <td style={{ padding: '14px 20px', fontWeight: 600, color: 'white', fontSize: 13 }}>{c.full_name}</td>
                            <td style={{ padding: '14px 20px' }}>
                              {c.states
                                ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 8, background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.25)', fontSize: 11, fontWeight: 700, color: '#8b5cf6' }}>
                                    <MapPin size={11} /> {c.states.name} ({c.states.code})
                                  </span>
                                : <span style={{ fontSize: 12, color: '#334155', fontStyle: 'italic' }}>Unassigned</span>}
                            </td>
                            <td style={{ padding: '14px 20px' }}>
                              <select value={c.state_id || ''} onChange={e => handleReassign(c.id, e.target.value)} className="adm-select"
                                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', fontSize: 12, borderRadius: 8, padding: '7px 12px', minWidth: 180, cursor: 'pointer' }}>
                                <option value="" style={{ background: '#06131a' }}>-- Unassigned --</option>
                                {states.map(s => <option key={s.id} value={s.id} style={{ background: '#06131a' }}>{s.name}</option>)}
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* ── USERS ── */}
                {activeTab === 'users' && (
                  <div style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}>
                    <table className="adm-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
                          {['Name', 'Role', 'State', 'Joined', 'Change Role'].map(h => (
                            <th key={h} style={{ padding: '14px 20px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {users.map(u => {
                          const rc = ROLE_COLORS[u.role] || ROLE_COLORS.citizen;
                          return (
                            <tr key={u.id} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                              <td style={{ padding: '12px 20px', fontWeight: 600, color: 'white', fontSize: 13 }}>{u.full_name || '—'}</td>
                              <td style={{ padding: '12px 20px' }}>
                                <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 9px', borderRadius: 999, background: rc.bg, border: `1px solid ${rc.border}`, color: rc.color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{u.role}</span>
                              </td>
                              <td style={{ padding: '12px 20px', fontSize: 12, color: '#64748b' }}>{u.states?.name || '—'}</td>
                              <td style={{ padding: '12px 20px', fontSize: 11, color: '#334155' }}>
                                {new Date(u.created_at).toLocaleDateString('en-IN')}
                              </td>
                              <td style={{ padding: '12px 20px' }}>
                                <select value={u.role} onChange={e => handleRoleChange(u.id, e.target.value)} className="adm-select"
                                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', fontSize: 12, borderRadius: 8, padding: '6px 10px', cursor: 'pointer' }}>
                                  <option value="citizen" style={{ background: '#06131a' }}>citizen</option>
                                  <option value="coordinator" style={{ background: '#06131a' }}>coordinator</option>
                                  <option value="admin" style={{ background: '#06131a' }}>admin</option>
                                </select>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* ── AUDIT LOG ── */}
                {activeTab === 'audit' && (
                  <div>
                    <p style={{ fontSize: 12, color: '#334155', marginBottom: 16 }}>Last 50 platform actions across all states</p>
                    {auditLogs.length === 0 ? (
                      <p style={{ textAlign: 'center', padding: '48px 0', color: '#334155', fontSize: 13 }}>No audit logs yet.</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {auditLogs.map((log, i) => {
                          const ac = getAuditColor(log.action_type);
                          return (
                            <motion.div key={log.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.015 }}
                              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '11px 16px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                                <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 6, background: ac.bg, border: `1px solid ${ac.border}`, color: ac.color, flexShrink: 0, letterSpacing: '0.04em' }}>
                                  {log.action_type}
                                </span>
                                {log.metadata && Object.keys(log.metadata).length > 0 && (
                                  <span style={{ fontSize: 11, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {JSON.stringify(log.metadata).slice(0, 70)}
                                  </span>
                                )}
                              </div>
                              <span style={{ fontSize: 10, color: '#1e293b', flexShrink: 0 }}>
                                {new Date(log.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </motion.div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </div>
    </div>
  );
}
