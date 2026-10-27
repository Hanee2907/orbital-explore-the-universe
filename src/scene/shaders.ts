import * as THREE from 'three';

const NOISE_GLSL = /* glsl */ `
  vec3 hash3(vec3 p) {
    p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
  }
  float gnoise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(dot(hash3(i + vec3(0,0,0)), f - vec3(0,0,0)), dot(hash3(i + vec3(1,0,0)), f - vec3(1,0,0)), u.x),
                   mix(dot(hash3(i + vec3(0,1,0)), f - vec3(0,1,0)), dot(hash3(i + vec3(1,1,0)), f - vec3(1,1,0)), u.x), u.y),
               mix(mix(dot(hash3(i + vec3(0,0,1)), f - vec3(0,0,1)), dot(hash3(i + vec3(1,0,1)), f - vec3(1,0,1)), u.x),
                   mix(dot(hash3(i + vec3(0,1,1)), f - vec3(0,1,1)), dot(hash3(i + vec3(1,1,1)), f - vec3(1,1,1)), u.x), u.y), u.z);
  }
  float fbm(vec3 p) {
    float s = 0.0; float a = 0.5;
    for (int i = 0; i < 5; i++) { s += a * gnoise(p); p *= 2.07; a *= 0.5; }
    return s;
  }
`;

/** Animated granulated photosphere with limb darkening. HDR output feeds the bloom pass. */
export function starMaterial(color: THREE.Color, intensity = 1.6): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: color.clone() },
      uIntensity: { value: intensity },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vPos;
      varying vec3 vView;
      void main() {
        vPos = position;
        vNormal = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uIntensity;
      varying vec3 vNormal;
      varying vec3 vPos;
      varying vec3 vView;
      ${NOISE_GLSL}
      void main() {
        vec3 p = normalize(vPos);
        float n1 = fbm(p * 4.0 + vec3(uTime * 0.03, 0.0, uTime * 0.02));
        float n2 = fbm(p * 14.0 - vec3(0.0, uTime * 0.05, 0.0));
        float gran = 0.55 + 0.45 * (n1 * 0.8 + n2 * 0.5);
        float spots = smoothstep(0.42, 0.55, fbm(p * 2.2 + 11.0)) * 0.55;
        float mu = clamp(dot(vNormal, vView), 0.0, 1.0);
        float limb = pow(mu, 0.45);
        vec3 hot = mix(uColor, vec3(1.0, 0.98, 0.9), 0.55);
        vec3 col = mix(uColor * 0.55, hot, gran) * (1.0 - spots);
        col *= limb;
        col += uColor * pow(1.0 - mu, 3.0) * 0.6;
        gl_FragColor = vec4(col * uIntensity, 1.0);
      }
    `,
  });
}

/**
 * Atmospheric halo drawn on the back faces of a slightly larger shell, so it is
 * brightest right at the planet's limb and fades to nothing at the shell edge.
 * `shellScale` is the shell radius relative to the planet.
 */
export function atmosphereMaterial(color: THREE.Color, strength = 1, shellScale = 1.05): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: color.clone() },
      uStrength: { value: strength },
      uSunPos: { value: new THREE.Vector3() },
      uEdge: { value: Math.sqrt(1 - 1 / (shellScale * shellScale)) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormalW;
      varying vec3 vPosW;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vPosW = w.xyz;
        vNormalW = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uStrength;
      uniform vec3 uSunPos;
      uniform float uEdge;
      varying vec3 vNormalW;
      varying vec3 vPosW;
      void main() {
        vec3 viewDir = normalize(cameraPosition - vPosW);
        vec3 sunDir = normalize(uSunPos - vPosW);
        // Back faces: 0 at the shell silhouette, uEdge where the shell meets the planet limb.
        float t = clamp(-dot(vNormalW, viewDir) / uEdge, 0.0, 1.0);
        float glow = pow(t, 2.2);
        float lit = smoothstep(-0.45, 0.5, dot(vNormalW, sunDir));
        float a = glow * (0.08 + lit) * uStrength;
        gl_FragColor = vec4(uColor * a, a);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.BackSide,
  });
}
