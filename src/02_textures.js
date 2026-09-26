// ============================================================================
// Generated photographic surfaces plus procedural detail and natural textures.
// ============================================================================

const MAX_ANISO = renderer.capabilities.getMaxAnisotropy();

function dataTex(data, w, h, { srgb = false, repeat = true, mips = true, aniso = true } = {}) {
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  t.generateMipmaps = mips;
  if (aniso) t.anisotropy = Math.min(8, MAX_ANISO);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

function normalize01(arr) {
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < arr.length; i++) { if (arr[i] < mn) mn = arr[i]; if (arr[i] > mx) mx = arr[i]; }
  const k = 1 / (mx - mn || 1);
  for (let i = 0; i < arr.length; i++) arr[i] = (arr[i] - mn) * k;
  return arr;
}

// Height array -> RGBA normal map bytes
function heightToNormal(h, w, hgt, strength, out, wrap = true) {
  for (let y = 0; y < hgt; y++) {
    for (let x = 0; x < w; x++) {
      const xl = wrap ? (x - 1 + w) % w : Math.max(0, x - 1), xr = wrap ? (x + 1) % w : Math.min(w - 1, x + 1);
      const yd = wrap ? (y - 1 + hgt) % hgt : Math.max(0, y - 1), yu = wrap ? (y + 1) % hgt : Math.min(hgt - 1, y + 1);
      const dx = (h[y * w + xr] - h[y * w + xl]) * strength;
      const dy = (h[yu * w + x] - h[yd * w + x]) * strength;
      const il = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const i = (y * w + x) * 4;
      out[i] = (-dx * il * 0.5 + 0.5) * 255;
      out[i + 1] = (-dy * il * 0.5 + 0.5) * 255;
      out[i + 2] = (il * 0.5 + 0.5) * 255;
      out[i + 3] = 255;
    }
  }
  return out;
}

// --- 1. general noise: 4 independent tileable fbm channels -------------------
function makeNoiseTexture() {
  const N = 256;
  const chans = [];
  const cfg = [[4, 6, 11], [6, 5, 23], [8, 5, 37], [16, 4, 51]];
  for (const [base, oct, seed] of cfg) {
    const pn = makePeriodicNoise(seed);
    const arr = new Float32Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let s = 0, a = 1, f = base, n = 0;
      for (let o = 0; o < oct; o++) { s += a * pn((x / N) * f, (y / N) * f, f); n += a; a *= 0.5; f *= 2; }
      arr[y * N + x] = s / n;
    }
    chans.push(normalize01(arr));
  }
  const data = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) for (let c = 0; c < 4; c++) data[i * 4 + c] = chans[c][i] * 255;
  const t = dataTex(data, N, N, { aniso: false });
  return t;
}

// --- 2. water ripple normal map ---------------------------------------------
function makeWaterNormals() {
  const N = 512;
  const h = new Float32Array(N * N);
  const pa = makePeriodicNoise(71), pb = makePeriodicNoise(89);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N;
    let s = 0, a = 1, f = 6;
    for (let o = 0; o < 5; o++) {
      // stretched along one axis -> wind-like capillary waves
      s += a * Math.abs(pa(u * f, v * f * 0.6, f)) * -1;
      s += a * 0.6 * pb(u * f * 1.3, v * f * 1.3, Math.round(f * 1.3));
      a *= 0.52; f *= 2;
    }
    h[y * N + x] = s;
  }
  normalize01(h);
  const data = new Uint8Array(N * N * 4);
  heightToNormal(h, N, N, 5.0, data);
  for (let i = 0; i < N * N; i++) data[i * 4 + 3] = h[i] * 255;
  return dataTex(data, N, N);
}

