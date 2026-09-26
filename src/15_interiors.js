import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Real ground floors. Metres, 28 cm walls, 1.48 m clear entrances and furniture
// collision independent of the old one-metre terrain grid. Detailed contents are
// built near the camera, merged by material, and retired beyond a hysteresis band.
const INTERIORS = { rooms: [], cells: new Map(), active: new Set(), lights: [], prompt: null, target: null, tick: 0, seats: null };
const ROOM_TYPES = [
  { name: '물결 커피', en: 'MAREA · COFFEE', kind: 'cafe', color: '#294b41' },
  { name: '바람 책방', en: 'PAPER & TIDE', kind: 'bookshop', color: '#704b37' },
  { name: '해안 갤러리', en: 'ATELIER / 08', kind: 'gallery', color: '#595a51' },
  { name: '햇살 스튜디오', en: 'CASA · STUDIO', kind: 'home', color: '#355364' },
];
const intWhite = [1, 1, 1];
const intUV = (P, N) => worldUV(P, N).map(v => v / 2.4);
function interiorLocal(r, x, z) { const dx = x - r.cx, dz = z - r.cz; return [dx * r.c - dz * r.s, dx * r.s + dz * r.c]; }
function interiorWorld(r, x, y, z) { return new THREE.Vector3(r.cx + x * r.c + z * r.s, r.baseY + y, r.cz - x * r.s + z * r.c); }
function interiorBox(r, kind, x, y, z, w, h, d, color = intWhite, rot = 0) {
  const p = interiorWorld(r, x, y, z);
  boxW(tb(kind, r.cx, r.cz), p.x, p.y, p.z, w, h, d, r.rot + rot, color, {}, 'px nx py ny pz nz', intUV);
}
function interiorSolid(r, x, z, w, d, rot = 0) { r.solids.push({ x, z, w, d, rot }); }

// Raised villas need a built route to the terrain, including when the hillside
// falls away from the entrance. Each tread uses the same height for drawing and
// walking; the toe is extended until it really meets the sampled ground.
function buildInteriorAccess(r) {
  if (!(r.plinth > 0)) return;
  const width = 2.08, hd = r.d / 2, floor = r.baseY + 0.05;
  const terrain = (x, z) => { const p = interiorWorld(r, x, 0, z); return heightAt(p.x, p.z); };
  const sample = (z0, z1) => {
    const heights = [];
    for (const x of [-width / 2, 0, width / 2]) for (const z of [z0, (z0 + z1) / 2, z1]) heights.push(terrain(x, z));
    return { min: Math.min(...heights), max: Math.max(...heights) };
  };
  const steps = [{ z0: hd - 0.1, z1: hd + 0.64, h: floor }];
  let previous = floor;
  for (let i = 0; i < 96; i++) {
    const last = steps[steps.length - 1];
    if (previous - terrain(0, last.z1 + 0.06) <= 0.21) break;
    const z0 = last.z1, z1 = z0 + 0.34, ground = sample(z0, z1);
    const h = Math.max(previous - 0.17, ground.max + 0.025);
    steps.push({ z0, z1, h }); previous = h;
  }
  r.access = { width, z0: steps[0].z0, z1: steps[steps.length - 1].z1, steps, railing: steps.length > 4 };
  const stone = srgb('#c2b6a0');
  for (const step of steps) {
    const bottom = Math.min(sample(step.z0, step.z1).min - 0.14, step.h - 0.08);
    interiorBox(r, 'roomStone', 0, (step.h + bottom) / 2 - r.baseY, (step.z0 + step.z1) / 2, width, step.h - bottom, step.z1 - step.z0 + 0.012, stone);
    // Lighter tread nosings make individual risers visible in glancing sunlight.
    interiorBox(r, 'roomStone', 0, step.h - r.baseY - 0.018, step.z1 - 0.045, width + 0.025, 0.036, 0.09, srgb('#d6cbb5'));
  }
  if (r.access.railing) {
    const first = steps[0], last = steps[steps.length - 1], railColor = srgb('#485448');
    for (const side of [-1, 1]) {
      const x = side * (width / 2 - 0.065), z0 = hd + 0.3, z1 = last.z1 - 0.12;
      const a = interiorWorld(r, x, floor - r.baseY + 0.92, z0), b = interiorWorld(r, x, last.h - r.baseY + 0.92, z1);
      const direction = b.clone().sub(a), geo = new THREE.CylinderGeometry(0.026, 0.026, direction.length(), 8);
      const matrix = new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()), new THREE.Vector3(1, 1, 1));
      tb('roomMetal', r.cx, r.cz).add(geo, matrix, railColor); geo.dispose();
      for (let i = 0; i < steps.length; i += 3) {
        const step = steps[i], z = Math.min(z1, (step.z0 + step.z1) / 2), railH = lerp(floor, last.h, clamp((z - z0) / (z1 - z0), 0, 1)) + 0.92;
        interiorBox(r, 'roomMetal', x, (step.h + railH) / 2 - r.baseY, z, 0.045, Math.max(0.2, railH - step.h), 0.045, railColor);
      }
    }
  }
  // The approach can extend farther than the building's circumscribed circle.
  const half = width / 2 + 0.3;
  const corners = [[-half, hd], [half, hd], [-half, r.access.z1 + 0.3], [half, r.access.z1 + 0.3]].map(([x, z]) => interiorWorld(r, x, 0, z));
  const xmin = Math.min(...corners.map(p => p.x)), xmax = Math.max(...corners.map(p => p.x));
  const zmin = Math.min(...corners.map(p => p.z)), zmax = Math.max(...corners.map(p => p.z));
  if (typeof maskRect === 'function') maskRect(xmin, zmin, xmax, zmax, (k, x, z) => {
    const [lx, lz] = interiorLocal(r, x, z);
    if (Math.abs(lx) < half && lz > hd - 0.2 && lz < r.access.z1 + 0.3) { MASK[k] = 0; MASK[k + 1] = 0; }
  });
  for (let x = Math.floor(xmin / 24); x <= Math.floor(xmax / 24); x++) for (let z = Math.floor(zmin / 24); z <= Math.floor(zmax / 24); z++) {
    const k = x + ':' + z; if (!INTERIORS.cells.has(k)) INTERIORS.cells.set(k, []);
    if (!INTERIORS.cells.get(k).includes(r)) INTERIORS.cells.get(k).push(r);
  }
}

