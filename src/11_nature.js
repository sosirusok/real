// ============================================================================
// Vegetation: procedural trees (instanced, wind-animated, translucent leaves),
// bushes, far-forest impostors, camera-following grass + flower fields
// ============================================================================

// --- tube (branch) geometry ------------------------------------------------------------
function tubeInto(arr, pts, radii, sides = 7) {
  const base = arr.pos.length / 3;
  const up = new V3(0, 1, 0);
  let len = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const t = i < pts.length - 1 ? new V3().subVectors(pts[i + 1], p) : new V3().subVectors(p, pts[i - 1]);
    t.normalize();
    let a = new V3().crossVectors(t, up);
    if (a.lengthSq() < 1e-4) a.set(1, 0, 0);
    a.normalize();
    const b = new V3().crossVectors(t, a).normalize();
    if (i > 0) len += p.distanceTo(pts[i - 1]);
    for (let k = 0; k <= sides; k++) {
      const ang = (k / sides) * TAU;
      const n = new V3().addScaledVector(a, Math.cos(ang)).addScaledVector(b, Math.sin(ang));
      arr.pos.push(p.x + n.x * radii[i], p.y + n.y * radii[i], p.z + n.z * radii[i]);
      arr.nrm.push(n.x, n.y, n.z);
      arr.uv.push((k / sides) * Math.max(1, radii[0] * 6), len / 1.2);
    }
  }
  for (let i = 0; i < pts.length - 1; i++) for (let k = 0; k < sides; k++) {
    const a = base + i * (sides + 1) + k, b = a + sides + 1;
    arr.idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
}
function toGeo(arr, withColor = false) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(arr.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(arr.nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(arr.uv, 2));
  if (withColor) g.setAttribute('color', new THREE.Float32BufferAttribute(arr.col, 3));
  g.setIndex(arr.idx);
  g.computeBoundingSphere();
  return g;
}
function card(arr, c, size, rng, center, radii, uvRect = [0, 0, 1, 1], aoBias = 0) {
  // random orientation quad around point c, spherical normals around crown centre
  const n = new V3(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize();
  let t = new V3().crossVectors(n, new V3(0, 1, 0));
  if (t.lengthSq() < 1e-3) t.set(1, 0, 0);
  t.normalize();
  const bb = new V3().crossVectors(n, t).normalize();
  const rot = rng() * TAU;
  const tt = t.clone().multiplyScalar(Math.cos(rot)).addScaledVector(bb, Math.sin(rot));
  const b2 = new V3().crossVectors(n, tt).normalize();
  const h = size / 2;
  const base = arr.pos.length / 3;
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const [u0, v0, u1, v1] = uvRect;
  const flip = rng() < 0.5;
  for (const [sx, sy] of corners) {
    const p = c.clone().addScaledVector(tt, sx * h).addScaledVector(b2, sy * h);
    const d = new V3().subVectors(p, center);
    const sn = new V3(d.x / (radii.x * radii.x), d.y / (radii.y * radii.y), d.z / (radii.z * radii.z)).normalize();
    const mixN = sn.multiplyScalar(0.8).addScaledVector(n, 0.2).normalize();
    arr.pos.push(p.x, p.y, p.z);
    arr.nrm.push(mixN.x, mixN.y, mixN.z);
    const u = flip ? (sx < 0 ? u1 : u0) : (sx < 0 ? u0 : u1);
    arr.uv.push(u, sy < 0 ? v1 : v0);
    const rr2 = clamp(Math.sqrt((d.x / radii.x) ** 2 + (d.y / radii.y) ** 2 + (d.z / radii.z) ** 2), 0, 1.2);
    const ao = clamp(0.38 + 0.45 * rr2 + 0.22 * (d.y / radii.y) + aoBias, 0.25, 1.05);
    arr.col.push(ao, ao, ao);
  }
  arr.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function newArr() { return { pos: [], nrm: [], uv: [], col: [], idx: [] }; }

// broadleaf / cherry
function makeDeciduous(seed, o) {
  const rng = mulberry32(seed);
  const trunk = newArr(), leaves = newArr();
  const th = o.trunkH * (0.9 + rng() * 0.2);
  const lean = new V3((rng() - 0.5) * 0.5, 0, (rng() - 0.5) * 0.5);
  const tp = [], tr = [];
  for (let i = 0; i <= 5; i++) {
    const t = i / 5;
    tp.push(new V3(lean.x * t * t + Math.sin(t * 3 + seed) * 0.08, t * th, lean.z * t * t));
    tr.push(o.trunkR * (1 - t * 0.45) * (i === 0 ? 1.25 : 1));
  }
  tubeInto(trunk, tp, tr, 8);
  const top = tp[5];
  const center = new V3(top.x, th + o.crown.y * 0.72, top.z);
  const ends = [];
  for (let i = 0; i < o.prim; i++) {
    const a = (i / o.prim) * TAU + rng() * 0.6;
    const startT = 0.55 + rng() * 0.45;
    const sp = new V3().lerpVectors(tp[2], tp[5], startT);
    const dir = new V3(Math.cos(a) * o.spread, 0.75 + rng() * 0.4, Math.sin(a) * o.spread).normalize();
    const L = o.branchL * (0.8 + rng() * 0.4);
    const pts = [sp], rad = [o.trunkR * 0.55];
    let p = sp.clone();
    for (let k = 1; k <= 4; k++) {
      const d2 = dir.clone(); d2.y -= k * o.droop;
      p = p.clone().addScaledVector(d2.normalize(), L / 4);
      pts.push(p); rad.push(o.trunkR * 0.55 * (1 - k / 5));
    }
    tubeInto(trunk, pts, rad, 5);
    ends.push(p);
    for (let s = 0; s < 2; s++) {
      const q0 = pts[2 + s];
      const a2 = a + (rng() - 0.5) * 1.8;
      const d3 = new V3(Math.cos(a2), 0.6 + rng() * 0.5, Math.sin(a2)).normalize();
      const q1 = q0.clone().addScaledVector(d3, L * 0.45);
      tubeInto(trunk, [q0, q1], [rad[2 + s] * 0.7, 0.02], 4);
      ends.push(q1);
    }
  }
  const radii = o.crown;
  for (let i = 0; i < o.cards; i++) {
    let c;
    if (i < ends.length * 3) {
      const e = ends[i % ends.length];
      c = e.clone().add(new V3((rng() - 0.5) * 1.6, (rng() - 0.3) * 1.2, (rng() - 0.5) * 1.6));
    } else {
      const u = rng() * TAU, v = Math.acos(2 * rng() - 1), r = Math.pow(rng(), 0.35);
      c = new V3(Math.sin(v) * Math.cos(u) * radii.x * r, Math.cos(v) * radii.y * r * 0.95, Math.sin(v) * Math.sin(u) * radii.z * r).add(center);
    }
    if (c.y < th * 0.85) c.y = th * 0.85 + rng() * 0.5;
    card(leaves, c, o.cardSize * (0.8 + rng() * 0.45), rng, center, radii);
  }
  return { trunk: toGeo(trunk), leaves: toGeo(leaves, true), height: th + radii.y * 1.7 };
}

function makeConifer(seed, o) {
  const rng = mulberry32(seed);
  const trunk = newArr(), leaves = newArr();
  const H = o.h * (0.85 + rng() * 0.3);
  tubeInto(trunk, [new V3(0, 0, 0), new V3(0, H * 0.5, 0), new V3(0, H, 0)], [o.r, o.r * 0.6, 0.03], 7);
  const tiers = o.tiers;
  const center = new V3(0, H * 0.45, 0);
  const radii = new V3(o.w, H * 0.55, o.w);
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1);
    const y = H * (o.base + (1 - o.base) * t);
    const R = o.w * Math.pow(1 - t, 0.9) * (0.85 + rng() * 0.3) + 0.25;
    const n = Math.max(3, Math.round(o.perTier * (1 - t * 0.5)));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU + rng() * 0.8 + i * 1.3;
      const ca = Math.cos(a), sa = Math.sin(a);
      const wdt = R * 0.95 + 0.5;
      const droop = R * (0.25 + rng() * 0.2);
      const base = leaves.pos.length / 3;
      const pA = [0.05 * ca, y, 0.05 * sa];
      const corners = [
        [pA[0] - sa * wdt * 0.25, y + 0.05, pA[2] + ca * wdt * 0.25, 0, 0],
        [pA[0] + sa * wdt * 0.25, y + 0.05, pA[2] - ca * wdt * 0.25, 0, 1],
        [R * ca + sa * wdt * 0.5, y - droop, R * sa - ca * wdt * 0.5, 1, 1],
        [R * ca - sa * wdt * 0.5, y - droop, R * sa + ca * wdt * 0.5, 1, 0],
      ];
      for (const [x, yy, z, u, v] of corners) {
        leaves.pos.push(x, yy, z);
        const nn = new V3(ca * 0.7, 0.75, sa * 0.7).normalize();
        leaves.nrm.push(nn.x, nn.y, nn.z);
        leaves.uv.push(u, v);
        const ao = clamp(0.45 + t * 0.5 + (u > 0.5 ? 0.15 : -0.1), 0.3, 1.0);
        leaves.col.push(ao, ao, ao);
      }
      leaves.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  void center; void radii;
  return { trunk: toGeo(trunk), leaves: toGeo(leaves, true), height: H };
}

// --- tree materials ---------------------------------------------------------------------
const TREE_WIND_V = /* glsl */ `
  #ifdef USE_INSTANCING
    vec3 ipW = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
    mat3 imR = mat3(instanceMatrix);
    float isc = length(imR[0]);
  #else
    vec3 ipW = vec3(0.0);
    mat3 imR = mat3(1.0);
    float isc = 1.0;
  #endif
  float phT = dot(ipW.xz, vec2(0.131, 0.173));
  float hfT = clamp(position.y / uTreeH, 0.0, 1.2);
  vec3 bw = windBend(ipW.xz, hfT, uStiff, phT) * uTreeH * 0.12;
  vec3 lo = transpose(imR) * bw / (isc * isc);
  transformed += lo;
`;
function makeLeafMaterial(tex, key, opts = {}) {
  const mat = new THREE.MeshStandardMaterial({
    map: tex, alphaTest: 0.42, side: THREE.DoubleSide, vertexColors: true, roughness: 0.72, metalness: 0,
    alphaToCoverage: Qs.msaa > 0, color: opts.color || 0xffffff,
  });
  const u = { uTreeH: { value: opts.h || 10 }, uStiff: { value: opts.stiff || 1.4 } };
  const flutter = /* glsl */ `
    float flT = sin(uTime * 6.5 + dot(position, vec3(3.1, 1.7, 2.3)) + phT * 3.0) * (0.025 + 0.05 * uWind.z) * hfT;
    transformed += normal * flT;
  `;
  const conf = {
    key,
    uniforms: u,
    vHead: 'uniform float uTreeH; uniform float uStiff;',
    vBegin: TREE_WIND_V + flutter,
    fColor: /* glsl */ `
      #ifdef USE_MAP
      { vec2 dxm = dFdx(vMapUv * 512.0), dym = dFdy(vMapUv * 512.0);
        float lodm = 0.5 * log2(max(dot(dxm, dxm), dot(dym, dym)));
        diffuseColor.a *= 1.0 + max(lodm, 0.0) * 0.55; }
      #endif
      float lvN = texture2D(uNoise, vWPos.xz * 0.013).g;
      diffuseColor.rgb *= 0.86 + 0.3 * lvN;
    `,
    fNormal: 'normal = normalize(vNormal);',
    fDir: /* glsl */ `
      reflectedLight.directDiffuse += directLight.color * diffuseColor.rgb * ${(opts.transl || 0.55).toFixed(2)}
        * (pow(clamp(dot(geometryViewDir, -directLight.direction), 0.0, 1.0), 3.0) * 1.4 + 0.18);
    `,
  };
  patch(mat, conf);
  mat.userData.depth = depthFor({ key: key + 'd', uniforms: u, vHead: conf.vHead, vBegin: TREE_WIND_V + flutter }, { map: tex, alphaTest: 0.42, side: THREE.DoubleSide });
  return mat;
}
function makeBarkMaterial(key, h) {
  const mat = new THREE.MeshStandardMaterial({ map: TEX.bark.map, normalMap: TEX.bark.normalMap, roughness: 0.92, metalness: 0 });
  const u = { uTreeH: { value: h }, uStiff: { value: 1.6 } };
  patch(mat, { key, uniforms: u, vHead: 'uniform float uTreeH; uniform float uStiff;', vBegin: TREE_WIND_V });
  mat.userData.depth = depthFor({ key: key + 'd', uniforms: u, vHead: 'uniform float uTreeH; uniform float uStiff;', vBegin: TREE_WIND_V });
  return mat;
}

// --- species ---------------------------------------------------------------------------
const SPECIES = {};
function buildSpecies() {
  const defs = {
    plane: { kind: 'dec', tex: 'leafA', variants: 3, o: { trunkH: 3.6, trunkR: 0.3, crown: new V3(4.1, 3.4, 4.1), prim: 6, spread: 0.9, branchL: 3.6, droop: 0.05, cards: 230, cardSize: 1.9 } },
    linden: { kind: 'dec', tex: 'leafB', variants: 3, o: { trunkH: 2.8, trunkR: 0.24, crown: new V3(3.0, 3.1, 3.0), prim: 5, spread: 0.7, branchL: 2.8, droop: 0.02, cards: 170, cardSize: 1.6 } },
    cherry: { kind: 'dec', tex: 'blossom', variants: 3, transl: 0.65, o: { trunkH: 2.0, trunkR: 0.2, crown: new V3(3.6, 2.2, 3.6), prim: 6, spread: 1.4, branchL: 3.4, droop: 0.12, cards: 200, cardSize: 1.7 } },
    cypress: { kind: 'dec', tex: 'leafSmall', variants: 2, stiff: 2.2, o: { trunkH: 0.8, trunkR: 0.14, crown: new V3(0.95, 4.6, 0.95), prim: 3, spread: 0.2, branchL: 3.5, droop: 0.0, cards: 120, cardSize: 1.1 } },
    bush: { kind: 'dec', tex: 'leafSmall', variants: 3, stiff: 1.2, o: { trunkH: 0.2, trunkR: 0.06, crown: new V3(1.2, 0.85, 1.2), prim: 3, spread: 1.2, branchL: 0.7, droop: 0.0, cards: 46, cardSize: 0.9 } },
    spruce: { kind: 'con', tex: 'conifer', variants: 3, stiff: 2.4, o: { h: 15, r: 0.28, w: 3.4, tiers: 16, perTier: 11, base: 0.1 } },
    pine: { kind: 'con', tex: 'conifer', variants: 2, stiff: 2.0, o: { h: 11, r: 0.22, w: 3.8, tiers: 9, perTier: 11, base: 0.5 } },
  };
  let seed = 100;
  for (const [name, d] of Object.entries(defs)) {
    const vars = [];
    let h = 10;
    for (let v = 0; v < d.variants; v++) {
      const s0 = seed++;
      const g = d.kind === 'dec' ? makeDeciduous(s0, d.o) : makeConifer(s0, d.o);
      // matching low-detail version: fewer, larger cards
      const lo = d.kind === 'dec'
        ? makeDeciduous(s0, { ...d.o, cards: Math.max(18, Math.round(d.o.cards * 0.28)), cardSize: d.o.cardSize * 1.7, prim: Math.min(3, d.o.prim) })
        : makeConifer(s0, { ...d.o, tiers: Math.max(4, Math.round(d.o.tiers * 0.45)), perTier: Math.max(4, Math.round(d.o.perTier * 0.55)) });
      g.lo = lo;
      vars.push(g);
      h = g.height;
    }
    const lm = makeLeafMaterial(TEX[d.tex], 'leaf-' + name, { h, stiff: d.stiff || 1.4, transl: d.transl });
    const bm = makeBarkMaterial('bark-' + name, h);
    SPECIES[name] = { vars, lm, bm, h, items: [] };
  }
}

function plant(name, x, z, { y = null, s = 1, tint = null } = {}) {
  const sp = SPECIES[name];
  const yy = y === null ? heightAt(x, z) - 0.15 : y;
  sp.items.push({ x, y: yy, z, s: s * (0.85 + rand() * 0.3), r: rand() * TAU, v: Math.floor(rand() * sp.vars.length), tint });
}

// instancing into spatial cells for culling
const TREE_MESHES = [];
function instanceSpecies() {
  const cell = 220;
  const col = new THREE.Color();
  for (const [name, sp] of Object.entries(SPECIES)) {
    const buckets = new Map();
    for (const it of sp.items) {
      const k = it.v + ':' + Math.floor(it.x / cell) + ':' + Math.floor(it.z / cell);
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(it);
    }
    for (const [k, list] of buckets) {
      const v = +k.split(':')[0];
      const g = sp.vars[v];
      let cx = 0, cz = 0;
      for (const it of list) { cx += it.x; cz += it.z; }
      cx /= list.length; cz /= list.length;
      const inTown = inCityLand(cx, cz, 60);
      for (const [part, lod] of [['trunk', 0], ['leaves', 0], ['trunk', 1], ['leaves', 1]]) {
        const geo = lod ? g.lo[part] : g[part];
        const mesh = new THREE.InstancedMesh(geo, part === 'trunk' ? sp.bm : sp.lm, list.length);
        mesh.userData.lod = lod;
        mesh.userData.center = new V3(cx, 0, cz);
        mesh.visible = lod === 0;
        if (!inTown) mesh.layers.set(LAYER_NOREFLECT);
        const m = new THREE.Matrix4(), q = new THREE.Quaternion();
        list.forEach((it, i) => {
          q.setFromAxisAngle(new V3(0, 1, 0), it.r);
          m.compose(new V3(it.x, it.y, it.z), q, new V3(it.s, it.s, it.s));
          mesh.setMatrixAt(i, m);
          if (part === 'leaves') {
            if (it.tint) col.setRGB(...it.tint); else col.setHSL(0, 0, 1);
            const hue = (rand() - 0.5) * 0.05;
            col.offsetHSL(hue, (rand() - 0.5) * 0.15, (rand() - 0.5) * 0.12);
            mesh.setColorAt(i, col);
          }
        });
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.customDepthMaterial = (part === 'trunk' ? sp.bm : sp.lm).userData.depth;
        mesh.computeBoundingSphere();
        mesh.userData.fullCount = list.length;
        scene.add(mesh);
        TREE_MESHES.push(mesh);
      }
    }
  }
}

// far forest impostors on mountain slopes
function buildFarForest() {
  const cone = new THREE.ConeGeometry(2.6, 10, 6, 1).translate(0, 5, 0);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 });
  patch(mat, {
    key: 'farforest',
    fColor: 'diffuseColor.rgb = vec3(0.05, 0.085, 0.04) * (0.7 + 0.6 * texture2D(uNoise, vWPos.xz * 0.01).g) * (0.6 + 0.4 * clamp((vWPos.y - terrainH(vWPos.xz)) / 9.0, 0.0, 1.0));',
  });
  const pts = [];
  for (let i = 0; i < 26000 && pts.length < 9000; i++) {
    const x = rr(-1180, 1180), z = rr(-1180, 400);
    if (Math.abs(x) < 520 && z > -560) continue;
    const h = heightAt(x, z);
    if (h < 12 || h > 330) continue;
    if (forestDensity(x, z) < rand() * 0.9 + 0.1) continue;
    if (slopeAt(x, z) > 0.8) continue;
    pts.push([x, h - 0.5, z]);
  }
  const cell = 400;
  const buckets = new Map();
  for (const p of pts) {
    const k = Math.floor(p[0] / cell) + ':' + Math.floor(p[2] / cell);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(p);
  }
  for (const [, list] of buckets) {
    const mesh = new THREE.InstancedMesh(cone, mat, list.length);
    const m = new THREE.Matrix4();
    list.forEach((p, i) => { const s = 0.8 + rand() * 0.8; m.makeScale(s, s * (0.9 + rand() * 0.5), s).setPosition(p[0], p[1], p[2]); mesh.setMatrixAt(i, m); });
    mesh.castShadow = false; mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    scene.add(mesh);
  }
}

