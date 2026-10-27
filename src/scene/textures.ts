import * as THREE from 'three';
import { Noise3 } from './noise';
import { type PixelSet, type RGB, clamp01, mix, smooth } from './painters';

export interface PlanetTextures {
  map: THREE.Texture;
  bump?: THREE.Texture;
  emissive?: THREE.Texture;
  clouds?: THREE.Texture;
}

function dataTexture(data: Uint8ClampedArray, w: number, h: number, color = true): THREE.DataTexture {
  const t = new THREE.DataTexture(data as Uint8ClampedArray<ArrayBuffer>, w, h, THREE.RGBAFormat);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

export function pixelsToTextures(p: PixelSet): PlanetTextures {
  return {
    map: dataTexture(p.map, p.width, p.height),
    bump: p.bump && dataTexture(p.bump, p.width, p.height, false),
    emissive: p.emissive && dataTexture(p.emissive, p.width, p.height),
    clouds: p.clouds && dataTexture(p.clouds, p.width, p.height),
  };
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D, ImageData] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  return [c, ctx, ctx.createImageData(w, h)];
}

function toTexture(c: HTMLCanvasElement, color = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

/** Radial ring texture: x axis runs from inner to outer edge. */
export function paintRings(kind: 'saturn' | 'uranus'): THREE.CanvasTexture {
  const w = 1024;
  const [c, ctx, img] = canvas(w, 4);
  const noise = new Noise3(kind === 'saturn' ? 7 : 13);
  for (let i = 0; i < w; i++) {
    const t = i / (w - 1);
    let a: number;
    let col: RGB;
    if (kind === 'saturn') {
      // C ring (faint) → B ring (bright) → Cassini division → A ring → Encke gap.
      const C = smooth(0.0, 0.05, t) * (1 - smooth(0.2, 0.24, t)) * 0.35;
      const B = smooth(0.22, 0.26, t) * (1 - smooth(0.56, 0.58, t)) * 0.95;
      const A = smooth(0.62, 0.64, t) * (1 - smooth(0.97, 1.0, t)) * 0.75;
      const encke = 1 - Math.exp(-Math.pow((t - 0.9) / 0.006, 2));
      a = (C + B + A * encke) * (0.75 + noise.fbm(t * 60, 0, 0, 3) * 0.5);
      col = mix([150, 128, 98], [236, 220, 190], clamp01(B + A * 0.6 + noise.noise(t * 120, 1, 1) * 0.25));
    } else {
      a = (Math.exp(-Math.pow((t - 0.85) / 0.02, 2)) + Math.exp(-Math.pow((t - 0.5) / 0.01, 2)) * 0.5) * 0.45;
      col = [190, 210, 220];
    }
    for (let j = 0; j < 4; j++) {
      const k = (j * w + i) * 4;
      img.data[k] = col[0];
      img.data[k + 1] = col[1];
      img.data[k + 2] = col[2];
      img.data[k + 3] = clamp01(a) * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = toTexture(c);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  return tex;
}

/** Soft radial gradient for glows and star sprites. */
export function glowTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)'): THREE.CanvasTexture {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(0.25, inner.replace(/[\d.]+\)$/, '0.35)'));
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
