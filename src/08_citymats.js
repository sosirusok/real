// ============================================================================
// City materials: procedural facades (recessed windows with interior
// mapping, shutters, plinths, quoins), roof tiles, ashlar stone, paving,
// generic props (vertex colour + roughness/metal/emissive), railings, wood.
// ============================================================================

// tangent frame from a world normal (u along a horizontal, v "up" the face)
const GLSL_FRAME = /* glsl */ `
  void faceFrame(vec3 N, out vec3 T, out vec3 B) {
    vec3 up = vec3(0.0, 1.0, 0.0);
    vec3 c = cross(up, N);
    T = dot(c, c) < 1e-4 ? vec3(1.0, 0.0, 0.0) : normalize(c);
    B = cross(N, T);
  }
`;

const FACADE_FRAG = /* glsl */ `
  varying vec2 vUvM;
  varying vec4 vF;
  varying vec4 vS;
  varying vec3 vNW;
  vec3 fAlb; float fRough; vec3 fNT; vec3 fEmis;
  ${GLSL_FRAME}
  float sdBox(vec2 p, vec2 b) { vec2 d = abs(p) - b; return max(d.x, d.y); }

  vec3 roomColor(vec2 qg, vec3 Vt, vec2 room0, vec2 room1, float depthR, float rs, float lit, float shop) {
    vec3 o = vec3(qg, 0.0);
    vec3 d = normalize(vec3(-Vt.x, -Vt.y, max(Vt.z, 0.05)));
    float tx = ((d.x > 0.0 ? room1.x : room0.x) - o.x) / d.x;
    float ty = ((d.y > 0.0 ? room1.y : room0.y) - o.y) / d.y;
    float tz = depthR / d.z;
    float t = min(min(tx, ty), tz);
    vec3 h = o + d * t;
    vec3 wallp = mix(vec3(0.62, 0.55, 0.45), vec3(0.45, 0.52, 0.48), step(0.6, rs));
    wallp = mix(wallp, vec3(0.7, 0.62, 0.55), step(0.85, rs));
    vec3 base;
    float lampK = 1.0;
    if (t == tz) {
      base = wallp;
      // furniture silhouettes against the back wall
      float fx = h.x - (rs - 0.5) * 1.2;
      if (h.y < room0.y + 0.85 && abs(fx) < 0.8) base = mix(vec3(0.22, 0.16, 0.12), vec3(0.35, 0.3, 0.42), step(0.5, fract(rs * 7.3)));
      if (shop > 0.5 && fract((h.y - room0.y) / 0.55) < 0.12) base *= 0.5;
      if (shop > 0.5) base = mix(base, vec3(0.8, 0.55, 0.35) * (0.6 + 0.8 * hash12(floor(h.xy * 3.0))), step(0.12, fract((h.y - room0.y) / 0.55)) * step(room0.y + 0.4, h.y));
      // picture frame
      if (shop < 0.5 && abs(fx + 0.2) < 0.35 && abs(h.y - room0.y - 1.6) < 0.25) base = vec3(0.7, 0.62, 0.4);
    } else if (t == tx) {
      base = wallp * 0.85;
    } else if (d.y < 0.0) {
      base = mix(vec3(0.34, 0.22, 0.13), vec3(0.45, 0.32, 0.2), step(0.5, fract(h.z * 3.0 + h.x * 0.3)));
    } else {
      base = vec3(0.78, 0.76, 0.72);
      lampK = 1.3;
    }
    float depthF = clamp(h.z / depthR, 0.0, 1.0);
    vec3 dayL = (uZenith * 0.7 + uHorizon * 0.5 + vec3(0.02)) * uDay * (0.55 - depthF * 0.3);
    vec2 lampP = vec2((room0.x + room1.x) * 0.5, room1.y - 0.3);
    float ld = length(vec3(h.xy - lampP, h.z - depthR * 0.5));
    vec3 lampC = mix(vec3(1.0, 0.68, 0.38), vec3(1.0, 0.82, 0.62), step(0.7, fract(rs * 13.1)));
    vec3 lampL = lampC * lit * (2.2 / (1.0 + ld * ld * 0.35)) * lampK;
    // occasional TV glow
    if (fract(rs * 31.7) > 0.93) lampL += vec3(0.25, 0.35, 0.6) * lit * (0.6 + 0.4 * sin(uTime * 7.0 + rs * 20.0) * sin(uTime * 3.1));
    if (shop > 0.5) lampL = vec3(1.0, 0.8, 0.55) * (1.6 * uNight + 0.5) * (1.0 - depthF * 0.4);
    return base * (dayL + lampL);
  }

  void facade() {
    float seed = vF.x, fh = vF.y, nfl = vF.z, W = vF.w;
    float gType = vS.x, shutI = vS.y, wStyle = vS.z, flags = vS.w;
    bool party = mod(flags, 2.0) > 0.5;
    bool quoins = mod(floor(flags / 2.0), 2.0) > 0.5;
    float balMode = mod(floor(flags / 4.0), 4.0);
    vec2 p = vUvM;
    vec3 N = normalize(vNW);
    vec3 T, B;
    faceFrame(N, T, B);
    vec3 V = normalize(cameraPosition - vWPos);
    vec3 Vt = vec3(dot(V, T), dot(V, B), dot(V, N));
    float gh = 4.2;
    float topY = gh + (nfl - 1.0) * fh;
    vec3 wallC = vColor.rgb;
    vec3 trimC = vec3(0.86, 0.82, 0.74);
    float n1 = texture2D(uNoise, (p + seed * 37.0) * vec2(0.07, 0.05)).r;
    float n2 = texture2D(uNoise, (p + seed * 11.0) * 0.8).b;
    float n3 = texture2D(uNoise, p * 3.3).a;
    vec3 alb = wallC * (0.84 + 0.3 * n1) * (0.94 + 0.12 * n2);
    float rough = 0.88;
    vec3 nt = vec3((n3 - 0.5) * 0.14, (n2 - 0.5) * 0.1, 1.0);
    vec3 emis = vec3(0.0);
    float ao = 1.0;
    alb *= mix(0.7, 1.0, smoothstep(-0.2, 1.8, p.y + n1 * 0.6));
    // soft darkening below the roof line
    ao *= mix(0.78, 1.0, smoothstep(0.0, 0.9, topY - p.y + 0.3));

    // stone plinth
    if (p.y < 0.72) {
      float row = floor(p.y / 0.36);
      float bx = fract(p.x / 0.9 + row * 0.5);
      float by = fract(p.y / 0.36);
      float m = min(min(bx, 1.0 - bx) * 0.9, min(by, 1.0 - by) * 0.36);
      float hb = hash12(vec2(floor(p.x / 0.9 + row * 0.5), row) + seed);
      alb = vec3(0.52, 0.49, 0.44) * (0.8 + 0.3 * hb) * (0.9 + 0.2 * n2);
      alb = mix(alb * 0.55, alb, smoothstep(0.0, 0.025, m));
      nt = vec3(0.0, 0.0, 1.0) + vec3((bx - 0.5) * 0.4, (by - 0.5) * 0.4, 0.0) * (1.0 - smoothstep(0.0, 0.06, m));
      rough = 0.85;
    }
    // quoins on the corners
    if (quoins && p.y > 0.72 && p.y < topY) {
      float rowq = floor((p.y - 0.72) / 0.45);
      float qw = mod(rowq, 2.0) < 0.5 ? 0.9 : 0.55;
      float dx = min(p.x, W - p.x);
      if (dx < qw) {
        float by = fract((p.y - 0.72) / 0.45);
        alb = trimC * (0.86 + 0.14 * n2);
        float m = min(min(by, 1.0 - by) * 0.45, qw - dx);
        alb = mix(alb * 0.6, alb, smoothstep(0.0, 0.03, m));
        rough = 0.75;
      }
    }
    // string course between floors
    if (wStyle > 0.5 && p.y > gh - 0.25 && p.y < topY) {
      float fy = mod(p.y - gh + 0.25, fh);
      if (fy < 0.25) { alb = trimC * (0.9 + 0.1 * n2); nt = vec3(0.0, (fy - 0.125) * 5.0, 1.0); rough = 0.7; }
    }

    if (!party && p.y < topY - 0.25 && p.y > 0.0) {
      float nb = max(1.0, floor(W / 3.1 + 0.3));
      float bw = W / nb;
      float bi = floor(p.x / bw);
      float cx = (fract(p.x / bw) - 0.5) * bw;
      bool ground = p.y < gh;
      float fi = ground ? 0.0 : floor((p.y - gh) / fh) + 1.0;
      float fy = ground ? p.y : p.y - gh - (fi - 1.0) * fh;
      float rs = hash12(vec2(bi, fi) + seed * 13.1);
      bool shop = ground && gType > 0.5 && gType < 1.5;
      bool door = ground && !shop && bi == floor(nb * 0.5);
      bool balc = !ground && ((balMode == 1.0) || (balMode == 2.0 && bi == floor(nb * 0.5)) || (balMode == 3.0 && fi == 1.0));
      float ww, wh, sill;
      if (shop) { ww = bw * 0.8; wh = 3.0; sill = 0.45; }
      else if (door) { ww = 1.25; wh = 2.6; sill = 0.0; }
      else if (ground) { ww = min(1.1, bw * 0.42); wh = 1.7; sill = 1.1; }
      else if (balc) { ww = min(1.25, bw * 0.46); wh = 2.35; sill = 0.05; }
      else if (wStyle > 1.5) { ww = min(1.25, bw * 0.46); wh = 2.1; sill = 0.45; }
      else { ww = min(1.05, bw * 0.4); wh = 1.6; sill = 0.9; }
      vec2 hw = vec2(ww, wh) * 0.5;
      vec2 q = vec2(cx, fy - sill - hw.y);
      float dOpen = sdBox(q, hw);
      float trimW = shop ? 0.06 : 0.12;
      vec3 frameC = mod(seed * 7.0, 3.0) < 1.0 ? vec3(0.1, 0.17, 0.13) : vec3(0.85, 0.83, 0.78);
      if (shop) frameC = mix(vec3(0.08, 0.12, 0.14), vec3(0.32, 0.12, 0.08), step(0.5, fract(seed * 3.7)));
      vec3 shutC = shutI < 1.5 ? vec3(0.12, 0.24, 0.16) : shutI < 2.5 ? vec3(0.14, 0.24, 0.38) : shutI < 3.5 ? vec3(0.34, 0.2, 0.12) : vec3(0.4, 0.45, 0.32);

      // architrave
      if (dOpen > 0.0 && dOpen < trimW && !(door && q.y < -hw.y + 0.01)) {
        alb = trimC * (0.88 + 0.12 * n2);
        rough = 0.72;
        vec2 g = abs(q) - hw;
        vec2 dir = g.x > g.y ? vec2(sign(q.x), 0.0) : vec2(0.0, sign(q.y));
        nt = vec3(dir * (0.25 - dOpen / trimW * 0.5), 1.0);
        ao *= 0.95;
      }
      // sill ledge
      if (!ground && !balc && abs(q.x) < hw.x + 0.18 && q.y < -hw.y - 0.0 && q.y > -hw.y - 0.13) {
        alb = trimC * 0.92; nt = vec3(0.0, 0.7, 0.7); rough = 0.7;
      }
      // drip stain below sills
      if (!ground && abs(q.x) < hw.x && q.y < -hw.y - 0.13) {
        float st = (1.0 - smoothstep(0.0, 1.2, -q.y - hw.y)) * (0.5 + 0.5 * texture2D(uNoise, vec2(p.x * 2.0, p.y * 0.2)).g);
        alb *= 1.0 - st * 0.18;
      }
      // open shutters
      if (shutI > 0.5 && !ground && !balc) {
        float sx = abs(q.x) - hw.x - trimW;
        if (sx > 0.0 && sx < hw.x * 0.98 && abs(q.y) < hw.y) {
          float l = fract(q.y / 0.075);
          alb = shutC * (0.75 + 0.35 * l) * (0.9 + 0.1 * n2);
          nt = vec3(0.0, (l - 0.5) * 1.2, 1.0);
          rough = 0.6;
          ao *= 0.9;
        }
      }
      if (dOpen < 0.0) {
        float rd = shop ? 0.1 : 0.22;
        vec2 qg = q - Vt.xy / max(Vt.z, 0.06) * rd;
        if (sdBox(qg, hw) > 0.0) {
          // reveal of the recess
          alb = wallC * 0.6; rough = 0.9; ao *= 0.72;
          vec2 g = abs(qg) - hw;
          nt = g.x > g.y ? vec3(-sign(qg.x), 0.0, 0.25) : vec3(0.0, -sign(qg.y), 0.25);
        } else {
          bool closed = shutI > 0.5 && !ground && !balc && rs < 0.16;
          float F = 0.04 + 0.96 * pow(1.0 - clamp(Vt.z, 0.0, 1.0), 5.0);
          float lit = step(0.52, hash12(vec2(bi * 3.1 + fi, seed * 7.7))) * uNight;
          if (closed) {
            float l = fract(qg.y / 0.075);
            alb = shutC * (0.75 + 0.35 * l);
            nt = vec3(0.0, (l - 0.5) * 1.2, 1.0);
            rough = 0.6;
            emis = vec3(1.0, 0.7, 0.4) * lit * 0.25 * step(0.8, l);
          } else if (door && qg.y < hw.y - 0.62) {
            // panelled wooden door
            vec3 dc = mod(seed * 5.0, 4.0) < 1.0 ? vec3(0.09, 0.19, 0.13) : mod(seed * 5.0, 4.0) < 2.0 ? vec3(0.28, 0.07, 0.06) : mod(seed * 5.0, 4.0) < 3.0 ? vec3(0.08, 0.12, 0.24) : vec3(0.3, 0.19, 0.1);
            vec2 pc = vec2(abs(qg.x), qg.y + hw.y);
            float panel = step(0.09, pc.x) * step(pc.x, 0.52) * (step(0.18, pc.y) * step(pc.y, 0.95) + step(1.1, pc.y) * step(pc.y, 1.85));
            alb = dc * (0.85 + 0.15 * n2) * (1.0 - panel * 0.18);
            nt = vec3(0.0, 0.0, 1.0);
            rough = 0.5;
            if (abs(qg.x - 0.45) < 0.03 && abs(qg.y + hw.y - 1.05) < 0.03) { alb = vec3(0.8, 0.65, 0.3); rough = 0.3; }
          } else {
            float frameD = -sdBox(qg, hw);
            bool isFrame = frameD < 0.06;
            if (!shop) {
              if (abs(qg.x) < 0.026) isFrame = true;
              if (abs(qg.y - hw.y * 0.42) < 0.026 && !door) isFrame = true;
              if (door && abs(qg.y - (hw.y - 0.62)) < 0.04) isFrame = true;
            } else {
              if (abs(mod(qg.x + hw.x, ww / 3.0) - 0.0) < 0.035) isFrame = true;
              if (abs(qg.y - (hw.y - 0.55)) < 0.035) isFrame = true;
            }
            if (isFrame) { alb = frameC; rough = 0.45; nt = vec3(0.0, 0.0, 1.0); }
            else {
              alb = vec3(0.012, 0.014, 0.016);
              rough = 0.04 + n3 * 0.03;
              nt = vec3((n2 - 0.5) * 0.01, 0.0, 1.0);
              // curtains
              float cw = fract(rs * 7.7) * 0.5;
              vec3 curC = fract(rs * 5.3) < 0.5 ? vec3(0.8, 0.78, 0.72) : fract(rs * 5.3) < 0.8 ? vec3(0.7, 0.5, 0.45) : vec3(0.55, 0.6, 0.66);
              vec2 room0 = vec2(-bw * 0.5, -hw.y - sill);
              vec2 room1 = vec2(bw * 0.5, room0.y + (ground ? gh : fh) - 0.05);
              float sh = shop ? 1.0 : 0.0;
              if (!shop && abs(qg.x) > hw.x * (1.0 - cw)) {
                float fold = 0.8 + 0.2 * sin(qg.x * 40.0);
                emis = curC * fold * (uDay * (uZenith + uHorizon) * 0.35 + lit * vec3(1.0, 0.7, 0.4) * 1.1);
                alb = curC * 0.1;
                rough = 0.8;
              } else {
                emis = roomColor(qg, Vt, room0, room1, shop ? 5.0 : 3.8, rs, lit, sh);
              }
              emis *= (1.0 - F);
            }
          }
        }
      }
    }
    fAlb = alb * ao;
    fRough = rough;
    fNT = normalize(nt);
    fEmis = emis;
  }
`;