// --- 3. 3D Perlin-Worley noise for volumetric clouds -------------------------
function makeCloudNoise3D() {
  const N = 64;
  const data = new Uint8Array(N * N * N);
  const r = mulberry32(99);
  const feats = {};
  function featGrid(f) {
    if (feats[f]) return feats[f];
    const g = new Float32Array(f * f * f * 3);
    for (let i = 0; i < g.length; i++) g[i] = r();
    return (feats[f] = g);
  }
  function worley(x, y, z, f) {
    const g = featGrid(f);
    const px = x * f, py = y * f, pz = z * f;
    const cx = Math.floor(px), cy = Math.floor(py), cz = Math.floor(pz);
    let md = 9;
    for (let k = -1; k <= 1; k++) for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const ix = cx + i, iy = cy + j, iz = cz + k;
      const wx = ((ix % f) + f) % f, wy = ((iy % f) + f) % f, wz = ((iz % f) + f) % f;
      const gi = ((wz * f + wy) * f + wx) * 3;
      const dx = ix + g[gi] - px, dy = iy + g[gi + 1] - py, dz = iz + g[gi + 2] - pz;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < md) md = d;
    }
    return Math.sqrt(md);
  }
  // periodic 3D value noise
  const vr = new Float32Array(32 * 32 * 32);
  for (let i = 0; i < vr.length; i++) vr[i] = r();
  function vnoise(x, y, z, f) {
    const px = x * f, py = y * f, pz = z * f;
    const ix = Math.floor(px), iy = Math.floor(py), iz = Math.floor(pz);
    const fx = px - ix, fy = py - iy, fz = pz - iz;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy), uz = fz * fz * (3 - 2 * fz);
    const at = (a, b, c) => vr[((((c % f) + f) % f) * 32 + (((b % f) + f) % f)) * 32 + (((a % f) + f) % f)];
    const l = (a, b, t) => a + (b - a) * t;
    return l(
      l(l(at(ix, iy, iz), at(ix + 1, iy, iz), ux), l(at(ix, iy + 1, iz), at(ix + 1, iy + 1, iz), ux), uy),
      l(l(at(ix, iy, iz + 1), at(ix + 1, iy, iz + 1), ux), l(at(ix, iy + 1, iz + 1), at(ix + 1, iy + 1, iz + 1), ux), uy),
      uz);
  }
  for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N, w = z / N;
    const wf = (1 - worley(u, v, w, 4)) * 0.625 + (1 - worley(u, v, w, 8)) * 0.25 + (1 - worley(u, v, w, 16)) * 0.125;
    const pf = vnoise(u, v, w, 4) * 0.55 + vnoise(u, v, w, 8) * 0.3 + vnoise(u, v, w, 16) * 0.15;
    // Perlin-Worley remap
    let pw = clamp((pf - (wf - 1)) / (1 - (wf - 1)) , 0, 1);
    pw = clamp((pw - 0.55) / 0.45, 0, 1);
    const val = clamp(pw * 0.55 + wf * 0.45, 0, 1);
    data[(z * N + y) * N + x] = val * 255;
  }
  const t = new THREE.Data3DTexture(data, N, N, N);
  t.format = THREE.RedFormat;
  t.type = THREE.UnsignedByteType;
  t.wrapS = t.wrapT = t.wrapR = THREE.RepeatWrapping;
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.unpackAlignment = 1;
  t.needsUpdate = true;
  return t;
}

