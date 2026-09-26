// ============================================================================
// City generator: street grid, canal, sidewalks, quays, bridges, row houses
// (walls/roofs/balconies/awnings/chimneys), street furniture, walk grid.
// ============================================================================

const V3 = THREE.Vector3;
const MATS = {};
const CITYDATA = { blocks: [], courtyards: [], lamps: [], benches: [], streetTrees: [], canalTrees: [], plazaTrees: [], buildings: [], bridges: [], piers: [], cafes: [] };

// --- tiled geometry builders (spatial tiles => frustum culling works) ---------
const TILE = 140;
const TB = new Map();
function tb(kind, x, z) {
  const tx = Math.floor(x / TILE), tz = Math.floor(z / TILE);
  const key = kind + ':' + tx + ':' + tz;
  let b = TB.get(key);
  if (!b) {
    const extra = { walls: { aF: 4, aS: 4 }, roofs: { aR: 4 }, props: { aP: 3 }, fabric: { aC: 4 } }[kind] || {};
    b = new GeoBuilder(extra, { aP: [0.8, 0, 0] });
    b.kind = kind;
    TB.set(key, b);
  }
  return b;
}

function faceFrameJS(N) {
  const T = new V3().crossVectors(new V3(0, 1, 0), N);
  if (T.lengthSq() < 1e-4) T.set(1, 0, 0); else T.normalize();
  const B = new V3().crossVectors(N, T);
  return [T, B];
}
const worldUV = (P, N) => { const [T, B] = faceFrameJS(N); return [P.dot(T), P.dot(B)]; };
const scaledXZ = (s) => (P) => [P.x / s, -P.z / s];

// quad in world space with uv computed from a function (P, N) -> [u, v]
function quadW(b, a, bb, c, d, color, ex = {}, uvFn = worldUV) {
  const n = new V3().subVectors(bb, a).cross(new V3().subVectors(c, a)).normalize();
  b.quad(a, bb, c, d, n, [uvFn(a, n), uvFn(bb, n), uvFn(c, n), uvFn(d, n)], color, ex);
}

// oriented box; faces: set of 'px nx py ny pz nz'
function boxW(b, cx, cy, cz, sx, sy, sz, rot = 0, color = [1, 1, 1], ex = {}, faces = 'px nx py ny pz nz', uvFn = worldUV) {
  const c = Math.cos(rot), s = Math.sin(rot);
  const P = (x, y, z) => new V3(cx + x * c + z * s, cy + y, cz - x * s + z * c);
  const hx = sx / 2, hy = sy / 2, hz = sz / 2;
  const F = {
    px: [[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]],
    nx: [[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]],
    py: [[-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz]],
    ny: [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]],
    pz: [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]],
    nz: [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]],
  };
  for (const f of faces.split(' ')) {
    const q = F[f]; if (!q) continue;
    quadW(b, P(...q[0]), P(...q[1]), P(...q[2]), P(...q[3]), color, ex, uvFn);
  }
}
// append a three.js geometry with transform
const _mtx = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new V3();
function addGeo(b, g, x, y, z, rotY = 0, sc = 1, color = [1, 1, 1], ex = {}, rotX = 0) {
  _q.setFromEuler(new THREE.Euler(rotX, rotY, 0, 'YXZ'));
  _mtx.compose(new V3(x, y, z), _q, typeof sc === 'number' ? _s.set(sc, sc, sc) : sc);
  b.add(g, _mtx, color, ex);
}

// --- walk grid (ground height + blocked) ------------------------------------------
const WG = { x0: -320, z0: -260, w: 640, h: 480, res: 1, H: null, B: null };
function initWalkGrid() {
  WG.H = new Float32Array(WG.w * WG.h);
  WG.B = new Uint8Array(WG.w * WG.h);
  for (let j = 0; j < WG.h; j++) for (let i = 0; i < WG.w; i++) {
    const x = WG.x0 + i + 0.5, z = WG.z0 + j + 0.5;
    const h = heightAt(x, z);
    WG.H[j * WG.w + i] = h;
    WG.B[j * WG.w + i] = h < 0.25 ? 1 : 0;
  }
}
function wgRect(x0, z0, x1, z1, fn) {
  const i0 = Math.max(0, Math.floor(Math.min(x0, x1) - WG.x0)), i1 = Math.min(WG.w - 1, Math.ceil(Math.max(x0, x1) - WG.x0) - 1);
  const j0 = Math.max(0, Math.floor(Math.min(z0, z1) - WG.z0)), j1 = Math.min(WG.h - 1, Math.ceil(Math.max(z0, z1) - WG.z0) - 1);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) fn(j * WG.w + i, WG.x0 + i + 0.5, WG.z0 + j + 0.5);
}
function wgSet(x0, z0, x1, z1, h, blocked = 0) {
  wgRect(x0, z0, x1, z1, (k) => { if (h !== null) WG.H[k] = h; WG.B[k] = blocked; });
}
function wgBlockOriented(cx, cz, w, d, rot, pad = 0.3) {
  const c = Math.cos(rot), s = Math.sin(rot);
  const r = Math.hypot(w, d) / 2 + 1;
  wgRect(cx - r, cz - r, cx + r, cz + r, (k, x, z) => {
    const dx = x - cx, dz = z - cz;
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    if (Math.abs(lx) < w / 2 + pad && Math.abs(lz) < d / 2 + pad) WG.B[k] = 1;
  });
}
function cityWalkInfo(x, z) {
  const precise = typeof interiorWalkInfo === 'function' ? interiorWalkInfo(x, z) : null;
  if (precise) return precise;
  const i = Math.floor(x - WG.x0), j = Math.floor(z - WG.z0);
  if (i < 0 || j < 0 || i >= WG.w || j >= WG.h) { const h = heightAt(x, z); return { h, blocked: h < 0.25 }; }
  const k = j * WG.w + i;
  return { h: WG.H[k], blocked: WG.B[k] === 1 };
}

// --- palettes ---------------------------------------------------------------------
const WALL_COLS = ['#e9dcbf', '#ecc995', '#dca075', '#c98663', '#e6b9a4', '#bccab0', '#aec3cc', '#f1e8d6', '#dcc47f', '#cfae90', '#a8b9a6', '#e5d2b2', '#d7b8c2', '#f0d9a8'].map(srgb);
const ROOF_CLAY = ['#a8522f', '#b9663d', '#934b2d', '#a45a38', '#b0583a'].map(srgb);
const ROOF_SLATE = ['#4c525b', '#434951', '#5a5f66'].map(srgb);
const AWNING = [['#2f5d4a', '#efe6d2'], ['#9c3a2e', '#f1e7d4'], ['#27405e', '#f0ead8'], ['#c68a2e', '#f2ead6'], ['#5b3a52', '#eee4d2']].map(([a, b]) => [srgb(a), srgb(b)]);
const TRIM = srgb('#ddd4c4');

