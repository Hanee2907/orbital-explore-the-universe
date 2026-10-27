import './styles/main.css';
import { PLANETS, SUN } from './data/solarSystem';
import { MAX_COMPARE, MissionStore } from './lib/missions';
import { getWorld } from './lib/worlds';
import { SPEEDS, Universe } from './scene/Universe';
import { $, $$, announce, orbStyle, toast } from './ui/dom';
import { ExoCatalog } from './ui/exoCatalog';
import { MissionsDrawer } from './ui/missions';
import { CommandPanel } from './ui/panel';

type View = 'explore' | 'exoplanets' | 'missions';

const storage = (() => {
  try {
    const s = window.localStorage;
    s.getItem('x');
    return s;
  } catch {
    return null;
  }
})();
const store = new MissionStore(storage);

const tooltip = $('#tooltip');
let pointer = { x: 0, y: 0 };
window.addEventListener('pointermove', (e) => {
  pointer = { x: e.clientX, y: e.clientY };
  if (!tooltip.hidden) tooltip.style.transform = `translate(${pointer.x + 14}px, ${pointer.y + 14}px)`;
});
tooltip.style.left = tooltip.style.top = '0';

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
let lastDate = '';

const universe = new Universe($('#viewport'), {
  onSelect: (id) => (id ? selectWorld(id) : closePanel()),
  onHover: (name) => {
    tooltip.hidden = !name;
    if (name) {
      tooltip.textContent = name;
      tooltip.style.transform = `translate(${pointer.x + 14}px, ${pointer.y + 14}px)`;
    }
  },
  onTick: (d) => {
    const s = universe.inExoSystem ? 'System clock' : dateFmt.format(d);
    if (s !== lastDate) {
      lastDate = s;
      $('#sim-date').textContent = s;
    }
  },
  onFlyModeChange: (on) => {
    $('#t-fly').setAttribute('aria-pressed', String(on));
    $('#fly-hud').hidden = !on;
    document.body.classList.toggle('flying', on);
    if (on) {
      closePanel(false);
      toast('Free flight engaged — WASD to move, drag to look, Esc to exit');
    }
  },
});

const panel = new CommandPanel($('#panel'), store, {
  onClose: () => closePanel(),
  onViewSystem: (host, id) => void openSystem(host, id),
  onFocus: (id) => selectWorld(id),
  onOpenCompare: () => missions.openCompare(),
  isSystemOpen: (host) => universe.exoHost === host,
});

const catalog = new ExoCatalog(
  $('#exo-drawer'),
  store,
  (id) => selectWorld(id),
  () => setView('explore'),
);

const missions = new MissionsDrawer($('#missions-drawer'), $('#compare-modal'), store, {
  onPick: (id) => selectWorld(id),
  onClose: () => setView('explore'),
});

// Keep the focused world centred in the uncovered part of the screen.
function updateInsets() {
  const drawer = [$('#exo-drawer'), $('#missions-drawer')].find((d) => !d.hidden);
  const p = $('#panel');
  const sheet = drawer ?? (p.hidden ? null : p);
  document.body.classList.toggle('sheet-open', !!sheet);
  if (isNarrow()) {
    const top = sheet ? sheet.getBoundingClientRect().top : window.innerHeight;
    return universe.setInsets(0, 0, Math.max(0, window.innerHeight - top - 40));
  }
  const left = drawer ? drawer.getBoundingClientRect().right : 0;
  const right = p.hidden ? 0 : window.innerWidth - p.getBoundingClientRect().left;
  universe.setInsets(left, right);
}
new MutationObserver(updateInsets).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['hidden'] });
window.addEventListener('resize', updateInsets);

// ---------- dock ----------

const dock = $('#dock');
dock.innerHTML = [SUN, ...PLANETS]
  .map(
    (w, i) =>
      `<button type="button" class="dock-item" data-world="${w.id}" style="${orbStyle(w.color)}" aria-label="${w.name} (key ${i})"><span class="orb" aria-hidden="true"></span>${w.name}<kbd>${i}</kbd></button>`,
  )
  .join('');
dock.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-world]');
  if (b) selectWorld(b.dataset.world!);
});

function syncDock(id: string | null) {
  $$('.dock-item', dock).forEach((b) => b.classList.toggle('active', b.dataset.world === id));
  dock.hidden = universe.inExoSystem;
}

// ---------- views & selection ----------

let view: View = 'explore';

function setView(v: View) {
  view = v;
  $$('.tab').forEach((t) => {
    const on = t.dataset.view === v;
    t.classList.toggle('active', on);
    t.setAttribute('aria-pressed', String(on));
  });
  if (v === 'exoplanets') {
    missions.close();
    catalog.open();
  } else if (v === 'missions') {
    catalog.close();
    missions.open();
  } else {
    catalog.close();
    missions.close();
  }
  // Panels share the bottom of the screen on phones; keep only one open.
  if (isNarrow() && v !== 'explore') closePanel(false);
  writeHash();
}

