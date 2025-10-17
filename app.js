import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function renderEventPicker(preselectId) {
  els.eventPicker.innerHTML = '';
  state.events.forEach((ev) => {
    const label = ev.name || `Event ${ev.id}`;
    const chip = document.createElement('button');
    chip.className = 'chip';
    chip.type = 'button';
    chip.textContent = label;
    chip.title = label;
    chip.addEventListener('click', () => onSelectEvent(ev.id));
    chip.dataset.eventId = ev.id;
    if (preselectId && String(preselectId) === String(ev.id)) {
      chip.classList.add('active');
      chip.setAttribute('aria-pressed', 'true');
    } else {
      chip.setAttribute('aria-pressed', 'false');
    }
    els.eventPicker.appendChild(chip);
  });
}

async function onSelectEvent(eventId) {
  state.selectedEventId = eventId;
  highlightActiveEventChip(eventId);
  persistSelectedEvent(eventId);
  await Promise.all([
    loadSlotsForEvent(eventId),
    loadEventMemberCount(eventId),
    loadRequiredMembers(eventId),
    loadAvailabilityForUserEvent(state.selectedUserId, eventId),
    loadUnavailabilityCounts(eventId),
    loadAvailabilityCounts(eventId),
    loadUnavailableUsers(eventId),
  ]);
  renderCalendar();
  renderStatusSub();
}

function highlightActiveEventChip(eventId) {
  for (const node of els.eventPicker.querySelectorAll('.chip')) {
    const isActive = String(node.dataset.eventId) === String(eventId);
    node.classList.toggle('active', isActive);
    node.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  }
}

const state = {
  users: [],
  events: [],
  selectedUserId: null,
  selectedEventId: null,
  slotsByEventId: {},
  availabilityByKey: {},
  eventMemberCountByEventId: {},
  unavailabilityCounts: {}, // key: eventId:slotId:YYYY-MM-DD -> count of available=false
  availabilityCounts: {},   // key: eventId:slotId:YYYY-MM-DD -> count of available=true
  requiredMemberIdsByEventId: {}, // eventId -> Set(userId)
  unavailableUsersByKey: {}, // key -> Set(userId) who marked unavailable
};

const els = {
  userPicker: document.getElementById('user-picker'),
  eventPicker: document.getElementById('event-picker'),
  status: document.getElementById('status'),
  statusSub: document.getElementById('status-sub'),
  calendarWeekdays: document.getElementById('calendar-weekdays'),
  calendarGrid: document.getElementById('calendar-grid'),
};

init();

async function init() {
  const preselect = getSelectedUserFromStorageOrUrl();
  const preselectEvent = getSelectedEventFromStorageOrUrl();
  await loadUsers();
  renderUsers(preselect);
  if (preselect) {
    await onSelectUser(preselect, preselectEvent);
  } else {
    setStatus('Select your name above to view your events.');
  }
}

function getSelectedUserFromStorageOrUrl() {
  const fromUrl = new URLSearchParams(window.location.search).get('user');
  if (fromUrl) return fromUrl;
  try {
    const stored = localStorage.getItem('selectedUserId');
    return stored || null;
  } catch (_) {
    return null;
  }
}

function getSelectedEventFromStorageOrUrl() {
  const fromUrl = new URLSearchParams(window.location.search).get('event');
  if (fromUrl) return fromUrl;
  try {
    const stored = localStorage.getItem('selectedEventId');
    return stored || null;
  } catch (_) {
    return null;
  }
}

async function loadUsers() {
  setStatus('Loading users…');
  const { data, error } = await supabase
    .from('users')
    .select('id, name')
    .order('name', { ascending: true });
  if (error) {
    console.error(error);
    setStatus('Failed to load users. Check Supabase config and policies.');
    return;
  }
  state.users = data || [];
}