function registerInterior(o) {
  const type = ROOM_TYPES[Math.floor(o.seed * 11.37) % ROOM_TYPES.length];
  const r = { ...o, c: Math.cos(o.rot), s: Math.sin(o.rot), type, id: INTERIORS.rooms.length,
    solids: [], seats: [], angle: 0, open: false, lit: true, group: null, door: null, dw: 1.48 };
  INTERIORS.rooms.push(r);
  const rad = Math.hypot(r.w, r.d) / 2 + 1;
  for (let x = Math.floor((r.cx - rad) / 24); x <= Math.floor((r.cx + rad) / 24); x++) {
    for (let z = Math.floor((r.cz - rad) / 24); z <= Math.floor((r.cz + rad) / 24); z++) {
      const k = x + ':' + z; if (!INTERIORS.cells.has(k)) INTERIORS.cells.set(k, []); INTERIORS.cells.get(k).push(r);
    }
  }
  const wall = r.modern ? srgb('#f5f3eb') : r.color.map(v => Math.min(1, v * 0.52 + 0.4));
  const stone = srgb(r.modern ? '#e8e3d7' : '#d6cbb5');
  const trim = srgb(r.modern ? (r.modernStyle % 2 ? '#65706a' : '#766c58') : type.color), metal = srgb('#29322f');
  const B = (kind, x, y, z, w, h, d, col, rot = 0) => interiorBox(r, kind, x, y, z, w, h, d, col, rot);
  const hw = r.w / 2, hd = r.d / 2, t = 0.28, ceiling = 3.52;
  // The slab closes the upper storeys; all ground-floor walls have actual depth.
  B('roomWood', 0, 0.025, 0, r.w, 0.05, r.d, srgb(r.modern ? '#f0e7d6' : '#b9a48b'));
  if (r.plinth > 0) B('roomStone', 0, -r.plinth / 2, 0, r.w, r.plinth, r.d, stone);
  B('roomPlaster', 0, ceiling + 0.12, 0, r.w, 0.24, r.d, srgb(r.modern ? '#faf8f2' : '#eae4d6'));
  B('roomPlaster', -hw + t / 2, 2.1, 0, t, 4.2, r.d, wall);
  B('roomPlaster', hw - t / 2, 2.1, 0, t, 4.2, r.d, wall);
  B('roomPlaster', 0, 2.1, -hd + t / 2, r.w, 4.2, t, wall);
  interiorSolid(r, -hw + t / 2, 0, t, r.d); interiorSolid(r, hw - t / 2, 0, t, r.d); interiorSolid(r, 0, -hd + t / 2, r.w, t);
  // Wide glazed storefronts flank an opening; no painted door or invisible wall.
  const sideW = (r.w - r.dw) / 2, winW = sideW - 0.66;
  const doorH = 2.66;
  if (r.modern) {
    // Full-height shopfront, a clear central entrance and a thin floating slab.
    // The glass uses exactly the same collision footprint as the old storefront.
    const glassTop = 3.24, frame = 0.045;
    B('roomPlaster', 0, (glassTop + 4.2) / 2, hd - t / 2, r.w, 4.2 - glassTop, t, wall);
    for (const side of [-1, 1]) {
      const cx = side * (r.dw / 2 + sideW / 2), gw = sideW - 0.12;
      B('roomGlass', cx, 1.67, hd - 0.115, gw, 3.12, 0.018, srgb('#edf3ee'));
      for (const yy of [0.095, glassTop]) B('roomMetal', cx, yy, hd - 0.08, sideW, frame, 0.07, trim);
      for (const xx of [side * (hw - 0.045), side * (r.dw / 2 + 0.03)]) B('roomMetal', xx, 1.67, hd - 0.08, frame, 3.16, 0.075, trim);
      if (gw > 2.8) B('roomMetal', cx + side * gw * 0.17, 1.67, hd - 0.08, 0.035, 3.16, 0.065, trim);
      interiorSolid(r, cx, hd - t / 2, sideW, t);
    }
    B('roomGlass', 0, (doorH + glassTop) / 2, hd - 0.12, r.dw, glassTop - doorH, 0.018, srgb('#edf3ee'));
    const canopyW = r.modernStyle % 3 === 0 ? r.w - 0.35 : Math.min(r.w - 0.35, 4.8);
    B('roomTrim', 0, 3.43, hd + 0.45, canopyW, 0.10, 1.03, stone);
    B('roomWood', 0, 3.375, hd + 0.44, canopyW - 0.09, 0.018, 0.93, srgb('#e4d6bc'));
  } else {
  B('roomStone', 0, (doorH + 4.2) / 2, hd - t / 2, r.w, 4.2 - doorH, t, stone);
  B('roomTrim', 0, 3.7, hd + 0.09, r.w + 0.12, 0.17, 0.38, trim);
  for (const side of [-1, 1]) {
    const cx = side * (r.dw / 2 + sideW / 2);
    B('roomStone', cx, 0.31, hd - t / 2, sideW, 0.62, t, stone);
    B('roomStone', side * (hw - 0.17), 1.66, hd - t / 2, 0.34, 2.12, t, stone);
    B('roomStone', side * (r.dw / 2 + 0.16), 1.66, hd - t / 2, 0.32, 2.12, t, stone);
    B('roomGlass', cx, 1.65, hd - 0.14, winW, 2.06, 0.018, srgb('#c8d8da'));
    for (const yy of [0.59, 2.7]) B('roomTrim', cx, yy, hd + 0.015, winW + 0.12, 0.07, 0.1, trim);
    for (const xx of [cx - winW / 2, cx, cx + winW / 2]) B('roomTrim', xx, 1.65, hd + 0.015, 0.055, 2.12, 0.1, trim);
    B('roomStone', cx, 0.56, hd + 0.12, winW + 0.24, 0.1, 0.5, stone);
    interiorSolid(r, cx, hd - t / 2, sideW, t);
  }
  }
  for (const x of [-r.dw / 2 - 0.035, r.dw / 2 + 0.035]) B('roomTrim', x, doorH / 2, hd - 0.06, 0.08, doorH, 0.23, trim);
  B('roomTrim', 0, doorH + 0.025, hd - 0.06, r.dw + 0.16, 0.09, 0.23, trim);
  B('roomStone', 0, 0.025, hd + 0.18, r.dw + 0.12, 0.05, 0.72, stone);
  buildInteriorAccess(r);
  if (r.modern) {
    // A low oak skirting and uninterrupted ceiling keep the contemporary rooms airy.
    for (const x of [-hw + 0.17, hw - 0.17]) B('roomWood', x, 0.105, 0, 0.04, 0.10, r.d - 0.5, srgb('#e7dac3'));
  } else {
  // Historic landmarks retain their original joinery and upper-storey details.
  for (const x of [-hw + 0.17, hw - 0.17]) {
    B('roomTrim', x, 0.16, 0, 0.09, 0.21, r.d - 0.5, trim);
    B('roomTrim', x, ceiling - 0.14, 0, 0.12, 0.16, r.d - 0.5, srgb('#d4c7ad'));
  }
  for (let z = -hd + 1.7; z < hd - 0.8; z += 2.35) B('roomWood', 0, ceiling - 0.14, z, r.w - 0.56, 0.28, 0.18, srgb('#a68d73'));
  // Projecting window frames and varied cornices on the upper facade cast real shadows.
  const nb = Math.max(1, Math.floor(r.w / 3.1 + 0.3)), bw = r.w / nb;
  for (let fi = 1; fi < r.floors; fi++) {
    const fy = 4.2 + (fi - 1) * r.fh;
    const balc = bi => r.balMode === 1 || (r.balMode === 2 && bi === Math.floor(nb / 2)) || (r.balMode === 3 && fi === 1);
    for (let bi = 0; bi < nb; bi++) {
      const x = -hw + (bi + 0.5) * bw;
      const wide = r.wStyle > 1.5 || balc(bi), ww = Math.min(wide ? 1.25 : 1.05, bw * (wide ? 0.46 : 0.4));
      const wh = balc(bi) ? 2.35 : wide ? 2.1 : 1.6, sill = balc(bi) ? 0.05 : wide ? 0.45 : 0.9;
      B('roomStone', x, fy + sill - 0.06, hd + 0.12, ww + 0.3, 0.14, 0.34, stone);
      B('roomStone', x, fy + sill + wh + 0.1, hd + 0.085, ww + 0.25, 0.13, 0.22, stone);
      for (const side of [-1, 1]) B('roomStone', x + side * (ww / 2 + 0.08), fy + sill + wh / 2, hd + 0.04, 0.1, wh + 0.08, 0.12, stone);
    }
    if (Math.floor(r.seed) % 3 === 0) B('roomStone', 0, fy - 0.06, hd + 0.08, r.w, 0.16, 0.32, stone);
  }
  // Distinctive entrance variants: stone arches / rounded metal canopy / pilasters.
  const variant = Math.floor(r.seed * 7) % 3;
  // Rounded corner oriels and a conical cap break the repetitive rectilinear
  // silhouette. These are upper-floor projections, clear of the walking route.
  if (r.corner && variant !== 2 && r.floors > 2) {
    const x = (r.party.left ? 1 : -1) * (hw - 0.66), z = hd - 0.28;
    const high = 4.2 + (r.floors - 1) * r.fh;
    const shape = (kind, geo, y, color) => { const p = interiorWorld(r, x, y, z); addGeo(tb(kind, r.cx, r.cz), geo, p.x, p.y, p.z, r.rot, 1, color); geo.dispose(); };
    for (let fi = 1; fi < r.floors; fi++) {
      const y = 4.2 + (fi - 1) * r.fh;
      shape('roomStone', new THREE.CylinderGeometry(0.95, 0.92, 0.68, 14), y + 0.34, stone);
      shape('roomTrim', new THREE.CylinderGeometry(0.89, 0.89, r.fh - 0.72, 14), y + (r.fh + 0.68) / 2, srgb('#4d6868'));
      for (let k = 0; k < 9; k++) {
        const a = k / 8 * Math.PI;
        B('roomStone', x + Math.cos(a) * 0.89, y + r.fh / 2 + 0.25, z + Math.sin(a) * 0.89, 0.07, r.fh - 0.5, 0.075, stone);
      }
      shape('roomStone', new THREE.CylinderGeometry(1.02, 0.95, 0.14, 14), y + r.fh - 0.06, stone);
    }
    shape('roomMetal', new THREE.ConeGeometry(1.2, 1.8, 14), high + 0.87, srgb('#4c5c58'));
  }
  if (variant === 0) {
    const arch = new THREE.Shape();
    arch.absellipse(0, 2.64, 0.98, 0.76, 0, Math.PI, false, 0);
    arch.lineTo(-0.78, 2.64); arch.absellipse(0, 2.64, 0.78, 0.56, Math.PI, 0, true, 0); arch.closePath();
    const geo = new THREE.ExtrudeGeometry(arch, { depth: 0.26, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 2, curveSegments: 16 });
    const p = interiorWorld(r, 0, 0, hd + 0.03); addGeo(tb('roomStone', r.cx, r.cz), geo, p.x, p.y, p.z, r.rot, 1, stone); geo.dispose();
  } else if (variant === 1 && r.gType !== 1) {
    const pb = tb('roomTrim', r.cx, r.cz);
    const canopy = new THREE.CylinderGeometry(1.4, 1.4, 0.12, 24, 1, false, -Math.PI / 2, Math.PI);
    const p = interiorWorld(r, 0, 2.95, hd);
    addGeo(pb, canopy, p.x, p.y, p.z, r.rot, new THREE.Vector3(1, 1, 0.6), trim);
    canopy.dispose();
  }
  }
  // Downpipes at one side, brass street number plaque and an entry light.
  B('roomMetal', -hw + 0.17, 2.05, hd + 0.2, 0.065, 4.1, 0.065, metal);
  B('roomMetal', r.dw / 2 + 0.27, 1.55, hd + 0.025, 0.16, 0.22, 0.035, srgb('#a89055'));
  r.front = interiorWorld(r, 0, 1.58, hd - 0.15);
  r.switch = interiorWorld(r, r.dw / 2 + 0.38, 1.3, hd - 0.34);
  r.entry = interiorWorld(r, 0, 1.7, hd + 1.8);
  interiorRecipe(r, false);
  return r;
}

