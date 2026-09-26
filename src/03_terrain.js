// ============================================================================
// Terrain: coastline, harbour, hills, mountains, headland, canal + pond carve
// ============================================================================

const CITY = {
  x0: -236, x1: 236, z0: -222, z1: 146,
  ground: 1.9,       // lawn / courtyard level
  road: 2.02,        // carriageway top
  walk: 2.17,        // sidewalk / quay top
  streetsX: [-230, -174, -118, -62, 0, 62, 118, 174, 230],
  streetsZ: [-216, -160, -104, -48, 8, 64, 112],
  streetW: 12,
  canal: { half: 8, walk: 5, z0: -150, z1: 146, floor: -3.4 },
  quayZ: 146,
  park: { x0: 124, x1: 224, z0: -210, z1: -110 },
  pond: { x: 174, z: -160, r: 23 },
  plaza: { x0: 13, x1: 56, z0: -42, z1: 2 },
  promenade: { z0: 118, z1: 146 },
};
const HEAD = { x: 440, z: 205, rx: 185, rz: 140 };

function coastZ(x) {
  return 150 + 28 * Math.sin(x * 0.0042 + 1.1) + 16 * fbm(x * 0.003 + 5, 3.3, 3);
}

function naturalHeight(x, z) {
  const s = coastZ(x) - z; // metres inland (+) / offshore (-)
  const n1 = fbm(x * 0.0021, z * 0.0021, 5);
  const north = smoothstep(-200, -760, z);
  const side = Math.max(smoothstep(-300, -720, x), smoothstep(560, 900, x));
  const hillAmp = 8 + 60 * north + 42 * side;
  const sp = Math.max(s, 0);
  let land = 2.3 * (1 - Math.exp(-sp / 22)) + sp * 0.011 + (n1 * 0.5 + 0.5) * hillAmp * smoothstep(12, 170, s);
  const mN = smoothstep(-460, -1150, z);
  if (mN > 0) {
    const m = fbm(x * 0.0011 + 7.3, z * 0.0011 - 1.7, 5) * 0.5 + 0.5;
    const mt = Math.max(0, m - 0.22) / 0.78;
    land += Math.pow(mt, 1.35) * 340 * mN + ridged(x * 0.0024 + 2, z * 0.0024, 4) * 34 * mN;
  }
  const sea = Math.max(-42, s * 0.085 - 0.35) + fbm(x * 0.012, z * 0.012, 2) * 0.7;
  let h = lerp(sea, land, smoothstep(-7, 3, s));

  // headland plateau with cliffs (east)
  const ex = (x - HEAD.x) / HEAD.rx, ez = (z - HEAD.z) / HEAD.rz;
  const e = Math.sqrt(ex * ex + ez * ez) + fbm(x * 0.012, z * 0.012, 3) * 0.1;
  const m = smoothstep(1.03, 0.9, e);
  if (m > 0) {
    const hp = 30 + fbm(x * 0.009 + 3, z * 0.009, 4) * 5 + smoothstep(0.85, 0.15, e) * 12;
    h = Math.max(h, lerp(h, hp, m));
  }
  return h;
}

function cityHeight(x, z, h) {
  const C = CITY;
  // land part of the city
  const dx = Math.max(C.x0 - x, x - C.x1, 0);
  const dzN = Math.max(C.z0 - z, 0);
  const dzS = Math.max(z - C.z1, 0);
  const d = Math.hypot(dx, dzN, dzS * 3);
  const cm = 1 - smoothstep(0, 42, d);
  h = lerp(h, C.ground, cm);

  // harbour basin in front of the quay
  const inX = 1 - smoothstep(C.x1 + 6, C.x1 + 60, Math.abs(x));
  const hm = inX * smoothstep(C.z1 - 0.5, C.z1 + 1.5, z);
  const harbour = Math.max(-30, -7.5 - (z - C.z1) * 0.035) + fbm(x * 0.02, z * 0.02, 2) * 0.5;
  h = lerp(h, Math.min(h, harbour), hm);

  // canal (carved slightly wider than the water; quay walls hide the step)
  if (Math.abs(x) < C.canal.half + 2.2 && z > C.canal.z0 - 2 && z < C.z1 + 4) h = Math.min(h, C.canal.floor);

  // park: gentle mounds + pond
  const P = C.park;
  if (x > P.x0 && x < P.x1 && z > P.z0 && z < P.z1) {
    const edge = Math.min(x - P.x0, P.x1 - x, z - P.z0, P.z1 - z);
    const mound = Math.max(0, fbm(x * 0.028 + 9, z * 0.028, 3)) * 1.5 * smoothstep(4, 16, edge);
    h = C.ground + mound;
    const pd = Math.hypot(x - C.pond.x, z - C.pond.z);
    const ang = Math.atan2(z - C.pond.z, x - C.pond.x);
    const pr = C.pond.r * (1 + 0.16 * Math.sin(ang * 3 + 0.7) + 0.08 * Math.sin(ang * 5 + 2.1));
    const t = smoothstep(0.55, 1.08, pd / pr);
    h = Math.min(h, lerp(-2.0, C.ground + mound * t, t));
  }
  return h;
}

