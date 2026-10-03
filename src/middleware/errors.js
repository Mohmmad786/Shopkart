function apiNotFound(req, res) { res.status(404).json({ error: 'API endpoint not found.' }); }

function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  console.error('[server error]', err);

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Request body contains invalid JSON.' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body is too large.' });
  }
  if (err.code === '22P02' || err.code === '23514') {
    return res.status(400).json({ error: 'One or more values are invalid.' });
  }
  if (err.code === '23505') {
    return res.status(409).json({ error: 'A record with these details already exists.' });
  }
  if (err.code === '23503') {
    return res.status(409).json({ error: 'This record is still in use.' });
  }

  res.status(500).json({ error: 'Something went wrong on our side. Please try again later.' });
}

module.exports = { apiNotFound, errorHandler };