function renderUsers(preselectId) {
  els.userPicker.innerHTML = '';
  state.users.forEach((u) => {
    const label = u.name || `User ${u.id}`;
    const chip = document.createElement('button');
    chip.className = 'chip';
    chip.type = 'button';
    chip.textContent = label;
    chip.title = label;
    chip.addEventListener('click', () => onSelectUser(u.id));
    chip.dataset.userId = u.id;
    if (preselectId && String(preselectId) === String(u.id)) {
      chip.classList.add('active');
      chip.setAttribute('aria-pressed', 'true');
    } else {
      chip.setAttribute('aria-pressed', 'false');
    }
    els.userPicker.appendChild(chip);
  });
}

async function onSelectUser(userId, preferredEventId) {
  state.selectedUserId = userId;
  highlightActiveChip(userId);
  persistSelectedUser(userId);
  await loadEventsForUser(userId, preferredEventId);
}

function highlightActiveChip(userId) {
  for (const node of els.userPicker.querySelectorAll('.chip')) {
    const isActive = String(node.dataset.userId) === String(userId);
    node.classList.toggle('active', isActive);
    node.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  }
}

function persistSelectedUser(userId) {
  try {
    localStorage.setItem('selectedUserId', String(userId));
    const url = new URL(window.location);
    url.searchParams.set('user', String(userId));
    window.history.replaceState({}, '', url);
  } catch (_) {
    // ignore
  }
}

function persistSelectedEvent(eventId) {
  try {
    localStorage.setItem('selectedEventId', String(eventId));
    const url = new URL(window.location);
    url.searchParams.set('event', String(eventId));
    window.history.replaceState({}, '', url);
  } catch (_) {
    // ignore
  }
}

async function loadEventsForUser(userId, preferredEventId) {
  setStatus('Loading events…');

  const { data, error } = await supabase
    .from('event_members')
    .select('required, events(id, name, type, max_unavailable, created_at)')
    .eq('user', userId);

  if (error) {
    console.error(error);
    setStatus('Failed to load events. Verify RLS/policies on tables.');
    return;
  }

  const events = (data || [])
    .map((m) => m.events || m.event || null)
    .filter(Boolean);

  // Sort by created_at ascending
  events.sort((a, b) => {
    const at = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bt = b.created_at ? new Date(b.created_at).getTime() : 0;
    return at - bt;
  });

  state.events = events;
  renderEventPicker(preferredEventId);

  if (events.length === 0) {
    setStatus('No events yet for this user.');
    els.calendarWeekdays.innerHTML = '';
    els.calendarGrid.innerHTML = '';
    return;
  }

  const toSelect = (preferredEventId && events.find((e) => String(e.id) === String(preferredEventId)))
    ? preferredEventId
    : String(events[0].id);
  await onSelectEvent(toSelect);
}

function renderEventCard(ev) {
  const title = ev.name || `Event ${ev.id}`;
  const created = ev.created_at ? new Date(ev.created_at) : null;
  const when = created ? created.toLocaleString() : '';
  const type = ev.type || '';
  const min = typeof ev.min_participants === 'number' ? `Min participants: ${ev.min_participants}` : '';

  const card = document.createElement('article');
  card.className = 'card';

  const h3 = document.createElement('h3');
  h3.textContent = title;
  card.appendChild(h3);

  if (when || type || min) {
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = [when, type, min].filter(Boolean).join(' • ');
    card.appendChild(meta);
  }

  return card;
}

function emptyCard(text) {
  const div = document.createElement('div');
  div.className = 'empty';
  div.textContent = text;
  return div;
}

function setStatus(text) {
  els.status.textContent = text;
}