function placeTrees() {
  const C = CITY;
  for (const [x, z] of CITYDATA.streetTrees) plant('plane', x, z, { y: C.walk - 0.1, s: 0.95 });
  for (const [x, z] of CITYDATA.canalTrees) plant('cherry', x, z, { y: C.walk - 0.1, s: 1.0 });
  for (const [x, z, y] of CITYDATA.plazaTrees) plant('linden', x, z, { y, s: 0.9 });
  for (const c of CITYDATA.courtyards) {
    const n = Math.min(3, Math.floor(((c.x1 - c.x0) * (c.z1 - c.z0)) / 90));
    for (let i = 0; i < n; i++) {
      const x = rr(c.x0 + 2.5, c.x1 - 2.5), z = rr(c.z0 + 2.5, c.z1 - 2.5);
      const r = rand();
      plant(r < 0.4 ? 'linden' : r < 0.7 ? 'cherry' : r < 0.85 ? 'cypress' : 'bush', x, z, { y: C.ground - 0.1, s: 0.8 });
    }
    for (let i = 0; i < 4; i++) plant('bush', rr(c.x0 + 1, c.x1 - 1), rr(c.z0 + 1, c.z1 - 1), { y: C.ground - 0.05, s: 0.7 });
  }
  // park
  const P = C.park, pd = C.pond;
  let tries = 0, n = 0;
  while (n < 95 && tries < 3000) {
    tries++;
    const x = rr(P.x0 + 3, P.x1 - 3), z = rr(P.z0 + 3, P.z1 - 3);
    const dp = Math.hypot(x - pd.x, z - pd.z);
    if (dp < 29) continue;
    if (CITYDATA.park.pathDist(x, z) < 3.2) continue;
    if (CITYDATA.gazebo && Math.hypot(x - CITYDATA.gazebo.x, z - CITYDATA.gazebo.z) < 7) continue;
    const r = rand();
    plant(dp < 40 && r < 0.45 ? 'cherry' : r < 0.55 ? 'plane' : r < 0.75 ? 'linden' : r < 0.85 ? 'spruce' : 'bush', x, z, { s: 0.9 });
    n++;
  }
  // hedge of bushes around the park edge
  for (let x = P.x0 + 1.5; x < P.x1; x += 2.2) for (const z of [P.z0 + 1.2, P.z1 - 1.2]) if (Math.abs(x - pd.x) > 4) plant('bush', x, z, { s: 0.75 });
  for (let z = P.z0 + 1.5; z < P.z1; z += 2.2) for (const x of [P.x0 + 1.2, P.x1 - 1.2]) if (Math.abs(z - pd.z) > 4) plant('bush', x, z, { s: 0.75 });
  // villas: cypress + bushes
  for (const v of CITYDATA.villas || []) {
    for (let i = 0; i < 3; i++) {
      const a = rand() * TAU, r = Math.max(v.w, v.d) * 0.6 + 3 + rand() * 4;
      plant(rand() < 0.6 ? 'cypress' : 'linden', v.x + Math.cos(a) * r, v.z + Math.sin(a) * r, { s: 0.9 });
    }
  }
  // hills + outskirts
  tries = 0; let count = 0;
  while (count < 4200 && tries < 90000) {
    tries++;
    const x = rr(-1150, 1150), z = rr(-1150, 420);
    if (inCityLand(x, z, 10)) continue;
    const h = heightAt(x, z);
    if (h < 2.5 || h > 360) continue;
    const sl = slopeAt(x, z);
    if (sl > 0.7) continue;
    const fd = forestDensity(x, z);
    const near = Math.hypot(x, z + 60) < 650;
    const pr = fd * fd * (h > 25 ? 1.0 : 0.55) + (near ? 0.03 : 0.01);
    if (rand() > pr) continue;
    if ((CITYDATA.villas || []).some((v) => Math.hypot(v.x - x, v.z - z) < 10)) continue;
    const k = maskIndex(x, z);
    if (k >= 0 && MASK[k + 2] > 120) { if (rand() < 0.5) plant('pine', x, z, { s: 0.9 }); continue; }
    const r = rand();
    plant(h > 60 || r < 0.55 ? 'spruce' : r < 0.8 ? 'plane' : r < 0.9 ? 'linden' : 'pine', x, z, { s: 0.8 + rand() * 0.5 });
    count++;
  }
  // meadow shrubs and lone trees near the city edges
  for (let i = 0; i < 260; i++) {
    const x = rr(-600, 600), z = rr(-420, 200);
    if (inCityLand(x, z, 8)) continue;
    const h = heightAt(x, z);
    if (h < 1.5 || slopeAt(x, z) > 0.5) continue;
    plant(rand() < 0.7 ? 'bush' : 'linden', x, z, { s: 0.9 });
  }
  // pines on the beach dunes
  for (let i = 0; i < 60; i++) {
    const x = rr(-760, -280), z = coastZ(x) - rr(30, 90);
    const h = heightAt(x, z);
    if (h < 2 || slopeAt(x, z) > 0.4) continue;
    plant('pine', x, z, { s: 0.8 + rand() * 0.4 });
  }
}

