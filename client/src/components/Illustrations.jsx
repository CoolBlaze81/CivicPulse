// Small inline illustrations in the CivicPulse palette (navy, pulse orange,
// violet, paper). Decorative only, so they are hidden from screen readers.
const NAVY = '#1B2559';
const PULSE = '#F0642E';
const VIOLET = '#5B3CC4';
const SOFT = '#E9EBF4';

function Svg({ w = 220, h = 150, children, className = '', viewBox }) {
  return (
    <svg className={`art ${className}`} width={w} height={h} viewBox={viewBox || `0 0 ${w} ${h}`} aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

// City skyline with a report pin: the home hero.
export function CityArt({ className }) {
  return (
    <Svg w={260} h={170} className={className}>
      <circle cx="200" cy="40" r="22" fill={PULSE} opacity="0.9" />
      <rect x="18" y="70" width="38" height="90" rx="4" fill="#2B377A" />
      <rect x="60" y="45" width="46" height="115" rx="4" fill="#33408A" />
      <rect x="110" y="85" width="34" height="75" rx="4" fill="#2B377A" />
      <rect x="148" y="60" width="44" height="100" rx="4" fill="#3A479A" />
      <rect x="196" y="95" width="46" height="65" rx="4" fill="#2B377A" />
      {[0, 1, 2, 3, 4, 5].map((r) => [0, 1].map((c) => (
        <rect key={`a${r}${c}`} x={68 + c * 18} y={56 + r * 16} width="10" height="8" rx="1.5" fill={r % 3 === c ? '#FFD9A8' : '#4A58AE'} />
      )))}
      {[0, 1, 2, 3].map((r) => [0, 1].map((c) => (
        <rect key={`b${r}${c}`} x={156 + c * 18} y={72 + r * 18} width="10" height="9" rx="1.5" fill={(r + c) % 3 === 0 ? '#FFD9A8' : '#4A58AE'} />
      )))}
      <rect x="0" y="158" width="260" height="12" fill="#121A45" />
      <path d="M0 164h260" stroke="#FFFFFF" strokeOpacity="0.25" strokeDasharray="10 8" strokeWidth="2" />
      <g transform="translate(118 18)">
        <path d="M20 58s-18-16-18-31a18 18 0 0136 0c0 15-18 31-18 31z" fill={PULSE} stroke="#fff" strokeWidth="3" />
        <path d="M9 27h6l3-6 4 11 3-7 2 2h4" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </Svg>
  );
}

// Bell with sparkles: nothing in Updates yet.
export function BellArt({ className }) {
  return (
    <Svg w={180} h={140} className={className}>
      <ellipse cx="90" cy="128" rx="58" ry="8" fill="#E3DFD5" />
      <circle cx="90" cy="66" r="52" fill={SOFT} />
      <path d="M62 92V70a28 28 0 0156 0v22l8 8H54z" fill={NAVY} />
      <path d="M80 104a10 10 0 0020 0" fill={PULSE} />
      <path d="M72 66a18 18 0 0118-18" stroke="#fff" strokeOpacity="0.35" strokeWidth="5" fill="none" strokeLinecap="round" />
      <circle cx="126" cy="36" r="13" fill={PULSE} />
      <path d="M121 36l4 4 6-8" stroke="#fff" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M36 40l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill={VIOLET} opacity="0.7" />
      <path d="M150 82l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill={VIOLET} opacity="0.5" />
    </Svg>
  );
}

// Clipboard with a photo and pin: no reports yet.
export function ReportsArt({ className }) {
  return (
    <Svg w={200} h={150} className={className}>
      <ellipse cx="100" cy="138" rx="66" ry="8" fill="#E3DFD5" />
      <rect x="52" y="18" width="96" height="116" rx="12" fill="#fff" stroke="#E3DFD5" strokeWidth="2" />
      <rect x="78" y="10" width="44" height="16" rx="6" fill={NAVY} />
      <rect x="66" y="38" width="68" height="40" rx="8" fill={SOFT} />
      <path d="M66 70l16-14 12 10 10-7 30 21" fill="none" stroke={NAVY} strokeOpacity="0.35" strokeWidth="3" strokeLinejoin="round" />
      <circle cx="118" cy="50" r="5" fill={PULSE} />
      <rect x="66" y="88" width="56" height="7" rx="3.5" fill="#E3DFD5" />
      <rect x="66" y="102" width="40" height="7" rx="3.5" fill="#E3DFD5" />
      <g transform="translate(130 76)">
        <path d="M16 46S1 33 1 21a15 15 0 0130 0c0 12-15 25-15 25z" fill={PULSE} stroke="#fff" strokeWidth="3" />
        <circle cx="16" cy="21" r="5.5" fill="#fff" />
      </g>
    </Svg>
  );
}

// Check with confetti: queue clear / all caught up.
export function AllClearArt({ className }) {
  return (
    <Svg w={170} h={130} className={className}>
      <circle cx="85" cy="62" r="44" fill="#DFF3E3" />
      <circle cx="85" cy="62" r="30" fill="#1F7A3A" />
      <path d="M72 62l9 9 18-19" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="22" y="30" width="10" height="5" rx="2" fill={PULSE} transform="rotate(-25 27 32)" />
      <rect x="138" y="24" width="10" height="5" rx="2" fill={VIOLET} transform="rotate(30 143 26)" />
      <rect x="140" y="92" width="9" height="5" rx="2" fill={NAVY} transform="rotate(-15 144 94)" />
      <circle cx="30" cy="96" r="4" fill={VIOLET} opacity="0.7" />
      <circle cx="132" cy="56" r="3" fill={PULSE} />
      <circle cx="40" cy="62" r="3" fill={NAVY} opacity="0.6" />
    </Svg>
  );
}

// Map with pins: nothing nearby.
export function MapArt({ className }) {
  return (
    <Svg w={200} h={140} className={className}>
      <path d="M20 30l50-14 60 14 50-14v94l-50 14-60-14-50 14z" fill="#fff" stroke="#E3DFD5" strokeWidth="2" />
      <path d="M70 16v94 M130 30v94" stroke="#E3DFD5" strokeWidth="2" />
      <path d="M28 82c30-10 50 12 80-6s48-14 64-24" stroke={SOFT} strokeWidth="9" fill="none" strokeLinecap="round" />
      <g transform="translate(84 22)"><path d="M16 46S1 33 1 21a15 15 0 0130 0c0 12-15 25-15 25z" fill={NAVY} stroke="#fff" strokeWidth="3" /><circle cx="16" cy="21" r="5.5" fill="#fff" /></g>
      <circle cx="150" cy="58" r="8" fill={PULSE} stroke="#fff" strokeWidth="3" />
      <circle cx="46" cy="58" r="6" fill={VIOLET} stroke="#fff" strokeWidth="3" />
    </Svg>
  );
}

// Hard hat and wrench: crew with no jobs.
export function CrewArt({ className }) {
  return (
    <Svg w={180} h={130} className={className}>
      <ellipse cx="90" cy="118" rx="56" ry="7" fill="#E3DFD5" />
      <path d="M40 92a50 50 0 01100 0z" fill={PULSE} />
      <rect x="30" y="90" width="120" height="14" rx="7" fill="#D4521F" />
      <rect x="84" y="38" width="12" height="54" rx="6" fill="#fff" opacity="0.35" />
      <circle cx="146" cy="34" r="14" fill={SOFT} />
      <path d="M140 34l4 4 8-9" stroke={NAVY} strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

