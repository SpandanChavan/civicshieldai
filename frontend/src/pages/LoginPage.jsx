import { useState } from 'react';
import { useNavigate, useLocation, Navigate, Link } from 'react-router-dom';
import { supabase } from '@/services/supabaseClient';
import { useAuth } from '@/hooks/useAuth';
import { motion } from 'framer-motion';
import { Shield, Mail, Lock, ArrowRight, AlertTriangle, ChevronRight } from 'lucide-react';

const ROLE_HOME = {
  coordinator: '/dashboard',
  citizen: '/citizen',
  admin: '/admin',
};

export default function LoginPage() {
  const { user, role, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [showPass, setShowPass] = useState(false);

  if (!loading && user) {
    const dest = location.state?.from?.pathname || ROLE_HOME[role] || '/portal';
    return <Navigate to={dest} replace />;
  }

  const handleLogin = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) {
      setError(authError.message);
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(ellipse at 20% 50%, #011a14 0%, #010a08 55%, #020810 100%)',
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
          -webkit-text-fill-color: white !important;
          caret-color: white;
        }
        .li-input { transition: border-color 0.2s, box-shadow 0.2s; }
        .li-input:focus { outline: none; border-color: #00A693 !important; box-shadow: 0 0 0 3px rgba(0,166,147,0.15); }
        .li-btn { transition: all 0.2s; }
        .li-btn:hover:not(:disabled) { background: #00bfa6 !important; transform: translateY(-1px); box-shadow: 0 8px 35px rgba(0,166,147,0.55) !important; }
        .li-btn:disabled { opacity: 0.55; cursor: not-allowed; }
        @keyframes ping { 75%, 100% { transform: scale(2.4); opacity: 0; } }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse-ring { 0% { transform: scale(1); opacity: 0.6; } 100% { transform: scale(1.8); opacity: 0; } }
        @keyframes orbDrift { 0% { transform: translate(0,0) scale(1); } 33% { transform: translate(30px,-20px) scale(1.05); } 66% { transform: translate(-20px,15px) scale(0.97); } 100% { transform: translate(0,0) scale(1); } }
        @keyframes orbDrift2 { 0% { transform: translate(0,0) scale(1); } 33% { transform: translate(-25px,18px) scale(1.04); } 66% { transform: translate(18px,-12px) scale(0.98); } 100% { transform: translate(0,0) scale(1); } }
        @keyframes ringRotate { from { transform: translate(-50%,-50%) rotate(0deg); } to { transform: translate(-50%,-50%) rotate(360deg); } }
        @keyframes ringRotateRev { from { transform: translate(-50%,-50%) rotate(0deg); } to { transform: translate(-50%,-50%) rotate(-360deg); } }
        @keyframes streakFade { 0%,100% { opacity: 0.03; } 50% { opacity: 0.07; } }
      `}</style>

      {/* ── Background layer ──────────────────────────────── */}

      {/* Orb 1 — large teal, top-right */}
      <div style={{ position: 'fixed', top: '-18%', right: '-12%', width: 720, height: 720, borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,166,147,0.18) 0%, rgba(0,166,147,0.06) 45%, transparent 70%)', filter: 'blur(55px)', pointerEvents: 'none', zIndex: 0, animation: 'orbDrift 24s ease-in-out infinite' }} />
      {/* Orb 2 — mid teal, bottom-left */}
      <div style={{ position: 'fixed', bottom: '-22%', left: '-14%', width: 620, height: 620, borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,166,147,0.12) 0%, rgba(0,166,147,0.04) 50%, transparent 70%)', filter: 'blur(60px)', pointerEvents: 'none', zIndex: 0, animation: 'orbDrift2 30s ease-in-out infinite' }} />
      {/* Orb 3 — indigo accent, center-left */}
      <div style={{ position: 'fixed', top: '30%', left: '-8%', width: 380, height: 380, borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.1) 0%, transparent 70%)', filter: 'blur(45px)', pointerEvents: 'none', zIndex: 0, animation: 'orbDrift 18s ease-in-out infinite 4s' }} />
      {/* Orb 4 — small warm, top-left */}
      <div style={{ position: 'fixed', top: '5%', left: '20%', width: 220, height: 220, borderRadius: '50%', background: 'radial-gradient(circle, rgba(245,158,11,0.07) 0%, transparent 70%)', filter: 'blur(35px)', pointerEvents: 'none', zIndex: 0, animation: 'orbDrift2 20s ease-in-out infinite 2s' }} />

      {/* Orbital rings — centered off-screen right */}
      <div style={{ position: 'fixed', top: '50%', right: '-30%', width: 700, height: 700, pointerEvents: 'none', zIndex: 0 }}>
        <div style={{ position: 'absolute', top: '50%', left: '50%', width: 500, height: 500, borderRadius: '50%', border: '1px solid rgba(0,166,147,0.08)', animation: 'ringRotate 40s linear infinite' }} />
        <div style={{ position: 'absolute', top: '50%', left: '50%', width: 380, height: 380, borderRadius: '50%', border: '1px solid rgba(0,166,147,0.06)', animation: 'ringRotateRev 28s linear infinite' }} />
        <div style={{ position: 'absolute', top: '50%', left: '50%', width: 260, height: 260, borderRadius: '50%', border: '1px dashed rgba(0,166,147,0.05)', animation: 'ringRotate 20s linear infinite' }} />
        {/* Dot on outer ring */}
        <div style={{ position: 'absolute', top: 'calc(50% - 250px)', left: '50%', width: 6, height: 6, borderRadius: '50%', background: '#00A693', boxShadow: '0 0 10px #00A693, 0 0 20px rgba(0,166,147,0.4)', transform: 'translateX(-50%)', animation: 'ringRotate 40s linear infinite' }} />
        <div style={{ position: 'absolute', top: 'calc(50% - 190px)', left: '50%', width: 4, height: 4, borderRadius: '50%', background: 'rgba(99,102,241,0.8)', boxShadow: '0 0 8px rgba(99,102,241,0.6)', transform: 'translateX(-50%)', animation: 'ringRotateRev 28s linear infinite' }} />
      </div>

      {/* Diagonal light streaks */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-10%', left: '15%', width: 1, height: '130%', background: 'linear-gradient(180deg, transparent 0%, rgba(0,166,147,0.12) 40%, rgba(0,166,147,0.06) 70%, transparent 100%)', transform: 'rotate(20deg)', transformOrigin: 'top center', animation: 'streakFade 8s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', top: '-10%', left: '55%', width: 1, height: '130%', background: 'linear-gradient(180deg, transparent 0%, rgba(0,166,147,0.07) 35%, rgba(0,166,147,0.04) 65%, transparent 100%)', transform: 'rotate(20deg)', transformOrigin: 'top center', animation: 'streakFade 11s ease-in-out infinite 3s' }} />
        <div style={{ position: 'absolute', top: '-10%', right: '20%', width: 1, height: '120%', background: 'linear-gradient(180deg, transparent 0%, rgba(99,102,241,0.08) 40%, rgba(99,102,241,0.04) 70%, transparent 100%)', transform: 'rotate(20deg)', transformOrigin: 'top center', animation: 'streakFade 14s ease-in-out infinite 6s' }} />
      </div>

      {/* Hex grid pattern */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
        backgroundImage: 'radial-gradient(circle, rgba(0,166,147,0.07) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
        WebkitMaskImage: 'radial-gradient(ellipse at center, black 20%, transparent 80%)',
        maskImage: 'radial-gradient(ellipse at center, black 20%, transparent 80%)',
      }} />

      {/* Floating particles */}
      {Array.from({ length: 18 }, (_, i) => ({
        x: Math.random() * 100, y: Math.random() * 100,
        s: Math.random() * 3 + 1, d: Math.random() * 10 + 6, delay: Math.random() * 5,
      })).map((p, i) => (
        <div key={i} style={{
          position: 'fixed', left: `${p.x}%`, top: `${p.y}%`,
          width: p.s, height: p.s, borderRadius: '50%',
          background: `rgba(0,166,147,${0.1 + Math.random() * 0.25})`,
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
        {/* Brand */}
        <Link to="/landing" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#00A693', boxShadow: '0 0 18px rgba(0,166,147,0.4)' }}>
            <Shield size={17} color="white" />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 14, color: 'white', lineHeight: 1.2 }}>
              CivicShield <span style={{ color: '#00A693' }}>AI</span>
            </div>
            <div style={{ fontSize: 9, color: '#475569', lineHeight: 1 }}>AI-Powered Disaster Intelligence</div>
          </div>
        </Link>

        {/* Center breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Link to="/landing" style={{ fontSize: 12, color: '#475569' }}>Home</Link>
          <ChevronRight size={12} color="#334155" />
          <span style={{ fontSize: 12, color: '#00A693', fontWeight: 600 }}>Sign In</span>
        </div>

        {/* Right CTA */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: '#64748b' }}>New here?</span>
          <Link to="/register" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 10, background: '#00A693', color: 'white', fontSize: 13, fontWeight: 700, boxShadow: '0 4px 16px rgba(0,166,147,0.3)' }}>
            Create Account <ArrowRight size={13} />
          </Link>
        </div>
      </nav>

      {/* ── Main content ──────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', position: 'relative', zIndex: 10 }}>
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          style={{ width: '100%', maxWidth: 420 }}
        >
          {/* Hero text above card */}
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1 }}
              style={{ position: 'relative', display: 'inline-flex', marginBottom: 18 }}
            >
              {/* Pulse rings */}
              <div style={{ position: 'absolute', inset: -8, borderRadius: '50%', border: '1px solid rgba(0,166,147,0.2)', animation: 'pulse-ring 2.5s ease-out infinite' }} />
              <div style={{ position: 'absolute', inset: -16, borderRadius: '50%', border: '1px solid rgba(0,166,147,0.1)', animation: 'pulse-ring 2.5s ease-out infinite 0.6s' }} />
              <div style={{
                width: 68, height: 68, borderRadius: 22,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'linear-gradient(135deg, rgba(0,166,147,0.25), rgba(0,166,147,0.06))',
                border: '1px solid rgba(0,166,147,0.35)',
                boxShadow: '0 0 40px rgba(0,166,147,0.2)',
              }}>
                <Shield size={30} color="#00A693" />
              </div>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              style={{ fontSize: 26, fontWeight: 900, color: 'white', margin: '0 0 8px', letterSpacing: '-0.5px' }}
            >
              Welcome back
            </motion.h1>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              style={{ fontSize: 13, color: '#64748b', margin: 0 }}
            >
              Sign in to your CivicShield AI account
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
            {/* Error */}
            {error && (
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', marginBottom: 20 }}>
                <AlertTriangle size={14} color="#ef4444" style={{ flexShrink: 0 }} />
                <p style={{ fontSize: 13, color: '#ef4444', margin: 0 }}>{error}</p>
              </motion.div>
            )}

            <form onSubmit={handleLogin} autoComplete="off" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {/* Email */}
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 7 }}>Email Address</label>
                <div style={{ position: 'relative' }}>
                  <Mail size={14} color="#334155" style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                  <input
                    id="auth-email" type="email" value={email}
                    onChange={e => setEmail(e.target.value)} required autoComplete="username"
                    placeholder="you@example.com" className="li-input"
                    style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 10, padding: '11px 14px 11px 38px', fontSize: 14, color: 'white' }}
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 7 }}>Password</label>
                <div style={{ position: 'relative' }}>
                  <Lock size={14} color="#334155" style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                  <input
                    id="auth-password" type={showPass ? 'text' : 'password'} value={password}
                    onChange={e => setPassword(e.target.value)} required autoComplete="current-password"
                    placeholder="••••••••" minLength={6} className="li-input"
                    style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 10, padding: '11px 46px 11px 38px', fontSize: 14, color: 'white' }}
                  />
                  <button type="button" onClick={() => setShowPass(s => !s)}
                    style={{ position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, color: '#475569', padding: 0, fontWeight: 700, letterSpacing: '0.05em' }}>
                    {showPass ? 'HIDE' : 'SHOW'}
                  </button>
                </div>
              </div>

              {/* Submit */}
              <button id="auth-submit" type="submit" disabled={submitting} className="li-btn"
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '13px 24px', borderRadius: 12, border: 'none', background: '#00A693', color: 'white', fontSize: 15, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 24px rgba(0,166,147,0.4)', marginTop: 4 }}>
                {submitting ? (
                  <><div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', animation: 'spin 0.7s linear infinite' }} /> Signing in…</>
                ) : (
                  <>Sign In <ArrowRight size={16} /></>
                )}
              </button>
            </form>

            {/* Divider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0 16px' }}>
              <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
              <span style={{ fontSize: 10, color: '#334155', letterSpacing: '0.08em', fontWeight: 600 }}>OR</span>
              <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
            </div>

            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 13, color: '#475569', margin: 0 }}>
                Don't have an account?{' '}
                <Link to="/register" style={{ color: '#00A693', fontWeight: 700 }}>Create one</Link>
              </p>
            </div>
          </motion.div>

          {/* Footer row */}
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