// --- grass + flowers (camera-following instanced fields) -------------------------------
const FIELDS = [];
function bladeClump(nBlades, seg, width) {
  const pos = [], nrm = [], idx = [], uv = [];
  const rng = mulberry32(5);
  for (let b = 0; b < nBlades; b++) {
    const a = (b / nBlades) * TAU + rng() * 0.8;
    const ox = Math.cos(a) * 0.07 * rng(), oz = Math.sin(a) * 0.07 * rng();
    const face = a + Math.PI / 2 + (rng() - 0.5);
    const cx = Math.cos(face), cz = Math.sin(face);
    const lean = 0.12 + rng() * 0.25;
    const base = pos.length / 3;
    for (let i = 0; i <= seg; i++) {
      const t = i / seg;
      const w = width * (1 - t * 0.85) * (i === seg ? 0.0 : 1);
      const bend = lean * t * t;
      const px = ox + Math.cos(a) * bend, pz = oz + Math.sin(a) * bend;
      const nx = -cz, nz = cx;
      if (i < seg) {
        pos.push(px - cx * w / 2, t, pz - cz * w / 2, px + cx * w / 2, t, pz + cz * w / 2);
        nrm.push(nx, 0.3, nz, nx, 0.3, nz);
        uv.push(0, t, 1, t);
      } else {
        pos.push(px, t, pz);
        nrm.push(nx, 0.3, nz);
        uv.push(0.5, 1);
      }
    }
    for (let i = 0; i < seg - 1; i++) {
      const a0 = base + i * 2;
      idx.push(a0, a0 + 1, a0 + 3, a0, a0 + 3, a0 + 2);
    }
    const last = base + (seg - 1) * 2;
    idx.push(last, last + 1, last + 2);
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

function makeField({ geo, count, tile, fadeN, fadeF, hScale, key, flowers = false, innerCut = 0 }) {
  const inst = new Float32Array(count * 4);
  const r = mulberry32(key.length * 977 + count);
  for (let i = 0; i < count; i++) {
    inst[i * 4] = r() * tile; inst[i * 4 + 1] = r() * tile; inst[i * 4 + 2] = r() * TAU; inst[i * 4 + 3] = r();
  }
  geo.setAttribute('aI', new THREE.InstancedBufferAttribute(inst, 4));
  geo.instanceCount = count;
  const u = {
    uTile: { value: tile }, uFadeN: { value: fadeN }, uFadeF: { value: fadeF }, uHScale: { value: hScale },
    uCamF: { value: new V3() }, uInner: { value: innerCut },
  };
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.78, metalness: 0, side: THREE.DoubleSide,
    map: flowers ? TEX.flowers : null, alphaTest: flowers ? 0.5 : 0, alphaToCoverage: flowers && Qs.msaa > 0,
  });
  patch(mat, {
    key,
    uniforms: u,
    vHead: /* glsl */ `
      attribute vec4 aI;
      uniform float uTile, uFadeN, uFadeF, uHScale, uInner;
      uniform vec3 uCamF;
      varying float vGH;
      varying vec3 vGCol;
      varying float vFl;
      vec3 gPos;
    `,
    vNormal: /* glsl */ `
      vec2 gBase = uCamF.xz;
      vec2 gRel = mod(aI.xy - gBase + uTile * 0.5, uTile) - uTile * 0.5;
      vec2 gxz = gBase + gRel;
      vec4 gm = texture2D(uMask, maskUV(gxz));
      float gd = ${flowers ? 'gm.g' : 'gm.r'};
      float keep = step(aI.w, gd * ${flowers ? '0.55' : '1.0'});
      float dist = length(gRel);
      // Near fields have no inner hole; smoothstep(0, 0, dist) is undefined.
      float innerFade = ${innerCut > 0 ? 'smoothstep(uInner * 0.8, uInner, dist)' : '1.0'};
      float fade = (1.0 - smoothstep(uFadeN, uFadeF, dist)) * innerFade;
      float nH = texture2D(uNoise, gxz * 0.023).g;
      float gh = (0.45 + 0.65 * fract(aI.w * 7.13)) * uHScale * (0.55 + 0.7 * nH) * keep * fade;
      if (terrainH(gxz) < 0.35) gh = 0.0;
      float gy = terrainH(gxz) - 0.04;
      float cr = cos(aI.z), sr = sin(aI.z);
      vec3 lp = position;
      float wsc = 0.75 + 0.5 * fract(aI.w * 3.7);
      vec3 p = vec3((lp.x * cr - lp.z * sr) * wsc, lp.y * gh, (lp.x * sr + lp.z * cr) * wsc);
      float hf = lp.y;
      vec3 wb = windBend(gxz, hf, 0.9, aI.w * 6.28 + gxz.x * 0.3) * gh * 1.2;
      vec2 away = gxz - uPlayer.xz;
      float pdst = length(away);
      p.xz += (away / max(pdst, 1e-4)) * (1.0 - smoothstep(0.2, 1.3, pdst)) * hf * gh * 0.8 * step(abs(uPlayer.y - gy), 2.5);
      p += wb;
      p.y -= dot(wb.xz, wb.xz) * 0.45 / max(gh, 0.05);
      gPos = vec3(gxz.x, gy, gxz.y) + p;
      vec3 rn = vec3(normal.x * cr - normal.z * sr, normal.y, normal.x * sr + normal.z * cr);
      objectNormal = normalize(mix(rn, vec3(0.0, 1.0, 0.0), 0.55));
      vGH = hf;
      float nA = texture2D(uNoise, gxz * 0.0021).r;
      float nB = texture2D(uNoise, gxz * 0.017).g;
      vec3 gA = vec3(0.075, 0.16, 0.028), gB = vec3(0.16, 0.24, 0.05), gDry = vec3(0.33, 0.30, 0.12);
      vec3 gc = mix(gA, gB, smoothstep(0.25, 0.75, nA));
      gc = mix(gc, gDry, smoothstep(0.58, 0.9, nB) * 0.5);
      gc *= 0.82 + 0.35 * fract(aI.w * 13.7);
      vGCol = gc;
      vFl = floor(fract(aI.w * 11.3) * 4.0);
    `,
    vBegin: /* glsl */ `
      transformed = gPos;
      #ifdef USE_MAP
        vMapUv = vec2((uv.x + vFl) / 5.0, clamp((uv.y - 0.64) / 0.36, 0.0, 1.0));
        if (position.y < 0.62) vMapUv = vec2(4.5 / 5.0, 0.5);
      #endif
    `,
    fHead: 'varying float vGH; varying vec3 vGCol; varying float vFl;',
    fColor: flowers ? 'diffuseColor.rgb *= mix(vec3(0.7), vec3(1.05), vGH);' : /* glsl */ `
      vec3 tip = mix(vGCol * 2.1 + vec3(0.04, 0.05, 0.0), vec3(0.55, 0.52, 0.22), smoothstep(0.62, 0.95, texture2D(uNoise, vWPos.xz * 0.05).b) * 0.6);
      diffuseColor.rgb = mix(vGCol * 0.55, tip, pow(vGH, 1.2));
    `,
    fRough: 'roughnessFactor = 0.62 + 0.3 * (1.0 - vGH);',
    fNormal: 'normal = normalize(vNormal);',
    fDir: /* glsl */ `
      reflectedLight.directDiffuse += directLight.color * diffuseColor.rgb * vGH * 0.9
        * pow(clamp(dot(geometryViewDir, -directLight.direction), 0.0, 1.0), 2.5);
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.layers.set(LAYER_NOREFLECT);
  mesh.userData = { u, full: count };
  scene.add(mesh);
  FIELDS.push(mesh);
  return mesh;
}

function flowerGeo() {
  // stem (2 crossed quads) + head (2 crossed quads); uv.y > 0.62 = head
  const pos = [], nrm = [], uv = [], idx = [];
  const addQ = (a, b, c, d, n, uvs) => {
    const base = pos.length / 3;
    for (const p of [a, b, c, d]) pos.push(...p);
    for (let i = 0; i < 4; i++) nrm.push(...n);
    for (const t of uvs) uv.push(...t);
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  for (const r of [0, Math.PI / 2]) {
    const c = Math.cos(r) * 0.012, s = Math.sin(r) * 0.012;
    addQ([-c, 0, -s], [c, 0, -s + 0.0], [c, 0.62, s], [-c, 0.62, s], [s, 0.2, -c], [[0, 0], [1, 0], [1, 0.6], [0, 0.6]]);
  }
  for (const r of [0.3, 0.3 + Math.PI / 2]) {
    const c = Math.cos(r) * 0.09, s = Math.sin(r) * 0.09;
    addQ([-c, 0.63, -s], [c, 0.63, s], [c, 0.83, s], [-c, 0.83, -s], [0, 1, 0], [[0, 0.64], [1, 0.64], [1, 1], [0, 1]]);
    addQ([-0.07, 0.8, -0.07].map((v, i) => (i === 1 ? v : v * (r > 1 ? -1 : 1))), [0.07, 0.8, -0.07], [0.07, 0.8, 0.07], [-0.07, 0.8, 0.07], [0, 1, 0], [[0, 0.64], [1, 0.64], [1, 1], [0, 1]]);
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

function buildFields() {
  makeField({ geo: bladeClump(3, 4, 0.07), count: 52000, tile: 64, fadeN: 20, fadeF: 30, hScale: 0.55, key: 'grassN' });
  makeField({ geo: bladeClump(4, 3, 0.11), count: 26000, tile: 170, fadeN: 40, fadeF: 80, hScale: 0.62, key: 'grassF', innerCut: 16 });
  makeField({ geo: flowerGeo(), count: 16000, tile: 70, fadeN: 24, fadeF: 33, hScale: 0.55, key: 'flowers', flowers: true });
  applyDensity();
}
function applyDensity() {
  for (const f of FIELDS) f.geometry.instanceCount = Math.floor(f.userData.full * Qs.grass);
  for (const m of TREE_MESHES) m.count = Math.max(1, Math.floor(m.userData.fullCount * (m.userData.fullCount > 30 ? Qs.trees : 1)));
}
let lodTimer = 0;
function updateFields(dt = 0.016) {
  for (const f of FIELDS) f.userData.u.uCamF.value.copy(camera.position);
  lodTimer -= dt;
  if (lodTimer > 0) return;
  lodTimer = 0.3;
  const c = camera.position;
  for (const m of TREE_MESHES) {
    const d = Math.hypot(m.userData.center.x - c.x, m.userData.center.z - c.z) - 110;
    const far = d > 230 + c.y * 0.6;
    m.visible = m.userData.lod === 1 ? far : !far;
  }
}

function buildNature() {
  // flower atlas needs a 5th (stem) cell: rebuild atlas at 5 cells
  TEX.flowers = makeFlowerAtlas5();
  buildSpecies();
  placeTrees();
  instanceSpecies();
  buildFarForest();
  buildFields();
}

function makeFlowerAtlas5() {
  const old = TEX.flowers.image;
  const S = 128;
  const d = new Uint8Array(S * 5 * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S * 4; x++) {
    const si = (y * S * 4 + x) * 4, di = (y * S * 5 + x) * 4;
    for (let c = 0; c < 4; c++) d[di + c] = old.data[si + c];
  }
  for (let y = 0; y < S; y++) for (let x = S * 4; x < S * 5; x++) {
    const di = (y * S * 5 + x) * 4;
    d[di] = 60; d[di + 1] = 98; d[di + 2] = 38; d[di + 3] = 255;
  }
  return dataTex(d, S * 5, S, { srgb: true, repeat: false });
}