// --- one building -----------------------------------------------------------------
// o: {cx, cz, w, d, rot, baseY, floors, fh, color, roof, roofColor, roofStyle,
//     party:{left,right,back}, gType, shutI, wStyle, balMode, quoins, seed, awning, flowers}
function addBuilding(o) {
  // On natural ground the entire floor must clear the footprint. Keeper/chapel
  // origins used the centre height, which can put terrain through their rooms.
  if (o.plinth > 0) {
    const c0 = Math.cos(o.rot), s0 = Math.sin(o.rot);
    let support = o.baseY;
    for (const x of [-o.w / 2, 0, o.w / 2]) for (const z of [-o.d / 2, 0, o.d / 2]) {
      support = Math.max(support, heightAt(o.cx + x * c0 + z * s0, o.cz - x * s0 + z * c0) + 0.1);
    }
    o.plinth += support - o.baseY; o.baseY = support;
  }
  const gh = 4.2;
  const H = o.floors <= 1 ? gh : gh + (o.floors - 1) * o.fh;
  const c = Math.cos(o.rot), s = Math.sin(o.rot);
  const L = (x, y, z) => new V3(o.cx + x * c + z * s, o.baseY + y, o.cz - x * s + z * c);
  const w = o.w, d = o.d;
  const wb = tb('walls', o.cx, o.cz), rb = tb('roofs', o.cx, o.cz), pb = tb('props', o.cx, o.cz);
  const flat = o.roof === 'flat';
  const topWall = flat ? H + 1.0 : H;
  const plinthDrop = o.plinth || 0; // extra wall below base (hillside)
  const walls = [
    { a: [-w / 2, d / 2], b: [w / 2, d / 2], W: w, party: false, g: o.gType },
    { a: [w / 2, d / 2], b: [w / 2, -d / 2], W: d, party: o.party.right, g: 0 },
    { a: [w / 2, -d / 2], b: [-w / 2, -d / 2], W: w, party: o.party.back, g: 0 },
    { a: [-w / 2, -d / 2], b: [-w / 2, d / 2], W: d, party: o.party.left, g: 0 },
  ];
  for (const wl of walls) {
    const flags = (wl.party ? 1 : 0) + (o.quoins ? 2 : 0) + (wl === walls[0] ? o.balMode * 4 : 0);
    const ex = { aF: [o.seed, o.fh, o.floors, wl.W], aS: [wl.g, o.shutI, o.wStyle, flags] };
    // Ground floors are thick, openable geometry constructed by registerInterior.
    // Retain the efficient upper-storey material with its original world-height UVs.
    const bottom = typeof registerInterior === 'function' ? gh : -plinthDrop;
    const p0 = L(wl.a[0], bottom, wl.a[1]), p1 = L(wl.b[0], bottom, wl.b[1]);
    const p2 = L(wl.b[0], topWall, wl.b[1]), p3 = L(wl.a[0], topWall, wl.a[1]);
    const n = new V3().subVectors(p1, p0).cross(new V3().subVectors(p2, p0)).normalize();
    wb.quad(p0, p1, p2, p3, n, [[0, bottom], [wl.W, bottom], [wl.W, topWall], [0, topWall]], o.color, ex);
  }
  const trimC = o.trim || TRIM;
  const pbEx = { aP: [0.75, 0, 0] };
  const roofEx = { aR: [o.roofStyle, o.seed, 0, 0] };
  const pitch = o.pitch || 0.6;
  const tn = Math.tan(pitch);
  const ov = 0.42, e = 0.22;
  const roofQuad = (a, b2, cc, dd) => {
    const n = new V3().subVectors(b2, a).cross(new V3().subVectors(cc, a)).normalize();
    const [T, B] = faceFrameJS(n);
    const uv = (P) => [new V3().subVectors(P, a).dot(T), new V3().subVectors(P, a).dot(B)];
    rb.quad(a, b2, cc, dd, n, [uv(a), uv(b2), uv(cc), uv(dd)], o.roofColor, roofEx);
  };
  const roofTri = (a, b2, cc) => {
    const n = new V3().subVectors(b2, a).cross(new V3().subVectors(cc, a)).normalize();
    const [T, B] = faceFrameJS(n);
    const uv = (P) => [new V3().subVectors(P, a).dot(T), new V3().subVectors(P, a).dot(B)];
    rb.tri(a, b2, cc, n, [uv(a), uv(b2), uv(cc)], o.roofColor, roofEx);
  };
  const gableTri = (a, b2, cc, W, party) => {
    const n = new V3().subVectors(b2, a).cross(new V3().subVectors(cc, a)).normalize();
    const ex = { aF: [o.seed, o.fh, o.floors, W], aS: [0, o.shutI, o.wStyle, (party ? 1 : 0)] };
    const va = a.y - o.baseY, vc = cc.y - o.baseY;
    wb.tri(a, b2, cc, n, [[0, va], [W, va], [W / 2, vc]], o.color, ex);
  };
  let ridgeY = H;
  if (o.roof === 'gable') {
    const r = (d / 2) * tn;
    ridgeY = H + r;
    const yE = H - ov * tn;
    roofQuad(L(-w / 2 - e, yE, d / 2 + ov), L(w / 2 + e, yE, d / 2 + ov), L(w / 2 + e, H + r, 0), L(-w / 2 - e, H + r, 0));
    roofQuad(L(w / 2 + e, yE, -d / 2 - ov), L(-w / 2 - e, yE, -d / 2 - ov), L(-w / 2 - e, H + r, 0), L(w / 2 + e, H + r, 0));
    gableTri(L(w / 2, H, d / 2), L(w / 2, H, -d / 2), L(w / 2, H + r, 0), d, o.party.right);
    gableTri(L(-w / 2, H, -d / 2), L(-w / 2, H, d / 2), L(-w / 2, H + r, 0), d, o.party.left);
    boxW(pb, ...L(0, H + r + 0.05, 0).toArray(), w + 2 * e + 0.05, 0.16, 0.34, o.rot, o.roofColor.map((v) => v * 0.7), pbEx);
    // eave cornice
    boxW(pb, ...L(0, H - 0.18, d / 2 + 0.12).toArray(), w, 0.26, 0.26, o.rot, trimC, pbEx, 'px nx py ny pz');
    boxW(pb, ...L(0, H - 0.18, -d / 2 - 0.12).toArray(), w, 0.26, 0.26, o.rot, trimC, pbEx, 'px nx py ny nz');
  } else if (o.roof === 'hip') {
    const yE = H - ov * tn;
    const W2 = w / 2 + ov, D2 = d / 2 + ov;
    if (w >= d) {
      const r = (d / 2) * tn, rx = (w - d) / 2;
      ridgeY = H + r;
      roofQuad(L(-W2, yE, D2), L(W2, yE, D2), L(rx, H + r, 0), L(-rx, H + r, 0));
      roofQuad(L(W2, yE, -D2), L(-W2, yE, -D2), L(-rx, H + r, 0), L(rx, H + r, 0));
      roofTri(L(W2, yE, D2), L(W2, yE, -D2), L(rx, H + r, 0));
      roofTri(L(-W2, yE, -D2), L(-W2, yE, D2), L(-rx, H + r, 0));
      if (rx > 0.1) boxW(pb, ...L(0, H + r + 0.04, 0).toArray(), 2 * rx + 0.3, 0.14, 0.3, o.rot, o.roofColor.map((v) => v * 0.7), pbEx);
    } else {
      const r = (w / 2) * tn, rz = (d - w) / 2;
      ridgeY = H + r;
      roofQuad(L(W2, yE, D2), L(W2, yE, -D2), L(0, H + r, -rz), L(0, H + r, rz));
      roofQuad(L(-W2, yE, -D2), L(-W2, yE, D2), L(0, H + r, rz), L(0, H + r, -rz));
      roofTri(L(-W2, yE, D2), L(W2, yE, D2), L(0, H + r, rz));
      roofTri(L(W2, yE, -D2), L(-W2, yE, -D2), L(0, H + r, -rz));
    }
    boxW(pb, ...L(0, H - 0.18, 0).toArray(), w + 0.24, 0.26, d + 0.24, o.rot, trimC, pbEx, 'px nx pz nz ny');
  } else {
    // flat roof with parapet
    const yR = H + 0.05;
    roofQuad(L(-w / 2, yR, d / 2), L(w / 2, yR, d / 2), L(w / 2, yR, -d / 2), L(-w / 2, yR, -d / 2));
    // inner parapet faces
    const ic = o.color.map((v) => v * 0.85);
    quadW(pb, L(w / 2 - 0.02, yR, d / 2 - 0.02), L(-w / 2 + 0.02, yR, d / 2 - 0.02), L(-w / 2 + 0.02, H + 1, d / 2 - 0.02), L(w / 2 - 0.02, H + 1, d / 2 - 0.02), ic, { aP: [0.9, 0, 0] });
    quadW(pb, L(-w / 2 + 0.02, yR, -d / 2 + 0.02), L(w / 2 - 0.02, yR, -d / 2 + 0.02), L(w / 2 - 0.02, H + 1, -d / 2 + 0.02), L(-w / 2 + 0.02, H + 1, -d / 2 + 0.02), ic, { aP: [0.9, 0, 0] });
    quadW(pb, L(w / 2 - 0.02, yR, -d / 2 + 0.02), L(w / 2 - 0.02, yR, d / 2 - 0.02), L(w / 2 - 0.02, H + 1, d / 2 - 0.02), L(w / 2 - 0.02, H + 1, -d / 2 + 0.02), ic, { aP: [0.9, 0, 0] });
    quadW(pb, L(-w / 2 + 0.02, yR, d / 2 - 0.02), L(-w / 2 + 0.02, yR, -d / 2 + 0.02), L(-w / 2 + 0.02, H + 1, -d / 2 + 0.02), L(-w / 2 + 0.02, H + 1, d / 2 - 0.02), ic, { aP: [0.9, 0, 0] });
    // coping
    boxW(pb, ...L(0, H + 1.06, d / 2 - 0.1).toArray(), w + 0.1, 0.12, 0.34, o.rot, trimC, pbEx);
    boxW(pb, ...L(0, H + 1.06, -d / 2 + 0.1).toArray(), w + 0.1, 0.12, 0.34, o.rot, trimC, pbEx);
    boxW(pb, ...L(w / 2 - 0.1, H + 1.06, 0).toArray(), 0.34, 0.12, d - 0.2, o.rot, trimC, pbEx);
    boxW(pb, ...L(-w / 2 + 0.1, H + 1.06, 0).toArray(), 0.34, 0.12, d - 0.2, o.rot, trimC, pbEx);
    // roof clutter: stair hut, skylight, planters
    if (w > 7 && d > 7) {
      const hx = (rand() - 0.5) * (w - 5), hz = (rand() - 0.5) * (d - 5);
      boxW(pb, ...L(hx, yR + 1.2, hz).toArray(), 2.4, 2.4, 2.8, o.rot, o.color.map((v) => v * 0.9), { aP: [0.9, 0, 0] });
      boxW(pb, ...L(hx, yR + 2.45, hz).toArray(), 2.6, 0.1, 3.0, o.rot, [0.3, 0.3, 0.3], { aP: [0.8, 0, 0] });
      if (rand() < 0.6) {
        for (let k = 0; k < 3; k++) {
          const px = -w / 2 + 1 + rand() * (w - 2), pz = d / 2 - 1.2;
          boxW(pb, ...L(px, yR + 0.3, pz).toArray(), 1.2, 0.6, 0.6, o.rot, srgb('#9a5b3c'), { aP: [0.85, 0, 0] });
          boxW(pb, ...L(px, yR + 0.75, pz).toArray(), 1.0, 0.5, 0.5, o.rot, srgb('#4d6b2c'), { aP: [0.95, 0, 0] });
        }
      }
    }
  }
  // chimneys on pitched roofs
  if (!flat && o.floors >= 2) {
    const nC = 1 + (rand() < 0.5 ? 1 : 0);
    for (let k = 0; k < nC; k++) {
      const x = (k === 0 ? -1 : 1) * (w * (0.18 + rand() * 0.2));
      const z = (rand() - 0.5) * d * 0.25;
      const top = ridgeY + 0.9;
      const hgt = top - (H - 0.5);
      const cc = rand() < 0.5 ? srgb('#8f4f3a') : o.color.map((v) => v * 0.92);
      boxW(pb, ...L(x, H - 0.5 + hgt / 2, z).toArray(), 0.7, hgt, 0.9, o.rot, cc, { aP: [0.9, 0, 0] });
      boxW(pb, ...L(x, top + 0.05, z).toArray(), 0.9, 0.12, 1.1, o.rot, [0.25, 0.25, 0.25], { aP: [0.8, 0, 0] });
      CITYDATA.chimneys = CITYDATA.chimneys || [];
      if (rand() < 0.25) CITYDATA.chimneys.push(L(x, top + 0.2, z));
    }
  }
  // front facade details: balconies, awnings, flower boxes
  const nb = Math.max(1, Math.floor(w / 3.1 + 0.3));
  const bw = w / nb;
  const railB = tb('rail', o.cx, o.cz);
  const addRail = (x0, x1, z0, z1, y) => {
    const a = L(x0, y, z0), b2 = L(x1, y, z1);
    const len = a.distanceTo(b2);
    const n = new V3().subVectors(b2, a).cross(new V3(0, 1, 0)).normalize();
    railB.quad(a, b2, b2.clone().setY(y + 1.0), a.clone().setY(y + 1.0), n, [[0, 1], [len, 1], [len, 0], [0, 0]]);
  };
  if (o.balMode > 0 && o.floors >= 2) {
    for (let fi = 1; fi < o.floors; fi++) {
      const yF = gh + (fi - 1) * o.fh;
      if (o.balMode === 3 && fi !== 1) continue;
      if (o.balMode === 3) {
        boxW(pb, ...L(0, yF - 0.08, d / 2 + 0.5).toArray(), w - 0.6, 0.16, 1.0, o.rot, trimC, pbEx);
        addRail(-w / 2 + 0.35, w / 2 - 0.35, d / 2 + 0.98, d / 2 + 0.98, yF);
        addRail(w / 2 - 0.35, w / 2 - 0.35, d / 2 + 0.98, d / 2 + 0.02, yF);
        addRail(-w / 2 + 0.35, -w / 2 + 0.35, d / 2 + 0.02, d / 2 + 0.98, yF);
        continue;
      }
      for (let bi = 0; bi < nb; bi++) {
        if (o.balMode === 2 && bi !== Math.floor(nb / 2)) continue;
        const cx = -w / 2 + (bi + 0.5) * bw;
        const bwid = Math.min(bw * 0.78, 2.3);
        boxW(pb, ...L(cx, yF - 0.08, d / 2 + 0.45).toArray(), bwid, 0.16, 0.9, o.rot, trimC, pbEx);
        addRail(cx - bwid / 2 + 0.03, cx + bwid / 2 - 0.03, d / 2 + 0.88, d / 2 + 0.88, yF);
        addRail(cx + bwid / 2 - 0.03, cx + bwid / 2 - 0.03, d / 2 + 0.88, d / 2 + 0.02, yF);
        addRail(cx - bwid / 2 + 0.03, cx - bwid / 2 + 0.03, d / 2 + 0.02, d / 2 + 0.88, yF);
        if (rand() < 0.45) { // potted plants on balconies
          boxW(pb, ...L(cx + bwid / 2 - 0.35, yF + 0.2, d / 2 + 0.6).toArray(), 0.4, 0.4, 0.4, o.rot, srgb('#a2603f'), { aP: [0.85, 0, 0] });
          CITYDATA.pots = CITYDATA.pots || [];
          CITYDATA.pots.push(L(cx + bwid / 2 - 0.35, yF + 0.45, d / 2 + 0.6));
        }
      }
    }
  }
  if (o.gType === 1) {
    const fb = tb('fabric', o.cx, o.cz);
    const [ca, cb] = o.awning;
    for (let bi = 0; bi < nb; bi++) {
      const cx = -w / 2 + (bi + 0.5) * bw;
      const aw = bw * 0.84;
      const a = L(cx - aw / 2, 3.72, d / 2 + 0.04), b2 = L(cx + aw / 2, 3.72, d / 2 + 0.04);
      const c2 = L(cx + aw / 2, 3.0, d / 2 + 1.45), d2 = L(cx - aw / 2, 3.0, d / 2 + 1.45);
      const n = new V3().subVectors(b2, a).cross(new V3().subVectors(c2, a)).normalize();
      fb.quad(a, b2, c2, d2, n, [[0, 0], [aw, 0], [aw, 1], [0, 1]], ca, { aC: [cb[0], cb[1], cb[2], 0] });
      const e1 = L(cx - aw / 2, 3.0, d / 2 + 1.45), e2 = L(cx + aw / 2, 3.0, d / 2 + 1.45);
      const e3 = L(cx + aw / 2, 2.72, d / 2 + 1.47), e4 = L(cx - aw / 2, 2.72, d / 2 + 1.47);
      const n2 = new V3().subVectors(e2, e1).cross(new V3().subVectors(e3, e1)).normalize().negate();
      fb.quad(e4, e3, e2, e1, n2, [[0, 1], [aw, 1], [aw, 1], [0, 1]], ca, { aC: [cb[0], cb[1], cb[2], 1] });
    }
  } else if (o.gType === 0 && typeof registerInterior !== 'function') {
    // doorstep
    const cx = -w / 2 + (Math.floor(nb / 2) + 0.5) * bw;
    boxW(pb, ...L(cx, 0.08, d / 2 + 0.25).toArray(), 1.6, 0.16, 0.5, o.rot, srgb('#9d968b'), { aP: [0.85, 0, 0] });
  }
  if (o.flowers && o.floors >= 2) {
    for (let fi = 1; fi < o.floors; fi++) for (let bi = 0; bi < nb; bi++) {
      if (rand() > 0.4) continue;
      const balc = (o.balMode === 1) || (o.balMode === 2 && bi === Math.floor(nb / 2)) || (o.balMode === 3 && fi === 1);
      if (balc) continue;
      const cx = -w / 2 + (bi + 0.5) * bw;
      const sill = o.wStyle > 1.5 ? 0.45 : 0.9;
      const y = gh + (fi - 1) * o.fh + sill - 0.14;
      const ww = o.wStyle > 1.5 ? Math.min(1.25, bw * 0.46) : Math.min(1.05, bw * 0.4);
      boxW(pb, ...L(cx, y - 0.1, d / 2 + 0.2).toArray(), ww + 0.2, 0.22, 0.3, o.rot, srgb('#8e4f33'), { aP: [0.85, 0, 0] });
      CITYDATA.flowerBoxes = CITYDATA.flowerBoxes || [];
      CITYDATA.flowerBoxes.push({ p: L(cx, y + 0.02, d / 2 + 0.2), w: ww, rot: o.rot, kind: Math.floor(rand() * 4) });
    }
  }
  const room = typeof registerInterior === 'function' ? registerInterior(o) : null;
  CITYDATA.buildings.push({ cx: o.cx, cz: o.cz, w, d, rot: o.rot, H: ridgeY, room });
  // Detailed rooms provide their own capsule collision. Blocking their entire
  // footprint in the coarse grid leaves a 0.5 m invisible lip across doorways.
  if (!room) wgBlockOriented(o.cx, o.cz, w, d, o.rot, 0.2);
}

