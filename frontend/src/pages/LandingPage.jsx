import { useRef, useEffect, useState, useMemo, Component, Suspense } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import Navbar from '@/components/shared/Navbar';
import { Stars, OrbitControls } from '@react-three/drei';
import { TextureLoader } from 'three';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import {
  Shield, AlertTriangle, Users, Radio,
  ArrowRight, Bell, Eye, ChevronRight, Globe2, Zap,
  Building2, Navigation, Layers, CheckCircle2, MapPin, Activity
} from 'lucide-react';

/* ─── Data ──────────────────────────────────────────────────────────────────── */
const LIVE_ALERTS = [
  { id: 1, color: '#00A693', icon: '🌊', title: 'Flood Warning', location: 'Pune, Maharashtra', time: '2 min ago' },
  { id: 2, color: '#f59e0b', icon: '⛰️', title: 'Landslide Reported', location: 'Wayanad, Kerala', time: '15 min ago' },
  { id: 3, color: '#8b5cf6', icon: '🌀', title: 'Cyclone Alert', location: 'Puri, Odisha', time: '28 min ago' },
  { id: 4, color: '#ef4444', icon: '🌡️', title: 'Heatwave Warning', location: 'Jaisalmer, Rajasthan', time: '1 hr ago' },
  { id: 5, color: '#00A693', icon: '🌊', title: 'Flash Flood Alert', location: 'Assam Valley', time: '2 hr ago' },
];

const STATS = [
  { icon: AlertTriangle, label: 'Active Alerts', value: '24', sub: 'View all →', color: '#ef4444', glow: 'rgba(239,68,68,0.18)' },
  { icon: Users, label: 'Citizens Assisted', value: '2.4K', sub: 'This week →', color: '#00A693', glow: 'rgba(0,166,147,0.18)' },
  { icon: Radio, label: 'Emergency Operations', value: '8', sub: 'In Progress →', color: '#f59e0b', glow: 'rgba(245,158,11,0.18)' },
  { icon: Building2, label: 'Relief Centers Active', value: '47', sub: 'Find Nearby →', color: '#10b981', glow: 'rgba(16,185,129,0.18)' },
];

const FEATURES = [
  { icon: Zap, title: 'AI Verification Engine', desc: 'ML validates citizen reports in real-time, filtering misinformation before it spreads.' },
  { icon: Globe2, title: 'Geospatial Monitoring', desc: 'State-by-state heatmaps, live event markers, and satellite-grade disaster zone mapping.' },
  { icon: Layers, title: 'Role-Based Coordination', desc: 'Separate dashboards for Citizens, State Coordinators, and National Admins.' },
  { icon: Activity, title: 'Real-Time Intelligence', desc: 'GDACS, NCS, NASA FIRMS, IMD, and FloodList feeds aggregated every 5 minutes.' },
  { icon: Navigation, title: 'Resource Dispatch', desc: 'Track NDRF teams, relief supplies, and medical units on a unified operations map.' },
  { icon: CheckCircle2, title: 'Audit-Grade Logging', desc: 'Every coordinator action and alert is tamper-proof logged for post-disaster analysis.' },
];



/* ─── 3D Globe with real satellite textures ──────────────────────────────── */
function EarthMesh() {
  const earthRef = useRef();
  const cloudRef = useRef();
  const ringRef = useRef();

  // Load locally-served textures (no CORS — served by Vite static server)
  const [dayMap, specMap, normMap, cloudMap] = useLoader(TextureLoader, [
    '/textures/earth_day.jpg',
    '/textures/earth_specular.jpg',
    '/textures/earth_normal.jpg',
    '/textures/earth_clouds.png',
  ]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (earthRef.current) earthRef.current.rotation.y = t * 0.04;
    if (cloudRef.current) cloudRef.current.rotation.y = t * 0.055;
    if (ringRef.current) ringRef.current.rotation.z = t * 0.012;
  });

  const hotspots = [
    { pos: [1.0, 1.6, 0.9], color: '#ef4444' },
    { pos: [-1.6, 0.5, 1.0], color: '#f59e0b' },
    { pos: [1.2, -0.6, 1.6], color: '#00A693' },
    { pos: [-0.3, -1.6, 1.2], color: '#8b5cf6' },
    { pos: [1.8, 0.3, 0.8], color: '#10b981' },
    { pos: [0.5, 1.0, 1.8], color: '#f97316' },
  ];

  return (
    <group>
      {/* Earth — satellite day map + specular + normal */}
      <mesh ref={earthRef}>
        <sphereGeometry args={[2, 80, 80]} />
        <meshPhongMaterial
          map={dayMap}
          specularMap={specMap}
          normalMap={normMap}
          specular="#6699ff"
          shininess={35}
        />
      </mesh>

      {/* Cloud layer */}
      <mesh ref={cloudRef} scale={1.014}>
        <sphereGeometry args={[2, 48, 48]} />
        <meshBasicMaterial map={cloudMap} transparent opacity={0.4} />
      </mesh>
    </group>
  );
}

