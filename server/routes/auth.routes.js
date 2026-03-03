const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto'); // CRIT-5: collision-safe IDs
const { supabase } = require('../config/supabase');
require('dotenv').config();

const router = express.Router();

const BCRYPT_SALT_ROUNDS = 12;
const JWT_EXPIRES_IN = '7d';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Signs a JWT with a minimal payload.
 * Only includes what the server needs for authorization decisions.
 * Sensitive fields (password, bet details) are deliberately excluded.
 */
function signToken(user) {
  return jwt.sign(
    {
      id:     user.id,
      email:  user.email,
      name:   user.name,
      role:   user.role,
      status: user.status,
    },
    process.env.JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

/**
 * Strips the password field before returning user data to the client.
 */
function sanitizeUser(user) {
  const { password: _pw, ...safe } = user;
  return { ...safe, createdAt: user.created_at || user.createdAt };
}

/**
 * Robust password verification with automatic migration:
 *
 * 1. If the stored value looks like a bcrypt hash ($2b$ or $2a$),
 *    use bcrypt.compare for a proper cryptographic check.
 *
 * 2. If it doesn't look like a bcrypt hash (legacy plain-text from
 *    before the backend was added), compare as plain text.
 *    On match, immediately hash and persist the upgraded password.
 *
 * 3. Fallback: if bcrypt.compare throws (corrupt hash format),
 *    attempt plain-text comparison as a last resort.
 *
 * Returns { valid: boolean, needsMigration: boolean }
 */
async function verifyPassword(plainPassword, storedPassword, userId) {
  const looksLikeHash = storedPassword &&
    (storedPassword.startsWith('$2b$') || storedPassword.startsWith('$2a$'));

  if (looksLikeHash) {
    try {
      const valid = await bcrypt.compare(plainPassword, storedPassword);
      return { valid, needsMigration: false };
    } catch {
      // bcrypt.compare threw — hash might be malformed.
      // Fall through to plain-text check as last resort.
      console.warn(`[Auth] bcrypt.compare failed for user ${userId}, falling back to plain-text check.`);
    }
  }

  // Plain-text comparison (legacy passwords or bcrypt fallback)
  const valid = plainPassword === storedPassword;
  return { valid, needsMigration: valid }; // if valid, it needs upgrading
}

/**
 * Upgrades a plain-text password to bcrypt in the DB.
 * Runs asynchronously — login is not blocked if this fails.
 */
async function migratePassword(userId, plainPassword) {
  try {
    const hashed = await bcrypt.hash(plainPassword, BCRYPT_SALT_ROUNDS);
    const { error } = await supabase
      .from('users')
      .update({ password: hashed })
      .eq('id', userId);
    if (error) throw error;
    console.log(`[Auth] Password migrated to bcrypt for user ${userId}`);
  } catch (err) {
    // Non-fatal: user is already logged in. Log and continue.
    console.error(`[Auth] Password migration failed for user ${userId}:`, err.message);
  }
}

// ─── POST /auth/login ─────────────────────────────────────────────────────────
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    // 1. Fetch user by email (case-insensitive).
    // SMELL-3 fix: explicit field list instead of SELECT * to avoid fetching unnecessary data.
    const { data: user, error: fetchError } = await supabase
      .from('users')
      .select('id, email, name, password, role, status, created_at, bet, scores')
      .eq('email', email.toLowerCase().trim())
      .single();

    // Treat "no row found" and "invalid credentials" the same to prevent
    // user enumeration attacks.
    if (fetchError || !user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // 2. Verify password with automatic migration
    const { valid, needsMigration } = await verifyPassword(password, user.password, user.id);

    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // 3. Migrate plain-text password to bcrypt (non-blocking)
    if (needsMigration) {
      migratePassword(user.id, password); // intentionally not awaited
    }

    // 4. Check registration status
    if (user.status === 'PENDING') {
      return res.status(403).json({ error: 'Your account is pending admin approval.' });
    }
    if (user.status === 'REJECTED') {
      return res.status(403).json({ error: 'Your registration was rejected. Contact the admin.' });
    }

    // 5. Sign JWT and respond
    const token = signToken(user);

    return res.status(200).json({
      token,
      user: sanitizeUser(user),
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /auth/register ──────────────────────────────────────────────────────
router.post('/register', async (req, res, next) => {
  try {
    const { email, password, name, winningTeam, topScorer, topAssist } = req.body;

    // 1. Input validation
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

    // 2. Hash password before storing — never store plain text
    const hashedPassword = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

    // 3. Insert new user.
    // CRIT-5 fix: use randomUUID() instead of Date.now() — millisecond-resolution
    //             timestamps can collide under concurrent registrations.
    // CRIT-4 fix: removed the manual duplicate-check SELECT before insert.
    //             The UNIQUE constraint on the email column in Supabase is the
    //             only reliable guard — the SELECT+INSERT pattern has a TOCTOU
    //             race condition window. We catch the 23505 PostgreSQL error instead.
    const newUser = {
      id:       `user-${randomUUID()}`,
      email:    normalizedEmail,
      password: hashedPassword,
      name:     name.trim(),
      role:     'USER',
      status:   'PENDING',
      bet: {
        winningTeam: winningTeam || null,
        topScorer:   topScorer   || null,
        topAssist:   topAssist   || null,
      },
    };

    const { data: created, error: insertError } = await supabase
      .from('users')
      .insert(newUser)
      .select('id, email, name, role, status, created_at, bet, scores')
      .single();

    if (insertError) {
      // CRIT-4 fix: catch the PostgreSQL unique violation (code 23505) from the
      // UNIQUE constraint on users.email — this is the correct atomic guard.
      if (insertError.code === '23505') {
        return res.status(409).json({ error: 'An account with this email already exists.' });
      }
      console.error('[Register] Supabase insert error:', insertError.message, insertError.code);
      return res.status(500).json({ error: 'Registration failed. Please try again.' });
    }

    return res.status(201).json({
      user: sanitizeUser(created),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
