import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import { UPLOAD_DIR } from './db.js';
import authRoutes from './routes/auth.js';
import citizenRoutes from './routes/citizen.js';
import staffRoutes from './routes/staff.js';
import operationsRoutes from './routes/operations.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = path.join(here, '..', '..', 'client', 'dist');

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (req, res) => res.json({ ok: true }));
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
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'That photo is too big. Photos can be up to 8 MB.' : 'That upload did not work.';
      return res.status(422).json({ error: msg });
    }
    if (err.status && err.status < 500) {
      return res.status(err.status).json({ error: err.message, code: err.code, problems: err.problems });
    }
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'The request was not valid JSON.' });
    const ref = crypto.randomBytes(4).toString('hex').replace(/(.{4})/, '$1-');
    console.error(`[${ref}]`, err);
    res.status(500).json({ error: 'Something broke on our side. Your last action was not saved.', code: 'SERVER_ERROR', reference: ref });
  });
  return app;
}
