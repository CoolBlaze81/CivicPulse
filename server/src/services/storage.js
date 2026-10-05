// Photo storage.
//  - BLOB_READ_WRITE_TOKEN set (Vercel Blob): photos go to the Blob store and
//    the stored URL is the public blob URL. If the Blob upload fails (store
//    missing, private, out of quota) the photo falls back to the database, so
//    a report is never lost because of photo storage.
//  - Otherwise photos are kept in the database (photo table) and served from
//    /api/photos/<id>. This works on Vercel, whose file system is read-only.
// Photos written to server/uploads by older versions are still served.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { getDb, nowIso, UPLOAD_DIR } from '../db.js';
import { HttpError } from './incidents.js';

const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'image/heic': '.heic', 'image/heif': '.heif' };
const useBlob = () => !!process.env.BLOB_READ_WRITE_TOKEN;
export const PHOTO_PATH = '/api/photos/';

// The browser-supplied type can't be trusted, so the first bytes of the file
// decide what it really is. Anything that isn't a known image is refused.
export function sniffImage(buffer) {
  const b = buffer || Buffer.alloc(0);
  const ascii = (from, to) => b.subarray(from, to).toString('latin1');
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && ascii(1, 4) === 'PNG') return 'image/png';
  if (ascii(0, 4) === 'GIF8') return 'image/gif';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  if (ascii(4, 8) === 'ftyp' && /^(heic|heix|hevc|hevx|mif1|msf1|heim|heis)$/.test(ascii(8, 12))) return 'image/heic';
  return null;
}

export function storageMode() {
  return useBlob() ? 'vercel-blob' : 'database';
}

async function storeInDb(buffer, mime) {
  const id = crypto.randomBytes(16).toString('hex');
  await getDb()
    .prepare('INSERT INTO photo (photo_id, mime, size, data, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, mime, buffer.length, buffer, nowIso());
  return `${PHOTO_PATH}${id}`;
}

export async function storePhoto({ buffer }) {
  const mime = sniffImage(buffer);
  if (!mime) throw new HttpError(422, 'That file is not a photo we can use. Use a JPEG, PNG, WebP or HEIC image.');
  if (useBlob()) {
    try {
      const { put } = await import('@vercel/blob');
      const name = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${EXT[mime] || '.jpg'}`;
      const blob = await put(`photos/${name}`, buffer, { access: 'public', contentType: mime, addRandomSuffix: false });
      return blob.url;
    } catch (e) {
      console.error('Vercel Blob upload failed, keeping the photo in the database instead:', e.message);
    }
  }
  return storeInDb(buffer, mime);
}

export async function readPhoto(id) {
  if (!/^[a-f0-9]{32}$/.test(String(id))) return null;
  const row = await getDb().prepare('SELECT mime, data FROM photo WHERE photo_id = ?').get(id);
  return row ? { mime: row.mime, data: Buffer.from(row.data) } : null;
}

export async function deletePhoto(url) {
  if (!url) return;
  try {
    if (url.startsWith(PHOTO_PATH)) {
      await getDb().prepare('DELETE FROM photo WHERE photo_id = ?').run(url.slice(PHOTO_PATH.length));
    } else if (/^https:\/\//.test(url)) {
      if (useBlob()) {
        const { del } = await import('@vercel/blob');
        await del(url);
      }
    } else if (url.startsWith('/uploads/')) {
      await fs.unlink(path.join(UPLOAD_DIR, path.basename(url)));
    }
  } catch {
    /* best effort: an orphaned photo is harmless */
  }
}
