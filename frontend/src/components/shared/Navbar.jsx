import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import useAppStore from '@/store/useAppStore';
import { LANGUAGES, useTranslation } from '@/utils/i18n';
import { useAuth } from '@/hooks/useAuth';
import { Shield, Globe2, LogOut, AlertTriangle, Menu, X } from 'lucide-react';
import { useState, useEffect } from 'react';

const ROLE_NAV = {
  guest:       [],
  citizen:     [{ to: '/citizen',   label: 'My Portal',     icon: Globe2 }],
  coordinator: [{ to: '/dashboard', label: 'Dashboard',     icon: Globe2 }],
  admin:       [{ to: '/admin',     label: 'Admin Panel',   icon: Globe2 }],
};

const ROLE_CONFIG = {
  coordinator: { color: '#8b5cf6', bg: 'rgba(139,92,246,0.15)', border: 'rgba(139,92,246,0.3)', label: 'Coordinator' },
  citizen:     { color: '#00A693', bg: 'rgba(0,166,147,0.15)',  border: 'rgba(0,166,147,0.3)',  label: 'Citizen'      },
  admin:       { color: '#ef4444', bg: 'rgba(239,68,68,0.15)',  border: 'rgba(239,68,68,0.3)',  label: 'Admin'        },
  guest:       { color: '#64748b', bg: 'rgba(100,116,139,0.1)', border: 'rgba(100,116,139,0.2)',label: 'Guest'        },
};

