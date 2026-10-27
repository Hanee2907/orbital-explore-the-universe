import type { World } from '../data/types';
import {
  MAX_COMPARE,
  type MissionStore,
  addToCompare,
  clearCompare,
  createCollection,
  deleteCollection,
  removeFromCollection,
  removeFromCompare,
  renameCollection,
  toggleFavourite,
} from '../lib/missions';
import { fmt, fmtDuration, fmtTemp, fmtYear, getWorld, kindLabel } from '../lib/worlds';
import { compareChart } from './charts';
import { $, ICONS, esc, orbStyle, toast } from './dom';

export interface MissionHandlers {
  onPick(id: string): void;
  onClose(): void;
}

const pill = (w: World, removeAct: string, extra = '') => `
  <li class="world-pill">
    <button type="button" data-pick="${w.id}" style="${orbStyle(w.color)}"><span class="orb" aria-hidden="true"></span>${esc(w.name)}</button>
    <button type="button" class="x" data-act="${removeAct}" data-id="${w.id}" ${extra} aria-label="Remove ${esc(w.name)}">${ICONS.close}</button>
  </li>`;

export class MissionsDrawer {
  private editing: string | null = null;

  constructor(
    private el: HTMLElement,
    private modal: HTMLElement,
    private store: MissionStore,
    private h: MissionHandlers,
  ) {
    store.subscribe(() => {
      if (!this.el.hidden) this.render();
      if (!this.modal.hidden) this.renderCompare();
    });
    this.el.addEventListener('click', (e) => this.onClick(e));
    this.el.addEventListener('submit', (e) => this.onSubmit(e));
    this.modal.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t === this.modal || t.closest('[data-close]')) this.closeCompare();
      const rm = t.closest<HTMLElement>('[data-rm]');
      if (rm) this.store.update((s) => removeFromCompare(s, rm.dataset.rm!));
      const pick = t.closest<HTMLElement>('[data-pick]');
      if (pick) {
        this.closeCompare();
        this.h.onPick(pick.dataset.pick!);
      }
      const add = t.closest<HTMLElement>('[data-add]');
      if (add) this.store.update((s) => addToCompare(s, add.dataset.add!).state);
    });
  }

  get isOpen() {
    return !this.el.hidden;
  }

  open() {
    this.el.hidden = false;
    this.render();
  }

  close() {
    this.el.hidden = true;
  }

  private worlds(ids: string[]) {
    return ids.map(getWorld).filter((w): w is World => !!w);
  }

  render() {
    const s = this.store.get();
    const favs = this.worlds(s.favourites);
    const cmp = this.worlds(s.compare);
    this.el.innerHTML = `
      <div class="grabber" aria-hidden="true"></div>
      <header class="sheet-head">
        <div class="sheet-title-row">
          <div>
            <span class="eyebrow mono">Saved on this device</span>
            <h2 id="missions-title">Mission control</h2>
          </div>
          <button type="button" class="icon-btn" data-act="close" aria-label="Close missions">${ICONS.close}</button>
        </div>
      </header>
      <div class="sheet-body">
        <section class="mission-section" aria-labelledby="fav-h">
          <header><h3 id="fav-h">${ICONS.star} Favourites <small>${favs.length}</small></h3></header>
          ${
            favs.length
              ? `<ul class="world-pills">${favs.map((w) => pill(w, 'unfav')).join('')}</ul>`
              : '<p class="note">Open any world and press <strong>Favourite</strong> to pin it here.</p>'
          }
        </section>

        <section class="mission-section" aria-labelledby="cmp-h">
          <header>
            <h3 id="cmp-h">${ICONS.compare} Compare tray <small>${cmp.length}/${MAX_COMPARE}</small></h3>
            ${cmp.length ? '<button type="button" class="btn ghost sm" data-act="clear-compare">Clear</button>' : ''}
          </header>
          <div class="compare-slots">
            ${Array.from({ length: MAX_COMPARE }, (_, i) => {
              const w = cmp[i];
              return w
                ? `<div class="slot filled" style="${orbStyle(w.color)}"><button type="button" class="x" data-act="uncompare" data-id="${w.id}" aria-label="Remove ${esc(w.name)} from compare">${ICONS.close}</button><div><div class="orb"></div>${esc(w.name)}</div></div>`
                : `<div class="slot">Empty slot</div>`;
            }).join('')}
          </div>
          <button type="button" class="btn primary sm" data-act="open-compare" style="margin-top:10px;width:100%" ${cmp.length < 2 ? 'disabled' : ''}>
            ${ICONS.compare}${cmp.length < 2 ? 'Add at least 2 worlds to compare' : `Compare ${cmp.length} worlds side by side`}
          </button>
        </section>

        <section class="mission-section" aria-labelledby="col-h">
          <header><h3 id="col-h">${ICONS.folder} Exploration missions <small>${s.collections.length}</small></h3></header>
          <form class="inline-form" data-form="create">
            <input class="field plain" name="name" maxlength="48" placeholder="Name a new mission, e.g. Ocean worlds" aria-label="New mission name" />
            <button class="btn primary sm" type="submit">${ICONS.plus}Create</button>
          </form>
          <div style="margin-top:12px">
            ${
              s.collections.length
                ? s.collections
                    .map((c) => {
                      const ws = this.worlds(c.worldIds);
                      const head =
                        this.editing === c.id
                          ? `<form class="inline-form" style="flex:1" data-form="rename" data-id="${esc(c.id)}"><input class="field plain" name="name" maxlength="48" value="${esc(c.name)}" aria-label="Rename mission" /><button class="btn sm primary" type="submit">Save</button></form>`
                          : `<h4>${esc(c.name)}</h4>
                             <small class="mono" style="color:var(--dim)">${ws.length}</small>
                             <button type="button" class="icon-btn" data-act="compare-col" data-id="${esc(c.id)}" title="Compare this mission" aria-label="Compare ${esc(c.name)}" ${ws.length < 2 ? 'disabled' : ''}>${ICONS.compare}</button>
                             <button type="button" class="icon-btn" data-act="rename" data-id="${esc(c.id)}" aria-label="Rename ${esc(c.name)}">${ICONS.edit}</button>
                             <button type="button" class="icon-btn" data-act="delete" data-id="${esc(c.id)}" aria-label="Delete ${esc(c.name)}">${ICONS.trash}</button>`;
                      return `<div class="collection"><div class="collection-head">${head}</div>
                        ${
                          ws.length
                            ? `<ul class="world-pills">${ws.map((w) => pill(w, 'uncollect', `data-col="${esc(c.id)}"`)).join('')}</ul>`
                            : '<p class="note">Empty — open a world and use <strong>Add to mission</strong>.</p>'
                        }</div>`;
                    })
                    .join('')
                : '<p class="note">Group worlds into named missions — “Habitable candidates”, “Gas giants”, “Next summer’s targets”…</p>'
            }
          </div>
        </section>
      </div>
    `;
    if (this.editing) $<HTMLInputElement>('form[data-form=rename] input', this.el)?.select();
  }

  private onSubmit(e: SubmitEvent) {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const input = $<HTMLInputElement>('input[name=name]', form);
    if (form.dataset.form === 'create') {
      const { state, collection } = createCollection(this.store.get(), input.value);
      if (!collection) return input.focus();
      this.store.set(state);
      toast(`Mission “${collection.name}” created`);
    } else if (form.dataset.form === 'rename') {
      this.editing = null;
      this.store.update((s) => renameCollection(s, form.dataset.id!, input.value));
      this.render();
    }
  }

  private onClick(e: MouseEvent) {
    const t = e.target as HTMLElement;
    const pick = t.closest<HTMLElement>('[data-pick]');
    if (pick) return this.h.onPick(pick.dataset.pick!);
    const btn = t.closest<HTMLElement>('[data-act]');
    if (!btn) return;
    const id = btn.dataset.id!;
    switch (btn.dataset.act) {
      case 'close':
        return this.h.onClose();
      case 'unfav':
        return this.store.update((s) => toggleFavourite(s, id));
      case 'uncompare':
        return this.store.update((s) => removeFromCompare(s, id));
      case 'clear-compare':
        return this.store.update(clearCompare);
      case 'open-compare':
        return this.openCompare();
      case 'uncollect':
        return this.store.update((s) => removeFromCollection(s, btn.dataset.col!, id));
      case 'rename':
        this.editing = id;
        return this.render();
      case 'delete': {
        const col = this.store.get().collections.find((c) => c.id === id);
        if (col && confirm(`Delete mission “${col.name}”? The worlds themselves are not affected.`)) {
          this.store.update((s) => deleteCollection(s, id));
          toast(`Deleted “${col.name}”`);
        }
        return;
      }
      case 'compare-col': {
        const col = this.store.get().collections.find((c) => c.id === id);
        if (!col) return;
        const ids = col.worldIds.slice(0, MAX_COMPARE);
        this.store.update((s) => ({ ...s, compare: ids }));
        if (col.worldIds.length > MAX_COMPARE) toast(`Comparing the first ${MAX_COMPARE} worlds of “${col.name}”`);
        return this.openCompare();
      }
    }
  }

  openCompare() {
    this.modal.hidden = false;
    this.renderCompare();
    $<HTMLElement>('[data-close]', this.modal)?.focus();
  }

  closeCompare() {
    this.modal.hidden = true;
  }

  get compareOpen() {
    return !this.modal.hidden;
  }

  private renderCompare() {
    const card = $('.modal-card', this.modal);
    const ws = this.worlds(this.store.get().compare);
    const rows: [string, (w: World) => number | null, (w: World) => string, 'max' | 'min' | null][] = [
      ['Type', () => null, (w) => esc(kindLabel(w)), null],
      ['Radius', (w) => w.radiusEarth, (w) => `${fmt(w.radiusEarth != null ? w.radiusEarth * 6371 : null, 'km')}${w.radiusEstimated ? '*' : ''}`, 'max'],
      ['Mass', (w) => w.massEarth, (w) => fmt(w.massEarth, 'M⊕'), 'max'],
      ['Surface gravity', (w) => w.gravity, (w) => fmt(w.gravity, 'm/s²'), 'max'],
      ['Day length', (w) => (w.dayHours == null ? null : Math.abs(w.dayHours)), (w) => fmtDuration(w.dayHours), 'max'],
      ['Year length', (w) => w.yearDays, (w) => fmtYear(w.yearDays), 'max'],
      ['Temperature', (w) => w.temperatureK, (w) => fmtTemp(w.temperatureK), 'max'],
      ['Moons', (w) => w.moons, (w) => (w.moons == null ? '—' : String(w.moons)), 'max'],
      ['From Earth', (w) => w.distanceFromEarthLy ?? null, (w) => (w.distanceFromEarthLy != null ? `${fmt(w.distanceFromEarthLy)} ly` : 'Solar System'), null],
      ['Discovered', () => null, (w) => (w.discovery.year ? `${w.discovery.year} · ${esc(w.discovery.method)}` : 'Antiquity'), null],
    ];
    const maxR = Math.max(...ws.map((w) => w.radiusEarth ?? 0), 1);
    const suggestions = ['earth', 'mars', 'jupiter', 'exo-proxima-centauri-b', 'exo-trappist-1-e', 'exo-kepler-452-b'].filter(
      (id) => !this.store.get().compare.includes(id),
    );
    card.innerHTML = `
      <header class="modal-head">
        <h2 id="compare-title">Side-by-side comparison</h2>
        <button type="button" class="icon-btn" data-close aria-label="Close comparison">${ICONS.close}</button>
      </header>
      <div class="modal-body">
        ${
          ws.length < 2
            ? `<div class="empty">${ICONS.compare}<br/>Add at least two worlds to the compare tray.<br/><br/>
                <div class="chips" style="justify-content:center">${suggestions
                  .map((id) => getWorld(id)!)
                  .map((w) => `<button type="button" class="chip" data-add="${w.id}">${ICONS.plus}${esc(w.name)}</button>`)
                  .join('')}</div></div>`
            : `
          <div class="compare-table-wrap">
            <table class="compare-table">
              <thead><tr><th scope="col"><span class="sr-only">Measurement</span></th>${ws
                .map(
                  (w) =>
                    `<th scope="col" style="${orbStyle(w.color)}"><span><span class="orb"></span><button type="button" class="btn ghost sm" style="padding:2px 4px;border:0" data-pick="${w.id}">${esc(w.name)}</button><button type="button" class="icon-btn" style="width:26px;height:26px" data-rm="${w.id}" aria-label="Remove ${esc(w.name)}">${ICONS.close}</button></span></th>`,
                )
                .join('')}</tr></thead>
              <tbody>
                ${rows
                  .map(([label, val, show, best]) => {
                    const vals = ws.map(val);
                    const nums = vals.filter((v): v is number => v != null);
                    const b = best && nums.length > 1 ? (best === 'max' ? Math.max(...nums) : Math.min(...nums)) : null;
                    return `<tr><th scope="row">${label}</th>${ws
                      .map((w, i) => `<td class="${b != null && vals[i] === b ? 'best' : ''}">${show(w)}</td>`)
                      .join('')}</tr>`;
                  })
                  .join('')}
              </tbody>
            </table>
          </div>
          <div class="compare-grid">
            <div>
              <h3 class="section-title">Measurements vs Earth <small class="mono">(log · 0 = Earth)</small></h3>
              <div class="chart-box tall"><canvas id="c-compare" role="img" aria-label="Grouped bar chart comparing the selected worlds"></canvas></div>
            </div>
            <div>
              <h3 class="section-title">Relative size</h3>
              <div class="chart-box tall" style="display:flex;align-items:flex-end;justify-content:space-around;gap:6px;padding:16px 10px">
                ${ws
                  .map((w) => {
                    const d = Math.max(6, ((w.radiusEarth ?? 0) / maxR) * 170);
                    return `<div style="display:flex;flex-direction:column;align-items:center;gap:8px;min-width:0">
                      <div style="width:${d}px;height:${d}px;border-radius:50%;background:radial-gradient(circle at 32% 28%,rgba(255,255,255,.45) 0,${w.color} 40%,#05060c 125%);box-shadow:0 0 24px ${w.color}55"></div>
                      <span class="mono" style="font-size:11px;text-align:center">${esc(w.name)}<br/><span style="color:var(--muted)">${fmt(w.radiusEarth)} R⊕</span></span>
                    </div>`;
                  })
                  .join('')}
              </div>
            </div>
          </div>
          <p class="note">Highlighted values are the largest in each row. * radius estimated from mass.</p>`
        }
      </div>
    `;
    const canvas = $<HTMLCanvasElement>('#c-compare', card);
    if (canvas) void compareChart(canvas, ws);
  }
}
