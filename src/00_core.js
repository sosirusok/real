import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ============================================================================
// Core: renderer, scene, camera, shared uniforms, math + noise helpers
// World units are metres. +X east, +Z south (toward the sea), +Y up.
// ============================================================================

const $ = (id) => document.getElementById(id);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const TAU = Math.PI * 2;

const IS_TOUCH = matchMedia('(pointer: coarse)').matches;
const QUALITY = {
  low:    { pr: 0.7,  pixels: 1200000, shadow: 2048, msaa: 0, refl: 0,    cloudSteps: 12, rays: 24, grass: 0.3, trees: 0.45, bloom: true },
  medium: { pr: 0.9,  pixels: 2000000, shadow: 2048, msaa: 2, refl: 0.4,  cloudSteps: 18, rays: 36, grass: 0.6, trees: 0.7, bloom: true },
  high:   { pr: 1.0,  pixels: 3200000, shadow: 4096, msaa: 4, refl: 0.5,  cloudSteps: 24, rays: 48, grass: 1.0, trees: 1.0, bloom: true },
  ultra:  { pr: 1.5,  pixels: 5000000, shadow: 4096, msaa: 4, refl: 0.75, cloudSteps: 32, rays: 64, grass: 1.0, trees: 1.0, bloom: true },
};
let qualityName = IS_TOUCH ? 'low' : 'high';
let Qs = QUALITY[qualityName];

const canvas = $('world');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,
  powerPreference: 'high-performance',
  stencil: false,
});
// Bound allocation by physical pixels: DPR 2 + Ultra otherwise allocates
// hundreds of MB for each HDR/MSAA target on a large desktop display.
function renderPixelRatio(w = innerWidth, h = innerHeight) {
  return Math.min(Math.min(window.devicePixelRatio || 1, 2) * Qs.pr,
    Math.sqrt(Qs.pixels / Math.max(1, w * h)), renderer.capabilities.maxTextureSize / Math.max(1, w, h));
}
renderer.setPixelRatio(renderPixelRatio());
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = true;
renderer.debug.checkShaderErrors = true;

const RENDER_CAPS = (() => {
  const gl = renderer.getContext();
  const hdr = renderer.extensions.has('EXT_color_buffer_float');
  const colour = gl.getInternalformatParameter(gl.RENDERBUFFER, hdr ? gl.RGBA16F : gl.RGBA8, gl.SAMPLES) || [];
  const depth = gl.getInternalformatParameter(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, gl.SAMPLES) || [];
  return {
    type: hdr ? THREE.HalfFloatType : THREE.UnsignedByteType,
    hdr,
    samples: Array.from(colour).filter((n) => Array.from(depth).includes(n)),
  };
})();
function renderSamples() {
  return RENDER_CAPS.samples.reduce((best, n) => n <= Qs.msaa ? Math.max(best, n) : best, 0);
}

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 14000);
camera.position.set(-60, 30, 260);

// Layers: 0 default, 1 = skip in water reflection (grass, small particles)
const LAYER_NOREFLECT = 1;
camera.layers.enable(LAYER_NOREFLECT);

// ---------------------------------------------------------------------------
// Seeded random
// ---------------------------------------------------------------------------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260926);
const rr = (a, b) => a + (b - a) * rand();
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

