// ============================================================================
// Shader library: shared GLSL + a material patch system that injects world
// position, custom height fog, cloud shadows and per-material hooks into
// three.js built-in materials (so shadows/IBL/lights keep working).
// ============================================================================

const WORLD = 2400;       // terrain extent (m)
const HM_SEG = 768;       // terrain segments; heightmap has HM_SEG+1 texels per side
const HM_N = HM_SEG + 1;
const MASK_N = 2048;      // surface mask resolution over WORLD

const GLSL_COMMON = /* glsl */ `
#define WORLD ${WORLD.toFixed(1)}
#define HM_N ${HM_N.toFixed(1)}
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform vec3 uTrueSun;
uniform vec3 uFogCol;
uniform vec3 uFogSunCol;
uniform float uFogDensity;
uniform float uFogFalloff;
uniform vec4 uWind;
uniform sampler2D uNoise;
uniform vec2 uCloudOff;
uniform float uCloudCover;
uniform float uNight;
uniform float uDay;
uniform sampler2D uHeight;
uniform sampler2D uMask;
uniform vec3 uPlayer;
uniform vec3 uZenith;
uniform vec3 uHorizon;

float hash11(float p) { p = fract(p * .1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
vec3 hash32(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yxz + 33.33); return fract((p3.xxy + p3.yzz) * p3.zyx); }

vec2 hmUV(vec2 xz) { return ((xz + WORLD * 0.5) / WORLD * (HM_N - 1.0) + 0.5) / HM_N; }
float terrainH(vec2 xz) { return texture2D(uHeight, hmUV(xz)).r; }
vec2 maskUV(vec2 xz) { return (xz + WORLD * 0.5) / WORLD; }

float windGust(vec2 xz) {
  vec2 uv = (xz - uWind.xy * uWind.w) * 0.0045;
  float g = texture2D(uNoise, uv).g;
  return smoothstep(0.25, 0.85, g);
}
// displacement of a flexible object anchored at 'root' with height factor h (0..1)
vec3 windBend(vec2 root, float h, float stiff, float phase) {
  float s = uWind.z;
  float gust = windGust(root);
  float sway = sin(uTime * (1.3 + s) + phase) * 0.35 + sin(uTime * 2.7 + phase * 1.7) * 0.15;
  float amt = (s * (0.35 + 0.9 * gust) + sway * (0.15 + 0.5 * s)) * h * h / stiff;
  return vec3(uWind.x, 0.0, uWind.y) * amt;
}

float cloudCov(vec2 xz) {
  vec2 uv = (xz + uCloudOff) * 0.000055;
  float n = textureLod(uNoise, uv, 0.0).r * 0.7 + textureLod(uNoise, uv * 2.3 + 0.37, 0.0).g * 0.3;
  float t = 1.0 - uCloudCover;
  return smoothstep(t - 0.08, t + 0.28, n);
}
float cloudShadow(vec3 wp) {
  vec3 sd = uTrueSun;
  float k = smoothstep(-0.05, 0.08, sd.y);
  if (k <= 0.0) return 1.0;
  vec2 p = wp.xz + sd.xz / max(sd.y, 0.12) * (1650.0 - wp.y);
  float c = cloudCov(p);
  return mix(1.0, 1.0 - 0.72 * smoothstep(0.05, 0.55, c), k);
}

vec3 fogColorDir(vec3 v) {
  vec2 dh = normalize(v.xz + 1e-5), sh = normalize(uTrueSun.xz + 1e-5);
  float azs = dot(dh, sh) * 0.5 + 0.5;
  vec3 cool = mix(uFogCol, uZenith * 1.35 + vec3(0.02), 0.42);
  vec3 base = mix(cool, uFogCol, pow(azs, 1.6));
  float s = pow(max(dot(v, uTrueSun), 0.0), 7.0);
  return mix(base, uFogSunCol, s);
}
vec3 applyFog(vec3 col, vec3 wp) {
  vec3 d = wp - cameraPosition;
  float dist = length(d);
  vec3 v = d / max(dist, 1e-3);
  float b = uFogFalloff;
  float vy = v.y;
  if (abs(vy) < 1e-4) vy = 1e-4;
  float h0 = max(cameraPosition.y, -20.0);
  float fi = uFogDensity * exp(-b * h0) * (1.0 - exp(-b * vy * dist)) / (b * vy);
  float f = 1.0 - exp(-max(fi, 0.0));
  return mix(col, fogColorDir(v), clamp(f, 0.0, 1.0));
}
float fogAmount(vec3 wp) {
  vec3 d = wp - cameraPosition;
  float dist = length(d);
  vec3 v = d / max(dist, 1e-3);
  float b = uFogFalloff;
  float vy = v.y;
  if (abs(vy) < 1e-4) vy = 1e-4;
  float h0 = max(cameraPosition.y, -20.0);
  float fi = uFogDensity * exp(-b * h0) * (1.0 - exp(-b * vy * dist)) / (b * vy);
  return clamp(1.0 - exp(-max(fi, 0.0)), 0.0, 1.0);
}
vec3 fogColorFor(vec3 wp) {
  return fogColorDir(normalize(wp - cameraPosition));
}
`;

