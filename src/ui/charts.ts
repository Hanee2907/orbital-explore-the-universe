import type { Chart as ChartT, ChartConfiguration } from 'chart.js';
import { PLANETS } from '../data/solarSystem';
import type { World } from '../data/types';
import { EARTH, fmt } from '../lib/worlds';

// Chart.js is loaded on demand so the first paint only ships the 3D scene.
let chartLib: Promise<typeof import('chart.js')> | null = null;
function lib() {
  chartLib ??= import('chart.js').then((m) => {
    m.Chart.register(
      m.BarController,
      m.BarElement,
      m.CategoryScale,
      m.LinearScale,
      m.LogarithmicScale,
      m.Tooltip,
      m.Legend,
    );
    m.Chart.defaults.color = '#8f9bbd';
    m.Chart.defaults.font.family = "'JetBrains Mono', ui-monospace, monospace";
    m.Chart.defaults.font.size = 11;
    m.Chart.defaults.borderColor = 'rgba(150,180,255,0.12)';
    return m;
  });
  return chartLib;
}

const live = new WeakMap<HTMLCanvasElement, ChartT>();

async function draw(canvas: HTMLCanvasElement, config: ChartConfiguration) {
  const { Chart } = await lib();
  live.get(canvas)?.destroy();
  if (!canvas.isConnected) return;
  live.set(canvas, new Chart(canvas, config));
}

export interface Metric {
  key: string;
  label: string;
  unit: string;
  get(w: World): number | null;
}

export const METRICS: Metric[] = [
  { key: 'radius', label: 'Radius', unit: 'R⊕', get: (w) => w.radiusEarth },
  { key: 'mass', label: 'Mass', unit: 'M⊕', get: (w) => w.massEarth },
  { key: 'gravity', label: 'Gravity', unit: 'm/s²', get: (w) => w.gravity },
  { key: 'day', label: 'Day', unit: 'h', get: (w) => (w.dayHours != null ? Math.abs(w.dayHours) : null) },
  { key: 'year', label: 'Year', unit: 'days', get: (w) => w.yearDays },
  { key: 'temp', label: 'Temp', unit: 'K', get: (w) => w.temperatureK },
];

const ratio = (w: World, m: Metric) => {
  const v = m.get(w);
  const e = m.get(EARTH);
  return v != null && v > 0 && e ? v / e : null;
};

/** Bars diverge from Earth (0 = same as Earth): left is smaller, right is larger. */
const logRatio = (w: World, m: Metric) => {
  const r = ratio(w, m);
  return r == null ? null : Math.log10(r);
};

const tooltipRatio = (unitFor: (i: number) => string) => ({
  callbacks: {
    label: (ctx: { dataset: { label?: string }; raw: unknown; dataIndex: number }) => {
      const r = Math.pow(10, ctx.raw as number);
      return `${ctx.dataset.label}: ${fmt(r)}× Earth ${unitFor(ctx.dataIndex)}`;
    },
  },
});

const ratioAxis = {
  type: 'linear' as const,
  grid: {
    color: (c: { tick?: { value: number } }) => (c.tick?.value === 0 ? 'rgba(125,211,252,0.6)' : 'rgba(150,180,255,0.08)'),
  },
  ticks: {
    stepSize: 1,
    callback: (v: string | number) => {
      const n = Number(v);
      if (!Number.isInteger(n)) return '';
      return n === 0 ? 'Earth' : `${fmt(Math.pow(10, n))}×`;
    },
  },
};

/** Horizontal bars: each measurement as a multiple of Earth's (log scale). */
export function earthRatioChart(canvas: HTMLCanvasElement, w: World) {
  const metrics = METRICS.filter((m) => ratio(w, m) != null);
  return draw(canvas, {
    type: 'bar',
    data: {
      labels: metrics.map((m) => m.label),
      datasets: [
        {
          label: w.name,
          data: metrics.map((m) => logRatio(w, m)),
          backgroundColor: w.color + 'cc',
          borderColor: w.color,
          borderWidth: 1,
          borderRadius: 5,
          barThickness: 14,
        },
      ],
    },
    options: {
      indexAxis: 'y',
      maintainAspectRatio: false,
      animation: { duration: 500 },
      scales: { x: ratioAxis, y: { grid: { display: false } } },
      plugins: { legend: { display: false }, tooltip: tooltipRatio((i) => metrics[i].label.toLowerCase()) },
    },
  });
}

/** Radius line-up of the eight planets with the selected world highlighted. */
export function sizeLineupChart(canvas: HTMLCanvasElement, w: World) {
  const set = PLANETS.some((p) => p.id === w.id) ? PLANETS : [...PLANETS, w];
  const sorted = [...set].filter((p) => p.radiusEarth != null).sort((a, b) => a.radiusEarth! - b.radiusEarth!);
  return draw(canvas, {
    type: 'bar',
    data: {
      labels: sorted.map((p) => p.name),
      datasets: [
        {
          label: 'Radius (R⊕)',
          data: sorted.map((p) => p.radiusEarth),
          backgroundColor: sorted.map((p) => (p.id === w.id ? p.color : 'rgba(150,170,220,0.22)')),
          borderColor: sorted.map((p) => (p.id === w.id ? '#fff' : 'transparent')),
          borderWidth: 1,
          borderRadius: 5,
        },
      ],
    },
    options: {
      maintainAspectRatio: false,
      animation: { duration: 500 },
      scales: {
        y: { type: 'logarithmic', grid: { color: 'rgba(150,180,255,0.08)' }, ticks: { callback: (v) => `${fmt(Number(v))}` } },
        x: { grid: { display: false }, ticks: { maxRotation: 50, minRotation: 0, autoSkip: false } },
      },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (c) => `${fmt(c.raw as number)} Earth radii` } },
      },
    },
  });
}

/** Grouped bars for side-by-side comparison of up to four worlds. */
export function compareChart(canvas: HTMLCanvasElement, worlds: World[]) {
  const metrics = METRICS.filter((m) => worlds.some((w) => ratio(w, m) != null));
  return draw(canvas, {
    type: 'bar',
    data: {
      labels: metrics.map((m) => m.label),
      datasets: worlds.map((w) => ({
        label: w.name,
        data: metrics.map((m) => logRatio(w, m)),
        backgroundColor: w.color + 'cc',
        borderColor: w.color,
        borderWidth: 1,
        borderRadius: 4,
      })),
    },
    options: {
      maintainAspectRatio: false,
      animation: { duration: 500 },
      scales: { y: ratioAxis, x: { grid: { display: false } } },
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, useBorderRadius: true, borderRadius: 3 } },
        tooltip: tooltipRatio((i) => metrics[i].label.toLowerCase()),
      },
    },
  });
}