function renderCalendar() {
  // Weekday headers with empty gutter header
  const labels = ['Week','Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  els.calendarWeekdays.innerHTML = '';
  for (let i = 0; i < labels.length; i++) {
    const div = document.createElement('div');
    if (i === 0) {
      div.className = 'week-gutter-header';
      div.textContent = labels[i];
    } else {
      div.textContent = labels[i];
    }
    els.calendarWeekdays.appendChild(div);
  }

  // Build 5 weeks starting from the Monday of the current week
  const today = new Date();
  const startMonday = getMonday(new Date(today.getFullYear(), today.getMonth(), today.getDate()));
  const totalDays = 7 * 5;
  els.calendarGrid.innerHTML = '';

  // Render 5 rows, each with a week gutter then 7 day cells
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(startMonday);
    d.setDate(startMonday.getDate() + i);

    // Insert a week gutter at the start of each row (every 7 days)
    if (i % 7 === 0) {
      const weekStart = new Date(d);
      const weekNum = getISOWeekNumber(weekStart);
      const gutter = document.createElement('div');
      gutter.className = 'week-gutter';

      const left = document.createElement('div');
      left.className = 'week-number';
      left.textContent = `W${String(weekNum).padStart(2,'0')}`;

      const actions = document.createElement('div');
      actions.className = 'week-actions';
      const ok = document.createElement('button');
      ok.type = 'button';
      ok.className = 'week-btn ok';
      ok.setAttribute('aria-label', 'Mark entire week available');
      ok.textContent = '✓';
      const no = document.createElement('button');
      no.type = 'button';
      no.className = 'week-btn no';
      no.setAttribute('aria-label', 'Mark entire week unavailable');
      no.textContent = '✕';
      const status = getWeekStatus(weekStart);
      if (status === 'all_true') ok.classList.add('active');
      if (status === 'all_false') no.classList.add('active');

      ok.addEventListener('click', async () => {
        if (ok.classList.contains('active')) {
          await clearWeekAvailability(weekStart, true);
        } else {
          await setWeekAvailability(weekStart, true);
        }
      });
      no.addEventListener('click', async () => {
        if (no.classList.contains('active')) {
          await clearWeekAvailability(weekStart, false);
        } else {
          await setWeekAvailability(weekStart, false);
        }
      });
      actions.appendChild(ok);
      actions.appendChild(no);
      gutter.appendChild(left);
      gutter.appendChild(actions);
      els.calendarGrid.appendChild(gutter);
    }

    const cell = document.createElement('div');
    cell.className = 'day-cell';

    const header = document.createElement('div');
    header.className = 'day-header';

    const dayNum = document.createElement('div');
    dayNum.className = 'day-number';
    dayNum.textContent = String(d.getDate());

    const badge = document.createElement('div');
    badge.textContent = '';

    header.appendChild(dayNum);
    header.appendChild(badge);

    const content = document.createElement('div');
    content.className = 'day-content';

    cell.appendChild(header);
    cell.appendChild(content);

    // Past/today states
    const isPast = isPastDate(d, today);
    const isToday = sameDate(d, today);
    if (isPast) cell.classList.add('day-past');
    if (isToday) cell.classList.add('day-today');

    // Timeslots from normalized weekly_event_slot (Mon=0)
    const selectedEvent = state.events.find(e => String(e.id) === String(state.selectedEventId));
    const slots = getSlotsForDate(selectedEvent?.id, d);
    for (const s of slots) {
      // Skip slots in the past
      if (isPast) continue;

      // Skip slots that exceed event.max_unavailable, unless current user marked unavailable (to allow them to change it)
      const key = `${selectedEvent.id}:${s.id}:${toISODate(d)}`;
      const unavailableCount = state.unavailabilityCounts[key] || 0;
      const maxUnavailable = Number(selectedEvent.max_unavailable ?? 1);
      const userKey = availabilityKey(state.selectedUserId, selectedEvent.id, s.id, d);
      const userHasUnavailable = state.availabilityByKey[userKey] === false;
      if (unavailableCount > maxUnavailable && !userHasUnavailable) continue;

      // Hide if any required member has marked unavailable, except for that required user themself
      const requiredSet = state.requiredMemberIdsByEventId[selectedEvent.id] || new Set();
      const unavailableUsers = state.unavailableUsersByKey[key] || new Set();
      const someoneRequiredUnavailable = [...unavailableUsers].some(uid => requiredSet.has(uid) && String(uid) !== String(state.selectedUserId));
      if (someoneRequiredUnavailable) continue;

      const slot = document.createElement('div');
      slot.className = 'slot';
      // Highlight logic (gold or dashed hint)
      const availKey = `${selectedEvent.id}:${s.id}:${toISODate(d)}`;
      const availCount = state.availabilityCounts[availKey] || 0;
      const totalMembers = state.eventMemberCountByEventId[selectedEvent.id] || 0; // optional, if needed in future
      const requiredAvail = Math.max(0, totalMembers - maxUnavailable);
      const saved = state.availabilityByKey[availabilityKey(state.selectedUserId, selectedEvent.id, s.id, d)];
      let viabilityNote = '';
      if (totalMembers > 0 && requiredAvail > 0) {
        if (availCount >= requiredAvail) {
          slot.classList.add('slot-gold');
          viabilityNote = '🥳 Viable!';
        } else if (saved !== true && (availCount + 1 >= requiredAvail)) {
          slot.classList.add('slot-gold-hint');
          viabilityNote = '🥺 Viable with you';
        }
      }
      const left = document.createElement('div');
      left.style.display = 'flex';
      left.style.alignItems = 'center';
      left.style.gap = '6px';
      const time = document.createElement('span');
      time.className = 'slot-time';
      time.textContent = formatSlotTime(s.start_time || '');
      left.appendChild(time);

      const actions = document.createElement('div');
      actions.className = 'slot-actions';

      const okBtn = document.createElement('button');
      okBtn.className = 'slot-btn ok';
      okBtn.type = 'button';
      okBtn.setAttribute('aria-label', 'Mark available');
      okBtn.textContent = '✓';

      const noBtn = document.createElement('button');
      noBtn.className = 'slot-btn no';
      noBtn.type = 'button';
      noBtn.setAttribute('aria-label', 'Mark unavailable');
      noBtn.textContent = '✕';

      if (saved === true) okBtn.classList.add('active');
      if (saved === false) noBtn.classList.add('active');

      okBtn.addEventListener('click', async () => {
        if (okBtn.classList.contains('active')) {
          await clearAvailabilityServer(state.selectedUserId, selectedEvent.id, s.id, d);
          okBtn.classList.remove('active');
          noBtn.classList.remove('active');
          state.availabilityByKey[availabilityKey(state.selectedUserId, selectedEvent.id, s.id, d)] = undefined;
          await refreshCountsAndCalendar(selectedEvent.id);
        } else {
          await upsertAvailability(state.selectedUserId, selectedEvent.id, s.id, d, true);
          okBtn.classList.add('active');
          noBtn.classList.remove('active');
          state.availabilityByKey[availabilityKey(state.selectedUserId, selectedEvent.id, s.id, d)] = true;
          await refreshCountsAndCalendar(selectedEvent.id);
        }
      });
      noBtn.addEventListener('click', async () => {
        if (noBtn.classList.contains('active')) {
          await clearAvailabilityServer(state.selectedUserId, selectedEvent.id, s.id, d);
          noBtn.classList.remove('active');
          okBtn.classList.remove('active');
          state.availabilityByKey[availabilityKey(state.selectedUserId, selectedEvent.id, s.id, d)] = undefined;
          await refreshCountsAndCalendar(selectedEvent.id);
        } else {
          await upsertAvailability(state.selectedUserId, selectedEvent.id, s.id, d, false);
          noBtn.classList.add('active');
          okBtn.classList.remove('active');
          state.availabilityByKey[availabilityKey(state.selectedUserId, selectedEvent.id, s.id, d)] = false;
          await refreshCountsAndCalendar(selectedEvent.id);
        }
      });

      actions.appendChild(okBtn);
      actions.appendChild(noBtn);

      slot.appendChild(left);
      slot.appendChild(actions);
      if (viabilityNote) {
        const note = document.createElement('div');
        note.className = 'slot-note';
        note.textContent = viabilityNote;
        slot.appendChild(note);
      }
      content.appendChild(slot);
    }

    els.calendarGrid.appendChild(cell);
  }

  const eventName = (state.events.find(e => String(e.id) === String(state.selectedEventId)) || {}).name;
  setStatus(eventName ? `Calendar for ${eventName}` : 'Calendar');
  renderStatusSub();
}

