// ============================================================================
// Landmarks: plaza (fountain, clock tower, cafe), park, piers, lighthouse,
// hillside villas + chapel, beach huts
// ============================================================================

function ringWall(b, cx, cz, r0, r1, y0, y1, seg, color) {
  // outer wall, inner wall and top cap of an annulus
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
    const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    const uvO = (P) => [Math.atan2(P.z - cz, P.x - cx) * r1, P.y];
    const uvI = (P) => [Math.atan2(P.z - cz, P.x - cx) * r0, P.y];
    quadW(b, new V3(cx + c1 * r1, y0, cz + s1 * r1), new V3(cx + c0 * r1, y0, cz + s0 * r1), new V3(cx + c0 * r1, y1, cz + s0 * r1), new V3(cx + c1 * r1, y1, cz + s1 * r1), color, {}, uvO);
    quadW(b, new V3(cx + c0 * r0, y0, cz + s0 * r0), new V3(cx + c1 * r0, y0, cz + s1 * r0), new V3(cx + c1 * r0, y1, cz + s1 * r0), new V3(cx + c0 * r0, y1, cz + s0 * r0), color, {}, uvI);
    quadW(b, new V3(cx + c0 * r0, y1, cz + s0 * r0), new V3(cx + c1 * r0, y1, cz + s1 * r0), new V3(cx + c1 * r1, y1, cz + s1 * r1), new V3(cx + c0 * r1, y1, cz + s0 * r1), color.map((v) => v * 1.08), {}, (P) => [P.x, P.z]);
  }
}
function lathe(points, seg = 24) { return new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), seg); }

