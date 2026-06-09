const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');
const { supabase } = require('../_lib/supabase');

const router = express.Router();

const BCRYPT_SALT_ROUNDS = 12;
const JWT_EXPIRES_IN = '7d';

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role, status: user.status },
    process.env.JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function sanitizeUser(user) {
  const { password: _pw, ...safe } = user;
  return { ...safe, createdAt: user.created_at || user.createdAt };
}

// Robust password check: bcrypt-first, with one-time migration from any legacy
// plain-text rows that exist from the pre-backend era.
async function verifyPassword(plainPassword, storedPassword) {
  const looksLikeHash =
    storedPassword && (storedPassword.startsWith('$2b$') || storedPassword.startsWith('$2a$'));

  if (looksLikeHash) {
    try {
      const valid = await bcrypt.compare(plainPassword, storedPassword);
      return { valid, needsMigration: false };
    } catch {
      // fall through to plain-text fallback
    }
  }

  const valid = plainPassword === storedPassword;
  return { valid, needsMigration: valid };
}

async function migratePassword(userId, plainPassword) {
  try {
    const hashed = await bcrypt.hash(plainPassword, BCRYPT_SALT_ROUNDS);
    await supabase.from('users').update({ password: hashed }).eq('id', userId);
  } catch (err) {
    console.error(`[auth] password migration failed for ${userId}:`, err.message);
  }
}

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const { data: user, error: fetchError } = await supabase
      .from('users')
      .select('id, email, name, password, role, status, created_at, bet, scores')
      .eq('email', String(email).toLowerCase().trim())
      .single();

    if (fetchError || !user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const { valid, needsMigration } = await verifyPassword(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    if (needsMigration) migratePassword(user.id, password); // fire-and-forget

    if (user.status === 'PENDING') {
      return res.status(403).json({ error: 'Your account is pending admin approval.' });
    }
    if (user.status === 'REJECTED') {
      return res.status(403).json({ error: 'Your registration was rejected. Contact the admin.' });
    }

    return res.status(200).json({ token: signToken(user), user: sanitizeUser(user) });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/register
router.post('/register', async (req, res, next) => {
  try {
    const { email, password, name, winningTeam, topScorer, topAssist } = req.body || {};

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }
    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }
    if (name.trim().length < 2) {
      return res.status(400).json({ error: 'Name must be at least 2 characters.' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const hashedPassword = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

    const newUser = {
      id: `user-${randomUUID()}`,
      email: normalizedEmail,
      password: hashedPassword,
      name: name.trim(),
      role: 'USER',
      status: 'PENDING',
      bet: {
        winningTeam: winningTeam || null,
        topScorer: topScorer || null,
        topAssist: topAssist || null,
      },
    };

    const { data: created, error: insertError } = await supabase
      .from('users')
      .insert(newUser)
      .select('id, email, name, role, status, created_at, bet, scores')
      .single();

    if (insertError) {
      // Postgres unique-violation on the users.email UNIQUE constraint
      if (insertError.code === '23505') {
        return res.status(409).json({ error: 'An account with this email already exists.' });
      }
      console.error('[auth/register] insert error:', insertError);
      return res.status(500).json({ error: 'Registration failed. Please try again.' });
    }

    return res.status(201).json({ user: sanitizeUser(created) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
