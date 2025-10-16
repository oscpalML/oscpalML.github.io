import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const state = {
  users: [],
  selectedUserId: null,
};

const els = {
  userPicker: document.getElementById('user-picker'),
  status: document.getElementById('status'),
  events: document.getElementById('events'),
};

init();

async function init() {
  const preselect = getSelectedUserFromStorageOrUrl();
  await loadUsers();
  renderUsers(preselect);
  if (preselect) {
    await onSelectUser(preselect);
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
    chip.textContent = label;
    chip.title = label;
    chip.addEventListener('click', () => onSelectUser(u.id));
    chip.dataset.userId = u.id;
    if (preselectId && String(preselectId) === String(u.id)) {
      chip.classList.add('active');
    }
    els.userPicker.appendChild(chip);
  });
}

async function onSelectUser(userId) {
  state.selectedUserId = userId;
  highlightActiveChip(userId);
  persistSelectedUser(userId);
  await loadEventsForUser(userId);
}

function highlightActiveChip(userId) {
  for (const node of els.userPicker.querySelectorAll('.chip')) {
    node.classList.toggle('active', String(node.dataset.userId) === String(userId));
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

async function loadEventsForUser(userId) {
  setStatus('Loading events…');
  els.events.innerHTML = '';

  // Join event_members (user,event) to events(id). Your columns are user and event.
  const { data, error } = await supabase
    .from('event_members')
    .select('required, events(id, name, type, min_participants, created_at)')
    .eq('user', userId);

  if (error) {
    console.error(error);
    setStatus('Failed to load events. Verify RLS/policies on tables.');
    return;
  }

  const events = (data || [])
    .map((m) => m.events || m.event || null)
    .filter(Boolean);

  if (events.length === 0) {
    setStatus('No events yet for this user.');
    els.events.innerHTML = '';
    els.events.appendChild(emptyCard('No events found'));
    return;
  }

  // Sort by created_at ascending
  events.sort((a, b) => {
    const at = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bt = b.created_at ? new Date(b.created_at).getTime() : 0;
    return at - bt;
  });

  els.events.innerHTML = '';
  for (const ev of events) {
    els.events.appendChild(renderEventCard(ev));
  }
  setStatus(`${events.length} event${events.length === 1 ? '' : 's'} loaded.`);
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

// no time range formatter needed for current schema


