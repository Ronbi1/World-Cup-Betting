// Single Express app shared by every Vercel Serverless invocation and by the
// local dev server (dev-server.cjs). Every backend route lives here — the
// project rule mandates Vercel + Supabase only, no separate Node host.
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const authRoutes = require('./_routes/auth.routes');
const usersRoutes = require('./_routes/users.routes');
const predictionsRoutes = require('./_routes/predictions.routes');
const footballRoutes = require('./_routes/football.routes');
const scoresRoutes = require('./_routes/scores.routes');
const spotlightRoutes = require('./_routes/spotlight.routes');
const cronRoutes = require('./_routes/cron.routes');
const adminRoutes = require('./_routes/admin.routes');
const { errorHandler } = require('./_lib/errorHandler');
const { isSimulationMode } = require('./_lib/simulation');
const { requestTiming } = require('./_lib/requestTiming');

const app = express();

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
app.use(cookieParser());
app.use(express.json({ limit: '256kb' }));

// Vercel forwards req.url with the full /api/* prefix intact. Mount routers
// under /api so Express path matching lines up with what the client sent.
app.get('/api/health', (_req, res) =>
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    simulationMode: isSimulationMode(),
  })
);
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
// Diagnostic timing middleware — mounted ONLY on the page-load routes we're
// trying to diagnose. Auth and users keep their existing logs untouched.
app.use('/api/predictions', requestTiming('/api/predictions'), predictionsRoutes);
app.use('/api/scores', requestTiming('/api/scores'), scoresRoutes);
app.use('/api/spotlight', requestTiming('/api/spotlight'), spotlightRoutes);
app.use('/api/football', requestTiming('/api/football'), footballRoutes);
// Scheduled-only writer of matches_mirror + teams_mirror.
app.use('/api/cron', cronRoutes);
// Admin-only diagnostic + manual-trigger endpoints. Not in the UI.
app.use('/api/admin', adminRoutes);

app.use((req, res) => {
  res.status(404).json({ error: `Not found: ${req.method} ${req.originalUrl}` });
});
app.use(errorHandler);

module.exports = app;