function GlobeScene() {
  return (
    <>
      <ambientLight intensity={1.5} />
      <directionalLight position={[5, 3, 5]} intensity={2.2} color="#ffffff" />
      <directionalLight position={[-3, 2, 4]} intensity={1.2} color="#ddeeff" />
      <pointLight position={[0, -5, 0]} intensity={0.4} color="#223355" />
      <Stars radius={120} depth={60} count={5000} factor={3} saturation={0} fade speed={0.3} />
      <Suspense fallback={null}>
        <EarthMesh />
      </Suspense>
    </>
  );
}

/* ─── Error boundary for WebGL ──────────────────────────────────────────────── */
class GlobeErrorBoundary extends Component {
  state = { failed: false };
  componentDidCatch() { this.setState({ failed: true }); }
  render() {
    if (this.state.failed) return <CSSGlobeFallback />;
    return this.props.children;
  }
}

/* ─── Main Globe Renderer (3D with CSS fallback) ────────────────────────────── */
function GlobeRenderer() {
  return (
    <GlobeErrorBoundary>
      <div style={{ width: 520, height: 520, position: 'relative' }}>
        <Canvas
          camera={{ position: [0, 0, 5.5], fov: 42 }}
          gl={{ antialias: true, alpha: true }}
          style={{ background: 'transparent' }}
        >
          <GlobeScene />
          <OrbitControls enableZoom={false} enablePan={false} enableRotate={false} autoRotate={false} />
        </Canvas>
      </div>
    </GlobeErrorBoundary>
  );
}

