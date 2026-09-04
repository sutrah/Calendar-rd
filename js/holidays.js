/* Jours fériés (calculés) + vacances scolaires Zone B (Brest / Académie de Rennes). */

function easterSunday(year) {
  // Algorithme de Gauss (calendrier grégorien)
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

/* addDays() et toISO() sont définies dans dates.js, chargé avant ce fichier. */

/** Jours fériés légaux en France métropolitaine pour une année donnée. */
function joursFeries(year) {
  const paques = easterSunday(year);
  const list = [
    { date: `${year}-01-01`, label: "Jour de l'an" },
    { date: toISO(addDays(paques, 1)), label: "Lundi de Pâques" },
    { date: `${year}-05-01`, label: "Fête du Travail" },
    { date: `${year}-05-08`, label: "Victoire 1945" },
    { date: toISO(addDays(paques, 39)), label: "Ascension" },
    { date: toISO(addDays(paques, 50)), label: "Lundi de Pentecôte" },
    { date: `${year}-07-14`, label: "Fête Nationale" },
    { date: `${year}-08-15`, label: "Assomption" },
    { date: `${year}-11-01`, label: "Toussaint" },
    { date: `${year}-11-11`, label: "Armistice 1918" },
    { date: `${year}-12-25`, label: "Noël" },
  ];
  return list;
}

/**
 * Vacances scolaires Zone B (Brest = académie de Rennes) - année scolaire 2026-2027.
 * Sources officielles (education.gouv.fr) : mettre à jour chaque année via la page Éditer.
 * Bornes incluses (le dernier jour de classe est la veille de "start", la reprise est "end").
 */
const VACANCES_ZONE_B = [
  { label: 'Vacances de la Toussaint', start: '2026-10-17', end: '2026-11-02' },
  { label: 'Vacances de Noël', start: '2026-12-19', end: '2027-01-04' },
  { label: "Vacances d'hiver", start: '2027-02-20', end: '2027-03-08' },
  { label: 'Vacances de printemps', start: '2027-04-17', end: '2027-05-03' },
  { label: "Vacances d'été", start: '2027-07-03', end: '2027-09-01' },
];

function isDateInRange(iso, start, end) {
  return iso >= start && iso <= end;
}

/** Retourne le nom de la période de vacances si la date (YYYY-MM-DD) tombe dedans, sinon null. */
function vacanceDuJour(iso) {
  for (const v of VACANCES_ZONE_B) {
    if (isDateInRange(iso, v.start, v.end)) return v;
  }
  return null;
}

/** Retourne le jour férié du jour (YYYY-MM-DD) s'il y en a un, sinon null. */
function ferieDuJour(iso) {
  const year = parseInt(iso.slice(0, 4), 10);
  const all = [...joursFeries(year - 1), ...joursFeries(year), ...joursFeries(year + 1)];
  return all.find((f) => f.date === iso) || null;
}

/** Liste les jours fériés et vacances à venir dans les N prochains jours (pour l'onglet Famille). */
function prochainesEcheances(fromDate, days = 120) {
  const items = [];
  const start = new Date(fromDate);
  for (let i = 0; i < days; i++) {
    const d = addDays(start, i);
    const iso = toISO(d);
    const f = ferieDuJour(iso);
    if (f) items.push({ date: iso, label: f.label, type: 'ferie' });
  }
  for (const v of VACANCES_ZONE_B) {
    if (v.end >= toISO(start)) items.push({ date: v.start, label: v.label, type: 'vacances', end: v.end });
  }
  items.sort((a, b) => (a.date < b.date ? -1 : 1));
  return items.filter((it) => it.type !== 'vacances' || it.end >= toISO(start));
}