// Recipes produce collision and seats even when the detailed meshes are unloaded.
function interiorRecipe(r, render) {
  const bins = new Map(), random = mulberry32(Math.floor(r.seed * 65497) + 318);
  const hw = r.w / 2, hd = r.d / 2;
  const wood = srgb(r.modern ? '#e9dcc5' : '#b29271'), dark = srgb(r.modern ? '#45534d' : '#493c31');
  const brass = srgb(r.modern ? '#b3a58c' : '#9d895c'), linen = srgb(r.modern ? '#e9e5dc' : '#c4b7a0');
  const materials = { wood: 'roomWood', plaster: 'roomPlaster', metal: 'roomMetal', fabric: 'roomFabric', glow: 'roomGlow', glass: 'roomGlass', trim: 'roomTrim', shadow: 'roomShadow' };
  const bin = kind => { if (!bins.has(kind)) bins.set(kind, new GeoBuilder()); return bins.get(kind); };
  const box = (kind, x, y, z, w, h, d, col = intWhite, rot = 0, solid = false) => {
    if (!render && solid) interiorSolid(r, x, z, w, d, rot);
    if (render) boxW(bin(kind), x, y, z, w, h, d, rot, col, {}, 'px nx py ny pz nz', intUV);
  };
  const shape = (kind, geo, x, y, z, scale, col, rx = 0) => { if (render) addGeo(bin(kind), geo, x, y, z, 0, scale, col, {}, rx); geo.dispose(); };
  const rounded = (kind, x, y, z, w, h, d, radius, color, rot = 0) => {
    if (!render) return;
    const geo = new RoundedBoxGeometry(w, h, d, 2, radius);
    addGeo(bin(kind), geo, x, y, z, rot, 1, color); geo.dispose();
  };
  const contact = (x, z, w, d, alpha = 1) => {
    if (!render) return;
    bin('shadow').quad(new THREE.Vector3(x-w/2, 0.058, z+d/2), new THREE.Vector3(x+w/2, 0.058, z+d/2), new THREE.Vector3(x+w/2, 0.058, z-d/2), new THREE.Vector3(x-w/2, 0.058, z-d/2), new THREE.Vector3(0,1,0), [[0,0],[1,0],[1,1],[0,1]], [alpha, alpha, alpha]);
  };
  const cyl = (kind, x, y, z, rt, rb, h, col) => { if (render) shape(kind, new THREE.CylinderGeometry(rt, rb, h, 16), x, y, z, 1, col); };
  const pot = (x, z, size = 1) => {
    contact(x, z, size * 0.95, size * 0.95);
    cyl('plaster', x, 0.26 * size, z, 0.23 * size, 0.16 * size, 0.48 * size, srgb(r.modern ? '#dfdfd2' : '#a8795a'));
    cyl('wood', x, 0.69 * size, z, 0.016 * size, 0.028 * size, 0.68 * size, dark);
    for (let i = 0; i < 14; i++) { const a = i * 2.4; shape('fabric', new THREE.SphereGeometry(1, 8, 6), x + Math.cos(a) * 0.2 * size, (0.56 + i * 0.042) * size, z + Math.sin(a) * 0.2 * size, new THREE.Vector3(0.2, 0.075, 0.12).multiplyScalar(size), srgb(i % 2 ? '#426743' : '#759062')); }
    if (!render) interiorSolid(r, x, z, size * 0.46, size * 0.46);
  };
  const chair = (x, z, rot = 0, cushion = '#889587') => {
    const T = (a, b) => [x + a * Math.cos(rot) + b * Math.sin(rot), z - a * Math.sin(rot) + b * Math.cos(rot)];
    rounded('fabric', x, 0.49, z, 0.49, 0.095, 0.5, 0.035, srgb(cushion), rot);
    if (!render) interiorSolid(r, x, z, 0.49, 0.5, rot);
    contact(x, z, 0.9, 0.9);
    let p = T(0, -0.24);
    rounded(r.modern ? 'fabric' : 'wood', p[0], 0.79, p[1], 0.53, r.modern ? 0.39 : 0.25, r.modern ? 0.09 : 0.07, r.modern ? 0.045 : 0.028, r.modern ? srgb(cushion) : wood, rot);
    for (const a of [-0.2, 0.2]) { p = T(a, -0.19); cyl('wood', p[0], 0.62, p[1], 0.021, 0.023, 0.63, wood); }
    for (const a of [-0.18, 0.18]) for (const b of [-0.17, 0.17]) { p = T(a, b); cyl('wood', p[0], 0.26, p[1], 0.024, 0.016, 0.46, dark); }
    if (!render) r.seats.push({ pos: interiorWorld(r, x, 1.18, z), yaw: r.rot + rot + Math.PI });
  };
  const table = (x, z) => {
    contact(x, z, 1.85, 1.85);
    cyl(r.modern ? 'plaster' : 'wood', x, 0.76, z, 0.63, 0.63, 0.07, r.modern ? srgb('#e9e4d9') : wood);
    cyl('metal', x, 0.38, z, r.modern ? 0.075 : 0.05, r.modern ? 0.11 : 0.075, 0.72, r.modern ? brass : dark);
    cyl('metal', x, 0.085, z, 0.34, 0.36, 0.045, r.modern ? brass : dark);
    if (!render) interiorSolid(r, x, z, 1.13, 1.13);
    cyl('plaster', x - 0.18, 0.802, z, 0.11, 0.095, 0.017, srgb('#e8e3d7'));
    cyl('plaster', x - 0.18, 0.86, z, 0.066, 0.05, 0.105, srgb('#e8e3d7')); cyl('metal', x - 0.18, 0.915, z, 0.053, 0.053, 0.008, srgb('#463329'));
    shape('plaster', new THREE.TorusGeometry(0.033, 0.01, 6, 12), x - 0.102, 0.86, z, 1, srgb('#e8e3d7'));
    cyl('plaster', x + 0.19, 0.87, z - 0.12, 0.035, 0.06, 0.15, srgb('#839886'));
    cyl('wood', x + 0.19, 1.01, z - 0.12, 0.006, 0.006, 0.18, srgb('#718565'));
    box('plaster', x + 0.16, 0.805, z + 0.14, 0.19, 0.01, 0.26, srgb('#ded8c8'), 0.2);
    chair(x - 0.83, z, Math.PI / 2); chair(x + 0.83, z, -Math.PI / 2);
  };
  const shelf = (x, z, wide, rot = 0, books = true) => {
    contact(x, z, wide + 0.5, 0.9);
    if (!r.modern) box('wood', x, 1.25, z, wide, 2.5, 0.12, dark, rot);
    const T = (a, b) => [x + a * Math.cos(rot) + b * Math.sin(rot), z - a * Math.sin(rot) + b * Math.cos(rot)];
    if (r.modern) for (const a of [-wide / 2 + 0.025, 0, wide / 2 - 0.025]) { const p = T(a, 0.1); box('metal', p[0], 1.25, p[1], 0.035, 2.5, 0.30, brass, rot); }
    for (let row = 0; row < 5; row++) {
      const yy = 0.18 + row * 0.48, p = T(0, 0.13);
      box('wood', p[0], yy, p[1], wide, 0.045, 0.4, wood, rot);
      for (let j = 0; j < Math.floor(wide / 0.16); j++) {
        if (r.modern && j % 9 > 5) continue;
        const h = 0.24 + random() * 0.15, p2 = T(-wide / 2 + 0.1 + j * 0.16, 0.13);
        if (books) box('fabric', p2[0], yy + h / 2 + 0.024, p2[1], 0.11 + random() * 0.025, h, 0.22, srgb(['#536760', '#a56c54', '#c0b78c', '#60747c', '#786057'][Math.floor(random() * 5)]), rot);
        else if (j % 3 === 0) cyl('plaster', p2[0], yy + 0.1, p2[1], 0.07, 0.1, 0.16, linen);
      }
    }
    if (!render) { const p = T(0, 0.13); interiorSolid(r, p[0], p[1], wide, 0.42, rot); }
  };
  const art = (x, y, z, w, h, rot = 0) => {
    if (r.modern) {
      const normal = [Math.sin(rot), Math.cos(rot)], tangent = [Math.cos(rot), -Math.sin(rot)];
      box('wood', x, y, z, w + 0.035, h + 0.035, 0.045, wood, rot);
      box('plaster', x + normal[0] * 0.029, y, z + normal[1] * 0.029, w, h, 0.02, srgb('#f1eee4'), rot);
      box('fabric', x - tangent[0] * w * 0.18 + normal[0] * 0.043, y - h * 0.12, z - tangent[1] * w * 0.18 + normal[1] * 0.043, w * 0.27, h * 0.52, 0.014, srgb('#96aa99'), rot);
      if (render) {
        const disc = new THREE.CircleGeometry(Math.min(w, h) * 0.24, 40);
        addGeo(bin('fabric'), disc, x + tangent[0] * w * 0.18 + normal[0] * 0.055, y + h * 0.12, z + tangent[1] * w * 0.18 + normal[1] * 0.055, rot, 1, srgb('#cfbca4')); disc.dispose();
      }
      return;
    }
    box('wood', x, y, z, w + 0.09, h + 0.09, 0.07, dark, rot);
    const normal = [Math.sin(rot), Math.cos(rot)];
    box('plaster', x + normal[0] * 0.042, y, z + normal[1] * 0.042, w, h, 0.02, srgb('#c3cbbd'), rot);
    for (let k = 0; k < 5; k++) box('fabric', x + normal[0] * (0.06 + k * 0.005), y - h * 0.36 + k * h * 0.12, z + normal[1] * (0.06 + k * 0.005), w * 0.9, h * 0.18, 0.015, srgb(['#839a9b', '#647d88', '#d1b68e', '#8c997b', '#587078'][k]), rot);
  };
  if (r.type.kind === 'cafe') {
    const back = -hd + 2.25, counterW = Math.min(4.8, r.w - 2.7), counterX = -0.35;
    rounded(r.modern ? 'plaster' : 'wood', counterX, 0.53, back, counterW, 1.01, 0.84, r.modern ? 0.16 : 0.045, r.modern ? srgb('#e3e5d9') : wood);
    if (!render) interiorSolid(r, counterX, back, counterW, 0.84);
    contact(counterX, back, counterW + 0.7, 1.45);
    rounded('plaster', counterX, 1.075, back, counterW + 0.14, 0.1, 0.98, 0.035, srgb('#d9d0bc'));
    if (!r.modern) {
    // Fluted cabinet front and recessed dark toe kick in the historic cafes.
    for (let x = counterX - counterW / 2 + 0.12; x < counterX + counterW / 2; x += 0.13) rounded('wood', x, 0.57, back + 0.433, 0.038, 0.76, 0.038, 0.014, wood);
    box('trim', counterX, 0.09, back + 0.435, counterW - 0.16, 0.12, 0.03, srgb('#453a30'));
    box('metal', counterX, 0.38, back + 0.63, counterW - 0.4, 0.035, 0.035, brass);
    for (const x of [-counterW / 2 + 0.45, counterW / 2 - 0.6]) box('metal', x, 0.3, back + 0.53, 0.035, 0.2, 0.23, brass);
    } else {
      rounded('wood', counterX - counterW * 0.28, 0.56, back + 0.43, counterW * 0.34, 0.77, 0.022, 0.01, wood);
      box('trim', counterX, 0.087, back + 0.39, counterW - 0.30, 0.055, 0.025, dark);
    }
    // A tiled prep alcove with a human-sized worktop; individual grout joints.
    box('plaster', 0, 1.71, -hd + 0.305, Math.min(r.w - 0.7, 6.3), 2.08, 0.05, srgb('#b5b4a0'));
    const tileW = Math.min(r.w - 0.8, 6.15);
    if (r.modern) {
      box('plaster', 0, 1.79, -hd + 0.345, tileW, 1.94, 0.035, srgb('#d4ddd2'));
      // Tall ceramic tiles make a calm, continuous prep wall.
      for (let xx = -tileW / 2 + 0.15; xx < tileW / 2 - 0.1; xx += 0.30) box('plaster', xx, 1.79, -hd + 0.369, 0.286, 1.92, 0.016, srgb('#dce3d7'));
    } else for (let row = 0; row < 8; row++) for (let xx = -tileW / 2 + 0.16; xx < tileW / 2 - 0.1; xx += 0.32) {
      box('plaster', xx, 0.82 + row * 0.23, -hd + 0.345, 0.307, 0.217, 0.025, srgb(['#81958a', '#8d9f91', '#9aab9c'][Math.floor(random() * 3)]));
    }
    box('wood', 0, 0.49, -hd + 0.76, tileW, 0.86, 0.65, dark, 0, true);
    rounded('plaster', 0, 0.97, -hd + 0.76, tileW + 0.06, 0.1, 0.74, 0.025, srgb('#cbc6b8'));
    for (let x = -tileW / 2 + 0.36; x < tileW / 2; x += 0.71) {
      rounded('wood', x, 0.51, -hd + 1.09, 0.67, 0.73, 0.055, 0.015, wood);
      box('metal', x, 0.76, -hd + 1.14, 0.15, 0.023, 0.025, brass);
    }
    // Espresso machine: rounded steel housing, brass control knobs, portafilters,
    // drip tray, cup warmer and a separate glass-hopper grinder.
    rounded('metal', -1.12, 1.38, back - 0.05, 0.88, 0.48, 0.47, 0.045, srgb('#7f8f8b'));
    box('trim', -1.12, 1.39, back + 0.193, 0.71, 0.26, 0.03, srgb('#263c36'));
    box('metal', -1.12, 1.16, back + 0.28, 0.9, 0.048, 0.28, srgb('#626b67'));
    for (let x = -1.5; x < -0.7; x += 0.065) box('trim', x, 1.187, back + 0.28, 0.015, 0.003, 0.2, dark);
    for (const x of [-1.35, -0.93]) {
      cyl('metal', x, 1.3, back + 0.23, 0.055, 0.055, 0.16, brass);
      rounded('trim', x, 1.25, back + 0.35, 0.042, 0.048, 0.22, 0.018, dark);
      shape('metal', new THREE.SphereGeometry(0.037, 10, 7), x, 1.5, back + 0.216, 1, brass);
      cyl('plaster', x, 1.68, back - 0.04, 0.057, 0.05, 0.1, srgb('#e5ded0'));
    }
    rounded('metal', -0.36, 1.28, back, 0.23, 0.3, 0.31, 0.025, srgb('#344d45'));
    cyl('glass', -0.36, 1.61, back, 0.16, 0.09, 0.34, srgb('#c5d7cc'));
    cyl('wood', -0.36, 1.56, back, 0.13, 0.08, 0.19, srgb('#5e3c2d'));
    cyl('metal', -0.36, 1.79, back, 0.165, 0.165, 0.035, dark);
    // Pastry display, ceramic plates and small rounded loaves.
    rounded('wood', 1.15, 1.15, back, 1.0, 0.085, 0.65, 0.025, dark);
    box('glass', 1.15, 1.43, back + 0.3, 1.0, 0.52, 0.015, srgb('#dae3d8'));
    box('glass', 1.15, 1.695, back, 1.0, 0.018, 0.63, srgb('#dae3d8'));
    for (const x of [0.9, 1.38]) for (const z of [back - 0.15, back + 0.16]) {
      cyl('plaster', x, 1.2, z, 0.16, 0.14, 0.018, srgb('#d8d0b9'));
      rounded('fabric', x, 1.26, z, 0.19, 0.11, 0.11, 0.04, srgb('#b97d3e'), 0.25);
    }
    // Open shelves stop below the menu, preserving a believable prep zone.
    for (const y of (r.modern ? [1.88] : [1.68, 2.12])) {
      box('wood', 0, y, -hd + 0.58, tileW - 0.35, 0.055, 0.4, wood);
      for (let x = -tileW / 2 + 0.38; x < -1.1; x += r.modern ? 0.5 : 0.31) {
        cyl('glass', x, y + 0.2, -hd + 0.54, 0.11, 0.11, 0.32, srgb('#c3c6a9'));
        cyl('wood', x, y + 0.16, -hd + 0.54, 0.095, 0.095, 0.21, srgb('#8d7553'));
        cyl('metal', x, y + 0.37, -hd + 0.54, 0.112, 0.112, 0.032, brass);
      }
      for (let x = 1.1; x < tileW / 2 - 0.3; x += r.modern ? 0.38 : 0.23) cyl('plaster', x, y + 0.11, -hd + 0.58, 0.071, 0.06, 0.18, srgb('#dfd2b8'));
    }
    table(-hw + 2.0, hd - 2.3); if (r.w > 8.5) table(hw - 2.0, hd - 2.3);
    table(-hw + 2.0, -0.4); if (r.w > 9.5) table(hw - 2.0, -0.4);
    pot(hw - 0.7, hd - 0.75, 1.5); pot(hw - 1.0, -hd + 1.0, 1.5);
    art(hw - 0.32, 1.95, -0.5, 1.8, 1.1, -Math.PI / 2);
    art(-hw + 0.32, 1.93, -0.7, 1.35, 1.0, Math.PI / 2);
    // Slim wall panelling prevents the lower room becoming an empty plaster box.
    if (!r.modern) for (const x of [-hw + 0.3, hw - 0.3]) {
      box('wood', x, 0.54, 0.1, 0.04, 0.92, r.d - 2.4, srgb('#a3aa96'));
      box('wood', x, 1.015, 0.1, 0.08, 0.065, r.d - 2.4, wood);
    }
  } else if (r.type.kind === 'bookshop') {
    shelf(0, -hd + 0.37, r.w - 1.3);
    shelf(-hw + 0.37, -0.8, Math.min(r.d - 3, 5.5), Math.PI / 2);
    shelf(hw - 0.37, -0.8, Math.min(r.d - 3, 5.5), -Math.PI / 2);
    box('wood', 0, 0.48, -0.3, 1.7, 0.9, 1.8, wood, 0, true);
    for (let i = 0; i < 7; i++) box('fabric', (i % 2 - 0.5) * 0.68, 0.96 + Math.floor(i / 2) * 0.045, -0.8 + (i % 3) * 0.46, 0.5, 0.055, 0.34, srgb(['#b69c79', '#718f8a', '#a86e62'][i % 3]), 0.06 * i);
    chair(-hw + 1.3, hd - 1.5, 0, '#9c795d'); chair(hw - 1.3, hd - 1.5, 0, '#9c795d');
    pot(hw - 0.7, -hd + 0.8, 1.3);
  } else if (r.type.kind === 'gallery') {
    for (const x of [-r.w * 0.28, r.w * 0.28]) { art(x, 1.85, -hd + 0.32, 1.7, 1.3); art(-hw + 0.32, 1.85, x, 1.65, 1.15, Math.PI / 2); }
    box('plaster', hw - 1.7, 0.53, -0.8, 0.86, 1, 0.86, srgb('#e4ded0'), 0, true);
    shape('metal', new THREE.TorusKnotGeometry(0.31, 0.09, 64, 9), hw - 1.7, 1.42, -0.8, 1, brass);
    if (r.modern) { rounded('fabric', -0.4, 0.45, 0, 1.9, 0.16, 0.65, 0.075, linen); if (!render) interiorSolid(r, -0.4, 0, 1.9, 0.65); }
    else box('wood', -0.4, 0.43, 0, 1.9, 0.12, 0.65, wood, 0, true);
    for (const x of [-1.14, 0.34]) box('metal', x, 0.23, 0, 0.075, 0.42, 0.6, dark);
    if (!render) r.seats.push({ pos: interiorWorld(r, -0.4, 1.12, 0), yaw: r.rot });
    pot(hw - 0.8, hd - 0.8, 1.6);
  } else {
    // An open-plan apartment with a kitchen, living corner, dining area and bedroom.
    box('wood', hw - 0.75, 0.49, -hd + 2, 0.72, 0.9, 3.2, wood, 0, true);
    box('plaster', hw - 0.75, 0.98, -hd + 2, 0.86, 0.09, 3.3, srgb('#dfd9c9'));
    box('metal', hw - 0.75, 1.04, -hd + 1.25, 0.55, 0.04, 0.65, srgb('#526161'));
    cyl('metal', hw - 0.75, 1.2, -hd + 1.25, 0.015, 0.015, 0.34, brass);
    box('wood', -hw + 1.55, 0.28, -hd + 1.65, 2.05, 0.43, 2.55, dark, 0, true);
    box('fabric', -hw + 1.55, 0.61, -hd + 1.7, 1.96, 0.3, 2.43, srgb('#d3c6ad'));
    box('fabric', -hw + 1.55, 0.81, -hd + 0.85, 1.65, 0.13, 0.49, srgb('#e8e0d0'));
    box('fabric', -hw + 1.55, 0.79, -hd + 2.2, 1.98, 0.06, 1.13, srgb('#77958b'));
    if (r.modern) {
      rounded('fabric', -hw + 0.93, 0.52, 0.5, 1.2, 0.82, 2.6, 0.17, linen);
      rounded('fabric', -hw + 1.24, 0.62, 0.5, 0.58, 0.21, 2.27, 0.08, srgb('#e1e5d8'));
      for (const z of [-0.22, 0.72]) rounded('fabric', -hw + 0.73, 0.88, z, 0.26, 0.44, 0.62, 0.10, srgb('#b0bda9'));
      if (!render) interiorSolid(r, -hw + 0.93, 0.5, 1.2, 2.6);
    } else {
      box('fabric', -hw + 0.93, 0.56, 0.5, 1.2, 0.93, 2.6, srgb('#b29a7c'), 0, true);
      box('fabric', -hw + 1.36, 0.66, 0.5, 0.36, 0.35, 2.32, srgb('#d1bfa0'));
    }
    if (!render) r.seats.push({ pos: interiorWorld(r, -hw + 1.25, 1.25, 0.5), yaw: r.rot - Math.PI / 2 });
    box('wood', -hw + 2.4, 0.35, 0.5, 0.66, 0.6, 1.24, wood, 0, true);
    table(hw - 2.1, hd - 2.2); art(-hw + 0.32, 2.0, 0.5, 1.5, 1, Math.PI / 2);
    pot(-hw + 0.8, hd - 0.8, 1.4);
  }
  // Pendants and their diffusers are geometry, not flat light spots.
  for (const z of [-hd * 0.42, hd * 0.4]) {
    if (r.modern) {
      cyl('metal', 0, 3.19, z, 0.008, 0.008, 0.61, brass);
      cyl('metal', 0, 2.94, z, 0.055, 0.055, 0.10, brass);
      shape('glow', new THREE.SphereGeometry(0.26, 20, 12), 0, 2.72, z, new THREE.Vector3(1.18, 0.72, 1.18), srgb('#fff6df'));
    } else {
      cyl('metal', 0, 3.17, z, 0.013, 0.013, 0.68, dark);
      cyl('metal', 0, 2.8, z, 0.11, 0.32, 0.24, brass);
      cyl('glow', 0, 2.675, z, 0.28, 0.28, 0.015, srgb('#ffe2a5'));
    }
  }
  box('plaster', r.dw / 2 + 0.37, 1.27, hd - 0.305, 0.1, 0.16, 0.03, srgb('#d6d3c9'));
  if (!render) return;
  const group = new THREE.Group(); group.position.set(r.cx, r.baseY, r.cz); group.rotation.y = r.rot;
  r.glowMat = MATS.roomGlow.clone(); r.glowMat.emissiveIntensity = r.lit ? 1.5 : 0;
  for (const [kind, b] of bins) {
    const mesh = new THREE.Mesh(b.build(), kind === 'glow' ? r.glowMat : MATS[materials[kind]]); mesh.castShadow = kind !== 'glow' && kind !== 'glass' && kind !== 'shadow'; mesh.receiveShadow = kind !== 'shadow';
    group.add(mesh);
  }
  // Door leaf swings inward from a real hinge. Only these nearby meshes animate.
  const pivot = new THREE.Group(); pivot.position.set(-r.dw / 2, 0.06, hd - 0.15); group.add(pivot);
  const db = new GeoBuilder(), dg = new GeoBuilder(), dm = new GeoBuilder(), frameCol = srgb(r.modern ? '#756e5e' : r.type.color);
  if (r.modern) {
    for (const x of [0.024, r.dw - 0.024]) boxW(db, x, 1.28, 0, 0.048, 2.56, 0.075, 0, frameCol);
    for (const y of [0.03, 2.53]) boxW(db, r.dw / 2, y, 0, r.dw, 0.06, 0.075, 0, frameCol);
    boxW(dg, r.dw / 2, 1.28, 0, r.dw - 0.10, 2.44, 0.012, 0, srgb('#e3eee7'));
  } else {
    for (const x of [0.07, r.dw - 0.07]) boxW(db, x, 1.28, 0, 0.14, 2.56, 0.075, 0, frameCol);
    for (const [y, h] of [[0.17, 0.34], [2.5, 0.13], [0.83, 0.075]]) boxW(db, r.dw / 2, y, 0, r.dw, h, 0.075, 0, frameCol);
    boxW(dg, r.dw / 2, 1.65, 0, r.dw - 0.25, 1.55, 0.012, 0, srgb('#bdd5d4'));
  }
  boxW(dm, r.dw - 0.23, 1.08, 0.065, 0.03, 0.29, 0.035, 0, brass);
  for (const [b, mat] of [[db, MATS.roomTrim], [dg, MATS.roomGlass], [dm, MATS.roomMetal]]) { const m = new THREE.Mesh(b.build(), mat); m.castShadow = mat !== MATS.roomGlass; m.receiveShadow = true; pivot.add(m); }
  pivot.rotation.y = r.angle; r.door = pivot;
  // One tiny shared atlas-free sign texture per visible room, disposed with the room.
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 80;
  const ctx = cv.getContext('2d'); ctx.fillStyle = r.modern ? '#eeede5' : r.type.color; ctx.fillRect(0, 0, 512, 80); ctx.fillStyle = r.modern ? '#40574d' : '#ece4d4';
  ctx.textAlign = 'center'; ctx.font = r.modern ? '500 24px sans-serif' : '26px Georgia, serif'; ctx.fillText(r.type.en, 256, 49);
  const map = new THREE.CanvasTexture(cv); map.colorSpace = THREE.SRGBColorSpace;
  const signMat = new THREE.MeshStandardMaterial({ map, roughness: 0.65, metalness: 0.1 });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(r.w - 0.8, r.modern ? 4.0 : 5.2), r.modern ? 0.40 : 0.68), signMat); sign.position.set(0, r.modern ? 3.78 : 3.18, hd + 0.02); group.add(sign);
  r.extraMaterials = [];
  if (r.type.kind === 'cafe') {
    const menuCanvas = document.createElement('canvas'); menuCanvas.width = 768; menuCanvas.height = 480;
    const mc = menuCanvas.getContext('2d'); mc.fillStyle = r.modern ? '#eeeee4' : '#283e35'; mc.fillRect(0, 0, 768, 480);
    if (!r.modern) { mc.strokeStyle = '#b0a780'; mc.lineWidth = 3; mc.strokeRect(18, 18, 732, 444); }
    mc.textAlign = 'center'; mc.fillStyle = r.modern ? '#456151' : '#e9ddc1'; mc.font = r.modern ? '500 36px sans-serif' : '42px Georgia, serif'; mc.fillText('M A R E A', 384, 80);
    mc.font = '16px sans-serif'; mc.fillText('COFFEE  /  SLOW MORNINGS  /  SEA AIR', 384, 116);
    mc.strokeStyle = '#849078'; mc.beginPath(); mc.moveTo(100, 141); mc.lineTo(668, 141); mc.stroke();
    const rows = [['ESPRESSO', '3.5'], ['FLAT WHITE', '4.8'], ['FILTER OF THE DAY', '4.5'], ['MATCHA LATTE', '5.2'], ['WARM PASTRY', '3.8']];
    mc.font = '24px sans-serif'; rows.forEach(([name, price], i) => { mc.textAlign = 'left'; mc.fillText(name, 108, 198 + i * 45); mc.textAlign = 'right'; mc.fillText(price, 659, 198 + i * 45); });
    const texture = new THREE.CanvasTexture(menuCanvas); texture.colorSpace = THREE.SRGBColorSpace;
    const menuMat = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.87 });
    const menu = new THREE.Mesh(new THREE.PlaneGeometry(2.05, 1.28), menuMat); menu.position.set(0, 2.52, -hd + 0.39); group.add(menu); r.extraMaterials.push(menuMat);
  }
  r.signMat = signMat; r.group = group; scene.add(group); INTERIORS.active.add(r);
}