function getISOWeekNumber(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7; // Mon=1..Sun=7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(),0,1));
  const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return weekNo;
}

function getWeekStatus(weekStartDate) {
  const selectedEvent = state.events.find(e => String(e.id) === String(state.selectedEventId));
  if (!selectedEvent) return 'mixed';
  const userId = state.selectedUserId;
  const today = new Date();
  const values = [];
  for (let offset = 0; offset < 7; offset++) {
    const day = new Date(weekStartDate);
    day.setDate(weekStartDate.getDate() + offset);
    if (isPastDate(day, today)) continue;
    const slots = getSlotsForDate(selectedEvent.id, day);
    for (const s of slots) {
      if (!isSlotVisibleForUser(selectedEvent, s, day)) continue;
      const key = availabilityKey(userId, selectedEvent.id, s.id, day);
      const v = state.availabilityByKey[key];
      values.push(v);
    }
  }
  if (values.length === 0) return 'mixed';
  const allTrue = values.every(v => v === true);
  const allFalse = values.every(v => v === false);
  if (allTrue) return 'all_true';
  if (allFalse) return 'all_false';
  return 'mixed';
}

async function setWeekAvailability(weekStartDate, available) {
  const selectedEvent = state.events.find(e => String(e.id) === String(state.selectedEventId));
  if (!selectedEvent) return;
  const userId = state.selectedUserId;
  // Iterate Mon..Sun for that week
  const ops = [];
  for (let offset = 0; offset < 7; offset++) {
    const day = new Date(weekStartDate);
    day.setDate(weekStartDate.getDate() + offset);
    // skip past days
    const today = new Date();
    if (isPastDate(day, today)) continue;
    const slots = getSlotsForDate(selectedEvent.id, day);
    for (const s of slots) {
      if (!isSlotVisibleForUser(selectedEvent, s, day)) continue;
      const key = availabilityKey(userId, selectedEvent.id, s.id, day);
      const current = state.availabilityByKey[key];
      if (current === available) continue;
      if (current === undefined) {
        ops.push(upsertAvailability(userId, selectedEvent.id, s.id, day, available));
        state.availabilityByKey[key] = available;
      } else if (current !== available) {
        ops.push(upsertAvailability(userId, selectedEvent.id, s.id, day, available));
        state.availabilityByKey[key] = available;
      }
    }
  }
  if (ops.length) await Promise.all(ops);
  await refreshCountsAndCalendar(selectedEvent.id);
}

