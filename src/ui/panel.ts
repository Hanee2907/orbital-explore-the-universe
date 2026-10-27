import type { World } from '../data/types';
import { type MissionStore, MAX_COMPARE, createCollection, toggleCompare, toggleFavourite, toggleInCollection } from '../lib/missions';
import { EARTH, fmt, fmtDistance, fmtDuration, fmtTemp, fmtYear, getWorld, kindLabel } from '../lib/worlds';
import { earthRatioChart, sizeLineupChart } from './charts';
import { $, $$, ICONS, announce, esc, toast } from './dom';

type Tab = 'overview' | 'compare' | 'discovery' | 'sources';

export interface PanelHandlers {
  onClose(): void;
  onViewSystem(host: string, worldId: string): void;
  onFocus(worldId: string): void;
  onOpenCompare(): void;
  isSystemOpen(host: string): boolean;
}

const vsEarth = (v: number | null, e: number | null, label = '× Earth') =>
  v != null && e ? `<span class="vs">${fmt(v / e)} ${label}</span>` : '<span class="vs">&nbsp;</span>';

export class CommandPanel {
  world: World | null = null;
  private tab: Tab = 'overview';
  private menuOpen = false;

  constructor(
    private el: HTMLElement,
    private store: MissionStore,
    private h: PanelHandlers,
  ) {
    store.subscribe(() => this.world && this.renderActions());
    document.addEventListener('pointerdown', (e) => {
      if (this.menuOpen && !(e.target as HTMLElement).closest('.menu')) this.toggleMenu(false);
    });
  }

  get isOpen() {
    return !this.el.hidden;
  }

  show(world: World) {
    const changed = this.world?.id !== world.id;
    this.world = world;
    this.el.hidden = false;
    this.el.style.setProperty('--accent-w', world.color);
    if (changed) this.menuOpen = false;
    this.render();
    announce(`${world.name} selected. ${kindLabel(world)}.`);
  }

  hide() {
    this.el.hidden = true;
    this.world = null;
  }