// --- block generation --------------------------------------------------------------
function blockKind(x0, x1, z0, z1) {
  const P = CITY.park, Z = CITY.plaza;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  if (cx > P.x0 && cx < P.x1 && cz > P.z0 && cz < P.z1) return 'park';
  if (cx > Z.x0 && cx < Z.x1 && cz > Z.z0 && cz < Z.z1) return 'plaza';
  return 'city';
}
function layoutBlocks() {
  const xs = CITY.streetsX, zs = CITY.streetsZ;
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < zs.length - 1; j++) {
      const hwL = xs[i] === 0 ? 13 : 6, hwR = xs[i + 1] === 0 ? 13 : 6;
      const x0 = xs[i] + hwL, x1 = xs[i + 1] - hwR;
      const z0 = zs[j] + 6, z1 = zs[j + 1] - 6;
      const kind = blockKind(x0, x1, z0, z1);
      CITYDATA.blocks.push({ x0, x1, z0, z1, kind, row: j, col: i });
    }
  }
}

function genCityBlock(b) {
  const waterfront = b.z1 > 100;
  const byCanal = Math.abs(b.x0) <= 13.5 || Math.abs(b.x1) <= 13.5;
  const byPlaza = b.x0 >= 60 && b.x0 <= 70 && b.z0 >= -45 && b.z1 <= 5;
  const D = rr(11, 13.5);
  const sides = [
    { dir: 'n', from: b.x0, to: b.x1, rot: Math.PI, fixed: b.z0 },
    { dir: 's', from: b.x0, to: b.x1, rot: 0, fixed: b.z1 },
    { dir: 'w', from: b.z0 + D, to: b.z1 - D, rot: -Math.PI / 2, fixed: b.x0 },
    { dir: 'e', from: b.z0 + D, to: b.z1 - D, rot: Math.PI / 2, fixed: b.x1 },
  ];
  const baseFloors = waterfront ? [3, 6] : b.row <= 0 ? [2, 4] : [3, 5];
  for (const sd of sides) {
    const len = sd.to - sd.from;
    let pos = 0;
    const lots = [];
    while (pos < len - 0.5) {
      let lw = rr(7.5, 13.5);
      if (len - pos - lw < 6) lw = len - pos;
      lots.push([pos, lw]);
      pos += lw;
    }
    lots.forEach(([p0, lw], li) => {
      const first = li === 0, last = li === lots.length - 1;
      const corner = (sd.dir === 'n' || sd.dir === 's') && (first || last);
      const d = corner ? D : D - rr(0, 1.8);
      const mid = sd.from + p0 + lw / 2;
      let cx, cz;
      if (sd.dir === 'n') { cx = mid; cz = sd.fixed + d / 2; }
      else if (sd.dir === 's') { cx = mid; cz = sd.fixed - d / 2; }
      else if (sd.dir === 'w') { cx = sd.fixed + d / 2; cz = mid; }
      else { cx = sd.fixed - d / 2; cz = mid; }
      const floors = Math.floor(rr(baseFloors[0], baseFloors[1] + 0.999));
      const wide = lw > 11;
      const roofR = rand();
      const roof = corner ? (roofR < 0.7 ? 'hip' : 'flat') : roofR < 0.62 ? 'gable' : roofR < 0.8 ? 'hip' : 'flat';
      const slate = rand() < 0.22;
      const faceStreet = sd.dir === 's' ? b.z1 > 100 : false;
      let gType = rand() < (waterfront || byCanal || byPlaza ? 0.75 : 0.35) ? 1 : 0;
      if (faceStreet) gType = 1;
      // side party walls: neighbours along the street; corners expose the street-side wall
      let pl = !first, pr = !last;
      if (sd.dir === 'n') { const t = pl; pl = pr; pr = t; }
      if (sd.dir === 'w') { const t = pl; pl = pr; pr = t; }
      if (sd.dir === 'e' || sd.dir === 'w') { pl = true; pr = true; }
      addBuilding({
        cx, cz, w: lw, d, rot: sd.rot, baseY: CITY.walk - 0.02, floors, fh: rr(3.0, 3.4), corner,
        color: pick(WALL_COLS), roof, roofColor: slate ? pick(ROOF_SLATE) : pick(ROOF_CLAY), roofStyle: slate ? 1 : 0,
        pitch: slate ? rr(0.7, 0.85) : rr(0.5, 0.62),
        party: { left: pl, right: pr, back: false }, gType, shutI: rand() < 0.55 ? 1 + Math.floor(rand() * 4) : 0,
        wStyle: wide && rand() < 0.5 ? 2 : rand() < 0.5 ? 1 : 0, balMode: rand() < 0.45 ? (rand() < 0.5 ? 1 : rand() < 0.5 ? 2 : 3) : 0,
        quoins: rand() < 0.35, seed: rand() * 100, awning: pick(AWNING), flowers: rand() < 0.5,
      });
    });
  }
  // courtyard lawn
  const cy = { x0: b.x0 + D + 0.5, x1: b.x1 - D - 0.5, z0: b.z0 + D + 0.5, z1: b.z1 - D - 0.5 };
  if (cy.x1 - cy.x0 > 4 && cy.z1 - cy.z0 > 4) CITYDATA.courtyards.push(cy);
}

