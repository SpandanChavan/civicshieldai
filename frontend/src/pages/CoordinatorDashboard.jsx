import { useState, Component } from 'react';
import DisasterMap from '@/components/map/DisasterMap';
import MapLayers from '@/components/map/MapLayers';
import IMDLegend from '@/components/map/IMDLegend';

// ── Verbose Error Boundary — shows error in DOM so it's debuggable ──────────
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null, info: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, info) { this.setState({ info }); }
  render() {
    if (this.state.hasError) {
      return (
        <div id="crash-panel" style={{ padding: 24, background: '#1a1a2e', color: '#ff6b6b', fontFamily: 'monospace', overflow: 'auto', height: '100%' }}>
          <h2 style={{ color: '#ff6b6b', marginBottom: 8 }}>⚠️ {this.props.label || 'Component'} crashed</h2>
          <pre id="crash-message" style={{ whiteSpace: 'pre-wrap', fontSize: 13, color: '#ffa07a' }}>
            {this.state.error?.toString()}
          </pre>
          <pre id="crash-stack" style={{ whiteSpace: 'pre-wrap', fontSize: 11, color: '#888', marginTop: 8 }}>
            {this.state.error?.stack}
          </pre>
          <pre id="crash-component-stack" style={{ whiteSpace: 'pre-wrap', fontSize: 11, color: '#aaa', marginTop: 8 }}>
            {this.state.info?.componentStack}
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

export default function CoordinatorDashboardPage() {
  const [selectedEvent, setSelectedEvent] = useState(null);
  // Events are fetched globally in App.jsx via GlobalEventFetcher

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 56px)', overflow: 'hidden' }}>

      {/* Left panel — dashboard controls (wrapped in error boundary) */}
      <aside style={{ width: '384px', flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.05)', overflowY: 'auto' }}
             className="glass flex flex-col">
        <ErrorBoundary label="CoordinatorDashboard">
          <LazyCoordinatorDashboard selectedEvent={selectedEvent} setSelectedEvent={setSelectedEvent} />
        </ErrorBoundary>
      </aside>

      {/* Right — map view */}
      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        <ErrorBoundary label="DisasterMap">
          <DisasterMap onEventSelect={setSelectedEvent} applyJurisdictionFilter={true} />
        </ErrorBoundary>
        <MapLayers />
        {/* 🌦️ IMD Legend bottom-left */}
        <div className="absolute bottom-4 left-4 z-[1000] pointer-events-auto">
          <IMDLegend />
        </div>
        <div className="absolute bottom-4 right-4 z-[1000]">
          <div className="glass rounded-xl px-3 py-1.5 text-[10px] text-slate-400 border border-white/5">
            OpenStreetMap · Real-time · No API key
          </div>
        </div>
      </div>
    </div>
  );
}

// Lazy import so a module-load error surfaces in the ErrorBoundary above
import { lazy, Suspense } from 'react';
const LazyCoordinatorDashboardComp = lazy(() => import('@/components/dashboard/CoordinatorDashboard'));
function LazyCoordinatorDashboard({ selectedEvent, setSelectedEvent }) {
  return (
    <Suspense fallback={<div style={{ padding: 24, color: '#888' }}>Loading dashboard…</div>}>
      <LazyCoordinatorDashboardComp selectedMapEvent={selectedEvent} onClearMapEvent={() => setSelectedEvent(null)} />
    </Suspense>
  );
}

