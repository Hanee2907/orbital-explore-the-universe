import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { daysSinceJ2000 } from '../lib/physics';
import type { Body } from './bodies';
import { createStarfield } from './starfield';
import { texturePool } from './texturePool';
import { type SystemView, buildExoSystem, buildSolarSystem } from './systems';

export const SPEEDS = [0, 1 / 24, 0.25, 1, 2, 7, 30, 120];
export const DEFAULT_SPEED_INDEX = 4;

interface FlyAnim {
  start: number;
  duration: number;
  fromPos: THREE.Vector3;
  fromTarget: THREE.Vector3;
  body: Body | null;
  /** Fixed destination when body is null (overview shots). */
  toPos?: THREE.Vector3;
  dir: THREE.Vector3;
  dist: number;
}

export interface UniverseEvents {
  onSelect(id: string | null): void;
  onHover(name: string | null): void;
  onTick(date: Date): void;
  onFlyModeChange(on: boolean): void;
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export class Universe {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  private labels: CSS2DRenderer;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private clock = new THREE.Clock();
  private starfield = createStarfield();
  private sunLight = new THREE.PointLight('#fff4e0', 3.2, 0, 0);
  private raycaster = new THREE.Raycaster();

  solar!: SystemView;
  active!: SystemView;
  private exo: SystemView | null = null;

  /** Simulated days since J2000. */
  simDays = daysSinceJ2000(new Date());
  private exoDays = 0;
  speedIndex = DEFAULT_SPEED_INDEX;
  showOrbits = true;
  showLabels = true;

  private anim: FlyAnim | null = null;
  private follow: Body | null = null;
  private lastFollowPos = new THREE.Vector3();
  selected: Body | null = null;

  /** Horizontal projection shift so the focused body stays centred in the area not covered by panels. */
  private viewOffset = new THREE.Vector2();
  private viewOffsetTarget = new THREE.Vector2();

  flyMode = false;
  private keys = new Set<string>();
  private look = { yaw: 0, pitch: 0 };
  private drag: { x: number; y: number; t: number; moved: number } | null = null;

  constructor(private container: HTMLElement, private events: UniverseEvents) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.setAttribute('aria-hidden', 'true');

    this.labels = new CSS2DRenderer();
    this.labels.domElement.className = 'label-layer';
    container.appendChild(this.labels.domElement);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.01, 20000);
    this.camera.position.set(0, 140, 260);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.rotateSpeed = 0.6;
    this.controls.zoomSpeed = 0.9;
    this.controls.minDistance = 2;
    this.controls.maxDistance = 1400;
    this.controls.addEventListener('start', () => {
      if (this.anim) this.anim = null;
    });

