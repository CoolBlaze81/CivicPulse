// Reverse geocoding: GPS point -> short street address, so citizens don't
// have to type one. Uses OpenStreetMap's Nominatim (the map already uses
// OSM tiles). Its usage policy asks for an identifying User-Agent, at most
// one request a second, and caching, which is what this does. Any failure
// returns null and the citizen can still type a landmark.
const URL_BASE = process.env.GEOCODER_URL || 'https://nominatim.openstreetmap.org/reverse';
const USER_AGENT = process.env.GEOCODER_USER_AGENT || 'CivicPulse/1.0 (student project; MetroServe demo)';
const cache = new Map();
let nextSlot = 0;

export function shortAddress(result) {
  const a = result?.address || {};
  const street = a.road || a.pedestrian || a.footway || a.path || a.residential;
  const area = a.neighbourhood || a.suburb || a.quarter || a.city_district || a.village || a.town;
  const parts = [];
  if (street) parts.push(a.house_number ? `${a.house_number} ${street}` : street);
  if (area && area !== street) parts.push(area);
  if (parts.length) return parts.join(', ');
  const fallback = String(result?.display_name || '').split(',').slice(0, 2).map((s) => s.trim()).filter(Boolean).join(', ');
  return fallback || null;
}

export async function reverseGeocode(lat, lng) {
  if (process.env.GEOCODE === '0') return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`; // ~11 m
  if (cache.has(key)) return cache.get(key);

  // One request a second across the whole server.
  const wait = Math.max(0, nextSlot - Date.now());
  nextSlot = Math.max(Date.now(), nextSlot) + 1000;
  if (wait) await new Promise((r) => setTimeout(r, wait));

  try {
    const url = `${URL_BASE}?format=jsonv2&addressdetails=1&zoom=18&lat=${lat}&lon=${lng}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en' },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const address = shortAddress(await res.json());
    if (cache.size > 5000) cache.clear();
    cache.set(key, address);
    return address;
  } catch {
    return null;
  }
}