// --- 4. cobblestone paving: albedo, normal, ORM ------------------------------
function makeCobbles() {
  const N = 512, C = 9; // C x C stones per tile (tile = 2.7 m)
  const r = mulberry32(7);
  const fp = [];
  for (let j = 0; j < C; j++) for (let i = 0; i < C; i++) {
    // row-staggered stones, slightly elongated
    fp.push([(i + 0.5 + (j % 2) * 0.5 + (r() - 0.5) * 0.35) / C, (j + 0.5 + (r() - 0.5) * 0.25) / C, r(), r()]);
  }
  const h = new Float32Array(N * N);
  const alb = new Uint8Array(N * N * 4), orm = new Uint8Array(N * N * 4);
  const pn = makePeriodicNoise(5);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N;
    let d1 = 9, d2 = 9, id = 0;
    const ci = Math.floor(u * C), cj = Math.floor(v * C);
    for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
      const ii = (((ci + di) % C) + C) % C, jj = (((cj + dj) % C) + C) % C;
      const f = fp[jj * C + ii];
      let fx = f[0] + Math.floor((ci + di) / C) + 0, fy = f[1] + Math.floor((cj + dj) / C);
      // wrap offsets
      fx = f[0] + (ci + di - ii) / C; fy = f[1] + (cj + dj - jj) / C;
      const dx = (fx - u) * 1.0, dy = (fy - v) * 1.25;
      const d = dx * dx + dy * dy;
      if (d < d1) { d2 = d1; d1 = d; id = jj * C + ii; } else if (d < d2) d2 = d;
    }
    const edge = (Math.sqrt(d2) - Math.sqrt(d1)) * C; // 0 at borders
    const f = fp[id];
    const grain = pn(u * 64, v * 64, 64) * 0.5 + pn(u * 128, v * 128, 128) * 0.3;
    const dome = smoothstep(0.006, 0.16, edge);
    const height = dome * (0.8 + 0.2 * f[2]) + grain * 0.04 * dome;
    h[y * N + x] = height;
    const i = (y * N + x) * 4;
    // stone tones: grey granite, warm sandstone, a few dark basalt
    let cr, cg, cb;
    const t = f[2];
    if (t < 0.55) { cr = 150; cg = 146; cb = 140; } else if (t < 0.85) { cr = 168; cg = 150; cb = 122; } else { cr = 105; cg = 104; cb = 104; }
    const lv = 0.82 + f[3] * 0.3 + grain * 0.25;
    const gap = 1 - dome;
    cr = lerp(cr * lv, 108, gap * 0.4); cg = lerp(cg * lv, 102, gap * 0.4); cb = lerp(cb * lv, 92, gap * 0.4);
    alb[i] = clamp(cr, 0, 255); alb[i + 1] = clamp(cg, 0, 255); alb[i + 2] = clamp(cb, 0, 255); alb[i + 3] = 255;
    orm[i] = (0.55 + 0.45 * dome) * 255;             // AO
    orm[i + 1] = (0.62 + 0.3 * gap + (1 - f[3]) * 0.08) * 255; // roughness
    orm[i + 2] = 0; orm[i + 3] = 255;
  }
  const nrm = heightToNormal(h, N, N, 2.2, new Uint8Array(N * N * 4));
  return { map: dataTex(alb, N, N, { srgb: true }), normalMap: dataTex(nrm, N, N), orm: dataTex(orm, N, N) };
}

// --- 5. flagstones (sidewalks, plaza, promenade) -----------------------------
function makeFlagstones() {
  const N = 512, R = 4;
  const r = mulberry32(17);
  const h = new Float32Array(N * N);
  const alb = new Uint8Array(N * N * 4), orm = new Uint8Array(N * N * 4);
  const pn = makePeriodicNoise(33);
  const rows = [];
  for (let j = 0; j < R; j++) {
    const cuts = [0];
    let s = 0; const n = 3 + (j % 2);
    for (let k = 1; k < n; k++) { s = k / n + (r() - 0.5) * 0.08; cuts.push(s); }
    cuts.push(1);
    rows.push({ off: r(), cuts, tones: cuts.map(() => [r(), r()]) });
  }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N;
    const j = Math.floor(v * R), fy = v * R - j;
    const row = rows[j];
    const uu = (u + row.off) % 1;
    let k = 0; while (k < row.cuts.length - 2 && uu > row.cuts[k + 1]) k++;
    const fx0 = (uu - row.cuts[k]) * R, fx1 = (row.cuts[k + 1] - uu) * R;
    const ex = Math.min(fx0, fx1), ey = Math.min(fy, 1 - fy);
    const e = Math.min(ex, ey);
    const grain = pn(u * 48, v * 48, 48) * 0.6 + pn(u * 160, v * 160, 160) * 0.4;
    const slab = smoothstep(0.004, 0.03, e);
    h[y * N + x] = slab * 0.7 + grain * 0.03 + (row.tones[k][0] - 0.5) * 0.05 * slab;
    const tone = row.tones[k];
    const lv = 0.86 + tone[1] * 0.22 + grain * 0.18;
    let cr = 176, cg = 168, cb = 154;
    if (tone[0] > 0.7) { cr = 186; cg = 172; cb = 150; }
    if (tone[0] < 0.15) { cr = 150; cg = 148; cb = 144; }
    const gap = 1 - slab;
    const i = (y * N + x) * 4;
    alb[i] = clamp(lerp(cr * lv, 82, gap), 0, 255);
    alb[i + 1] = clamp(lerp(cg * lv, 78, gap), 0, 255);
    alb[i + 2] = clamp(lerp(cb * lv, 70, gap), 0, 255);
    alb[i + 3] = 255;
    orm[i] = (0.7 + 0.3 * slab) * 255;
    orm[i + 1] = (0.7 + 0.25 * gap - grain * 0.1) * 255;
    orm[i + 2] = 0; orm[i + 3] = 255;
  }
  const nrm = heightToNormal(h, N, N, 4.0, new Uint8Array(N * N * 4));
  return { map: dataTex(alb, N, N, { srgb: true }), normalMap: dataTex(nrm, N, N), orm: dataTex(orm, N, N) };
}

