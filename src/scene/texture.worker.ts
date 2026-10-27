import type { World } from '../data/types';
import { paintPixels } from './painters';

self.onmessage = (e: MessageEvent<{ job: number; world: World; width: number }>) => {
  const { job, world, width } = e.data;
  const px = paintPixels(world, width);
  const buffers = [px.map, px.bump, px.emissive, px.clouds].filter((b): b is Uint8ClampedArray => !!b).map((b) => b.buffer);
  (self as unknown as Worker).postMessage({ job, px }, buffers);
};
