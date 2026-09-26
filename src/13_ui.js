// ============================================================================
// UI wiring + HUD
// ============================================================================

const WIND_NAMES = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'];
function windLabel() {
  const w = G.uWind.value;
  // "from" direction; +x east, -z north
  const fx = -w.x, fz = -w.y;
  const ang = Math.atan2(fx, -fz); // 0 = north, clockwise
  const i = ((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8;
  const ms = 0.6 + w.z * 9;
  return `${WIND_NAMES[i]}풍 ${ms.toFixed(1)} m/s`;
}
function fmtTime(h) {
  const hh = Math.floor(h) % 24, mm = Math.floor((h % 1) * 60);
  return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
}

let hudTimer = 0;
function updateHud(dt) {
  hudTimer -= dt;
  if (hudTimer > 0) return;
  hudTimer = 0.25;
  $('lg-time').textContent = fmtTime(skyState.hour);
  $('lg-elev').textContent = skyState.elev.toFixed(1) + '°';
  $('lg-wind').textContent = windLabel();
  if (skyState.flow) {
    const s = $('in-time');
    if (document.activeElement !== s) s.value = skyState.hour.toFixed(2);
    $('out-time').textContent = fmtTime(skyState.hour);
  }
  if (typeof updateAudio === 'function') updateAudio();
}

function initUI() {
  // viewpoints
  const vc = $('views');
  VIEWS.forEach((v, i) => {
    const b = document.createElement('button');
    b.innerHTML = `<span class="k">${v.key}</span>${v.name}`;
    b.title = `${v.name}(으)로 이동 (${v.key})`;
    b.addEventListener('click', () => goToView(i));
    vc.appendChild(b);
  });
  document.querySelectorAll('#modes button').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));

  const drawer = $('drawer');
  $('btn-settings').addEventListener('click', () => {
    drawer.hidden = !drawer.hidden;
    $('btn-settings').setAttribute('aria-pressed', String(!drawer.hidden));
  });
  const hud = $('hud');
  const toggleHud = () => {
    const hide = !hud.classList.contains('hidden');
    hud.classList.toggle('hidden', hide);
    if (hide) { drawer.hidden = true; $('btn-settings').setAttribute('aria-pressed', 'false'); }
    if (hide) showHint('<kbd>H</kbd> 를 누르면 UI가 다시 나타나요');
  };
  $('btn-hide').addEventListener('click', toggleHud);

  // time
  const tIn = $('in-time');
  tIn.value = skyState.hour;
  $('out-time').textContent = fmtTime(skyState.hour);
  tIn.addEventListener('input', () => { skyState.hour = +tIn.value; $('out-time').textContent = fmtTime(skyState.hour); });
  const flowBtn = $('btn-flow');
  const setFlow = (on) => {
    skyState.flow = on;
    flowBtn.setAttribute('aria-pressed', String(on));
    flowBtn.textContent = on ? '시간 멈추기' : '시간 흐르게 하기';
  };
  flowBtn.addEventListener('click', () => setFlow(!skyState.flow));
  document.querySelectorAll('.play[data-t]').forEach((b) => b.addEventListener('click', () => {
    skyState.hour = +b.dataset.t; tIn.value = skyState.hour; $('out-time').textContent = fmtTime(skyState.hour);
  }));
  // clouds + wind
  const cIn = $('in-cloud');
  cIn.addEventListener('input', () => { skyState.cover = +cIn.value; $('out-cloud').textContent = Math.round(skyState.cover / 0.85 * 100) + '%'; });
  $('out-cloud').textContent = Math.round(skyState.cover / 0.85 * 100) + '%';
  const wIn = $('in-wind');
  const setWind = () => { G.uWind.value.z = +wIn.value; $('out-wind').textContent = (0.6 + G.uWind.value.z * 9).toFixed(1) + ' m/s'; };
  wIn.addEventListener('input', setWind);
  setWind();
  // quality
  document.querySelectorAll('#qual button').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.q === qualityName));
    b.addEventListener('click', () => { setQuality(b.dataset.q); clockState.checked = true; });
  });
  // post toggles
  const tg = (id, key) => {
    const b = $(id);
    b.addEventListener('click', () => { postState[key] = !postState[key]; b.setAttribute('aria-pressed', String(postState[key])); });
  };
  tg('tg-rays', 'rays'); tg('tg-bloom', 'bloom'); tg('tg-grade', 'grade');
  // audio
  const sb = $('btn-sound');
  sb.addEventListener('click', () => {
    const on = sb.getAttribute('aria-pressed') !== 'true';
    sb.setAttribute('aria-pressed', String(on));
    sb.setAttribute('aria-label', on ? '소리 끄기' : '소리 켜기');
    setAudio(on);
  });
  const mb = $('tg-music');
  mb.addEventListener('click', () => {
    const on = mb.getAttribute('aria-pressed') !== 'true';
    mb.setAttribute('aria-pressed', String(on));
    setMusic(on);
    if (on && sb.getAttribute('aria-pressed') !== 'true') { sb.setAttribute('aria-pressed', 'true'); setAudio(true); }
  });

  addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT')) return;
    if (e.code === 'KeyH') toggleHud();
    if (e.code === 'KeyT') setFlow(!skyState.flow);
    if (e.code === 'KeyM') mb.click();
    if (/^Digit[1-7]$/.test(e.code)) goToView(+e.code.slice(5) - 1);
    if (e.code === 'KeyV') {
      const order = ['orbit', 'walk', 'fly', 'cine'];
      setMode(order[(order.indexOf(CTRL.mode) + 1) % order.length]);
    }
  });
  if (IS_TOUCH) $('fps').hidden = true;
}
