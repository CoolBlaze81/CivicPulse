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
      <circle className="art-glow" cx="200" cy="40" r="22" fill={PULSE} opacity="0.9" />
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
      <g transform="translate(118 18)"><g className="art-float">
        <path d="M20 58s-18-16-18-31a18 18 0 0136 0c0 15-18 31-18 31z" fill={PULSE} stroke="#fff" strokeWidth="3" />
        <path className="art-trace" d="M9 27h6l3-6 4 11 3-7 2 2h4" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </g></g>
    </Svg>
  );
}

// Bell with sparkles: nothing in Updates yet.
export function BellArt({ className }) {
  return (
    <Svg w={180} h={140} className={className}>
      <ellipse cx="90" cy="128" rx="58" ry="8" fill="#E3DFD5" />
      <circle cx="90" cy="66" r="52" fill={SOFT} />
      <g className="art-swing">
        <path d="M62 92V70a28 28 0 0156 0v22l8 8H54z" fill={NAVY} />
        <path d="M80 104a10 10 0 0020 0" fill={PULSE} />
        <path d="M72 66a18 18 0 0118-18" stroke="#fff" strokeOpacity="0.35" strokeWidth="5" fill="none" strokeLinecap="round" />
      </g>
      <g className="art-pop">
        <circle cx="126" cy="36" r="13" fill={PULSE} />
        <path d="M121 36l4 4 6-8" stroke="#fff" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <path className="art-twinkle" d="M36 40l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill={VIOLET} opacity="0.7" />
      <path className="art-twinkle d2" d="M150 82l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill={VIOLET} opacity="0.5" />
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
      <g transform="translate(130 76)"><g className="art-float">
        <path d="M16 46S1 33 1 21a15 15 0 0130 0c0 12-15 25-15 25z" fill={PULSE} stroke="#fff" strokeWidth="3" />
        <circle cx="16" cy="21" r="5.5" fill="#fff" />
      </g></g>
    </Svg>
  );
}

// Check with confetti: queue clear / all caught up.
export function AllClearArt({ className }) {
  return (
    <Svg w={170} h={130} className={className}>
      <circle cx="85" cy="62" r="44" fill="#DFF3E3" />
      <g className="art-pop">
        <circle cx="85" cy="62" r="30" fill="#1F7A3A" />
        <path className="art-draw" d="M72 62l9 9 18-19" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <rect x="22" y="30" width="10" height="5" rx="2" fill={PULSE} transform="rotate(-25 27 32)" />
      <rect x="138" y="24" width="10" height="5" rx="2" fill={VIOLET} transform="rotate(30 143 26)" />
      <rect x="140" y="92" width="9" height="5" rx="2" fill={NAVY} transform="rotate(-15 144 94)" />
      <circle className="art-twinkle" cx="30" cy="96" r="4" fill={VIOLET} opacity="0.7" />
      <circle className="art-twinkle d2" cx="132" cy="56" r="3" fill={PULSE} />
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
      <g transform="translate(84 22)"><g className="art-float"><path d="M16 46S1 33 1 21a15 15 0 0130 0c0 12-15 25-15 25z" fill={NAVY} stroke="#fff" strokeWidth="3" /><circle cx="16" cy="21" r="5.5" fill="#fff" /></g></g>
      <circle className="art-ping" cx="150" cy="58" r="8" fill={PULSE} stroke="#fff" strokeWidth="3" />
      <circle cx="46" cy="58" r="6" fill={VIOLET} stroke="#fff" strokeWidth="3" />
    </Svg>
  );
}

// Hard hat and wrench: crew with no jobs.
export function CrewArt({ className }) {
  return (
    <Svg w={180} h={130} className={className}>
      <ellipse cx="90" cy="118" rx="56" ry="7" fill="#E3DFD5" />
      <g className="art-float">
        <path d="M40 92a50 50 0 01100 0z" fill={PULSE} />
        <rect x="30" y="90" width="120" height="14" rx="7" fill="#D4521F" />
        <rect x="84" y="38" width="12" height="54" rx="6" fill="#fff" opacity="0.35" />
      </g>
      <g className="art-pop">
        <circle cx="146" cy="34" r="14" fill={SOFT} />
        <path d="M140 34l4 4 8-9" stroke={NAVY} strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </Svg>
  );
}