  private render() {
    const w = this.world!;
    this.el.innerHTML = `
      <div class="grabber" aria-hidden="true"></div>
      <header class="panel-hero">
        <span class="eyebrow mono kind">${esc(kindLabel(w))}</span>
        <h2 id="panel-title">${esc(w.name)}</h2>
        <button type="button" class="icon-btn panel-close" data-act="close" aria-label="Close command panel">${ICONS.close}</button>
        <p class="panel-summary">${esc(w.summary)}</p>
        <div class="panel-actions" id="panel-actions"></div>
      </header>
      <div class="subtabs" role="tablist" aria-label="${esc(w.name)} data">
        ${(['overview', 'compare', 'discovery', 'sources'] as Tab[])
          .map(
            (t) =>
              `<button type="button" role="tab" class="subtab" id="tab-${t}" data-tab="${t}" aria-controls="tabpanel" aria-selected="${t === this.tab}" tabindex="${t === this.tab ? 0 : -1}">${t[0].toUpperCase() + t.slice(1)}</button>`,
          )
          .join('')}
      </div>
      <div class="sheet-body" id="tabpanel" role="tabpanel" aria-labelledby="tab-${this.tab}" tabindex="0"></div>
    `;
    this.renderActions();
    this.renderTab();
    this.el.onclick = (e) => this.onClick(e);
    $('.subtabs', this.el).addEventListener('keydown', (e) => {
      const tabs = $$<HTMLButtonElement>('.subtab', this.el);
      const i = tabs.findIndex((t) => t === document.activeElement);
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
        next.focus();
        next.click();
      }
    });
  }

  private renderActions() {
    const w = this.world!;
    const s = this.store.get();
    const fav = s.favourites.includes(w.id);
    const cmp = s.compare.includes(w.id);
    const inCols = s.collections.filter((c) => c.worldIds.includes(w.id)).length;
    const host = $('#panel-actions', this.el);
    if (!host) return;
    const host3d = w.kind === 'star' ? w.name : w.parent;
    const canOpenSystem = (w.kind === 'exoplanet' || (w.kind === 'star' && w.id !== 'sun')) && !this.h.isSystemOpen(host3d);
    host.innerHTML = `
      <button type="button" class="btn sm ${fav ? 'on' : ''}" data-act="fav" aria-pressed="${fav}">${ICONS.star}${fav ? 'Favourited' : 'Favourite'}</button>
      <button type="button" class="btn sm ${cmp ? 'on-accent' : ''}" data-act="compare" aria-pressed="${cmp}">${ICONS.compare}${cmp ? `Comparing (${s.compare.length})` : 'Compare'}</button>
      <div class="menu">
        <button type="button" class="btn sm ${inCols ? 'on-accent' : ''}" data-act="menu" aria-expanded="${this.menuOpen}" aria-haspopup="true">${ICONS.folder}${inCols ? `In ${inCols} mission${inCols > 1 ? 's' : ''}` : 'Add to mission'}</button>
        ${this.menuOpen ? this.menuHtml() : ''}
      </div>
      ${canOpenSystem ? `<button type="button" class="btn sm primary" data-act="system">${ICONS.orbit}View system in 3D</button>` : ''}
    `;
    if (this.menuOpen) {
      const form = $<HTMLFormElement>('form', host);
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = $<HTMLInputElement>('input[name=name]', form);
        const { state, collection } = createCollection(this.store.get(), input.value, { worldIds: [w.id] });
        if (!collection) return input.focus();
        this.store.set(state);
        toast(`Created mission “${collection.name}” with ${w.name}`);
        requestAnimationFrame(() => $<HTMLInputElement>('.menu-pop input[name=name]', this.el)?.focus());
      });
    }
  }

  private menuHtml() {
    const w = this.world!;
    const cols = this.store.get().collections;
    return `
      <div class="menu-pop" role="group" aria-label="Exploration missions">
        ${
          cols.length
            ? cols
                .map(
                  (c) =>
                    `<label class="check"><input type="checkbox" data-col="${esc(c.id)}" ${c.worldIds.includes(w.id) ? 'checked' : ''}/> ${esc(c.name)} <small class="mono" style="margin-left:auto;color:var(--dim)">${c.worldIds.length}</small></label>`,
                )
                .join('')
            : '<p class="note" style="margin:4px 6px">No missions yet — name one below.</p>'
        }
        <form>
          <input class="field plain" name="name" maxlength="48" placeholder="New mission name" aria-label="New mission name" />
          <button class="btn sm primary" type="submit" aria-label="Create mission">${ICONS.plus}</button>
        </form>
      </div>`;
  }

  private toggleMenu(open = !this.menuOpen) {
    this.menuOpen = open;
    this.renderActions();
    if (open) $<HTMLElement>('.menu-pop input, .menu-pop button', this.el)?.focus();
  }

  private onClick(e: MouseEvent) {
    const t = e.target as HTMLElement;
    const w = this.world!;
    const colBox = t.closest<HTMLInputElement>('input[data-col]');
    if (colBox) {
      this.store.update((s) => toggleInCollection(s, colBox.dataset.col!, w.id));
      return;
    }
    const tabBtn = t.closest<HTMLElement>('[data-tab]');
    if (tabBtn) {
      this.tab = tabBtn.dataset.tab as Tab;
      $$('.subtab', this.el).forEach((b) => {
        const on = b.dataset.tab === this.tab;
        b.setAttribute('aria-selected', String(on));
        b.tabIndex = on ? 0 : -1;
      });
      $('#tabpanel', this.el).setAttribute('aria-labelledby', `tab-${this.tab}`);
      this.renderTab();
      return;
    }
    const act = t.closest<HTMLElement>('[data-act]')?.dataset.act;
    switch (act) {
      case 'close':
        this.h.onClose();
        break;
      case 'fav': {
        const was = this.store.get().favourites.includes(w.id);
        this.store.update((s) => toggleFavourite(s, w.id));
        toast(was ? `Removed ${w.name} from favourites` : `★ ${w.name} saved to favourites`);
        break;
      }
      case 'compare': {
        const r = toggleCompare(this.store.get(), w.id);
        if (!r.ok && r.reason === 'full') {
          toast(`Compare tray is full (${MAX_COMPARE}). Remove a world first.`);
          this.h.onOpenCompare();
          return;
        }
        this.store.set(r.state);
        const n = r.state.compare.length;
        if (r.state.compare.includes(w.id)) toast(n >= 2 ? `${n} worlds ready to compare — open Missions` : `Added ${w.name} — pick another world to compare`);
        break;
      }
      case 'menu':
        this.toggleMenu();
        break;
      case 'system':
        this.h.onViewSystem(w.kind === 'star' ? w.name : w.parent, w.id);
        break;
      case 'goto': {
        const id = t.closest<HTMLElement>('[data-id]')?.dataset.id;
        if (id) this.h.onFocus(id);
        break;
      }
    }
  }

  private renderTab() {
    const w = this.world!;
    const body = $('#tabpanel', this.el);
    switch (this.tab) {
      case 'overview':
        body.innerHTML = this.overviewHtml(w);
        break;
      case 'compare':
        body.innerHTML = `
          <h3 class="section-title" style="margin-top:0">Relative to Earth <small class="mono">(log · ← smaller | larger →)</small></h3>
          <div class="chart-box"><canvas id="c-ratio" role="img" aria-label="${esc(w.name)} measurements as multiples of Earth"></canvas></div>
          <h3 class="section-title">Size line-up</h3>
          <div class="chart-box"><canvas id="c-size" role="img" aria-label="Radius of ${esc(w.name)} compared with the eight planets"></canvas></div>
          <p class="note">Add worlds to the compare tray (up to ${MAX_COMPARE}) for a side-by-side mission report.</p>
          <button type="button" class="btn sm" data-act="open-compare">${ICONS.compare}Open compare view</button>
        `;
        $('[data-act=open-compare]', body).addEventListener('click', () => this.h.onOpenCompare());
        if (w.id === 'earth') {
          $('#c-ratio', body).parentElement!.innerHTML = '<p class="note" style="padding:10px">Earth is the reference world — every other planet is measured against it.</p>';
        } else void earthRatioChart($<HTMLCanvasElement>('#c-ratio', body), w);
        void sizeLineupChart($<HTMLCanvasElement>('#c-size', body), w);
        break;
      case 'discovery':
        body.innerHTML = this.discoveryHtml(w);
        break;
      case 'sources':
        body.innerHTML = `
          <ul class="sources">
            ${w.sources
              .map(
                (s) =>
                  `<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer"><span>${esc(s.label)}<small>${esc(s.url.replace(/^https:\/\//, ''))}</small></span>${ICONS.ext}</a></li>`,
              )
              .join('')}
          </ul>
          <p class="note">Values are rounded. Exoplanet parameters come from published solutions in the NASA Exoplanet Archive and may differ between papers; temperatures marked “estimated” use a simple equilibrium model.</p>
        `;
        break;
    }
  }

  private overviewHtml(w: World) {
    const e = EARTH;
    const stat = (icon: string, label: string, value: string, extra = '') =>
      `<div class="stat"><dt>${icon}${label}</dt><dd>${value}</dd>${extra}</div>`;
    const radiusKm = w.radiusEarth != null ? w.radiusEarth * 6371 : null;
    const parts = [
      stat(
        ICONS.ruler,
        'Radius',
        `${fmt(radiusKm, 'km')}${w.radiusEstimated ? '<span class="est" title="Estimated from mass">EST</span>' : ''}`,
        vsEarth(w.radiusEarth, e.radiusEarth),
      ),
      stat(
        ICONS.weight,
        w.massIsMinimum ? 'Mass (min)' : 'Mass',
        fmt(w.massEarth, 'M⊕'),
        `<span class="vs">${w.massEarth != null ? fmt(w.massEarth * 5.972e24, 'kg') : '&nbsp;'}</span>`,
      ),
      stat(ICONS.gravity, 'Gravity', fmt(w.gravity, 'm/s²'), vsEarth(w.gravity, 9.8, 'g')),
      stat(ICONS.sun, 'Day length', fmtDuration(w.dayHours), vsEarth(w.dayHours != null ? Math.abs(w.dayHours) : null, 24, 'Earth days')),
      stat(ICONS.year, w.kind === 'moon' ? 'Orbit' : 'Year length', fmtYear(w.yearDays), vsEarth(w.yearDays, w.kind === 'moon' ? null : 365.25, 'Earth years')),
      stat(ICONS.temp, 'Temperature', fmtTemp(w.temperatureK), `<span class="vs" title="${esc(w.temperatureNote ?? '')}">${esc(w.temperatureNote ?? '') || '&nbsp;'}</span>`),
      stat(
        ICONS.distance,
        w.kind === 'moon' ? `From ${getWorld(w.parent)?.name ?? 'planet'}` : w.kind === 'star' ? 'From Earth' : 'From star',
        w.kind === 'star' ? (w.id === 'sun' ? '1 AU · 8.3 light-min' : `${fmt(w.distanceFromEarthLy)} ly`) : fmtDistance(w),
        w.distanceUnit === 'AU' && w.distance != null && w.kind !== 'star' ? `<span class="vs">${fmt(w.distance * 8.317)} light-min</span>` : '<span class="vs">&nbsp;</span>',
      ),
      w.kind === 'exoplanet'
        ? stat(ICONS.ly, 'From Earth', `${fmt(w.distanceFromEarthLy)} ly`, `<span class="vs">${fmt((w.distanceFromEarthLy ?? 0) / 3.2616)} parsecs</span>`)
        : stat(ICONS.moon, 'Moons', w.moons == null ? '—' : String(w.moons), '<span class="vs">&nbsp;</span>'),
    ];
    const moons = w.kind === 'planet' ? this.moonsHtml(w) : '';
    const parentLink =
      w.kind === 'moon'
        ? `<button type="button" class="btn sm" data-act="goto" data-id="${esc(w.parent)}">${ICONS.locate}Go to ${esc(getWorld(w.parent)?.name ?? '')}</button>`
        : '';
    return `<dl class="stats">${parts.join('')}</dl>${moons}${parentLink}`;
  }

  private moonsHtml(w: World) {
    const moons = ['moon', 'phobos', 'deimos', 'io', 'europa', 'ganymede', 'callisto', 'titan', 'triton']
      .map(getWorld)
      .filter((m): m is World => !!m && m.parent === w.id);
    if (!moons.length) return '';
    return `<h3 class="section-title">Major moons in this model</h3>
      <div class="chips">${moons
        .map((m) => `<button type="button" class="chip" data-act="goto" data-id="${m.id}"><span style="width:8px;height:8px;border-radius:50%;background:${m.color}"></span>${esc(m.name)}</button>`)
        .join('')}</div>`;
  }

  private discoveryHtml(w: World) {
    const d = w.discovery;
    return `
      <dl class="kv">
        <dt>Discovered</dt><dd>${d.year ?? 'Prehistoric'}</dd>
        <dt>By</dt><dd>${esc(d.by)}</dd>
        <dt>Method</dt><dd>${esc(d.method)}</dd>
        ${d.facility && d.facility !== d.by ? `<dt>Facility</dt><dd>${esc(d.facility)}</dd>` : ''}
        ${w.kind === 'exoplanet' ? `<dt>Host star</dt><dd>${esc(w.parent)}</dd>` : ''}
      </dl>
      <h3 class="section-title">How it was found</h3>
      <p class="note" style="font-size:13px">${esc(METHOD_TEXT[d.method] ?? '')}</p>
    `;
  }
}

const METHOD_TEXT: Record<string, string> = {
  Transit:
    'The planet passes in front of its star, dimming it by a tiny, regular amount. The depth of the dip gives the planet’s size; its timing gives the orbital period.',
  'Radial Velocity':
    'The planet’s gravity makes its star wobble. Spectrographs measure the star’s light shifting blue and red, revealing the planet’s minimum mass and orbit.',
  'Direct Imaging':
    'Coronagraphs and adaptive optics block the star’s glare so the young, still-glowing planet can be photographed directly.',
  Microlensing:
    'When a foreground star passes in front of a distant one, its gravity magnifies the background light. A planet adds a brief, tell-tale spike.',
  'Pulsar Timing':
    'Pulsars tick with extraordinary regularity. Orbiting planets nudge the pulsar, making the pulses arrive slightly early or late.',
  'Ancient observation': 'Visible to the naked eye and known to human cultures since before recorded history.',
  Telescope: 'Discovered through telescopic observation of the night sky.',
};
