import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

const cacheGet = (key) => { try { return JSON.parse(localStorage.getItem(`civicpulse.cache.${key}`)); } catch { return null; } };
const cachePut = (key, d) => { try { localStorage.setItem(`civicpulse.cache.${key}`, JSON.stringify(d)); } catch { /* ignore */ } };

// Loads an API path; reload() re-fetches. Stale responses are ignored.
// With `offline: true` the last good response is kept on the device and shown
// when there is no connection.
export function useApi(path, { interval, offline } = {}) {
  const [data, setData] = useState(() => (offline && path ? cacheGet(path) : null));
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);

  const reload = useCallback(async () => {
    if (!path) return;
    const mine = ++seq.current;
    try {
      const d = await api(path);
      if (mine === seq.current) {
        setData(d);
        setError(null);
        if (offline) cachePut(path, d);
      }
    } catch (e) {
      if (mine === seq.current) setError(e);
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [path, offline]);

  useEffect(() => {
    setLoading(true);
    reload();
    if (!interval) return undefined;
    const t = setInterval(reload, interval);
    return () => clearInterval(t);
  }, [reload, interval]);

  return { data, error, loading, reload, setData };
}

// The demo covers North Delhi (centred on these coordinates). If the device
// is far away or location is off, the demo location is used.
export const CITY = { lat: 28.7, lng: 77.19 };
export const DEMO_HOME = { lat: 28.68, lng: 77.2 }; // Kamla Nagar, Ward 11
export const DEMO_AREA = 'Kamla Nagar, North Delhi';

function far(a, b) {
  return Math.abs(a.lat - b.lat) > 0.3 || Math.abs(a.lng - b.lng) > 0.3;
}

export function getLocation({ timeout = 8000 } = {}) {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve({ ...DEMO_HOME, source: 'demo', reason: 'unsupported' });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy) };
        if (far(p, CITY)) resolve({ ...DEMO_HOME, source: 'demo', reason: 'outside' });
        else resolve({ ...p, source: 'gps' });
      },
      (err) => resolve({ ...DEMO_HOME, source: 'demo', reason: err.code === 1 ? 'denied' : 'unavailable' }),
      { enableHighAccuracy: true, timeout, maximumAge: 60000 }
    );
  });
}

export function useToast() {
  const [msg, setMsg] = useState(null);
  const t = useRef();
  const show = useCallback((m) => {
    setMsg(m);
    clearTimeout(t.current);
    t.current = setTimeout(() => setMsg(null), 3200);
  }, []);
  return [msg, show];
}

// True while the media query matches, e.g. useMedia('(max-width: 899px)').
export function useMedia(query) {
  const get = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false);
  const [match, setMatch] = useState(get);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setMatch(m.matches);
    on();
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, [query]);
  return match;
}
export const useNarrow = () => useMedia('(max-width: 1099px)');