// Pin with a question mark on a dashed path: page not found.
export function LostArt({ className }) {
  return (
    <Svg w={220} h={150} className={className}>
      <ellipse cx="110" cy="138" rx="72" ry="8" fill="#E3DFD5" />
      <path d="M20 120c30-30 60 10 90-20s60-10 90-40" fill="none" stroke={NAVY} strokeOpacity="0.25" strokeWidth="4" strokeDasharray="2 10" strokeLinecap="round" />
      <circle cx="20" cy="120" r="6" fill={VIOLET} />
      <g transform="translate(84 12)"><g className="art-float">
        <path d="M26 110S2 82 2 52a24 24 0 0148 0c0 30-24 58-24 58z" fill={PULSE} stroke="#fff" strokeWidth="4" />
        <path d="M18 44a8 8 0 1112 7c-3 2-4 3-4 7" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
        <circle cx="26" cy="67" r="3" fill="#fff" />
      </g></g>
      <path className="art-twinkle" d="M176 30l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill={VIOLET} opacity="0.6" />
    </Svg>
  );
}

// Striped road barrier: no access.
export function BlockedArt({ className }) {
  return (
    <Svg w={220} h={140} className={className}>
      <ellipse cx="110" cy="128" rx="80" ry="8" fill="#E3DFD5" />
      <rect x="46" y="70" width="10" height="56" rx="3" fill={NAVY} />
      <rect x="164" y="70" width="10" height="56" rx="3" fill={NAVY} />
      <g className="art-swing">
        <rect x="26" y="52" width="168" height="30" rx="8" fill="#fff" stroke={NAVY} strokeWidth="3" />
        {[0, 1, 2, 3, 4].map((i) => <path key={i} d={`M${44 + i * 32} 54l-18 26h14l18-26z`} fill={PULSE} />)}
      </g>
      <circle className="art-ping" cx="40" cy="44" r="7" fill="#F5B83D" />
      <circle className="art-ping d2" cx="180" cy="44" r="7" fill="#F5B83D" />
    </Svg>
  );
}

// Padlock with a clock: signed out.
export function LockArt({ className }) {
  return (
    <Svg w={190} h={150} className={className}>
      <ellipse cx="95" cy="138" rx="60" ry="8" fill="#E3DFD5" />
      <circle cx="95" cy="70" r="58" fill={SOFT} />
      <path d="M72 66V50a23 23 0 0146 0v16" fill="none" stroke={NAVY} strokeWidth="9" strokeLinecap="round" />
      <rect x="58" y="64" width="74" height="58" rx="12" fill={NAVY} />
      <circle cx="95" cy="88" r="7" fill={PULSE} />
      <rect x="92" y="90" width="6" height="16" rx="3" fill={PULSE} />
      <g transform="translate(138 26)">
        <circle cx="0" cy="0" r="17" fill="#fff" stroke={PULSE} strokeWidth="4" />
        <path className="art-spin" d="M0 0V-10" stroke={NAVY} strokeWidth="3" strokeLinecap="round" />
        <path d="M0 0h7" stroke={NAVY} strokeWidth="3" strokeLinecap="round" />
      </g>
    </Svg>
  );
}

