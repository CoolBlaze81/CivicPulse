import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

// Loads an API path; reload() re-fetches. Stale responses are ignored.
export function useApi(path, { interval } = {}) {
  const [data, setData] = useState(null);
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
      }
    } catch (e) {
      if (mine === seq.current) setError(e);
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    setLoading(true);
    reload();
    if (!interval) return undefined;
    const t = setInterval(reload, interval);
    return () => clearInterval(t);
  }, [reload, interval]);

  return { data, error, loading, reload, setData };
}

// The demo city is fictional (MetroServe, centred on these coordinates). If
// the device is far away or location is off, the demo location is used.
export const CITY = { lat: 18.5204, lng: 73.8567 };
export const DEMO_HOME = { lat: 18.5104, lng: 73.8667 }; // Sector 14, Ward 11

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
