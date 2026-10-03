const db = require('../db');
const asyncHandler = require('../utils/asyncHandler');

module.exports = function rateLimit(maxRequests, windowMs) {
  return asyncHandler(async (req, res, next) => {
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    const windowStartedAt = Math.floor(Date.now() / windowMs) * windowMs;
    const result = await db.prepare(`
      INSERT INTO auth_rate_limits (client_ip, window_started_at, request_count)
      VALUES (?, ?, 1)
      ON CONFLICT (client_ip) DO UPDATE SET
        window_started_at = EXCLUDED.window_started_at,
        request_count = CASE
          WHEN auth_rate_limits.window_started_at = EXCLUDED.window_started_at
          THEN auth_rate_limits.request_count + 1
          ELSE 1
        END,
        updated_at = CURRENT_TIMESTAMP
      RETURNING request_count
    `).get(clientIp, windowStartedAt);

    if (result.request_count > maxRequests) {
      return res.status(429).json({ error: 'Too many attempts. Please wait a few minutes and try again.' });
    }
    next();
  });
};