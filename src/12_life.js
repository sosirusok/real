// ============================================================================
// Life & motion: gulls, pigeons, butterflies, koi, ducks, boats, trams,
// cherry petals, fountain water, fireflies, pollen, chimney smoke,
// lamp lights, lighthouse beam
// ============================================================================

const LIFE = {};
const _o = new THREE.Object3D();

// --- JS mirror of the water Gerstner waves (for floating objects) -------------------------
const WAVES = [[0.15, -1.0, 34.0, 0.30], [-0.38, -0.92, 21.0, 0.17], [0.55, -0.83, 13.0, 0.085], [-0.75, -0.66, 8.0, 0.045], [0.2, -0.98, 5.1, 0.022]];
function waveAt(x, z, t) {
  const dep = Math.max(-heightAt(x, z), 0);
  const sea = smoothstep(118, 200, z) * smoothstep(0.5, 6, dep);
  const amp = sea * WATER.uWaveAmp.value * (0.55 + G.uWind.value.z * 0.9);
  let y = 0, nx = 0, nz = 0;
  WAVES.forEach(([dx, dz, L, A], i) => {
    const l = Math.hypot(dx, dz); const Dx = dx / l, Dz = dz / l;
    const k = TAU / L, w = Math.sqrt(9.81 * k);
    const ph = k * (Dx * x + Dz * z) - w * t + i * 1.7;
    const a = A * amp;
    y += a * Math.sin(ph);
    nx -= Dx * k * a * Math.cos(ph);
    nz -= Dz * k * a * Math.cos(ph);
  });
  return { y, nx, nz };
}

// --- generic animated-creature material ----------------------------------------------------
function creatureMat(key, vBegin, extra = {}) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: extra.rough ?? 0.7, metalness: 0, side: extra.side ?? THREE.FrontSide });
  const conf = {
    key,
    vHead: 'attribute float aPart; attribute vec4 aAnim;' + (extra.vHead || ''),
    vBegin,
    fDir: extra.fDir || '',
    fEmissive: extra.fEmissive || '',
  };
  patch(mat, conf);
  return { mat, depth: depthFor({ key: key + 'd', vHead: conf.vHead, vBegin }) };
}
function withAttrs(g, part, anim = [0, 0, 0, 0]) {
  const n = g.attributes.position.count;
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(new Array(n).fill(part), 1));
  return g;
}
function mergeParts(parts) {
  // parts: [{g, color, part}]
  const gs = parts.map(({ g, color, part }) => {
    const gg = g.index ? g.toNonIndexed() : g.clone();
    gg.deleteAttribute('uv');
    const n = gg.attributes.position.count;
    gg.setAttribute('color', new THREE.Float32BufferAttribute(new Array(n).fill(0).flatMap(() => color), 3));
    gg.setAttribute('aPart', new THREE.Float32BufferAttribute(new Array(n).fill(part), 1));
    return gg;
  });
  const m = mergeGeometries(gs, false);
  m.computeBoundingSphere();
  return m;
}
function instAnim(mesh, count) {
  const a = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) { a[i * 4] = rand() * TAU; a[i * 4 + 1] = rand(); a[i * 4 + 2] = 1; a[i * 4 + 3] = 0; }
  mesh.geometry.setAttribute('aAnim', new THREE.InstancedBufferAttribute(a, 4));
  return mesh.geometry.attributes.aAnim;
}

// --- gulls -------------------------------------------------------------------------------
function gullGeometry() {
  const white = srgb('#f2f0ea'), grey = srgb('#a9adb0'), dark = srgb('#2b2b2b'), beak = srgb('#e0b030');
  const body = new THREE.SphereGeometry(0.16, 10, 8).scale(1, 0.9, 2.6);
  const head = new THREE.SphereGeometry(0.11, 8, 6).translate(0, 0.07, 0.42);
  const bk = new THREE.ConeGeometry(0.03, 0.14, 5).rotateX(Math.PI / 2).translate(0, 0.06, 0.58);
  const tail = new THREE.BufferGeometry();
  tail.setAttribute('position', new THREE.Float32BufferAttribute([-0.12, 0, -0.35, 0.12, 0, -0.35, 0, 0.01, -0.62, 0.12, 0, -0.35, -0.12, 0, -0.35, 0, 0.01, -0.62], 3));
  tail.computeVertexNormals();
  const wing = (side) => {
    // inner + outer segments, tapered, slightly swept
    const g = new THREE.BufferGeometry();
    const s = side;
    const P = [
      [0.1 * s, 0.02, 0.18], [0.55 * s, 0.03, 0.1], [0.55 * s, 0.03, -0.14], [0.1 * s, 0.02, -0.12],
    ];
    const Q = [
      [0.55 * s, 0.03, 0.1], [1.0 * s, 0.02, -0.05], [0.95 * s, 0.02, -0.16], [0.55 * s, 0.03, -0.14],
    ];
    const tri = (a, b, c) => [...a, ...b, ...c];
    const pos = [...tri(P[0], P[1], P[2]), ...tri(P[0], P[2], P[3]), ...tri(Q[0], Q[1], Q[2]), ...tri(Q[0], Q[2], Q[3])];
    if (s < 0) for (let i = 0; i < pos.length; i += 9) { for (let k = 0; k < 3; k++) { const t = pos[i + 3 + k]; pos[i + 3 + k] = pos[i + 6 + k]; pos[i + 6 + k] = t; } }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return g;
  };
  const wl = wing(-1), wr = wing(1);
  // colour outer wing tips dark
  const colorWing = (g) => g;
  return mergeParts([
    { g: body, color: white, part: 0 }, { g: head, color: white, part: 0 }, { g: bk, color: beak, part: 0 }, { g: tail, color: grey, part: 0 },
    { g: colorWing(wl), color: grey, part: 1 }, { g: colorWing(wr), color: grey, part: 1 },
  ].concat([{ g: new THREE.BufferGeometry().copy(wl), color: dark, part: 9 }].slice(0, 0))).clone();
}
const FLAP_V = /* glsl */ `
  if (aPart > 0.5) {
    float ax = abs(transformed.x);
    float flap = sin(uTime * (8.0 + aAnim.y * 3.0) + aAnim.x) * aAnim.z + (1.0 - aAnim.z) * 0.12;
    float ang = flap * 0.7;
    float inner = min(ax, 0.55);
    float outer = max(ax - 0.55, 0.0);
    transformed.y += sin(ang) * inner + sin(ang * 1.5) * outer;
    transformed.x = sign(transformed.x) * (cos(ang) * inner + cos(ang * 1.5) * outer + 0.0);
  }
`;
function buildGulls() {
  const N = 28;
  const { mat, depth } = creatureMat('gull', FLAP_V, { side: THREE.DoubleSide });
  const mesh = new THREE.InstancedMesh(gullGeometry(), mat, N);
  mesh.customDepthMaterial = depth;
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  const anim = instAnim(mesh, N);
  const centers = [[20, 34, 210], [-130, 46, 250], [160, 28, 190], [0, 26, 40], [-60, 70, 320]];
  LIFE.gulls = { mesh, anim, birds: Array.from({ length: N }, (_, i) => ({
    c: centers[i % centers.length], r: 30 + rand() * 50, w: (0.12 + rand() * 0.1) * (rand() < 0.5 ? 1 : -1), ph: rand() * TAU,
    h: rand() * 12, bob: rand() * TAU, flapT: rand() * 10,
  })) };
  scene.add(mesh);
}
function updateGulls(t, dt) {
  const L = LIFE.gulls;
  const a = L.anim;
  L.birds.forEach((b, i) => {
    const ang = b.ph + t * b.w;
    const r = b.r * (1 + 0.15 * Math.sin(t * 0.13 + b.bob));
    const x = b.c[0] + Math.cos(ang) * r, z = b.c[2] + Math.sin(ang) * r;
    const y = b.c[1] + b.h + Math.sin(t * 0.4 + b.bob) * 4;
    const dx = -Math.sin(ang) * Math.sign(b.w), dz = Math.cos(ang) * Math.sign(b.w);
    _o.position.set(x, y, z);
    _o.rotation.set(0, Math.atan2(dx, dz), 0, 'YXZ');
    _o.rotateZ(-Math.sign(b.w) * 0.35);
    _o.rotateX(-Math.cos(t * 0.4 + b.bob) * 0.12);
    _o.scale.setScalar(1.1);
    _o.updateMatrix();
    L.mesh.setMatrixAt(i, _o.matrix);
    // flap in bursts, glide otherwise
    const flapping = Math.sin(t * 0.5 + b.ph * 3) > 0.35 ? 1 : 0;
    a.array[i * 4 + 2] = lerp(a.array[i * 4 + 2], flapping, 1 - Math.exp(-dt * 3));
  });
  a.needsUpdate = true;
  L.mesh.instanceMatrix.needsUpdate = true;
}

