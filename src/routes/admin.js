// Every route here is Developer-only — enforced before ANY handler runs.
const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');
const { clean } = require('../utils/validators');
const asyncHandler = require('../utils/asyncHandler');
const { deleteProductImage } = require('../utils/productImages');

const router = express.Router();
router.use(authenticate, requireRole('developer'));

router.get('/stats', asyncHandler(async (req, res) => {
  const totalUsers = (await db.prepare('SELECT COUNT(*) AS c FROM users').get()).c;
  const totalSellers = (await db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'seller'").get()).c;
  const totalCustomers = (await db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'customer'").get()).c;
  const totalProducts = (await db.prepare('SELECT COUNT(*) AS c FROM products').get()).c;
  res.json({ totalUsers, totalSellers, totalCustomers, totalProducts });
}));

router.get('/invite-codes', asyncHandler(async (req, res) => {
  const inviteCodes = await db.prepare('SELECT id, code, active, created_at FROM invite_codes ORDER BY created_at DESC').all();
  res.json({ inviteCodes });
}));

router.post('/invite-codes', asyncHandler(async (req, res) => {
  let code;
  do {
    code = `SELLER-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
  } while (await db.prepare('SELECT id FROM invite_codes WHERE code = ?').get(code));
  await db.prepare('INSERT INTO invite_codes (code) VALUES (?)').run(code);
  res.status(201).json({ code });
}));

router.delete('/invite-codes/:id', asyncHandler(async (req, res) => {
  const result = await db.prepare('UPDATE invite_codes SET active = 0 WHERE id = ? AND active = 1').run(req.params.id);
  if (!result.changes) return res.status(404).json({ error: 'Active invite code not found.' });
  res.json({ ok: true });
}));

router.get('/users', asyncHandler(async (req, res) => {
  const role = ['developer', 'seller', 'customer'].includes(req.query.role) ? req.query.role : null;
  const sql = role
    ? "SELECT id, name, mobile, email, role, created_at FROM users WHERE role = ? ORDER BY created_at DESC"
    : "SELECT id, name, mobile, email, role, created_at FROM users ORDER BY created_at DESC";
  const users = role ? await db.prepare(sql).all(role) : await db.prepare(sql).all();
  res.json({ users });
}));

router.get('/products', asyncHandler(async (req, res) => {
  const products = await db.prepare(`
    SELECT p.*, c.name AS category_name, u.name AS seller_name FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    JOIN users u ON u.id = p.seller_id ORDER BY p.created_at DESC
  `).all();
  res.json({ products });
}));

router.get('/categories', asyncHandler(async (req, res) => {
  const categories = await db.prepare(`
    SELECT c.id, c.name, c.created_at, COUNT(p.id) AS product_count
    FROM categories c LEFT JOIN products p ON p.category_id = c.id
    GROUP BY c.id ORDER BY LOWER(c.name)
  `).all();
  res.json({ categories });
}));

router.post('/categories', asyncHandler(async (req, res) => {
  const name = clean(req.body.name);
  if (!name || name.length > 60) return res.status(400).json({ error: 'Category name is required and must be 60 characters or fewer.' });
  if (await db.prepare('SELECT id FROM categories WHERE LOWER(name) = LOWER(?)').get(name)) {
    return res.status(409).json({ error: 'A category with this name already exists.' });
  }
  const result = await db.prepare('INSERT INTO categories (name) VALUES (?)').run(name);
  res.status(201).json({ category: await db.prepare('SELECT id, name, created_at FROM categories WHERE id = ?').get(result.lastInsertRowid) });
}));

router.put('/categories/:id', asyncHandler(async (req, res) => {
  const category = await db.prepare('SELECT id FROM categories WHERE id = ?').get(req.params.id);
  if (!category) return res.status(404).json({ error: 'Category not found.' });
  const name = clean(req.body.name);
  if (!name || name.length > 60) return res.status(400).json({ error: 'Category name is required and must be 60 characters or fewer.' });
  if (await db.prepare('SELECT id FROM categories WHERE LOWER(name) = LOWER(?) AND id != ?').get(name, category.id)) {
    return res.status(409).json({ error: 'A category with this name already exists.' });
  }
  await db.prepare('UPDATE categories SET name = ? WHERE id = ?').run(name, category.id);
  res.json({ category: await db.prepare('SELECT id, name, created_at FROM categories WHERE id = ?').get(category.id) });
}));

router.delete('/categories/:id', asyncHandler(async (req, res) => {
  const category = await db.prepare('SELECT id FROM categories WHERE id = ?').get(req.params.id);
  if (!category) return res.status(404).json({ error: 'Category not found.' });
  const productCount = (await db.prepare('SELECT COUNT(*) AS count FROM products WHERE category_id = ?').get(category.id)).count;
  if (productCount) return res.status(409).json({ error: `This category is used by ${productCount} product${productCount === 1 ? '' : 's'}. Reassign them before deleting it.` });
  await db.prepare('DELETE FROM categories WHERE id = ?').run(category.id);
  res.json({ ok: true });
}));

router.delete('/users/:id', asyncHandler(async (req, res) => {
  const target = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found.' });
  if (target.id === req.user.id) return res.status(400).json({ error: 'You cannot delete your own account.' });
  if (target.role === 'developer') return res.status(403).json({ error: 'The Developer account cannot be deleted.' });

  const images = await db.prepare('SELECT image FROM products WHERE seller_id = ?').all(target.id);
  await db.prepare('DELETE FROM users WHERE id = ?').run(target.id);
  await Promise.all(images.map(({ image }) => deleteProductImage(image).catch((error) => {
    console.warn('[image cleanup failed]', error.message);
  })));
  res.json({ ok: true });
}));

module.exports = router;