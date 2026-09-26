import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { UPLOAD_DIR } from '../db.js';
import { HttpError } from '../services/incidents.js';

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase().replace(/[^.a-z0-9]/g, '') || '.jpg';
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
  },
});

// One image, max 8 MB.
export const photoUpload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|png|webp|gif|heic|heif)$/.test(file.mimetype)) cb(null, true);
    else cb(new HttpError(422, 'Photos must be JPEG, PNG, WebP or HEIC images.'));
  },
}).single('photo');

export const photoUrlOf = (req) => (req.file ? `/uploads/${req.file.filename}` : null);

// Wraps a handler so thrown errors reach the error middleware.
export const h = (fn) => (req, res, next) => {
  try {
    const out = fn(req, res, next);
    if (out && typeof out.then === 'function') out.catch(next);
  } catch (e) {
    next(e);
  }
};

export const intParam = (v) => {
  const n = Number(String(v).replace(/^(INC|RPT)-/i, ''));
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(404, "We can't find that.", 'NOT_FOUND');
  return n;
};
