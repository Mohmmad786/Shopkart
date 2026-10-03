const fs = require('fs').promises;
const path = require('path');

const uploadDir = path.resolve(process.env.UPLOAD_DIR || (process.env.VERCEL ? '/tmp/shopkart-uploads' : './uploads'));

async function removeTemporaryUpload(file) {
  if (!file?.path) return;
  await fs.unlink(file.path).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
  });
}

async function saveProductImage(file) {
  if (!process.env.VERCEL) return `/uploads/${file.filename}`;

  try {
    const hasOidcCredentials = process.env.VERCEL_OIDC_TOKEN && process.env.BLOB_STORE_ID;
    if (!hasOidcCredentials && !process.env.BLOB_READ_WRITE_TOKEN) {
      throw new Error('Connect a Vercel Blob store to this project before uploading product images.');
    }
    const { put } = require('@vercel/blob');
    const blob = await put(`products/${file.filename}`, await fs.readFile(file.path), {
      access: 'public',
      contentType: file.mimetype,
      addRandomSuffix: false
    });
    return blob.url;
  } finally {
    await removeTemporaryUpload(file);
  }
}

async function deleteProductImage(imageUrl) {
  if (!imageUrl) return;

  let url;
  try { url = new URL(imageUrl); } catch {}
  if (url?.protocol === 'https:' && url.hostname.endsWith('.blob.vercel-storage.com')) {
    const { del } = require('@vercel/blob');
    await del(url.href);
    return;
  }

  if (imageUrl.startsWith('/uploads/')) {
    const imagePath = path.join(uploadDir, path.basename(imageUrl));
    await fs.unlink(imagePath).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
}

module.exports = { saveProductImage, deleteProductImage, removeTemporaryUpload };