let POOLS = [];
function buildPlaza() {
  const Z = CITY.plaza;
  const cx = (Z.x0 + Z.x1) / 2, cz = (Z.z0 + Z.z1) / 2 + 3;
  const y = CITY.walk;
  const st = tb('stone', cx, cz), pb = tb('props', cx, cz);
  const sc = srgb('#cdbfa6');
  // fountain basin
  ringWall(st, cx, cz, 5.2, 5.75, y - 0.1, y + 0.55, 40, sc);
  quadW(st, new V3(cx - 5.3, y + 0.02, cz + 5.3), new V3(cx + 5.3, y + 0.02, cz + 5.3), new V3(cx + 5.3, y + 0.02, cz - 5.3), new V3(cx - 5.3, y + 0.02, cz - 5.3), srgb('#8f9990'), {}, (P) => [P.x, P.z]);
  const stoneP = { aP: [0.8, 0, 0] };
  addGeo(pb, lathe([[0.001, 0], [0.75, 0], [0.62, 0.3], [0.5, 1.2], [0.7, 1.35]], 20), cx, y, cz, 0, 1, sc, stoneP);
  addGeo(pb, lathe([[0.4, 0], [1.1, 0.12], [2.1, 0.35], [2.25, 0.5], [2.1, 0.52], [1.2, 0.35], [0.001, 0.32]], 32), cx, y + 1.3, cz, 0, 1, sc, stoneP);
  addGeo(pb, lathe([[0.001, 0], [0.32, 0], [0.22, 0.4], [0.18, 1.1], [0.3, 1.2]], 16), cx, y + 1.8, cz, 0, 1, sc, stoneP);
  addGeo(pb, lathe([[0.2, 0], [0.6, 0.08], [1.05, 0.24], [1.12, 0.36], [1.02, 0.37], [0.5, 0.25], [0.001, 0.22]], 28), cx, y + 2.95, cz, 0, 1, sc, stoneP);
  addGeo(pb, lathe([[0.001, 0], [0.16, 0], [0.12, 0.35], [0.2, 0.45], [0.001, 0.7]], 12), cx, y + 3.25, cz, 0, 1, sc, stoneP);
  POOLS.push({ x: cx, z: cz, y: y + 0.45, r: 5.2, depth: 0.45 });
  POOLS.push({ x: cx, z: cz, y: y + 1.78, r: 2.1, depth: 0.12 });
  POOLS.push({ x: cx, z: cz, y: y + 3.26, r: 1.0, depth: 0.08 });
  CITYDATA.fountain = { x: cx, z: cz, y };
  wgRect(cx - 6, cz - 6, cx + 6, cz + 6, (k, x, z) => { if (Math.hypot(x - cx, z - cz) < 5.9) WG.B[k] = 1; });

  // clock tower (north side of the square)
  const tx = cx, tz = Z.z0 + 3.5;
  const tc = srgb('#d9c4a0');
  boxW(st, tx, y + 4, tz, 6.4, 8, 6.4, 0, srgb('#bfae90'));
  boxW(st, tx, y + 15, tz, 5.6, 14, 5.6, 0, tc);
  boxW(pb, tx, y + 8.1, tz, 6.7, 0.35, 6.7, 0, srgb('#e6dccb'), stoneP);
  boxW(pb, tx, y + 22.15, tz, 6.2, 0.3, 6.2, 0, srgb('#e6dccb'), stoneP);
  // belfry: corner piers + bell
  for (const [ox, oz] of [[-2.4, -2.4], [2.4, -2.4], [-2.4, 2.4], [2.4, 2.4]]) boxW(st, tx + ox, y + 24.3, tz + oz, 0.8, 4, 0.8, 0, tc);
  boxW(pb, tx, y + 26.45, tz, 6.0, 0.35, 6.0, 0, srgb('#e6dccb'), stoneP);
  addGeo(pb, lathe([[0.001, 1.3], [0.35, 1.25], [0.55, 0.9], [0.75, 0.2], [0.9, 0.0]], 16), tx, y + 23.2, tz, 0, 1, srgb('#8a6a2a'), { aP: [0.35, 0.9, 0] });
  // pyramid copper roof
  const rb = tb('roofs', tx, tz);
  const ry0 = y + 26.6, ry1 = y + 32.5, h = 3.1;
  const pts = [[-h, h], [h, h], [h, -h], [-h, -h]];
  for (let i = 0; i < 4; i++) {
    const a = new V3(tx + pts[i][0], ry0, tz + pts[i][1]), b2 = new V3(tx + pts[(i + 1) % 4][0], ry0, tz + pts[(i + 1) % 4][1]);
    const top = new V3(tx, ry1, tz);
    const n = new V3().subVectors(b2, a).cross(new V3().subVectors(top, a)).normalize();
    const [T, B] = faceFrameJS(n);
    const uv = (P) => [new V3().subVectors(P, a).dot(T), new V3().subVectors(P, a).dot(B)];
    rb.tri(a, b2, top, n, [uv(a), uv(b2), uv(top)], [1, 1, 1], { aR: [3, 7, 0, 0] });
  }
  addGeo(pb, new THREE.CylinderGeometry(0.03, 0.05, 1.6, 6), tx, ry1 + 0.8, tz, 0, 1, srgb('#6d5a2a'), { aP: [0.3, 0.9, 0] });
  // clock faces (lit at night) + hands (animated)
  const faceG = new THREE.CircleGeometry(1.35, 32);
  const handsIdx = [];
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    const nx = Math.sin(a), nz = Math.cos(a);
    const fx = tx + nx * 2.83, fz = tz + nz * 2.83;
    addGeo(pb, faceG, fx, y + 18.5, fz, a, 1, srgb('#f3ead2'), { aP: [0.6, 0, 1.2] });
    addGeo(pb, new THREE.TorusGeometry(1.38, 0.08, 6, 32), fx, y + 18.5, fz, a, 1, srgb('#3a2e1c'), { aP: [0.4, 0.6, 0] });
    for (let k = 0; k < 12; k++) {
      const ang = (k / 12) * TAU;
      const px = Math.cos(ang) * 1.12, py = Math.sin(ang) * 1.12;
      boxW(pb, fx + nz * px * 1 + nx * 0.02, y + 18.5 + py, fz - nx * px + nz * 0.02, 0.06, 0.18, 0.02, a, srgb('#2a2218'), { aP: [0.5, 0, 0] });
    }
    handsIdx.push({ x: fx + nx * 0.06, y: y + 18.5, z: fz + nz * 0.06, a });
  }
  const handGeo = new THREE.BoxGeometry(0.07, 1, 0.03).translate(0, 0.5, 0);
  const handMat = new THREE.MeshStandardMaterial({ color: 0x1b1712, roughness: 0.4, metalness: 0.5 });
  patch(handMat, { key: 'hand' });
  const hands = new THREE.InstancedMesh(handGeo, handMat, 8);
  hands.frustumCulled = false;
  CITYDATA.clock = { hands, faces: handsIdx };
  scene.add(hands);
  wgSet(tx - 3.5, tz - 3.5, tx + 3.5, tz + 3.5, null, 1);

  // cafe tables with parasols (south-east of fountain)
  const fb = tb('fabric', cx, cz);
  const cafeCols = [[srgb('#efe6d2'), srgb('#2f5d4a')], [srgb('#efe6d2'), srgb('#9c3a2e')]];
  let ci = 0;
  for (const [ox, oz] of [[12, 10], [16, 4], [8, 16], [15, 15], [-12, 13], [-16, 7]]) {
    const px = cx + ox, pz = cz + oz;
    addCafeTable(px, pz, y, cafeCols[ci++ % 2]);
  }
  // planters with trees at corners
  for (const [ox, oz] of [[-17, -13], [17, -13], [-17, 19], [17, 19]]) {
    boxW(st, cx + ox, y + 0.3, cz + oz, 2.2, 0.6, 2.2, 0, sc);
    CITYDATA.plazaTrees.push([cx + ox, cz + oz, y + 0.55]);
    wgSet(cx + ox - 1.2, cz + oz - 1.2, cx + ox + 1.2, cz + oz + 1.2, null, 1);
  }
  for (const [ox, oz, r] of [[-9, -2, Math.PI / 2], [9, -2, -Math.PI / 2], [0, -11, 0]]) addBench(cx + ox, cz + oz, r);
  void fb;
}

