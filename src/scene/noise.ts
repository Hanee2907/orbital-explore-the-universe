// Seeded 3D value noise + fractal Brownian motion, used to paint planet
// textures on a canvas. Sampling on the unit sphere keeps maps seamless.

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Noise3 {
  private perm = new Uint8Array(512);
  private values = new Float32Array(256);

  constructor(seed: number) {
    const rnd = mulberry32(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      p[i] = i;
      this.values[i] = rnd();
    }
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }

  private v(x: number, y: number, z: number): number {
    const P = this.perm;
    return this.values[P[P[P[x & 255] + (y & 255)] + (z & 255)]];
  }

  /** Smooth value noise in [0, 1]. */
  noise(x: number, y: number, z: number): number {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const zi = Math.floor(z);
    const xf = x - xi;
    const yf = y - yi;
    const zf = z - zi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const w = zf * zf * (3 - 2 * zf);
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    const x00 = lerp(this.v(xi, yi, zi), this.v(xi + 1, yi, zi), u);
    const x10 = lerp(this.v(xi, yi + 1, zi), this.v(xi + 1, yi + 1, zi), u);
    const x01 = lerp(this.v(xi, yi, zi + 1), this.v(xi + 1, yi, zi + 1), u);
    const x11 = lerp(this.v(xi, yi + 1, zi + 1), this.v(xi + 1, yi + 1, zi + 1), u);
    return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w);
  }

  fbm(x: number, y: number, z: number, octaves = 5, lacunarity = 2.03, gain = 0.5): number {
    let amp = 0.5;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * this.noise(x * freq, y * freq, z * freq);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }

  /** Ridged multifractal — sharp crests, good for cracks and mountain chains. */
  ridged(x: number, y: number, z: number, octaves = 5): number {
    let amp = 0.5;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      const n = 1 - Math.abs(this.noise(x * freq, y * freq, z * freq) * 2 - 1);
      sum += amp * n * n;
      norm += amp;
      amp *= 0.5;
      freq *= 2.1;
    }
    return sum / norm;
  }
}
