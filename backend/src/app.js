require('dotenv').config();
global.WebSocket = require('ws');
const express = require('express');

// Initialize Sentry conditionally
if (process.env.SENTRY_DSN) {
  const Sentry = require("@sentry/node");
  const { nodeProfilingIntegration } = require("@sentry/profiling-node");

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    integrations: [
      nodeProfilingIntegration(),
    ],
    tracesSampleRate: 1.0,
    profilesSampleRate: 1.0,
  });
}
const statesRoutes = require('./routes/states');
const adminRoutes = require('./routes/admin');
const cors = require('cors');
const helmet = require('helmet');
const { createServer } = require('http');
const { Server } = require('socket.io');
const rateLimit = require('express-rate-limit');
const { startCronJobs } = require('./cron/apiPollers');
const requestLogger = require('./middleware/requestLogger');
const errorHandler  = require('./middleware/errorHandler');
const stateScope    = require('./middleware/stateScope');

// M3 FIX: restrict CORS to an explicit allow-list from env
// In dev, defaults to both common Vite and CRA ports.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:5173')
  .split(',').map(o => o.trim()).filter(Boolean);

function corsOriginCheck(origin, callback) {
  // Allow requests with no origin (server-to-server, curl, mobile apps)
  if (!origin) return callback(null, true);
  if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
  callback(new Error(`CORS: Origin '${origin}' is not in the allow-list`));
}

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: corsOriginCheck,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// ── Security Middleware ───────────────────────────
app.use(helmet());
app.use(cors({
  origin: corsOriginCheck,
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);  // ← HTTP request logging w/ requestId

// Global rate limiter — generous for dev; tighten in production
app.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 100 : 2000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
}));

// Apply state scope resolving for coordinators globally across API
app.use('/api', stateScope);

// ── Routes ───────────────────────────────────────────
app.use('/api/events',    require('./routes/events'));
app.use('/api/alerts',    require('./routes/alerts'));
app.use('/api/resources', require('./routes/resources'));
app.use('/api/incidents', require('./routes/incidents'));
app.use('/api/predictions', require('./routes/predictions'));
app.use('/api/states', statesRoutes);
app.use('/api/admin', adminRoutes);

// ── Health Check ─────────────────────────────
const { getAdminDb } = require('./lib/db'); // m5: singleton
const axios = require('axios');

app.get('/health', async (_req, res) => {
  let dbStatus = 'disconnected';
  let mlStatus = 'offline';

  try {
    const { error } = await getAdminDb().from('events').select('id').limit(1);
    if (!error) dbStatus = 'connected';
  } catch (e) {}

  try {
    if (process.env.ML_SERVICE_URL) {
      await axios.get(`${process.env.ML_SERVICE_URL}/health`, { timeout: 3000 });
      mlStatus = 'online';
    }
  } catch (e) {}

  res.json({
    status: 'ok',
    database: dbStatus,
    ml_service: mlStatus,
    allowed_origins: ALLOWED_ORIGINS,
  });
});

// ── 404 handler ──────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: true, message: 'Route not found' }));

// ── Global error handler (must be LAST) ──────────────
if (process.env.SENTRY_DSN) {
  const Sentry = require("@sentry/node");
  Sentry.setupExpressErrorHandler(app);
}
app.use(errorHandler);

// ── Socket.io ────────────────────────────────
// N1 FIX: Secure io.use() middleware verifies JWT before allowing connections
io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(); // join as anonymous

  try {
    const { getAnonDb, getAdminDb } = require('./lib/db');
    // Verify token using anon client
    const { data: { user }, error: authError } = await getAnonDb().auth.getUser(token);
    if (authError || !user) {
      return next(new Error('Authentication failed'));
    }
    socket.userId = user.id;

    // Look up profile state and role
    const { data: profile } = await getAdminDb()
      .from('user_profiles')
      .select('state_id, role')
      .eq('id', user.id)
      .single();

    if (profile) {
      socket.userRole = profile.role || 'citizen';
      socket.userStateId = profile.state_id;
    }
  } catch (err) {
    console.error('[Socket] Auth error:', err.message);
  }
  next();
});

// Broadcasts in apiPollers use io.to('room') instead of io.emit.
io.on('connection', (socket) => {
  console.log(`[Socket] Client connected: ${socket.id}`);

  // Server sets these values based on the secure io.use() middleware
  const role    = socket.userRole;
  const stateId = socket.userStateId;

  socket.join('public');                          // all clients
  if (role)    socket.join(`role:${role}`);       // e.g. role:coordinator
  if (stateId) socket.join(`state:${stateId}`);   // e.g. state:<uuid>

  socket.on('disconnect', () => {
    console.log(`[Socket] Client disconnected: ${socket.id}`);
  });
});

// Expose io so apiPollers can emit to scoped rooms
app.set('io', io);

// ── Start server ─────────────────────────────────────
const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => {
  console.log(`✅ CivicShield backend running on port ${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  startCronJobs(io);
});

module.exports = { app, httpServer };