function addCafeTable(px, pz, y, cols) {
  const pb = tb('props', px, pz), fb = tb('fabric', px, pz);
  const iron = srgb('#23292a');
  addGeo(pb, new THREE.CylinderGeometry(0.4, 0.4, 0.04, 16), px, y + 0.74, pz, 0, 1, srgb('#e8e4dc'), { aP: [0.35, 0.1, 0] });
  addGeo(pb, new THREE.CylinderGeometry(0.035, 0.035, 0.72, 6), px, y + 0.37, pz, 0, 1, iron, { aP: [0.4, 0.7, 0] });
  addGeo(pb, new THREE.CylinderGeometry(0.03, 0.03, 2.4, 6), px, y + 1.2, pz, 0, 1, srgb('#d8d2c4'), { aP: [0.5, 0.2, 0] });
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * TAU + 0.4;
    const cxp = px + Math.cos(a) * 0.75, czp = pz + Math.sin(a) * 0.75;
    boxW(pb, cxp, y + 0.46, czp, 0.42, 0.04, 0.42, -a, srgb('#6b4b33'), { aP: [0.7, 0, 0] });
    boxW(pb, cxp + Math.cos(a) * 0.2, y + 0.7, czp + Math.sin(a) * 0.2, 0.04, 0.48, 0.42, -a, srgb('#6b4b33'), { aP: [0.7, 0, 0] });
    for (const [lx, lz] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) {
      const c = Math.cos(-a), s = Math.sin(-a);
      boxW(pb, cxp + lx * c + lz * s, y + 0.22, czp - lx * s + lz * c, 0.03, 0.44, 0.03, 0, iron, { aP: [0.4, 0.7, 0] });
    }
  }
  // parasol: 8 panels
  const R = 1.55, top = y + 2.55, rim = y + 2.05;
  for (let i = 0; i < 8; i++) {
    const a0 = (i / 8) * TAU, a1 = ((i + 1) / 8) * TAU;
    const p0 = new V3(px + Math.cos(a0) * R, rim, pz + Math.sin(a0) * R), p1 = new V3(px + Math.cos(a1) * R, rim, pz + Math.sin(a1) * R);
    const t = new V3(px, top, pz);
    const n = new V3().subVectors(t, p0).cross(new V3().subVectors(p1, p0)).normalize();
    const pw = p0.distanceTo(p1);
    fb.tri(p0, t, p1, n, [[0, 0], [pw / 2, 1], [pw, 0]], i % 2 ? cols[0] : cols[1], { aC: [...(i % 2 ? cols[0] : cols[1]), 0.3] });
  }
  CITYDATA.cafes.push([px, pz]);
  wgSet(px - 1.2, pz - 1.2, px + 1.2, pz + 1.2, null, 1);
}