// --- 6. bark -----------------------------------------------------------------
function makeBark() {
  const W = 256, H = 512;
  const h = new Float32Array(W * H);
  const alb = new Uint8Array(W * H * 4);
  const pa = makePeriodicNoise(61), pb = makePeriodicNoise(62);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / H;
    const f = Math.abs(pa(u * 10, v * 3, 10) + 0.5 * pa(u * 20, v * 6, 20));
    const ridge = 1 - smoothstep(0.0, 0.35, f);
    const fine = pb(u * 40, v * 40, 40);
    h[y * W + x] = (1 - ridge) * 0.8 + fine * 0.1;
    const i = (y * W + x) * 4;
    const lv = 0.7 + (1 - ridge) * 0.35 + fine * 0.15;
    const lichen = smoothstep(0.35, 0.6, pb(u * 6 + 0.3, v * 6, 6)) * 0.35;
    alb[i] = clamp((92 + lichen * 40) * lv, 0, 255);
    alb[i + 1] = clamp((80 + lichen * 60) * lv, 0, 255);
    alb[i + 2] = clamp((68 + lichen * 10) * lv, 0, 255);
    alb[i + 3] = 255;
  }
  const nrm = heightToNormal(h, W, H, 5.0, new Uint8Array(W * H * 4));
  return { map: dataTex(alb, W, H, { srgb: true }), normalMap: dataTex(nrm, W, H) };
}

// --- 7. wood planks ----------------------------------------------------------
function makeWood() {
  const N = 256, P = 4;
  const h = new Float32Array(N * N);
  const alb = new Uint8Array(N * N * 4);
  const pa = makePeriodicNoise(81);
  const r = mulberry32(3);
  const tones = Array.from({ length: P }, () => [0.8 + r() * 0.35, r()]);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N;
    const p = Math.floor(v * P), fv = v * P - p;
    const gap = smoothstep(0.0, 0.05, Math.min(fv, 1 - fv));
    const grain = pa(u * 2 + tones[p][1] * 7, v * 60, 60) * 0.5 + pa(u * 8, v * 120 + p * 3, 120) * 0.25;
    h[y * N + x] = gap * 0.6 + grain * 0.05;
    const lv = tones[p][0] * (0.9 + grain * 0.3);
    const i = (y * N + x) * 4;
    alb[i] = clamp(lerp(46, 132 * lv, gap), 0, 255);
    alb[i + 1] = clamp(lerp(36, 98 * lv, gap), 0, 255);
    alb[i + 2] = clamp(lerp(28, 70 * lv, gap), 0, 255);
    alb[i + 3] = 255;
  }
  const nrm = heightToNormal(h, N, N, 3.0, new Uint8Array(N * N * 4));
  return { map: dataTex(alb, N, N, { srgb: true }), normalMap: dataTex(nrm, N, N) };
}

