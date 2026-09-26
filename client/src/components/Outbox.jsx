// Queued reports: a banner with what is waiting, plus the background sender
// that runs while a citizen has the app open.
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth.jsx';
import { discardQueued, listQueued, onOutboxChange, sendQueued } from '../lib/outbox.js';

export function useOutbox() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const load = useCallback(async () => {
    if (user) setItems(await listQueued(user.user_id));
  }, [user]);
  useEffect(() => {
    load();
    return onOutboxChange(load);
  }, [load]);
  return { items, send: () => user && sendQueued(user.user_id), discard: discardQueued };
}

// Mounted once in the citizen layout.
export function OutboxSender() {
  const { user, refresh } = useAuth();
  useEffect(() => {
    if (!user) return undefined;
    const trySend = async () => {
      if (navigator.onLine === false) return;
      if ((await sendQueued(user.user_id)) > 0) refresh();
    };
    trySend();
    window.addEventListener('online', trySend);
    const t = setInterval(trySend, 30000);
    return () => {
      window.removeEventListener('online', trySend);
      clearInterval(t);
    };
  }, [user, refresh]);
  return null;
}

export function OutboxBanner() {
  const { items, send, discard } = useOutbox();
  const [busy, setBusy] = useState(false);
  if (!items.length) return null;
  const waiting = items.filter((i) => !i.error);
  const failed = items.filter((i) => i.error);
  return (
    <div className="stack tight">
      {waiting.length > 0 && (
        <div className="banner info row between" role="status">
          <span>
            <b>{waiting.length} report{waiting.length > 1 ? 's' : ''} waiting to send.</b> {navigator.onLine === false ? "They'll go automatically when you're back online." : 'Sending…'}
          </span>
          <button type="button" className="link-btn" disabled={busy}
            onClick={async () => { setBusy(true); await send(); setBusy(false); }}>Send now</button>
        </div>
      )}
      {failed.map((i) => (
        <div key={i.id} className="banner error stack tight">
          <span><b>Couldn’t send “{String(i.fields.description).slice(0, 60)}”.</b> {i.error}</span>
          <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => discard(i.id)}>Discard it</button>
        </div>
      ))}
    </div>
  );
}
