import { useState, useEffect, Component } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/services/supabaseClient';
import { useAuth } from '@/hooks/useAuth';
import useAppStore from '@/store/useAppStore';
import { backendApi } from '@/services/backendApi';
import SOSButton from '@/components/sos/SOSButton';
import EmergencyContactsEditor from '@/components/sos/EmergencyContactsEditor';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle, FileText, MapPin, Send, X,
  CheckCircle2, Clock, Eye, XCircle, CheckSquare,
  ChevronRight, Radio, Plus, ExternalLink, Camera
} from 'lucide-react';

const STATUS_CONFIG = {
  pending_review: { color: '#fde047', bg: 'rgba(253,224,71,0.15)', border: 'rgba(253,224,71,1)', icon: Clock,        label: 'Pending Review' },
  under_review:   { color: '#8ed5ff', bg: 'rgba(142,213,255,0.15)',  border: 'rgba(142,213,255,1)',  icon: Eye,          label: 'Under Review'   },
  approved:       { color: '#86efac', bg: 'rgba(134,239,172,0.15)',   border: 'rgba(134,239,172,1)',  icon: CheckCircle2, label: 'Approved'       },
  rejected:       { color: '#ffb4ab', bg: 'rgba(255,180,171,0.15)',    border: 'rgba(255,180,171,1)',   icon: XCircle,      label: 'Rejected'       },
  resolved:       { color: '#bdc8d1', bg: 'rgba(189,200,209,0.15)', border: 'rgba(189,200,209,1)', icon: CheckSquare,  label: 'Resolved'       },
};

const SEV_CONFIG = {
  Critical: { color: '#ffb4ab', bg: 'rgba(255,180,171,0.15)', border: 'rgba(255,180,171,1)' },
  High:     { color: '#fdba74', bg: 'rgba(253,186,116,0.15)', border: 'rgba(253,186,116,1)' },
  Medium:   { color: '#fde047', bg: 'rgba(253,224,71,0.15)', border: 'rgba(253,224,71,1)' },
  Low:      { color: '#8ed5ff', bg: 'rgba(142,213,255,0.15)', border: 'rgba(142,213,255,1)' },
};

