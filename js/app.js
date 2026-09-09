/* Rendu principal de l'agenda (index.html). */

const state = {
  tab: 'soren',
  selectedDate: null,
  data: {},
  view: 'jour', // 'jour' | 'semaine'
};

async function fetchJsonSafe(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    return null;
  }
}

async function loadData() {
  const [
    soren, loise, famille,
    devoirsSoren, devoirsLoise,
    evaluationsSoren, evaluationsLoise,
    moyennesSoren, moyennesLoise,
    notifications, menu,
  ] = await Promise.all([
    fetch('data/soren.json').then((r) => r.json()),
    fetch('data/loise.json').then((r) => r.json()),
    fetch('data/family.json').then((r) => r.json()),
    fetchJsonSafe('data/devoirs-soren.json'),
    fetchJsonSafe('data/devoirs-loise.json'),
    fetchJsonSafe('data/evaluations-soren.json'),
    fetchJsonSafe('data/evaluations-loise.json'),
    fetchJsonSafe('data/moyennes-soren.json'),
    fetchJsonSafe('data/moyennes-loise.json'),
    fetchJsonSafe('data/notifications.json'),
    fetchJsonSafe('data/menu.json'),
  ]);
  state.data = {
    soren, loise, famille,
    devoirsSoren, devoirsLoise,
    evaluationsSoren, evaluationsLoise,
    moyennesSoren, moyennesLoise,
    notifications, menu,
  };
}

function initialSelectedDate() {
  const today = startOfDay(new Date());
  const dow = today.getDay();
  if (dow === 0) return addDays(today, 1); // dimanche -> lundi
  if (dow === 6) return addDays(today, 2); // samedi -> lundi
  return today;
}

function slotsForDate(child, date) {
  const iso = toISO(date);
  const dow = dayKey(date);
  const cancelIds = new Set(
    (child.exceptions || []).filter((e) => e.date === iso && e.cancel).map((e) => e.cancel)
  );
  const parity = weekParity(date);
  const base = (child.slots || [])
    .filter((s) => s.day === dow && !cancelIds.has(s.id))
    .filter((s) => (!s.from || iso >= s.from) && (!s.until || iso <= s.until))
    .filter((s) => !s.week || s.week === parity)
    .map((s) => ({ ...s, added: false }));
  const additions = (child.exceptions || [])
    .filter((e) => e.date === iso && e.subject)
    .map((e) => ({ ...e, added: true }));
  const all = [...base, ...additions];
  all.sort((a, b) => a.start.localeCompare(b.start));
  return all;
}

/** Jours de la semaine à afficher pour cet enfant : lundi-vendredi, + samedi si une activité y est prévue. */
function getChildDays(child) {
  const hasSaturday = (child.slots || []).some((s) => s.day === 'samedi');
  return hasSaturday ? [...SCHOOL_DAYS, 'samedi'] : SCHOOL_DAYS;
}

function renderTabs() {
  document.querySelectorAll('#tabs button').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === state.tab);
  });
}

function renderDaySelector(monday, numDays, childKey) {
  const wrap = document.createElement('div');
  wrap.className = 'day-selector';
  for (let i = 0; i < numDays; i++) {
    const d = addDays(monday, i);
    const iso = toISO(d);
    const chip = document.createElement('div');
    const isToday = iso === toISO(startOfDay(new Date()));
    const isSelected = iso === toISO(state.selectedDate);
    const evalCount = (evaluationsByDate(childKey)[iso] || []).length;
    chip.className = 'day-chip' + (isToday ? ' today' : '') + (isSelected ? ' selected' : '') + (evalCount ? ' has-eval' : '');
    chip.innerHTML = `
      <span class="dow">${DOW_SHORT[d.getDay()]}</span><span class="num">${d.getDate()}</span>
      ${evalCount > 1 ? `<span class="day-eval-badge">${evalCount}</span>` : ''}
    `;
    chip.addEventListener('click', () => {
      state.selectedDate = d;
      render();
    });
    wrap.appendChild(chip);
  }
  return wrap;
}

