// ============================================================================
// Camera modes: orbit (look around), walk (first person on the ground),
// fly (free camera), cine (slow drone path). Plus smooth viewpoint jumps.
// ============================================================================

const VIEWS = [
  { key: '1', name: '항구', pos: [230, 14, 190], tgt: [60, 6, 150] },
  { key: '2', name: '운하', pos: [0, 5.3, 63], tgt: [0, 2.2, -40] },
  { key: '3', name: '광장', pos: [18, 4.0, 0], tgt: [38, 6, -30] },
  { key: '4', name: '공원', pos: [163, 4.4, -122], tgt: [180, 1.0, -162] },
  { key: '5', name: '언덕', pos: [-70, 96, -430], tgt: [10, 0, 60] },
  { key: '6', name: '등대', pos: [470, 62, 300], tgt: [110, 6, 110] },
  { key: '7', name: '해변', pos: [-352, 3.6, 116], tgt: [-470, 1.2, 176] },
];

// Ground/collision query; replaced by the city module once it exists.
let walkInfo = (x, z) => ({ h: heightAt(x, z), blocked: heightAt(x, z) < 0.25 });

const CTRL = {
  mode: 'orbit',
  orbit: null,
  yaw: 0, pitch: 0,
  vel: new THREE.Vector3(),
  keys: new Set(),
  locked: false,
  vy: 0, grounded: true, bob: 0,
  trans: null, // {from, to, fromT, toT, t, dur}
  cineT: 0, cine: null,
  touchLook: null, joy: null, joyVec: new THREE.Vector2(),
  eye: 1.65,
};

