import * as THREE from 'three';
import { starColor } from '../lib/physics';
import { mulberry32 } from './noise';
import { glowTexture } from './textures';

/** Background starfield with a Milky Way band and a few faint nebulae. */
export function createStarfield(count = 9000): THREE.Group {
  const group = new THREE.Group();
  const rnd = mulberry32(42);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count);
  const band = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(1.05, 0.3, 0.4));
  const v = new THREE.Vector3();
  const c = new THREE.Color();

  for (let i = 0; i < count; i++) {
    const inBand = rnd() < 0.45;
    const theta = rnd() * Math.PI * 2;
    // Band stars hug a great circle; the rest are spread uniformly.
    const u = inBand ? (rnd() + rnd() + rnd() - 1.5) * 0.18 : rnd() * 2 - 1;
    const s = Math.sqrt(1 - u * u);
    v.set(s * Math.cos(theta), u, s * Math.sin(theta));
    if (inBand) v.applyMatrix4(band);
    v.multiplyScalar(2600 + rnd() * 1400);
    positions.set([v.x, v.y, v.z], i * 3);
    const r = rnd();
    const teff = r < 0.55 ? 3000 + rnd() * 2500 : r < 0.9 ? 5500 + rnd() * 2500 : 8000 + rnd() * 16000;
    c.set(starColor(teff));
    const b = 0.55 + rnd() * 0.45;
    colors.set([c.r * b, c.g * b, c.b * b], i * 3);
    sizes[i] = Math.pow(rnd(), 6) * 3.2 + 0.8;
    phases[i] = rnd() * Math.PI * 2;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute('phase', new THREE.BufferAttribute(phases, 1));

  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) } },
    vertexShader: /* glsl */ `
      attribute float size;
      attribute float phase;
      attribute vec3 color;
      uniform float uTime;
      uniform float uPixelRatio;
      varying vec3 vColor;
      varying float vTw;
      void main() {
        vColor = color;
        vTw = 0.75 + 0.25 * sin(uTime * (0.6 + phase * 0.3) + phase * 7.0);
        gl_PointSize = size * uPixelRatio;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      varying float vTw;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(vColor * vTw * (0.6 + a), a);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  group.add(points);

  const nebulaColors = ['rgba(120,90,255,0.9)', 'rgba(60,140,255,0.9)', 'rgba(255,90,170,0.8)', 'rgba(70,220,210,0.7)'];
  for (let i = 0; i < 7; i++) {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture(nebulaColors[i % nebulaColors.length]),
        transparent: true,
        opacity: 0.05 + rnd() * 0.05,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    v.set(rnd() * 2 - 1, (rnd() * 2 - 1) * 0.3, rnd() * 2 - 1).normalize().applyMatrix4(band).multiplyScalar(3200);
    sprite.position.copy(v);
    sprite.scale.setScalar(900 + rnd() * 1300);
    group.add(sprite);
  }

  group.userData.update = (t: number) => {
    mat.uniforms.uTime.value = t;
  };
  return group;
}