function worldHeight(x, z) {
  return cityHeight(x, z, naturalHeight(x, z));
}

// --- heightmap build + CPU sampling ------------------------------------------
const HM = new Float32Array(HM_N * HM_N);
const HM_STEP = WORLD / HM_SEG;
function buildHeightmap() {
  for (let j = 0; j < HM_N; j++) {
    const z = -WORLD / 2 + j * HM_STEP;
    for (let i = 0; i < HM_N; i++) {
      const x = -WORLD / 2 + i * HM_STEP;
      HM[j * HM_N + i] = worldHeight(x, z);
    }
  }
  const half = new Uint16Array(HM_N * HM_N);
  for (let i = 0; i < HM.length; i++) half[i] = THREE.DataUtils.toHalfFloat(HM[i]);
  const t = new THREE.DataTexture(half, HM_N, HM_N, THREE.RedFormat, THREE.HalfFloatType);
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  G.uHeight.value = t;
}
function heightAt(x, z) {
  const fx = clamp((x + WORLD / 2) / HM_STEP, 0, HM_SEG - 0.001);
  const fz = clamp((z + WORLD / 2) / HM_STEP, 0, HM_SEG - 0.001);
  const i = Math.floor(fx), j = Math.floor(fz);
  const u = fx - i, v = fz - j;
  const a = HM[j * HM_N + i], b = HM[j * HM_N + i + 1], c = HM[(j + 1) * HM_N + i], d = HM[(j + 1) * HM_N + i + 1];
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
function slopeAt(x, z) {
  const e = 2.5;
  const dx = (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e);
  const dz = (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
  return Math.sqrt(dx * dx + dz * dz);
}
function inCityLand(x, z, pad = 0) {
  return x > CITY.x0 - pad && x < CITY.x1 + pad && z > CITY.z0 - pad && z < CITY.z1 + pad;
}

// CPU sample of the shared noise texture (so placement matches shader patterns)
function noiseAt(u, v, ch) {
  const img = TEX.noise.image; const N = img.width;
  const x = (((u * N - 0.5) % N) + N) % N, y = (((v * N - 0.5) % N) + N) % N;
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const i1 = (i + 1) % N, j1 = (j + 1) % N;
  const d = img.data;
  const g = (a, b) => d[(b * N + a) * 4 + ch] / 255;
  return lerp(lerp(g(i, j), g(i1, j), fx), lerp(g(i, j1), g(i1, j1), fx), fy);
}
function forestDensity(x, z) {
  const n = noiseAt(x * 0.0016, z * 0.0016, 1);
  return smoothstep(0.45, 0.66, n);
}

// --- surface mask (R grass, G flowers, B sand, A path) -----------------------
const MASK = new Uint8Array(MASK_N * MASK_N * 4);
const MPX = WORLD / MASK_N;
function maskIndex(x, z) {
  const i = Math.floor((x + WORLD / 2) / MPX), j = Math.floor((z + WORLD / 2) / MPX);
  if (i < 0 || j < 0 || i >= MASK_N || j >= MASK_N) return -1;
  return (j * MASK_N + i) * 4;
}
function maskRect(x0, z0, x1, z1, fn) {
  const i0 = Math.max(0, Math.floor((x0 + WORLD / 2) / MPX)), i1 = Math.min(MASK_N - 1, Math.ceil((x1 + WORLD / 2) / MPX));
  const j0 = Math.max(0, Math.floor((z0 + WORLD / 2) / MPX)), j1 = Math.min(MASK_N - 1, Math.ceil((z1 + WORLD / 2) / MPX));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const x = -WORLD / 2 + (i + 0.5) * MPX, z = -WORLD / 2 + (j + 0.5) * MPX;
    fn((j * MASK_N + i) * 4, x, z);
  }
}
function buildNaturalMask() {
  for (let j = 0; j < MASK_N; j++) {
    const z = -WORLD / 2 + (j + 0.5) * MPX;
    for (let i = 0; i < MASK_N; i++) {
      const x = -WORLD / 2 + (i + 0.5) * MPX;
      const k = (j * MASK_N + i) * 4;
      const h = heightAt(x, z);
      const sl = slopeAt(x, z);
      const s = coastZ(x) - z;
      let sand = (1 - smoothstep(1.6, 3.2, h + fbm(x * 0.05, z * 0.05, 2) * 0.8)) * (1 - smoothstep(0.35, 0.6, sl));
      if (h < 0.4) sand = 1;
      // cliff tops and the headland stay grassy
      let grass = (1 - sand) * (1 - smoothstep(0.45, 0.75, sl)) * (1 - smoothstep(380, 440, h));
      const meadow = smoothstep(0.55, 0.75, noiseAt(x * 0.004 + 0.3, z * 0.004, 2));
      const flowers = grass * meadow * (1 - smoothstep(120, 240, h));
      MASK[k] = grass * 255;
      MASK[k + 1] = flowers * 255;
      MASK[k + 2] = sand * 255;
      MASK[k + 3] = 0;
      void s;
    }
  }
}
function finishMask() {
  const t = new THREE.DataTexture(MASK, MASK_N, MASK_N, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  G.uMask.value = t;
}

// --- terrain material ---------------------------------------------------------
function makeTerrainMaterial() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
  patch(mat, {
    key: 'terrain',
    vHead: 'varying vec3 vNormW;',
    vEnd: 'vNormW = normalize(objectNormal);',
    fHead: /* glsl */ `
      varying vec3 vNormW;
      float tRough; vec3 tN;
    `,
    fColor: /* glsl */ `
      vec3 N0 = normalize(vNormW);
      vec2 xz = vWPos.xz;
      float y = vWPos.y;
      vec4 m = texture2D(uMask, maskUV(xz));
      float slope = 1.0 - N0.y;
      float nA = texture2D(uNoise, xz * 0.0021).r;
      float nB = texture2D(uNoise, xz * 0.017).g;
      float nC = texture2D(uNoise, xz * 0.11).b;
      float nD = texture2D(uNoise, xz * 0.61).a;
      float nE = texture2D(uNoise, xz * 0.0016).g;
      vec3 gA = vec3(0.075, 0.16, 0.028), gB = vec3(0.16, 0.24, 0.05), gDry = vec3(0.33, 0.30, 0.12);
      vec3 grass = mix(gA, gB, smoothstep(0.25, 0.75, nA));
      grass = mix(grass, gDry, smoothstep(0.58, 0.9, nB) * 0.5);
      grass *= 0.82 + 0.32 * nC;
      float forest = smoothstep(0.45, 0.66, nE) * smoothstep(6.0, 30.0, y);
      grass = mix(grass, vec3(0.045, 0.06, 0.025), forest * 0.85);
      grass = mix(grass, grass * vec3(1.25, 1.1, 0.7), smoothstep(0.6, 0.8, texture2D(uNoise, xz * 0.006 + 0.4).b) * 0.6);
      vec3 dirt = vec3(0.23, 0.17, 0.11) * (0.8 + 0.4 * nC);
      vec3 sand = vec3(0.70, 0.62, 0.47) * (0.9 + 0.16 * nD);
      float wet = 1.0 - smoothstep(0.15, 1.1, y);
      sand = mix(sand, sand * 0.5, wet);
      vec3 rock = mix(vec3(0.34, 0.32, 0.29), vec3(0.50, 0.47, 0.42), nB) * (0.72 + 0.38 * nD);
      rock *= 0.86 + 0.14 * sin(y * 1.9 + nC * 5.0);
      vec3 path = vec3(0.55, 0.50, 0.41) * (0.85 + 0.25 * nD);
      float wRock = smoothstep(0.30, 0.52, slope + (nC - 0.5) * 0.22);
      vec3 col = mix(dirt, grass, clamp(m.r * 1.3, 0.0, 1.0));
      col = mix(col, sand, m.b);
      col = mix(col, path, m.a);
      col = mix(col, rock, wRock);
      float wSnow = smoothstep(360.0, 440.0, y + nB * 70.0) * (1.0 - wRock * 0.55);
      col = mix(col, vec3(0.86, 0.89, 0.93), wSnow);
      tRough = mix(0.95, 0.9, m.b);
      tRough = mix(tRough, 0.35, wet * m.b);
      tRough = mix(tRough, 0.82, wRock);
      tRough = mix(tRough, 0.6, wSnow);
      // micro relief
      float e = 0.35;
      float bumpK = mix(0.25, 1.4, max(wRock, m.b * 0.6)) + m.a * 0.4;
      float h0 = texture2D(uNoise, xz * 0.61).a + texture2D(uNoise, xz * 2.3).b * 0.5;
      float hx = texture2D(uNoise, (xz + vec2(e, 0.0)) * 0.61).a + texture2D(uNoise, (xz + vec2(e, 0.0)) * 2.3).b * 0.5;
      float hz = texture2D(uNoise, (xz + vec2(0.0, e)) * 0.61).a + texture2D(uNoise, (xz + vec2(0.0, e)) * 2.3).b * 0.5;
      // sand ripples
      float rip = sin(dot(xz, vec2(0.9, 0.45)) * 3.2 + nC * 6.0) * 0.08 * m.b * (1.0 - wet);
      tN = normalize(N0 + vec3(-(hx - h0) / e, 0.0, -(hz - h0) / e) * 0.12 * bumpK + vec3(rip * 0.9, 0.0, rip * 0.45));
      // underwater tint + caustics
      if (y < 0.4) {
        float depth = max(-y, 0.0);
        vec2 cp = xz * 0.09;
        float c1 = texture2D(uNoise, cp + vec2(uTime * 0.021, uTime * 0.013)).a;
        float c2 = texture2D(uNoise, cp * 1.23 - vec2(uTime * 0.017, -uTime * 0.019)).a;
        float caus = pow(1.0 - abs(c1 - c2), 14.0);
        float sunUp = smoothstep(0.0, 0.3, uTrueSun.y);
        col *= mix(vec3(1.0), vec3(0.42, 0.66, 0.64), smoothstep(0.0, 3.5, depth));
        col *= 1.0 + caus * 2.6 * exp(-depth * 0.25) * sunUp * (1.0 - smoothstep(-0.2, 0.3, y));
      }
      diffuseColor.rgb = col;
    `,
    fRough: 'roughnessFactor = tRough;',
    fNormal: 'normal = normalize((viewMatrix * vec4(tN, 0.0)).xyz);',
  });
  return mat;
}

// --- chunked terrain mesh with LOD + skirts ----------------------------------
function terrainNormal(i, j) {
  const g = (a, b) => HM[clamp(b, 0, HM_SEG) * HM_N + clamp(a, 0, HM_SEG)];
  const dx = (g(i + 1, j) - g(i - 1, j)) / (2 * HM_STEP);
  const dz = (g(i, j + 1) - g(i, j - 1)) / (2 * HM_STEP);
  const l = Math.sqrt(dx * dx + 1 + dz * dz);
  return [-dx / l, 1 / l, -dz / l];
}
function buildTerrainChunk(ci, cj, csz, stepN) {
  const n = csz / stepN; // quads per side
  const pos = [], nrm = [], idx = [];
  const i0 = ci * csz, j0 = cj * csz;
  for (let b = 0; b <= n; b++) for (let a = 0; a <= n; a++) {
    const i = i0 + a * stepN, j = j0 + b * stepN;
    pos.push(-WORLD / 2 + i * HM_STEP, HM[j * HM_N + i], -WORLD / 2 + j * HM_STEP);
    nrm.push(...terrainNormal(i, j));
  }
  for (let b = 0; b < n; b++) for (let a = 0; a < n; a++) {
    const p = b * (n + 1) + a;
    idx.push(p, p + n + 1, p + 1, p + 1, p + n + 1, p + n + 2);
  }
  // skirts
  const addSkirt = (list) => {
    const base = pos.length / 3;
    for (const v of list) {
      pos.push(pos[v * 3], pos[v * 3 + 1] - 6, pos[v * 3 + 2]);
      nrm.push(nrm[v * 3], nrm[v * 3 + 1], nrm[v * 3 + 2]);
    }
    for (let k = 0; k < list.length - 1; k++) {
      const a = list[k], b = list[k + 1], c = base + k, d = base + k + 1;
      idx.push(a, c, b, b, c, d, a, b, c, b, d, c);
    }
  };
  const row = (b) => Array.from({ length: n + 1 }, (_, a) => b * (n + 1) + a);
  const col = (a) => Array.from({ length: n + 1 }, (_, b) => b * (n + 1) + a);
  addSkirt(row(0)); addSkirt(row(n)); addSkirt(col(0)); addSkirt(col(n));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

let terrainGroup;
function buildTerrain() {
  const mat = makeTerrainMaterial();
  terrainGroup = new THREE.Group();
  const CH = 12, csz = HM_SEG / CH;
  for (let cj = 0; cj < CH; cj++) for (let ci = 0; ci < CH; ci++) {
    const lod = new THREE.LOD();
    const levels = [[1, 0], [2, 380], [4, 900], [8, 1700]];
    for (const [s, d] of levels) {
      const m = new THREE.Mesh(buildTerrainChunk(ci, cj, csz, s), mat);
      m.receiveShadow = true;
      m.castShadow = s <= 2;
      lod.addLevel(m, d);
    }
    // place LOD pivot at chunk centre so distances are measured correctly
    const cx = -WORLD / 2 + (ci + 0.5) * csz * HM_STEP, cz = -WORLD / 2 + (cj + 0.5) * csz * HM_STEP;
    lod.position.set(cx, 0, cz);
    for (const l of lod.levels) l.object.position.set(-cx, 0, -cz);
    terrainGroup.add(lod);
  }
  scene.add(terrainGroup);
}

// --- distant mountain ring -----------------------------------------------------
function buildFarMountains() {
  const segA = 256, segR = 40;
  const pos = [], idx = [], col = [];
  const r0 = 1100, r1 = 7500;
  for (let j = 0; j <= segR; j++) {
    const t = j / segR;
    const r = r0 + (r1 - r0) * Math.pow(t, 1.6);
    for (let i = 0; i <= segA; i++) {
      const a = (i / segA) * TAU;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      // south (+z) is open sea; mountains rise to the north, east and west
      const northness = smoothstep(0.35, -0.55, Math.sin(a));
      const rid = ridged(x * 0.0007 + 11, z * 0.0007 - 4, 5);
      const mm = Math.max(0, fbm(x * 0.00042 + 3, z * 0.00042 - 8, 5) * 0.5 + 0.5 - 0.28) / 0.72;
      let h = (Math.pow(mm, 1.3) * 760 + rid * 90) * northness * smoothstep(0.0, 0.3, t) * (1 - smoothstep(0.8, 1.0, t) * 0.6);
      h += fbm(x * 0.0012, z * 0.0012, 4) * 60 * northness;
      h = h - 60 * (1 - northness) - 40 * (1 - smoothstep(0, 0.08, t));
      pos.push(x, h, z);
    }
  }
  for (let j = 0; j < segR; j++) for (let i = 0; i < segA; i++) {
    const p = j * (segA + 1) + i;
    idx.push(p, p + 1, p + segA + 1, p + 1, p + segA + 2, p + segA + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 });
  patch(mat, {
    key: 'farmtn',
    vHead: 'varying vec3 vNormW;',
    vEnd: 'vNormW = normalize(objectNormal);',
    fHead: 'varying vec3 vNormW;',
    fColor: /* glsl */ `
      vec3 N0 = normalize(vNormW);
      float sl = 1.0 - N0.y;
      float n = texture2D(uNoise, vWPos.xz * 0.0009).g;
      float n2 = texture2D(uNoise, vWPos.xz * 0.006).b;
      vec3 forest = mix(vec3(0.045, 0.07, 0.035), vec3(0.09, 0.12, 0.05), n);
      vec3 rock = vec3(0.36, 0.35, 0.34) * (0.8 + 0.3 * n2);
      vec3 c = mix(forest, rock, smoothstep(0.35, 0.6, sl + (n2 - 0.5) * 0.3) );
      c = mix(c, rock, smoothstep(300.0, 520.0, vWPos.y));
      c = mix(c, vec3(0.88, 0.9, 0.94), smoothstep(470.0, 600.0, vWPos.y + n2 * 90.0) * (1.0 - smoothstep(0.55, 0.8, sl)));
      diffuseColor.rgb = c;
    `,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.receiveShadow = false;
  scene.add(mesh);
}
