import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/services/supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Mail, Lock, User, MapPin, ArrowRight, AlertTriangle, CheckCircle2, ChevronRight } from 'lucide-react';

const ROLE_OPTIONS = [
  {
    value: 'citizen',
    label: 'Citizen',
    emoji: '🌍',
    desc: 'Submit incident reports and receive emergency alerts.',
    color: '#00A693',
  },
  {
    value: 'coordinator',
    label: 'Coordinator',
    emoji: '🎯',
    desc: 'Manage state-level events, review reports, and dispatch resources.',
    color: '#8b5cf6',
  },
];

export default function SignupPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [selRole, setSelRole] = useState('citizen');
  const [selState, setSelState] = useState('');
  const [statesList, setStatesList] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [showPass, setShowPass] = useState(false);

  useEffect(() => {
    async function loadStates() {
      const { data } = await supabase.from('states').select('id, name').order('name');
      if (data) setStatesList(data);
    }
    loadStates();
  }, []);

  const handleRegister = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    if (selRole === 'coordinator' && !selState) {
      setError('Coordinators must select their assigned state.');
      setSubmitting(false);
      return;
    }
    const { error: authError } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: fullName, role: selRole, state_id: selRole === 'coordinator' ? selState : null } },
    });
    if (authError) { setError(authError.message); setSubmitting(false); return; }
    setSuccess('Account created! Check your email to confirm, then sign in.');
    setSubmitting(false);
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(ellipse at 80% 50%, #011a14 0%, #010a08 55%, #020810 100%)',
      fontFamily: "'Inter', sans-serif",
      position: 'relative',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        * { box-sizing: border-box; }
        a { text-decoration: none; }
        input:-webkit-autofill {
          -webkit-box-shadow: 0 0 0 1000px rgba(6,14,22,0.9) inset !important;
          -webkit-text-fill-color: white !important; caret-color: white;
        }
        .su-input { transition: border-color 0.2s, box-shadow 0.2s; }
        .su-input:focus { outline: none; border-color: #00A693 !important; box-shadow: 0 0 0 3px rgba(0,166,147,0.15); }
        .su-select { transition: border-color 0.2s, box-shadow 0.2s; }
        .su-select:focus { outline: none; border-color: #00A693 !important; box-shadow: 0 0 0 3px rgba(0,166,147,0.15); }
        .su-btn { transition: all 0.2s; }
        .su-btn:hover:not(:disabled) { background: #00bfa6 !important; transform: translateY(-1px); box-shadow: 0 8px 35px rgba(0,166,147,0.55) !important; }
        .su-btn:disabled { opacity: 0.55; cursor: not-allowed; }
        @keyframes ping { 75%,100% { transform: scale(2.4); opacity: 0; } }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse-ring { 0% { transform: scale(1); opacity: 0.6; } 100% { transform: scale(1.8); opacity: 0; } }
        @keyframes orbDrift { 0% { transform: translate(0,0) scale(1); } 33% { transform: translate(-30px,-20px) scale(1.05); } 66% { transform: translate(20px,15px) scale(0.97); } 100% { transform: translate(0,0) scale(1); } }
        @keyframes orbDrift2 { 0% { transform: translate(0,0) scale(1); } 33% { transform: translate(25px,18px) scale(1.04); } 66% { transform: translate(-18px,-12px) scale(0.98); } 100% { transform: translate(0,0) scale(1); } }
        @keyframes ringRotate { from { transform: translate(-50%,-50%) rotate(0deg); } to { transform: translate(-50%,-50%) rotate(360deg); } }
        @keyframes ringRotateRev { from { transform: translate(-50%,-50%) rotate(0deg); } to { transform: translate(-50%,-50%) rotate(-360deg); } }
        @keyframes streakFade { 0%,100% { opacity: 0.03; } 50% { opacity: 0.07; } }
      `}</style>

      {/* ── Backgrounds ───────────────────────────────────── */}
      {/* Orb 1 — large teal, top-left */}
      <div style={{ position: 'fixed', top: '-18%', left: '-12%', width: 720, height: 720, borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,166,147,0.18) 0%, rgba(0,166,147,0.06) 45%, transparent 70%)', filter: 'blur(55px)', pointerEvents: 'none', zIndex: 0, animation: 'orbDrift 24s ease-in-out infinite' }} />
      {/* Orb 2 — mid teal, bottom-right */}
      <div style={{ position: 'fixed', bottom: '-22%', right: '-14%', width: 620, height: 620, borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,166,147,0.12) 0%, rgba(0,166,147,0.04) 50%, transparent 70%)', filter: 'blur(60px)', pointerEvents: 'none', zIndex: 0, animation: 'orbDrift2 30s ease-in-out infinite' }} />
      {/* Orb 3 — purple, center-right */}
      <div style={{ position: 'fixed', top: '35%', right: '-6%', width: 360, height: 360, borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,92,246,0.1) 0%, transparent 70%)', filter: 'blur(45px)', pointerEvents: 'none', zIndex: 0, animation: 'orbDrift 20s ease-in-out infinite 3s' }} />
      {/* Orb 4 — warm amber, top-right */}
      <div style={{ position: 'fixed', top: '8%', right: '22%', width: 200, height: 200, borderRadius: '50%', background: 'radial-gradient(circle, rgba(245,158,11,0.07) 0%, transparent 70%)', filter: 'blur(35px)', pointerEvents: 'none', zIndex: 0, animation: 'orbDrift2 22s ease-in-out infinite 5s' }} />

      {/* Orbital rings — centered off-screen left */}
      <div style={{ position: 'fixed', top: '50%', left: '-30%', width: 700, height: 700, pointerEvents: 'none', zIndex: 0 }}>
        <div style={{ position: 'absolute', top: '50%', left: '50%', width: 500, height: 500, borderRadius: '50%', border: '1px solid rgba(0,166,147,0.08)', animation: 'ringRotate 45s linear infinite' }} />
        <div style={{ position: 'absolute', top: '50%', left: '50%', width: 370, height: 370, borderRadius: '50%', border: '1px solid rgba(0,166,147,0.06)', animation: 'ringRotateRev 30s linear infinite' }} />
        <div style={{ position: 'absolute', top: '50%', left: '50%', width: 240, height: 240, borderRadius: '50%', border: '1px dashed rgba(139,92,246,0.06)', animation: 'ringRotate 22s linear infinite' }} />
        <div style={{ position: 'absolute', top: 'calc(50% - 250px)', left: '50%', width: 6, height: 6, borderRadius: '50%', background: '#00A693', boxShadow: '0 0 10px #00A693, 0 0 20px rgba(0,166,147,0.4)', transform: 'translateX(-50%)', animation: 'ringRotate 45s linear infinite' }} />
        <div style={{ position: 'absolute', top: 'calc(50% - 185px)', left: '50%', width: 4, height: 4, borderRadius: '50%', background: 'rgba(139,92,246,0.9)', boxShadow: '0 0 8px rgba(139,92,246,0.6)', transform: 'translateX(-50%)', animation: 'ringRotateRev 30s linear infinite' }} />
      </div>

      {/* Diagonal light streaks */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-10%', right: '18%', width: 1, height: '130%', background: 'linear-gradient(180deg, transparent 0%, rgba(0,166,147,0.12) 40%, rgba(0,166,147,0.06) 70%, transparent 100%)', transform: 'rotate(-20deg)', transformOrigin: 'top center', animation: 'streakFade 9s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', top: '-10%', right: '55%', width: 1, height: '130%', background: 'linear-gradient(180deg, transparent 0%, rgba(0,166,147,0.07) 35%, rgba(0,166,147,0.04) 65%, transparent 100%)', transform: 'rotate(-20deg)', transformOrigin: 'top center', animation: 'streakFade 12s ease-in-out infinite 4s' }} />
        <div style={{ position: 'absolute', top: '-10%', left: '18%', width: 1, height: '120%', background: 'linear-gradient(180deg, transparent 0%, rgba(139,92,246,0.08) 40%, rgba(139,92,246,0.04) 70%, transparent 100%)', transform: 'rotate(-20deg)', transformOrigin: 'top center', animation: 'streakFade 15s ease-in-out infinite 7s' }} />
      </div>

      {/* Dot grid */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', backgroundImage: 'radial-gradient(circle, rgba(0,166,147,0.07) 1px, transparent 1px)', backgroundSize: '40px 40px', WebkitMaskImage: 'radial-gradient(ellipse at center, black 20%, transparent 80%)', maskImage: 'radial-gradient(ellipse at center, black 20%, transparent 80%)' }} />

      {/* Floating particles */}
      {Array.from({ length: 14 }, (_, i) => ({
        x: 5 + Math.random() * 90, y: Math.random() * 100,
        s: Math.random() * 3 + 1, d: Math.random() * 10 + 6, delay: Math.random() * 5,
      })).map((p, i) => (
        <div key={i} style={{
          position: 'fixed', left: `${p.x}%`, top: `${p.y}%`,
          width: p.s, height: p.s, borderRadius: '50%',
          background: `rgba(0,166,147,${0.08 + Math.random() * 0.2})`,
          pointerEvents: 'none', zIndex: 0,
          animation: `float ${p.d}s ease-in-out infinite ${p.delay}s`,
        }} />
      ))}

      {/* ── Custom Navbar ──────────────────────────────────── */}
      <nav style={{
        position: 'relative', zIndex: 20,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 2.5rem', height: 64,
        background: 'rgba(6,14,22,0.7)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(0,166,147,0.12)',
      }}>
        <Link to="/landing" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#00A693', boxShadow: '0 0 18px rgba(0,166,147,0.4)' }}>
            <Shield size={17} color="white" />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 14, color: 'white', lineHeight: 1.2 }}>CivicShield <span style={{ color: '#00A693' }}>AI</span></div>
            <div style={{ fontSize: 9, color: '#475569', lineHeight: 1 }}>AI-Powered Disaster Intelligence</div>
          </div>
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Link to="/landing" style={{ fontSize: 12, color: '#475569' }}>Home</Link>
          <ChevronRight size={12} color="#334155" />
          <span style={{ fontSize: 12, color: '#00A693', fontWeight: 600 }}>Create Account</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: '#64748b' }}>Have an account?</span>
          <Link to="/login" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', color: '#cbd5e1', fontSize: 13, fontWeight: 600 }}>
            Sign In
          </Link>
        </div>
      </nav>

      {/* ── Main content ──────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', position: 'relative', zIndex: 10 }}>
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          style={{ width: '100%', maxWidth: 460 }}
        >
          {/* Hero text */}
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.1 }}
              style={{ position: 'relative', display: 'inline-flex', marginBottom: 16 }}>
              <div style={{ position: 'absolute', inset: -8, borderRadius: '50%', border: '1px solid rgba(0,166,147,0.2)', animation: 'pulse-ring 2.5s ease-out infinite' }} />
              <div style={{ position: 'absolute', inset: -16, borderRadius: '50%', border: '1px solid rgba(0,166,147,0.1)', animation: 'pulse-ring 2.5s ease-out infinite 0.7s' }} />
              <div style={{ width: 68, height: 68, borderRadius: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, rgba(0,166,147,0.25), rgba(0,166,147,0.06))', border: '1px solid rgba(0,166,147,0.35)', boxShadow: '0 0 40px rgba(0,166,147,0.2)' }}>
                <Shield size={30} color="#00A693" />
              </div>
            </motion.div>
            <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
              style={{ fontSize: 26, fontWeight: 900, color: 'white', margin: '0 0 6px', letterSpacing: '-0.5px' }}>
              Join CivicShield AI
            </motion.h1>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
              style={{ fontSize: 13, color: '#64748b', margin: 0 }}>
              India's intelligent emergency response platform
            </motion.p>
          </div>

          {/* Card */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.18, duration: 0.45 }}
            style={{
              background: 'rgba(6,14,22,0.88)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 24,
              padding: '28px 28px 24px',
              backdropFilter: 'blur(28px)',
              boxShadow: '0 32px 80px rgba(0,0,0,0.65), 0 0 0 1px rgba(0,166,147,0.06), inset 0 1px 0 rgba(255,255,255,0.04)',
            }}
          >
            {/* Success */}
            {success && (
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} style={{ textAlign: 'center', padding: '8px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderRadius: 12, background: 'rgba(0,166,147,0.1)', border: '1px solid rgba(0,166,147,0.25)', marginBottom: 18 }}>
                  <CheckCircle2 size={18} color="#00A693" />
                  <p style={{ fontSize: 13, color: '#00A693', margin: 0, fontWeight: 600 }}>{success}</p>
                </div>
                <Link to="/login" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 24px', borderRadius: 12, background: '#00A693', color: 'white', fontSize: 14, fontWeight: 700, boxShadow: '0 4px 25px rgba(0,166,147,0.4)' }}>
                  Sign In Now <ArrowRight size={15} />
                </Link>
              </motion.div>
            )}

            {!success && (
              <>
                {error && (
                  <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', marginBottom: 18 }}>
                    <AlertTriangle size={14} color="#ef4444" style={{ flexShrink: 0 }} />
                    <p style={{ fontSize: 13, color: '#ef4444', margin: 0 }}>{error}</p>
                  </motion.div>
                )}

                <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Full Name */}
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 7 }}>Full Name</label>
                    <div style={{ position: 'relative' }}>
                      <User size={14} color="#334155" style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                      <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} required placeholder="Your full name" className="su-input"
                        style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 10, padding: '11px 14px 11px 38px', fontSize: 14, color: 'white' }} />
                    </div>
                  </div>

                  {/* Email */}
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 7 }}>Email Address</label>
                    <div style={{ position: 'relative' }}>
                      <Mail size={14} color="#334155" style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                      <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@example.com" className="su-input"
                        style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 10, padding: '11px 14px 11px 38px', fontSize: 14, color: 'white' }} />
                    </div>
                  </div>

                  {/* Password */}
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 7 }}>Password</label>
                    <div style={{ position: 'relative' }}>
                      <Lock size={14} color="#334155" style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                      <input type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required placeholder="Min 6 characters" minLength={6} className="su-input"
                        style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 10, padding: '11px 46px 11px 38px', fontSize: 14, color: 'white' }} />
                      <button type="button" onClick={() => setShowPass(s => !s)} style={{ position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, color: '#475569', padding: 0, fontWeight: 700 }}>
                        {showPass ? 'HIDE' : 'SHOW'}
                      </button>
                    </div>
                  </div>

                  {/* Role selector */}
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 9 }}>Your Role</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {ROLE_OPTIONS.map(r => (
                        <div key={r.value} onClick={() => setSelRole(r.value)}
                          style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderRadius: 12, border: `1px solid ${selRole === r.value ? `${r.color}45` : 'rgba(255,255,255,0.07)'}`, background: selRole === r.value ? `${r.color}0d` : 'rgba(255,255,255,0.02)', cursor: 'pointer', transition: 'all 0.2s' }}>
                          <div style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${selRole === r.value ? r.color : 'rgba(255,255,255,0.2)'}`, background: selRole === r.value ? r.color : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.2s' }}>
                            {selRole === r.value && <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'white' }} />}
                          </div>
                          <span style={{ fontSize: 17 }}>{r.emoji}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: selRole === r.value ? 'white' : '#94a3b8' }}>{r.label}</div>
                            <div style={{ fontSize: 11, color: '#475569', marginTop: 1 }}>{r.desc}</div>
                          </div>
                          {selRole === r.value && (
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: `${r.color}20`, border: `1px solid ${r.color}35`, color: r.color, flexShrink: 0 }}>✓</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* State dropdown — coordinator only */}
                  <AnimatePresence>
                    {selRole === 'coordinator' && (
                      <motion.div key="state-select"
                        initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.22 }} style={{ overflow: 'hidden' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 7 }}>Assigned State / UT</label>
                          <div style={{ position: 'relative' }}>
                            <MapPin size={14} color="#334155" style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                            <select value={selState} onChange={e => setSelState(e.target.value)} required className="su-select"
                              style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 10, padding: '11px 14px 11px 38px', fontSize: 14, color: selState ? 'white' : '#475569', appearance: 'none', cursor: 'pointer' }}>
                              <option value="" disabled style={{ background: '#06131a' }}>Select your jurisdiction</option>
                              {statesList.map(st => (
                                <option key={st.id} value={st.id} style={{ background: '#06131a', color: 'white' }}>{st.name}</option>
                              ))}
                            </select>
                            <ChevronRight size={13} color="#334155" style={{ position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%) rotate(90deg)', pointerEvents: 'none' }} />
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Submit */}
                  <button type="submit" disabled={submitting} className="su-btn"
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '13px 24px', borderRadius: 12, border: 'none', background: '#00A693', color: 'white', fontSize: 15, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 24px rgba(0,166,147,0.4)', marginTop: 2 }}>
                    {submitting ? (
                      <><div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', animation: 'spin 0.7s linear infinite' }} /> Creating account…</>
                    ) : (
                      <>Create Account <ArrowRight size={16} /></>
                    )}
                  </button>
                </form>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '18px 0 14px' }}>
                  <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
                  <span style={{ fontSize: 10, color: '#334155', letterSpacing: '0.08em', fontWeight: 600 }}>ALREADY REGISTERED?</span>
                  <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
                </div>

                <Link to="/login" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '11px 24px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#94a3b8', fontSize: 14, fontWeight: 600 }}>
                  Sign In Instead
                </Link>
              </>
            )}
          </motion.div>

          {/* Footer */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 20 }}>
            <div style={{ position: 'relative', width: 7, height: 7, flexShrink: 0 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#00A693' }} />
              <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: '#00A693', opacity: 0.5, animation: 'ping 1.8s ease infinite' }} />
            </div>
            <p style={{ fontSize: 11, color: '#334155', margin: 0 }}>Secured by Supabase Auth · CivicShield AI 2026</p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
