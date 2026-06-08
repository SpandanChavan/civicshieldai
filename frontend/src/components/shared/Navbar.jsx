import { NavLink } from 'react-router-dom';
import useAppStore from '@/store/useAppStore';

export default function Navbar() {
  const isConnected = useAppStore((s) => s.isConnected);
  const lastUpdate = useAppStore((s) => s.lastUpdate);
  const eventStats = useAppStore((s) => s.eventStats);
  const notifications = useAppStore((s) => s.notifications);

  const criticalCount = eventStats.bySeverity?.Critical || 0;

  const navLinkClass = ({ isActive }) =>
    `px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
      isActive
        ? 'bg-brand-600/30 text-brand-300 border border-brand-500/30'
        : 'text-slate-400 hover:text-white hover:bg-white/5'
    }`;

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
            🌍 Public Portal
          </NavLink>
          <NavLink to="/dashboard" className={navLinkClass} id="nav-dashboard">
            🎛️ Coordinator
          </NavLink>
          <NavLink to="/responder" className={navLinkClass} id="nav-responder">
            📱 Responder
          </NavLink>
        </nav>

        {/* Status indicators */}
        <div className="flex items-center gap-4">
          {lastUpdate && (
            <span className="text-xs text-slate-500 hidden md:block">
              Updated {lastUpdate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <div className="flex items-center gap-1.5">
            <span
              id="connection-indicator"
              className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-red-500'}`}
              aria-label={isConnected ? 'Connected' : 'Disconnected'}
            />
            <span className={`text-xs font-medium ${isConnected ? 'text-emerald-400' : 'text-red-400'}`}>
              {isConnected ? 'Live' : 'Offline'}
            </span>
          </div>
          <div className="text-xs text-slate-500 hidden lg:block">
            {eventStats.total || 0} active events
          </div>
        </div>
      </div>
    </header>
  );
}