function buildInteriors() {
  const mat = (map, opts = {}) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, envMapIntensity: 0.42, ...(map ? { map } : {}), ...opts });
  MATS.roomPlaster = mat(TEX.generatedPlaster, { roughness: 0.92 });
  MATS.roomStone = mat(TEX.generatedStone);
  MATS.roomWood = mat(TEX.generatedWood, { roughness: 0.66 });
  MATS.roomTrim = mat(null, { roughness: 0.48 });
  MATS.roomMetal = mat(null, { roughness: 0.36, metalness: 0.7 });
  MATS.roomFabric = mat(null, { roughness: 0.96 });
  MATS.roomGlass = mat(null, { roughness: 0.13, metalness: 0.05, transparent: true, opacity: 0.13, depthWrite: false });
  MATS.roomGlow = mat(null, { emissive: '#ffd599', emissiveIntensity: 1.5 });
  const shadowSize = 64, shadowPixels = new Uint8Array(shadowSize * shadowSize * 4);
  for (let y = 0; y < shadowSize; y++) for (let x = 0; x < shadowSize; x++) {
    const d = Math.hypot((x + 0.5) / shadowSize * 2 - 1, (y + 0.5) / shadowSize * 2 - 1);
    shadowPixels[(y * shadowSize + x) * 4 + 3] = Math.round(Math.pow(Math.max(0, 1 - d), 1.2) * 135);
  }
  const shadowTex = new THREE.DataTexture(shadowPixels, shadowSize, shadowSize, THREE.RGBAFormat); shadowTex.needsUpdate = true; shadowTex.magFilter = THREE.LinearFilter;
  MATS.roomShadow = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, toneMapped: false });
  // A fixed light count avoids shader recompiles as rooms stream in/out.
  const key = new THREE.SpotLight('#ffe0b9', 0, 13, 1.15, 0.7, 2);
  key.castShadow = true; key.shadow.mapSize.set(512, 512); key.shadow.camera.near = 0.15; key.shadow.camera.far = 13; key.shadow.bias = -0.0002; key.shadow.normalBias = 0.018; key.shadow.autoUpdate = false;
  scene.add(key); scene.add(key.target); INTERIORS.lights.push(key);
  const fill = new THREE.PointLight('#ffdfb5', 0, 11, 2); scene.add(fill); INTERIORS.lights.push(fill);
  const prompt = document.createElement('button'); prompt.id = 'interior-interact'; prompt.type = 'button';
  prompt.style.cssText = 'display:none;position:fixed;left:50%;top:62%;transform:translateX(-50%);z-index:18;padding:11px 19px;border:1px solid #ffffff35;border-radius:24px;color:#fff4df;background:#172322de;box-shadow:0 4px 24px #0004;backdrop-filter:blur(12px);font:500 13px system-ui;cursor:pointer;max-width:85vw;white-space:nowrap';
  prompt.addEventListener('click', interactInterior); document.body.appendChild(prompt); INTERIORS.prompt = prompt;
  const showcase = INTERIORS.rooms.filter(r => r.type.kind === 'cafe').sort((a, b) => Math.hypot(a.cx - 20, a.cz - 106) - Math.hypot(b.cx - 20, b.cz - 106))[0];
  if (showcase) {
    const at = interiorWorld(showcase, 1.8, 2.1, showcase.d / 2 + 4.3);
    VIEWS.push({ key: '8', name: '실내 골목', pos: at.toArray(), tgt: showcase.front.toArray() });
  }
  globalThis.__interiors = { rooms: INTERIORS.rooms, state: INTERIORS, walkInfo: interiorWalkInfo, interact: interactInterior,
    visit(id = 0, inside = false) { const r = INTERIORS.rooms[id]; if (!r) return; setMode('walk'); r.open = true; r.angle = 1.48; if (r.door) r.door.rotation.y = r.angle; camera.position.copy(interiorWorld(r, 0, CTRL.eye + 0.05, r.d / 2 + (inside ? -1.2 : 1.8))); CTRL.yaw = r.rot; CTRL.pitch = 0; CTRL.vel.set(0, 0, 0); },
  };
}