function makeFacadeMaterial() {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
  patch(mat, {
    key: 'facade',
    vHead: 'attribute vec4 aF; attribute vec4 aS; varying vec2 vUvM; varying vec4 vF; varying vec4 vS; varying vec3 vNW;',
    vEnd: 'vUvM = uv; vF = aF; vS = aS; vNW = normalize(mat3(modelMatrix) * objectNormal);',
    fHead: FACADE_FRAG,
    fColor: 'facade(); diffuseColor.rgb = fAlb;',
    fRough: 'roughnessFactor = fRough; metalnessFactor = 0.0;',
    fNormal: /* glsl */ `
      { vec3 N = normalize(vNW); vec3 T, B; faceFrame(N, T, B);
        vec3 nw = normalize(T * fNT.x + B * fNT.y + N * fNT.z);
        normal = normalize((viewMatrix * vec4(nw, 0.0)).xyz); }
    `,
    fEmissive: 'totalEmissiveRadiance += fEmis;',
  });
  return mat;
}

// --- roofs --------------------------------------------------------------------
function makeRoofMaterial() {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0, side: THREE.DoubleSide });
  patch(mat, {
    key: 'roof',
    vHead: 'attribute vec4 aR; varying vec2 vUvM; varying vec4 vR; varying vec3 vNW;',
    vEnd: 'vUvM = uv; vR = aR; vNW = normalize(mat3(modelMatrix) * objectNormal);',
    fHead: /* glsl */ `
      varying vec2 vUvM; varying vec4 vR; varying vec3 vNW;
      ${GLSL_FRAME}
      vec3 rAlb; float rRough; vec3 rNT; float rMetal;
      void roof() {
        vec2 p = vUvM;
        float style = vR.x, seed = vR.y;
        vec3 base = vColor.rgb;
        float n1 = texture2D(uNoise, (p + seed * 19.0) * 0.06).r;
        float n2 = texture2D(uNoise, p * 0.9 + seed).b;
        rMetal = 0.0;
        if (style < 0.5) {
          float row = floor(p.y / 0.31);
          float fy = fract(p.y / 0.31);
          float off = mod(row, 2.0) * 0.5;
          float col = floor(p.x / 0.23 + off);
          float fx = fract(p.x / 0.23 + off);
          float th = hash12(vec2(col, row) + seed * 3.0);
          vec3 c = base * (0.72 + 0.5 * th) * (0.85 + 0.3 * n1);
          float moss = smoothstep(0.55, 0.85, texture2D(uNoise, p * 0.18 + seed).g) * 0.6;
          c = mix(c, vec3(0.28, 0.3, 0.16), moss * 0.55);
          c = mix(c, c * 1.25 + 0.03, smoothstep(0.65, 0.9, n2) * 0.3);
          float lap = smoothstep(0.0, 0.16, fy);
          float prof = sin(fx * 3.14159);
          c *= mix(0.45, 1.0, lap) * (0.72 + 0.28 * prof);
          rAlb = c;
          rNT = vec3(cos(fx * 3.14159) * 0.75, (1.0 - lap) * 0.9, 1.0);
          rRough = 0.68;
        } else if (style < 1.5) {
          float row = floor(p.y / 0.22);
          float fy = fract(p.y / 0.22);
          float off = mod(row, 2.0) * 0.5;
          float col = floor(p.x / 0.3 + off);
          float fx = fract(p.x / 0.3 + off);
          float th = hash12(vec2(col, row) + seed * 5.0);
          vec3 c = base * (0.75 + 0.4 * th) * (0.9 + 0.2 * n1);
          float edge = smoothstep(0.0, 0.05, min(fx, 1.0 - fx));
          float lap = smoothstep(0.0, 0.1, fy);
          c *= mix(0.5, 1.0, lap) * mix(0.75, 1.0, edge);
          c = mix(c, vec3(0.3, 0.32, 0.2), smoothstep(0.7, 0.9, texture2D(uNoise, p * 0.2 + seed).g) * 0.3);
          rAlb = c;
          rNT = vec3(0.0, (1.0 - lap) * 0.7, 1.0);
          rRough = 0.52;
        } else if (style < 2.5) {
          vec3 c = base * (0.78 + 0.35 * n1) * (0.85 + 0.3 * texture2D(uNoise, p * 3.1).a);
          rAlb = c;
          rNT = vec3((n2 - 0.5) * 0.2, 0.0, 1.0);
          rRough = 0.95;
        } else {
          vec3 c = mix(vec3(0.22, 0.46, 0.38), vec3(0.38, 0.58, 0.48), n1);
          c = mix(c, vec3(0.32, 0.24, 0.14), smoothstep(0.7, 0.95, texture2D(uNoise, vec2(p.x * 1.5, p.y * 0.15)).g) * 0.5);
          float seam = smoothstep(0.0, 0.04, abs(fract(p.x / 0.6) - 0.5) - 0.46);
          rAlb = c * (1.0 - seam * 0.3);
          rNT = vec3(seam * 0.5, 0.0, 1.0);
          rRough = 0.5;
          rMetal = 0.25;
        }
      }
    `,
    fColor: 'roof(); diffuseColor.rgb = rAlb;',
    fRough: 'roughnessFactor = rRough; metalnessFactor = rMetal;',
    fNormal: /* glsl */ `
      { vec3 N = normalize(vNW) * (gl_FrontFacing ? 1.0 : -1.0); vec3 T, B; faceFrame(N, T, B);
        vec3 nw = normalize(T * rNT.x + B * rNT.y + N * rNT.z);
        normal = normalize((viewMatrix * vec4(nw, 0.0)).xyz); }
    `,
  });
  return mat;
}

