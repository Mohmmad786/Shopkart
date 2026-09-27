function apiNotFound(req, res) { res.status(404).json({ error: 'API endpoint not found.' }); }

function errorHandler(err, req, res, next) {
  console.error('[server error]', err);
  res.status(500).json({ error: 'Something went wrong on our side. Please try again later.' });
}

module.exports = { apiNotFound, errorHandler };