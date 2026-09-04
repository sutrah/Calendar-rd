/* Éditeur en ligne : modifie les données en mémoire (+ brouillon localStorage),
 * puis génère un fichier à télécharger pour remplacement via FTP. */

const FILES = { soren: 'data/soren.json', loise: 'data/loise.json', famille: 'data/family.json' };
const LABELS = { soren: 'Sören', loise: 'Loïse', famille: 'Famille' };
const EDITOR_DAYS = [...SCHOOL_DAYS, 'samedi'];

const state = {
  activeTab: 'soren',
  datasets: {},
  fromDraft: {},
  editingSlotId: null,
  editingEventId: null,
};

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function saveDraft(key) {
  localStorage.setItem('draft_' + key, JSON.stringify(state.datasets[key]));
  state.fromDraft[key] = true;
}

async function ensureLoaded(key) {
  if (state.datasets[key]) return;
  const draftRaw = localStorage.getItem('draft_' + key);
  if (draftRaw) {
    try {
      state.datasets[key] = JSON.parse(draftRaw);
      state.fromDraft[key] = true;
      return;
    } catch (e) { /* ignore, refetch below */ }
  }
  state.datasets[key] = await fetch(FILES[key]).then((r) => r.json());
  state.fromDraft[key] = false;
}

async function resetToOriginal(key) {
  if (!confirm('Annuler toutes vos modifications non téléchargées pour ' + LABELS[key] + ' ?')) return;
  localStorage.removeItem('draft_' + key);
  delete state.datasets[key];
  await ensureLoaded(key);
  render();
}