function renderViewToggle() {
  const wrap = document.createElement('div');
  wrap.className = 'view-toggle';
  ['jour', 'semaine'].forEach((v) => {
    const btn = document.createElement('button');
    btn.textContent = v === 'jour' ? 'Jour' : 'Semaine';
    btn.className = state.view === v ? 'active' : '';
    btn.addEventListener('click', () => {
      state.view = v;
      render();
    });
    wrap.appendChild(btn);
  });
  return wrap;
}

function renderWeekNav(monday, showParityBadge) {
  const wrap = document.createElement('div');
  wrap.className = 'week-nav';
  const prev = document.createElement('button');
  prev.textContent = '‹';
  prev.addEventListener('click', () => {
    state.selectedDate = addDays(state.selectedDate, -7);
    render();
  });
  const next = document.createElement('button');
  next.textContent = '›';
  next.addEventListener('click', () => {
    state.selectedDate = addDays(state.selectedDate, 7);
    render();
  });
  const label = document.createElement('div');
  label.className = 'label';
  label.textContent = formatWeekRange(monday);
  if (showParityBadge) {
    const badge = document.createElement('span');
    badge.className = 'week-parity-badge';
    badge.textContent = `Semaine ${weekParity(monday)}`;
    label.appendChild(badge);
  }
  wrap.append(prev, label, next);
  return wrap;
}

/* --- Évaluations (mise en évidence orange) --- */

function evaluationsByDate(childKey) {
  const data = childKey === 'soren' ? state.data.evaluationsSoren : state.data.evaluationsLoise;
  return (data && data.byDate) || {};
}

function dateHasEval(childKey, iso) {
  const evals = evaluationsByDate(childKey)[iso];
  return !!(evals && evals.length);
}