// directional light loop with a hook after the shadow term
const LFB = THREE.ShaderChunk.lights_fragment_begin;
const LFB_HOOKED = (() => {
  const i0 = LFB.indexOf('#if ( NUM_DIR_LIGHTS > 0 )');
  const i1 = LFB.indexOf('RE_Direct( directLight', i0);
  return LFB.slice(0, i1) + '/*DIRX*/\n\t\t' + LFB.slice(i1);
})();

/**
 * Patch a built-in material.
 * o: { key, uniforms, vHead, vNormal, vBegin, vEnd, fHead, fColor, fRough,
 *      fNormal, fEmissive, fDir, fOut, noFog }
 */
function patch(mat, o = {}) {
  const key = o.key || mat.type;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, G);
    if (o.uniforms) Object.assign(sh.uniforms, o.uniforms);
    let vs = sh.vertexShader;
    let fs = sh.fragmentShader;
    vs = vs.replace('#include <common>', '#include <common>\n' + GLSL_COMMON + '\nvarying vec3 vWPos;\n' + (o.vHead || ''));
    if (o.vNormal) vs = vs.replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n' + o.vNormal);
    if (o.vBegin) vs = vs.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + o.vBegin);
    const wpos = `
      { vec4 wp4 = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        wp4 = instanceMatrix * wp4;
      #endif
        vWPos = (modelMatrix * wp4).xyz; }
    `;
    if (vs.includes('#include <fog_vertex>')) {
      vs = vs.replace('#include <fog_vertex>', '#include <fog_vertex>\n' + wpos + (o.vEnd || ''));
    } else {
      vs = vs.replace('#include <project_vertex>', '#include <project_vertex>\n' + wpos + (o.vEnd || ''));
    }
    fs = fs.replace('#include <common>', '#include <common>\n' + GLSL_COMMON + '\nvarying vec3 vWPos;\n');
    if (fs.includes('#include <clipping_planes_pars_fragment>')) fs = fs.replace('#include <clipping_planes_pars_fragment>', '#include <clipping_planes_pars_fragment>\n' + (o.fHead || ''));
    else fs = fs.replace('void main() {', (o.fHead || '') + '\nvoid main() {');
    if (o.fColor) fs = fs.replace('#include <color_fragment>', '#include <color_fragment>\n' + o.fColor);
    if (o.fRough) fs = fs.replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n' + o.fRough);
    if (o.fNormal) fs = fs.replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + o.fNormal);
    if (o.fEmissive) fs = fs.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + o.fEmissive);
    fs = fs.replace('#include <lights_fragment_begin>', LFB_HOOKED.replace('/*DIRX*/', 'directLight.color *= cloudShadow(vWPos);\n' + (o.fDir || '')));
    if (o.fMaps) fs = fs.replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\n' + o.fMaps);
    if (o.fOut) fs = fs.replace('#include <opaque_fragment>', o.fOut + '\n#include <opaque_fragment>');
    if (o.fog) fs = fs.replace('#include <fog_fragment>', o.fog);
    else if (!o.noFog) fs = fs.replace('#include <fog_fragment>', 'gl_FragColor.rgb = applyFog(gl_FragColor.rgb, vWPos);');
    sh.vertexShader = vs;
    sh.fragmentShader = fs;
    if (o.after) o.after(sh);
  };
  mat.customProgramCacheKey = () => 'yp-' + key;
  return mat;
}

