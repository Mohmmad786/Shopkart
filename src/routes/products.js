const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const db = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');
const { isValidPrice, clean, TITLE_MAX, DESC_MAX } = require('../utils/validators');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();
const defaultUploadDir = process.env.VERCEL ? '/tmp/shopkart-uploads' : './uploads';
const uploadDir = path.resolve(process.env.UPLOAD_DIR || defaultUploadDir);

// ---------- Image upload config ----------
const ALLOWED_MIME = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, crypto.randomUUID() + (ALLOWED_MIME[file.mimetype] || '.bin'))
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME[file.mimetype]) return cb(null, true);
    cb(new Error('Only JPG, JPEG, PNG or WebP images are allowed.'));
  }
});

const diskPath = (publicPath) => path.join(uploadDir, path.basename(publicPath || ''));
const unlinkQuiet = (publicPath) => {
  if (!publicPath) return;
  fs.unlink(diskPath(publicPath), () => {});
};

function uploadSingle(req, res, next) {
  upload.single('image')(req, res, (err) => {
    if (!err) return next();
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'Image must be 4 MB or smaller.' : (err.message || 'Invalid image upload.');
    res.status(400).json({ error: message });
  });
}

async function validateProductBody(body) {
  const errors = [];
  const title = clean(body.title);
  const description = clean(body.description);
  const categoryId = Number(body.category_id);

  if (!title) errors.push('Title is required.');
  else if (title.length > TITLE_MAX) errors.push(`Title must be ${TITLE_MAX} characters or fewer.`);

  if (!description) errors.push('Description is required.');
  else if (description.length > DESC_MAX) errors.push(`Description must be ${DESC_MAX} characters or fewer.`);

  if (body.price === undefined || clean(String(body.price)) === '') errors.push('Price is required.');
  else if (!isValidPrice(body.price)) errors.push('Price must be a valid positive number.');

  if (!Number.isInteger(categoryId) || categoryId < 1 || !await db.prepare('SELECT id FROM categories WHERE id = ?').get(categoryId)) {
    errors.push('A valid product category is required.');
  }

  return { errors, title, description, price: Number(body.price), categoryId };
}

const CARD_SQL = `
  SELECT p.id, p.title, p.image, p.price, p.description, p.category_id, c.name AS category_name, p.created_at,
         u.id AS seller_id, u.name AS seller_name
  FROM products p JOIN users u ON u.id = p.seller_id
  LEFT JOIN categories c ON c.id = p.category_id`;

const DETAIL_SQL = `
  SELECT p.*, c.name AS category_name, u.name AS seller_name, u.mobile AS seller_mobile, u.email AS seller_email
  FROM products p JOIN users u ON u.id = p.seller_id
  LEFT JOIN categories c ON c.id = p.category_id`;

router.get('/categories', asyncHandler(async (req, res) => {
  res.json({ categories: await db.prepare('SELECT id, name FROM categories ORDER BY LOWER(name)').all() });
}));

// Public: list + search (all roles)
router.get('/', asyncHandler(async (req, res) => {
  const search = clean(req.query.search || '');
  const params = [];
  let sql = CARD_SQL;
  if (search) {
    sql += ' WHERE p.title ILIKE ? OR p.description ILIKE ? OR c.name ILIKE ?';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  sql += ' ORDER BY p.created_at DESC';
  res.json({ products: await db.prepare(sql).all(...params) });
}));

// Own products (seller) / all products (developer)
router.get('/mine', authenticate, asyncHandler(async (req, res) => {
  let sql = DETAIL_SQL;
  const params = [];
  if (req.user.role === 'seller') {
    sql += ' WHERE p.seller_id = ?';
    params.push(req.user.id);
  }
  sql += ' ORDER BY p.created_at DESC';
  res.json({ products: await db.prepare(sql).all(...params) });
}));

// Public: single product with seller contact
router.get('/:id', asyncHandler(async (req, res) => {
  const product = await db.prepare(DETAIL_SQL + ' WHERE p.id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found.' });
  res.json({ product });
}));

// Create (seller / developer)
router.post('/', authenticate, requireRole('seller', 'developer'), uploadSingle, asyncHandler(async (req, res) => {
  const removeUploaded = () => { if (req.file) fs.unlink(req.file.path, () => {}); };
  if (!req.file) return res.status(400).json({ error: 'Product image is required.' });

  const { errors, title, description, price, categoryId } = await validateProductBody(req.body);
  if (errors.length) { removeUploaded(); return res.status(400).json({ error: errors.join(' ') }); }

  try {
    const info = await db.prepare(
      'INSERT INTO products (seller_id, category_id, title, image, price, description) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(req.user.id, categoryId, title, '/uploads/' + req.file.filename, price, description);

    res.status(201).json({ product: await db.prepare('SELECT * FROM products WHERE id = ?').get(info.lastInsertRowid) });
  } catch (error) { removeUploaded(); throw error; }
}));

// Update (owner seller or developer; image optional)
router.put('/:id', authenticate, requireRole('seller', 'developer'), uploadSingle, asyncHandler(async (req, res) => {
  const removeUploaded = () => { if (req.file) fs.unlink(req.file.path, () => {}); };
  try {
    const product = await db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!product) { removeUploaded(); return res.status(404).json({ error: 'Product not found.' }); }

    if (req.user.role !== 'developer' && product.seller_id !== req.user.id) {
      removeUploaded();
      return res.status(403).json({ error: 'You can only edit your own products.' });
    }

    const { errors, title, description, price, categoryId } = await validateProductBody(req.body);
    if (errors.length) { removeUploaded(); return res.status(400).json({ error: errors.join(' ') }); }

    const newImage = req.file ? '/uploads/' + req.file.filename : product.image;
    await db.prepare(
      'UPDATE products SET category_id = ?, title = ?, price = ?, description = ?, image = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(categoryId, title, price, description, newImage, product.id);

    if (req.file) unlinkQuiet(product.image);

    res.json({ product: await db.prepare('SELECT * FROM products WHERE id = ?').get(product.id) });
  } catch (error) { removeUploaded(); throw error; }
}));

// Delete (owner seller or developer)
router.delete('/:id', authenticate, requireRole('seller', 'developer'), asyncHandler(async (req, res) => {
  const product = await db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found.' });

  if (req.user.role !== 'developer' && product.seller_id !== req.user.id) {
    return res.status(403).json({ error: 'You can only delete your own products.' });
  }

  await db.prepare('DELETE FROM products WHERE id = ?').run(product.id);
  unlinkQuiet(product.image);
  res.json({ ok: true });
}));

module.exports = router;