function normalizeSubjectName(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function isEvalSlot(childKey, iso, slot) {
  const evals = evaluationsByDate(childKey)[iso];
  if (!evals) return false;
  // Pronote renvoie les matières en MAJUSCULES ("PHYSIQUE-CHIMIE"), alors que
  // l'emploi du temps saisi à la main utilise une casse normale
  // ("Physique-Chimie") : comparaison insensible à la casse et aux accents.
  return evals.some(
    (e) => normalizeSubjectName(e.subject) === normalizeSubjectName(slot.subject) && e.start === slot.start
  );
}

/** Le créneau est-il en train de se dérouler maintenant (pour le jour affiché) ? */
function isSlotNow(slot, date) {
  const now = new Date();
  if (toISO(date) !== toISO(now)) return false;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = slot.start.split(':').map(Number);
  const [eh, em] = slot.end.split(':').map(Number);
  return nowMin >= sh * 60 + sm && nowMin < eh * 60 + em;
}

function slotCard(slot, date, isEval) {
  const card = document.createElement('div');
  const isNow = isSlotNow(slot, date);
  card.className = 'slot-card' + (slot.added ? ' added' : '') + (isNow ? ' now' : '') + (isEval ? ' eval' : '');
  card.style.setProperty('--card-color', colorForSubject(slot.subject));
  const meta = [slot.teacher, slot.room].filter(Boolean).join(' · ');
  card.innerHTML = `
    <div class="slot-time">${slot.start}<br>${slot.end}</div>
    <div class="slot-info">
      <p class="slot-subject">${slot.subject}${slot.group ? `<span class="slot-group">${slot.group}</span>` : ''}${isNow ? `<span class="now-badge">Maintenant</span>` : ''}${isEval ? `<span class="eval-badge">Éval</span>` : ''}</p>
      ${meta ? `<p class="slot-meta">${meta}</p>` : ''}
    </div>
  `;
  return card;
}

function renderWeekView(main, child, monday, numDays, childKey) {
  for (let i = 0; i < numDays; i++) {
    const d = addDays(monday, i);
    const iso = toISO(d);
    const isToday = iso === toISO(startOfDay(new Date()));
    const hasEval = dateHasEval(childKey, iso);

    const dayWrap = document.createElement('div');
    dayWrap.className = 'week-day';
    const header = document.createElement('div');
    header.className = 'week-day-header' + (isToday ? ' today' : '') + (hasEval ? ' has-eval' : '');
    header.innerHTML = `<span>${formatLongDate(d)}</span>${isToday ? '<span class="today-badge">Aujourd’hui</span>' : ''}`;
    dayWrap.appendChild(header);

    const ferie = ferieDuJour(iso);
    const vacance = vacanceDuJour(iso);
    if (ferie || vacance) {
      const note = document.createElement('div');
      note.className = 'week-day-note';
      note.textContent = ferie ? `🎉 ${ferie.label}` : `🏖️ ${vacance.label}`;
      dayWrap.appendChild(note);
    } else {
      const slots = slotsForDate(child, d);
      if (slots.length === 0) {
        const note = document.createElement('div');
        note.className = 'week-day-note muted';
        note.textContent = 'Pas de cours';
        dayWrap.appendChild(note);
      } else {
        const list = document.createElement('div');
        list.className = 'agenda-list compact';
        slots.forEach((s) => list.appendChild(slotCard(s, d, isEvalSlot(childKey, iso, s))));
        dayWrap.appendChild(list);
      }
    }
    main.appendChild(dayWrap);
  }
}

function renderChildTab(main, child) {
  const childKey = child === state.data.soren ? 'soren' : 'loise';
  const monday = getMonday(state.selectedDate);
  const numDays = getChildDays(child).length;
  const hasWeekAlternation = (child.slots || []).some((s) => s.week);

  main.appendChild(renderWeekNav(monday, hasWeekAlternation));
  main.appendChild(renderViewToggle());

  if (child.reviewed === false) {
    const banner = document.createElement('div');
    banner.className = 'banner';
    banner.innerHTML = `⚠️ <span>Cet emploi du temps est une première saisie à vérifier. Corrigez-le via <a href="edit.html">Modifier</a>, puis marquez-le comme vérifié.</span>`;
    main.appendChild(banner);
  }

  if (state.view === 'semaine') {
    renderWeekView(main, child, monday, numDays, childKey);
    return;
  }

  main.appendChild(renderDaySelector(monday, numDays, childKey));

  const iso = toISO(state.selectedDate);
  const ferie = ferieDuJour(iso);
  const vacance = vacanceDuJour(iso);

  if (ferie) {
    const b = document.createElement('div');
    b.className = 'vacances-banner';
    b.textContent = `🎉 Jour férié — ${ferie.label}`;
    main.appendChild(b);
  } else {
    if (vacance) {
      const b = document.createElement('div');
      b.className = 'vacances-banner';
      b.textContent = `🏖️ ${vacance.label} — reprise le ${formatLongDate(new Date(vacance.end))}`;
      main.appendChild(b);
    }

    const slots = slotsForDate(child, state.selectedDate);
    const list = document.createElement('div');
    list.className = 'agenda-list';
    if (slots.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = vacance ? '' : 'Pas de cours prévu ce jour.';
      if (!vacance) list.appendChild(empty);
    } else {
      slots.forEach((s) => list.appendChild(slotCard(s, state.selectedDate, isEvalSlot(childKey, iso, s))));
    }
    main.appendChild(list);
  }

  const devoirsData = childKey === 'soren' ? state.data.devoirsSoren : state.data.devoirsLoise;
  renderDevoirsSection(main, childKey, devoirsData, state.selectedDate);

  renderMenuSection(main, state.data.menu, state.selectedDate);

  const moyennesData = childKey === 'soren' ? state.data.moyennesSoren : state.data.moyennesLoise;
  renderMoyennesSection(main, moyennesData);
}

/* --- Devoirs : coché "fait" persisté localement (par appareil) --- */

function hwStorageKey(childKey) {
  return `devoirs_done_${childKey}`;
}

function getDoneOverrides(childKey) {
  try {
    return JSON.parse(localStorage.getItem(hwStorageKey(childKey))) || {};
  } catch (e) {
    return {};
  }
}

function setDoneOverride(childKey, key, done) {
  const overrides = getDoneOverrides(childKey);
  overrides[key] = done;
  try {
    localStorage.setItem(hwStorageKey(childKey), JSON.stringify(overrides));
  } catch (e) {
    /* stockage indisponible (navigation privée...) : tant pis, pas de persistance */
  }
}

function hwKey(dateIso, hw) {
  return `${dateIso}__${hw.subject}__${hw.description}`;
}

const CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 12 10 18 20 6"></polyline></svg>';

function renderDevoirsSection(main, childKey, devoirsData, selectedDate) {
  if (!devoirsData || !devoirsData.byDate) return;
  const targetDate = addDays(selectedDate, 1);
  const targetIso = toISO(targetDate);
  const items = devoirsData.byDate[targetIso] || [];
  if (items.length === 0) return;

  const overrides = getDoneOverrides(childKey);

  const title = document.createElement('div');
  title.className = 'section-title';
  title.textContent = `📚 Devoirs pour ${formatLongDate(targetDate)}`;
  main.appendChild(title);

  const list = document.createElement('div');
  list.className = 'agenda-list';
  items.forEach((hw) => {
    const key = hwKey(targetIso, hw);
    const done = key in overrides ? overrides[key] : !!hw.done;

    const card = document.createElement('div');
    card.className = 'homework-card' + (done ? ' done' : '');
    card.style.setProperty('--card-color', colorForSubject(hw.subject));

    const check = document.createElement('button');
    check.type = 'button';
    check.className = 'hw-check' + (done ? ' checked' : '');
    check.setAttribute('aria-label', done ? 'Marquer comme non fait' : 'Marquer comme fait');
    check.innerHTML = CHECK_SVG;

    const body = document.createElement('div');
    body.className = 'hw-body';
    body.innerHTML = `
      <p class="homework-subject">${escapeHtml(hw.subject)}</p>
      ${hw.description ? `<p class="homework-desc">${escapeHtml(hw.description).replace(/\n/g, '<br>')}</p>` : ''}
    `;

    check.addEventListener('click', () => {
      const newDone = !card.classList.contains('done');
      setDoneOverride(childKey, key, newDone);
      card.classList.toggle('done', newDone);
      check.classList.toggle('checked', newDone);
      check.setAttribute('aria-label', newDone ? 'Marquer comme non fait' : 'Marquer comme fait');
      if (newDone) {
        check.classList.remove('pop');
        void check.offsetWidth; // relance l'animation même si déjà jouée
        check.classList.add('pop');
        setTimeout(() => check.classList.remove('pop'), 500);
      }
    });

    card.append(check, body);
    list.appendChild(card);
  });
  main.appendChild(list);
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* --- Menu de la cantine (extrait du PDF Pronote par l'API Claude) --- */

function renderMenuSection(main, menuData, selectedDate) {
  if (!menuData || !menuData.byDate) return;
  const iso = toISO(selectedDate);
  const jour = menuData.byDate[iso];
  if (!jour) return;

  const categories = [
    ['entrees', '🥗 Entrée'],
    ['plats', '🍽️ Plat'],
    ['laitiers', '🧀 Laitage'],
    ['desserts', '🍰 Dessert'],
  ];
  const hasAny = categories.some(([key]) => (jour[key] || []).length > 0);
  if (!hasAny) return;

  const title = document.createElement('div');
  title.className = 'section-title';
  title.textContent = `🍴 Menu de la cantine — ${formatLongDate(selectedDate)}`;
  main.appendChild(title);

  const card = document.createElement('div');
  card.className = 'menu-card';
  card.innerHTML = categories
    .filter(([key]) => (jour[key] || []).length > 0)
    .map(([key, label]) => `
      <div class="menu-row">
        <span class="menu-label">${label}</span>
        <span class="menu-items">${jour[key].map((item) => escapeHtml(item)).join(', ')}</span>
      </div>
    `)
    .join('');
  main.appendChild(card);
}

/* --- Moyennes (moyenne générale + par matière, calculées par Pronote) --- */

function renderMoyennesSection(main, moyennesData) {
  if (!moyennesData || moyennesData.overall == null) return;

  const title = document.createElement('div');
  title.className = 'section-title';
  title.textContent = `📊 Moyennes${moyennesData.periodName ? ' — ' + moyennesData.periodName : ''}`;
  main.appendChild(title);

  const outOf = 20;
  const pct = Math.max(0, Math.min(1, moyennesData.overall / outOf));
  const r = 42;
  const c = 2 * Math.PI * r;

  const donutWrap = document.createElement('div');
  donutWrap.className = 'donut-wrap';
  donutWrap.innerHTML = `
    <svg viewBox="0 0 100 100" class="donut">
      <circle cx="50" cy="50" r="${r}" class="donut-bg" />
      <circle cx="50" cy="50" r="${r}" class="donut-fg" stroke-dasharray="${(pct * c).toFixed(1)} ${c.toFixed(1)}" />
    </svg>
    <div class="donut-label">${moyennesData.overall.toFixed(1)}<span>/20</span></div>
  `;
  main.appendChild(donutWrap);

  if (moyennesData.subjects && moyennesData.subjects.length > 0) {
    const list = document.createElement('div');
    list.className = 'agenda-list';
    moyennesData.subjects.forEach((s) => {
      const card = document.createElement('div');
      card.className = 'moyenne-card';
      card.style.setProperty('--card-color', colorForSubject(s.subject));
      card.innerHTML = `
        <p class="moyenne-subject">${escapeHtml(s.subject)}</p>
        <p class="moyenne-values">${s.student.toFixed(1)}/${s.outOf}${s.classAverage != null ? ` <span class="moyenne-class">· classe ${s.classAverage.toFixed(1)}</span>` : ''}</p>
      `;
      list.appendChild(card);
    });
    main.appendChild(list);
  }
}

/* --- Notifications Pronote (compte parent) --- */

function getSeenNotifIds() {
  try {
    return new Set(JSON.parse(localStorage.getItem('notifications_seen')) || []);
  } catch (e) {
    return new Set();
  }
}

function markNotificationsSeen(ids) {
  try {
    localStorage.setItem('notifications_seen', JSON.stringify(ids));
  } catch (e) { /* stockage indisponible : tant pis */ }
}

function unseenNotifCount() {
  const items = (state.data.notifications && state.data.notifications.items) || [];
  const seen = getSeenNotifIds();
  return items.filter((i) => !seen.has(i.id)).length;
}

function updateNotifBadge() {
  const badge = document.getElementById('notifBadge');
  if (!badge) return;
  const count = unseenNotifCount();
  badge.textContent = count > 9 ? '9+' : String(count);
  badge.hidden = count === 0;
}

function renderNotificationsTab(main) {
  const items = (state.data.notifications && state.data.notifications.items) || [];
  const seen = getSeenNotifIds();

  if (items.length === 0) {
    main.innerHTML = '<div class="empty-state">Aucune notification pour le moment.</div>';
  } else {
    const list = document.createElement('div');
    list.className = 'agenda-list';
    items.forEach((n) => {
      const card = document.createElement('div');
      card.className = 'notif-card' + (seen.has(n.id) ? '' : ' unseen');
      const d = n.date ? new Date(n.date) : null;
      card.innerHTML = `
        <div class="notif-date">${d ? formatLongDate(d) : ''}${!seen.has(n.id) ? '<span class="notif-new-dot"></span>' : ''}</div>
        <p class="notif-title">${escapeHtml(n.title)}</p>
        ${n.content ? `<p class="notif-content">${escapeHtml(n.content).replace(/\n/g, '<br>')}</p>` : ''}
        ${n.author ? `<p class="notif-author">${escapeHtml(n.author)}</p>` : ''}
      `;
      list.appendChild(card);
    });
    main.appendChild(list);
  }

  // La visite de l'onglet marque tout comme vu ; le badge se met à jour au rendu suivant.
  markNotificationsSeen(items.map((i) => i.id));
}

function renderFamilleTab(main) {
  const upcoming = prochainesEcheances(new Date(), 150);
  main.innerHTML += '<div class="section-title">Jours fériés & vacances (Zone B)</div>';
  const list1 = document.createElement('div');
  list1.className = 'agenda-list';
  upcoming.slice(0, 12).forEach((it) => {
    const card = document.createElement('div');
    card.className = 'event-card';
    const d = new Date(it.date);
    card.innerHTML = `<div class="event-date">${formatLongDate(d)}</div><div class="event-title">${it.type === 'ferie' ? '🎉' : '🏖️'} ${it.label}</div>`;
    list1.appendChild(card);
  });
  main.appendChild(list1);

  main.innerHTML += '<div class="section-title">Événements famille</div>';
  const events = (state.data.famille.events || []).filter((e) => e.date >= toISO(new Date())).sort((a, b) => a.date.localeCompare(b.date));
  const list2 = document.createElement('div');
  list2.className = 'agenda-list';
  if (events.length === 0) {
    list2.innerHTML = '<div class="empty-state">Aucun événement à venir. Ajoutez-en via <a href="edit.html">Modifier</a>.</div>';
  } else {
    events.forEach((e) => {
      const card = document.createElement('div');
      card.className = 'event-card';
      card.innerHTML = `<div class="event-date">${formatLongDate(new Date(e.date))} ${e.start ? '· ' + e.start : ''}</div><div class="event-title">${e.title}</div>${e.who ? `<div class="event-sub">${e.who}${e.location ? ' · ' + e.location : ''}</div>` : ''}`;
      list2.appendChild(card);
    });
  }
  main.appendChild(list2);
}

function render() {
  const main = document.getElementById('main');
  main.innerHTML = '';
  renderTabs();
  updateNotifBadge();
  if (state.tab === 'soren') renderChildTab(main, state.data.soren);
  else if (state.tab === 'loise') renderChildTab(main, state.data.loise);
  else if (state.tab === 'notifications') renderNotificationsTab(main);
  else renderFamilleTab(main);
}

document.getElementById('tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-tab]');
  if (!btn) return;
  state.tab = btn.dataset.tab;
  render();
});

/* --- iOS n'a pas de invite d'installation automatique : on affiche une bannière --- */

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function initIosInstallBanner() {
  if (!isIos() || isStandalone()) return;
  if (localStorage.getItem('ios_install_banner_dismissed') === '1') return;

  const banner = document.createElement('div');
  banner.className = 'ios-install-banner';
  banner.innerHTML = `
    <span>📲 Ajoutez ce site à l'écran d'accueil : appuyez sur <strong>Partager</strong> ⬆️ puis « Sur l'écran d'accueil ».</span>
    <button class="ios-install-close" aria-label="Fermer">✕</button>
  `;
  document.body.appendChild(banner);
  banner.querySelector('.ios-install-close').addEventListener('click', () => {
    banner.remove();
    try {
      localStorage.setItem('ios_install_banner_dismissed', '1');
    } catch (e) { /* stockage indisponible : tant pis */ }
  });
}

(async function init() {
  state.selectedDate = initialSelectedDate();
  await loadData();
  render();
  initPush();
  initIosInstallBanner();
  setInterval(render, 60000); // garde le repère "Maintenant" à jour
})();
