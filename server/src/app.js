import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import helmet from 'helmet';
import { getDb, UPLOAD_DIR } from './db.js';
import { readPhoto, storageMode } from './services/storage.js';
import authRoutes from './routes/auth.js';
import citizenRoutes from './routes/citizen.js';
import staffRoutes from './routes/staff.js';
import operationsRoutes from './routes/operations.js';
import { MAX_PHOTO_MB } from './routes/util.js';
import { rateLimit } from './rateLimit.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = path.join(here, '..', '..', 'client', 'dist');

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  // Behind Vercel's (or another) proxy, req.ip comes from X-Forwarded-For.
  if (process.env.VERCEL || process.env.TRUST_PROXY) app.set('trust proxy', 1);
  app.use(helmet({
    // OpenStreetMap refuses tile requests that carry no referrer.
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https://tile.openstreetmap.org', 'https://*.tile.openstreetmap.org', 'https://*.public.blob.vercel-storage.com'],
        connectSrc: ["'self'"],
        workerSrc: ["'self'"],
        manifestSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: null,
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-site' },
  }));
  app.use(express.json({ limit: '1mb' }));

  // Every response carries a request id; server errors log it so a
  // reference shown to a user can be found in the logs.
  app.use((req, res, next) => {
    req.id = crypto.randomBytes(4).toString('hex').replace(/(.{4})/, '$1-');
    res.set('X-Request-Id', req.id);
    next();
  });

  // Sign-in endpoints get tight limits; everything else a generous one.
  const MIN = 60000;
  app.use('/api/auth/otp', rateLimit({ windowMs: 15 * MIN, max: 10, message: 'Too many code requests from this device. Try again in a few minutes.' }));
  app.use('/api/auth/otp/verify', rateLimit({ windowMs: 15 * MIN, max: 20, message: 'Too many attempts. Try again in a few minutes.' }));
  app.use('/api/auth/staff', rateLimit({ windowMs: 15 * MIN, max: 20, message: 'Too many sign-in attempts from this device. Try again in a few minutes.' }));
  app.use('/api', rateLimit({ windowMs: MIN, max: 600 }));

  // Health check: is the database reachable, and where do photos go.
  app.get('/api/health', async (req, res) => {
    const started = Date.now();
    try {
      await getDb().prepare('SELECT 1 AS ok').get();
      res.set('Cache-Control', 'no-store').json({ ok: true, database: 'up', db_ms: Date.now() - started, photos: storageMode(), time: new Date().toISOString() });
    } catch (e) {
      console.error('health check failed', e.message);
      res.status(503).json({ ok: false, database: 'down', photos: storageMode() });
    }
  });

  // Photos kept in the database. The id is random and unguessable.
  app.get('/api/photos/:id', async (req, res, next) => {
    try {
      const photo = await readPhoto(req.params.id);
      if (!photo) return res.status(404).json({ error: "We can't find that photo.", code: 'NOT_FOUND' });
      res.set({ 'Content-Type': photo.mime, 'Cache-Control': 'public, max-age=31536000, immutable', 'Content-Length': photo.data.length });
      res.end(photo.data);
    } catch (e) {
      next(e);
    }
  });
  app.use('/api', authRoutes, citizenRoutes, staffRoutes, operationsRoutes);
  app.use('/api', (req, res) => res.status(404).json({ error: "We can't find that.", code: 'NOT_FOUND' }));

  app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d', fallthrough: false }));

  // In production the built React app is served from the same origin.
  if (fs.existsSync(CLIENT_DIST)) {
    app.use(express.static(CLIENT_DIST));
    app.get('*', (req, res) => res.sendFile(path.join(CLIENT_DIST, 'index.html')));
  }

  // Errors: known HttpErrors keep their status and message; anything else
  // is a 500 with a short reference the user can quote (design p.36).
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? `That photo is too big. Photos can be up to ${MAX_PHOTO_MB} MB.` : 'That upload did not work.';
      return res.status(422).json({ error: msg });
    }
    if (err.status && err.status < 500) {
      return res.status(err.status).json({ error: err.message, code: err.code, problems: err.problems });
    }
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'The request was not valid JSON.' });
    const ref = req.id || crypto.randomBytes(4).toString('hex').replace(/(.{4})/, '$1-');
    console.error(`[${ref}] ${req.method} ${req.originalUrl}`, err);
    res.status(500).json({ error: 'Something broke on our side. Your last action was not saved.', code: 'SERVER_ERROR', reference: ref });
  });
  return app;
}
