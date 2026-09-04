/* Utilitaires de dates, en français. */

const DOW_KEYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const DOW_SHORT = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];
const MONTHS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const SCHOOL_DAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi'];

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function toISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getMonday(date) {
  const d = startOfDay(date);
  const day = d.getDay(); // 0 = dimanche
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(d, diff);
}

function dayKey(date) {
  return DOW_KEYS[date.getDay()];
}

function formatLongDate(date) {
  return `${DOW_KEYS[date.getDay()]} ${date.getDate()} ${MONTHS_FR[date.getMonth()]}`;
}

function formatWeekRange(monday) {
  const friday = addDays(monday, 4);
  const sameMonth = monday.getMonth() === friday.getMonth();
  const startStr = `${monday.getDate()}${sameMonth ? '' : ' ' + MONTHS_FR[monday.getMonth()]}`;
  const endStr = `${friday.getDate()} ${MONTHS_FR[friday.getMonth()]}`;
  return `Semaine du ${startStr} au ${endStr}`;
}