// --- ashlar stone (quays, canal walls, bridges, towers) --------------------------
function makeStoneMaterial() {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
  patch(mat, {
    key: 'stone',
    vHead: 'varying vec2 vUvM; varying vec3 vNW;',
    vEnd: 'vUvM = uv; vNW = normalize(mat3(modelMatrix) * objectNormal);',
    fHead: /* glsl */ `
      varying vec2 vUvM; varying vec3 vNW;
      ${GLSL_FRAME}
      vec3 sAlb; float sRough; vec3 sNT;
      void stone() {
        vec2 p = vUvM;
        float row = floor(p.y / 0.42);
        float by = fract(p.y / 0.42);
        float len = 0.9 + 0.35 * hash11(row * 3.1);
        float bx = fract(p.x / len + hash11(row) );
        float id = floor(p.x / len + hash11(row));
        float hb = hash12(vec2(id, row));
        float m = min(min(bx, 1.0 - bx) * len, min(by, 1.0 - by) * 0.42);
        float n1 = texture2D(uNoise, p * 0.7).b;
        float n2 = texture2D(uNoise, p * 0.08).r;
        vec3 c = vColor.rgb * (0.78 + 0.34 * hb) * (0.85 + 0.3 * n1) * (0.9 + 0.2 * n2);
        c = mix(c * 0.45, c, smoothstep(0.0, 0.03, m));
        float y = vWPos.y;
        float wet = 1.0 - smoothstep(0.1, 0.6, y - sin(uTime * 0.8 + vWPos.x * 0.1) * 0.08);
        c = mix(c, c * vec3(0.45, 0.5, 0.42), wet);
        float algae = smoothstep(-0.9, -0.1, y) * (1.0 - smoothstep(-0.1, 0.45, y));
        c = mix(c, vec3(0.1, 0.16, 0.08), algae * 0.75);
        float moss = smoothstep(0.62, 0.85, texture2D(uNoise, p * 0.15).g) * smoothstep(3.5, 0.5, y);
        c = mix(c, vec3(0.16, 0.22, 0.08), moss * 0.4);
        sAlb = c;
        sRough = mix(0.85, 0.3, wet);
        vec2 bevel = vec2(bx - 0.5, by - 0.5) * 0.5 * (1.0 - smoothstep(0.0, 0.07, m));
        sNT = normalize(vec3(bevel + (vec2(n1, texture2D(uNoise, p * 0.7 + 0.5).b) - 0.5) * 0.25, 1.0));
      }
    `,
    fColor: 'stone(); diffuseColor.rgb = sAlb;',
    fRough: 'roughnessFactor = sRough;',
    fNormal: /* glsl */ `
      { vec3 N = normalize(vNW); vec3 T, B; faceFrame(N, T, B);
        vec3 nw = normalize(T * sNT.x + B * sNT.y + N * sNT.z);
        normal = normalize((viewMatrix * vec4(nw, 0.0)).xyz); }
    `,
  });
  return mat;
}

