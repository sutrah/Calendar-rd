/* Couleur associée à chaque matière (par mot-clé), pour un affichage cohérent. */
const SUBJECT_COLORS = [
  [/fran[cç]ais/i, '#ec4899'],
  [/math.*compl/i, '#b45309'],
  [/math/i, '#f59e0b'],
  [/anglais/i, '#8b5cf6'],
  [/histoire/i, '#0891b2'],
  [/sciences? vie/i, '#16a34a'],
  [/physique.?chimie/i, '#0ea5e9'],
  [/technologie/i, '#059669'],
  [/chinois/i, '#4f46e5'],
  [/musicale/i, '#9333ea'],
  [/arts? plastiques/i, '#c026d3'],
  [/physique & sport|eps|sport/i, '#ea580c'],
  [/philosophie/i, '#78716c'],
  [/scientifique/i, '#0d9488'],
  [/th[eé][aâ]tre/i, '#be123c'],
  [/moral.*civique/i, '#6b7280'],
  [/cha\b|horaire am[ée]nag/i, '#ca8a04'],
  [/hockey/i, '#0369a1'],
  [/taekwondo|taek.?wondo/i, '#be185d'],
  [/muay.?thai|moa[iï].?thai/i, '#9a3412'],
];

function colorForSubject(subject, fallback) {
  if (!subject) return fallback || '#2563eb';
  for (const [re, color] of SUBJECT_COLORS) {
    if (re.test(subject)) return color;
  }
  return fallback || '#2563eb';
}