// ---------------------------------------------------------------------------
// 2D simplex noise (JS) for terrain + placement
// ---------------------------------------------------------------------------
const Simplex = (() => {
  const grad = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
  const perm = new Uint8Array(512);
  const r = mulberry32(1337);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
  function noise(xin, yin) {
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s), j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t), y0 = yin - (j - t);
    const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255;
    let n0 = 0, n1 = 0, n2 = 0;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) { const g = grad[perm[ii + perm[jj]] & 7]; t0 *= t0; n0 = t0 * t0 * (g[0] * x0 + g[1] * y0); }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) { const g = grad[perm[ii + i1 + perm[jj + j1]] & 7]; t1 *= t1; n1 = t1 * t1 * (g[0] * x1 + g[1] * y1); }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) { const g = grad[perm[ii + 1 + perm[jj + 1]] & 7]; t2 *= t2; n2 = t2 * t2 * (g[0] * x2 + g[1] * y2); }
    return 70 * (n0 + n1 + n2); // ~[-1,1]
  }
  return { noise };
})();
const sn = Simplex.noise;
function fbm(x, y, oct = 5, lac = 2.0, gain = 0.5) {
  let a = 1, f = 1, s = 0, n = 0;
  for (let i = 0; i < oct; i++) { s += a * sn(x * f, y * f); n += a; a *= gain; f *= lac; }
  return s / n;
}
function ridged(x, y, oct = 5) {
  let a = 1, f = 1, s = 0, n = 0, w = 1;
  for (let i = 0; i < oct; i++) {
    let v = 1 - Math.abs(sn(x * f, y * f));
    v *= v; v *= w; w = clamp(v * 1.6, 0, 1);
    s += a * v; n += a; a *= 0.5; f *= 2.03;
  }
  return s / n;
}

// Periodic gradient noise for tileable textures
function makePeriodicNoise(seed) {
  const r = mulberry32(seed);
  const G = new Float32Array(256 * 2);
  for (let i = 0; i < 256; i++) { const a = r() * TAU; G[i * 2] = Math.cos(a); G[i * 2 + 1] = Math.sin(a); }
  const P = new Uint8Array(256);
  for (let i = 0; i < 256; i++) P[i] = i;
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [P[i], P[j]] = [P[j], P[i]]; }
  const h = (x, y) => P[(P[x & 255] + y) & 255];
  return function (x, y, per) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10), v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
    const x0 = ((xi % per) + per) % per, y0 = ((yi % per) + per) % per;
    const x1 = (x0 + 1) % per, y1 = (y0 + 1) % per;
    const d = (ix, iy, dx, dy) => { const g = h(ix, iy) * 2; return G[g] * dx + G[g + 1] * dy; };
    const a = d(x0, y0, xf, yf), b = d(x1, y0, xf - 1, yf), c = d(x0, y1, xf, yf - 1), e = d(x1, y1, xf - 1, yf - 1);
    return lerp(lerp(a, b, u), lerp(c, e, u), v) * 1.414;
  };
}

// ---------------------------------------------------------------------------
// Shared uniforms (same objects are injected into every patched material)
// ---------------------------------------------------------------------------
const G = {
  uTime: { value: 0 },
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },     // direction TO sun (or moon at night)
  uSunCol: { value: new THREE.Color(1, 1, 1) },       // direct light colour * intensity
  uTrueSun: { value: new THREE.Vector3(0, 1, 0) },    // real sun direction (for sky)
  uFogCol: { value: new THREE.Color(0.6, 0.7, 0.8) },
  uFogSunCol: { value: new THREE.Color(1, 0.8, 0.6) },
  uFogDensity: { value: 0.0004 },
  uFogFalloff: { value: 0.006 },
  uWind: { value: new THREE.Vector4(0.447, -0.894, 0.45, 0) }, // dir.x, dir.z (blowing toward), strength 0..1, advected offset
  uNoise: { value: null },
  uCloudOff: { value: new THREE.Vector2() },
  uCloudCover: { value: 0.42 },
  uNight: { value: 0 },        // 0 day .. 1 night (lamps, windows)
  uDay: { value: 1 },          // ambient daylight scale for interiors
  uHeight: { value: null },
  uMask: { value: null },
  uPlayer: { value: new THREE.Vector3(0, -100, 0) },
  uZenith: { value: new THREE.Color() },
  uHorizon: { value: new THREE.Color() },
};

// Loading progress
const loadSteps = [];
async function step(label, fn) {
  const el = $('load-step');
  if (el) el.textContent = label;
  const bar = $('load-bar');
  loadSteps.push(label);
  if (bar) bar.style.transform = `scaleX(${Math.min(1, loadSteps.length / 14)})`;
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
  return fn();
}