// Depth material for shadow casting of vertex-animated meshes
function depthFor(o, base = {}) {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, ...base });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, G);
    if (o.uniforms) Object.assign(sh.uniforms, o.uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + GLSL_COMMON + '\n' + (o.vHead || ''))
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + (o.vDepthBegin || o.vBegin || ''));
  };
  m.customProgramCacheKey = () => 'ypd-' + (o.key || 'x');
  return m;
}

// Simple geometry accumulator for merged static meshes
class GeoBuilder {
  constructor(extra = {}, defaults = {}) {
    this.pos = []; this.nrm = []; this.uv = []; this.col = []; this.idx = [];
    this.defaults = defaults;
    this.extra = {}; // name -> {size, data}
    for (const k in extra) this.extra[k] = { size: extra[k], data: [] };
    this.vcount = 0;
  }
  // Append a BufferGeometry transformed by matrix, with constant per-vertex values
  add(g, m, color = [1, 1, 1], ex = {}) {
    const gg = g.index ? g : g;
    const p = gg.attributes.position, n = gg.attributes.normal, t = gg.attributes.uv;
    const v = new THREE.Vector3(), nn = new THREE.Vector3();
    const nm = new THREE.Matrix3().getNormalMatrix(m);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m);
      this.pos.push(v.x, v.y, v.z);
      if (n) { nn.fromBufferAttribute(n, i).applyMatrix3(nm).normalize(); this.nrm.push(nn.x, nn.y, nn.z); } else this.nrm.push(0, 1, 0);
      if (t) this.uv.push(t.getX(i), t.getY(i)); else this.uv.push(0, 0);
      this.col.push(color[0], color[1], color[2]);
      for (const k in this.extra) {
        const e = this.extra[k];
        const val = ex[k] !== undefined ? ex[k] : this.defaults[k] !== undefined ? this.defaults[k] : new Array(e.size).fill(0);
        if (typeof val === 'function') { const r = val(v, i); for (let j = 0; j < e.size; j++) e.data.push(r[j]); }
        else for (let j = 0; j < e.size; j++) e.data.push(Array.isArray(val) ? val[j] : val);
      }
    }
    if (gg.index) { for (let i = 0; i < gg.index.count; i++) this.idx.push(this.vcount + gg.index.getX(i)); }
    else { for (let i = 0; i < p.count; i++) this.idx.push(this.vcount + i); }
    this.vcount += p.count;
  }
  // Raw quad: 4 corners (Vector3), normal, uvs [[u,v]x4]
  quad(a, b, c, d, n, uvs, color = [1, 1, 1], ex = {}) {
    const base = this.vcount;
    const P = [a, b, c, d];
    for (let i = 0; i < 4; i++) {
      this.pos.push(P[i].x, P[i].y, P[i].z);
      this.nrm.push(n.x, n.y, n.z);
      this.uv.push(uvs[i][0], uvs[i][1]);
      this.col.push(color[0], color[1], color[2]);
      for (const k in this.extra) {
        const e = this.extra[k];
        const val = ex[k] !== undefined ? ex[k] : this.defaults[k] !== undefined ? this.defaults[k] : new Array(e.size).fill(0);
        for (let j = 0; j < e.size; j++) e.data.push(Array.isArray(val) ? val[j] : val);
      }
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    this.vcount += 4;
  }
  tri(a, b, c, n, uvs, color = [1, 1, 1], ex = {}) {
    const base = this.vcount;
    const P = [a, b, c];
    for (let i = 0; i < 3; i++) {
      this.pos.push(P[i].x, P[i].y, P[i].z);
      this.nrm.push(n.x, n.y, n.z);
      this.uv.push(uvs[i][0], uvs[i][1]);
      this.col.push(color[0], color[1], color[2]);
      for (const k in this.extra) {
        const e = this.extra[k];
        const val = ex[k] !== undefined ? ex[k] : this.defaults[k] !== undefined ? this.defaults[k] : new Array(e.size).fill(0);
        for (let j = 0; j < e.size; j++) e.data.push(Array.isArray(val) ? val[j] : val);
      }
    }
    this.idx.push(base, base + 1, base + 2);
    this.vcount += 3;
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    for (const k in this.extra) g.setAttribute(k, new THREE.Float32BufferAttribute(this.extra[k].data, this.extra[k].size));
    g.setIndex(this.vcount > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

const srgb = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; }; // Color() converts to linear
