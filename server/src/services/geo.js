// Small geo helpers. The demo covers North Delhi; wards are a simple 4 x 3
// grid laid over the map around CITY_CENTER (GTB Nagar / Model Town), from
// Jahangirpuri in the north-west to Civil Lines in the south-east.
export const CITY_CENTER = { lat: 28.7, lng: 77.19 };

const EARTH_RADIUS_M = 6371000;
const toRad = (d) => (d * Math.PI) / 180;

export function distanceMeters(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

// Rough bounding box so SQL can pre-filter before the exact distance check.
export function boundingBox({ lat, lng }, radiusM) {
  const dLat = radiusM / 111320;
  const dLng = radiusM / (111320 * Math.cos(toRad(lat)));
  return { minLat: lat - dLat, maxLat: lat + dLat, minLng: lng - dLng, maxLng: lng + dLng };
}

// Wards 1-12 on a 4 x 3 grid of ~2.2 km cells centred on the city centre.
const CELL_DEG = 0.02;
export function wardFor({ lat, lng }) {
  const col = Math.min(3, Math.max(0, Math.floor((lng - CITY_CENTER.lng) / CELL_DEG + 2)));
  const row = Math.min(2, Math.max(0, Math.floor((CITY_CENTER.lat - lat) / CELL_DEG + 1.5)));
  return row * 4 + col + 1;
}

export function wardCenter(ward) {
  const idx = ward - 1;
  const row = Math.floor(idx / 4);
  const col = idx % 4;
  return {
    lat: CITY_CENTER.lat - (row - 1.5 + 0.5) * CELL_DEG,
    lng: CITY_CENTER.lng + (col - 2 + 0.5) * CELL_DEG,
  };
}

export function isValidCoord(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}