async function clearWeekAvailability(weekStartDate, valueToClear) {
  const selectedEvent = state.events.find(e => String(e.id) === String(state.selectedEventId));
  if (!selectedEvent) return;
  const userId = state.selectedUserId;
  const ops = [];
  const today = new Date();
  for (let offset = 0; offset < 7; offset++) {
    const day = new Date(weekStartDate);
    day.setDate(weekStartDate.getDate() + offset);
    if (isPastDate(day, today)) continue;
    const slots = getSlotsForDate(selectedEvent.id, day);
    for (const s of slots) {
      if (!isSlotVisibleForUser(selectedEvent, s, day)) continue;
      const key = availabilityKey(userId, selectedEvent.id, s.id, day);
      const current = state.availabilityByKey[key];
      if (current === undefined) continue;
      if (valueToClear !== undefined && current !== valueToClear) continue;
      ops.push(clearAvailabilityServer(userId, selectedEvent.id, s.id, day));
      state.availabilityByKey[key] = undefined;
    }
  }
  if (ops.length) await Promise.all(ops);
  await refreshCountsAndCalendar(selectedEvent.id);
}

function isSlotVisibleForUser(selectedEvent, slot, dateObj) {
  const today = new Date();
  if (isPastDate(dateObj, today)) return false;
  const key = `${selectedEvent.id}:${slot.id}:${toISODate(dateObj)}`;
  const unavailableCount = state.unavailabilityCounts[key] || 0;
  const maxUnavailable = Number(selectedEvent.max_unavailable ?? 1);
  const userHasUnavailable = state.availabilityByKey[availabilityKey(state.selectedUserId, selectedEvent.id, slot.id, dateObj)] === false;
  if (unavailableCount > maxUnavailable && !userHasUnavailable) return false;
  const requiredSet = state.requiredMemberIdsByEventId[selectedEvent.id] || new Set();
  const unavailableUsers = state.unavailableUsersByKey[key] || new Set();
  const someoneRequiredUnavailable = [...unavailableUsers].some(uid => requiredSet.has(uid) && String(uid) !== String(state.selectedUserId));
  if (someoneRequiredUnavailable) return false;
  return true;
}

