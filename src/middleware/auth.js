const jwt = require('jsonwebtoken');
const db = require('../db');
const asyncHandler = require('../utils/asyncHandler');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET is not set. Copy .env.example to .env and fill it in.');
}
const TOKEN_TTL = process.env.TOKEN_TTL || '12h';
const COOKIE_MAX_AGE = 12 * 60 * 60 * 1000;

function signToken(user) {
  return jwt.sign({ uid: user.id, role: user.role }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

function setAuthCookie(res, token) {
  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true',
    maxAge: COOKIE_MAX_AGE
  });
}

function clearAuthCookie(res) { res.clearCookie('token'); }

// Verifies the JWT, then ALWAYS reloads the user from the database.
// Role/identity is taken from the DB, never trusted from the client.
const authenticate = asyncHandler(async (req, res, next) => {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ error: 'Please log in to continue.' });

  let payload;
  try { payload = jwt.verify(token, JWT_SECRET); }
  catch { return res.status(401).json({ error: 'Your session has expired. Please log in again.' }); }

  const user = await db.prepare(
    'SELECT id, name, mobile, email, role, created_at FROM users WHERE id = ?'
  ).get(payload.uid);

  if (!user) return res.status(401).json({ error: 'Account not found.' });
  if (user.role !== payload.role) {
    clearAuthCookie(res);
    return res.status(401).json({ error: 'Session is no longer valid. Please log in again.' });
  }
  req.user = user;
  next();
});

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to perform this action.' });
    }
    next();
  };
}

module.exports = { signToken, setAuthCookie, clearAuthCookie, authenticate, requireRole };