// --- paving (roads, walks) uses baked textures with world-space uv ---------------
function makePavingMaterial(set, key, extra = {}) {
  const mat = new THREE.MeshStandardMaterial({
    map: set.map, normalMap: set.normalMap, roughnessMap: set.orm, aoMap: set.orm,
    normalScale: new THREE.Vector2(1, 1), roughness: 1, metalness: 0, aoMapIntensity: 1, ...extra,
  });
  patch(mat, {
    key,
    fColor: /* glsl */ `
      float pvN = texture2D(uNoise, vWPos.xz * 0.02).r;
      diffuseColor.rgb *= 0.86 + 0.28 * pvN;
      // wet sheen along gutters / low spots
      float wetP = smoothstep(0.68, 0.9, texture2D(uNoise, vWPos.xz * 0.045).g);
    `,
    fRough: 'roughnessFactor = mix(roughnessFactor, 0.28, wetP * 0.7);',
  });
  return mat;
}

// --- props: vertex colour + aP(rough, metal, emissive) ----------------------------
function makePropMaterial() {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0 });
  patch(mat, {
    key: 'props',
    vHead: 'attribute vec3 aP; varying vec3 vP;',
    vEnd: 'vP = aP;',
    fHead: 'varying vec3 vP;',
    fColor: 'float prN = texture2D(uNoise, vWPos.xz * 0.37 + vWPos.y * 0.21).b; diffuseColor.rgb *= 0.9 + 0.2 * prN;',
    fRough: 'roughnessFactor = vP.x; metalnessFactor = vP.y;',
    fEmissive: 'totalEmissiveRadiance += vColor.rgb * vP.z * (vP.z > 50.0 ? 0.02 : uNight);',
  });
  return mat;
}