function getMonday(d) {
  const day = d.getDay(); // 0..6, 0=Sun
  const diff = (day === 0 ? -6 : 1 - day); // shift to Monday
  const m = new Date(d);
  m.setDate(d.getDate() + diff);
  m.setHours(0,0,0,0);
  return m;
}

function sameDate(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isPastDate(a, ref) {
  const aMid = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const rMid = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  return aMid.getTime() < rMid.getTime();
}

// Slots and availability from server
async function loadSlotsForEvent(eventId) {
  const { data, error } = await supabase
    .from('weekly_event_slot')
    .select('id, event, day_of_week, start_time, end_time, label')
    .eq('event', eventId);
  if (error) {
    console.error(error);
    state.slotsByEventId[eventId] = [];
    return;
  }
  state.slotsByEventId[eventId] = data || [];
}

async function loadAvailabilityForUserEvent(userId, eventId) {
  const { data, error } = await supabase
    .from('availability_note')
    .select('slot, date, available')
    .eq('user', userId)
    .eq('event', eventId);
  if (error) {
    console.error(error);
    state.availabilityByKey = {};
    return;
  }
  const map = {};
  for (const row of data || []) {
    const key = availabilityKey(userId, eventId, row.slot, new Date(row.date));
    map[key] = row.available;
  }
  state.availabilityByKey = map;
}

async function loadUnavailabilityCounts(eventId) {
  // aggregate count of available=false per (slot,date)
  const { data, error } = await supabase
    .from('availability_note')
    .select('slot, date, available')
    .eq('event', eventId)
    .eq('available', false);
  if (error) {
    console.error(error);
    state.unavailabilityCounts = {};
    return;
  }
  const counts = {};
  for (const row of data || []) {
    const key = `${eventId}:${row.slot}:${row.date}`;
    counts[key] = (counts[key] || 0) + 1;
  }
  state.unavailabilityCounts = counts;
}

async function loadAvailabilityCounts(eventId) {
  // aggregate count of available=true per (slot,date)
  const { data, error } = await supabase
    .from('availability_note')
    .select('slot, date, available')
    .eq('event', eventId)
    .eq('available', true);
  if (error) {
    console.error(error);
    state.availabilityCounts = {};
    return;
  }
  const counts = {};
  for (const row of data || []) {
    const key = `${eventId}:${row.slot}:${row.date}`;
    counts[key] = (counts[key] || 0) + 1;
  }
  state.availabilityCounts = counts;
}

async function loadRequiredMembers(eventId) {
  const { data, error } = await supabase
    .from('event_members')
    .select('user, required')
    .eq('event', eventId)
    .eq('required', true);
  if (error) {
    console.error(error);
    state.requiredMemberIdsByEventId[eventId] = new Set();
    return;
  }
  state.requiredMemberIdsByEventId[eventId] = new Set((data || []).map(r => r.user));
}

async function loadUnavailableUsers(eventId) {
  const { data, error } = await supabase
    .from('availability_note')
    .select('user, slot, date, available')
    .eq('event', eventId)
    .eq('available', false);
  if (error) {
    console.error(error);
    state.unavailableUsersByKey = {};
    return;
  }
  const map = {};
  for (const row of data || []) {
    const key = `${eventId}:${row.slot}:${row.date}`;
    if (!map[key]) map[key] = new Set();
    map[key].add(row.user);
  }
  state.unavailableUsersByKey = map;
}

async function loadEventMemberCount(eventId) {
  const { count, error } = await supabase
    .from('event_members')
    .select('*', { count: 'exact', head: true })
    .eq('event', eventId);
  if (error) {
    console.error(error);
    state.eventMemberCountByEventId[eventId] = 0;
    return;
  }
  state.eventMemberCountByEventId[eventId] = count || 0;
}

async function upsertAvailability(userId, eventId, slotId, dateObj, available) {
  const dateStr = toISODate(dateObj);
  const { error } = await supabase
    .from('availability_note')
    .upsert({ user: userId, event: eventId, slot: slotId, date: dateStr, available }, { onConflict: 'user,event,slot,date' });
  if (error) console.error(error);
}

async function clearAvailabilityServer(userId, eventId, slotId, dateObj) {
  const dateStr = toISODate(dateObj);
  const { error } = await supabase
    .from('availability_note')
    .delete()
    .match({ user: userId, event: eventId, slot: slotId, date: dateStr });
  if (error) console.error(error);
}

function getSlotsForDate(eventId, date) {
  if (!eventId) return [];
  const all = state.slotsByEventId[eventId] || [];
  const weekdayMonZero = (date.getDay() + 6) % 7; // Mon=0
  return all
    .filter(s => Number(s.day_of_week) === Number(weekdayMonZero))
    .sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)));
}