// --- ground surfaces ---------------------------------------------------------------
function roadRect(x0, z0, x1, z1) {
  if (x1 - x0 < 0.1 || z1 - z0 < 0.1) return;
  const y = CITY.road;
  // split into tiles for culling
  for (let x = x0; x < x1 - 0.01; x += TILE / 2) for (let z = z0; z < z1 - 0.01; z += TILE / 2) {
    const xa = x, xb = Math.min(x1, x + TILE / 2), za = z, zb = Math.min(z1, z + TILE / 2);
    const b = tb('cobble', (xa + xb) / 2, (za + zb) / 2);
    quadW(b, new V3(xa, y, zb), new V3(xb, y, zb), new V3(xb, y, za), new V3(xa, y, za), [1, 1, 1], {}, scaledXZ(2.7));
  }
  wgSet(x0, z0, x1, z1, y, 0);
}
function walkBox(x0, z0, x1, z1, top = CITY.walk, curbFaces = 'px nx pz nz') {
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const b = tb('flag', cx, cz);
  quadW(b, new V3(x0, top, z1), new V3(x1, top, z1), new V3(x1, top, z0), new V3(x0, top, z0), [1, 1, 1], {}, scaledXZ(3.0));
  const s = tb('stone', cx, cz);
  boxW(s, cx, top - 0.2, cz, x1 - x0, 0.4, z1 - z0, 0, srgb('#9b978f'), {}, curbFaces);
  wgSet(x0, z0, x1, z1, top, 0);
}
function sidewalkRing(b, wdt = 2.5) {
  walkBox(b.x0 - wdt, b.z0 - wdt, b.x1 + wdt, b.z0);
  walkBox(b.x0 - wdt, b.z1, b.x1 + wdt, b.z1 + wdt);
  walkBox(b.x0 - wdt, b.z0, b.x0, b.z1, CITY.walk, 'nx');
  walkBox(b.x1, b.z0, b.x1 + wdt, b.z1, CITY.walk, 'px');
}
function buildGround() {
  const C = CITY;
  const xs = C.streetsX, zs = C.streetsZ;
  const P = C.park;
  // N-S streets
  for (const x of xs) {
    if (x === 0) { roadRect(-6, C.z0, 6, -154); continue; }
    if (x > P.x0 && x < P.x1) { roadRect(x - 6, C.z0, x + 6, P.z0 - 0.0); roadRect(x - 6, P.z1, x + 6, 118); continue; }
    roadRect(x - 6, C.z0, x + 6, 118);
  }
  // E-W streets
  for (const z of zs) {
    const segs = z === 112 ? [[-236, -8], [8, 236]] : z < -150 ? [[-236, 236]] : [[-236, -13], [13, 236]];
    for (const [a, b] of segs) {
      if (z > P.z0 && z < P.z1) { roadRect(a, z - 6, Math.min(b, P.x0), z + 6); if (b > P.x1) roadRect(P.x1, z - 6, b, z + 6); continue; }
      roadRect(a, z - 6, b, z + 6);
    }
  }
  // sidewalks around blocks (park + plaza handled as unions)
  for (const b of CITYDATA.blocks) if (b.kind === 'city') sidewalkRing(b);
  sidewalkRing({ x0: P.x0, x1: P.x1, z0: P.z0, z1: P.z1 });
  // plaza: one continuous paved square
  const Z = C.plaza;
  walkBox(Z.x0 - 2.5, Z.z0 - 2.5, Z.x1 + 2.5, Z.z1 + 2.5);
  // canal walks
  walkBox(-13, C.canal.z0 - 4, 13, C.canal.z0, C.walk, 'nz');
  walkBox(-13, C.canal.z0, -8, 118, C.walk, '');
  walkBox(8, C.canal.z0, 13, 118, C.walk, '');
  // promenade
  walkBox(-236, 118, -8, C.quayZ, C.walk, 'nz');
  walkBox(8, 118, 236, C.quayZ, C.walk, 'nz');
  // canal walls (stone), water side
  const st = (x, z) => tb('stone', x, z);
  const sc = srgb('#a39a88');
  const fl = C.canal.floor - 0.4;
  for (let z = C.canal.z0; z < 146; z += 40) {
    const z1 = Math.min(146, z + 40);
    quadW(st(-8, z), new V3(-8, fl, z1), new V3(-8, fl, z), new V3(-8, C.walk, z), new V3(-8, C.walk, z1), sc);
    quadW(st(8, z), new V3(8, fl, z), new V3(8, fl, z1), new V3(8, C.walk, z1), new V3(8, C.walk, z), sc);
  }
  quadW(st(0, C.canal.z0), new V3(-8, fl, C.canal.z0), new V3(8, fl, C.canal.z0), new V3(8, C.walk, C.canal.z0), new V3(-8, C.walk, C.canal.z0), sc);
  wgSet(-8, C.canal.z0, 8, 146, null, 1);
  // quay wall facing the harbour
  for (let x = -270; x < 300; x += 30) {
    const x0 = x, x1 = Math.min(300, x + 30);
    for (const [a, b] of [[x0, Math.min(x1, -8)], [Math.max(x0, 8), x1]]) {
      if (b - a < 0.1) continue;
      quadW(st(a, 146), new V3(a, -9, 146), new V3(b, -9, 146), new V3(b, C.walk, 146), new V3(a, C.walk, 146), sc);
      boxW(st(a, 146), (a + b) / 2, C.walk + 0.08, 146 - 0.3, b - a, 0.2, 0.7, 0, srgb('#b4ab99'), {}, 'py pz');
    }
  }
  // promenade extension beyond the city edge (grass ends against it)
  walkBox(-270, 128, -236, C.quayZ, C.walk, 'nx nz');
  walkBox(236, 128, 300, C.quayZ, C.walk, 'px nz');
  // quay railings with gaps for piers
  const rail = (x0, x1) => {
    const b = tb('rail', (x0 + x1) / 2, 146);
    const a = new V3(x0, C.walk, 145.7), bb = new V3(x1, C.walk, 145.7);
    b.quad(a, bb, bb.clone().setY(C.walk + 1.05), a.clone().setY(C.walk + 1.05), new V3(0, 0, 1), [[0, 1], [x1 - x0, 1], [x1 - x0, 0], [0, 0]]);
  };
  const gaps = [-150, -90, 90, 150];
  let x = -268;
  for (const g of [...gaps, 999]) {
    const end = Math.min(g - 2.5, 298);
    for (let s = x; s < end; s += 20) rail(s, Math.min(end, s + 20));
    x = g + 2.5;
  }
  wgSet(-270, 145.6, 300, 146.4, null, 1);
  for (const g of gaps) wgSet(g - 2, 145.6, g + 2, 146.4, C.walk, 0);
}

