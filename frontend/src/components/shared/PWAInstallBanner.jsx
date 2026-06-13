import { useState, useEffect } from 'react';

/**
 * PWAInstallBanner
 * Shows a native-style install prompt at the bottom of the screen
 * when the browser fires the `beforeinstallprompt` event.
 */
export default function PWAInstallBanner() {
  const [prompt, setPrompt] = useState(null);
  const [visible, setVisible] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Detect iOS (Safari doesn't fire beforeinstallprompt)
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
    setIsIOS(ios);

    // Already installed?
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone;

    if (isStandalone) return; // Already running as PWA

    if (ios) {
      // Show manual iOS instructions if not dismissed before
      if (!localStorage.getItem('pwa-ios-dismissed')) {
        setVisible(true);
      }
      return;
    }

    // Chrome/Edge: listen for the install prompt
    const handler = (e) => {
      e.preventDefault();
      setPrompt(e);
      if (!localStorage.getItem('pwa-dismissed')) {
        setVisible(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!prompt) return;
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') {
      setVisible(false);
    }
    setPrompt(null);
  };

  const handleDismiss = () => {
    setVisible(false);
    localStorage.setItem(isIOS ? 'pwa-ios-dismissed' : 'pwa-dismissed', '1');
  };

  if (!visible) return null;

  return (
    <div
      id="pwa-install-banner"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] w-[calc(100%-2rem)] max-w-md
                 animate-fade-in"
    >
      <div className="glass border border-cyan-500/30 rounded-2xl p-4 shadow-2xl shadow-black/50
                      flex items-start gap-4">
        {/* Icon */}
        <div className="shrink-0 w-12 h-12 rounded-xl overflow-hidden">
          <img src="/icon-192.png" alt="CivicShield AI" className="w-full h-full object-cover" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white">Install CivicShield AI</p>
          {isIOS ? (
            <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
              Tap <span className="text-white font-semibold">Share</span> →{' '}
              <span className="text-white font-semibold">Add to Home Screen</span> for offline access
              & push alerts.
            </p>
          ) : (
            <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
              Get offline access, push alerts & a native app experience.
            </p>
          )}
        </div>

        {/* Buttons */}
        <div className="shrink-0 flex flex-col gap-1.5">
          {!isIOS && (
            <button
              id="pwa-install-btn"
              onClick={handleInstall}
              className="px-3 py-1.5 bg-gradient-to-r from-blue-600 to-cyan-500 text-white
                         text-xs font-semibold rounded-lg hover:opacity-90 transition-opacity
                         whitespace-nowrap"
            >
              Install
            </button>
          )}
          <button
            id="pwa-dismiss-btn"
            onClick={handleDismiss}
            className="px-3 py-1.5 text-slate-400 hover:text-white text-xs transition-colors
                       whitespace-nowrap"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