// Capsule radius in the horizontal plane. Every query tests exact rotated walls,
// furnishings and the moving door; sub-stepped controls prevent tunnelling.
function interiorWalkInfo(x, z, radius = 0.22) {
  const near = INTERIORS.cells.get(Math.floor(x / 24) + ':' + Math.floor(z / 24));
  if (!near) return null;
  let info = null;
  for (const r of near) {
    const [lx, lz] = interiorLocal(r, x, z);
    if (r.access && lz > r.d / 2 + 0.2 && lz <= r.access.z1 && Math.abs(lx) < r.access.width / 2) {
      const step = r.access.steps.find(s => lz >= s.z0 && lz <= s.z1 + 1e-6);
      if (step) {
        const atRail = r.access.railing && Math.abs(lx) > r.access.width / 2 - 0.065 - radius - 0.025 && lz > r.d / 2 + 0.3 && lz < r.access.z1 - 0.12;
        if (atRail) return { h: step.h, blocked: true, access: r };
        info = { h: step.h, blocked: false, access: r };
      }
    }
    if (Math.abs(lx) > r.w / 2 + radius || Math.abs(lz) > r.d / 2 + radius) continue;
    const inside = Math.abs(lx) < r.w / 2 && Math.abs(lz) < r.d / 2;
    let blocked = false;
    for (const b of r.solids) {
      const dx = lx - b.x, dz = lz - b.z, c = Math.cos(b.rot), s = Math.sin(b.rot);
      const px = dx * c - dz * s, pz = dx * s + dz * c;
      const ox = Math.max(Math.abs(px) - b.w / 2, 0), oz = Math.max(Math.abs(pz) - b.d / 2, 0);
      if (ox * ox + oz * oz < radius * radius) { blocked = true; break; }
    }
    // Leaf centres follow the hinge; the open door retains collision as it swings.
    const dc = Math.cos(r.angle), ds = Math.sin(r.angle), dx = lx + r.dw / 2 - dc * r.dw / 2, dz = lz - (r.d / 2 - 0.15) + ds * r.dw / 2;
    const px = dx * dc - dz * ds, pz = dx * ds + dz * dc;
    if (Math.abs(px) < r.dw / 2 + radius && Math.abs(pz) < 0.045 + radius) blocked = true;
    if (blocked) return { h: r.baseY + 0.05, blocked: true, room: r };
    if (inside) info = { h: r.baseY + 0.05, blocked: false, room: r };
    // Door threshold straddles the coarse grid, so it needs an explicit clear path.
    else if (Math.abs(lx) < r.dw / 2 - radius && lz > r.d / 2 - 0.3) info = { h: r.baseY + 0.05, blocked: false, room: r };
  }
  return info;
}