const sharedStyles = `
  @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&display=swap');
  * { box-sizing: border-box; }
  .cp-input, .cp-textarea { 
    transition: border-color 0.2s, box-shadow 0.2s; 
    background: #080E1E;
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 4px;
    padding: 12px 16px;
    color: #dae2fd;
    font-family: 'Inter', sans-serif;
  }
  .cp-input:focus, .cp-textarea:focus { 
    outline: none; 
    border-color: #38bdf8 !important; 
    box-shadow: 0 0 0 1px #38bdf8; 
  }
  .cp-btn-primary { 
    transition: all 0.2s; 
    background: #38bdf8;
    color: #00354a;
    border-radius: 4px;
    font-family: 'Inter', sans-serif;
    font-weight: 600;
  }
  .cp-btn-primary:hover:not(:disabled) { 
    background: #8ed5ff !important; 
  }
  .cp-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .cp-card { 
    transition: background 0.15s; 
    background: #131b2e;
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 8px;
  }
  .cp-card:hover { background: #171f33 !important; }
  @keyframes cpPing { 75%, 100% { transform: scale(2); opacity: 0; } }
`;

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null, info: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, info) { this.setState({ info }); }
  render() {
    if (this.state.hasError) {
      return (
        <div id="crash-panel" style={{ padding: 24, background: '#1a1a2e', color: '#ff6b6b', fontFamily: 'monospace', overflow: 'auto', borderRadius: 8 }}>
          <h2 style={{ color: '#ff6b6b', marginBottom: 8, fontSize: 16 }}>⚠️ {this.props.label || 'Component'} crashed</h2>
          <pre id="crash-message" style={{ whiteSpace: 'pre-wrap', fontSize: 13, color: '#ffa07a' }}>
            {this.state.error?.toString()}
          </pre>
          <pre id="crash-stack" style={{ whiteSpace: 'pre-wrap', fontSize: 11, color: '#888', marginTop: 8 }}>
            {this.state.error?.stack}
          </pre>
          <button
            style={{ marginTop: 16, padding: '8px 16px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}
            onClick={() => this.setState({ hasError: false, error: null, info: null })}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

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
    category: '',
    reporter_name: profile?.full_name || '',
    reporter_contact: user?.email || '',
  });
  const [mediaFile, setMediaFile] = useState(null);

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
      let mediaUrl = null;
      if (mediaFile) {
        const fileExt = mediaFile.name.split('.').pop();
        const fileName = `${Math.random()}.${fileExt}`;
        const filePath = `${user.id || 'anonymous'}/${fileName}`;
        
        const { error: uploadError } = await supabase.storage.from('incident-media').upload(filePath, mediaFile);
        if (uploadError) throw new Error('Image upload failed: ' + uploadError.message);
        
        const { data } = supabase.storage.from('incident-media').getPublicUrl(filePath);
        mediaUrl = data.publicUrl;
      }

      await backendApi.post('/incidents', {
        description: form.description,
        category: form.category,
        reporter_name: form.reporter_name,
        reporter_contact: form.reporter_contact,
        location,
        media_urls: mediaUrl ? [mediaUrl] : [],
      });
      setSubmitSuccess(true);
      setShowForm(false);
      setForm({ description: '', category: '', reporter_name: profile?.full_name || '', reporter_contact: user?.email || '' });
      setMediaFile(null);
      fetchMyReports();
      setTimeout(() => setSubmitSuccess(false), 5000);
    } catch (err) {
      setFormError(err.message || 'Failed to submit report.');
    } finally { setSubmitting(false); }
  };

  return (
    <div style={{ minHeight: 'calc(100vh - 56px)', background: '#0b1326', fontFamily: "'Inter', sans-serif" }}>
      <style>{sharedStyles}</style>

      <div style={{ position: 'relative', zIndex: 1 }}>

        {/* ── Hero header ───────────────────────────────── */}
        <div style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', padding: '28px 0', background: '#0b1326' }}>
          <div style={{ maxWidth: 960, margin: '0 auto', padding: '0 24px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 4, background: 'rgba(56,189,248,0.15)', border: '1px solid rgba(56,189,248,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Radio size={18} color="#38bdf8" />
                  </div>
                  <div>
                    <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 24, fontWeight: 700, color: '#dae2fd', margin: 0, letterSpacing: '-0.3px' }}>Citizen Portal</h1>
                    <p style={{ fontSize: 12, color: '#bdc8d1', margin: 0 }}>
                      Welcome, <span style={{ color: '#38bdf8', fontWeight: 600 }}>{profile?.full_name || user?.email}</span>
                    </p>
                  </div>
                </div>
              </div>

              <button id="report-incident-btn" onClick={() => setShowForm(true)}
                className="cp-btn-primary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 20px', border: 'none', cursor: 'pointer' }}>
                <Plus size={15} /> Report Incident
              </button>
            </div>

            {/* Stats row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 20 }}>
              {[
                { icon: Radio,        value: events.filter(e => e.is_active).length, label: 'Active Events', color: '#bdc2ff' },
                { icon: AlertTriangle,value: criticalCount,                           label: 'Critical',       color: '#ffb4ab' },
                { icon: FileText,     value: myReports.length,                        label: 'My Reports',     color: '#38bdf8' },
              ].map(s => {
                const IconComp = s.icon;
                return (
                  <div key={s.label} className="cp-card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${s.color}18`, border: `1px solid ${s.color}35`, flexShrink: 0 }}>
                      <IconComp size={16} color={s.color} />
                    </div>
                    <div>
                      <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 22, fontWeight: 700, color: '#dae2fd', lineHeight: 1 }}>{s.value}</div>
                      <div style={{ fontSize: 11, color: '#bdc8d1', marginTop: 2 }}>{s.label}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Main content ──────────────────────────────── */}
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: 28 }}>

          {/* ── Emergency SOS ────────────────────────────── */}
          <section style={{ marginBottom: '0.5rem' }}>
            <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '18px', fontWeight: '600', color: '#dae2fd', marginBottom: '0.5rem' }}>
              Emergency SOS
            </h2>
            <p style={{ fontSize: '13px', color: '#bdc8d1', marginBottom: '1rem' }}>
              In a life-threatening emergency, tap below to instantly alert your state coordinator and notify your emergency contacts.
            </p>

            <ErrorBoundary label="SOS System">
              <SOSButton />
            </ErrorBoundary>

            <EmergencyContactsEditor
              initialContacts={profile?.emergency_contacts || []}
              userId={user?.id}
            />
          </section>

          {/* Success banner */}
          <AnimatePresence>
            {submitSuccess && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderRadius: 8, background: 'rgba(134,239,172,0.15)', border: '1px solid rgba(134,239,172,1)' }}>
                <CheckCircle2 size={16} color="#86efac" />
                <span style={{ fontSize: 13, color: '#86efac', fontWeight: 600 }}>Report submitted! A Coordinator will review it shortly.</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Incident form ─────────────────────────────── */}
          <AnimatePresence>
            {showForm && (
              <motion.div key="incident-form"
                initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
                style={{ borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: '#131b2e', overflow: 'hidden' }}>
                <div style={{ padding: '18px 22px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#171f33' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 4, background: 'rgba(56,189,248,0.15)', border: '1px solid rgba(56,189,248,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <AlertTriangle size={15} color="#38bdf8" />
                    </div>
                    <div>
                      <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 16, fontWeight: 600, color: '#dae2fd', margin: 0 }}>Report an Incident</h2>
                      <p style={{ fontSize: 11, color: '#bdc8d1', margin: 0 }}>Your report will be reviewed by local coordinators</p>
                    </div>
                  </div>
                  <button onClick={() => setShowForm(false)} style={{ width: 28, height: 28, borderRadius: 4, background: 'rgba(255,255,255,0.06)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#bdc8d1' }}>
                    <X size={14} />
                  </button>
                </div>

                <form onSubmit={handleSubmit} style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {formError && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 4, background: 'rgba(255,180,171,0.15)', border: '1px solid rgba(255,180,171,1)' }}>
                      <AlertTriangle size={13} color="#ffb4ab" />
                      <span style={{ fontSize: 13, color: '#ffb4ab' }}>{formError}</span>
                    </div>
                  )}

                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#bdc8d1', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 7 }}>Description *</label>
                    <textarea id="incident-description" value={form.description}
                      onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                      required placeholder="Describe what happened, extent of damage, number of people affected..."
                      className="cp-textarea" style={{ width: '100%', minHeight: 100, resize: 'vertical' }} />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#bdc8d1', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 7 }}>Category *</label>
                    <select id="incident-category" value={form.category}
                      onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                      required className="cp-input" style={{ width: '100%' }}>
                      <option value="" disabled>Select category</option>
                      <option value="flood">Flood</option>
                      <option value="fire">Fire</option>
                      <option value="earthquake_damage">Earthquake Damage</option>
                      <option value="landslide">Landslide</option>
                      <option value="cyclone">Cyclone</option>
                      <option value="medical_emergency">Medical Emergency</option>
                      <option value="road_block">Road Block</option>
                      <option value="other">Other</option>
                    </select>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#bdc8d1', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 7 }}>Your Name</label>
                      <input value={form.reporter_name} onChange={e => setForm(f => ({ ...f, reporter_name: e.target.value }))}
                        placeholder="Full name" className="cp-input" style={{ width: '100%' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#bdc8d1', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 7 }}>Contact</label>
                      <input value={form.reporter_contact} onChange={e => setForm(f => ({ ...f, reporter_contact: e.target.value }))}
                        placeholder="Phone / email" className="cp-input" style={{ width: '100%' }} />
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#bdc8d1', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 7 }}>Attach Photo (Optional)</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 14px', borderRadius: 4, background: '#171f33', border: '1px solid rgba(255,255,255,0.1)', color: '#dae2fd', fontSize: 13, cursor: 'pointer' }}>
                        <Camera size={14} /> {mediaFile ? 'Change Photo' : 'Capture / Upload'}
                        <input type="file" accept="image/*" capture="environment" onChange={e => setMediaFile(e.target.files[0])} style={{ display: 'none' }} />
                      </label>
                      {mediaFile && <span style={{ fontSize: 12, color: '#38bdf8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mediaFile.name}</span>}
                    </div>
                  </div>

                  {/* Location status */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 4, background: location ? 'rgba(134,239,172,0.15)' : 'rgba(255,255,255,0.03)', border: `1px solid ${location ? 'rgba(134,239,172,1)' : 'rgba(255,255,255,0.1)'}` }}>
                    <MapPin size={13} color={location ? '#86efac' : '#bdc8d1'} />
                    {location ? (
                      <span style={{ fontSize: 12, color: '#86efac', fontWeight: 600 }}>Location detected: {location.lat.toFixed(4)}, {location.lon.toFixed(4)}</span>
                    ) : locationError ? (
                      <span style={{ fontSize: 12, color: '#ffb4ab' }}>{locationError}</span>
                    ) : (
                      <span style={{ fontSize: 12, color: '#bdc8d1' }}>Detecting your location...</span>
                    )}
                  </div>

                  <button type="submit" id="incident-submit-btn" disabled={submitting || !location}
                    className="cp-btn-primary"
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '13px', border: 'none', cursor: 'pointer' }}>
                    {submitting ? (
                      <><div style={{ width: 15, height: 15, borderRadius: '50%', border: '2px solid rgba(0,53,74,0.3)', borderTopColor: '#00354a', animation: 'spin 0.7s linear infinite' }} /> Submitting...</>
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
                <div style={{ width: 28, height: 28, borderRadius: 4, background: 'rgba(56,189,248,0.15)', border: '1px solid rgba(56,189,248,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <FileText size={14} color="#38bdf8" />
                </div>
                <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 16, fontWeight: 600, color: '#dae2fd', margin: 0 }}>My Reports</h2>
              </div>
              {myReports.length > 0 && (
                <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 4, background: 'rgba(56,189,248,0.15)', border: '1px solid rgba(56,189,248,1)', color: '#38bdf8', fontWeight: 600 }}>
                  {myReports.length} total
                </span>
              )}
            </div>

            {loadingReports ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#bdc8d1', fontSize: 13 }}>Loading your reports...</div>
            ) : myReports.length === 0 ? (
              <div className="cp-card" style={{ textAlign: 'center', padding: '48px 0' }}>
                <FileText size={36} color="#3e484f" style={{ margin: '0 auto 12px' }} />
                <p style={{ fontSize: 14, color: '#bdc8d1', margin: '0 0 16px' }}>No reports submitted yet.</p>
                <button onClick={() => setShowForm(true)}
                  style={{ padding: '9px 20px', borderRadius: 4, background: 'transparent', border: '1px solid #38bdf8', color: '#38bdf8', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
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
                      className="cp-card" style={{ padding: '16px 18px' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                        <p style={{ fontSize: 14, color: '#dae2fd', flex: 1, lineHeight: 1.55, margin: 0 }}>
                          {report.description?.slice(0, 140)}{report.description?.length > 140 ? '...' : ''}
                        </p>
                        {report.media_urls?.length > 0 && (
                          <div style={{ flexShrink: 0, width: 48, height: 48, borderRadius: 4, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
                            <img src={report.media_urls[0]} alt="Incident" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          </div>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 4, background: s.bg, border: `1px solid ${s.border}`, flexShrink: 0 }}>
                          <StatusIcon size={11} color={s.color} />
                          <span style={{ fontSize: 10, fontWeight: 600, color: s.color }}>{s.label}</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 10 }}>
                        <span style={{ fontSize: 11, color: '#87929a', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Clock size={10} /> {new Date(report.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </span>
                        {report.reviewed_at && (
                          <span style={{ fontSize: 11, color: '#87929a', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Eye size={10} /> Reviewed {new Date(report.reviewed_at).toLocaleDateString('en-IN')}
                          </span>
                        )}
                      </div>
                      {report.status === 'rejected' && report.rejection_reason && (
                        <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 4, background: 'rgba(255,180,171,0.15)', border: '1px solid rgba(255,180,171,1)', fontSize: 12, color: '#ffb4ab' }}>
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
                  <div style={{ width: 28, height: 28, borderRadius: 4, background: 'rgba(255,180,171,0.15)', border: '1px solid rgba(255,180,171,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <AlertTriangle size={14} color="#ffb4ab" />
                  </div>
                </div>
                <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 16, fontWeight: 600, color: '#dae2fd', margin: 0 }}>Active Disaster Events</h2>
              </div>
              <Link to="/portal" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#38bdf8', fontWeight: 600, textDecoration: 'none' }}>
                View on map <ExternalLink size={12} />
              </Link>
            </div>

            {nearbyEvents.length === 0 ? (
              <div className="cp-card" style={{ padding: '20px', textAlign: 'center' }}>
                <p style={{ fontSize: 13, color: '#bdc8d1', margin: 0 }}>No active events detected right now.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {nearbyEvents.map((event, i) => {
                  const sev = SEV_CONFIG[event.severity] || SEV_CONFIG.Low;
                  return (
                    <motion.div key={event.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }}
                      className="cp-card"
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '13px 16px' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 14, fontWeight: 600, color: '#dae2fd', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{event.title}</p>
                        <p style={{ fontSize: 12, color: '#bdc8d1', margin: '3px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{event.event_type} - {event.source}</p>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 4, background: sev.bg, border: `1px solid ${sev.border}`, color: sev.color, flexShrink: 0 }}>
                        {event.severity}
                      </span>
                    </motion.div>
                  );
                })}
                <Link to="/portal"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '11px', borderRadius: 4, border: '1px solid rgba(56,189,248,0.3)', background: 'rgba(56,189,248,0.1)', color: '#38bdf8', fontSize: 13, fontWeight: 600, textDecoration: 'none', marginTop: 4 }}>
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
