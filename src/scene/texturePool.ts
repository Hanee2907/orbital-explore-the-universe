import type { World } from '../data/types';
import { type PixelSet, paintPixels } from './painters';

interface Job {
  id: number;
  world: World;
  width: number;
  resolve: (p: PixelSet) => void;
  reject: (e: unknown) => void;
}

/**
 * Paints planet textures on a small pool of Web Workers so the main thread
 * keeps rendering. Falls back to painting inline where workers are unavailable.
 */
class TexturePool {
  private workers: Worker[] = [];
  private idle: Worker[] = [];
  private queue: Job[] = [];
  private running = new Map<number, Job>();
  private nextId = 1;

  constructor() {
    if (typeof Worker === 'undefined') return;
    const n = Math.max(2, Math.min(6, (navigator.hardwareConcurrency || 4) - 1));
    try {
      for (let i = 0; i < n; i++) {
        const w = new Worker(new URL('./texture.worker.ts', import.meta.url), { type: 'module' });
        w.onmessage = (e: MessageEvent<{ job: number; px: PixelSet }>) => this.done(w, e.data.job, e.data.px);
        w.onerror = (e) => {
          const job = [...this.running.values()].find((j) => (j as Job & { worker?: Worker }).worker === w);
          if (job) {
            this.running.delete(job.id);
            job.resolve(paintPixels(job.world, job.width));
          }
          e.preventDefault();
          this.idle.push(w);
          this.pump();
        };
        this.workers.push(w);
        this.idle.push(w);
      }
    } catch {
      this.workers = [];
      this.idle = [];
    }
  }

  /** Request a texture set; `urgent` jobs jump the queue (e.g. the body the camera is flying to). */
  paint(world: World, width: number, urgent = false): Promise<PixelSet> {
    if (!this.workers.length) {
      return new Promise((resolve) => setTimeout(() => resolve(paintPixels(world, width)), 0));
    }
    return new Promise((resolve, reject) => {
      const job: Job = { id: this.nextId++, world: JSON.parse(JSON.stringify(world)), width, resolve, reject };
      if (urgent) this.queue.unshift(job);
      else this.queue.push(job);
      this.pump();
    });
  }

  /** Move queued jobs for a world to the front. */
  prioritise(worldId: string) {
    const mine = this.queue.filter((j) => j.world.id === worldId);
    if (!mine.length) return;
    this.queue = [...mine, ...this.queue.filter((j) => j.world.id !== worldId)];
  }

  private pump() {
    while (this.idle.length && this.queue.length) {
      const w = this.idle.pop()!;
      const job = this.queue.shift()!;
      (job as Job & { worker?: Worker }).worker = w;
      this.running.set(job.id, job);
      w.postMessage({ job: job.id, world: job.world, width: job.width });
    }
  }

  private done(w: Worker, id: number, px: PixelSet) {
    const job = this.running.get(id);
    this.running.delete(id);
    this.idle.push(w);
    job?.resolve(px);
    this.pump();
  }
}

export const texturePool = new TexturePool();