    this.scene.add(this.starfield);
    this.scene.add(this.sunLight);
    this.scene.add(new THREE.AmbientLight('#8fa6ff', 0.07));

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.85, 0.55, 0.92);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.bindInput();
    this.resize();
    new ResizeObserver(() => this.resize()).observe(container);
  }

  async init(onProgress: (f: number, label: string) => void) {
    this.solar = await buildSolarSystem((id) => this.pick(id), onProgress);
    this.active = this.solar;
    this.scene.add(this.solar.group);
    this.loop();
  }

  get speed() {
    return SPEEDS[this.speedIndex];
  }

  get inExoSystem() {
    return this.active !== this.solar;
  }

  get exoHost(): string | null {
    return this.exo ? (this.exo as SystemView & { host: string }).host : null;
  }

  private resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w / 2, h / 2);
    this.labels.setSize(w, h);
    this.applyViewOffset();
  }

  /** Screen-space insets (px) covered by UI; the projection shifts so focus stays in the clear area. */
  setInsets(left: number, right: number, bottom = 0) {
    this.viewOffsetTarget.set((right - left) / 2, bottom / 2);
  }

  private applyViewOffset() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    const o = this.viewOffset;
    if (Math.abs(o.x) < 0.5 && Math.abs(o.y) < 0.5) this.camera.clearViewOffset();
    else this.camera.setViewOffset(w, h, o.x, o.y, w, h);
  }

  private updateViewOffset(dt: number) {
    if (this.viewOffset.equals(this.viewOffsetTarget)) return;
    if (this.viewOffset.distanceTo(this.viewOffsetTarget) < 0.5) this.viewOffset.copy(this.viewOffsetTarget);
    else this.viewOffset.lerp(this.viewOffsetTarget, Math.min(1, dt * 5));
    this.applyViewOffset();
  }

  // ---------- selection & camera ----------

  findBody(id: string): Body | undefined {
    return this.active.bodies.find((b) => b.world.id === id) ?? this.solar.bodies.find((b) => b.world.id === id);
  }

  private pick(id: string) {
    this.events.onSelect(id);
  }

  /** Select a body in the active system and fly the camera to it. */
  focus(id: string, opts: { instant?: boolean } = {}): boolean {
    const body = this.active.bodies.find((b) => b.world.id === id);
    if (!body) return false;
    if (this.flyMode) this.setFlyMode(false);
    texturePool.prioritise(id);
    this.select(body);
    const p = body.anchor.getWorldPosition(new THREE.Vector3());
    // Portrait screens have a narrow horizontal field of view, so back off further.
    const portrait = Math.max(1, 1 / this.camera.aspect);
    const dist = (body.world.kind === 'star' ? body.radius * 6 : Math.max(body.radius * 4.2, 1.2)) * portrait;
    const dir =
      body.world.kind === 'star'
        ? this.camera.position.clone().sub(this.controls.target).normalize()
        : p.clone().negate().setY(0).normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.75).setY(0.32).normalize();
    this.startAnim({ body, dir, dist }, opts.instant);
    this.controls.minDistance = body.radius * 1.35;
    return true;
  }

  overview(instant = false) {
    this.select(null);
    if (this.flyMode) this.setFlyMode(false);
    this.controls.minDistance = 2;
    this.startAnim({ body: null, toPos: this.active.overview.clone(), dir: new THREE.Vector3(), dist: 0 }, instant);
  }

  private startAnim(a: Pick<FlyAnim, 'body' | 'dir' | 'dist' | 'toPos'>, instant = false) {
    this.follow = null;
    this.anim = {
      ...a,
      start: performance.now(),
      duration: instant || reducedMotion() ? 0 : 1900,
      fromPos: this.camera.position.clone(),
      fromTarget: this.controls.target.clone(),
    };
  }

  private select(body: Body | null) {
    if (this.selected?.orbit) {
      const m = this.selected.orbit.material as THREE.LineBasicMaterial;
      m.opacity = this.selected.orbit.userData.baseOpacity;
    }
    this.selected?.labelEl.classList.remove('selected');
    this.selected = body;
    if (body?.orbit) (body.orbit.material as THREE.LineBasicMaterial).opacity = 0.95;
    body?.labelEl.classList.add('selected');
  }

  private updateAnim(now: number) {
    if (!this.anim) {
      if (this.follow) {
        const p = this.follow.anchor.getWorldPosition(new THREE.Vector3());
        const delta = p.clone().sub(this.lastFollowPos);
        this.camera.position.add(delta);
        this.controls.target.copy(p);
        this.lastFollowPos.copy(p);
      }
      return;
    }
    const a = this.anim;
    const k = a.duration === 0 ? 1 : Math.min(1, (now - a.start) / a.duration);
    const e = ease(k);
    const target = a.body ? a.body.anchor.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3();
    const endPos = a.toPos ?? target.clone().addScaledVector(a.dir, a.dist);
    this.camera.position.lerpVectors(a.fromPos, endPos, e);
    // Arc upward so long flights sweep over the system instead of through the Sun.
    const span = a.fromPos.distanceTo(endPos);
    this.camera.position.y += Math.sin(Math.PI * e) * span * 0.18;
    this.controls.target.lerpVectors(a.fromTarget, target, e);
    if (k >= 1) {
      this.anim = null;
      if (a.body) {
        this.follow = a.body;
        this.lastFollowPos.copy(target);
      }
    }
  }

  // ---------- systems ----------

  async enterExoSystem(host: string, focusId?: string) {
    if (this.exoHost === host) {
      if (focusId) this.focus(focusId);
      return;
    }
    this.leaveExoSystem(false);
    this.exo = await buildExoSystem(host, (id) => this.pick(id));
    this.exoDays = 0;
    this.solar.group.visible = false;
    this.setLabelsVisible(this.solar, false);
    this.scene.add(this.exo.group);
    this.active = this.exo;
    this.applyToggles();
    this.camera.position.copy(this.exo.overview).multiplyScalar(1.6);
    this.controls.target.set(0, 0, 0);
    if (focusId) this.focus(focusId);
    else this.overview();
  }

  leaveExoSystem(flyHome = true) {
    if (!this.exo) return;
    this.exo.dispose();
    this.exo = null;
    this.active = this.solar;
    this.solar.group.visible = true;
    this.select(null);
    this.follow = null;
    this.applyToggles();
    if (flyHome) this.overview();
  }

  private setLabelsVisible(view: SystemView, on: boolean) {
    for (const b of view.bodies) b.label.visible = on;
  }

  applyToggles() {
    for (const view of [this.solar, this.exo]) {
      if (!view) continue;
      const on = view === this.active;
      for (const o of view.orbits) if (o.body.orbit) o.body.orbit.visible = this.showOrbits;
      view.group.traverse((obj) => {
        if (obj.name === 'habitable-zone') obj.visible = this.showOrbits;
      });
      this.setLabelsVisible(view, on && this.showLabels);
    }
  }

  // ---------- fly mode ----------

  setFlyMode(on: boolean) {
    if (on === this.flyMode) return;
    this.flyMode = on;
    this.controls.enabled = !on;
    this.anim = null;
    this.follow = null;
    this.keys.clear();
    if (on) {
      const e = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
      this.look.yaw = e.y;
      this.look.pitch = e.x;
    } else {
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
      this.controls.target.copy(this.camera.position).addScaledVector(fwd, 30);
      this.controls.minDistance = 2;
    }
    this.events.onFlyModeChange(on);
  }

  setThrust(key: string, on: boolean) {
    if (on) this.keys.add(key);
    else this.keys.delete(key);
  }

  private updateFly(dt: number) {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.look.pitch, this.look.yaw, 0, 'YXZ'));
    this.camera.quaternion.copy(q);
    const move = new THREE.Vector3();
    const k = this.keys;
    if (k.has('w') || k.has('arrowup')) move.z -= 1;
    if (k.has('s') || k.has('arrowdown')) move.z += 1;
    if (k.has('a') || k.has('arrowleft')) move.x -= 1;
    if (k.has('d') || k.has('arrowright')) move.x += 1;
    if (k.has('r') || k.has('e')) move.y += 1;
    if (k.has('f') || k.has('q')) move.y -= 1;
    if (move.lengthSq() === 0) return;
    const boost = k.has('shift') ? 5 : 1;
    move.normalize().multiplyScalar(28 * boost * dt).applyQuaternion(q);
    this.camera.position.add(move);
  }

  // ---------- input ----------

  private bindInput() {
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', (e) => {
      this.drag = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 };
      if (this.flyMode) el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (this.drag) {
        const dx = e.clientX - this.drag.x;
        const dy = e.clientY - this.drag.y;
        this.drag.moved += Math.abs(dx) + Math.abs(dy);
        if (this.flyMode) {
          this.look.yaw -= dx * 0.0035;
          this.look.pitch = THREE.MathUtils.clamp(this.look.pitch - dy * 0.0035, -1.5, 1.5);
        }
        this.drag.x = e.clientX;
        this.drag.y = e.clientY;
      } else {
        this.hover(e);
      }
    });
    el.addEventListener('pointerup', (e) => {
      const d = this.drag;
      this.drag = null;
      if (d && d.moved < 6 && performance.now() - d.t < 500) this.click(e);
    });
    el.addEventListener('pointerleave', () => this.events.onHover(null));

    window.addEventListener('keydown', (e) => {
      if (!this.flyMode) return;
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select')) return;
      const key = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'q', 'e', 'r', 'f', 'shift', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        this.keys.add(key);
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
  }

  private ndc(e: PointerEvent) {
    const r = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  private raycast(e: PointerEvent): Body | null {
    this.raycaster.setFromCamera(this.ndc(e), this.camera);
    const hits = this.raycaster.intersectObjects(
      this.active.bodies.map((b) => b.hit),
      false,
    );
    if (!hits.length) return null;
    // Prefer the smallest body among overlapping hit spheres (moons in front of planets).
    const first = hits[0].distance;
    const close = hits.filter((h) => h.distance - first < 1.5);
    const id = close.sort((a, b) => a.object.scale.x - b.object.scale.x)[0].object.userData.worldId as string;
    return this.active.bodies.find((b) => b.world.id === id) ?? null;
  }

  private hover(e: PointerEvent) {
    if (this.flyMode) return;
    const b = this.raycast(e);
    this.renderer.domElement.style.cursor = b ? 'pointer' : '';
    this.events.onHover(b ? b.world.name : null);
  }

  private click(e: PointerEvent) {
    if (this.flyMode) return;
    const b = this.raycast(e);
    if (b) this.pick(b.world.id);
  }

  // ---------- loop ----------

  private loop = () => {
    requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.1);
    const t = this.clock.elapsedTime;
    const dtDays = dt * this.speed;
    this.simDays += dtDays;
    this.exoDays += dtDays;

    if (this.active === this.solar) this.solar.update(this.simDays, dtDays, t);
    else this.exo!.update(this.exoDays, dtDays, t);

    const sunPos = new THREE.Vector3();
    this.sunLight.position.copy(sunPos);
    for (const b of this.active.bodies) {
      if (b.atmosphere) (b.atmosphere.material as THREE.ShaderMaterial).uniforms.uSunPos.value.copy(sunPos);
    }
    (this.starfield.userData.update as (t: number) => void)(t);
    this.fadeHabitableZone();

    if (this.flyMode) this.updateFly(dt);
    else {
      this.updateAnim(performance.now());
      this.controls.update();
    }
    this.updateViewOffset(dt);
    this.starfield.position.copy(this.camera.position);
    this.updateLabelDensity();

    this.composer.render();
    this.labels.render(this.scene, this.camera);
    this.events.onTick(this.simDate());
  };

  /** The habitable-zone disc reads well from above but washes the screen when seen edge-on. */
  private fadeHabitableZone() {
    if (this.active === this.solar) return;
    const hz = this.active.group.getObjectByName('habitable-zone') as THREE.Mesh | undefined;
    if (!hz) return;
    const tilt = Math.abs(this.camera.position.clone().sub(this.controls.target).normalize().y);
    (hz.material as THREE.MeshBasicMaterial).opacity = 0.09 * Math.pow(tilt, 2.5);
  }

  /** Hide moon labels unless the camera is close to their planet. */
  private updateLabelDensity() {
    if (!this.showLabels) return;
    const camPos = this.camera.position;
    const tmp = new THREE.Vector3();
    for (const b of this.active.bodies) {
      const own = camPos.distanceTo(b.anchor.getWorldPosition(tmp));
      let show = own > b.radius * 9;
      if (show && b.parentBody) {
        const d = camPos.distanceTo(b.parentBody.anchor.getWorldPosition(tmp));
        show = d < b.parentBody.radius * 18 || this.selected === b;
      }
      if (b.label.visible !== show) b.label.visible = show;
    }
  }

  simDate(): Date {
    return new Date(Date.UTC(2000, 0, 1, 12) + this.simDays * 86_400_000);
  }

  resetToToday() {
    this.simDays = daysSinceJ2000(new Date());
  }
}