export default function Navbar() {
  const isConnected = useAppStore((s) => s.isConnected);
  const lastUpdate  = useAppStore((s) => s.lastUpdate);
  const eventStats  = useAppStore((s) => s.eventStats);
  const events      = useAppStore((s) => s.events);
  const language    = useAppStore((s) => s.language);
  const setLanguage = useAppStore((s) => s.setLanguage);
  
  const portalRightOpen = useAppStore((s) => s.portalRightOpen);
  const setPortalRightOpen = useAppStore((s) => s.setPortalRightOpen);

  const { t }       = useTranslation();
  const { user, role, profile, signOut } = useAuth();
  const navigate    = useNavigate();
  const location    = useLocation();

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const isPortal = location.pathname === '/portal';
  const criticalCount = eventStats.bySeverity?.Critical || 0;
  const activeCount   = events.filter(e => e.is_active).length;
  const effectiveRole = !user ? 'guest' : (role || 'citizen');
  const navLinks = ROLE_NAV[effectiveRole] || [];
  const roleConf = ROLE_CONFIG[effectiveRole] || ROLE_CONFIG.guest;

  let roleBadgeLabel = roleConf.label;
  if (role === 'coordinator' && profile?.states) {
    roleBadgeLabel = `${profile.states.name}`;
  }

  const handleSignOut = async () => {
    await signOut();
    navigate('/landing');
  };

  const navLinkStyle = (isActive) => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 14px',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    color: isActive ? 'white' : '#94a3b8',
    background: isActive ? 'rgba(0,166,147,0.12)' : 'transparent',
    border: isActive ? '1px solid rgba(0,166,147,0.25)' : '1px solid transparent',
    textDecoration: 'none',
    transition: 'all 0.15s',
  });

  return (
    <header style={{
      position: 'sticky',
      top: 0,
      zIndex: 10000,
      height: 56,
      display: 'flex',
      alignItems: 'center',
      background: 'rgba(6,14,22,0.92)',
      backdropFilter: 'blur(24px)',
      borderBottom: '1px solid rgba(0,166,147,0.15)',
      fontFamily: "'Inter', sans-serif",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        @keyframes navPing { 75%, 100% { transform: scale(2); opacity: 0; } }
        @keyframes navGlow { 0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.4); } 50% { box-shadow: 0 0 0 8px rgba(239,68,68,0); } }
        .nav-link-item:hover { color: white !important; background: rgba(255,255,255,0.05) !important; }
        .nav-signout:hover { color: white !important; background: rgba(239,68,68,0.1) !important; border-color: rgba(239,68,68,0.25) !important; }
        .nav-btn:hover { background: rgba(0,166,147,0.12) !important; border-color: rgba(0,166,147,0.3) !important; color: #00A693 !important; }
      `}</style>

      <div style={{ width: '100%', maxWidth: '100%', padding: '0 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>

        {/* ── Brand ───────────────────────────── */}
        <NavLink to={user ? (role === 'admin' ? '/admin' : role === 'coordinator' ? '/dashboard' : '/citizen') : '/'} style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none', flexShrink: 0, minWidth: 160 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#00A693', boxShadow: '0 0 14px rgba(0,166,147,0.35)', flexShrink: 0 }}>
            <Shield size={16} color="white" />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 13, color: 'white', lineHeight: 1.2 }}>
              CivicShield <span style={{ color: '#00A693' }}>AI</span>
            </div>
            <div style={{ fontSize: 9, color: '#475569', lineHeight: 1, letterSpacing: '0.05em', textTransform: 'uppercase' }}>India</div>
          </div>

          {/* Global Critical alert badge (hidden on portal because it has a ticker) */}
          {criticalCount > 0 && !isPortal && (
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', marginLeft: 6 }}>
              <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 999, background: '#ef4444', color: 'white', letterSpacing: '0.03em' }}>
                {criticalCount} CRITICAL
              </span>
              <div style={{ position: 'absolute', inset: 0, borderRadius: 999, background: '#ef4444', opacity: 0.4, animation: 'navPing 1.5s ease infinite' }} />
            </div>
          )}
        </NavLink>

        {isMobile ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ position: 'relative', width: 8, height: 8, flexShrink: 0 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: isConnected ? '#10b981' : '#ef4444', position: 'relative', zIndex: 1 }} />
                {isConnected && <div style={{ position: 'absolute', inset: -2, borderRadius: '50%', background: '#10b981', opacity: 0.4, animation: 'navPing 2s ease-in-out infinite' }} />}
              </div>
            </div>
            <button 
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        ) : (
          <>
            {/* ── Center Content ───────────────────────── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, flex: 1, justifyContent: isPortal ? 'flex-start' : 'center', marginLeft: isPortal ? 20 : 0 }}>
              
              {isPortal ? (
                /* PORTAL STATS BAR (Integrated) */
                <>
                  {/* Stat pills */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    {[
                      { label: 'Total Events',  value: eventStats.total || 0,             color: '#94a3b8' },
                      { label: 'Active',        value: activeCount,                       color: '#00A693' },
                      { label: 'Critical',      value: eventStats.bySeverity?.Critical || 0, color: '#ef4444' },
                      { label: 'High',          value: eventStats.bySeverity?.High || 0,    color: '#f97316' },
                    ].map(s => (
                      <div key={s.label} style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                        <span style={{ fontSize: 16, fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.value}</span>
                        <span style={{ fontSize: 10, color: '#475569', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</span>
                      </div>
                    ))}
                  </div>

                  <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.06)' }} />

                  {/* Critical Ticker */}
                  {criticalCount > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 12px', borderRadius: 99, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', animation: 'navGlow 2s ease-in-out infinite' }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444', flexShrink: 0 }} />
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#ef4444' }}>
                        {criticalCount} CRITICAL ALERT{criticalCount > 1 ? 'S' : ''}
                      </span>
                    </div>
                  )}
                </>
              ) : (
                /* REGULAR NAV LINKS */
                <nav style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {navLinks.map(link => (
                    <NavLink key={link.to} to={link.to} className="nav-link-item" style={({ isActive }) => navLinkStyle(isActive)}>
                      {t(link.label) || link.label}
                    </NavLink>
                  ))}
                  {!user && (
                    <NavLink to="/portal" className="nav-link-item" style={({ isActive }) => navLinkStyle(isActive)}>
                      Public Portal
                    </NavLink>
                  )}
                </nav>
              )}

            </div>

            {/* ── Right side ──────────────────────── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>

              {isPortal && (
                /* Portal Toggles */
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 8 }}>
                  {user && navLinks.map(link => (
                    <NavLink key={link.to} to={link.to} className="nav-link-item"
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 8, border: '1px solid rgba(0,166,147,0.25)', background: 'rgba(0,166,147,0.12)', color: '#00A693', fontSize: 11, fontWeight: 600, textDecoration: 'none', transition: 'all 0.15s' }}>
                      {t(link.label) || link.label}
                    </NavLink>
                  ))}
                  <button onClick={() => setPortalRightOpen(!portalRightOpen)} className="nav-btn"
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.09)', background: 'rgba(255,255,255,0.03)', color: portalRightOpen ? '#00A693' : '#64748b', fontSize: 11, fontWeight: 600, transition: 'all 0.15s', cursor: 'pointer' }}>
                    <AlertTriangle size={12} /> Alerts
                  </button>
                </div>
              )}

              {/* Last update */}
              {lastUpdate && !isPortal && (
                <span style={{ fontSize: 11, color: '#475569' }}>
                  Updated {lastUpdate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}

              {/* Language switcher */}
              <div style={{ display: 'flex', alignItems: 'center', borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}>
                {LANGUAGES.map((lang) => (
                  <button key={lang.code} onClick={() => setLanguage(lang.code)} title={lang.nativeLabel}
                    style={{
                      padding: '5px 9px', fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer',
                      background: language === lang.code ? 'rgba(0,166,147,0.2)' : 'transparent',
                      color: language === lang.code ? '#00A693' : '#64748b',
                      transition: 'all 0.15s',
                    }}>
                    {lang.flag} {lang.label}
                  </button>
                ))}
              </div>

              {/* Live / Offline indicator */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginLeft: 4 }}>
                <div style={{ position: 'relative', width: 8, height: 8, flexShrink: 0 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: isConnected ? '#10b981' : '#ef4444', position: 'relative', zIndex: 1 }} />
                  {isConnected && <div style={{ position: 'absolute', inset: -2, borderRadius: '50%', background: '#10b981', opacity: 0.4, animation: 'navPing 2s ease-in-out infinite' }} />}
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: isConnected ? '#10b981' : '#ef4444' }}>
                  {isConnected ? t('nav.live') || 'Live' : t('nav.offline') || 'Offline'}
                </span>
              </div>

              <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.06)', margin: '0 4px' }} />

              {/* Auth section */}
              {user ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {/* Role + name pill */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 10px', borderRadius: 9, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div style={{ width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: roleConf.color, background: roleConf.bg, border: `1px solid ${roleConf.border}`, flexShrink: 0 }}>
                      {(profile?.full_name || user.email)?.[0]?.toUpperCase()}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'white', maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {profile?.full_name?.split(' ')[0] || 'User'}
                      </span>
                      <span style={{ fontSize: 9, fontWeight: 700, color: roleConf.color, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        {roleBadgeLabel}
                      </span>
                    </div>
                  </div>

                  {/* Sign out */}
                  <button id="nav-signout" onClick={handleSignOut} className="nav-signout"
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 11px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#64748b', fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s' }}>
                    <LogOut size={13} />
                    <span>Sign Out</span>
                  </button>
                </div>
              ) : (
                <NavLink to="/login" id="nav-signin"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 16px', borderRadius: 9, background: '#00A693', color: 'white', fontSize: 12, fontWeight: 700, textDecoration: 'none', boxShadow: '0 4px 14px rgba(0,166,147,0.3)' }}>
                  Sign In
                </NavLink>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Mobile Menu Dropdown ─────────────────────── */}
      {isMobile && mobileMenuOpen && (
        <div style={{
          position: 'absolute',
          top: 56,
          left: 0,
          right: 0,
          zIndex: 10000,
          background: 'rgba(6,14,22,0.98)',
          backdropFilter: 'blur(24px)',
          borderBottom: '1px solid rgba(0,166,147,0.15)',
          padding: '16px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
          boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
          maxHeight: 'calc(100vh - 56px)',
          overflowY: 'auto'
        }}>
          {/* Auth Button at Top for Mobile */}
          {user ? (
            <button onClick={handleSignOut} className="nav-signout"
              style={{ display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 16px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontSize: 14, fontWeight: 600, width: '100%', cursor: 'pointer' }}>
              <LogOut size={16} /> Sign Out
            </button>
          ) : (
            <NavLink to="/login"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 16px', borderRadius: 8, background: '#00A693', color: 'white', fontSize: 14, fontWeight: 700, textDecoration: 'none', width: '100%', boxShadow: '0 4px 14px rgba(0,166,147,0.3)' }}>
              Sign In
            </NavLink>
          )}

          {/* User Profile Pill (if logged in) */}
          {user && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 9, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: roleConf.color, background: roleConf.bg, border: `1px solid ${roleConf.border}`, flexShrink: 0 }}>
                {(profile?.full_name || user.email)?.[0]?.toUpperCase()}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'white' }}>
                  {profile?.full_name || 'User'}
                </span>
                <span style={{ fontSize: 10, fontWeight: 700, color: roleConf.color, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {roleBadgeLabel}
                </span>
              </div>
            </div>
          )}

          {/* Nav Links */}
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {navLinks.map(link => {
              const Icon = link.icon;
              return (
                <NavLink key={link.to} to={link.to} className="nav-link-item" style={({ isActive }) => ({ 
                  display: 'flex', alignItems: 'center', gap: 8, 
                  padding: '12px 16px', fontSize: 14, fontWeight: 700, 
                  background: 'rgba(0,166,147,0.1)', 
                  border: '1px solid rgba(0,166,147,0.25)', 
                  borderRadius: 10, color: '#00A693',
                  textDecoration: 'none'
                })}>
                  {Icon && <Icon size={16} />}
                  {link.to === '/citizen' ? '← Back to My Portal' : (t(link.label) || link.label)}
                </NavLink>
              );
            })}
            {!user && (
              <>
                <NavLink to="/" className="nav-link-item" style={({ isActive }) => ({ 
                  display: 'flex', alignItems: 'center', gap: 8, 
                  padding: '12px 16px', fontSize: 14, fontWeight: 700, 
                  background: isActive ? 'rgba(0,166,147,0.1)' : 'transparent', 
                  border: isActive ? '1px solid rgba(0,166,147,0.25)' : '1px solid transparent', 
                  borderRadius: 10, color: isActive ? '#00A693' : '#94a3b8',
                  textDecoration: 'none'
                })}>
                  Home
                </NavLink>
                <NavLink to="/portal" className="nav-link-item" style={({ isActive }) => ({ 
                  display: 'flex', alignItems: 'center', gap: 8, 
                  padding: '12px 16px', fontSize: 14, fontWeight: 700, 
                  background: isActive ? 'rgba(0,166,147,0.1)' : 'transparent', 
                  border: isActive ? '1px solid rgba(0,166,147,0.25)' : '1px solid transparent', 
                  borderRadius: 10, color: isActive ? '#00A693' : '#94a3b8',
                  textDecoration: 'none'
                })}>
                  Public Portal
                </NavLink>
              </>
            )}
          </nav>

          {/* Portal Stats / Alerts (if on portal) */}
          {isPortal && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px 24px' }}>
                {[
                  { label: 'Total Events',  value: eventStats.total || 0,             color: '#94a3b8' },
                  { label: 'Active',        value: activeCount,                       color: '#00A693' },
                  { label: 'Critical',      value: eventStats.bySeverity?.Critical || 0, color: '#ef4444' },
                  { label: 'High',          value: eventStats.bySeverity?.High || 0,    color: '#f97316' },
                ].map(s => (
                  <div key={s.label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 18, fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.value}</span>
                    <span style={{ fontSize: 10, color: '#475569', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</span>
                  </div>
                ))}
              </div>
              <button onClick={() => { setPortalRightOpen(!portalRightOpen); setMobileMenuOpen(false); }} className="nav-btn"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.09)', background: 'rgba(255,255,255,0.03)', color: portalRightOpen ? '#00A693' : '#64748b', fontSize: 13, fontWeight: 600, marginTop: 4, cursor: 'pointer' }}>
                <AlertTriangle size={14} /> Toggle Alert Panel
              </button>
            </div>
          )}

          {/* Language Switcher */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#475569', textTransform: 'uppercase', marginBottom: 8, letterSpacing: '0.05em' }}>Language</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: 8 }}>
              {LANGUAGES.map((lang) => (
                <button key={lang.code} onClick={() => setLanguage(lang.code)}
                  style={{
                    padding: '8px', fontSize: 13, fontWeight: 600, border: '1px solid', cursor: 'pointer', borderRadius: 8,
                    background: language === lang.code ? 'rgba(0,166,147,0.1)' : 'rgba(255,255,255,0.03)',
                    borderColor: language === lang.code ? 'rgba(0,166,147,0.3)' : 'rgba(255,255,255,0.08)',
                    color: language === lang.code ? '#00A693' : '#94a3b8',
                    transition: 'all 0.15s',
                  }}>
                  {lang.flag} {lang.label}
                </button>
              ))}
            </div>
          </div>
          
          {/* Last Update */}
          {lastUpdate && !isPortal && (
            <div style={{ textAlign: 'center', fontSize: 11, color: '#475569', marginTop: 8 }}>
              Data last updated at {lastUpdate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            </div>
          )}
        </div>
      )}
    </header>
  );
}
