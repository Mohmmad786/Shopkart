const MOBILE_RE = /^[6-9]\d{9}$/;                 // 10-digit Indian mobile
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TITLE_MAX = 120;
const DESC_MAX = 2000;
const NAME_MAX = 80;
const MAX_PRICE = 1e9;

function isValidMobile(m) { return typeof m === 'string' && MOBILE_RE.test(m.trim()); }
function isValidEmail(e) { return typeof e === 'string' && EMAIL_RE.test(e.trim()); }
function isValidPasskey(p) { return typeof p === 'string' && p.length >= 8 && p.length <= 72; }
function isValidPrice(p) {
  const n = Number(p);
  return Number.isFinite(n) && n > 0 && n <= MAX_PRICE;
}
function clean(s) { return typeof s === 'string' ? s.trim() : ''; }

module.exports = { isValidMobile, isValidEmail, isValidPasskey, isValidPrice, clean, TITLE_MAX, DESC_MAX, NAME_MAX };