// --- bridges -------------------------------------------------------------------------
function deckY(x, hump) {
  const t = clamp(Math.abs(x) / 13, 0, 1);
  return CITY.road + hump * Math.pow(Math.cos(t * Math.PI / 2), 1.3);
}
function buildBridge(zc, halfW, hump, parX = 13) {
  const st = tb('stone', 0, zc), fl = tb('flag', 0, zc);
  const sc = srgb('#b3a58d');
  const N = 26;
  const X = (i) => -13 + (26 * i) / N;
  const arch = (x) => (Math.abs(x) >= 8 ? 1.9 : 0.1 + (hump > 0.3 ? 2.2 : 1.6) * Math.sqrt(1 - (x / 8) ** 2));
  for (let i = 0; i < N; i++) {
    const xa = X(i), xb = X(i + 1);
    const ya = deckY(xa, hump), yb = deckY(xb, hump);
    // deck
    quadW(fl, new V3(xa, ya, zc + halfW), new V3(xb, yb, zc + halfW), new V3(xb, yb, zc - halfW), new V3(xa, ya, zc - halfW), [1, 1, 1], {}, scaledXZ(3.0));
    // side faces (between arch/intrados and deck)
    const aa = arch(xa), ab = arch(xb);
    quadW(st, new V3(xa, aa, zc + halfW), new V3(xb, ab, zc + halfW), new V3(xb, yb, zc + halfW), new V3(xa, ya, zc + halfW), sc);
    quadW(st, new V3(xb, ab, zc - halfW), new V3(xa, aa, zc - halfW), new V3(xa, ya, zc - halfW), new V3(xb, yb, zc - halfW), sc);
    // intrados (underside)
    if (Math.abs((xa + xb) / 2) < 8) quadW(st, new V3(xa, aa, zc - halfW), new V3(xb, ab, zc - halfW), new V3(xb, ab, zc + halfW), new V3(xa, aa, zc + halfW), sc.map((v) => v * 0.8));
    // parapets
    if (Math.abs(xa) >= parX - 0.01 && Math.abs(xb) >= parX - 0.01 && parX < 13) continue;
    if (Math.max(Math.abs(xa), Math.abs(xb)) > parX + 0.01) continue;
    for (const sgn of [1, -1]) {
      const z = zc + sgn * (halfW - 0.2);
      const h = 0.85;
      const p1 = new V3(xa, ya, z + sgn * 0.2), p2 = new V3(xb, yb, z + sgn * 0.2);
      const q1 = new V3(xa, ya, z - sgn * 0.2), q2 = new V3(xb, yb, z - sgn * 0.2);
      if (sgn > 0) {
        quadW(st, p1, p2, p2.clone().setY(yb + h), p1.clone().setY(ya + h), sc);
        quadW(st, q2, q1, q1.clone().setY(ya + h), q2.clone().setY(yb + h), sc);
      } else {
        quadW(st, p2, p1, p1.clone().setY(ya + h), p2.clone().setY(yb + h), sc);
        quadW(st, q1, q2, q2.clone().setY(yb + h), q1.clone().setY(ya + h), sc);
      }
      quadW(st, new V3(xa, ya + h, z + 0.22), new V3(xb, yb + h, z + 0.22), new V3(xb, yb + h, z - 0.22), new V3(xa, ya + h, z - 0.22), srgb('#c4b69e'));
    }
  }
  // walk heights
  wgRect(-13, zc - halfW, 13, zc + halfW, (k, x, z) => {
    const edge = Math.abs(z - zc) > halfW - 0.45 && Math.abs(x) < parX;
    WG.H[k] = deckY(x, hump); WG.B[k] = edge ? 1 : 0;
  });
  CITYDATA.bridges.push({ zc, halfW, hump });
}

