// Lightweight text utilities for rule-based matching and classification.
const STOPWORDS = new Set(
  `a an the and or but of on in at to for from by with near is are was were be been it its this that
  there here very so too not no please some any my our your their has have had just also out off up down
  into over under again more most i we you he she they them me us his her can could would should will
  big huge small lot lots really road rd street st lane ln sector near outside opposite since today`.split(/\s+/)
);

// Very small suffix stripper so "potholes" ~ "pothole", "leaking" ~ "leak".
function stem(word) {
  return word
    .replace(/(ing|ed|es|s)$/u, '')
    .replace(/(.)\1$/u, '$1');
}

// Words citizens use for the same thing are folded onto one token, so
// "big hole" and "deep pothole" still count as sharing a word.
const SYNONYMS = {
  hole: 'pothole', pit: 'pothole', crater: 'pothole', pothol: 'pothole',
  garbage: 'waste', trash: 'waste', rubbish: 'waste', dump: 'waste', bin: 'waste', litter: 'waste',
  light: 'streetlight', lamp: 'streetlight', streetlamp: 'streetlight', dark: 'streetlight',
  leak: 'water', pipe: 'water', tap: 'water', burst: 'water',
  drain: 'drainage', sewer: 'drainage', gutter: 'drainage', clog: 'drainage', block: 'drainage',
  cave: 'collapse', sink: 'collapse', sinking: 'collapse', collaps: 'collapse',
};

export function tokens(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w))
    .map(stem)
    .map((w) => SYNONYMS[w] || w);
}

// Dice coefficient over token sets: 0 (nothing shared) .. 1 (same words).
export function textSimilarity(a, b) {
  const A = new Set(tokens(a));
  const B = new Set(tokens(b));
  if (A.size === 0 || B.size === 0) return 0;
  let shared = 0;
  for (const t of A) if (B.has(t)) shared += 1;
  return (2 * shared) / (A.size + B.size);
}

export function containsAny(text, words) {
  const lower = String(text || '').toLowerCase();
  return words.filter((w) => lower.includes(w));
}