function download(key) {
  const data = state.datasets[key];
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = FILES[key].split('/').pop();
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function slotLabel(s) {
  return `${s.day.charAt(0).toUpperCase() + s.day.slice(1)} ${s.start}-${s.end} · ${s.subject}`;
}

function renderChildEditor(key) {
  const d = state.datasets[key];
  const draftNote = state.fromDraft[key]
    ? `<div class="banner">📝 Brouillon local non téléchargé. <button class="btn btn-secondary" data-action="reset-original" data-key="${key}" style="margin-left:6px;">Repartir du fichier original</button></div>`
    : '';

  const verifiedTag = d.reviewed
    ? `<span class="tag-verified">✅ Vérifié</span>`
    : `<span class="tag-verified tag-unverified">⚠️ À vérifier</span>`;

  let daysHtml = '';
  for (const day of EDITOR_DAYS) {
    const slots = d.slots.filter((s) => s.day === day).sort((a, b) => a.start.localeCompare(b.start));
    if (day === 'samedi' && slots.length === 0) continue; // pas de samedi si non utilisé
    daysHtml += `<div class="section-title">${day}</div>`;
    if (slots.length === 0) {
      daysHtml += `<div class="empty-state" style="padding:8px;">Aucun cours</div>`;
    }
    for (const s of slots) {
      daysHtml += `
        <div class="list-item">
          <div>
            <strong>${s.start}–${s.end} ${s.subject}</strong>${s.group ? ` <span class="slot-group">${s.group}</span>` : ''}<br>
            <span style="font-size:13px;color:var(--text-muted);">${[s.teacher, s.room].filter(Boolean).join(' · ') || '—'}</span>
            ${s.from ? `<br><span style="font-size:12px;color:var(--accent);">à partir du ${s.from.split('-').reverse().join('/')}</span>` : ''}
          </div>
          <div class="list-item-actions">
            <button data-action="edit-slot" data-key="${key}" data-id="${s.id}" title="Modifier">✎</button>
            <button data-action="delete-slot" data-key="${key}" data-id="${s.id}" title="Supprimer">🗑</button>
          </div>
        </div>`;
    }
  }

  const editing = state.editingSlotId ? d.slots.find((s) => s.id === state.editingSlotId) : null;

  const exceptions = d.exceptions || [];
  let excHtml = exceptions.length === 0
    ? `<div class="empty-state" style="padding:8px;">Aucune exception ponctuelle</div>`
    : '';
  for (const ex of exceptions) {
    const desc = ex.cancel
      ? `Cours annulé le ${ex.date}`
      : `${ex.date} ${ex.start || ''}-${ex.end || ''} · ${ex.subject}`;
    excHtml += `
      <div class="list-item">
        <div>${desc}</div>
        <div class="list-item-actions">
          <button data-action="delete-exception" data-key="${key}" data-id="${ex.id}" title="Supprimer">🗑</button>
        </div>
      </div>`;
  }

  const slotOptions = d.slots
    .slice()
    .sort((a, b) => (a.day + a.start).localeCompare(b.day + b.start))
    .map((s) => `<option value="${s.id}">${slotLabel(s)}</option>`)
    .join('');

  return `
    ${draftNote}
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
      ${verifiedTag}
      <button class="btn btn-secondary" data-action="toggle-reviewed" data-key="${key}">${d.reviewed ? 'Marquer à vérifier' : 'Marquer comme vérifié'}</button>
    </div>

    ${daysHtml}

    <details ${editing ? 'open' : ''}>
      <summary class="section-title" style="cursor:pointer;">${editing ? '✎ Modifier ce cours' : '+ Ajouter un cours régulier'}</summary>
      <form id="addSlotForm" data-key="${key}">
        <input type="hidden" name="id" value="${editing ? editing.id : ''}">
        <div class="field">
          <label>Jour</label>
          <select name="day">
            ${EDITOR_DAYS.map((day) => `<option value="${day}" ${editing && editing.day === day ? 'selected' : ''}>${day}</option>`).join('')}
          </select>
        </div>
        <div class="row-2">
          <div class="field"><label>Début</label><input type="time" name="start" value="${editing ? editing.start : '08:00'}" required></div>
          <div class="field"><label>Fin</label><input type="time" name="end" value="${editing ? editing.end : '09:00'}" required></div>
        </div>
        <div class="field"><label>Matière</label><input type="text" name="subject" value="${editing ? editing.subject : ''}" required></div>
        <div class="row-2">
          <div class="field"><label>Professeur</label><input type="text" name="teacher" value="${editing ? editing.teacher || '' : ''}"></div>
          <div class="field"><label>Salle</label><input type="text" name="room" value="${editing ? editing.room || '' : ''}"></div>
        </div>
        <div class="field"><label>Groupe (optionnel, ex. Q1)</label><input type="text" name="group" value="${editing ? editing.group || '' : ''}"></div>
        <div class="field"><label>Actif à partir du (optionnel — laisser vide si toutes les semaines)</label><input type="date" name="from" value="${editing ? editing.from || '' : ''}"></div>
        <button type="submit" class="btn btn-primary btn-block">${editing ? 'Enregistrer les modifications' : 'Ajouter ce cours'}</button>
        ${editing ? `<button type="button" class="btn btn-secondary btn-block" data-action="cancel-edit-slot" style="margin-top:8px;">Annuler la modification</button>` : ''}
      </form>
    </details>

    <div class="section-title" style="margin-top:24px;">Exceptions ponctuelles</div>
    ${excHtml}

    <details>
      <summary class="section-title" style="cursor:pointer;">+ Annuler un cours à une date précise</summary>
      <form id="cancelExceptionForm" data-key="${key}">
        <div class="field"><label>Date</label><input type="date" name="date" required></div>
        <div class="field"><label>Cours à annuler</label><select name="cancel" required>${slotOptions}</select></div>
        <button type="submit" class="btn btn-primary btn-block">Enregistrer l'annulation</button>
      </form>
    </details>

    <details>
      <summary class="section-title" style="cursor:pointer;">+ Ajouter un cours ponctuel (une seule date)</summary>
      <form id="addExceptionForm" data-key="${key}">
        <div class="field"><label>Date</label><input type="date" name="date" required></div>
        <div class="row-2">
          <div class="field"><label>Début</label><input type="time" name="start" value="08:00" required></div>
          <div class="field"><label>Fin</label><input type="time" name="end" value="09:00" required></div>
        </div>
        <div class="field"><label>Intitulé</label><input type="text" name="subject" placeholder="ex. Sortie scolaire" required></div>
        <div class="row-2">
          <div class="field"><label>Professeur / accompagnateur</label><input type="text" name="teacher"></div>
          <div class="field"><label>Lieu / salle</label><input type="text" name="room"></div>
        </div>
        <button type="submit" class="btn btn-primary btn-block">Ajouter cet événement</button>
      </form>
    </details>

    <button class="btn btn-primary btn-block" style="margin-top:24px;" data-action="download" data-key="${key}">⬇️ Télécharger ${FILES[key].split('/').pop()}</button>
    <p style="font-size:12.5px;color:var(--text-muted);text-align:center;margin-top:8px;">
      Puis remplacez ce fichier dans <code>data/</code> via FTP.
    </p>
  `;
}

function renderFamilleEditor() {
  const d = state.datasets.famille;
  const draftNote = state.fromDraft.famille
    ? `<div class="banner">📝 Brouillon local non téléchargé. <button class="btn btn-secondary" data-action="reset-original" data-key="famille" style="margin-left:6px;">Repartir du fichier original</button></div>`
    : '';

  const editing = state.editingEventId ? d.events.find((e) => e.id === state.editingEventId) : null;

  let listHtml = '';
  const events = (d.events || []).slice().sort((a, b) => (a.date + (a.start || '')).localeCompare(b.date + (b.start || '')));
  if (events.length === 0) listHtml = `<div class="empty-state">Aucun événement</div>`;
  for (const ev of events) {
    listHtml += `
      <div class="list-item">
        <div>
          <strong>${ev.date}${ev.start ? ' · ' + ev.start : ''}</strong><br>
          ${ev.title}${ev.who ? ` <span style="color:var(--text-muted);">(${ev.who})</span>` : ''}
        </div>
        <div class="list-item-actions">
          <button data-action="edit-event" data-id="${ev.id}" title="Modifier">✎</button>
          <button data-action="delete-event" data-id="${ev.id}" title="Supprimer">🗑</button>
        </div>
      </div>`;
  }

  return `
    ${draftNote}
    <div class="section-title">Événements famille</div>
    ${listHtml}

    <details open>
      <summary class="section-title" style="cursor:pointer;">${editing ? '✎ Modifier l\'événement' : '+ Ajouter un événement'}</summary>
      <form id="addEventForm">
        <input type="hidden" name="id" value="${editing ? editing.id : ''}">
        <div class="row-2">
          <div class="field"><label>Date</label><input type="date" name="date" value="${editing ? editing.date : ''}" required></div>
          <div class="field"><label>Heure (optionnel)</label><input type="time" name="start" value="${editing ? editing.start || '' : ''}"></div>
        </div>
        <div class="field"><label>Titre</label><input type="text" name="title" value="${editing ? editing.title : ''}" placeholder="ex. RDV dentiste" required></div>
        <div class="row-2">
          <div class="field"><label>Concerne</label><input type="text" name="who" value="${editing ? editing.who || '' : ''}" placeholder="ex. Sören"></div>
          <div class="field"><label>Lieu (optionnel)</label><input type="text" name="location" value="${editing ? editing.location || '' : ''}"></div>
        </div>
        <button type="submit" class="btn btn-primary btn-block">${editing ? 'Enregistrer' : 'Ajouter'}</button>
        ${editing ? `<button type="button" class="btn btn-secondary btn-block" data-action="cancel-edit-event" style="margin-top:8px;">Annuler</button>` : ''}
      </form>
    </details>

    <button class="btn btn-primary btn-block" style="margin-top:24px;" data-action="download" data-key="famille">⬇️ Télécharger family.json</button>
    <p style="font-size:12.5px;color:var(--text-muted);text-align:center;margin-top:8px;">
      Puis remplacez ce fichier dans <code>data/</code> via FTP.
    </p>
  `;
}

async function render() {
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === state.activeTab));
  await ensureLoaded(state.activeTab);
  const main = document.getElementById('main');
  main.innerHTML = state.activeTab === 'famille' ? renderFamilleEditor() : renderChildEditor(state.activeTab);
}