// --- pigeons on the plaza (walk, peck, scatter when approached) ---------------------------
function pigeonGeometry() {
  const g1 = srgb('#8b8f98'), g2 = srgb('#6d7078'), neck = srgb('#5d7a74'), beak = srgb('#d9b39a');
  const body = new THREE.SphereGeometry(0.11, 10, 8).scale(1, 0.9, 1.5).translate(0, 0.16, 0);
  const head = new THREE.SphereGeometry(0.055, 8, 6).translate(0, 0.3, 0.13);
  const nk = new THREE.SphereGeometry(0.06, 8, 6).scale(1, 1.3, 1).translate(0, 0.24, 0.1);
  const bk = new THREE.ConeGeometry(0.012, 0.04, 4).rotateX(Math.PI / 2).translate(0, 0.3, 0.19);
  const tail = new THREE.BoxGeometry(0.1, 0.02, 0.14).translate(0, 0.14, -0.2);
  const wl = new THREE.BoxGeometry(0.34, 0.015, 0.14).translate(-0.17, 0.2, 0);
  const wr = new THREE.BoxGeometry(0.34, 0.015, 0.14).translate(0.17, 0.2, 0);
  const legs = new THREE.BoxGeometry(0.06, 0.08, 0.02).translate(0, 0.04, 0);
  return mergeParts([
    { g: body, color: g1, part: 0 }, { g: head, color: g2, part: 2 }, { g: nk, color: neck, part: 2 }, { g: bk, color: beak, part: 2 },
    { g: tail, color: g2, part: 0 }, { g: wl, color: g2, part: 1 }, { g: wr, color: g2, part: 1 }, { g: legs, color: srgb('#c0605a'), part: 0 },
  ]);
}
const PIGEON_V = /* glsl */ `
  // aAnim: x phase, y peck, z flap(0..1)
  if (aPart > 1.5) { float pk = aAnim.y * (0.5 + 0.5 * sin(uTime * 9.0 + aAnim.x)); transformed.y -= pk * 0.12; transformed.z += pk * 0.06; }
  if (aPart > 0.5 && aPart < 1.5) {
    float fl = aAnim.z;
    float ang = sin(uTime * 22.0 + aAnim.x) * 1.0 * fl + fl * 0.3;
    float ax = abs(transformed.x);
    transformed.y += sin(ang) * ax * fl;
    transformed.x = sign(transformed.x) * mix(ax, cos(ang) * ax + 0.0, fl);
    transformed.x *= mix(0.25, 1.0, fl);
  }
`;
function buildPigeons() {
  const F = CITYDATA.fountain;
  if (!F) return;
  const N = 16;
  const { mat, depth } = creatureMat('pigeon', PIGEON_V);
  const mesh = new THREE.InstancedMesh(pigeonGeometry(), mat, N);
  mesh.customDepthMaterial = depth;
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  const anim = instAnim(mesh, N);
  const birds = [];
  for (let i = 0; i < N; i++) {
    const a = rand() * TAU, r = 7.5 + rand() * 8;
    birds.push({ x: F.x + Math.cos(a) * r, z: F.z + Math.sin(a) * r, yaw: rand() * TAU, state: 'walk', t: rand() * 3, vy: 0, y: CITY.walk, tx: 0, tz: 0, home: [F.x, F.z] });
  }
  LIFE.pigeons = { mesh, anim, birds };
  scene.add(mesh);
}
function updatePigeons(t, dt) {
  const L = LIFE.pigeons;
  if (!L) return;
  const cam = camera.position;
  const F = CITYDATA.fountain;
  L.birds.forEach((b, i) => {
    const dCam = Math.hypot(cam.x - b.x, cam.z - b.z);
    const near = dCam < 3.2 && cam.y < CITY.walk + 4;
    b.t -= dt;
    if (b.state !== 'fly' && near) { b.state = 'fly'; b.t = 7 + rand() * 6; b.ang = Math.atan2(b.z - F.z, b.x - F.x); b.vy = 3; }
    let peck = 0, flap = 0;
    if (b.state === 'walk') {
      const sp = 0.35;
      b.x += Math.sin(b.yaw) * sp * dt; b.z += Math.cos(b.yaw) * sp * dt;
      if (b.t < 0) { b.state = rand() < 0.6 ? 'peck' : 'walk'; b.t = 1 + rand() * 3; b.yaw += (rand() - 0.5) * 2.2; }
      const dh = Math.hypot(b.x - F.x, b.z - F.z);
      if (dh > 17 || dh < 6.5) b.yaw = Math.atan2(F.x - b.x, F.z - b.z) + (dh < 6.5 ? Math.PI : 0) + (rand() - 0.5);
      b.y = CITY.walk;
    } else if (b.state === 'peck') {
      peck = 1;
      if (b.t < 0) { b.state = 'walk'; b.t = 1 + rand() * 2; }
      b.y = CITY.walk;
    } else {
      flap = 1;
      b.ang += dt * 0.35;
      const R = 22;
      const tx = F.x + Math.cos(b.ang) * R, tz = F.z + Math.sin(b.ang) * R;
      const ty = CITY.walk + (b.t > 2 ? 9 : 0);
      b.x = lerp(b.x, tx, 1 - Math.exp(-dt * 0.8)); b.z = lerp(b.z, tz, 1 - Math.exp(-dt * 0.8));
      b.y = lerp(b.y, ty, 1 - Math.exp(-dt * 1.2));
      b.yaw = b.ang + Math.PI / 2 * 0 + Math.PI;
      b.yaw = Math.atan2(-Math.sin(b.ang), Math.cos(b.ang));
      if (b.t < 0 && b.y < CITY.walk + 0.4) { b.state = 'walk'; b.t = 2; b.y = CITY.walk; }
    }
    const a = L.anim.array;
    a[i * 4 + 1] = lerp(a[i * 4 + 1], peck, 1 - Math.exp(-dt * 8));
    a[i * 4 + 2] = lerp(a[i * 4 + 2], flap, 1 - Math.exp(-dt * 6));
    _o.position.set(b.x, b.y, b.z);
    _o.rotation.set(0, b.yaw, 0);
    _o.scale.setScalar(1);
    _o.updateMatrix();
    L.mesh.setMatrixAt(i, _o.matrix);
  });
  L.anim.needsUpdate = true;
  L.mesh.instanceMatrix.needsUpdate = true;
}