// --- alpha-tested iron railings (uv: u metres along, v 0..1 up) ---------------
function makeRailMaterial() {
  const mat = new THREE.MeshStandardMaterial({ map: TEX.railing, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.6, color: 0xffffff });
  patch(mat, { key: 'rail' });
  return mat;
}

function makeWoodMaterial() {
  const mat = new THREE.MeshStandardMaterial({ map: TEX.wood.map, normalMap: TEX.wood.normalMap, roughness: 0.78, metalness: 0, vertexColors: true });
  patch(mat, {
    key: 'wood',
    fColor: 'diffuseColor.rgb *= 0.85 + 0.3 * texture2D(uNoise, vWPos.xz * 0.05).r;',
  });
  return mat;
}

// striped fabric (awnings, parasols) with gentle flutter; aC = second colour
function makeFabricMaterial() {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, side: THREE.DoubleSide });
  patch(mat, {
    key: 'fabric',
    vHead: 'attribute vec4 aC; varying vec4 vC; varying vec2 vUvF;',
    vBegin: /* glsl */ `
      float flut = aC.w;
      vec3 wpF = (modelMatrix * vec4(position, 1.0)).xyz;
      transformed.y += sin(uTime * 3.2 + wpF.x * 1.3 + wpF.z) * 0.035 * flut * (0.3 + uWind.z);
    `,
    vEnd: 'vC = aC; vUvF = uv;',
    fHead: 'varying vec4 vC; varying vec2 vUvF;',
    fColor: /* glsl */ `
      float stp = step(0.5, fract(vUvF.x / 0.5));
      diffuseColor.rgb = mix(vColor.rgb, vC.rgb, stp) * (0.9 + 0.15 * texture2D(uNoise, vUvF * 2.0).b);
    `,
    fDir: /* glsl */ `
      // light through thin fabric
      reflectedLight.directDiffuse += directLight.color * diffuseColor.rgb * 0.25 * max(0.0, -dot(normal, directLight.direction));
    `,
  });
  return mat;
}