document.getElementById('tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-tab]');
  if (!btn) return;
  state.activeTab = btn.dataset.tab;
  state.editingSlotId = null;
  state.editingEventId = null;
  render();
});

document.getElementById('main').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  const key = btn.dataset.key || state.activeTab;

  if (action === 'toggle-reviewed') {
    state.datasets[key].reviewed = !state.datasets[key].reviewed;
    saveDraft(key);
    render();
  } else if (action === 'delete-slot') {
    if (!confirm('Supprimer ce cours ?')) return;
    state.datasets[key].slots = state.datasets[key].slots.filter((s) => s.id !== btn.dataset.id);
    saveDraft(key);
    render();
  } else if (action === 'edit-slot') {
    state.editingSlotId = btn.dataset.id;
    render();
  } else if (action === 'cancel-edit-slot') {
    state.editingSlotId = null;
    render();
  } else if (action === 'delete-exception') {
    state.datasets[key].exceptions = state.datasets[key].exceptions.filter((ex) => ex.id !== btn.dataset.id);
    saveDraft(key);
    render();
  } else if (action === 'delete-event') {
    if (!confirm('Supprimer cet événement ?')) return;
    state.datasets.famille.events = state.datasets.famille.events.filter((ev) => ev.id !== btn.dataset.id);
    saveDraft('famille');
    render();
  } else if (action === 'edit-event') {
    state.editingEventId = btn.dataset.id;
    render();
  } else if (action === 'cancel-edit-event') {
    state.editingEventId = null;
    render();
  } else if (action === 'download') {
    download(key);
  } else if (action === 'reset-original') {
    await resetToOriginal(key);
  }
});

