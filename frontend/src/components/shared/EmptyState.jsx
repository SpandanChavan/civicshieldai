/**
 * Reusable empty/error state component.
 *
 * @param {ReactNode} icon    - Icon element
 * @param {string}   title    - Bold heading
 * @param {string}   message  - Subtext description
 * @param {string}   type     - 'empty' | 'error' | 'offline'  (controls styling)
 * @param {function} onRetry  - If provided, shows a Retry button
 */
import { Inbox, AlertTriangle, WifiOff, RefreshCw } from 'lucide-react';
export default function EmptyState({
  icon,
  title,
  message,
  type = 'empty',
  onRetry,
}) {
  const defaults = {
    empty:   { icon: <Inbox size={32} className="opacity-50" />, title: 'Nothing here yet',       color: 'text-slate-500' },
    error:   { icon: <AlertTriangle size={32} className="opacity-50" />,  title: 'Something went wrong',   color: 'text-red-400'   },
    offline: { icon: <WifiOff size={32} className="opacity-50" />,  title: 'Connection lost',        color: 'text-amber-400' },
  };

  const d = defaults[type] || defaults.empty;
  const displayIcon    = icon    || d.icon;
  const displayTitle   = title   || d.title;
  const displayMessage = message || (type === 'error' ? 'Please try again or check your connection.' : '');

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center px-4">
      <div className={`flex items-center justify-center ${d.color}`}>{displayIcon}</div>
      <div>
        <p className={`text-sm font-semibold ${d.color}`}>{displayTitle}</p>
        {displayMessage && (
          <p className="text-xs text-slate-600 mt-1 max-w-xs">{displayMessage}</p>
        )}
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-2 px-4 py-1.5 flex items-center justify-center gap-2 rounded-lg text-xs font-semibold bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 transition-all"
        >
          <RefreshCw size={14} /> Retry
        </button>
      )}
    </div>
  );
}
