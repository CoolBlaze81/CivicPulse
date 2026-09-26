// Offline "send later" queue (design p.16). Reports written without a
// connection are kept in IndexedDB on the phone, photo included, and sent
// when the connection comes back. Each report keeps the time it was written.
import { api, formOf } from '../api.js';

const DB_NAME = 'civicpulse';
const STORE = 'outbox';
const CHANGED = 'civicpulse:outbox';

function open() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('no IndexedDB'));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(out?.result);
    t.onerror = () => reject(t.error);
  });
}

const changed = () => window.dispatchEvent(new Event(CHANGED));

export const outboxAvailable = () => 'indexedDB' in window;

export async function queueReport(userId, fields, photo) {
  await run('readwrite', (s) => s.add({ user_id: userId, fields, photo, captured_at: new Date().toISOString(), error: null }));
  changed();
}

export async function listQueued(userId) {
  try {
    const all = await run('readonly', (s) => s.getAll());
    return all.filter((x) => x.user_id === userId);
  } catch {
    return [];
  }
}

export async function discardQueued(id) {
  await run('readwrite', (s) => s.delete(id));
  changed();
}

let sending = null;

// Sends queued reports oldest first. Stops at the first network failure;
// a report the server rejects keeps its error so the citizen can fix or
// discard it. Returns how many were sent.
export function sendQueued(userId) {
  if (sending) return sending;
  sending = (async () => {
    let sent = 0;
    for (const item of await listQueued(userId)) {
      if (item.error) continue;
      try {
        await api('/reports', { method: 'POST', form: formOf({ ...item.fields, captured_at: item.captured_at }, item.photo) });
        await run('readwrite', (s) => s.delete(item.id));
        sent += 1;
      } catch (e) {
        if (e.code === 'OFFLINE' || e.status === 0 || e.status >= 500 || e.status === 429) break;
        if (e.status === 401) break; // signed out; try again after sign-in
        await run('readwrite', (s) => s.put({ ...item, error: e.problems?.map((p) => p.message).join(' ') || e.message }));
      }
    }
    changed();
    return sent;
  })().finally(() => {
    sending = null;
  });
  return sending;
}

export function onOutboxChange(fn) {
  window.addEventListener(CHANGED, fn);
  return () => window.removeEventListener(CHANGED, fn);
}
