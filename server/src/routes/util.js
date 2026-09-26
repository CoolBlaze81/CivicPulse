import multer from 'multer';
import { HttpError } from '../services/incidents.js';
import { deletePhoto, storePhoto } from '../services/storage.js';

// One image, max 8 MB (4 MB on Vercel, whose request limit is 4.5 MB),
// kept in memory until the request is valid enough to store it.
const MAX_MB = Number(process.env.MAX_PHOTO_MB || (process.env.VERCEL ? 4 : 8));
export const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_MB * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|png|webp|gif|heic|heif)$/.test(file.mimetype)) cb(null, true);
    else cb(new HttpError(422, 'Photos must be JPEG, PNG, WebP or HEIC images.'));
  },
}).single('photo');
export const MAX_PHOTO_MB = MAX_MB;

export const savePhoto = (req) => (req.file ? storePhoto(req.file) : Promise.resolve(null));
export const discardPhoto = deletePhoto;

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
  if (!Number.isInteger(n) || n <= 0 || n > 2147483647) throw new HttpError(404, "We can't find that.", 'NOT_FOUND');
  return n;
};
