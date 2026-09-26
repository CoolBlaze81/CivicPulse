import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Circle, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// OpenStreetMap tiles (SRS TBD-02: provider chosen as OSM + Leaflet).
const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; OpenStreetMap contributors';

const iconCache = new Map();
function countIcon(label, variant = '') {
  const key = `${label}|${variant}`;
  if (!iconCache.has(key)) {
    iconCache.set(key, L.divIcon({
      className: '',
      html: `<div class="pin-count ${variant}">${label}</div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 15],
    }));
  }
  return iconCache.get(key);
}
const dotIcon = L.divIcon({ className: '', html: '<div class="pin-dot"></div>', iconSize: [22, 22], iconAnchor: [11, 11] });

function Recenter({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.setView([center.lat, center.lng], zoom ?? map.getZoom(), { animate: false });
  }, [center?.lat, center?.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function Picker({ onPick }) {
  useMapEvents({ click: (e) => onPick({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

export default function MapView({
  center, zoom = 16, markers = [], dot, radius, onPick, interactive = true, style, className = '',
}) {
  if (!center) return <div className={`photo ${className}`} style={style} />;
  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={zoom}
      className={className}
      style={{ width: '100%', height: '100%', ...style }}
      zoomControl={interactive}
      dragging={interactive}
      scrollWheelZoom={interactive}
      doubleClickZoom={interactive}
      touchZoom={interactive}
      attributionControl={interactive}
    >
      <TileLayer url={TILES} attribution={ATTRIBUTION} referrerPolicy="strict-origin-when-cross-origin" />
      <Recenter center={center} zoom={zoom} />
      {radius && <Circle center={[center.lat, center.lng]} radius={radius} pathOptions={{ color: '#1B2559', weight: 1, fillOpacity: 0.04 }} />}
      {dot && <Marker position={[dot.lat, dot.lng]} icon={dotIcon} />}
      {markers.map((m) => (
        <Marker
          key={m.id}
          position={[m.lat, m.lng]}
          icon={countIcon(m.label, m.variant)}
          eventHandlers={m.onClick ? { click: m.onClick } : undefined}
        />
      ))}
      {onPick && <Picker onPick={onPick} />}
    </MapContainer>
  );
}