// --- canvas helpers for alpha sprites ---------------------------------------
function canvasCtx(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c.getContext('2d', { willReadFrequently: true });
}
// Convert canvas to DataTexture while bleeding colour into transparent texels
// (prevents dark fringes in mipmaps of alpha-tested foliage)
function spriteTex(ctx, { srgb = true } = {}) {
  const { width: w, height: h } = ctx.canvas;
  const img = ctx.getImageData(0, 0, w, h);
  const d = new Uint8Array(img.data.buffer.slice(0));
  let ar = 0, ag = 0, ab = 0, n = 0;
  for (let i = 0; i < w * h; i++) if (d[i * 4 + 3] > 128) { ar += d[i * 4]; ag += d[i * 4 + 1]; ab += d[i * 4 + 2]; n++; }
  ar /= n || 1; ag /= n || 1; ab /= n || 1;
  // two dilation passes then average fill
  for (let pass = 0; pass < 3; pass++) {
    const src = d.slice(0);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (src[i + 3] > 20) continue;
      let r = 0, g = 0, b = 0, c = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const j = (yy * w + xx) * 4;
        if (src[j + 3] > 20) { r += src[j]; g += src[j + 1]; b += src[j + 2]; c++; }
      }
      if (c) { d[i] = r / c; d[i + 1] = g / c; d[i + 2] = b / c; d[i + 3] = Math.max(d[i + 3], 21); }
    }
  }
  for (let i = 0; i < w * h; i++) {
    if (d[i * 4 + 3] <= 21) {
      if (d[i * 4 + 3] < 21) { d[i * 4] = ar; d[i * 4 + 1] = ag; d[i * 4 + 2] = ab; }
      d[i * 4 + 3] = 0;
    }
  }
  const t = dataTex(d, w, h, { srgb, repeat: false });
  t.flipY = false;
  return t;
}

function drawLeaf(ctx, x, y, ang, len, wid, fill, vein) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(ang);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(len * 0.35, -wid, len, 0);
  ctx.quadraticCurveTo(len * 0.35, wid, 0, 0);
  ctx.fillStyle = fill; ctx.fill();
  ctx.strokeStyle = vein; ctx.lineWidth = Math.max(0.6, wid * 0.12);
  ctx.beginPath(); ctx.moveTo(len * 0.05, 0); ctx.lineTo(len * 0.85, 0); ctx.stroke();
  ctx.restore();
}

// --- 8. broadleaf cluster ----------------------------------------------------
function makeLeafCluster(seed, palette, leaves = 110, size = 512, leafLen = [34, 62]) {
  const ctx = canvasCtx(size, size);
  const r = mulberry32(seed);
  const c = size / 2;
  // twigs
  ctx.strokeStyle = '#4a3a2a'; ctx.lineCap = 'round';
  for (let i = 0; i < 7; i++) {
    const a = r() * TAU; const l = size * (0.25 + r() * 0.2);
    ctx.lineWidth = 2 + r() * 2;
    ctx.beginPath(); ctx.moveTo(c, c); ctx.quadraticCurveTo(c + Math.cos(a + 0.3) * l * 0.5, c + Math.sin(a + 0.3) * l * 0.5, c + Math.cos(a) * l, c + Math.sin(a) * l); ctx.stroke();
  }
  for (let i = 0; i < leaves; i++) {
    const rad = Math.pow(r(), 0.6) * size * 0.42;
    const a = r() * TAU;
    const x = c + Math.cos(a) * rad, y = c + Math.sin(a) * rad;
    const ang = a + (r() - 0.5) * 1.6;
    const len = leafLen[0] + r() * (leafLen[1] - leafLen[0]);
    const col = palette[Math.floor(r() * palette.length)];
    const l = 0.8 + r() * 0.4;
    const fill = `rgb(${Math.min(255, col[0] * l) | 0},${Math.min(255, col[1] * l) | 0},${Math.min(255, col[2] * l) | 0})`;
    const vein = `rgba(${Math.min(255, col[0] * l * 1.35) | 0},${Math.min(255, col[1] * l * 1.3) | 0},${Math.min(255, col[2] * l * 1.2) | 0},0.7)`;
    drawLeaf(ctx, x, y, ang, len, len * (0.32 + r() * 0.12), fill, vein);
  }
  return spriteTex(ctx);
}

