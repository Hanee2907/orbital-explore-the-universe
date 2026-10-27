import type { SurfaceStyle, World } from '../data/types';
import { Noise3, hashString, mulberry32 } from './noise';

// Pure pixel painters (no DOM / three.js) so they can run inside Web Workers.

export type RGB = [number, number, number];

export const hex = (h: string): RGB => {
  const n = parseInt(h.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

export const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

export function ramp(stops: [number, string][]): (t: number) => RGB {
  const s = stops.map(([t, c]) => [t, hex(c)] as [number, RGB]);
  return (t: number) => {
    if (t <= s[0][0]) return s[0][1];
    for (let i = 1; i < s.length; i++) {
      if (t <= s[i][0]) return mix(s[i - 1][1], s[i][1], (t - s[i - 1][0]) / (s[i][0] - s[i - 1][0]));
    }
    return s[s.length - 1][1];
  };
}

interface Sample {
  color: RGB;
  height?: number;
  emissive?: RGB;
  cloud?: number;
}

type Painter = (x: number, y: number, z: number, lat: number, lon: number) => Sample;

interface Crater {
  x: number;
  y: number;
  z: number;
  r: number;
  depth: number;
}

function makeCraters(seed: number, count: number, minR: number, maxR: number): Crater[] {
  const rnd = mulberry32(seed ^ 0x9e3779b9);
  const out: Crater[] = [];
  for (let i = 0; i < count; i++) {
    const u = rnd() * 2 - 1;
    const th = rnd() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    // Bias toward many small craters, few large ones.
    const r = minR + (maxR - minR) * Math.pow(rnd(), 3);
    out.push({ x: s * Math.cos(th), y: u, z: s * Math.sin(th), r, depth: 0.5 + rnd() * 0.5 });
  }
  return out;
}

/** Height contribution of craters at a point on the unit sphere: bowl + raised rim. */
function craterHeight(craters: Crater[], x: number, y: number, z: number): number {
  let h = 0;
  for (const c of craters) {
    const dot = x * c.x + y * c.y + z * c.z;
    if (dot < 0.6) continue;
    const d = Math.acos(Math.min(1, dot)) / c.r;
    if (d > 1.35) continue;
    if (d < 1) h -= c.depth * (1 - d * d) * 0.6;
    h += c.depth * Math.exp(-Math.pow((d - 1) / 0.14, 2)) * 0.35;
  }
  return h;
}

function painterFor(world: World, noise: Noise3, seed: number): { paint: Painter; clouds?: boolean; emissive?: boolean } {
  const id = world.id;
  const style: SurfaceStyle = world.style;
  const tint = hex(world.color);

  switch (id) {
    case 'earth':
      return { paint: earthPainter(noise), clouds: true };
    case 'jupiter':
      return { paint: gasPainter(noise, ['#7c4a2f', '#b98457', '#e7cfaa', '#f4ecdc', '#c08258', '#8f5b3e'], 7.5, 0.9, true) };
    case 'saturn':
      return { paint: gasPainter(noise, ['#b8955b', '#d9be86', '#efdfb6', '#e2c891', '#c7a66b'], 6, 0.35, false) };
    case 'uranus':
      return { paint: gasPainter(noise, ['#8fd6df', '#a6e6ec', '#b9eef2', '#9fdde5'], 4, 0.12, false) };
    case 'neptune':
      return { paint: neptunePainter(noise) };
    case 'mars':
      return { paint: marsPainter(noise, seed) };
    case 'venus':
      return { paint: venusPainter(noise, ['#a8743a', '#d8a95f', '#ecd39a', '#f5e6bf']) };
    case 'io':
      return { paint: ioPainter(noise) };
    case 'europa':
      return { paint: europaPainter(noise) };
    case 'titan':
      return { paint: hazePainter(noise, ['#b8732a', '#d9973f', '#e9b25e', '#f0c47a']) };
    case 'sun':
      return { paint: () => ({ color: [255, 200, 80] }) };
  }

  switch (style) {
    case 'cratered': {
      const mare = id === 'moon';
      const craters = makeCraters(seed, id === 'phobos' || id === 'deimos' ? 40 : 90, 0.02, 0.22);
      const base = mix(tint, [128, 128, 128], 0.4);
      const dark = mix(base, [20, 20, 22], 0.55);
      const light = mix(base, [245, 242, 235], 0.35);
      return {
        paint: (x, y, z) => {
          const n = noise.fbm(x * 3, y * 3, z * 3, 5);
          const ch = craterHeight(craters, x, y, z);
          let c = mix(dark, light, clamp01(n * 1.2 - 0.1 + ch * 0.5));
          if (mare) {
            const m = smooth(0.52, 0.6, noise.fbm(x * 1.3 + 7, y * 1.3, z * 1.3, 4));
            c = mix(c, [72, 72, 76], m * 0.7);
          }
          return { color: c, height: clamp01(0.5 + ch * 0.8 + (n - 0.5) * 0.4) };
        },
      };
    }
    case 'gas': {
      const t = world.temperatureK ?? 400;
      const pal =
        t > 1800
          ? ['#1d0d0a', '#4a1a10', '#7a2e17', '#3a140c', '#a64b1f']
          : t > 900
            ? ['#4a2f25', '#7d5442', '#a07558', '#5b3a2e', '#c4946a']
            : t > 300
              ? ['#a77c55', '#d1ac7e', '#ead2a8', '#bf9566', '#f2e2c2']
              : ['#9fb4c8', '#c9d6df', '#e8ecef', '#b5c4d2'];
      return { paint: gasPainter(noise, pal, 5 + (seed % 5), 0.6, false), emissive: t > 1800 };
    }
    case 'ice-giant':
      return { paint: gasPainter(noise, ['#5b8fd6', '#7fb4e8', '#a9d6f2', '#6fa2de'], 5, 0.25, false) };
    case 'venus':
      return { paint: venusPainter(noise, ['#7d5a3a', '#b98a5a', '#dcbb86', '#ecd7ac']) };
    case 'hazy':
      return { paint: hazePainter(noise, ['#b8732a', '#d9973f', '#e9b25e', '#f0c47a']) };
    case 'lava':
      return { paint: lavaPainter(noise), emissive: true };
    case 'ice':
      return { paint: icePainter(noise, tint) };
    case 'ocean':
      return { paint: oceanPainter(noise), clouds: true };
    case 'earth':
      return { paint: earthPainter(noise, 0.5), clouds: true };
    default: {
      const craters = makeCraters(seed, 50, 0.03, 0.18);
      const r = ramp([
        [0, '#3b2d25'],
        [0.45, '#7a5f4b'],
        [0.7, '#a88b6d'],
        [1, '#d6c3a5'],
      ]);
      return {
        paint: (x, y, z) => {
          const n = noise.fbm(x * 2.5, y * 2.5, z * 2.5, 6);
          const ch = craterHeight(craters, x, y, z);
          return { color: mix(r(n + ch * 0.3), tint, 0.25), height: clamp01(n + ch * 0.5) };
        },
      };
    }
  }
}

function earthPainter(noise: Noise3, seaLevel = 0.53): Painter {
  const ocean = ramp([
    [0, '#06173a'],
    [0.7, '#0d3b78'],
    [1, '#1f78b4'],
  ]);
  return (x, y, z, lat) => {
    const wx = noise.fbm(x * 1.2 + 11, y * 1.2, z * 1.2, 3) - 0.5;
    const wy = noise.fbm(x * 1.2, y * 1.2 + 23, z * 1.2, 3) - 0.5;
    const h = noise.fbm(x * 1.7 + wx * 1.5, y * 1.7 + wy * 1.5, z * 1.7, 6);
    const alat = Math.abs(lat);
    const cloudN = noise.fbm(x * 3.4 + wy * 4 + 40, y * 4.6, z * 3.4 + wx * 4, 6);
    const cloud = smooth(0.56, 0.76, cloudN) * 0.85;
    if (h < seaLevel) {
      const depth = h / seaLevel;
      let c = ocean(depth);
      if (alat > 1.22) c = mix(c, [235, 242, 250], smooth(1.22, 1.3, alat));
      return { color: c, height: 0.35, cloud };
    }
    const land = (h - seaLevel) / (1 - seaLevel);
    const moist = noise.fbm(x * 2.2 + 5, y * 2.2, z * 2.2 + 9, 4);
    const desertBelt = Math.exp(-Math.pow((alat - 0.42) / 0.18, 2));
    let c: RGB = mix([52, 103, 48], [96, 128, 62], clamp01(land * 2));
    c = mix(c, [196, 168, 112], clamp01(desertBelt * smooth(0.45, 0.62, moist) * 1.4));
    c = mix(c, [118, 96, 74], smooth(0.35, 0.6, land));
    c = mix(c, [240, 244, 248], smooth(0.72, 0.85, land) + smooth(1.05, 1.18, alat));
    return { color: c, height: 0.4 + land * 0.6, cloud };
  };
}

function oceanPainter(noise: Noise3): Painter {
  const earth = earthPainter(noise, 0.66);
  return (x, y, z, lat, lon) => {
    const s = earth(x, y, z, lat, lon);
    return { ...s, color: mix(s.color, [30, 90, 160], 0.15), cloud: clamp01((s.cloud ?? 0) * 1.15) };
  };
}

function gasPainter(noise: Noise3, palette: string[], bands: number, turbulence: number, redSpot: boolean): Painter {
  const stops = palette.map((c, i) => [i / (palette.length - 1), c] as [number, string]);
  const r = ramp(stops);
  return (x, y, z, lat, lon) => {
    // Mostly zonal bands: latitude drives colour, with gentle turbulence that grows near band edges.
    const warp = (noise.fbm(x * 3, y * 6, z * 3, 5) - 0.5) * turbulence;
    const fine = noise.fbm(x * 10, y * 30, z * 10, 3) - 0.5;
    const zonal = noise.fbm(0.5, y * 5.5, 0.5, 4);
    const b = Math.sin((y + warp * 0.06) * bands * Math.PI + zonal * 3) * 0.5 + 0.5;
    const t = clamp01(0.15 + b * 0.55 + zonal * 0.35 + fine * 0.18 * (0.4 + turbulence));
    let c = r(t);
    if (redSpot) {
      let dl = lon - 1.1;
      dl = Math.atan2(Math.sin(dl), Math.cos(dl));
      const d = Math.hypot(dl / 0.32, (lat + 0.38) / 0.11);
      if (d < 1.4) {
        const swirl = noise.fbm(dl * 6, lat * 9, 3, 3);
        c = mix(c, mix([178, 82, 52], [214, 132, 92], swirl), smooth(1.4, 0.6, d));
      }
    }
    return { color: c, emissive: mix([0, 0, 0], [255, 90, 30], smooth(0.55, 1, 1 - t) * 0.5) };
  };
}

function neptunePainter(noise: Noise3): Painter {
  const base = gasPainter(noise, ['#26449e', '#3558c4', '#4a72db', '#3a5fc9'], 5, 0.4, false);
  return (x, y, z, lat, lon) => {
    const s = base(x, y, z, lat, lon);
    let c = s.color;
    let dl = lon - 2.2;
    dl = Math.atan2(Math.sin(dl), Math.cos(dl));
    const d = Math.hypot(dl / 0.25, (lat + 0.35) / 0.09);
    c = mix(c, [20, 32, 90], smooth(1.2, 0.5, d));
    const streak = smooth(0.7, 0.82, noise.fbm(x * 3, y * 26, z * 3, 3)) * 0.7;
    c = mix(c, [225, 235, 255], streak);
    return { color: c };
  };
}

function marsPainter(noise: Noise3, seed: number): Painter {
  const craters = makeCraters(seed, 45, 0.02, 0.12);
  const r = ramp([
    [0, '#4a2112'],
    [0.38, '#8c3a1c'],
    [0.6, '#c1572b'],
    [0.8, '#d98250'],
    [1, '#e9b088'],
  ]);
  return (x, y, z, lat) => {
    const n = noise.fbm(x * 2.2, y * 2.2, z * 2.2, 6);
    const region = noise.fbm(x * 0.9 + 3, y * 0.9, z * 0.9, 4);
    const ch = craterHeight(craters, x, y, z);
    let c = r(clamp01(n * 0.7 + region * 0.5 - 0.12 + ch * 0.25));
    const alat = Math.abs(lat);
    const cap = smooth(1.28, 1.36, alat + (noise.noise(x * 6, y * 6, z * 6) - 0.5) * 0.12);
    c = mix(c, [240, 236, 230], cap);
    return { color: c, height: clamp01(n + ch * 0.6) };
  };
}

function venusPainter(noise: Noise3, palette: string[]): Painter {
  const r = ramp(palette.map((c, i) => [i / (palette.length - 1), c] as [number, string]));
  return (x, y, z) => {
    const w = noise.fbm(x * 1.5, y * 1.5, z * 1.5, 4) - 0.5;
    const t = noise.fbm(x * 1.4 + w * 2, y * 5 + w * 3, z * 1.4, 6);
    return { color: r(clamp01(t * 1.3 - 0.1)) };
  };
}

function hazePainter(noise: Noise3, palette: string[]): Painter {
  const r = ramp(palette.map((c, i) => [i / (palette.length - 1), c] as [number, string]));
  return (x, y, z) => {
    const t = noise.fbm(x * 1.2, y * 4, z * 1.2, 4) * 0.6 + 0.3 + y * 0.1;
    return { color: r(clamp01(t)) };
  };
}

function ioPainter(noise: Noise3): Painter {
  const r = ramp([
    [0, '#6b4a1e'],
    [0.35, '#c48a2e'],
    [0.6, '#e6c84f'],
    [0.85, '#f1e48a'],
    [1, '#f6f0c0'],
  ]);
  return (x, y, z) => {
    const n = noise.fbm(x * 3, y * 3, z * 3, 5);
    let c = r(n);
    const v = noise.noise(x * 14 + 3, y * 14, z * 14);
    c = mix(c, [40, 22, 12], smooth(0.82, 0.9, v));
    c = mix(c, [200, 70, 30], smooth(0.74, 0.8, v) * (1 - smooth(0.82, 0.9, v)) * 0.8);
    return { color: c, height: n };
  };
}

function europaPainter(noise: Noise3): Painter {
  return (x, y, z) => {
    const base = noise.fbm(x * 2, y * 2, z * 2, 4);
    let c: RGB = mix([206, 196, 176], [238, 232, 220], base);
    const lines = noise.ridged(x * 3.5, y * 3.5, z * 3.5, 4);
    c = mix(c, [150, 92, 60], smooth(0.62, 0.8, lines) * 0.8);
    return { color: c, height: lines };
  };
}

function icePainter(noise: Noise3, tint: RGB): Painter {
  return (x, y, z) => {
    const n = noise.fbm(x * 2.5, y * 2.5, z * 2.5, 5);
    const cracks = noise.ridged(x * 4, y * 4, z * 4, 3);
    let c = mix(mix([170, 196, 215], [245, 250, 255], n), tint, 0.25);
    c = mix(c, [110, 140, 170], smooth(0.7, 0.85, cracks) * 0.5);
    return { color: c, height: n };
  };
}

function lavaPainter(noise: Noise3): Painter {
  return (x, y, z) => {
    const n = noise.fbm(x * 2.5, y * 2.5, z * 2.5, 5);
    const cracks = noise.ridged(x * 3, y * 3, z * 3, 5);
    const glow = smooth(0.55, 0.85, cracks);
    const crust: RGB = mix([22, 14, 12], [70, 46, 36], n);
    const hot: RGB = mix([255, 70, 10], [255, 200, 80], smooth(0.8, 1, cracks));
    return { color: mix(crust, hot, glow * 0.85), emissive: mix([0, 0, 0], hot, glow), height: 1 - glow };
  };
}

export interface PixelSet {
  width: number;
  height: number;
  map: Uint8ClampedArray;
  bump?: Uint8ClampedArray;
  emissive?: Uint8ClampedArray;
  clouds?: Uint8ClampedArray;
}

/**
 * Paint an equirectangular RGBA texture set for a world. Rows are written
 * bottom-up (south pole first) to match DataTexture's texel order.
 */
export function paintPixels(world: World, width: number): PixelSet {
  const seed = hashString(world.id);
  const noise = new Noise3(seed);
  const { paint, clouds, emissive } = painterFor(world, noise, seed);
  const height = width / 2;
  const n = width * height * 4;
  const map = new Uint8ClampedArray(n);
  const bump = new Uint8ClampedArray(n);
  const emi = emissive ? new Uint8ClampedArray(n) : undefined;
  const cl = clouds ? new Uint8ClampedArray(n) : undefined;
  let hasHeight = false;

  for (let j = 0; j < height; j++) {
    const lat = (0.5 - (j + 0.5) / height) * Math.PI;
    const cy = Math.sin(lat);
    const cr = Math.cos(lat);
    const row = (height - 1 - j) * width;
    for (let i = 0; i < width; i++) {
      const lon = ((i + 0.5) / width) * Math.PI * 2 - Math.PI;
      const s = paint(-cr * Math.cos(lon), cy, cr * Math.sin(lon), lat, lon);
      const k = (row + i) * 4;
      map[k] = s.color[0];
      map[k + 1] = s.color[1];
      map[k + 2] = s.color[2];
      map[k + 3] = 255;
      if (s.height != null) {
        hasHeight = true;
        bump[k] = bump[k + 1] = bump[k + 2] = s.height * 255;
        bump[k + 3] = 255;
      }
      if (emi) {
        const e = s.emissive ?? [0, 0, 0];
        emi[k] = e[0];
        emi[k + 1] = e[1];
        emi[k + 2] = e[2];
        emi[k + 3] = 255;
      }
      if (cl) {
        cl[k] = cl[k + 1] = cl[k + 2] = 255;
        cl[k + 3] = (s.cloud ?? 0) * 255;
      }
    }
  }
  return { width, height, map, bump: hasHeight ? bump : undefined, emissive: emi, clouds: cl };
}
