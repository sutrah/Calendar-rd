/* Rendu principal de l'agenda (index.html). */

const state = {
  tab: 'soren',
  selectedDate: null,
  data: {},
  view: 'jour', // 'jour' | 'semaine'
};

async function loadData() {
  const [soren, loise, famille] = await Promise.all([
    fetch('data/soren.json').then((r) => r.json()),
    fetch('data/loise.json').then((r) => r.json()),
    fetch('data/family.json').then((r) => r.json()),
  ]);
  state.data = { soren, loise, famille };
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

function renderDaySelector(monday, numDays) {
  const wrap = document.createElement('div');
  wrap.className = 'day-selector';
  for (let i = 0; i < numDays; i++) {
    const d = addDays(monday, i);
    const iso = toISO(d);
    const chip = document.createElement('div');
    const isToday = iso === toISO(startOfDay(new Date()));
    const isSelected = iso === toISO(state.selectedDate);
    chip.className = 'day-chip' + (isToday ? ' today' : '') + (isSelected ? ' selected' : '');
    chip.innerHTML = `<span class="dow">${DOW_SHORT[d.getDay()]}</span><span class="num">${d.getDate()}</span>`;
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

/** Le créneau est-il en train de se dérouler maintenant (pour le jour affiché) ? */
function isSlotNow(slot, date) {
  const now = new Date();
  if (toISO(date) !== toISO(now)) return false;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = slot.start.split(':').map(Number);
  const [eh, em] = slot.end.split(':').map(Number);
  return nowMin >= sh * 60 + sm && nowMin < eh * 60 + em;
}

function slotCard(slot, date) {
  const card = document.createElement('div');
  const isNow = isSlotNow(slot, date);
  card.className = 'slot-card' + (slot.added ? ' added' : '') + (isNow ? ' now' : '');
  card.style.setProperty('--card-color', colorForSubject(slot.subject));
  const meta = [slot.teacher, slot.room].filter(Boolean).join(' · ');
  card.innerHTML = `
    <div class="slot-time">${slot.start}<br>${slot.end}</div>
    <div class="slot-info">
      <p class="slot-subject">${slot.subject}${slot.group ? `<span class="slot-group">${slot.group}</span>` : ''}${isNow ? `<span class="now-badge">Maintenant</span>` : ''}</p>
      ${meta ? `<p class="slot-meta">${meta}</p>` : ''}
    </div>
  `;
  return card;
}

function renderWeekView(main, child, monday, numDays) {
  for (let i = 0; i < numDays; i++) {
    const d = addDays(monday, i);
    const iso = toISO(d);
    const isToday = iso === toISO(startOfDay(new Date()));

    const dayWrap = document.createElement('div');
    dayWrap.className = 'week-day';
    const header = document.createElement('div');
    header.className = 'week-day-header' + (isToday ? ' today' : '');
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
        slots.forEach((s) => list.appendChild(slotCard(s, d)));
        dayWrap.appendChild(list);
      }
    }
    main.appendChild(dayWrap);
  }
}

function renderChildTab(main, child) {
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
    renderWeekView(main, child, monday, numDays);
    return;
  }

  main.appendChild(renderDaySelector(monday, numDays));

  const iso = toISO(state.selectedDate);
  const ferie = ferieDuJour(iso);
  const vacance = vacanceDuJour(iso);

  if (ferie) {
    const b = document.createElement('div');
    b.className = 'vacances-banner';
    b.textContent = `🎉 Jour férié — ${ferie.label}`;
    main.appendChild(b);
    return;
  }
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
    slots.forEach((s) => list.appendChild(slotCard(s, state.selectedDate)));
  }
  main.appendChild(list);
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
  if (state.tab === 'soren') renderChildTab(main, state.data.soren);
  else if (state.tab === 'loise') renderChildTab(main, state.data.loise);
  else renderFamilleTab(main);
}

document.getElementById('tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-tab]');
  if (!btn) return;
  state.tab = btn.dataset.tab;
  render();
});

(async function init() {
  state.selectedDate = initialSelectedDate();
  await loadData();
  render();
  initPush();
  setInterval(render, 60000); // garde le repère "Maintenant" à jour
})();