// --- 9. cherry blossom cluster -----------------------------------------------
function makeBlossomCluster(seed) {
  const S = 512;
  const ctx = canvasCtx(S, S);
  const r = mulberry32(seed);
  const c = S / 2;
  ctx.strokeStyle = '#3d2a24'; ctx.lineCap = 'round';
  const tips = [];
  for (let i = 0; i < 8; i++) {
    const a = r() * TAU; const l = S * (0.2 + r() * 0.24);
    ctx.lineWidth = 2 + r() * 2.5;
    const ex = c + Math.cos(a) * l, ey = c + Math.sin(a) * l;
    ctx.beginPath(); ctx.moveTo(c, c); ctx.quadraticCurveTo(c + Math.cos(a + 0.4) * l * 0.5, c + Math.sin(a + 0.4) * l * 0.5, ex, ey); ctx.stroke();
    tips.push([ex, ey]);
  }
  // a few young leaves
  for (let i = 0; i < 22; i++) {
    const rad = Math.pow(r(), 0.6) * S * 0.4, a = r() * TAU;
    drawLeaf(ctx, c + Math.cos(a) * rad, c + Math.sin(a) * rad, a, 22 + r() * 14, 9, `rgb(${110 + r() * 30 | 0},${130 + r() * 30 | 0},${60 | 0})`, 'rgba(160,180,90,0.6)');
  }
  const pinks = [[255, 205, 222], [252, 184, 206], [255, 226, 236], [246, 170, 196], [255, 240, 244]];
  for (let i = 0; i < 170; i++) {
    const rad = Math.pow(r(), 0.55) * S * 0.43, a = r() * TAU;
    const x = c + Math.cos(a) * rad, y = c + Math.sin(a) * rad;
    const rr2 = 7 + r() * 8;
    const col = pinks[Math.floor(r() * pinks.length)];
    const rot = r() * TAU;
    for (let p = 0; p < 5; p++) {
      const pa = rot + p * TAU / 5;
      ctx.save(); ctx.translate(x + Math.cos(pa) * rr2 * 0.55, y + Math.sin(pa) * rr2 * 0.55); ctx.rotate(pa);
      ctx.beginPath(); ctx.ellipse(0, 0, rr2 * 0.62, rr2 * 0.42, 0, 0, TAU);
      const l = 0.9 + r() * 0.12;
      ctx.fillStyle = `rgb(${Math.min(255, col[0] * l) | 0},${Math.min(255, col[1] * l) | 0},${Math.min(255, col[2] * l) | 0})`;
      ctx.fill(); ctx.restore();
    }
    ctx.beginPath(); ctx.arc(x, y, rr2 * 0.22, 0, TAU); ctx.fillStyle = '#c0506e'; ctx.fill();
  }
  return spriteTex(ctx);
}

