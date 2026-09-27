const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { signToken, setAuthCookie, clearAuthCookie, authenticate } = require('../middleware/auth');
const { isValidMobile, isValidEmail, isValidPasskey, clean, NAME_MAX } = require('../utils/validators');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();
const BCRYPT_ROUNDS = 12;

const publicUser = (u) => ({
  id: u.id, name: u.name, mobile: u.mobile, email: u.email,
  role: u.role, created_at: u.created_at
});

function validName(name) {
  const n = clean(name);
  if (!n) return 'User';
  if (n.length > NAME_MAX) return null;
  return n;
}

function checkMobileUnique(mobile) {
  return db.prepare('SELECT id FROM users WHERE mobile = ?').get(mobile);
}

async function isActiveSellerInvite(code) {
  return Boolean(code && await db.prepare('SELECT id FROM invite_codes WHERE code = ? AND active = 1').get(code));
}

// Register: DEVELOPER (only ONE can ever exist)
router.post('/register/developer', asyncHandler(async (req, res) => {
  const name = validName(req.body.name);
  const mobile = clean(req.body.mobile);
  const passkey = req.body.passkey;
  const inviteCode = clean(req.body.inviteCode);

  if (!name) return res.status(400).json({ error: `Name must be ${NAME_MAX} characters or fewer.` });
  if (inviteCode !== process.env.DEVELOPER_INVITE_CODE) {
    return res.status(403).json({ error: 'Invalid developer invite code.' });
  }
  if (!isValidMobile(mobile)) return res.status(400).json({ error: 'Enter a valid 10-digit Indian mobile number.' });
  if (!isValidPasskey(passkey)) return res.status(400).json({ error: 'Passkey must be 8–72 characters long.' });

  const existingDev = await db.prepare("SELECT id FROM users WHERE role = 'developer' LIMIT 1").get();
  if (existingDev) {
    return res.status(409).json({ error: 'A Developer account already exists. Only one Developer account is allowed.' });
  }
  if (await checkMobileUnique(mobile)) {
    return res.status(409).json({ error: 'This mobile number is already registered.' });
  }

  const hash = bcrypt.hashSync(passkey, BCRYPT_ROUNDS);
  const info = await db.prepare(
    "INSERT INTO users (name, mobile, passkey_hash, role) VALUES (?, ?, ?, 'developer')"
  ).run(name, mobile, hash);
  const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  setAuthCookie(res, signToken(user));
  res.status(201).json({ user: publicUser(user) });
}));

// Register: SELLER
router.post('/register/seller', asyncHandler(async (req, res) => {
  const name = validName(req.body.name);
  const mobile = clean(req.body.mobile);
  const email = clean(req.body.email).toLowerCase();
  const passkey = req.body.passkey;
  const inviteCode = clean(req.body.inviteCode);

  if (!name || name === 'User') return res.status(400).json({ error: 'Seller name is required.' });
  if (!isValidMobile(mobile)) return res.status(400).json({ error: 'Enter a valid 10-digit Indian mobile number.' });
  if (!isValidEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (!isValidPasskey(passkey)) return res.status(400).json({ error: 'Passkey must be 8–72 characters long.' });
  if (!await isActiveSellerInvite(inviteCode)) return res.status(403).json({ error: 'Invalid or inactive developer invite code.' });

  if (await checkMobileUnique(mobile)) return res.status(409).json({ error: 'This mobile number is already registered.' });
  if (await db.prepare('SELECT id FROM users WHERE email = ?').get(email)) {
    return res.status(409).json({ error: 'This email address is already registered.' });
  }

  const hash = bcrypt.hashSync(passkey, BCRYPT_ROUNDS);
  const info = await db.prepare(
    "INSERT INTO users (name, mobile, email, passkey_hash, role) VALUES (?, ?, ?, ?, 'seller')"
  ).run(name, mobile, email, hash);
  const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  setAuthCookie(res, signToken(user));
  res.status(201).json({ user: publicUser(user) });
}));

// Register: CUSTOMER
router.post('/register/customer', asyncHandler(async (req, res) => {
  const name = validName(req.body.name);
  const mobile = clean(req.body.mobile);
  const passkey = req.body.passkey;

  if (!name) return res.status(400).json({ error: `Name must be ${NAME_MAX} characters or fewer.` });
  if (!isValidMobile(mobile)) return res.status(400).json({ error: 'Enter a valid 10-digit Indian mobile number.' });
  if (!isValidPasskey(passkey)) return res.status(400).json({ error: 'Passkey must be 8–72 characters long.' });

  if (await checkMobileUnique(mobile)) {
    return res.status(409).json({ error: 'This mobile number is already registered.' });
  }

  const hash = bcrypt.hashSync(passkey, BCRYPT_ROUNDS);
  const info = await db.prepare(
    "INSERT INTO users (name, mobile, passkey_hash, role) VALUES (?, ?, ?, 'customer')"
  ).run(name, mobile, hash);
  const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  setAuthCookie(res, signToken(user));
  res.status(201).json({ user: publicUser(user) });
}));

// Login — role is detected from the account in the DB
router.post('/login', asyncHandler(async (req, res) => {
  const identifier = clean(req.body.identifier);
  const passkey = req.body.passkey;
  const inviteCode = clean(req.body.inviteCode);

  if (!identifier || !passkey) {
    return res.status(400).json({ error: 'Mobile number/email and passkey are required.' });
  }

  const user = await db.prepare('SELECT * FROM users WHERE mobile = ? OR email = ?').get(identifier, identifier);
  if (!user) return res.status(401).json({ error: 'Account not found. Please check your credentials.' });
  if (user.role === 'seller' && !await isActiveSellerInvite(inviteCode)) {
    return res.status(403).json({ error: 'A valid developer invite code is required for seller login.' });
  }
  if (!bcrypt.compareSync(passkey, user.passkey_hash)) {
    return res.status(401).json({ error: 'Incorrect passkey. Please try again.' });
  }

  setAuthCookie(res, signToken(user));
  res.json({ user: publicUser(user) });
}));

router.post('/logout', (req, res) => { clearAuthCookie(res); res.json({ ok: true }); });

router.get('/me', authenticate, (req, res) => { res.json({ user: req.user }); });

module.exports = router;