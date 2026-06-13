require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { createServer } = require('http');
const { Server } = require('socket.io');
const rateLimit = require('express-rate-limit');
const { startCronJobs } = require('./cron/apiPollers');
const requestLogger = require('./middleware/requestLogger');
const errorHandler  = require('./middleware/errorHandler');

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: function(origin, callback) { callback(null, true); },
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// ── Security Middleware ──────────────────────────────
app.use(helmet());
app.use(cors({
  origin: function(origin, callback) { callback(null, true); },
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

// ── Routes ───────────────────────────────────────────
app.use('/api/events',    require('./routes/events'));
app.use('/api/alerts',    require('./routes/alerts'));
app.use('/api/resources', require('./routes/resources'));
app.use('/api/incidents', require('./routes/incidents'));
app.use('/api/predictions', require('./routes/predictions'));

// ── Health Check ─────────────────────────────────────
app.get('/health', (_req, res) => res.json({
  status: 'ok',
  service: 'civicshield-backend',
  version: '1.0.0',
  timestamp: new Date().toISOString(),
}));

// ── 404 handler ──────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: true, message: 'Route not found' }));

// ── Global error handler (must be LAST) ──────────────
app.use(errorHandler);

// ── Socket.io ────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[Socket] Client connected: ${socket.id}`);
  socket.on('disconnect', () => {
    console.log(`[Socket] Client disconnected: ${socket.id}`);
  });
});

// ── Start server ─────────────────────────────────────
const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => {
  console.log(`✅ CivicShield backend running on port ${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  startCronJobs(io);
});

module.exports = { app, httpServer };
