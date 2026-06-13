import { NavLink, useNavigate } from 'react-router-dom';
import useAppStore from '@/store/useAppStore';
import { LANGUAGES, useTranslation } from '@/utils/i18n';
import { useAuth } from '@/hooks/useAuth';

const ROLE_COLORS = {
  coordinator: 'bg-brand-600/30 text-brand-300 border-brand-500/30',
  responder:   'bg-amber-500/20 text-amber-300 border-amber-500/30',
  citizen:     'bg-slate-700/50 text-slate-300 border-slate-600/30',
};

export default function Navbar() {
  const isConnected = useAppStore((s) => s.isConnected);
  const lastUpdate  = useAppStore((s) => s.lastUpdate);
  const eventStats  = useAppStore((s) => s.eventStats);
  const language    = useAppStore((s) => s.language);
  const setLanguage = useAppStore((s) => s.setLanguage);
  const { t }       = useTranslation();
  const { user, role, signOut } = useAuth();
  const navigate    = useNavigate();

  const criticalCount = eventStats.bySeverity?.Critical || 0;

  const navLinkClass = ({ isActive }) =>
    `px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
      isActive
        ? 'bg-brand-600/30 text-brand-300 border border-brand-500/30'
        : 'text-slate-400 hover:text-white hover:bg-white/5'
    }`;

  const handleSignOut = async () => {
    await signOut();
    navigate('/portal');
  };

  return (
    <header className="glass border-b border-white/5 sticky top-0 z-50">
      <div className="max-w-screen-2xl mx-auto flex items-center justify-between h-14 px-4">

        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="relative w-8 h-8 flex items-center justify-center">
            <div className="absolute inset-0 bg-brand-500/30 rounded-lg blur-sm" />
            <span className="relative text-xl">🛡️</span>
          </div>
          <div>
            <span className="font-bold text-white text-sm">CivicShield</span>
            <span className="text-brand-400 font-bold text-sm"> AI</span>
            <span className="ml-1 text-xs text-slate-500 hidden sm:inline">🇮🇳</span>
            {criticalCount > 0 && (
              <span className="ml-2 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full animate-pulse">
                {criticalCount} CRITICAL
              </span>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex items-center gap-1" aria-label="Main navigation">
          <NavLink to="/portal" className={navLinkClass} id="nav-portal">
            {t('nav.portal')}
          </NavLink>
          {role === 'coordinator' && (
            <NavLink to="/dashboard" className={navLinkClass} id="nav-dashboard">
              {t('nav.dashboard')}
            </NavLink>
          )}
          {(role === 'responder' || role === 'coordinator') && (
            <NavLink to="/responder" className={navLinkClass} id="nav-responder">
              {t('nav.responder')}
            </NavLink>
          )}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-3">
          {lastUpdate && (
            <span className="text-xs text-slate-500 hidden md:block">
              {t('nav.updated')} {lastUpdate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}

          {/* Language switcher */}
          <div className="flex items-center rounded-lg overflow-hidden border border-white/10" role="group" aria-label="Language switcher">
            {LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                id={`lang-${lang.code}`}
                onClick={() => setLanguage(lang.code)}
                title={lang.nativeLabel}
                className={`px-2.5 py-1 text-xs font-semibold transition-all duration-200 ${
                  language === lang.code
                    ? 'bg-brand-600/40 text-brand-300'
                    : 'text-slate-500 hover:text-white hover:bg-white/5'
                }`}
              >
                {lang.flag} {lang.label}
              </button>
            ))}
          </div>

          {/* Connection indicator */}
          <div className="flex items-center gap-1.5">
            <span
              id="connection-indicator"
              className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-red-500'}`}
              aria-label={isConnected ? 'Connected' : 'Disconnected'}
            />
            <span className={`text-xs font-medium hidden sm:block ${isConnected ? 'text-emerald-400' : 'text-red-400'}`}>
              {isConnected ? t('nav.live') : t('nav.offline')}
            </span>
          </div>

          {/* Auth */}
          {user ? (
            <div className="flex items-center gap-2">
              <span className={`hidden sm:inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${ROLE_COLORS[role] || ROLE_COLORS.citizen}`}>
                {role}
              </span>
              <div className="flex items-center gap-2 glass rounded-lg px-2.5 py-1.5">
                <div className="w-6 h-6 rounded-full bg-brand-600/50 flex items-center justify-center text-xs font-bold text-brand-300">
                  {user.email?.[0]?.toUpperCase()}
                </div>
                <span className="text-xs text-slate-300 hidden md:block max-w-[100px] truncate">
                  {user.email}
                </span>
              </div>
              <button
                id="nav-signout"
                onClick={handleSignOut}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-white/5 transition-all border border-white/10"
              >
                Sign Out
              </button>
            </div>
          ) : (
            <NavLink
              to="/login"
              id="nav-signin"
              className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-brand-600 hover:bg-brand-500 text-white transition-all"
            >
              🔐 Sign In
            </NavLink>
          )}
        </div>
      </div>
    </header>
  );
}