// --- park ---------------------------------------------------------------------------
function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const t = clamp(((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz), 0, 1);
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
}
function buildPark() {
  const P = CITY.park, pd = CITY.pond;
  const loopR = 35;
  const spokes = [[pd.x, P.z0], [pd.x, P.z1], [P.x0, pd.z], [P.x1, pd.z]];
  const beds = [[pd.x, P.z0 + 9], [pd.x, P.z1 - 9], [P.x0 + 9, pd.z], [P.x1 - 9, pd.z], [P.x1 - 14, P.z0 + 14], [P.x0 + 14, P.z1 - 14]];
  CITYDATA.park = { loopR, beds, pathDist: null };
  const pathDist = (x, z) => {
    let d = Math.abs(Math.hypot(x - pd.x, z - pd.z) - loopR);
    for (const [sx, sz] of spokes) {
      const ang = Math.atan2(sz - pd.z, sx - pd.x);
      d = Math.min(d, segDist(x, z, pd.x + Math.cos(ang) * loopR, pd.z + Math.sin(ang) * loopR, sx, sz));
    }
    return d;
  };
  CITYDATA.park.pathDist = pathDist;
  maskRect(P.x0, P.z0, P.x1, P.z1, (k, x, z) => {
    const pdist = pathDist(x, z);
    const path = 1 - smoothstep(1.4, 2.1, pdist);
    let flowers = 0;
    for (const [bx, bz] of beds) flowers = Math.max(flowers, 1 - smoothstep(3.2, 4.6, Math.hypot(x - bx, z - bz)));
    const dp = Math.hypot(x - pd.x, z - pd.z);
    flowers = Math.max(flowers, smoothstep(0.62, 0.8, noiseAt(x * 0.03, z * 0.03, 2)) * 0.6 * (1 - path));
    MASK[k] = 255 * (1 - path) * (1 - flowers * 0.6);
    MASK[k + 1] = 255 * flowers * (1 - path);
    MASK[k + 2] = 0;
    MASK[k + 3] = 255 * path;
    if (dp < 24) { MASK[k] = MASK[k] * 0.6; }
  });
  // lamps + benches along the loop
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU + 0.13;
    const x = pd.x + Math.cos(a) * (loopR + 2.4), z = pd.z + Math.sin(a) * (loopR + 2.4);
    addLamp(x, z, heightAt(x, z));
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + 0.42;
    const x = pd.x + Math.cos(a) * (loopR + 2.2), z = pd.z + Math.sin(a) * (loopR + 2.2);
    addBench(x, z, -a + Math.PI / 2 + Math.PI, heightAt(x, z));
  }
  // gazebo on a small rise south-east
  const gx = P.x1 - 17, gz = P.z1 - 17, gy = heightAt(gx, gz);
  const pb = tb('props', gx, gz), wd = tb('wood', gx, gz), rb = tb('roofs', gx, gz);
  addGeo(wd, new THREE.CylinderGeometry(4.2, 4.3, 0.4, 8), gx, gy + 0.2, gz, Math.PI / 8, 1, srgb('#a58563'));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + Math.PI / 8;
    addGeo(pb, new THREE.CylinderGeometry(0.12, 0.14, 2.7, 8), gx + Math.cos(a) * 3.8, gy + 1.75, gz + Math.sin(a) * 3.8, 0, 1, srgb('#efe9dd'), { aP: [0.6, 0, 0] });
  }
  const ry0 = gy + 3.1, ry1 = gy + 5.3;
  for (let i = 0; i < 8; i++) {
    const a0 = (i / 8) * TAU + Math.PI / 8, a1 = ((i + 1) / 8) * TAU + Math.PI / 8;
    const a = new V3(gx + Math.cos(a0) * 4.7, ry0, gz + Math.sin(a0) * 4.7), b2 = new V3(gx + Math.cos(a1) * 4.7, ry0, gz + Math.sin(a1) * 4.7);
    const top = new V3(gx, ry1, gz);
    const n = new V3().subVectors(top, a).cross(new V3().subVectors(b2, a)).normalize();
    const [T, B] = faceFrameJS(n);
    const uv = (Pp) => [new V3().subVectors(Pp, a).dot(T), new V3().subVectors(Pp, a).dot(B)];
    rb.tri(a, top, b2, n, [uv(a), uv(top), uv(b2)], [1, 1, 1], { aR: [3, 3, 0, 0] });
  }
  addGeo(pb, new THREE.CylinderGeometry(4.75, 4.75, 0.25, 8), gx, ry0 - 0.1, gz, Math.PI / 8, 1, srgb('#efe9dd'), { aP: [0.6, 0, 0] });
  wgRect(gx - 5, gz - 5, gx + 5, gz + 5, (k, x, z) => { const r = Math.hypot(x - gx, z - gz); if (r < 4.3) WG.H[k] = gy + 0.4; });
  CITYDATA.gazebo = { x: gx, z: gz };
}

