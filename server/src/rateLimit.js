// Small in-memory rate limiter (fixed window). Enough for one server or a
// handful of serverless instances; each instance counts on its own.
export function rateLimit({ windowMs, max, key = (req) => req.ip, message = 'Too many requests. Wait a moment and try again.' }) {
  const hits = new Map();
  return (req, res, next) => {
    if (process.env.RATE_LIMIT === '0') return next();
    const now = Date.now();
    const k = key(req);
    let entry = hits.get(k);
    if (!entry || entry.reset <= now) {
      entry = { n: 0, reset: now + windowMs };
      hits.set(k, entry);
    }
    entry.n += 1;
    if (hits.size > 20000) {
      for (const [hk, e] of hits) if (e.reset <= now) hits.delete(hk);
    }
    if (entry.n > max) {
      res.set('Retry-After', String(Math.ceil((entry.reset - now) / 1000)));
      return res.status(429).json({ error: message, code: 'RATE_LIMITED' });
    }
    next();
  };
}
