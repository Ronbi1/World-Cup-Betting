const express = require('express');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/auth.routes');
const usersRoutes = require('./routes/users.routes');
const predictionsRoutes = require('./routes/predictions.routes');
const { router: footballRoutes } = require('./routes/football.routes');
const scoresRoutes = require('./routes/scores.routes');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();

// ─── CORS ─────────────────────────────────────────────────────────────────────
// Allow requests from the Vite dev server.
// In production, replace with your actual deployed frontend URL.
app.use(cors({
  origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));

// ─── Body parser ──────────────────────────────────────────────────────────────
app.use(express.json());

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/auth',        authRoutes);
app.use('/users',       usersRoutes);
app.use('/predictions', predictionsRoutes);
app.use('/football',    footballRoutes);
app.use('/scores',      scoresRoutes);

// ─── Central error handler (must be last) ────────────────────────────────────
app.use(errorHandler);

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`\n🚀 Express server running on http://localhost:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health\n`);
});