const isNarrow = () => window.matchMedia('(max-width: 900px)').matches;

function selectWorld(id: string) {
  const w = getWorld(id);
  if (!w) return;
  if (w.kind === 'exoplanet' && universe.exoHost !== w.parent) {
    // Show the data immediately; the 3D system is one click away (or already loaded).
    if (!universe.inExoSystem) {
      showPanel(id);
      return;
    }
    void openSystem(w.parent, id);
    return;
  }
  if (w.kind !== 'exoplanet' && universe.inExoSystem && !id.startsWith('star-')) {
    universe.leaveExoSystem(false);
    onSystemChange();
  }
  universe.focus(id);
  showPanel(id);
}

function showPanel(id: string) {
  const w = getWorld(id) ?? universe.findBody(id)?.world;
  if (!w) return;
  if (isNarrow()) {
    catalog.close();
    missions.close();
    view = 'explore';
    $$('.tab').forEach((t) => {
      t.classList.toggle('active', t.dataset.view === 'explore');
      t.setAttribute('aria-pressed', String(t.dataset.view === 'explore'));
    });
  }
  panel.show(w);
  catalog.setActive(w.kind === 'exoplanet' ? w.id : null);
  syncDock(id);
  writeHash();
}

function closePanel(resetCamera = false) {
  panel.hide();
  catalog.setActive(null);
  syncDock(null);
  if (resetCamera) universe.overview();
  writeHash();
}

async function openSystem(host: string, focusId?: string) {
  await universe.enterExoSystem(host, focusId?.startsWith('star-') ? undefined : focusId);
  onSystemChange();
  if (focusId && !focusId.startsWith('star-')) showPanel(focusId);
  announce(`Entered the ${host} system`);
}

function onSystemChange() {
  const host = universe.exoHost;
  $('#system-banner').hidden = !host;
  $('#system-name').textContent = host ?? '';
  syncDock(panel.world?.id ?? null);
  writeHash();
}

$('#leave-system').addEventListener('click', () => {
  universe.leaveExoSystem();
  closePanel();
  onSystemChange();
});

// ---------- top bar ----------

$$('.tab').forEach((t) =>
  t.addEventListener('click', () => {
    const v = t.dataset.view as View;
    setView(view === v && v !== 'explore' ? 'explore' : v);
  }),
);

$('#brand').addEventListener('click', () => {
  if (universe.inExoSystem) {
    universe.leaveExoSystem();
    onSystemChange();
  } else universe.overview();
  closePanel();
  setView('explore');
});

function renderSpeed() {
  const s = SPEEDS[universe.speedIndex];
  const label = s === 0 ? 'Paused' : s < 1 ? `1 s = ${Math.round(s * 24)} h` : `1 s = ${s} day${s === 1 ? '' : 's'}`;
  $('#sim-speed').textContent = label;
  $('#pause').classList.toggle('paused', s === 0);
  $('#pause').setAttribute('aria-label', s === 0 ? 'Play' : 'Pause');
}

let resumeIndex = universe.speedIndex;
function changeSpeed(delta: number) {
  universe.speedIndex = Math.max(1, Math.min(SPEEDS.length - 1, (universe.speedIndex || resumeIndex) + delta));
  renderSpeed();
}
function togglePause() {
  if (universe.speedIndex === 0) universe.speedIndex = resumeIndex;
  else {
    resumeIndex = universe.speedIndex;
    universe.speedIndex = 0;
  }
  renderSpeed();
}
$('#slower').addEventListener('click', () => changeSpeed(-1));
$('#faster').addEventListener('click', () => changeSpeed(1));
$('#pause').addEventListener('click', togglePause);
$('#time-readout').addEventListener('click', () => {
  universe.resetToToday();
  toast('Clock reset to today — planets are where they are right now');
});

function toggle(btnId: string, key: 'showOrbits' | 'showLabels') {
  universe[key] = !universe[key];
  $(btnId).setAttribute('aria-pressed', String(universe[key]));
  universe.applyToggles();
}
$('#t-orbits').addEventListener('click', () => toggle('#t-orbits', 'showOrbits'));
$('#t-labels').addEventListener('click', () => toggle('#t-labels', 'showLabels'));
$('#t-fly').addEventListener('click', () => universe.setFlyMode(!universe.flyMode));
$('#t-home').addEventListener('click', () => {
  closePanel();
  universe.overview();
});

const help = $('#help');
$('#t-help').addEventListener('click', () => {
  help.hidden = false;
  $<HTMLElement>('[data-close]', help).focus();
});
help.addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  if (t === help || t.closest('[data-close]')) help.hidden = true;
});