// --- butterflies --------------------------------------------------------------------------
function buildButterflies() {
  const N = 46;
  const g = new THREE.BufferGeometry();
  const pos = [0, 0, 0.06, 0.16, 0.01, 0.1, 0.12, 0.0, -0.08, 0, 0, -0.04,
    0, 0, 0.06, -0.16, 0.01, 0.1, -0.12, 0.0, -0.08, 0, 0, -0.04];
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex([0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6]);
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(24).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(24).fill(1), 3));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(new Array(8).fill(1), 1));
  const v = /* glsl */ `
    float fl = sin(uTime * 26.0 + aAnim.x) * 0.9 + 0.3;
    float ax = abs(transformed.x);
    transformed.y += sin(fl) * ax;
    transformed.x = sign(transformed.x) * cos(fl) * ax;
  `;
  const { mat, depth } = creatureMat('butterfly', v, { side: THREE.DoubleSide, rough: 0.6 });
  const mesh = new THREE.InstancedMesh(g, mat, N);
  mesh.customDepthMaterial = depth;
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  instAnim(mesh, N);
  const cols = ['#f7f3e8', '#f2c230', '#e98a2c', '#7aa6e8', '#f5e27a'].map((c) => new THREE.Color(c));
  const homes = [];
  const P = CITY.park;
  for (const [bx, bz] of CITYDATA.park.beds) homes.push([bx, bz]);
  for (let i = 0; i < 6; i++) homes.push([rr(P.x0 + 5, P.x1 - 5), rr(P.z0 + 5, P.z1 - 5)]);
  for (let i = 0; i < 8; i++) { const x = rr(-400, 400), z = rr(-400, -240); homes.push([x, z]); }
  const bs = [];
  for (let i = 0; i < N; i++) {
    const h = homes[i % homes.length];
    bs.push({ h, ph: rand() * 100, sp: 0.4 + rand() * 0.4 });
    mesh.setColorAt(i, cols[i % cols.length]);
  }
  LIFE.butterflies = { mesh, bs };
  scene.add(mesh);
}
function updateButterflies(t) {
  const L = LIFE.butterflies;
  const day = G.uDay.value;
  L.bs.forEach((b, i) => {
    const q = t * b.sp + b.ph;
    const x = b.h[0] + Math.sin(q * 0.7) * 3 + Math.sin(q * 1.9) * 1.2;
    const z = b.h[1] + Math.cos(q * 0.53) * 3 + Math.sin(q * 2.3) * 1.0;
    const gy = heightAt(x, z);
    const y = Math.max(gy, 0.3) + 0.6 + Math.abs(Math.sin(q * 1.3)) * 0.9;
    const x2 = b.h[0] + Math.sin((q + 0.05) * 0.7) * 3 + Math.sin((q + 0.05) * 1.9) * 1.2;
    const z2 = b.h[1] + Math.cos((q + 0.05) * 0.53) * 3 + Math.sin((q + 0.05) * 2.3) * 1.0;
    _o.position.set(x, day > 0.2 ? y : -50, z);
    _o.rotation.set(0, Math.atan2(x2 - x, z2 - z), 0);
    _o.scale.setScalar(1.2);
    _o.updateMatrix();
    L.mesh.setMatrixAt(i, _o.matrix);
  });
  L.mesh.instanceMatrix.needsUpdate = true;
}

// --- koi + ducks in the pond ------------------------------------------------------------------
function buildPondLife() {
  const pd = CITY.pond;
  const body = lathe([[0.001, -0.3], [0.05, -0.26], [0.085, -0.12], [0.09, 0.02], [0.07, 0.16], [0.03, 0.26], [0.001, 0.29]], 10).rotateX(Math.PI / 2);
  const fin = new THREE.BufferGeometry();
  fin.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.28, 0, 0.09, -0.45, 0, -0.09, -0.45], 3));
  fin.computeVertexNormals();
  const koiG = mergeParts([{ g: body, color: [1, 1, 1], part: 1 }, { g: fin, color: [1, 1, 1], part: 1 }]);
  const v = /* glsl */ `
    float sw = sin(uTime * 5.0 + aAnim.x - transformed.z * 7.0) * 0.06 * (1.0 - smoothstep(-0.45, 0.2, transformed.z));
    transformed.x += sw;
  `;
  const { mat } = creatureMat('koi', v, { side: THREE.DoubleSide, rough: 0.35 });
  const N = 14;
  const koi = new THREE.InstancedMesh(koiG, mat, N);
  koi.frustumCulled = false;
  instAnim(koi, N);
  const kc = ['#f06a1c', '#f4efe6', '#f2b233', '#e2491d', '#f7f4ee'].map((c) => new THREE.Color(c));
  for (let i = 0; i < N; i++) koi.setColorAt(i, kc[i % kc.length]);
  scene.add(koi);
  // ducks
  const brown = srgb('#6b4c34'), cream = srgb('#d9cdb4'), green = srgb('#1f5a3a'), orange = srgb('#e39a2a');
  const dBody = new THREE.SphereGeometry(0.2, 12, 8).scale(1, 0.65, 1.55).translate(0, 0.06, 0);
  const dHead = new THREE.SphereGeometry(0.09, 10, 8).translate(0, 0.3, 0.24);
  const dNeck = new THREE.CylinderGeometry(0.05, 0.07, 0.2, 8).translate(0, 0.2, 0.22);
  const dBeak = new THREE.BoxGeometry(0.06, 0.025, 0.1).translate(0, 0.28, 0.35);
  const dTail = new THREE.ConeGeometry(0.07, 0.14, 6).rotateX(-Math.PI / 2 - 0.5).translate(0, 0.12, -0.33);
  const duckG = (male) => mergeParts([
    { g: dBody, color: male ? cream : brown, part: 0 }, { g: dHead, color: male ? green : brown, part: 0 },
    { g: dNeck, color: male ? green : brown, part: 0 }, { g: dBeak, color: orange, part: 0 }, { g: dTail, color: male ? srgb('#2a2a2a') : brown, part: 0 },
  ]);
  const dm = creatureMat('duck', '', { rough: 0.8 });
  const ducks = [];
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(duckG(i % 2 === 0), dm.mat);
    m.castShadow = true;
    m.customDepthMaterial = dm.depth;
    scene.add(m);
    ducks.push({ m, ph: rand() * TAU, r: 6 + rand() * 9, w: (0.04 + rand() * 0.04) * (rand() < 0.5 ? -1 : 1) });
  }
  LIFE.pond = { koi, ducks, fish: Array.from({ length: N }, () => ({ ph: rand() * TAU, r: 4 + rand() * 12, w: (0.12 + rand() * 0.2) * (rand() < 0.5 ? -1 : 1), d: 0.25 + rand() * 0.45, wob: rand() * 10 })) };
  void pd;
}
function updatePondLife(t) {
  const L = LIFE.pond; if (!L) return;
  const pd = CITY.pond;
  L.fish.forEach((f, i) => {
    const a = f.ph + t * f.w;
    const r = f.r * (1 + 0.2 * Math.sin(t * 0.3 + f.wob));
    const x = pd.x + Math.cos(a) * r, z = pd.z + Math.sin(a) * r * 0.8;
    _o.position.set(x, -f.d, z);
    _o.rotation.set(0, Math.atan2(-Math.sin(a) * Math.sign(f.w), Math.cos(a) * Math.sign(f.w) * 0.8), 0);
    _o.scale.setScalar(1.4);
    _o.updateMatrix();
    L.koi.setMatrixAt(i, _o.matrix);
  });
  L.koi.instanceMatrix.needsUpdate = true;
  L.ducks.forEach((d) => {
    const a = d.ph + t * d.w;
    const x = pd.x + Math.cos(a) * d.r, z = pd.z + Math.sin(a) * d.r * 0.85;
    d.m.position.set(x, 0.02 + Math.sin(t * 1.7 + d.ph) * 0.015, z);
    d.m.rotation.set(Math.sin(t * 1.3 + d.ph) * 0.04, Math.atan2(-Math.sin(a) * Math.sign(d.w), Math.cos(a) * Math.sign(d.w) * 0.85), 0);
  });
}