// --- piers + moorings ------------------------------------------------------------------
function buildPiers() {
  for (const px of [-150, -90, 90, 150]) {
    const wd = tb('wood', px, 165), pb = tb('props', px, 165);
    const len = px === -90 || px === 90 ? 30 : 40;
    const y = 1.95;
    const z0 = 146, z1 = 146 + len;
    boxW(wd, px, y - 0.12, (z0 + z1) / 2, 4, 0.24, len, 0, srgb('#9b7a58'), {}, 'py px nx pz', (P, N) => { const [T, B] = faceFrameJS(N); return [P.dot(T) * 0.5, P.dot(B) * 0.5]; });
    for (let z = z0 + 2; z <= z1; z += 4) for (const sx of [-1.8, 1.8]) {
      addGeo(pb, new THREE.CylinderGeometry(0.16, 0.18, 10, 7), px + sx, y - 5.2, z, 0, 1, srgb('#4b3b2c'), { aP: [0.9, 0, 0] });
    }
    for (let z = z0 + 6; z <= z1; z += 8) for (const sx of [-1.75, 1.75]) {
      addGeo(pb, new THREE.CylinderGeometry(0.13, 0.15, 0.5, 8), px + sx, y + 0.25, z, 0, 1, srgb('#2b2f30'), { aP: [0.5, 0.7, 0] });
    }
    addLamp(px + 1.6, z1 - 1, y);
    wgSet(px - 2, z0, px + 2, z1, y, 0);
    CITYDATA.piers.push({ x: px, z0, z1, y });
  }
}

