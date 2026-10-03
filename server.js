require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const cookieParser = require('cookie-parser');
const { initializeDatabase } = require('./src/db');

const authRoutes = require('./src/routes/auth');
const productRoutes = require('./src/routes/products');
const adminRoutes = require('./src/routes/admin');
const rateLimit = require('./src/middleware/rateLimit');
const { apiNotFound, errorHandler } = require('./src/middleware/errors');

const app = express();
const PORT = process.env.PORT || 3000;
app.set('trust proxy', process.env.VERCEL ? 1 : false);

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

app.use('/api', (req, res, next) => {
  initializeDatabase().then(() => next()).catch(next);
});

const defaultUploadDir = process.env.VERCEL ? '/tmp/shopkart-uploads' : './uploads';
const uploadDir = path.resolve(process.env.UPLOAD_DIR || defaultUploadDir);
fs.mkdirSync(uploadDir, { recursive: true });
app.use('/uploads', express.static(uploadDir, { maxAge: '7d' }));

app.use('/api/auth', rateLimit(40, 10 * 60 * 1000)); // brute-force protection

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', apiNotFound);

const publicDir = path.join(__dirname, 'public');
if (!process.env.VERCEL) app.use(express.static(publicDir));
app.get('*', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));

app.use(errorHandler);
if (require.main === module && process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => console.log(`ShopKart running at http://localhost:${PORT}`));
}

module.exports = app;