// --- lamps, benches, trees along streets -------------------------------------------
function addLamp(x, z, y = CITY.walk, style = 0) {
  const b = tb('props', x, z);
  const iron = srgb('#1f2a26');
  const ex = { aP: [0.45, 0.6, 0] };
  const pole = new THREE.CylinderGeometry(0.055, 0.085, 3.7, 8, 1, true);
  addGeo(b, pole, x, y + 1.85, z, 0, 1, iron, ex);
  addGeo(b, new THREE.CylinderGeometry(0.16, 0.2, 0.45, 8), x, y + 0.22, z, 0, 1, iron, ex);
  // lantern
  addGeo(b, new THREE.CylinderGeometry(0.22, 0.13, 0.5, 6), x, y + 3.95, z, 0, 1, srgb('#ffd9a0'), { aP: [0.15, 0, 7] });
  addGeo(b, new THREE.ConeGeometry(0.3, 0.28, 6), x, y + 4.34, z, 0, 1, iron, ex);
  addGeo(b, new THREE.SphereGeometry(0.06, 6, 4), x, y + 4.5, z, 0, 1, iron, ex);
  CITYDATA.lamps.push(new V3(x, y + 3.95, z));
  wgSet(x - 0.3, z - 0.3, x + 0.3, z + 0.3, null, 1);
}
function addBench(x, z, rot, y = CITY.walk) {
  const wd = tb('wood', x, z), pb = tb('props', x, z);
  const c = Math.cos(rot), s = Math.sin(rot);
  const L = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  const wc = srgb('#8a6444');
  for (let k = 0; k < 3; k++) { const [px, pz] = L(0, -0.2 + k * 0.17); boxW(wd, px, y + 0.45, pz, 1.8, 0.04, 0.13, rot, wc); }
  for (let k = 0; k < 2; k++) { const [px, pz] = L(0, -0.33 - 0.02); boxW(wd, px, y + 0.62 + k * 0.17, pz - 0 + 0, 1.8, 0.12, 0.04, rot, wc); }
  for (const sx of [-0.8, 0.8]) { const [px, pz] = L(sx, -0.05); boxW(pb, px, y + 0.3, pz, 0.06, 0.6, 0.5, rot, srgb('#20262a'), { aP: [0.5, 0.6, 0] }); }
  CITYDATA.benches.push({ x, z, rot });
}