// --- lighthouse on the headland ------------------------------------------------------------
function buildLighthouse() {
  let best = null;
  for (let x = 330; x < 600; x += 4) for (let z = 120; z < 360; z += 4) {
    const h = heightAt(x, z);
    if (h > 26 && slopeAt(x, z) < 0.25) {
      const score = z * 1.0 + x * 0.35;
      if (!best || score > best.s) best = { x, z, h, s: score };
    }
  }
  if (!best) best = { x: 470, z: 280, h: heightAt(470, 280) };
  // step back inland so the base sits on solid ground
  const lx = best.x - 10, lz = best.z - 12;
  const ly = Math.min(heightAt(lx, lz), heightAt(lx + 3, lz), heightAt(lx - 3, lz), heightAt(lx, lz + 3), heightAt(lx, lz - 3)) - 0.3;
  const pb = tb('props', lx, lz);
  const white = srgb('#f1eee8'), red = srgb('#b8332b');
  const H = 21, seg = 7;
  for (let i = 0; i < seg; i++) {
    const y0 = (i / seg) * H, y1 = ((i + 1) / seg) * H;
    const r0 = lerp(3.0, 2.1, i / seg), r1 = lerp(3.0, 2.1, (i + 1) / seg);
    addGeo(pb, new THREE.CylinderGeometry(r1, r0, y1 - y0, 24, 1, true), lx, ly + (y0 + y1) / 2, lz, 0, 1, i % 2 ? red : white, { aP: [0.6, 0, 0] });
  }
  const g = ly + H;
  addGeo(pb, new THREE.CylinderGeometry(3.0, 2.4, 0.45, 24), g + 0 === 0 ? lx : lx, g + 0.2, lz, 0, 1, srgb('#2c3133'), { aP: [0.5, 0.6, 0] });
  addGeo(pb, new THREE.CylinderGeometry(1.5, 1.5, 2.6, 16, 1, true), lx, g + 1.75, lz, 0, 1, srgb('#fff1c8'), { aP: [0.08, 0.2, 5] });
  addGeo(pb, new THREE.CylinderGeometry(0.4, 1.8, 1.4, 16), lx, g + 3.75, lz, 0, 1, red, { aP: [0.45, 0.4, 0] });
  addGeo(pb, new THREE.SphereGeometry(0.35, 10, 6), lx, g + 4.6, lz, 0, 1, srgb('#2c3133'), { aP: [0.4, 0.7, 0] });
  const rail = tb('rail', lx, lz);
  for (let i = 0; i < 16; i++) {
    const a0 = (i / 16) * TAU, a1 = ((i + 1) / 16) * TAU;
    const A = new V3(lx + Math.cos(a0) * 2.9, g + 0.42, lz + Math.sin(a0) * 2.9), B = new V3(lx + Math.cos(a1) * 2.9, g + 0.42, lz + Math.sin(a1) * 2.9);
    const n = new V3().subVectors(B, A).cross(new V3(0, 1, 0)).normalize();
    const len = A.distanceTo(B);
    rail.quad(A, B, B.clone().setY(g + 1.4), A.clone().setY(g + 1.4), n, [[0, 1], [len, 1], [len, 0], [0, 0]]);
  }
  wgRect(lx - 4, lz - 4, lx + 4, lz + 4, (k, x, z) => { if (Math.hypot(x - lx, z - lz) < 3.2) WG.B[k] = 1; });
  CITYDATA.lighthouse = { x: lx, y: g + 1.75, z: lz };
  // keeper's cottage
  addBuilding({
    cx: lx - 12, cz: lz - 6, w: 8, d: 6.5, rot: 0.3, baseY: heightAt(lx - 12, lz - 6) + 0.1, floors: 1, fh: 3,
    color: srgb('#f0ece4'), roof: 'gable', roofColor: pick(ROOF_SLATE), roofStyle: 1, pitch: 0.7,
    party: { left: false, right: false, back: false }, gType: 0, shutI: 2, wStyle: 0, balMode: 0, quoins: false, seed: 42, plinth: 1.2,
  });
  VIEWS[5].pos = [lx + 30, g + 18, lz + 40];
  VIEWS[5].tgt = [lx - 60, 12, lz - 90];
}