// --- boats ------------------------------------------------------------------------------------
function hullGeometry(L, W, H, cTop, cStripe, cBottom) {
  const N = 14, M = 10;
  const pos = [], col = [], idx = [];
  const rows = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const z = -L / 2 + t * L;
    const w = (W / 2) * (t < 0.12 ? 0.82 + (t / 0.12) * 0.18 : Math.pow(Math.max(0, 1 - Math.pow((t - 0.12) / 0.88, 2.4)), 0.55));
    const top = H * (0.55 + 0.25 * t * t);
    const bot = -H * 0.45 * (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, t * 1.05)));
    const row = [];
    for (let j = 0; j <= M; j++) {
      const th = (j / M) * Math.PI;
      const x = -Math.max(w, 0.01) * Math.cos(th);
      const y = top - (top - bot) * Math.sin(th);
      row.push(pos.length / 3);
      pos.push(x, y, z);
      const c = y > top - 0.14 ? cStripe : y > 0.05 ? cTop : cBottom;
      col.push(...c);
    }
    rows.push(row);
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) {
    const a = rows[i][j], b = rows[i + 1][j], c = rows[i + 1][j + 1], d = rows[i][j + 1];
    idx.push(a, d, b, b, d, c);
  }
  // deck
  const deckBase = pos.length / 3;
  for (let i = 0; i <= N; i++) {
    const l = rows[i][0], r = rows[i][M];
    pos.push(pos[l * 3], pos[l * 3 + 1] - 0.05, pos[l * 3 + 2], pos[r * 3], pos[r * 3 + 1] - 0.05, pos[r * 3 + 2]);
    col.push(...srgb('#b89a74'), ...srgb('#b89a74'));
  }
  for (let i = 0; i < N; i++) { const a = deckBase + i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  // transom
  const tb0 = rows[0];
  for (let j = 1; j < M; j++) idx.push(tb0[0], tb0[j + 1], tb0[j]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
function boatGeometry(kind, palette) {
  const b = new GeoBuilder({ aP: 3 }, { aP: [0.55, 0, 0] });
  const I = new THREE.Matrix4();
  const addHull = (L, W, H) => {
    const h = hullGeometry(L, W, H, palette[0], palette[1], palette[2]);
    const p = h.attributes.position, n = h.attributes.normal, c = h.attributes.color;
    const base = b.vcount;
    for (let i = 0; i < p.count; i++) {
      b.pos.push(p.getX(i), p.getY(i), p.getZ(i)); b.nrm.push(n.getX(i), n.getY(i), n.getZ(i)); b.uv.push(0, 0);
      b.col.push(c.getX(i), c.getY(i), c.getZ(i)); b.extra.aP.data.push(0.45, 0, 0);
    }
    for (let i = 0; i < h.index.count; i++) b.idx.push(base + h.index.getX(i));
    b.vcount += p.count;
  };
  if (kind === 'fish') {
    addHull(7, 2.4, 1.1);
    boxW(b, 0, 1.25, -0.6, 1.5, 1.2, 1.8, 0, srgb('#f1eee6'));
    boxW(b, 0, 1.9, -0.6, 1.7, 0.1, 2.0, 0, palette[1]);
    boxW(b, 0, 1.3, 0.31, 1.3, 0.5, 0.02, 0, srgb('#20303a'), { aP: [0.1, 0.2, 2] });
    addGeo(b, new THREE.CylinderGeometry(0.05, 0.06, 3.2, 6), 0, 2.2, 0.8, 0, 1, srgb('#d8d4cc'));
    addGeo(b, new THREE.SphereGeometry(0.08, 6, 4), 0, 3.85, 0.8, 0, 1, srgb('#ffd27a'), { aP: [0.2, 0, 8] });
  } else if (kind === 'sail') {
    addHull(9, 2.8, 1.15);
    boxW(b, 0, 1.12, -0.8, 1.6, 0.45, 2.6, 0, srgb('#f3f1ec'));
    addGeo(b, new THREE.CylinderGeometry(0.06, 0.08, 11, 6), 0, 6.3, 0.6, 0, 1, srgb('#d6d6d2'), { aP: [0.3, 0.6, 0] });
    addGeo(b, new THREE.CylinderGeometry(0.05, 0.05, 3.8, 6), 0, 1.95, -1.3, 0, 1, srgb('#cfcfc9'), { aP: [0.3, 0.6, 0] }, Math.PI / 2);
    addGeo(b, new THREE.CylinderGeometry(0.16, 0.16, 3.4, 8), 0, 2.1, -1.2, 0, 1, srgb('#e9e4d6'), {}, Math.PI / 2);
    addGeo(b, new THREE.SphereGeometry(0.07, 6, 4), 0, 11.9, 0.6, 0, 1, srgb('#ff6b5a'), { aP: [0.2, 0, 8] });
  } else {
    addHull(4, 1.45, 0.55);
    boxW(b, 0, 0.3, 0, 1.2, 0.05, 0.3, 0, srgb('#8a6444'));
    boxW(b, 0, 0.3, -1, 1.1, 0.05, 0.3, 0, srgb('#8a6444'));
  }
  void I;
  return b.build();
}
function sailGeometry(h, w) {
  // mainsail triangle as a grid (for billow) with uv
  const g = new THREE.BufferGeometry();
  const pos = [], uv = [], idx = [];
  const R = 8;
  for (let j = 0; j <= R; j++) for (let i = 0; i <= R; i++) {
    const u = i / R, v = j / R;
    const x = 0, y = v * h, z = -u * w * (1 - v);
    pos.push(x, y, z); uv.push(u, v);
  }
  for (let j = 0; j < R; j++) for (let i = 0; i < R; i++) {
    const a = j * (R + 1) + i;
    idx.push(a, a + 1, a + R + 1, a + 1, a + R + 2, a + R + 1);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
function buildBoats() {
  const pm = MATS.props;
  const palettes = [
    [srgb('#f3f1ec'), srgb('#2b5c8f'), srgb('#7a2a22')], [srgb('#c9432f'), srgb('#f1ede4'), srgb('#2a2a2a')],
    [srgb('#f3f1ec'), srgb('#2f6b4f'), srgb('#6b2a22')], [srgb('#2e4a6b'), srgb('#f3efe6'), srgb('#7a2a22')],
    [srgb('#f1d48a'), srgb('#305b7a'), srgb('#6b2a22')],
  ];
  const boats = [];
  const geos = {};
  const getG = (k, pi) => (geos[k + pi] = geos[k + pi] || boatGeometry(k, palettes[pi]));
  for (const pr of CITYDATA.piers) {
    let side = 1;
    for (let z = pr.z0 + 8; z < pr.z1 - 2; z += 10) {
      const kind = rand() < 0.4 ? 'sail' : 'fish';
      const pi = Math.floor(rand() * palettes.length);
      const m = new THREE.Mesh(getG(kind, pi), pm);
      m.castShadow = true; m.receiveShadow = true;
      scene.add(m);
      boats.push({ m, x: pr.x + side * (kind === 'sail' ? 4.1 : 3.8), z, yaw: rand() < 0.5 ? 0 : Math.PI, ph: rand() * TAU, moving: false });
      side = -side;
    }
  }
  // rowboats in the canal
  for (const [x, z] of [[-5.6, 20], [5.8, -80], [-5.8, 90], [5.6, 34]]) {
    const m = new THREE.Mesh(getG('row', 4), pm);
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
    boats.push({ m, x, z, yaw: rand() * 0.2, ph: rand() * TAU, moving: false, calm: true });
  }
  // sailing boats crossing the bay with billowing sails
  const sailMat = new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.8, side: THREE.DoubleSide });
  patch(sailMat, {
    key: 'sail',
    vBegin: /* glsl */ `
      float bil = sin(3.14159 * uv.x) * sin(3.14159 * uv.y * 0.9) * (0.6 + 0.4 * uWind.z);
      transformed.x += bil * (0.9 + 0.08 * sin(uTime * 3.0 + uv.y * 5.0));
    `,
    fDir: 'reflectedLight.directDiffuse += directLight.color * diffuseColor.rgb * 0.35 * max(0.0, -dot(normal, directLight.direction));',
  });
  for (let i = 0; i < 3; i++) {
    const pi = i % palettes.length;
    const m = new THREE.Mesh(getG('sail', pi), pm);
    const sail = new THREE.Mesh(sailGeometry(9.5, 3.6), sailMat);
    sail.position.set(0, 1.9, 0.45);
    m.add(sail);
    const jib = new THREE.Mesh(sailGeometry(8.5, 2.6), sailMat);
    jib.position.set(0, 1.4, 4.1);
    m.add(jib);
    m.castShadow = true; sail.castShadow = true; jib.castShadow = true;
    scene.add(m);
    boats.push({ m, moving: true, c: [-60 + i * 140, 0, 430 + i * 60], r: 170 + i * 50, w: (0.012 + i * 0.004) * (i % 2 ? -1 : 1), ph: rand() * TAU });
  }
  LIFE.boats = boats;
}
function updateBoats(t) {
  for (const b of LIFE.boats) {
    let x = b.x, z = b.z, yaw = b.yaw, heel = 0;
    if (b.moving) {
      const a = b.ph + t * b.w;
      x = b.c[0] + Math.cos(a) * b.r; z = b.c[2] + Math.sin(a) * b.r * 0.6;
      const dx = -Math.sin(a) * Math.sign(b.w), dz = Math.cos(a) * 0.6 * Math.sign(b.w);
      yaw = Math.atan2(dx, dz);
      heel = 0.12 + G.uWind.value.z * 0.14;
    }
    const w = b.calm ? { y: 0, nx: 0, nz: 0 } : waveAt(x, z, G.uTime.value);
    const bobY = w.y + Math.sin(t * 1.1 + b.ph) * 0.03;
    b.m.position.set(x, bobY - 0.1, z);
    b.m.rotation.set(0, 0, 0);
    b.m.rotateY(yaw);
    b.m.rotateX(clamp(w.nz * 0.8, -0.2, 0.2) + Math.sin(t * 0.9 + b.ph) * 0.02);
    b.m.rotateZ(clamp(-w.nx * 0.8, -0.2, 0.2) + Math.sin(t * 0.7 + b.ph * 2) * 0.025 + heel);
  }
}

// --- trams ----------------------------------------------------------------------------------
function tramGeometry() {
  const b = new GeoBuilder({ aP: 3 }, { aP: [0.5, 0, 0] });
  const red = srgb('#b33a2b'), cream = srgb('#efe4c8'), dark = srgb('#2a2d2e');
  boxW(b, 0, 0.75, 0, 11, 1.1, 2.4, 0, red);
  boxW(b, 0, 2.05, 0, 11, 1.5, 2.4, 0, cream);
  boxW(b, 0, 3.0, 0, 11.2, 0.4, 2.5, 0, red);
  boxW(b, 0, 3.35, 0, 10.4, 0.3, 2.1, 0, srgb('#6a6d6e'));
  for (let k = -4; k <= 4; k++) {
    for (const sz of [1.21, -1.21]) boxW(b, k * 1.15, 2.1, sz, 0.95, 1.05, 0.03, 0, srgb('#1e2a30'), { aP: [0.08, 0.3, 3.5] });
  }
  for (const sx of [5.51, -5.51]) {
    boxW(b, sx, 2.1, 0, 0.03, 1.1, 1.9, 0, srgb('#1e2a30'), { aP: [0.08, 0.3, 3.5] });
    boxW(b, sx, 1.0, 0.7, 0.05, 0.22, 0.22, 0, srgb('#fff4d0'), { aP: [0.2, 0, 12] });
    boxW(b, sx, 1.0, -0.7, 0.05, 0.22, 0.22, 0, srgb('#fff4d0'), { aP: [0.2, 0, 12] });
  }
  for (const wx of [-3.6, 3.6]) for (const wz of [0.75, -0.75]) addGeo(b, new THREE.CylinderGeometry(0.38, 0.38, 0.12, 12), wx, 0.4, wz, 0, 1, dark, { aP: [0.4, 0.8, 0] }, Math.PI / 2);
  boxW(b, 0, 0.35, 0, 9, 0.3, 1.7, 0, dark);
  boxW(b, 0, 4.0, 0, 0.08, 1.2, 0.08, 0, dark);
  boxW(b, 0, 4.6, 0, 0.6, 0.06, 1.6, 0, dark);
  return b.build();
}
function buildTrams() {
  const g = tramGeometry();
  LIFE.trams = [];
  for (const [zc, dir, off] of [[111.65, 1, 0], [114.35, -1, 0.5]]) {
    const m = new THREE.Mesh(g, MATS.props);
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
    LIFE.trams.push({ m, zc, dir, off });
  }
}
function tramX(u) {
  // back-and-forth with pauses at the ends and a mid stop
  const L = 440, sp = 6.5;
  const legT = L / sp, pause = 10;
  const cyc = 2 * (legT + pause + 6);
  let t = ((u % cyc) + cyc) % cyc;
  const leg = (tt) => {
    if (tt < legT / 2) return -220 + tt * sp;
    if (tt < legT / 2 + 6) return 0;
    if (tt < legT + 6) return (tt - legT / 2 - 6) * sp;
    return 220;
  };
  if (t < legT + 6) return { x: leg(t), d: 1 };
  t -= legT + 6;
  if (t < pause) return { x: 220, d: 0 };
  t -= pause;
  if (t < legT + 6) return { x: -leg(t), d: -1 };
  return { x: -220, d: 0 };
}
function updateTrams(t) {
  for (const tr of LIFE.trams) {
    const u = t + tr.off * 90;
    const p = tramX(u);
    const x = tr.dir * p.x;
    const bridge = Math.abs(x) < 13 ? deckY(x, 0.15) - CITY.road : 0;
    tr.m.position.set(x, CITY.road + 0.02 + bridge, tr.zc);
  }
}

// --- cherry petals (fully GPU-animated) --------------------------------------------------------
function buildPetals() {
  const trees = SPECIES.cherry.items;
  if (!trees.length) return;
  const N = Math.floor(3200 * Math.max(0.4, Qs.grass));
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.03, 0, -0.02, 0.03, 0, -0.02, 0.03, 0, 0.02, -0.03, 0, 0.02], 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const a0 = new Float32Array(N * 4), a1 = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) {
    const tr = trees[Math.floor(rand() * trees.length)];
    const ang = rand() * TAU, r = Math.sqrt(rand()) * 3.4 * tr.s;
    a0[i * 4] = tr.x + Math.cos(ang) * r; a0[i * 4 + 1] = tr.y + (2.4 + rand() * 2.2) * tr.s; a0[i * 4 + 2] = tr.z + Math.sin(ang) * r; a0[i * 4 + 3] = tr.y + 0.15;
    a1[i * 4] = rand(); a1[i * 4 + 1] = rand(); a1[i * 4 + 2] = 9 + rand() * 7; a1[i * 4 + 3] = rand();
  }
  geo.setAttribute('aP0', new THREE.InstancedBufferAttribute(a0, 4));
  geo.setAttribute('aP1', new THREE.InstancedBufferAttribute(a1, 4));
  geo.instanceCount = N;
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#ffc6d6'), roughness: 0.6, side: THREE.DoubleSide });
  patch(mat, {
    key: 'petal',
    vHead: 'attribute vec4 aP0; attribute vec4 aP1; varying float vPetalA;',
    vNormal: /* glsl */ `
      float life = aP1.z;
      float ph = fract(uTime / life + aP1.x);
      float tt = ph * life;
      float fallT = 7.0 + aP1.y * 4.0;
      float tf = min(tt, fallT);
      vec3 p0 = aP0.xyz;
      vec2 wd = uWind.xy * (0.35 + uWind.z * 1.4);
      vec3 pos = p0 + vec3(wd.x * tf, -tf * (0.55 + aP1.w * 0.3), wd.y * tf);
      pos.x += sin(tf * 2.1 + aP1.x * 20.0) * 0.35;
      pos.z += cos(tf * 1.7 + aP1.y * 20.0) * 0.35;
      float floorY = aP0.w;
      if (abs(pos.x) < 8.0 && pos.z > -150.0 && pos.z < 146.0) floorY = 0.02;
      bool landed = pos.y <= floorY;
      if (landed) {
        pos.y = floorY + 0.005;
        if (floorY < 0.1) pos.xz += vec2(0.0, 0.08) * (tt - fallT) + uWind.xy * 0.05 * (tt - fallT);
      }
      float spin = tf * (3.0 + aP1.w * 4.0);
      mat3 R = landed ? mat3(1.0) : mat3(cos(spin), sin(spin) * 0.7, 0.0, -sin(spin), cos(spin), sin(spin * 0.7), 0.0, -sin(spin * 0.7), 1.0);
      vec3 petalLocal = R * position;
      objectNormal = normalize(R * normal);
      vPetalA = smoothstep(0.0, 0.03, ph) * (1.0 - smoothstep(0.9, 1.0, ph));
      vec3 petalPos = pos + petalLocal * (0.8 + aP1.w * 0.5) * vPetalA;
    `,
    vBegin: 'transformed = petalPos;',
    fHead: 'varying float vPetalA;',
    fColor: 'diffuseColor.rgb *= 0.9 + 0.2 * vPetalA;',
    fDir: 'reflectedLight.directDiffuse += directLight.color * diffuseColor.rgb * 0.5 * pow(clamp(dot(geometryViewDir, -directLight.direction), 0.0, 1.0), 2.0);',
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.layers.set(LAYER_NOREFLECT);
  scene.add(mesh);
  LIFE.petals = mesh;
}

// --- point sprites (fireflies, pollen, smoke, fountain, lamp halos) ------------------------------
function spriteMaterial(key, vertex, frag, { additive = true, uniforms = {} } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { ...G, uGlow: { value: TEX.glow }, uPR: { value: renderer.getPixelRatio() }, ...uniforms },
    vertexShader: GLSL_COMMON + vertex,
    fragmentShader: GLSL_COMMON + frag,
    transparent: true, depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}
function buildFireflies() {
  const N = 320;
  const pos = new Float32Array(N * 3), seed = new Float32Array(N);
  const P = CITY.park;
  for (let i = 0; i < N; i++) {
    let x, z;
    if (i < 160) { x = rr(P.x0, P.x1); z = rr(P.z0, P.z1); }
    else { x = rr(-520, 520); z = rr(-440, -230); }
    pos[i * 3] = x; pos[i * 3 + 1] = heightAt(x, z) + 0.4 + rand() * 1.4; pos[i * 3 + 2] = z; seed[i] = rand();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const mat = spriteMaterial('ff', /* glsl */ `
    attribute float aSeed; varying float vA; varying vec3 vW; uniform float uPR;
    void main() {
      vec3 p = position;
      float t = uTime * (0.25 + aSeed * 0.2) + aSeed * 50.0;
      p += vec3(sin(t * 1.3) * 1.6 + sin(t * 3.1) * 0.3, sin(t * 0.9) * 0.6, cos(t * 1.1) * 1.6);
      vW = p;
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      float blink = smoothstep(0.35, 1.0, sin(uTime * (1.2 + aSeed * 1.8) + aSeed * 40.0));
      vA = blink * smoothstep(0.55, 0.95, uNight);
      gl_PointSize = clamp(0.35 * uPR * 900.0 / max(-mv.z, 0.1) * (0.6 + blink * 0.6), 1.0, 96.0);
      vA *= step(0.1, -mv.z);
      gl_Position = projectionMatrix * mv;
    }`, /* glsl */ `
    uniform sampler2D uGlow; varying float vA; varying vec3 vW;
    void main() {
      float a = texture2D(uGlow, gl_PointCoord).a * vA;
      if (a < 0.01) discard;
      gl_FragColor = vec4(vec3(0.75, 1.0, 0.35) * a * 4.0 * (1.0 - fogAmount(vW)), 1.0);
    }`);
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  pts.layers.set(LAYER_NOREFLECT);
  scene.add(pts);
  LIFE.fireflies = pts;
}
function buildPollen() {
  const N = 900;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { pos[i * 3] = rand() * 40; pos[i * 3 + 1] = rand() * 14; pos[i * 3 + 2] = rand() * 40; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = spriteMaterial('pollen', /* glsl */ `
    uniform float uPR; varying float vA; varying vec3 vW;
    void main() {
      vec3 base = cameraPosition - vec3(20.0, 5.0, 20.0);
      vec3 p = position + vec3(uWind.x, 0.0, uWind.y) * uTime * (0.3 + uWind.z) + vec3(sin(uTime * 0.3 + position.z) * 0.5, sin(uTime * 0.2 + position.x) * 0.4, 0.0);
      p = base + mod(p - base, vec3(40.0, 14.0, 40.0));
      vW = p;
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      vec3 v = normalize(p - cameraPosition);
      float back = pow(max(dot(v, uTrueSun), 0.0), 6.0);
      float dist = length(p - cameraPosition);
      vA = (0.02 + back * 0.7) * (1.0 - smoothstep(8.0, 20.0, dist)) * smoothstep(0.5, 2.0, dist) * uDay * step(0.1, -mv.z);
      gl_PointSize = clamp(0.05 * uPR * 900.0 / max(-mv.z, 0.1), 1.0, 40.0);
      gl_Position = projectionMatrix * mv;
    }`, /* glsl */ `
    uniform sampler2D uGlow; varying float vA; varying vec3 vW;
    void main() {
      float a = texture2D(uGlow, gl_PointCoord).a * vA;
      if (a < 0.005) discard;
      gl_FragColor = vec4(uSunCol * 0.35 * a, 1.0);
    }`);
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  pts.layers.set(LAYER_NOREFLECT);
  scene.add(pts);
}
function buildSmoke() {
  const ch = (CITYDATA.chimneys || []).slice(0, 26);
  if (!ch.length) return;
  const per = 26, N = ch.length * per;
  const pos = new Float32Array(N * 3), sd = new Float32Array(N);
  for (let i = 0; i < N; i++) { const c = ch[Math.floor(i / per)]; pos[i * 3] = c.x; pos[i * 3 + 1] = c.y; pos[i * 3 + 2] = c.z; sd[i] = rand(); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(sd, 1));
  const mat = spriteMaterial('smoke', /* glsl */ `
    attribute float aSeed; uniform float uPR; varying float vA; varying vec3 vW;
    void main() {
      float life = 9.0;
      float ph = fract(uTime / life + aSeed);
      float tt = ph * life;
      vec3 p = position + vec3(uWind.x, 0.0, uWind.y) * tt * (0.6 + uWind.z * 2.0) + vec3(0.0, tt * 0.7, 0.0);
      p.x += sin(tt * 0.8 + aSeed * 30.0) * 0.4 * tt * 0.2;
      vW = p;
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      vA = smoothstep(0.0, 0.1, ph) * (1.0 - ph) * 0.22;
      gl_PointSize = clamp((0.6 + tt * 0.5) * uPR * 900.0 / max(-mv.z, 0.1), 1.0, 160.0);
      vA *= step(0.1, -mv.z);
      gl_Position = projectionMatrix * mv;
    }`, /* glsl */ `
    uniform sampler2D uGlow; varying float vA; varying vec3 vW;
    void main() {
      float a = texture2D(uGlow, gl_PointCoord).a * vA;
      if (a < 0.003) discard;
      vec3 c = (uSunCol * 0.18 + uZenith * 0.8 + uHorizon * 0.5) * 0.9;
      c = applyFog(c, vW);
      gl_FragColor = vec4(c, a);
    }`, { additive: false });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 5;
  scene.add(pts);
}

// --- fountain water: jets, overflow curtains, droplets ------------------------------------------
function buildFountainWater() {
  const F = CITYDATA.fountain;
  if (!F) return;
  const N = 2600;
  const pos = new Float32Array(N * 3), a = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = F.x; pos[i * 3 + 1] = F.y; pos[i * 3 + 2] = F.z;
    const type = i < 700 ? 0 : i < 1500 ? 1 : i < 2100 ? 2 : 3;
    a[i * 4] = type; a[i * 4 + 1] = rand(); a[i * 4 + 2] = rand(); a[i * 4 + 3] = rand();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aD', new THREE.BufferAttribute(a, 4));
  const mat = spriteMaterial('fount', /* glsl */ `
    attribute vec4 aD; uniform float uPR; varying float vA; varying vec3 vW;
    void main() {
      vec3 o = position;
      float type = aD.x;
      vec3 p; float life; float ph;
      float ang = aD.z * 6.2831853;
      if (type < 0.5) {
        // central jet up to ~2.3 m above the top bowl
        life = 1.35; ph = fract(uTime / life + aD.y);
        float t = ph * life;
        vec3 v = vec3(cos(ang) * 0.35 * aD.w, 6.6 + aD.w * 0.5, sin(ang) * 0.35 * aD.w);
        p = o + vec3(0.0, 3.9, 0.0) + v * t + vec3(0.0, -4.9 * t * t, 0.0);
        p.y = max(p.y, o.y + 3.25);
      } else if (type < 1.5) {
        // overflow of the upper bowl onto the lower bowl
        life = 0.55; ph = fract(uTime / life + aD.y);
        float t = ph * life;
        vec3 dir = vec3(cos(ang), 0.0, sin(ang));
        p = o + dir * (1.1 + t * 0.35) + vec3(0.0, 3.25 - 4.9 * t * t, 0.0);
      } else if (type < 2.5) {
        // overflow of the lower bowl into the pool
        life = 0.62; ph = fract(uTime / life + aD.y);
        float t = ph * life;
        vec3 dir = vec3(cos(ang), 0.0, sin(ang));
        p = o + dir * (2.26 + t * 0.45) + vec3(0.0, 1.8 - 4.9 * t * t, 0.0);
        p.y = max(p.y, o.y + 0.45);
      } else {
        // eight arcing jets from the basin rim toward the centre
        float jet = floor(aD.z * 8.0);
        float ja = jet / 8.0 * 6.2831853 + 0.2;
        life = 1.1; ph = fract(uTime / life + aD.y);
        float t = ph * life;
        vec3 dir = vec3(cos(ja), 0.0, sin(ja));
        p = o + dir * (5.1 - t * 2.9) + vec3(0.0, 0.6 + 3.6 * t - 4.9 * t * t, 0.0) + vec3(aD.w - 0.5) * 0.06;
        p.y = max(p.y, o.y + 0.45);
      }
      vW = p;
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      vA = smoothstep(0.0, 0.08, ph) * (1.0 - smoothstep(0.85, 1.0, ph));
      gl_PointSize = clamp((type < 0.5 ? 0.09 : 0.075) * uPR * 900.0 / max(-mv.z, 0.1), 1.0, 64.0);
      vA *= step(0.1, -mv.z);
      gl_Position = projectionMatrix * mv;
    }`, /* glsl */ `
    uniform sampler2D uGlow; varying float vA; varying vec3 vW;
    void main() {
      float a = texture2D(uGlow, gl_PointCoord).a * vA;
      if (a < 0.02) discard;
      vec3 V = normalize(cameraPosition - vW);
      float glint = pow(max(dot(-V, uTrueSun), 0.0), 8.0);
      vec3 c = uZenith * 0.8 + uHorizon * 0.6 + uSunCol * (0.12 + glint * 0.8) + vec3(0.02) + vec3(1.0, 0.72, 0.42) * uNight * 0.35;
      c = applyFog(c, vW);
      gl_FragColor = vec4(c, a * 0.55);
    }`, { additive: false });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 4;
  pts.layers.set(LAYER_NOREFLECT);
  scene.add(pts);
  // translucent falling curtains below both bowls
  const curtain = (r0, r1, yTop, yBot) => {
    const cg = new THREE.CylinderGeometry(r0, r1, yTop - yBot, 40, 1, true);
    cg.translate(0, (yTop + yBot) / 2, 0);
    return cg;
  };
  const cmat = new THREE.ShaderMaterial({
    uniforms: { ...G },
    vertexShader: GLSL_COMMON + `varying vec2 vUv; varying vec3 vW; varying vec3 vN;
      void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: GLSL_COMMON + `varying vec2 vUv; varying vec3 vW; varying vec3 vN;
      void main(){
        float s = texture2D(uNoise, vec2(vUv.x * 6.0, vUv.y * 0.6 + uTime * 1.6)).a;
        float s2 = texture2D(uNoise, vec2(vUv.x * 14.0 + 0.3, vUv.y * 0.9 + uTime * 2.3)).b;
        float streak = smoothstep(0.35, 0.8, s * 0.6 + s2 * 0.5);
        vec3 V = normalize(cameraPosition - vW);
        float fresnel = clamp(1.0 - abs(dot(V, normalize(vN))), 0.0, 1.0);
        float fr = fresnel * fresnel;
        float a = (0.12 + streak * 0.45 + fr * 0.35) * smoothstep(0.0, 0.15, vUv.y);
        vec3 c = uZenith * 0.9 + uHorizon * 0.7 + uSunCol * 0.12 + vec3(0.03) + vec3(1.0, 0.72, 0.42) * uNight * 0.3;
        gl_FragColor = vec4(applyFog(c, vW), a);
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  const c1 = new THREE.Mesh(curtain(1.12, 1.3, 3.27, 1.8), cmat);
  const c2 = new THREE.Mesh(curtain(2.28, 2.55, 1.82, 0.45), cmat);
  for (const c of [c1, c2]) { c.position.set(F.x, F.y, F.z); c.renderOrder = 3; c.layers.set(LAYER_NOREFLECT); scene.add(c); }
}

// --- lamps: halos for all, real point lights for the nearest ------------------------------------
function buildLampLights() {
  const L = CITYDATA.lamps;
  const pos = new Float32Array(L.length * 3);
  L.forEach((p, i) => { pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z; });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = spriteMaterial('halo', /* glsl */ `
    uniform float uPR; varying float vA; varying vec3 vW;
    void main() {
      vW = position;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vA = smoothstep(0.35, 0.8, uNight);
      gl_PointSize = clamp(2.6 * uPR * 900.0 / max(-mv.z, 0.1), 1.0, 70.0 * uPR);
      vA *= smoothstep(3.0, 9.0, -mv.z);
      gl_Position = projectionMatrix * mv;
    }`, /* glsl */ `
    uniform sampler2D uGlow; varying float vA; varying vec3 vW;
    void main() {
      float a = pow(texture2D(uGlow, gl_PointCoord).a, 2.2) * vA;
      if (a < 0.004) discard;
      gl_FragColor = vec4(vec3(1.0, 0.72, 0.4) * a * 0.9 * (1.0 - fogAmount(vW)), 1.0);
    }`);
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  pts.layers.set(LAYER_NOREFLECT);
  scene.add(pts);
  LIFE.lights = [];
  for (let i = 0; i < 8; i++) {
    const pl = new THREE.PointLight(0xffb870, 0, 22, 1.6);
    scene.add(pl);
    LIFE.lights.push(pl);
  }
}
let lightTimer = 0;
function updateLampLights(dt) {
  lightTimer -= dt;
  const n = G.uNight.value;
  if (lightTimer <= 0) {
    lightTimer = 0.4;
    const cam = camera.position;
    const sorted = CITYDATA.lamps.map((p) => [p, p.distanceToSquared(cam)]).sort((a, b) => a[1] - b[1]).slice(0, LIFE.lights.length);
    sorted.forEach(([p], i) => LIFE.lights[i].position.copy(p).add(new V3(0, -0.2, 0)));
  }
  for (const l of LIFE.lights) l.intensity = n * 28 * smoothstep(0.3, 0.9, n);
}

// --- lighthouse beam ----------------------------------------------------------------------------
function buildLighthouseBeam() {
  const LH = CITYDATA.lighthouse;
  if (!LH) return;
  const len = 420;
  const g = new THREE.ConeGeometry(12, len, 24, 1, true).translate(0, -len / 2, 0).rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...G },
    vertexShader: GLSL_COMMON + `varying vec3 vL; varying vec3 vW; void main(){ vL = position; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: GLSL_COMMON + `varying vec3 vL; varying vec3 vW; void main(){
      float d = clamp(vL.z / ${len.toFixed(1)}, 0.0, 1.0);
      float a = (1.0 - d) * (1.0 - d) * 0.22 * smoothstep(0.4, 0.9, uNight);
      gl_FragColor = vec4(vec3(1.0, 0.92, 0.7) * a * (1.0 - fogAmount(vW) * 0.6), 1.0);
    }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const piv = new THREE.Object3D();
  piv.position.set(LH.x, LH.y, LH.z);
  const b1 = new THREE.Mesh(g, mat), b2 = new THREE.Mesh(g, mat);
  b2.rotation.y = Math.PI;
  piv.add(b1, b2);
  b1.layers.set(LAYER_NOREFLECT); b2.layers.set(LAYER_NOREFLECT);
  scene.add(piv);
  LIFE.beam = piv;
}

function buildLife() {
  buildGulls();
  buildPigeons();
  buildButterflies();
  buildPondLife();
  buildBoats();
  buildTrams();
  buildPetals();
  buildFireflies();
  buildPollen();
  buildSmoke();
  buildFountainWater();
  buildLampLights();
  buildLighthouseBeam();
}
function updateLife(dt, t) {
  updateGulls(t, dt);
  updatePigeons(t, dt);
  updateButterflies(t);
  updatePondLife(t);
  updateBoats(t);
  updateTrams(t);
  updateLampLights(dt);
  if (LIFE.beam) LIFE.beam.rotation.y = t * 0.55;
}
