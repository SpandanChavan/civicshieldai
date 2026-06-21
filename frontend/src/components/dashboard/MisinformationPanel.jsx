import { useState, useEffect } from 'react';
import { backendApi } from '@/services/backendApi';
import { CheckCircle2, AlertTriangle, XCircle, Search, Microscope, ClipboardList } from 'lucide-react';

// ── Credibility Gauge (SVG ring) ──────────────────────────────────────
function CredibilityGauge({ score }) {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  const color =
    score >= 70 ? '#10b981'  // emerald — Likely True
    : score >= 40 ? '#f59e0b' // amber — Suspicious
    : '#ef4444';              // red — Likely False

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="100" height="100" viewBox="0 0 100 100">
        {/* Background ring */}
        <circle cx="50" cy="50" r={radius} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="10" />
        {/* Score ring */}
        <circle
          cx="50" cy="50" r={radius}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 50 50)"
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
        <text x="50" y="55" textAnchor="middle" fontSize="20" fontWeight="700" fill={color}>
          {score}
        </text>
      </svg>
      <span className="text-xs text-slate-400">Credibility Score</span>
    </div>
  );
}

// ── Classification Badge ──────────────────────────────────────────────
function ClassBadge({ classification }) {
  const styles = {
    'Likely True':  'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
    'Suspicious':   'bg-amber-500/20 text-amber-300 border border-amber-500/30',
    'Likely False': 'bg-red-500/20 text-red-300 border border-red-500/30',
  };
  const icons = {
    'Likely True': <CheckCircle2 size={16} />,
    'Suspicious': <AlertTriangle size={16} />,
    'Likely False': <XCircle size={16} />
  };

  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold ${styles[classification] || styles['Suspicious']}`}>
      {icons[classification]} {classification}
    </span>
  );
}

// ── History Row ───────────────────────────────────────────────────────
function HistoryRow({ item }) {
  const scoreColor =
    item.credibility_score >= 70 ? 'text-emerald-400'
    : item.credibility_score >= 40 ? 'text-amber-400'
    : 'text-red-400';

  return (
    <div className="glass-card py-2 px-3 space-y-1">
      <div className="flex items-center justify-between gap-2">
        <ClassBadge classification={item.classification} />
        <span className={`text-sm font-bold ${scoreColor}`}>{item.credibility_score}/100</span>
      </div>
      <p className="text-xs text-slate-400 line-clamp-2">{item.input_text}</p>
      <p className="text-xs text-slate-600">
        {new Date(item.analyzed_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
      </p>
    </div>
  );
}

// ── Main Panel ────────────────────────────────────────────────────────
export default function MisinformationPanel() {
  const [text, setText] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  // Load analysis history on mount
  useEffect(() => {
    backendApi.get('/predictions/misinformation/history')
      .then((res) => setHistory(res.data || []))
      .catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false));
  }, []);

  const handleAnalyze = async () => {
    if (!text.trim() || text.trim().length < 10) {
      setError('Please enter at least 10 characters of text.');
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await backendApi.post('/predictions/misinformation', { text });
      setResult(res);
      // Prepend to history
      setHistory((prev) => [{
        id: res.id,
        input_text: text,
        credibility_score: res.credibilityScore,
        classification: res.classification,
        confidence: res.confidence,
        analyzed_at: res.analyzedAt,
      }, ...prev.slice(0, 19)]);
      setText('');
    } catch (err) {
      setError(err.message || 'Analysis failed. Ensure the ML service is running.');
    } finally {
      setLoading(false);
    }
  };

  const charCount = text.length;
  const isReady = charCount >= 10 && !loading;

  return (
    <div className="space-y-4 p-1">
      {/* Header */}
      <div className="glass-card">
        <div className="flex items-center gap-3 mb-1">
          <Search className="text-brand-400" size={24} />
          <div>
            <h2 className="text-sm font-bold text-white">Misinformation Detector</h2>
            <p className="text-xs text-slate-400">AI-powered fact-check for disaster news</p>
          </div>
        </div>
      </div>

      {/* Input */}
      <div className="glass-card space-y-3">
        <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
          Paste Text / News / Social Media Post
        </label>
        <textarea
          id="misinfo-input"
          value={text}
          onChange={(e) => { setText(e.target.value); setError(null); }}
          placeholder="Paste a WhatsApp forward, news headline, or social media post here…"
          rows={5}
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-brand-500 resize-none"
        />
        <div className="flex items-center justify-between">
          <span className={`text-xs ${charCount < 10 ? 'text-slate-600' : 'text-slate-400'}`}>
            {charCount} chars {charCount < 10 ? `(${10 - charCount} more needed)` : ''}
          </span>
          <button
            id="misinfo-analyze-btn"
            onClick={handleAnalyze}
            disabled={!isReady}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              isReady
                ? 'bg-brand-600 hover:bg-brand-500 text-white shadow-lg shadow-brand-900/50'
                : 'bg-white/5 text-slate-600 cursor-not-allowed'
            }`}
          >
            {loading ? (
              <>
                <div className="spinner w-3.5 h-3.5" />
                Analyzing…
              </>
            ) : (
              <><Microscope size={16} /> Analyze</>
            )}
          </button>
        </div>
        {error && (
          <p className="text-xs text-red-400 bg-red-500/10 rounded px-2 py-1">{error}</p>
        )}
      </div>

      {/* Result */}
      {result && (
        <div
          id="misinfo-result"
          className="glass-card space-y-4 animate-fade-in border border-white/10"
        >
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Analysis Result</h3>
          <div className="flex items-center gap-6">
            <CredibilityGauge score={result.credibilityScore} />
            <div className="space-y-2">
              <ClassBadge classification={result.classification} />
              <p className="text-xs text-slate-400">
                <span className="text-white font-semibold">{result.confidence}%</span> confidence
              </p>
            </div>
          </div>
          <div className="bg-white/5 rounded-lg px-3 py-2">
            <p className="text-xs text-slate-300 leading-relaxed">{result.explanation}</p>
          </div>
        </div>
      )}

      {/* History */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          Recent Analyses
        </h3>
        {historyLoading ? (
          <div className="flex justify-center py-6"><div className="spinner" /></div>
        ) : history.length === 0 ? (
          <div className="text-center py-6 text-slate-600">
            <ClipboardList className="mx-auto mb-2 text-slate-500" size={32} />
            <p className="text-xs">No analyses yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {history.map((item, i) => (
              <HistoryRow key={item.id || i} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