// --- hillside villas + chapel ---------------------------------------------------------
function buildHills() {
  const spots = [];
  let tries = 0;
  while (spots.length < 34 && tries < 6000) {
    tries++;
    const x = rr(-420, 420), z = rr(-470, -236);
    if (inCityLand(x, z, 18)) continue;
    const h = heightAt(x, z);
    if (h < 6 || h > 110 || slopeAt(x, z) > 0.28) continue;
    if (spots.some((s) => Math.hypot(s.x - x, s.z - z) < 30)) continue;
    spots.push({ x, z });
  }
  for (const s of spots) {
    const w = rr(8.5, 13), d = rr(7.5, 10.5);
    const rot = rr(-0.25, 0.25);
    let hmin = Infinity, hmax = -Infinity;
    for (const [ox, oz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2], [0, 0]]) {
      const c = Math.cos(rot), sn2 = Math.sin(rot);
      const h = heightAt(s.x + ox * c + oz * sn2, s.z - ox * sn2 + oz * c);
      hmin = Math.min(hmin, h); hmax = Math.max(hmax, h);
    }
    addBuilding({
      cx: s.x, cz: s.z, w, d, rot, baseY: hmax + 0.15, plinth: hmax - hmin + 0.6, floors: rand() < 0.7 ? 2 : 3, fh: 3.1,
      color: pick(WALL_COLS), roof: rand() < 0.7 ? 'hip' : 'gable', roofColor: pick(ROOF_CLAY), roofStyle: 0, pitch: rr(0.45, 0.55),
      party: { left: false, right: false, back: false }, gType: 0, shutI: 1 + Math.floor(rand() * 4), wStyle: rand() < 0.5 ? 2 : 0,
      balMode: rand() < 0.5 ? 2 : 0, quoins: rand() < 0.4, seed: rand() * 100, flowers: true,
    });
    CITYDATA.villas = CITYDATA.villas || [];
    CITYDATA.villas.push({ x: s.x, z: s.z, rot, w, d });
    maskRect(s.x - w / 2 - 2, s.z - d / 2 - 2, s.x + w / 2 + 2, s.z + d / 2 + 2, (k) => { MASK[k] = 0; MASK[k + 1] = 0; });
  }
  // chapel on a crest
  let best = null;
  for (let x = -320; x < -40; x += 6) for (let z = -560; z < -360; z += 6) {
    const h = heightAt(x, z);
    if (slopeAt(x, z) < 0.2 && (!best || h > best.h)) best = { x, z, h };
  }
  if (best) {
    const { x, z } = best;
    const y = best.h;
    addBuilding({
      cx: x, cz: z, w: 7, d: 14, rot: 0, baseY: y + 0.1, plinth: 1.5, floors: 1, fh: 3, color: srgb('#f3efe6'),
      roof: 'gable', roofColor: srgb('#50565e'), roofStyle: 1, pitch: 0.8, party: { left: false, right: false, back: false },
      gType: 0, shutI: 0, wStyle: 2, balMode: 0, quoins: true, seed: 77,
    });
    const st = tb('stone', x, z);
    boxW(st, x, y + 5, z + 8.5, 3.4, 10, 3.4, 0, srgb('#e9e2d4'));
    const rb = tb('roofs', x, z);
    const t0 = y + 10, t1 = y + 14;
    const pts = [[-1.9, 1.9], [1.9, 1.9], [1.9, -1.9], [-1.9, -1.9]];
    for (let i = 0; i < 4; i++) {
      const a = new V3(x + pts[i][0], t0, z + 8.5 + pts[i][1]), b2 = new V3(x + pts[(i + 1) % 4][0], t0, z + 8.5 + pts[(i + 1) % 4][1]);
      const top = new V3(x, t1, z + 8.5);
      const n = new V3().subVectors(b2, a).cross(new V3().subVectors(top, a)).normalize();
      const [T, B] = faceFrameJS(n);
      const uv = (P) => [new V3().subVectors(P, a).dot(T), new V3().subVectors(P, a).dot(B)];
      rb.tri(a, b2, top, n, [uv(a), uv(b2), uv(top)], srgb('#50565e'), { aR: [1, 9, 0, 0] });
    }
    CITYDATA.chapel = { x, z, y };
    VIEWS[4].pos = [x + 16, y + 9, z + 24];
    VIEWS[4].tgt = [x + 60, y - 40, z + 250];
  }
}

