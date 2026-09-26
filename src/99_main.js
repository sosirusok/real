// ============================================================================
// Boot + frame loop
// ============================================================================

function showError(msg) {
  const e = $('err');
  if (!e) return;
  e.style.display = 'block';
  e.textContent += msg + '\n';
}
addEventListener('error', (e) => showError(String(e.message || e)));
addEventListener('unhandledrejection', (e) => showError(String(e.reason && e.reason.stack || e.reason)));
renderer.debug.onShaderError = (gl, program, vs, fs) => {
  const log = gl.getProgramInfoLog(program) + '\n' + gl.getShaderInfoLog(vs) + '\n' + gl.getShaderInfoLog(fs);
  let ctx = '';
  for (const [sh, name] of [[vs, 'VS'], [fs, 'FS']]) {
    const info = gl.getShaderInfoLog(sh) || '';
    const m = info.match(/ERROR: 0:(\d+)/);
    if (m) {
      const src = gl.getShaderSource(sh).split('\n');
      const ln = +m[1];
      ctx += `\n[${name} ${ln}] ` + src.slice(Math.max(0, ln - 3), ln + 1).join('\n');
    }
  }
  showError('Shader error: ' + log.slice(0, 1200) + ctx);
  console.error(log);
};

const clockState = { last: performance.now(), t: 0, fpsAcc: 0, fpsN: 0, fpsShown: 0, slow: 0, checked: false };

function updateShadowCamera() {
  const cam = camera.position;
  const R = clamp(cam.y * 1.4 + 75, 75, 420);
  const d = new THREE.Vector3();
  camera.getWorldDirection(d);
  d.y = 0; if (d.lengthSq() < 1e-4) d.set(0, 0, -1); d.normalize();
  const focus = new THREE.Vector3(cam.x + d.x * R * 0.55, 0, cam.z + d.z * R * 0.55);
  focus.y = Math.max(0, heightAt(focus.x, focus.z));
  const L = G.uSunDir.value;
  // snap focus to shadow texel grid (in light space) to avoid shimmering
  const texel = (2 * R) / sunLight.shadow.mapSize.x;
  const m = new THREE.Matrix4().lookAt(new THREE.Vector3(0, 0, 0), L.clone().negate(), new THREE.Vector3(0, 1, 0));
  const inv = m.clone().invert();
  const f = focus.clone().applyMatrix4(inv);
  f.x = Math.round(f.x / texel) * texel;
  f.y = Math.round(f.y / texel) * texel;
  focus.copy(f.applyMatrix4(m));
  sunLight.target.position.copy(focus);
  sunLight.position.copy(focus).addScaledVector(L, 1200);
  const sc = sunLight.shadow.camera;
  if (sc.right !== R) {
    sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R;
    sc.near = 10; sc.far = 2600;
    sc.updateProjectionMatrix();
  }
  sunLight.shadow.normalBias = texel * 1.2;
  sunLight.shadow.bias = -0.00025;
  sunLight.target.updateMatrixWorld();
}

function onResize() {
  const w = innerWidth, h = innerHeight;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2) * Qs.pr);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  if (composer) composer.setSize(size.x, size.y);
  resizeReflection();
}
addEventListener('resize', onResize);

function setQuality(name) {
  qualityName = name;
  Qs = QUALITY[name];
  sunLight.shadow.mapSize.set(Qs.shadow, Qs.shadow);
  if (sunLight.shadow.map) { sunLight.shadow.map.dispose(); sunLight.shadow.map = null; }
  skyMat.uniforms.uCloudSteps.value = Qs.cloudSteps;
  raysPass.maskMat.defines.SAMPLES = Qs.rays;
  raysPass.maskMat.needsUpdate = true;
  const rt1 = composer.renderTarget1, rt2 = composer.renderTarget2;
  rt1.samples = Qs.msaa; rt2.samples = Qs.msaa;
  rt1.dispose(); rt2.dispose();
  if (typeof applyDensity === 'function') applyDensity();
  onResize();
  document.querySelectorAll('#qual button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.q === name)));
}

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - clockState.last) / 1000;
  clockState.last = now;
  dt = Math.min(dt, 0.066);
  clockState.t += dt;
  const t = clockState.t;
  G.uTime.value = t;
  const w = G.uWind.value;
  w.w += dt * (1.5 + 9 * w.z);
  G.uCloudOff.value.x += dt * w.x * (6 + 14 * w.z);
  G.uCloudOff.value.y += dt * w.y * (6 + 14 * w.z);

  updateSky(dt);
  if (skyState.envDirty) { updateEnv(); skyState.envDirty = false; }
  updateControls(dt);
  camera.updateMatrixWorld();
  skyMesh.position.copy(camera.position);
  updateShadowCamera();
  if (typeof updateWorld === 'function') updateWorld(dt, t);
  updatePost(t);
  renderer.shadowMap.needsUpdate = true;
  renderReflection();
  composer.render(dt);
  if (typeof updateHud === 'function') updateHud(dt);

  // fps + one-time adaptive quality step down
  clockState.fpsAcc += dt; clockState.fpsN++;
  if (clockState.fpsAcc > 0.5) {
    const fps = clockState.fpsN / clockState.fpsAcc;
    clockState.fpsShown = fps;
    const el = $('fps'); if (el) el.textContent = fps.toFixed(0) + ' fps';
    clockState.fpsAcc = 0; clockState.fpsN = 0;
    if (!clockState.checked && t > 4) {
      if (fps < 24) clockState.slow++; else clockState.slow = 0;
      if (clockState.slow >= 4) {
        clockState.checked = true;
        const order = ['ultra', 'high', 'medium', 'low'];
        const i = order.indexOf(qualityName);
        if (i < order.length - 1) { setQuality(order[i + 1]); showHint('부드럽게 보이도록 그래픽 품질을 한 단계 낮췄어요'); }
      }
      if (t > 20) clockState.checked = true;
    }
  }
}

async function boot() {
  await step('물결과 구름 무늬 짜는 중', buildTextures);
  await step('지형 다듬는 중', buildHeightmap);
  await step('풀밭과 모래밭 나누는 중', buildNaturalMask);
  if (typeof buildCity === 'function') await step('도시 짓는 중', buildCity);
  await step('지형 조각 잇는 중', buildTerrain);
  await step('먼 산맥 그리는 중', buildFarMountains);
  await step('하늘 여는 중', buildSky);
  await step('바다 채우는 중', () => { buildWater(); if (typeof buildPools === 'function') buildPools(); });
  if (typeof buildNature === 'function') await step('나무 심는 중', buildNature);
  if (typeof buildLife === 'function') await step('새와 물고기 부르는 중', buildLife);
  finishMask();
  await step('빛과 공기 맞추는 중', () => { initEnv(); buildPost(); initControls(); });
  if (typeof initUI === 'function') initUI();
  updateSky(0);
  updateEnv();
  skyState.envDirty = false;
  await step('셰이더 준비 중', async () => {
    try { if (renderer.compileAsync) await renderer.compileAsync(scene, camera); } catch (_) { /* compile lazily */ }
  });
  requestAnimationFrame((n) => { clockState.last = n; frame(n); });
  setTimeout(() => $('loader').classList.add('done'), 300);
  window.__yp = { goToView, setMode, skyState, camera, CTRL, setQuality, G, postState, THREE, VIEWS };
  window.__ready = true;
}
boot();
