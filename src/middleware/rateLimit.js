module.exports = function rateLimit(maxRequests, windowMs) {
  const hits = new Map();
  setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [k, v] of hits) if (v.first < cutoff) hits.delete(k);
  }, windowMs).unref();

  return (req, res, next) => {
    const now = Date.now();
    let entry = hits.get(req.ip);
    if (!entry || now - entry.first > windowMs) entry = { first: now, count: 0 };
    entry.count += 1;
    hits.set(req.ip, entry);
    if (entry.count > maxRequests) {
      return res.status(429).json({ error: 'Too many attempts. Please wait a few minutes and try again.' });
    }
    next();
  };
};