function buildStreetProps() {
  const C = CITY;
  // canal walks: lamps + cherry trees
  for (let z = C.canal.z0 + 8; z < 112; z += 22) {
    if (CITYDATA.bridges.some((b) => Math.abs(z - b.zc) < b.halfW + 3)) continue;
    addLamp(-12.3, z); addLamp(12.3, z + 11);
  }
  for (let z = C.canal.z0 + 4; z < 112; z += 11) {
    if (CITYDATA.bridges.some((b) => Math.abs(z - b.zc) < b.halfW + 4)) continue;
    CITYDATA.canalTrees.push([-10.9, z + rr(-1, 1)], [10.9, z + 5 + rr(-1, 1)]);
  }
  for (let z = C.canal.z0 + 15; z < 100; z += 33) {
    if (CITYDATA.bridges.some((b) => Math.abs(z - b.zc) < b.halfW + 3)) continue;
    addBench(-9.2, z, -Math.PI / 2); addBench(9.2, z + 16, Math.PI / 2);
  }
  // promenade: two rows of trees, lamps, benches facing the sea
  for (let x = -262; x < 296; x += 14) {
    if (Math.abs(x) < 12) continue;
    CITYDATA.streetTrees.push([x + rr(-0.6, 0.6), 122.5]);
    if (Math.abs(x - 7) > 12) addLamp(x + 7, 143.6);
    if ([-150, -90, 90, 150].every((g) => Math.abs(x + 7 - g) > 5) && Math.abs(x + 7) > 12) addBench(x + 7, 141.8, 0);
  }
  // street lamps along blocks (alternating sides)
  for (const b of CITYDATA.blocks) {
    if (b.kind === 'park') continue;
    for (let x = b.x0 + 6; x < b.x1 - 2; x += 22) { addLamp(x, b.z0 - 2.1); addLamp(x + 11, b.z1 + 2.1); }
  }
  // tram rails on the waterfront road + catenary
  const pb = (x) => tb('props', x, 112);
  const steel = srgb('#6f7275');
  for (let x = -236; x < 236; x += 20) {
    const x1 = Math.min(236, x + 20);
    if (x1 > -8 && x < 8) continue;
    for (const zz of [110.9, 112.4, 113.6, 115.1]) boxW(pb(x), (x + x1) / 2, CITY.road + 0.02, zz, x1 - x, 0.04, 0.08, 0, steel, { aP: [0.3, 0.9, 0] }, 'py pz nz');
  }
  for (let x = -228; x < 236; x += 38) {
    if (Math.abs(x) < 12) continue;
    addGeo(pb(x), new THREE.CylinderGeometry(0.09, 0.12, 7, 8), x, CITY.walk + 3.5, 118.6, 0, 1, srgb('#27302d'), { aP: [0.5, 0.6, 0] });
    boxW(pb(x), x, CITY.walk + 6.6, 116, 0.08, 0.08, 5.2, 0, srgb('#27302d'), { aP: [0.5, 0.6, 0] });
    wgSet(x - 0.3, 118.3, x + 0.3, 118.9, null, 1);
  }
  for (let x = -236; x < 236; x += 38) {
    const x1 = Math.min(236, x + 38);
    for (const zz of [112, 114]) boxW(pb(x), (x + x1) / 2, CITY.walk + 6.2, zz - 0.5, x1 - x, 0.025, 0.025, 0, srgb('#222'), { aP: [0.5, 0.8, 0] }, 'py ny pz nz');
  }
}