document.getElementById('main').addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.target;
  const fd = new FormData(form);
  if (form.getAttribute('id') === 'addSlotForm') {
    const key = form.dataset.key;
    const id = fd.get('id');
    const slot = {
      id: id || uid('slot'),
      day: fd.get('day'),
      start: fd.get('start'),
      end: fd.get('end'),
      subject: fd.get('subject').trim(),
      teacher: fd.get('teacher').trim(),
      room: fd.get('room').trim(),
    };
    const group = fd.get('group').trim();
    if (group) slot.group = group;
    const from = fd.get('from');
    if (from) slot.from = from;
    const slots = state.datasets[key].slots;
    if (id) {
      const idx = slots.findIndex((s) => s.id === id);
      if (idx >= 0) slots[idx] = slot;
    } else {
      slots.push(slot);
    }
    state.editingSlotId = null;
    saveDraft(key);
    render();
  }

  if (form.getAttribute('id') === 'cancelExceptionForm') {
    const key = form.dataset.key;
    state.datasets[key].exceptions = state.datasets[key].exceptions || [];
    state.datasets[key].exceptions.push({ id: uid('exc'), date: fd.get('date'), cancel: fd.get('cancel') });
    saveDraft(key);
    render();
  }

  if (form.getAttribute('id') === 'addExceptionForm') {
    const key = form.dataset.key;
    state.datasets[key].exceptions = state.datasets[key].exceptions || [];
    state.datasets[key].exceptions.push({
      id: uid('exc'),
      date: fd.get('date'),
      start: fd.get('start'),
      end: fd.get('end'),
      subject: fd.get('subject').trim(),
      teacher: fd.get('teacher').trim(),
      room: fd.get('room').trim(),
    });
    saveDraft(key);
    render();
  }

  if (form.getAttribute('id') === 'addEventForm') {
    const id = fd.get('id');
    const event = {
      id: id || uid('evt'),
      date: fd.get('date'),
      start: fd.get('start') || '',
      title: fd.get('title').trim(),
      who: fd.get('who').trim(),
      location: fd.get('location').trim(),
    };
    const events = state.datasets.famille.events;
    if (id) {
      const idx = events.findIndex((ev) => ev.id === id);
      if (idx >= 0) events[idx] = event;
    } else {
      events.push(event);
    }
    state.editingEventId = null;
    saveDraft('famille');
    render();
  }
});

render();