// --- 10. conifer branch -------------------------------------------------------
function makeConiferBranch(seed) {
  const W = 512, H = 256;
  const ctx = canvasCtx(W, H);
  const r = mulberry32(seed);
  const greens = [[38, 64, 34], [48, 78, 40], [30, 54, 30], [58, 86, 46]];
  function twig(x0, y0, ang, len, depth) {
    const x1 = x0 + Math.cos(ang) * len, y1 = y0 + Math.sin(ang) * len;
    ctx.strokeStyle = '#3b2f22'; ctx.lineWidth = depth === 0 ? 3 : 1.5;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    const n = Math.floor(len / 2.2);
    for (let i = 0; i < n; i++) {
      const t = i / n; const px = x0 + (x1 - x0) * t, py = y0 + (y1 - y0) * t;
      const nl = (depth === 0 ? 26 : 19) * (1 - t * 0.45) * (0.8 + r() * 0.4);
      for (const side of [-1, 1]) {
        const na = ang + side * (0.9 + r() * 0.4);
        const col = greens[Math.floor(r() * greens.length)];
        ctx.strokeStyle = `rgb(${col[0]},${col[1]},${col[2]})`; ctx.lineWidth = 2.6;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(na) * nl, py + Math.sin(na) * nl); ctx.stroke();
      }
    }
    if (depth < 1) {
      for (let i = 1; i < 9; i++) {
        const t = i / 9;
        const px = x0 + (x1 - x0) * t, py = y0 + (y1 - y0) * t;
        twig(px, py, ang + (i % 2 ? 0.7 : -0.7) + (r() - 0.5) * 0.3, len * (0.45 - t * 0.25), depth + 1);
      }
    }
  }
  twig(8, H / 2, 0, W - 40, 0);
  return spriteTex(ctx);
}

// --- 11. flower atlas (4 types) ----------------------------------------------
function makeFlowerAtlas() {
  const S = 128;
  const ctx = canvasCtx(S * 4, S);
  const r = mulberry32(5);
  // daisy
  let cx = S * 0.5, cy = S * 0.5;
  for (let p = 0; p < 16; p++) {
    const a = p * TAU / 16; ctx.save(); ctx.translate(cx + Math.cos(a) * 22, cy + Math.sin(a) * 22); ctx.rotate(a);
    ctx.beginPath(); ctx.ellipse(0, 0, 20, 6, 0, 0, TAU); ctx.fillStyle = `rgb(${245 + r() * 10 | 0},${244},${236})`; ctx.fill(); ctx.restore();
  }
  ctx.beginPath(); ctx.arc(cx, cy, 11, 0, TAU); ctx.fillStyle = '#e8b52a'; ctx.fill();
  // poppy
  cx = S * 1.5;
  for (let p = 0; p < 5; p++) {
    const a = p * TAU / 5 + 0.3; ctx.beginPath(); ctx.ellipse(cx + Math.cos(a) * 18, cy + Math.sin(a) * 18, 26, 22, a, 0, TAU);
    ctx.fillStyle = p % 2 ? '#d8352a' : '#e5432f'; ctx.fill();
  }
  ctx.beginPath(); ctx.arc(cx, cy, 9, 0, TAU); ctx.fillStyle = '#2a1a1a'; ctx.fill();
  // cornflower (blue, spiky)
  cx = S * 2.5;
  for (let p = 0; p < 14; p++) {
    const a = p * TAU / 14; ctx.save(); ctx.translate(cx + Math.cos(a) * 20, cy + Math.sin(a) * 20); ctx.rotate(a);
    ctx.beginPath(); ctx.moveTo(-14, -6); ctx.lineTo(16, -8); ctx.lineTo(12, 0); ctx.lineTo(16, 8); ctx.lineTo(-14, 6); ctx.closePath();
    ctx.fillStyle = p % 2 ? '#4b62d8' : '#5b74e6'; ctx.fill(); ctx.restore();
  }
  ctx.beginPath(); ctx.arc(cx, cy, 10, 0, TAU); ctx.fillStyle = '#2d2f7a'; ctx.fill();
  // buttercup / tulip-like yellow cup
  cx = S * 3.5;
  for (let p = 0; p < 6; p++) {
    const a = p * TAU / 6; ctx.beginPath(); ctx.ellipse(cx + Math.cos(a) * 16, cy + Math.sin(a) * 16, 22, 17, a, 0, TAU);
    ctx.fillStyle = p % 2 ? '#f2c230' : '#f7d24a'; ctx.fill();
  }
  ctx.beginPath(); ctx.arc(cx, cy, 8, 0, TAU); ctx.fillStyle = '#d99a1c'; ctx.fill();
  return spriteTex(ctx);
}