// --- materials + mesh assembly -------------------------------------------------------
function finalizeCity() {
  const matFor = { walls: MATS.facade, roofs: MATS.roof, stone: MATS.stone, cobble: MATS.cobble, flag: MATS.flag, props: MATS.props, rail: MATS.rail, wood: MATS.wood, fabric: MATS.fabric };
  for (const kind of ['roomWood', 'roomStone', 'roomPlaster', 'roomTrim', 'roomMetal', 'roomGlass']) matFor[kind] = MATS[kind];
  const group = new THREE.Group();
  for (const [, b] of TB) {
    if (!b.vcount) continue;
    const g = b.build();
    if (b.kind === 'cobble' || b.kind === 'flag') {
      // aoMap uses uv; generate tangents-free normal mapping (three computes from derivatives)
    }
    const m = new THREE.Mesh(g, matFor[b.kind]);
    m.castShadow = !(b.kind === 'cobble' || b.kind === 'flag' || b.kind === 'roomGlass');
    m.receiveShadow = true;
    if (b.kind === 'rail') m.customDepthMaterial = undefined;
    group.add(m);
  }
  scene.add(group);
  CITYDATA.group = group;
}

function cityMask() {
  const C = CITY;
  // no grass, sand or paths under the city
  maskRect(C.x0 - 2, C.z0 - 2, C.x1 + 2, C.z1 + 30, (k) => { MASK[k] = 0; MASK[k + 1] = 0; MASK[k + 2] = 0; MASK[k + 3] = 0; });
  maskRect(-300, 128, 300, 150, (k) => { MASK[k] = 0; MASK[k + 1] = 0; MASK[k + 2] = 0; });
  for (const c of CITYDATA.courtyards) {
    maskRect(c.x0, c.z0, c.x1, c.z1, (k, x, z) => {
      const e = Math.min(x - c.x0, c.x1 - x, z - c.z0, c.z1 - z);
      MASK[k] = 255 * smoothstep(0, 1.2, e);
      MASK[k + 1] = noiseAt(x * 0.05, z * 0.05, 3) > 0.62 ? 120 : 0;
    });
  }
}

function buildCity() {
  MATS.facade = makeFacadeMaterial();
  MATS.roof = makeRoofMaterial();
  MATS.stone = makeStoneMaterial();
  MATS.cobble = makePavingMaterial(TEX.cobble, 'cobble', { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  MATS.flag = makePavingMaterial(TEX.flag, 'flag');
  MATS.props = makePropMaterial();
  MATS.rail = makeRailMaterial();
  MATS.wood = makeWoodMaterial();
  MATS.fabric = makeFabricMaterial();
  initWalkGrid();
  layoutBlocks();
  buildGround();
  for (const b of CITYDATA.blocks) if (b.kind === 'city') genCityBlock(b);
  for (const zc of [-104, -48, 8, 64]) buildBridge(zc, 6, 1.35);
  buildBridge(126, 20, 0.15, 8);
  buildStreetProps();
  cityMask();
  if (typeof buildLandmarks === 'function') buildLandmarks();
  if (typeof buildInteriors === 'function') buildInteriors();
  finalizeCity();
  walkInfo = cityWalkInfo;
}
