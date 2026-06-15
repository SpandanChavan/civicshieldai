import { useState } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { supabase } from '@/services/supabaseClient';
import { useAuth } from '@/hooks/useAuth';

// Role → home route mapping
const ROLE_HOME = {
  coordinator: '/dashboard',
  responder: '/responder',
  citizen: '/portal',
};

export default function LoginPage() {
  const { user, role, loading } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();

  const [mode, setMode]         = useState('login'); // 'login' | 'register'
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [selRole, setSelRole]   = useState('citizen');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]       = useState(null);
  const [success, setSuccess]   = useState(null);

  // Already logged in → go home
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
    // onAuthStateChange in useAuth will handle the redirect
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, role: selRole } },
    });

    if (authError) {
      setError(authError.message);
      setSubmitting(false);
      return;
    }

    // Role is now passed via user_metadata and handled by the Postgres trigger.

    setSuccess('Account created! Check your email to confirm, then log in.');
    setMode('login');
    setSubmitting(false);
  };

  const roleOptions = [
    { value: 'citizen',     label: '🏠 Citizen',     desc: 'Access public portal & alerts' },
    { value: 'coordinator', label: '🎯 Coordinator',  desc: 'Full dashboard & alert management' },
    { value: 'responder',   label: '🚒 Responder',    desc: 'Field operations & incident reports' },
  ];

  return (
    <div className="min-h-screen bg-surface-900 flex items-center justify-center px-4">
      {/* Background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-brand-600/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md space-y-6">

        {/* Logo */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-brand-600/20 border border-brand-500/30 text-3xl mb-2">
            🛡️
          </div>
          <h1 className="text-2xl font-bold text-white">CivicShield AI</h1>
          <p className="text-slate-400 text-sm">India's Intelligent Disaster Management Platform</p>
        </div>

        {/* Card */}
        <div className="glass rounded-2xl p-8 border border-white/10 space-y-6">

          {/* Mode toggle */}
          <div className="flex rounded-xl overflow-hidden border border-white/10">
            {['login', 'register'].map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(null); setSuccess(null); }}
                className={`flex-1 py-2.5 text-sm font-semibold transition-all ${
                  mode === m
                    ? 'bg-brand-600 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {m === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>

          {/* Alerts */}
          {error   && <p className="text-sm text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{error}</p>}
          {success && <p className="text-sm text-emerald-400 bg-emerald-500/10 rounded-lg px-3 py-2">{success}</p>}

          {/* Form */}
          <form onSubmit={mode === 'login' ? handleLogin : handleRegister} className="space-y-4">

            {mode === 'register' && (
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Full Name</label>
                <input
                  id="auth-fullname"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  placeholder="Your full name"
                  className="mt-1.5 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-brand-500"
                />
              </div>
            )}

            <div>
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Email</label>
              <input
                id="auth-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                className="mt-1.5 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-brand-500"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Password</label>
              <input
                id="auth-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                minLength={6}
                className="mt-1.5 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-brand-500"
              />
            </div>

            {mode === 'register' && (
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Your Role</label>
                {roleOptions.map((r) => (
                  <label
                    key={r.value}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                      selRole === r.value
                        ? 'border-brand-500/50 bg-brand-600/10'
                        : 'border-white/5 hover:border-white/10'
                    }`}
                  >
                    <input
                      type="radio"
                      name="role"
                      value={r.value}
                      checked={selRole === r.value}
                      onChange={() => setSelRole(r.value)}
                      className="accent-brand-500"
                    />
                    <div>
                      <p className="text-sm font-semibold text-white">{r.label}</p>
                      <p className="text-xs text-slate-500">{r.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            )}

            <button
              id="auth-submit"
              type="submit"
              disabled={submitting}
              className="w-full py-3 bg-brand-600 hover:bg-brand-500 text-white font-semibold rounded-xl transition-all shadow-lg shadow-brand-900/50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {submitting ? (
                <><div className="spinner w-4 h-4" /> {mode === 'login' ? 'Signing in…' : 'Creating account…'}</>
              ) : (
                mode === 'login' ? '🔐 Sign In' : '🚀 Create Account'
              )}
            </button>
          </form>

          {/* Demo accounts hint */}
          <div className="border-t border-white/5 pt-4">
            <p className="text-xs text-slate-600 text-center">
              Demo: use any email you own — confirmation email will be sent by Supabase
            </p>
          </div>
        </div>

        <p className="text-center text-xs text-slate-600">
          🔒 Secured by Supabase Auth · CivicShield AI 2026
        </p>
      </div>
    </div>
  );
}
