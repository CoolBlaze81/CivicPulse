// Photo storage. On Vercel (BLOB_READ_WRITE_TOKEN set) photos go to Vercel
// Blob and the stored URL is the public blob URL. Locally they are written
// to server/uploads and served from /uploads.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { UPLOAD_DIR } from '../db.js';

const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'image/heic': '.heic', 'image/heif': '.heif' };
const useBlob = () => !!process.env.BLOB_READ_WRITE_TOKEN;

export async function storePhoto({ buffer, mimetype }) {
  const name = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${EXT[mimetype] || '.jpg'}`;
  if (useBlob()) {
    const { put } = await import('@vercel/blob');
    const blob = await put(`photos/${name}`, buffer, { access: 'public', contentType: mimetype, addRandomSuffix: false });
    return blob.url;
  }
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  await fs.writeFile(path.join(UPLOAD_DIR, name), buffer);
  return `/uploads/${name}`;
}

export async function deletePhoto(url) {
  if (!url) return;
  try {
    if (/^https:\/\//.test(url)) {
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