function initControls() {
  const oc = new OrbitControls(camera, canvas);
  oc.enableDamping = true;
  oc.dampingFactor = 0.07;
  oc.rotateSpeed = 0.55;
  oc.zoomSpeed = 0.9;
  oc.panSpeed = 0.8;
  oc.minDistance = 4;
  oc.maxDistance = 1800;
  oc.maxPolarAngle = Math.PI * 0.495;
  oc.screenSpacePanning = false;
  CTRL.orbit = oc;
  const v = VIEWS[0];
  camera.position.set(...v.pos);
  oc.target.set(...v.tgt);
  oc.update();

  addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
    CTRL.keys.add(e.code);
    if (CTRL.mode === 'walk' && e.code === 'KeyE' && !e.repeat && typeof interactInterior === 'function') interactInterior();
    if (CTRL.mode === 'walk' && ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'].includes(e.code) && typeof leaveInteriorSeat === 'function') leaveInteriorSeat();
    if (e.code === 'Space' && CTRL.mode === 'walk' && CTRL.grounded) { CTRL.vy = 4.2; CTRL.grounded = false; }
    if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code) && CTRL.mode !== 'orbit') e.preventDefault();
  });
  addEventListener('keyup', (e) => CTRL.keys.delete(e.code));
  addEventListener('blur', () => CTRL.keys.clear());

  canvas.addEventListener('click', () => {
    if ((CTRL.mode === 'walk' || CTRL.mode === 'fly') && !IS_TOUCH && !CTRL.locked) {
      try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (_) { /* optional */ }
    }
  });
  document.addEventListener('pointerlockchange', () => {
    CTRL.locked = document.pointerLockElement === canvas;
    $('crosshair').classList.toggle('show', CTRL.locked);
  });
  // mouse look (pointer lock) or drag-look fallback
  let dragging = false, lx = 0, ly = 0;
  canvas.addEventListener('pointerdown', (e) => {
    if (CTRL.mode !== 'walk' && CTRL.mode !== 'fly') return;
    if (e.pointerType === 'touch') return;
    dragging = true; lx = e.clientX; ly = e.clientY;
  });
  addEventListener('pointerup', () => { dragging = false; });
  addEventListener('pointermove', (e) => {
    if (CTRL.mode !== 'walk' && CTRL.mode !== 'fly') return;
    if (e.pointerType === 'touch') return;
    let dx = 0, dy = 0;
    if (CTRL.locked) { dx = e.movementX; dy = e.movementY; }
    else if (dragging) { dx = e.clientX - lx; dy = e.clientY - ly; lx = e.clientX; ly = e.clientY; }
    else return;
    CTRL.yaw -= dx * 0.0022;
    CTRL.pitch = clamp(CTRL.pitch - dy * 0.0022, -1.45, 1.45);
  });

  // touch: left third = joystick, rest = look
  canvas.addEventListener('touchstart', (e) => {
    if (CTRL.mode !== 'walk' && CTRL.mode !== 'fly') return;
    for (const t of e.changedTouches) {
      if (t.clientX < innerWidth * 0.4 && t.clientY > innerHeight * 0.35 && !CTRL.joy) {
        CTRL.joy = { id: t.identifier, x: t.clientX, y: t.clientY };
        const j = $('joy'); j.classList.add('show');
        j.style.left = (t.clientX - 55) + 'px'; j.style.top = (t.clientY - 55) + 'px'; j.style.bottom = 'auto';
      } else if (!CTRL.touchLook) CTRL.touchLook = { id: t.identifier, x: t.clientX, y: t.clientY };
    }
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('touchmove', (e) => {
    if (CTRL.mode !== 'walk' && CTRL.mode !== 'fly') return;
    for (const t of e.changedTouches) {
      if (CTRL.joy && t.identifier === CTRL.joy.id) {
        const dx = clamp((t.clientX - CTRL.joy.x) / 45, -1, 1), dy = clamp((t.clientY - CTRL.joy.y) / 45, -1, 1);
        CTRL.joyVec.set(dx, dy);
        $('joy').firstElementChild.style.transform = `translate(${dx * 33}px, ${dy * 33}px)`;
      } else if (CTRL.touchLook && t.identifier === CTRL.touchLook.id) {
        CTRL.yaw -= (t.clientX - CTRL.touchLook.x) * 0.005;
        CTRL.pitch = clamp(CTRL.pitch - (t.clientY - CTRL.touchLook.y) * 0.005, -1.45, 1.45);
        CTRL.touchLook.x = t.clientX; CTRL.touchLook.y = t.clientY;
      }
    }
    e.preventDefault();
  }, { passive: false });
  const tend = (e) => {
    for (const t of e.changedTouches) {
      if (CTRL.joy && t.identifier === CTRL.joy.id) {
        CTRL.joy = null; CTRL.joyVec.set(0, 0);
        $('joy').classList.remove('show'); $('joy').firstElementChild.style.transform = '';
      }
      if (CTRL.touchLook && t.identifier === CTRL.touchLook.id) CTRL.touchLook = null;
    }
  };
  canvas.addEventListener('touchend', tend);
  canvas.addEventListener('touchcancel', tend);

  buildCinePath();
}

function syncYawPitchFromCamera() {
  const d = new THREE.Vector3();
  camera.getWorldDirection(d);
  CTRL.yaw = Math.atan2(-d.x, -d.z);
  CTRL.pitch = Math.asin(clamp(d.y, -1, 1));
}

function setMode(mode) {
  const prev = CTRL.mode;
  if (prev === mode) return;
  if (typeof leaveInteriorSeat === 'function') leaveInteriorSeat();
  CTRL.mode = mode;
  CTRL.trans = null;
  if (document.pointerLockElement) { try { document.exitPointerLock(); } catch (_) { /* ignore */ } }
  CTRL.orbit.enabled = mode === 'orbit';
  if (mode === 'orbit') {
    const d = new THREE.Vector3();
    camera.getWorldDirection(d);
    const dist = clamp(camera.position.y * 1.5, 25, 250);
    CTRL.orbit.target.copy(camera.position).addScaledVector(d, dist);
    CTRL.orbit.target.y = Math.max(walkInfo(CTRL.orbit.target.x, CTRL.orbit.target.z).h, 0);
    CTRL.orbit.update();
  } else {
    syncYawPitchFromCamera();
  }
  if (mode === 'walk') {
    const p = camera.position;
    let w = walkInfo(p.x, p.z);
    if (w.blocked) {
      // find a nearby walkable spot
      let best = null;
      for (let r = 2; r < 200 && !best; r += 3) for (let a = 0; a < 16; a++) {
        const x = p.x + Math.cos(a / 16 * TAU) * r, z = p.z + Math.sin(a / 16 * TAU) * r;
        const wi = walkInfo(x, z);
        if (!wi.blocked) { best = [x, z]; break; }
      }
      if (best) { p.x = best[0]; p.z = best[1]; w = walkInfo(p.x, p.z); }
    }
    p.y = w.h + CTRL.eye;
    CTRL.pitch = clamp(CTRL.pitch, -0.4, 0.3);
    CTRL.vy = 0; CTRL.grounded = true;
    showHint(IS_TOUCH ? '왼쪽 아래를 끌어 걷고, 문 앞의 안내를 터치하면 들어갈 수 있어요' : '<kbd>W A S D</kbd> 걷기 · <kbd>Shift</kbd> 달리기 · <kbd>E</kbd> 문 / 조명 / 앉기 · <kbd>Space</kbd> 점프 · <kbd>Esc</kbd> 해제');
  }
  if (mode === 'fly') showHint(IS_TOUCH ? '왼쪽 아래를 끌어 날고, 화면을 밀어 방향을 바꿔요' : '화면을 클릭하면 시점이 고정돼요<br><kbd>W A S D</kbd> 이동 · <kbd>E</kbd>/<kbd>Q</kbd> 오르내리기 · <kbd>Shift</kbd> 빠르게');
  if (mode === 'cine') { CTRL.cineT = nearestCineT(); showHint('천천히 도시를 한 바퀴 돌아요'); }
  document.querySelectorAll('#modes button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
}

let hintTimer = 0;
function showHint(html) {
  const h = $('hint');
  h.innerHTML = html;
  h.classList.add('show');
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => h.classList.remove('show'), 3800);
}

function goToView(i) {
  const v = VIEWS[i];
  if (!v) return;
  if (typeof leaveInteriorSeat === 'function') leaveInteriorSeat();
  if (CTRL.mode === 'cine') setMode('orbit');
  const from = camera.position.clone();
  const fromT = new THREE.Vector3();
  camera.getWorldDirection(fromT); fromT.multiplyScalar(40).add(from);
  if (CTRL.mode === 'orbit') fromT.copy(CTRL.orbit.target);
  const to = new THREE.Vector3(...v.pos), toT = new THREE.Vector3(...v.tgt);
  if (CTRL.mode === 'walk') { const w = walkInfo(to.x, to.z); to.y = w.h + CTRL.eye; }
  const dist = from.distanceTo(to);
  CTRL.trans = { from, to, fromT, toT, t: 0, dur: clamp(1.4 + dist / 400, 1.6, 4.5), lift: clamp(dist * 0.18, 0, 140) };
}

// --- cinematic path -----------------------------------------------------------
function buildCinePath() {
  const P = [
    [-120, 60, 330], [40, 26, 250], [8, 7, 150], [0, 5.5, 60], [0, 6, -60], [30, 16, -120],
    [150, 12, -120], [200, 30, -200], [120, 80, -330], [-80, 110, -300], [-230, 60, -120],
    [-320, 14, 120], [-260, 10, 220],
  ];
  const T = [
    [60, 10, 120], [10, 6, 100], [0, 4, 40], [0, 3.5, -30], [30, 6, -20], [150, 4, -150],
    [180, 2, -165], [120, 10, -120], [0, 0, 40], [30, 0, 80], [-60, 5, 100],
    [-200, 3, 300], [-40, 10, 140],
  ];
  CTRL.cine = {
    pos: new THREE.CatmullRomCurve3(P.map((p) => new THREE.Vector3(...p)), true, 'centripetal'),
    tgt: new THREE.CatmullRomCurve3(T.map((p) => new THREE.Vector3(...p)), true, 'centripetal'),
  };
}
function nearestCineT() {
  let best = 0, bd = Infinity;
  for (let i = 0; i < 200; i++) {
    const d = CTRL.cine.pos.getPointAt(i / 200).distanceToSquared(camera.position);
    if (d < bd) { bd = d; best = i / 200; }
  }
  return best;
}

const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _m = new THREE.Vector3();
function updateControls(dt) {
  const K = CTRL.keys;
  if (CTRL.trans) {
    const tr = CTRL.trans;
    tr.t = Math.min(1, tr.t + dt / tr.dur);
    const e = tr.t < 0.5 ? 4 * tr.t ** 3 : 1 - Math.pow(-2 * tr.t + 2, 3) / 2;
    camera.position.lerpVectors(tr.from, tr.to, e);
    camera.position.y += Math.sin(Math.PI * e) * tr.lift;
    const tg = new THREE.Vector3().lerpVectors(tr.fromT, tr.toT, e);
    camera.lookAt(tg);
    if (tr.t >= 1) {
      CTRL.trans = null;
      if (CTRL.mode === 'orbit') { CTRL.orbit.target.copy(tr.toT); CTRL.orbit.update(); }
      else syncYawPitchFromCamera();
    }
    return;
  }
  if (CTRL.mode === 'orbit') {
    CTRL.orbit.update();
    const g = walkInfo(camera.position.x, camera.position.z).h;
    const minY = Math.max(g, 0) + 1.5;
    if (camera.position.y < minY) camera.position.y = minY;
    return;
  }
  if (CTRL.mode === 'cine') {
    CTRL.cineT = (CTRL.cineT + dt / 150) % 1;
    const p = CTRL.cine.pos.getPointAt(CTRL.cineT);
    const t = CTRL.cine.tgt.getPointAt(CTRL.cineT);
    const g = walkInfo(p.x, p.z).h;
    p.y = Math.max(p.y, Math.max(g, 0) + 3);
    camera.position.lerp(p, 1 - Math.exp(-dt * 2));
    _m.copy(t);
    const look = new THREE.Vector3();
    camera.getWorldDirection(look);
    const cur = camera.position.clone().add(look.multiplyScalar(60));
    cur.lerp(_m, 1 - Math.exp(-dt * 1.5));
    camera.lookAt(cur);
    return;
  }
  // walk / fly share look
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(CTRL.pitch, CTRL.yaw, 0, 'YXZ'));
  camera.quaternion.slerp(q, 1 - Math.exp(-dt * 30));
  if (CTRL.mode === 'walk' && typeof INTERIORS !== 'undefined' && INTERIORS.seats) {
    camera.position.copy(INTERIORS.seats.seat.pos);
    return;
  }
  let fx = 0, fz = 0, fy = 0;
  if (K.has('KeyW') || K.has('ArrowUp')) fz += 1;
  if (K.has('KeyS') || K.has('ArrowDown')) fz -= 1;
  if (K.has('KeyA') || K.has('ArrowLeft')) fx -= 1;
  if (K.has('KeyD') || K.has('ArrowRight')) fx += 1;
  if (K.has('KeyE')) fy += 1;
  if (K.has('KeyQ') || K.has('KeyC')) fy -= 1;
  fx += CTRL.joyVec.x; fz -= CTRL.joyVec.y;
  const fast = K.has('ShiftLeft') || K.has('ShiftRight');

  if (CTRL.mode === 'fly') {
    if (K.has('Space')) fy += 1;
    camera.getWorldDirection(_f);
    _r.crossVectors(_f, camera.up).normalize();
    const speed = fast ? 60 : 16;
    _m.set(0, 0, 0).addScaledVector(_f, fz).addScaledVector(_r, fx);
    _m.y += fy;
    if (_m.lengthSq() > 1) _m.normalize();
    CTRL.vel.lerp(_m.multiplyScalar(speed), 1 - Math.exp(-dt * 4));
    camera.position.addScaledVector(CTRL.vel, dt);
    const g = walkInfo(camera.position.x, camera.position.z).h;
    camera.position.y = clamp(camera.position.y, Math.max(g, 0) + 1.2, 1400);
    return;
  }

  // walk
  _f.set(-Math.sin(CTRL.yaw), 0, -Math.cos(CTRL.yaw));
  _r.set(-_f.z, 0, _f.x);
  _m.set(0, 0, 0).addScaledVector(_f, fz).addScaledVector(_r, fx);
  if (_m.lengthSq() > 1) _m.normalize();
  const speed = fast ? 5.2 : 1.9;
  CTRL.vel.lerp(_m.multiplyScalar(speed), 1 - Math.exp(-dt * 8));
  const p = camera.position;
  const cur = walkInfo(p.x, p.z);
  const feet = p.y - CTRL.eye;
  const ok = (x, z) => { const w = walkInfo(x, z); return !w.blocked && w.h - feet < 0.55; };
  // Sweep the capsule in <= 8 cm steps, including during low-frame-rate running.
  const steps = Math.max(1, Math.ceil(Math.hypot(CTRL.vel.x, CTRL.vel.z) * dt / 0.08));
  for (let si = 0; si < steps; si++) {
    const nx = p.x + CTRL.vel.x * dt / steps, nz = p.z + CTRL.vel.z * dt / steps;
    if (ok(nx, nz)) { p.x = nx; p.z = nz; }
    else { if (ok(nx, p.z)) p.x = nx; if (ok(p.x, nz)) p.z = nz; }
  }
  const g = walkInfo(p.x, p.z).h;
  CTRL.vy -= 9.8 * dt;
  let y = feet + CTRL.vy * dt;
  if (y <= g) { y = y < g - 0.3 ? lerp(y, g, 1 - Math.exp(-dt * 18)) : g; CTRL.vy = 0; CTRL.grounded = true; }
  else if (y - g > 0.05) CTRL.grounded = false;
  if (CTRL.grounded && y < g + 0.02) y = lerp(feet, g, 1 - Math.exp(-dt * 14));
  const roomInfo = typeof interiorWalkInfo === 'function' ? interiorWalkInfo(p.x, p.z, 0) : null;
  if (roomInfo && roomInfo.room && y + CTRL.eye > roomInfo.room.baseY + 3.3) { y = roomInfo.room.baseY + 3.3 - CTRL.eye; CTRL.vy = Math.min(0, CTRL.vy); }
  const mv = Math.hypot(CTRL.vel.x, CTRL.vel.z);
  CTRL.bob += mv * dt * 2.1;
  const bob = CTRL.grounded ? Math.sin(CTRL.bob * Math.PI) * 0.035 * clamp(mv / 2, 0, 1.4) : 0;
  p.y = y + CTRL.eye + bob;
  void cur;
  G.uPlayer.value.set(p.x, y, p.z);
}