$$<HTMLButtonElement>('[data-thrust]').forEach((b) => {
  const key = b.dataset.thrust!;
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    universe.setThrust(key, true);
  });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => universe.setThrust(key, false));
});

function updateBadge() {
  const s = store.get();
  const n = s.favourites.length + s.compare.length + s.collections.length;
  const badge = $('#missions-badge');
  badge.hidden = n === 0;
  badge.textContent = String(s.compare.length || s.favourites.length || s.collections.length);
  badge.title = `${s.favourites.length} favourites · ${s.compare.length} comparing · ${s.collections.length} missions`;
}
store.subscribe(updateBadge);
updateBadge();

// ---------- keyboard ----------

const ORDER = [SUN, ...PLANETS].map((w) => w.id);
window.addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement;
  if (t.closest('input, textarea, select, [contenteditable]') || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'Escape') {
    if (!help.hidden) help.hidden = true;
    else if (missions.compareOpen) missions.closeCompare();
    else if (universe.flyMode) universe.setFlyMode(false);
    else if (panel.isOpen) closePanel();
    else if (view !== 'explore') setView('explore');
    return;
  }
  if (universe.flyMode) return;
  if (!help.hidden || missions.compareOpen) return;
  const k = e.key.toLowerCase();
  if (/^[0-8]$/.test(k) && !t.closest('[role=tablist]')) {
    selectWorld(ORDER[Number(k)]);
  } else if (k === ' ' && !t.closest('button, a')) {
    e.preventDefault();
    togglePause();
  } else if (k === '+' || k === '=') changeSpeed(1);
  else if (k === '-' || k === '_') changeSpeed(-1);
  else if (k === 'f') universe.setFlyMode(true);
  else if (k === 'o') $('#t-orbits').click();
  else if (k === 'l') $('#t-labels').click();
  else if (k === 'h') $('#t-home').click();
  else if (k === 'x') {
    e.preventDefault();
    setView(view === 'exoplanets' ? 'explore' : 'exoplanets');
    if (view === 'exoplanets') catalog.focusSearch();
  } else if (k === 'm') setView(view === 'missions' ? 'explore' : 'missions');
  else if (k === '?') $('#t-help').click();
});

// ---------- deep links: #/world/mars · #/system/TRAPPIST-1/exo-trappist-1-e · #/compare/earth,mars · ?view=exoplanets ----------

let restoring = false;
function writeHash() {
  if (restoring) return;
  const host = universe.exoHost;
  const w = panel.world;
  let h = '#/';
  if (host) h = `#/system/${encodeURIComponent(host)}${w ? `/${w.id}` : ''}`;
  else if (w) h = `#/world/${w.id}`;
  if (view !== 'explore') h += `?view=${view}`;
  if (location.hash !== h) history.replaceState(null, '', h);
}

async function readHash() {
  restoring = true;
  const [path, query] = location.hash.replace(/^#\/?/, '').split('?');
  const parts = path.split('/').map(decodeURIComponent);
  const v = new URLSearchParams(query).get('view') as View | null;
  try {
    if (parts[0] === 'world' && parts[1] && getWorld(parts[1])) {
      const w = getWorld(parts[1])!;
      if (w.kind === 'exoplanet') await openSystem(w.parent, w.id);
      else selectWorld(parts[1]);
    } else if (parts[0] === 'system' && parts[1]) {
      await openSystem(parts[1], parts[2]);
    }
    if (v === 'exoplanets' || v === 'missions') setView(v);
    if (parts[0] === 'compare') {
      // #/compare/earth,mars,exo-kepler-452-b — shareable comparison links.
      const ids = (parts[1] ?? '').split(',').filter((id) => getWorld(id));
      if (ids.length) store.update((s) => ({ ...s, compare: [...new Set(ids)].slice(0, MAX_COMPARE) }));
      missions.openCompare();
    }
  } finally {
    restoring = false;
    writeHash();
  }
}

window.addEventListener('hashchange', () => void readHash());

// ---------- boot ----------

renderSpeed();
const fill = $('#loader-fill');
const ltext = $('#loader-text');
universe
  .init((f, label) => {
    fill.style.width = `${Math.round(f * 100)}%`;
    ltext.textContent = label;
  })
  .then(async () => {
    universe.overview(true);
    $('#loader').classList.add('done');
    setTimeout(() => $('#loader').remove(), 900);
    await readHash();
  })
  .catch((err) => {
    console.error(err);
    ltext.textContent = 'WebGL is unavailable on this device — the 3D view could not start.';
  });

// Expose for debugging and automated checks.
(window as unknown as { orbital: unknown }).orbital = { universe, store, selectWorld, setView };