function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
}

function availabilityKey(userId, eventId, slotId, dateObj) {
  const dateStr = toISODate(dateObj);
  return `${userId}:${eventId}:${slotId}:${dateStr}`;
}

function formatSlotTime(t) {
  // Expect 'HH:MM' or 'HH:MM:SS' from database. Return 'HH:MM'.
  if (!t) return '';
  const parts = String(t).split(':');
  if (parts.length >= 2) return `${parts[0].padStart(2,'0')}:${parts[1].padStart(2,'0')}`;
  return String(t);
}

function renderStatusSub() {
  const ev = state.events.find(e => String(e.id) === String(state.selectedEventId));
  if (!ev) {
    els.statusSub.textContent = '';
    return;
  }
  const totalMembers = state.eventMemberCountByEventId[ev.id] || 0;
  const maxUnavailable = Number(ev.max_unavailable ?? 1);
  const requiredAvail = Math.max(0, totalMembers - maxUnavailable);

  // Required members list (names if available in state.users)
  const reqSet = state.requiredMemberIdsByEventId[ev.id] || new Set();
  const names = [];
  for (const uid of reqSet) {
    const u = state.users.find(x => String(x.id) === String(uid));
    names.push(u?.name || `User ${uid}`);
  }
  const requiredText = names.length ? `required: ${names.join(', ')}` : 'required: none';

  els.statusSub.textContent = `Current viability threshold: ${requiredAvail}/${totalMembers} • ${requiredText}`;
}

async function refreshCountsAndCalendar(eventId) {
  await Promise.all([
    loadUnavailabilityCounts(eventId),
    loadAvailabilityCounts(eventId),
    loadUnavailableUsers(eventId),
  ]);
  renderCalendar();
  renderStatusSub();
}