// --- 12. iron railing --------------------------------------------------------
function makeRailing() {
  const W = 256, H = 128;
  const ctx = canvasCtx(W, H);
  ctx.fillStyle = '#1d211f';
  ctx.fillRect(0, 2, W, 9);        // top rail
  ctx.fillRect(0, H - 12, W, 7);   // bottom rail
  for (let x = 8; x < W; x += 16) ctx.fillRect(x - 2, 6, 4, H - 14);
  ctx.strokeStyle = '#1d211f'; ctx.lineWidth = 3;
  for (let x = 16; x < W; x += 32) { ctx.beginPath(); ctx.arc(x, 26, 7, 0, TAU); ctx.stroke(); }
  return spriteTex(ctx, { srgb: true });
}

// --- 13. soft round sprite (glows, petals, droplets) -------------------------
function makeGlowSprite() {
  const S = 64;
  const ctx = canvasCtx(S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(ctx.canvas);
  return t;
}

const TEX = {};
const MATERIAL_ASSETS = /*MATERIAL_ASSETS*/ {};

// Colour images are albedo, not measured scan data. Subtle derived relief is
// deliberately shallow; it must not turn every grain into an embossed tile.
async function loadPhotographicSurfaces() {
  const loader = new THREE.TextureLoader();
  const specs = [
    ['generatedStone', 'stone', 'aged-limestone-paving-albedo.jpg'],
    ['generatedPlaster', 'plaster', 'warm-lime-plaster-albedo.jpg'],
    ['generatedWood', 'wood', 'aged-oak-planks-albedo.jpg'],
  ];
  TEX.assetStatus = {};
  await Promise.all(specs.map(async ([key, asset, name]) => {
    try {
      const url = MATERIAL_ASSETS[asset] || `./assets/materials/${name}`;
      const tex = await Promise.race([
        loader.loadAsync(url),
        new Promise((_, reject) => setTimeout(() => reject(new Error('texture timeout')), 15000)),
      ]);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = tex.wrapT = THREE.MirroredRepeatWrapping;
      tex.anisotropy = Math.min(16, MAX_ANISO);
      TEX[key] = tex;
      TEX.assetStatus[asset] = 'loaded';
    } catch (error) {
      TEX.assetStatus[asset] = 'fallback';
      console.warn(`Surface ${asset} unavailable; using local procedural material.`, error.message);
    }
  }));
  if (TEX.generatedStone) {
    TEX.flag = { map: TEX.generatedStone, normalMap: null, orm: null };
  }
  if (TEX.generatedWood) TEX.wood = { map: TEX.generatedWood, normalMap: null };
}

async function buildTextures() {
  TEX.noise = makeNoiseTexture();
  G.uNoise.value = TEX.noise;
  TEX.water = makeWaterNormals();
  TEX.cloud3d = makeCloudNoise3D();
  TEX.cobble = makeCobbles();
  TEX.flag = makeFlagstones();
  TEX.bark = makeBark();
  TEX.wood = makeWood();
  TEX.leafA = makeLeafCluster(11, [[62, 96, 34], [78, 112, 40], [52, 84, 30], [96, 124, 48], [70, 104, 38]]);
  TEX.leafB = makeLeafCluster(12, [[84, 108, 40], [106, 126, 50], [70, 96, 36], [120, 132, 56]], 120);
  TEX.leafSmall = makeLeafCluster(13, [[46, 78, 30], [58, 90, 34], [40, 70, 28], [70, 100, 40]], 170, 256, [14, 26]);
  TEX.blossom = makeBlossomCluster(21);
  TEX.conifer = makeConiferBranch(31);
  TEX.flowers = makeFlowerAtlas();
  TEX.railing = makeRailing();
  TEX.glow = makeGlowSprite();
  await loadPhotographicSurfaces();
}
