import type { DiscoveryMethod } from '../data/types';
import {
  ALL_METHODS,
  DEFAULT_FILTER,
  EXOPLANETS,
  type ExoFilter,
  type SortKey,
  exoId,
  exoplanetToWorld,
  filterExoplanets,
  isPotentiallyHabitable,
} from '../lib/exoplanets';
import type { MissionStore } from '../lib/missions';
import { SIZE_CLASSES, type SizeClass, sizeClass } from '../lib/physics';
import { fmt, fmtYear } from '../lib/worlds';
import { $, ICONS, esc, orbStyle } from './dom';

const DISTANCE_STEPS = [5, 15, 50, 100, 250, 1000, 2500, null] as const;
const FILTER_KEY = 'orbital:exo-filter:v1';

export class ExoCatalog {
  private filter: ExoFilter = { ...DEFAULT_FILTER };
  activeId: string | null = null;

  constructor(
    private el: HTMLElement,
    private store: MissionStore,
    private onPick: (id: string) => void,
    private onClose: () => void,
  ) {
    try {
      const saved = JSON.parse(sessionStorage.getItem(FILTER_KEY) ?? 'null');
      if (saved && typeof saved === 'object') this.filter = { ...DEFAULT_FILTER, ...saved };
    } catch {
      /* ignore */
    }
    this.renderShell();
    store.subscribe(() => !this.el.hidden && this.renderList());
  }

  open() {
    this.el.hidden = false;
    this.renderList();
  }

  close() {
    this.el.hidden = true;
  }

  get isOpen() {
    return !this.el.hidden;
  }

  focusSearch() {
    $<HTMLInputElement>('#exo-q', this.el).focus();
  }

  setActive(id: string | null) {
    this.activeId = id;
    if (!this.el.hidden) this.renderList();
  }

  private save() {
    try {
      sessionStorage.setItem(FILTER_KEY, JSON.stringify(this.filter));
    } catch {
      /* ignore */
    }
  }