// Traffic cone with a wobble: something went wrong.
export function ConeArt({ className }) {
  return (
    <Svg w={190} h={150} className={className}>
      <ellipse cx="95" cy="138" rx="62" ry="8" fill="#E3DFD5" />
      <g className="art-wobble">
        <rect x="50" y="118" width="90" height="14" rx="5" fill="#D4521F" />
        <path d="M80 20h30l26 98H54z" fill={PULSE} />
        <path d="M74 44h42l7 26H67z" fill="#fff" />
        <path d="M63 86h64l6 20H57z" fill="#fff" />
        <rect x="80" y="14" width="30" height="10" rx="4" fill="#D4521F" />
      </g>
      <path className="art-twinkle" d="M36 40l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill={NAVY} opacity="0.5" />
      <path className="art-twinkle d2" d="M156 60l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill={VIOLET} opacity="0.6" />
    </Svg>
  );
}

// Cloud with a slash: offline.
export function OfflineArt({ className }) {
  return (
    <Svg w={200} h={140} className={className}>
      <ellipse cx="100" cy="128" rx="64" ry="8" fill="#E3DFD5" />
      <g className="art-float">
        <path d="M58 100a26 26 0 01-2-52 34 34 0 0165-8 26 26 0 0123 60z" fill={SOFT} stroke={NAVY} strokeOpacity="0.3" strokeWidth="3" />
        <path d="M70 36l64 70" stroke={PULSE} strokeWidth="7" strokeLinecap="round" />
      </g>
    </Svg>
  );
}

// Paper plane leaving a pin with a check: report sent.
export function SentArt({ className }) {
  return (
    <Svg w={240} h={160} className={className}>
      <ellipse cx="120" cy="148" rx="70" ry="8" fill="#E3DFD5" />
      <path className="art-dash" d="M40 128c30-10 50-50 90-50s60-40 70-58" fill="none" stroke={NAVY} strokeOpacity="0.25" strokeWidth="3" strokeDasharray="4 9" strokeLinecap="round" />
      <g transform="translate(176 6)"><g className="art-fly">
        <path d="M0 22L46 0 32 44 22 30z" fill={NAVY} />
        <path d="M22 30L46 0 14 26z" fill="#33408A" />
      </g></g>
      <g transform="translate(18 64)"><g className="art-pop">
        <path d="M26 76S2 50 2 26a24 24 0 0148 0c0 24-24 50-24 50z" fill={PULSE} stroke="#fff" strokeWidth="4" />
        <path className="art-draw" d="M15 26l8 8 14-15" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
      </g></g>
      <circle className="art-twinkle" cx="108" cy="40" r="4" fill={VIOLET} />
      <rect className="art-twinkle d2" x="140" y="108" width="10" height="5" rx="2" fill={PULSE} transform="rotate(-20 145 110)" />
    </Svg>
  );
}

// Magnifier over a list: no search results.
export function SearchArt({ className }) {
  return (
    <Svg w={190} h={140} className={className}>
      <ellipse cx="95" cy="130" rx="60" ry="7" fill="#E3DFD5" />
      <rect x="34" y="22" width="96" height="98" rx="12" fill="#fff" stroke="#E3DFD5" strokeWidth="2" />
      {[0, 1, 2, 3].map((i) => <rect key={i} x="48" y={38 + i * 20} width={i % 2 ? 44 : 64} height="8" rx="4" fill="#E3DFD5" />)}
      <g className="art-search">
        <circle cx="126" cy="72" r="24" fill="#fff" fillOpacity="0.6" stroke={NAVY} strokeWidth="7" />
        <path d="M143 89l20 20" stroke={NAVY} strokeWidth="9" strokeLinecap="round" />
      </g>
    </Svg>
  );
}

// Shield with a pulse line: activity log.
export function ShieldArt({ className }) {
  return (
    <Svg w={180} h={140} className={className}>
      <ellipse cx="90" cy="130" rx="56" ry="7" fill="#E3DFD5" />
      <circle cx="90" cy="66" r="54" fill={SOFT} />
      <g className="art-pop">
        <path d="M90 18l38 14v30c0 26-17 44-38 52-21-8-38-26-38-52V32z" fill={NAVY} />
        <path className="art-trace" d="M64 66h12l5-10 8 20 6-14 4 4h12" fill="none" stroke={PULSE} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </Svg>
  );
}