// --- beach huts on the west shore ------------------------------------------------------
function buildBeach() {
  const cols = ['#e05a4f', '#f2c14e', '#5aa9c9', '#f4f1ea', '#7fb685', '#e98fb0', '#3f6fb5'].map(srgb);
  let i = 0;
  for (let x = -318; x > -520; x -= 17) {
    const zc = coastZ(x) - 26;
    const h = heightAt(x, zc);
    if (h < 1.0 || h > 5) continue;
    const pb = tb('props', x, zc), rb = tb('roofs', x, zc);
    const c = cols[i++ % cols.length];
    const y = h - 0.2;
    boxW(pb, x, y + 1.3, zc, 2.6, 2.6, 2.4, 0, c, { aP: [0.75, 0, 0] });
    boxW(pb, x, y + 1.0, zc + 1.21, 0.9, 1.9, 0.04, 0, c.map((v) => v * 0.55), { aP: [0.7, 0, 0] });
    const e = 0.25, yr = y + 2.6, r = 0.9;
    const L = (lx, ly, lz) => new V3(x + lx, ly, zc + lz);
    const roofQ = (a, b2, cc, dd) => {
      const n = new V3().subVectors(b2, a).cross(new V3().subVectors(cc, a)).normalize();
      const [T, B] = faceFrameJS(n);
      const uv = (P) => [new V3().subVectors(P, a).dot(T), new V3().subVectors(P, a).dot(B)];
      rb.quad(a, b2, cc, dd, n, [uv(a), uv(b2), uv(cc), uv(dd)], srgb('#f4f1ea'), { aR: [2, i, 0, 0] });
    };
    roofQ(L(-1.3 - e, yr, 1.2 + e), L(1.3 + e, yr, 1.2 + e), L(1.3 + e, yr + r, 0), L(-1.3 - e, yr + r, 0));
    roofQ(L(1.3 + e, yr, -1.2 - e), L(-1.3 - e, yr, -1.2 - e), L(-1.3 - e, yr + r, 0), L(1.3 + e, yr + r, 0));
    for (const sx of [1.3, -1.3]) {
      const a = L(sx, yr, sx > 0 ? 1.2 : -1.2), b2 = L(sx, yr, sx > 0 ? -1.2 : 1.2), top = L(sx, yr + r, 0);
      const n = new V3().subVectors(b2, a).cross(new V3().subVectors(top, a)).normalize();
      pb.tri(a, b2, top, n, [[0, 0], [1, 0], [0.5, 1]], c, { aP: [0.75, 0, 0] });
    }
    wgSet(x - 1.4, zc - 1.3, x + 1.4, zc + 1.3, null, 1);
  }
}

function buildLandmarks() {
  buildPlaza();
  buildPark();
  buildPiers();
  buildLighthouse();
  buildHills();
  buildBeach();
}

function buildPools() {
  for (const p of POOLS) {
    const mat = makeWaterMaterial({ fixedDepth: p.depth, key: 'pool' + p.depth.toFixed(2) });
    const m = new THREE.Mesh(new THREE.CircleGeometry(p.r, 40).rotateX(-Math.PI / 2), mat);
    m.position.set(p.x, p.y, p.z);
    m.renderOrder = 2;
    m.layers.set(LAYER_NOREFLECT);
    scene.add(m);
  }
}

const _hm = new THREE.Matrix4(), _hq = new THREE.Quaternion(), _hs = new V3(), _he = new THREE.Euler();
function updateClock() {
  const C = CITYDATA.clock;
  if (!C) return;
  const hr = skyState.hour;
  const hA = ((hr % 12) / 12) * TAU, mA = ((hr % 1)) * TAU;
  let i = 0;
  for (const f of C.faces) {
    for (const [ang, len, wdt] of [[hA, 0.75, 1.3], [mA, 1.05, 1]]) {
      _he.set(0, f.a, 0, 'YXZ');
      const qf = new THREE.Quaternion().setFromEuler(_he);
      const qz = new THREE.Quaternion().setFromAxisAngle(new V3(0, 0, 1), -ang);
      _hq.copy(qf).multiply(qz);
      _hm.compose(new V3(f.x, f.y, f.z), _hq, _hs.set(wdt, len, 1));
      C.hands.setMatrixAt(i++, _hm);
    }
  }
  C.hands.instanceMatrix.needsUpdate = true;
}