function leaveInteriorSeat() {
  if (!INTERIORS.seats) return;
  camera.position.copy(INTERIORS.seats.before); INTERIORS.seats = null; CTRL.vel.set(0, 0, 0);
}
function interactInterior() {
  if (CTRL.mode !== 'walk') return;
  if (INTERIORS.seats) { leaveInteriorSeat(); return; }
  const t = INTERIORS.target; if (!t) return;
  if (t.kind === 'door') t.room.open = !t.room.open;
  else if (t.kind === 'light') { t.room.lit = !t.room.lit; if (t.room.glowMat) t.room.glowMat.emissiveIntensity = t.room.lit ? 1.5 : 0; }
  else if (t.kind === 'seat') {
    INTERIORS.seats = { before: camera.position.clone(), seat: t.seat };
    camera.position.copy(t.seat.pos); CTRL.yaw = t.seat.yaw; CTRL.pitch = 0; CTRL.vel.set(0, 0, 0);
  }
}
function updateInteriors(dt) {
  if (!INTERIORS.prompt) return;
  const p = camera.position;
  // Stream only close rooms at street height. Hysteresis avoids doorway pop-in.
  INTERIORS.tick -= dt;
  if (INTERIORS.tick <= 0) {
    INTERIORS.tick = 0.25;
    const candidates = INTERIORS.rooms.filter(r => Math.hypot(r.cx - p.x, r.cz - p.z) < 58 && p.y < r.baseY + 24)
      .sort((a, b) => (a.cx - p.x) ** 2 + (a.cz - p.z) ** 2 - (b.cx - p.x) ** 2 - (b.cz - p.z) ** 2).slice(0, 14);
    const desired = new Set(candidates);
    for (const r of INTERIORS.active) if (!desired.has(r) && (Math.hypot(r.cx - p.x, r.cz - p.z) > 78 || p.y > r.baseY + 30 || INTERIORS.active.size > 20)) {
      scene.remove(r.group); r.group.traverse(n => { if (n.geometry) n.geometry.dispose(); }); r.signMat.map.dispose(); r.signMat.dispose(); r.glowMat.dispose();
      for (const m of r.extraMaterials) { m.map.dispose(); m.dispose(); }
      r.group = null; r.door = null; INTERIORS.active.delete(r);
    }
    const pending = candidates.find(r => !r.group); if (pending) interiorRecipe(pending, true);
  }
  for (const r of INTERIORS.active) { r.angle = lerp(r.angle, r.open ? 1.48 : 0, 1 - Math.exp(-dt * 7)); r.door.rotation.y = r.angle; }
  const wi = interiorWalkInfo(p.x, p.z, 0);
  const current = wi && wi.room;
  for (let i = 0; i < INTERIORS.lights.length; i++) {
    const l = INTERIORS.lights[i]; l.intensity = current && current.lit ? (current.modern ? (i ? 18 : 78) : (i ? 11 : 62)) : 0;
    if (current) {
      l.color.set(current.modern ? '#fff1dc' : (i ? '#ffdfb5' : '#ffe0b9'));
      l.position.copy(interiorWorld(current, 0, 2.66, (i ? 0.4 : -0.42) * current.d / 2));
      if (l.isSpotLight) { l.target.position.copy(interiorWorld(current, 0, 0, -0.1 * current.d)); l.target.updateMatrixWorld(); l.shadow.needsUpdate = current.lit; }
    }
  }
  if (CTRL.mode !== 'walk' || CTRL.trans) { INTERIORS.prompt.style.display = 'none'; INTERIORS.target = null; return; }
  if (INTERIORS.seats) { INTERIORS.prompt.textContent = 'E · 일어나기'; INTERIORS.prompt.style.display = 'block'; return; }
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
  let best = null, score = Infinity;
  const offer = (pos, kind, room, label, seat = null) => {
    const delta = pos.clone().sub(p), distance = delta.length();
    if (distance > 2.5 || distance < 0.01) return;
    // At a closed leaf the camera is only 22 cm away; testing the full 3D
    // direction to a handle below eye level otherwise hides the reopen action.
    if (kind === 'door') delta.y = 0;
    if (delta.lengthSq() > 0.001 && delta.normalize().dot(dir) < 0.2) return;
    // Door candidates are valid from either side; room objects only from within.
    const s = distance + (1 - delta.dot(dir)) * 0.6;
    if (s < score) { score = s; best = { kind, room, label, seat }; }
  };
  for (const r of INTERIORS.active) {
    offer(r.front, 'door', r, r.type.name + ' · 문 ' + (r.open ? '닫기' : '열기'));
    if (current === r) {
      offer(r.switch, 'light', r, '조명 ' + (r.lit ? '끄기' : '켜기'));
      for (const seat of r.seats) offer(seat.pos, 'seat', r, '잠시 앉아 쉬기', seat);
    }
  }
  INTERIORS.target = best;
  INTERIORS.prompt.style.display = best ? 'block' : 'none';
  if (best) INTERIORS.prompt.textContent = (IS_TOUCH ? '터치 · ' : 'E · ') + best.label;
}