  private renderShell() {
    const f = this.filter;
    const distIdx = Math.max(0, DISTANCE_STEPS.indexOf(f.maxDistanceLy as (typeof DISTANCE_STEPS)[number]));
    this.el.innerHTML = `
      <div class="grabber" aria-hidden="true"></div>
      <header class="sheet-head">
        <div class="sheet-title-row">
          <div>
            <span class="eyebrow mono">Catalog · ${EXOPLANETS.length} worlds</span>
            <h2 id="exo-title">Discover exoplanets</h2>
          </div>
          <button type="button" class="icon-btn" data-close aria-label="Close exoplanet catalog">${ICONS.close}</button>
        </div>
      </header>
      <div class="sheet-body">
        <div class="filters">
          <div class="search">
            ${ICONS.search}
            <input id="exo-q" class="field" type="search" placeholder="Search planet, star or telescope" value="${esc(f.query)}" aria-label="Search exoplanets" autocomplete="off" />
          </div>
          <div class="filter-row">
            <span class="filter-label" id="m-label">Discovery method</span>
            <div class="chips" role="group" aria-labelledby="m-label">
              ${ALL_METHODS.map((m) => `<button type="button" class="chip" data-method="${m}" aria-pressed="${f.methods.includes(m)}">${m}</button>`).join('')}
            </div>
          </div>
          <div class="filter-row">
            <span class="filter-label" id="s-label">Planet type</span>
            <div class="chips" role="group" aria-labelledby="s-label">
              ${SIZE_CLASSES.map((s) => `<button type="button" class="chip" data-size="${s}" aria-pressed="${f.sizes.includes(s)}">${s}</button>`).join('')}
              <button type="button" class="chip hz" data-hz aria-pressed="${f.habitableOnly}">● Habitable zone</button>
            </div>
          </div>
          <div class="filter-row">
            <label for="exo-dist">Max distance from Earth</label>
            <div class="range-row">
              <input id="exo-dist" type="range" min="0" max="${DISTANCE_STEPS.length - 1}" step="1" value="${f.maxDistanceLy == null ? DISTANCE_STEPS.length - 1 : distIdx}" />
              <output id="exo-dist-out" for="exo-dist"></output>
            </div>
          </div>
          <div class="filter-row">
            <label for="exo-sort">Sort by</label>
            <select id="exo-sort" class="field">
              ${(
                [
                  ['distance', 'Nearest first'],
                  ['year', 'Newest discovery'],
                  ['radius', 'Largest first'],
                  ['temperature', 'Hottest first'],
                  ['name', 'Name (A–Z)'],
                ] as [SortKey, string][]
              )
                .map(([k, l]) => `<option value="${k}" ${f.sort === k ? 'selected' : ''}>${l}</option>`)
                .join('')}
            </select>
          </div>
        </div>
        <div class="result-meta"><span id="exo-count" aria-live="polite"></span><button type="button" class="btn ghost sm" id="exo-reset">Reset filters</button></div>
        <ul class="exo-list" id="exo-list"></ul>
      </div>
    `;
    this.updateDistanceLabel();

    const q = $<HTMLInputElement>('#exo-q', this.el);
    q.addEventListener('input', () => {
      this.filter.query = q.value;
      this.changed();
    });
    $<HTMLInputElement>('#exo-dist', this.el).addEventListener('input', (e) => {
      this.filter.maxDistanceLy = DISTANCE_STEPS[Number((e.target as HTMLInputElement).value)];
      this.updateDistanceLabel();
      this.changed();
    });
    $<HTMLSelectElement>('#exo-sort', this.el).addEventListener('change', (e) => {
      this.filter.sort = (e.target as HTMLSelectElement).value as SortKey;
      this.changed();
    });
    $('#exo-reset', this.el).addEventListener('click', () => {
      this.filter = { ...DEFAULT_FILTER };
      this.save();
      this.renderShell();
      this.renderList();
    });
    this.el.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('[data-close]')) return this.onClose();
      const m = t.closest<HTMLElement>('[data-method]');
      const s = t.closest<HTMLElement>('[data-size]');
      const hz = t.closest<HTMLElement>('[data-hz]');
      const card = t.closest<HTMLElement>('[data-exo]');
      if (m) {
        this.toggle(this.filter.methods, m.dataset.method as DiscoveryMethod);
        m.setAttribute('aria-pressed', String(this.filter.methods.includes(m.dataset.method as DiscoveryMethod)));
        this.changed();
      } else if (s) {
        this.toggle(this.filter.sizes, s.dataset.size as SizeClass);
        s.setAttribute('aria-pressed', String(this.filter.sizes.includes(s.dataset.size as SizeClass)));
        this.changed();
      } else if (hz) {
        this.filter.habitableOnly = !this.filter.habitableOnly;
        hz.setAttribute('aria-pressed', String(this.filter.habitableOnly));
        this.changed();
      } else if (card) {
        this.onPick(card.dataset.exo!);
      }
    });
  }

  private toggle<T>(arr: T[], v: T) {
    const i = arr.indexOf(v);
    if (i >= 0) arr.splice(i, 1);
    else arr.push(v);
  }

  private updateDistanceLabel() {
    const d = this.filter.maxDistanceLy;
    $('#exo-dist-out', this.el).textContent = d == null ? 'Any' : `≤ ${fmt(d)} ly`;
  }

  private changed() {
    this.save();
    this.renderList();
  }

  private renderList() {
    const list = filterExoplanets(EXOPLANETS, this.filter);
    const favs = new Set(this.store.get().favourites);
    $('#exo-count', this.el).textContent = `${list.length} of ${EXOPLANETS.length} worlds`;
    const ul = $('#exo-list', this.el);
    if (!list.length) {
      ul.innerHTML = `<li class="empty">${ICONS.empty}<br/>No worlds match these filters.<br/>Try widening the distance or clearing a filter.</li>`;
      return;
    }
    ul.innerHTML = list
      .map((p) => {
        const w = exoplanetToWorld(p);
        const id = exoId(p);
        const cls = sizeClass(p.radiusEarth, p.massEarth);
        const hz = isPotentiallyHabitable(p);
        return `<li>
          <button type="button" class="exo-card ${id === this.activeId ? 'active' : ''}" data-exo="${id}" style="${orbStyle(w.color)}" aria-label="${esc(p.name)}, ${fmt(p.distanceLy)} light years away">
            <span class="orb" aria-hidden="true"></span>
            <span>
              <h3>${esc(p.name)}</h3>
              <p>${esc(p.host)} · ${esc(p.star.spectralType)}</p>
              <span class="facts">
                <span title="Distance from Earth">${fmt(p.distanceLy)} ly</span>
                <span title="Orbital period">${fmtYear(p.periodDays)}</span>
                <span title="Temperature">${w.temperatureK != null ? `${fmt(w.temperatureK)} K` : '— K'}</span>
                <span title="Radius">${w.radiusEarth != null ? `${fmt(w.radiusEarth)} R⊕${w.radiusEstimated ? '*' : ''}` : ''}</span>
              </span>
            </span>
            <span class="side">
              <span class="tag">${p.discoveryYear}</span>
              <span class="tag">${esc(p.method === 'Radial Velocity' ? 'RV' : p.method === 'Direct Imaging' ? 'Imaging' : p.method)}</span>
              ${cls ? `<span class="tag">${cls}</span>` : ''}
              ${hz ? '<span class="tag hz">HZ</span>' : ''}
              ${favs.has(id) ? '<span class="tag fav">★</span>' : ''}
            </span>
          </button>
        </li>`;
      })
      .join('');
  }
}