/* ─── CSS Globe fallback ─────────────────────────────────────────────────────── */
function CSSGlobeFallback() {

  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 520, height: 520 }}>

      {/* Deep space glow */}
      <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,166,147,0.22) 0%, transparent 68%)', filter: 'blur(45px)' }} />

      {/* Satellite orbit rings */}
      <div style={{ position: 'absolute', width: 590, height: 590, top: -35, left: -35, borderRadius: '50%', border: '1px solid rgba(0,166,147,0.18)', animation: 'orbitSpin 22s linear infinite', transform: 'perspective(600px) rotateX(72deg)' }} />
      <div style={{ position: 'absolute', width: 565, height: 565, top: -22, left: -22, borderRadius: '50%', border: '0.5px solid rgba(0,166,147,0.1)', animation: 'orbitSpin 35s linear infinite reverse', transform: 'perspective(600px) rotateX(55deg) rotateZ(40deg)' }} />
      <div style={{ position: 'absolute', width: 545, height: 545, top: -12, left: -12, borderRadius: '50%', border: '0.5px dashed rgba(100,180,255,0.08)', animation: 'orbitSpin 50s linear infinite', transform: 'perspective(600px) rotateX(30deg) rotateZ(-20deg)' }} />

      {/* Satellite dot on ring */}
      <div style={{ position: 'absolute', width: 6, height: 6, borderRadius: '50%', background: '#00A693', boxShadow: '0 0 10px #00A693', top: '4%', left: '50%', animation: 'orbitDot 22s linear infinite', transformOrigin: '0 258px' }} />

      {/* Main Globe */}
      <div style={{
        position: 'relative', width: 440, height: 440, borderRadius: '50%', overflow: 'hidden',
        background: 'radial-gradient(ellipse at 32% 28%, #1d6a9e 0%, #0e3a5e 20%, #0a2540 45%, #051828 75%, #020d18 100%)',
        boxShadow: `
          0 0 0 1px rgba(0,166,147,0.15),
          0 0 80px rgba(0,166,147,0.18),
          0 30px 80px rgba(0,0,0,0.8),
          inset -40px -30px 80px rgba(0,0,0,0.7),
          inset 25px 20px 50px rgba(30,120,180,0.12)
        `
      }}>

        {/* Deep ocean texture with subtle swirling */}
        <div style={{
          position: 'absolute', inset: 0, background: `
          radial-gradient(ellipse at 20% 60%, rgba(8,60,100,0.6) 0%, transparent 50%),
          radial-gradient(ellipse at 80% 20%, rgba(10,80,130,0.4) 0%, transparent 45%),
          radial-gradient(ellipse at 50% 90%, rgba(5,30,60,0.5) 0%, transparent 40%)
        `}} />

        {/* Rotating surface (continents + features) */}
        <div style={{ position: 'absolute', inset: 0, animation: 'globeSpin 40s linear infinite' }}>

          {/* === ASIA - large mass, top right === */}
          <div style={{ position: 'absolute', width: 185, height: 110, top: 70, left: 195, borderRadius: '55% 45% 40% 60% / 60% 40% 55% 45%', background: 'linear-gradient(135deg, #2d7a4f 0%, #1e5c35 40%, #254d2a 100%)', filter: 'blur(1.5px)', transform: 'rotate(-12deg)', boxShadow: 'inset 0 0 20px rgba(0,0,0,0.4)' }} />
          {/* India subcontinent */}
          <div style={{ position: 'absolute', width: 45, height: 65, top: 170, left: 260, borderRadius: '40% 40% 60% 60% / 30% 30% 70% 70%', background: 'linear-gradient(180deg, #286640 0%, #1e5030 100%)', filter: 'blur(1px)', transform: 'rotate(5deg)' }} />
          {/* China/SE Asia detail */}
          <div style={{ position: 'absolute', width: 100, height: 60, top: 120, left: 265, borderRadius: '50% 50% 45% 55% / 60% 40% 60% 40%', background: 'linear-gradient(120deg, #256838 0%, #1c5030 100%)', filter: 'blur(1.5px)', transform: 'rotate(-8deg)' }} />
          {/* Japan */}
          <div style={{ position: 'absolute', width: 20, height: 50, top: 80, left: 355, borderRadius: '50%', background: '#1e5c35', filter: 'blur(1px)', transform: 'rotate(-20deg)' }} />

          {/* === EUROPE === */}
          <div style={{ position: 'absolute', width: 80, height: 55, top: 45, left: 165, borderRadius: '50% 50% 45% 55% / 55% 45% 55% 45%', background: 'linear-gradient(120deg, #2d7a4f 0%, #225a3a 100%)', filter: 'blur(1.5px)', transform: 'rotate(-10deg)' }} />
          {/* Scandinavia */}
          <div style={{ position: 'absolute', width: 25, height: 60, top: 15, left: 180, borderRadius: '40% 60% 50% 50% / 30% 30% 70% 70%', background: '#235438', filter: 'blur(1px)', transform: 'rotate(-5deg)' }} />
          {/* UK */}
          <div style={{ position: 'absolute', width: 18, height: 28, top: 50, left: 148, borderRadius: '40% 60%', background: '#235438', filter: 'blur(1px)' }} />

          {/* === AFRICA === */}
          <div style={{ position: 'absolute', width: 88, height: 130, top: 155, left: 165, borderRadius: '48% 52% 45% 55% / 35% 35% 65% 65%', background: 'linear-gradient(180deg, #8B6914 0%, #7a5c10 30%, #6b4f0c 60%, #1e5030 90%)', filter: 'blur(1.5px)', transform: 'rotate(-3deg)', boxShadow: 'inset 0 0 20px rgba(0,0,0,0.3)' }} />
          {/* Madagascar */}
          <div style={{ position: 'absolute', width: 14, height: 35, top: 200, left: 262, borderRadius: '50%', background: '#1a5228', filter: 'blur(1px)', transform: 'rotate(-15deg)' }} />

          {/* === NORTH AMERICA === */}
          <div style={{ position: 'absolute', width: 130, height: 110, top: 45, left: 25, borderRadius: '55% 45% 45% 55% / 40% 45% 55% 60%', background: 'linear-gradient(135deg, #2a7048 0%, #1e5535 50%, #254030 100%)', filter: 'blur(1.5px)', transform: 'rotate(8deg)', boxShadow: 'inset 0 0 20px rgba(0,0,0,0.3)' }} />
          {/* Greenland */}
          <div style={{ position: 'absolute', width: 55, height: 45, top: 5, left: 90, borderRadius: '50%', background: 'linear-gradient(135deg, rgba(200,230,255,0.6) 0%, rgba(180,220,255,0.4) 100%)', filter: 'blur(2px)' }} />
          {/* Florida/Caribbean */}
          <div style={{ position: 'absolute', width: 30, height: 20, top: 155, left: 95, borderRadius: '50%', background: '#1a5028', filter: 'blur(1px)' }} />

          {/* === SOUTH AMERICA === */}
          <div style={{ position: 'absolute', width: 75, height: 120, top: 185, left: 50, borderRadius: '50% 50% 40% 60% / 30% 35% 65% 70%', background: 'linear-gradient(180deg, #2d7a4f 0%, #1e6035 40%, #17502c 100%)', filter: 'blur(1.5px)', transform: 'rotate(-5deg)', boxShadow: 'inset 0 0 20px rgba(0,0,0,0.3)' }} />

          {/* === AUSTRALIA === */}
          <div style={{ position: 'absolute', width: 90, height: 65, top: 285, left: 295, borderRadius: '55% 45% 50% 50% / 55% 45% 55% 45%', background: 'linear-gradient(135deg, #9e7520 0%, #7a5c10 50%, #1e5030 100%)', filter: 'blur(1.5px)', transform: 'rotate(15deg)' }} />
          {/* New Zealand */}
          <div style={{ position: 'absolute', width: 14, height: 28, top: 308, left: 372, borderRadius: '50%', background: '#1a5228', filter: 'blur(1px)', transform: 'rotate(-20deg)' }} />

          {/* === Antarctica (pole) === */}
          <div style={{ position: 'absolute', width: 300, height: 60, bottom: -10, left: 70, borderRadius: '50%', background: 'linear-gradient(0deg, rgba(220,240,255,0.7) 0%, rgba(180,220,255,0.3) 100%)', filter: 'blur(4px)' }} />

          {/* === Arctic ice cap === */}
          <div style={{ position: 'absolute', width: 200, height: 50, top: -10, left: 110, borderRadius: '50%', background: 'linear-gradient(180deg, rgba(210,235,255,0.65) 0%, rgba(180,215,255,0.2) 100%)', filter: 'blur(4px)' }} />

          {/* Lat/Long grid */}
          {[25, 50, 75].map(pct => (
            <div key={pct}>
              <div style={{ position: 'absolute', width: '100%', height: '1px', top: `${pct}%`, background: 'rgba(0,166,147,0.07)' }} />
              <div style={{ position: 'absolute', height: '100%', width: '1px', left: `${pct}%`, background: 'rgba(0,166,147,0.07)' }} />
            </div>
          ))}

          {/* City light clusters (night side simulation) */}
          {[
            { top: 90, left: 200, w: 30, h: 15 },  // Europe cities
            { top: 110, left: 310, w: 25, h: 12 },  // East Asia
            { top: 75, left: 55, w: 35, h: 14 },  // North America east
            { top: 180, left: 175, w: 20, h: 10 },  // Sub-saharan Africa
            { top: 145, left: 270, w: 22, h: 10 },  // India
          ].map((c, i) => (
            <div key={i} style={{ position: 'absolute', width: c.w, height: c.h, top: c.top, left: c.left, borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(255,220,80,0.35) 0%, transparent 80%)', filter: 'blur(2px)' }} />
          ))}
        </div>

        {/* Cloud layer (separate faster rotation) */}
        <div style={{ position: 'absolute', inset: 0, animation: 'globeSpin 28s linear infinite reverse', opacity: 0.45 }}>
          <div style={{ position: 'absolute', width: 170, height: 40, top: 55, left: 60, borderRadius: '50%', background: 'rgba(255,255,255,0.55)', filter: 'blur(5px)', transform: 'rotate(-15deg)' }} />
          <div style={{ position: 'absolute', width: 120, height: 30, top: 30, left: 220, borderRadius: '50%', background: 'rgba(255,255,255,0.5)', filter: 'blur(4px)', transform: 'rotate(10deg)' }} />
          <div style={{ position: 'absolute', width: 100, height: 35, top: 190, left: 30, borderRadius: '50%', background: 'rgba(255,255,255,0.4)', filter: 'blur(5px)' }} />
          <div style={{ position: 'absolute', width: 150, height: 30, top: 240, left: 140, borderRadius: '50%', background: 'rgba(255,255,255,0.45)', filter: 'blur(5px)', transform: 'rotate(-8deg)' }} />
          <div style={{ position: 'absolute', width: 90, height: 25, top: 310, left: 260, borderRadius: '50%', background: 'rgba(255,255,255,0.5)', filter: 'blur(4px)' }} />
          <div style={{ position: 'absolute', width: 80, height: 20, top: 130, left: 330, borderRadius: '50%', background: 'rgba(255,255,255,0.4)', filter: 'blur(3px)', transform: 'rotate(12deg)' }} />
          {/* Hurricane/cyclone swirl */}
          <div style={{ position: 'absolute', width: 55, height: 55, top: 160, left: 85, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,0.6) 20%, rgba(255,255,255,0.3) 50%, transparent 75%)', filter: 'blur(3px)', animation: 'globeSpin 8s linear infinite' }} />
        </div>

        {/* Night-side darkening (right half shadow) */}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, transparent 30%, rgba(0,0,0,0.35) 65%, rgba(0,0,0,0.8) 100%)' }} />

        {/* Specular (light reflection top-left) */}
        <div style={{ position: 'absolute', width: 160, height: 120, top: 35, left: 45, borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(255,255,255,0.09) 0%, transparent 70%)' }} />

        {/* Atmospheric haze (rim glow) */}
        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', boxShadow: 'inset 0 0 40px rgba(30,150,255,0.15), inset 0 0 8px rgba(0,166,147,0.2)' }} />
      </div>

      {/* Outer atmosphere ring */}
      <div style={{ position: 'absolute', width: 452, height: 452, top: '50%', left: '50%', transform: 'translate(-50%,-50%)', borderRadius: '50%', boxShadow: '0 0 0 6px rgba(30,140,255,0.07), 0 0 0 12px rgba(0,166,147,0.04), 0 0 40px rgba(0,166,147,0.15)' }} />

      {/* Disaster hotspot markers */}
      {[
        { top: '24%', left: '62%', color: '#ef4444', label: 'Flood Zone', pulse: true },
        { top: '46%', left: '26%', color: '#f59e0b', label: 'Cyclone', pulse: true },
        { top: '66%', left: '66%', color: '#00A693', label: 'Landslide', pulse: false },
        { top: '32%', left: '44%', color: '#8b5cf6', label: 'Heatwave', pulse: true },
        { top: '54%', left: '52%', color: '#10b981', label: 'Relief Camp', pulse: false },
        { top: '18%', left: '40%', color: '#f97316', label: 'Earthquake', pulse: true },
      ].map((h, i) => (
        <div key={i} style={{ position: 'absolute', display: 'flex', alignItems: 'center', gap: 5, top: h.top, left: h.left }}>
          <div style={{ position: 'relative' }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: h.color, boxShadow: `0 0 10px ${h.color}, 0 0 20px ${h.color}50` }} />
            {h.pulse && <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: h.color, opacity: 0.5, animation: 'ping 1.5s cubic-bezier(0,0,0.2,1) infinite' }} />}
          </div>
          <span style={{ fontSize: 8, fontWeight: 700, padding: '2px 6px', borderRadius: 4, whiteSpace: 'nowrap', background: `${h.color}18`, border: `1px solid ${h.color}45`, color: h.color }}>
            {h.label}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ─── Floating Particles ─────────────────────────────────────────────────────── */
function Particles() {
  const pts = Array.from({ length: 35 }, (_, i) => ({
    id: i, x: Math.random() * 100, y: Math.random() * 100,
    s: Math.random() * 3 + 1, d: Math.random() * 8 + 5, delay: Math.random() * 4,
  }));
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {pts.map(p => (
        <motion.div key={p.id} className="absolute rounded-full"
          style={{ left: `${p.x}%`, top: `${p.y}%`, width: p.s, height: p.s, background: `rgba(0,166,147,${0.1 + Math.random() * 0.3})` }}
          animate={{ y: [0, -25, 0], opacity: [0.2, 0.7, 0.2] }}
          transition={{ duration: p.d, delay: p.delay, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
}

/* ─── Stat Card ─────────────────────────────────────────────────────────────── */
function StatCard({ stat, i }) {
  const Icon = stat.icon;
  return (
    <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }}
      transition={{ delay: i * 0.1, duration: 0.6 }} whileHover={{ scale: 1.04, y: -4 }}
      className="relative rounded-2xl p-5 cursor-pointer overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(20px)', boxShadow: `0 0 40px ${stat.glow}` }}>
      <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
        style={{ background: `${stat.color}20`, border: `1px solid ${stat.color}40` }}>
        <Icon size={20} color={stat.color} />
      </div>
      <p className="text-[11px] text-slate-400 font-medium uppercase tracking-wider mb-1">{stat.label}</p>
      <p className="text-3xl font-black text-white mb-2">{stat.value}</p>
      <p className="text-xs font-semibold" style={{ color: stat.color }}>{stat.sub}</p>
    </motion.div>
  );
}

/* ─── Main ───────────────────────────────────────────────────────────────────── */
export default function LandingPage() {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [alertIdx, setAlertIdx] = useState(0);
  const [alertsOpen, setAlertsOpen] = useState(false);

  // Parallax logic for planet
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const handleMouseMove = (e) => {
    const { clientX, clientY } = e;
    const { innerWidth, innerHeight } = window;
    mouseX.set((clientX / innerWidth - 0.5) * 2);
    mouseY.set((clientY / innerHeight - 0.5) * 2);
  };

  const smoothX = useTransform(mouseX, [-1, 1], [-20, 20]);
  const smoothY = useTransform(mouseY, [-1, 1], [-20, 20]);
  const rotateX = useTransform(mouseY, [-1, 1], [5, -5]);
  const rotateY = useTransform(mouseX, [-1, 1], [-5, 5]);

  useEffect(() => {
    const t = setInterval(() => setAlertIdx(i => (i + 1) % LIVE_ALERTS.length), 3500);
    return () => clearInterval(t);
  }, []);

  return (
    <div onMouseMove={handleMouseMove} style={{ minHeight: '100vh', background: 'radial-gradient(circle at center, #02201b 0%, #010a08 100%)', fontFamily: "'Inter',sans-serif", overflowX: 'hidden' }}>

      {/* CSS keyframes */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        @keyframes globeSpin  { from { transform: rotateZ(0deg); }   to { transform: rotateZ(360deg); } }
        @keyframes orbitSpin  { from { transform: perspective(600px) rotateX(72deg) rotateZ(0deg); } to { transform: perspective(600px) rotateX(72deg) rotateZ(360deg); } }
        @keyframes floatY     { 0%,100% { transform: translateY(0px); } 50% { transform: translateY(-18px); } }
        @keyframes ping       { 75%,100% { transform: scale(2.8); opacity: 0; } }
        @keyframes orbitDot   { from { transform: rotateZ(0deg) translateX(295px); } to { transform: rotateZ(360deg) translateX(295px); } }
        .globe-float { animation: floatY 6s ease-in-out infinite; }
        * { box-sizing: border-box; }
        a { text-decoration: none; }
      `}</style>


      {/* Ambient glows */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 0 }}>
        <div style={{ position: 'absolute', top: 0, right: 0, width: 700, height: 700, borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,166,147,0.12) 0%, transparent 70%)', transform: 'translate(30%,-30%)' }} />
        <div style={{ position: 'absolute', bottom: 0, left: 0, width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,166,147,0.08) 0%, transparent 70%)', transform: 'translate(-30%,30%)' }} />
      </div>

      {/* ── NAVBAR ─────────────────────────────────────────────────────────── */}
      <Navbar />

      {/* ── HERO ───────────────────────────────────────────────────────────── */}
      <section style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', paddingTop: 64, position: 'relative' }}>

        {/* Background Planet - Static and positioned exactly like the reference image */}
        <div style={{ position: 'absolute', top: '5%', right: '-10%', width: 1100, height: 1100, zIndex: 0, pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>

          {/* Tightly coupled atmospheric glow with no gap */}
          <div style={{ position: 'absolute', width: '75%', height: '75%', background: 'radial-gradient(circle, rgba(0,166,147,0.3) 0%, rgba(0,166,147,0.15) 50%, transparent 70%)', filter: 'blur(40px)', borderRadius: '50%' }} />

          <img
            src="/textures/custom_planet.png"
            alt="Planet"
            style={{
              position: 'relative',
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              WebkitMaskImage: 'radial-gradient(circle, black 65%, transparent 72%)',
              maskImage: 'radial-gradient(circle, black 65%, transparent 72%)',
              filter: 'saturate(1.2) contrast(1.15)'
            }}
          />
        </div>

        <Particles />
        <div style={{ position: 'relative', zIndex: 10, width: '100%', maxWidth: 1280, margin: '0 auto', padding: '0 3rem', display: 'flex', alignItems: 'center', gap: 48 }}>

          {/* Left — Text */}
          <motion.div initial={{ opacity: 0, x: -40 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.8 }} style={{ flex: 1, maxWidth: 600 }}>

            <motion.h1 initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
              style={{ fontSize: 56, fontWeight: 900, lineHeight: 1.1, color: 'white', margin: '0 0 20px' }}>
              Stronger<br />Communities<br />Smarter Response<br />
              <span style={{ color: '#00A693' }}>
                Safer Tomorrow
              </span>
            </motion.h1>

            <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
              style={{ color: '#94a3b8', fontSize: 16, lineHeight: 1.7, marginBottom: 32, maxWidth: 440 }}>
              CivicShield AI unifies citizen reports, real-time disaster intelligence, geospatial monitoring, and AI-powered coordination to help governments and communities respond faster.
            </motion.p>

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}
              style={{ display: 'flex', gap: 12, marginBottom: 36, flexWrap: 'wrap' }}>
              <Link to="/register" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 24px', borderRadius: 12, fontSize: 14, fontWeight: 700, color: 'white', background: '#00A693', boxShadow: '0 4px 30px rgba(0,166,147,0.4)' }}>
                <Users size={15} /> Get Emergency Alerts
              </Link>
              <Link to="/portal" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 24px', borderRadius: 12, fontSize: 14, fontWeight: 700, color: '#cbd5e1', border: '1px solid rgba(255,255,255,0.15)', background: 'transparent' }}>
                <MapPin size={15} /> View Resources
              </Link>
            </motion.div>

            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {[{ l: 'Guest', c: '#64748b' }, { l: 'Citizen', c: '#00A693' }, { l: 'Coordinator', c: '#8b5cf6' }, { l: 'Admin', c: '#ef4444' }].map((r, i, a) => (
                <div key={r.l} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: `${r.c}15`, border: `1px solid ${r.c}30`, color: r.c }}>{r.l}</span>
                  {i < a.length - 1 && <ChevronRight size={11} color="#475569" />}
                </div>
              ))}
              <span style={{ fontSize: 11, color: '#475569', marginLeft: 4 }}>Role-based access</span>
            </motion.div>
          </motion.div>

          {/* Right — Interactive Alerts (Planet is now in background) */}
          <motion.div initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1, delay: 0.3 }}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>

            <div style={{ position: 'relative', width: '100%', height: 400 }}>
              {/* Removed the small planet image so it can be full-screen in the background! */}

              {/* Floating alert chip removed per user request */}
            </div>
          </motion.div>
        </div>

      </section>

      {/* ── STAT CARDS (below hero, full width) ───────────────────────── */}
      <div style={{ position: 'relative', zIndex: 10, padding: '40px 3rem 60px' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
          {STATS.map((s, i) => <StatCard key={i} stat={s} i={i} />)}
        </div>
      </div>

      {/* ── LIVE ALERTS FAB (bottom-right, slides up on click) ──────────── */}
      <div style={{ position: 'fixed', bottom: 28, right: 24, zIndex: 50, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>

        {/* Dropdown panel — slides up from the button */}
        <AnimatePresence>
          {alertsOpen && (
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 300, damping: 28 }}
              style={{ width: 268, background: 'rgba(6,14,22,0.97)', border: '1px solid rgba(0,166,147,0.25)', borderRadius: 16, backdropFilter: 'blur(24px)', boxShadow: '0 -8px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,166,147,0.08)', overflow: 'hidden' }}>
              {/* Panel header */}
              <div style={{ padding: '12px 14px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'white' }}>Live Disaster Updates</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 700, color: '#00A693' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#00A693', boxShadow: '0 0 6px #00A693', animation: 'ping 1.5s ease infinite' }} /> LIVE
                </span>
              </div>
              {/* Alert list */}
              <div style={{ padding: '8px 10px' }}>
                {LIVE_ALERTS.map((a, i) => (
                  <motion.div key={a.id}
                    initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }}
                    style={{ display: 'flex', gap: 10, padding: '7px 6px', borderRadius: 10, cursor: 'pointer', marginBottom: 3 }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <div style={{ width: 30, height: 30, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: `${a.color}18`, border: `1px solid ${a.color}35` }}>
                      <span style={{ fontSize: 13 }}>{a.icon}</span>
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</div>
                      <div style={{ fontSize: 9, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.location}</div>
                      <div style={{ fontSize: 9, color: '#475569', marginTop: 1 }}>{a.time}</div>
                    </div>
                    <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, alignSelf: 'center', flexShrink: 0, background: `${a.color}15`, color: a.color, border: `1px solid ${a.color}30` }}>⚠</span>
                  </motion.div>
                ))}
              </div>
              {/* Footer link */}
              <div style={{ padding: '0 10px 10px' }}>
                <Link to="/portal" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px', borderRadius: 10, fontSize: 11, fontWeight: 600, color: '#00A693', border: '1px solid rgba(0,166,147,0.2)', background: 'rgba(0,166,147,0.05)' }}>
                  View All on Map <ArrowRight size={11} />
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* FAB Toggle Button */}
        <motion.button
          whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.96 }}
          onClick={() => setAlertsOpen(o => !o)}
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px', borderRadius: 999, border: '1px solid rgba(0,166,147,0.35)', background: alertsOpen ? 'rgba(0,166,147,0.18)' : 'rgba(6,14,22,0.95)', backdropFilter: 'blur(20px)', cursor: 'pointer', boxShadow: '0 4px 24px rgba(0,0,0,0.5), 0 0 20px rgba(0,166,147,0.15)', color: 'white', fontSize: 13, fontWeight: 700, transition: 'background 0.2s' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 8px #ef4444', flexShrink: 0, animation: 'ping 1.5s ease infinite' }} />
            Live Disaster Updates
          </span>
          <motion.span animate={{ rotate: alertsOpen ? 180 : 0 }} transition={{ duration: 0.2 }} style={{ fontSize: 10, color: '#00A693' }}>▲</motion.span>
        </motion.button>
      </div>

      {/* ── FEATURES ─────────────────────────────────────────────────────── */}
      <section style={{ padding: '120px 3rem', position: 'relative', zIndex: 10 }}>
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} style={{ textAlign: 'center', marginBottom: 60 }}>
            <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 700, color: '#00A693', textTransform: 'uppercase', letterSpacing: 3, padding: '5px 14px', borderRadius: 999, background: 'rgba(0,166,147,0.1)', border: '1px solid rgba(0,166,147,0.2)', marginBottom: 20 }}>
              Platform Capabilities
            </span>
            <h2 style={{ fontSize: 44, fontWeight: 900, color: 'white', lineHeight: 1.15, margin: '0 0 16px' }}>
              Built for India's<br />
              <span style={{ color: '#00A693' }}>
                Scale of Emergencies
              </span>
            </h2>
            <p style={{ color: '#94a3b8', maxWidth: 520, margin: '0 auto', lineHeight: 1.7 }}>
              From village-level citizen reports to national NDRF coordination — CivicShield AI handles the full emergency response lifecycle.
            </p>
          </motion.div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20 }}>
            {FEATURES.map((f, i) => {
              const Icon = f.icon;
              return (
                <motion.div key={i} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
                  whileHover={{ y: -6 }}
                  style={{ padding: 24, borderRadius: 20, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(10px)', cursor: 'default' }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, background: 'rgba(0,166,147,0.1)', border: '1px solid rgba(0,166,147,0.25)' }}>
                    <Icon size={20} color="#00A693" />
                  </div>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: 'white', marginBottom: 8 }}>{f.title}</h3>
                  <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.6 }}>{f.desc}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── CTA BANNER ────────────────────────────────────────────────────── */}
      <section style={{ padding: '0 3rem 100px', position: 'relative', zIndex: 10 }}>
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }}
            style={{ borderRadius: 28, overflow: 'hidden', padding: '48px', background: 'linear-gradient(135deg,rgba(0,166,147,0.12),rgba(0,166,147,0.06))', border: '1px solid rgba(0,166,147,0.25)', position: 'relative' }}>
            <div style={{ position: 'absolute', top: -60, right: -60, width: 200, height: 200, borderRadius: '50%', background: 'radial-gradient(circle,#00A693,transparent)', opacity: 0.12, filter: 'blur(30px)' }} />
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                <div style={{ width: 56, height: 56, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,166,147,0.15)', border: '1px solid rgba(0,166,147,0.3)', flexShrink: 0 }}>
                  <Bell size={24} color="#00A693" />
                </div>
                <div>
                  <h3 style={{ fontSize: 20, fontWeight: 800, color: 'white', marginBottom: 6 }}>Stay Informed. Stay Safe.</h3>
                  <p style={{ fontSize: 13, color: '#94a3b8', maxWidth: 420, lineHeight: 1.6 }}>
                    Enable location access to receive personalized alerts, nearby incidents, and emergency updates from state coordinators.
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12, flexShrink: 0 }}>
                <Link to="/register" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 24px', borderRadius: 12, fontSize: 14, fontWeight: 700, color: 'white', background: 'linear-gradient(135deg,#00A693,#00A693)', boxShadow: '0 4px 25px rgba(0,166,147,0.35)' }}>
                  <Bell size={15} /> Enable Alerts
                </Link>
                <Link to="/portal" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 24px', borderRadius: 12, fontSize: 14, fontWeight: 700, color: '#cbd5e1', border: '1px solid rgba(255,255,255,0.15)' }}>
                  View Map
                </Link>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── FOOTER ────────────────────────────────────────────────────────── */}
      <footer style={{ borderTop: '1px solid rgba(255,255,255,0.05)', padding: '28px 3rem', position: 'relative', zIndex: 10 }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Shield size={16} color="#00A693" />
            <span style={{ fontSize: 14, fontWeight: 800, color: 'white' }}>CivicShield</span>
            <span style={{ fontSize: 14, fontWeight: 800, color: '#00A693' }}>AI</span>
            <span style={{ fontSize: 11, color: '#475569', marginLeft: 8 }}>© 2026</span>
          </div>
          <p style={{ fontSize: 11, color: '#475569' }}>India's AI-Powered Disaster Intelligence & Response Platform 🇮🇳</p>
          <div style={{ display: 'flex', gap: 24 }}>
            {[{ l: 'Live Map', to: '/portal' }, { l: 'Sign In', to: '/login' }, { l: 'Sign Up', to: '/register' }].map(x => (
              <Link key={x.l} to={x.to} style={{ fontSize: 12, color: '#64748b' }}
                onMouseEnter={e => e.target.style.color = 'white'} onMouseLeave={e => e.target.style.color = '#64748b'}>{x.l}</Link>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
