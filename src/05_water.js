// ============================================================================
// Water: Gerstner swell on the open sea, layered ripple normals, planar
// reflections, depth-based transparency, shoreline foam. Built on the PBR
// material so sun glints, lamp reflections and shadows come for free.
// ============================================================================

const WATER = {
  mesh: null, mat: null,
  reflRT: null, reflCam: new THREE.PerspectiveCamera(),
  texMat: new THREE.Matrix4(),
  uRefl: { value: null }, uReflMat: { value: new THREE.Matrix4() }, uReflOn: { value: 0 },
  uWaterN: { value: null }, uWaveAmp: { value: 1 },
};

function waterGrid(N, near, far) {
  const pos = [], idx = [];
  const f = (s) => Math.sign(s) * (Math.abs(s) * near + Math.pow(Math.abs(s), 4) * far);
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
    pos.push(f((i / N) * 2 - 1), 0, f((j / N) * 2 - 1));
  }
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const p = j * (N + 1) + i;
    idx.push(p, p + N + 1, p + 1, p + 1, p + N + 1, p + N + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setIndex(idx);
  return g;
}

const WATER_VHEAD = /* glsl */ `
  uniform float uWaveAmp;
  varying float vSea;
  varying float vWaveH;
  vec3 gDisp;
  vec3 gNrm;
  void gerstner(vec2 p, float amp) {
    gDisp = vec3(0.0);
    gNrm = vec3(0.0, 1.0, 0.0);
    vec3 W[5] = vec3[5](vec3(0.15, -1.0, 34.0), vec3(-0.38, -0.92, 21.0), vec3(0.55, -0.83, 13.0), vec3(-0.75, -0.66, 8.0), vec3(0.2, -0.98, 5.1));
    float A[5] = float[5](0.30, 0.17, 0.085, 0.045, 0.022);
    for (int i = 0; i < 5; i++) {
      vec2 D = normalize(W[i].xy);
      float k = 6.2831853 / W[i].z;
      float w = sqrt(9.81 * k);
      float ph = k * dot(D, p) - w * uTime + float(i) * 1.7;
      float a = A[i] * amp;
      float Q = a > 0.0 ? min(0.75 / (k * a * 5.0), 1.0) : 0.0;
      float c = cos(ph), s = sin(ph);
      gDisp.x += Q * a * D.x * c;
      gDisp.z += Q * a * D.y * c;
      gDisp.y += a * s;
      gNrm.x -= D.x * k * a * c;
      gNrm.z -= D.y * k * a * c;
      gNrm.y -= Q * k * a * s;
    }
  }
`;

function makeWaterMaterial({ fixedDepth = -1, key = 'water' } = {}) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.05, metalness: 0, transparent: true, depthWrite: true });
  mat.blending = THREE.CustomBlending;
  mat.blendSrc = THREE.OneFactor;
  mat.blendDst = THREE.OneMinusSrcAlphaFactor;
  mat.blendSrcAlpha = THREE.OneFactor;
  mat.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
  const fd = fixedDepth.toFixed(2);
  patch(mat, {
    key,
    uniforms: { uRefl: WATER.uRefl, uReflMat: WATER.uReflMat, uReflOn: WATER.uReflOn, uWaterN: WATER.uWaterN, uWaveAmp: WATER.uWaveAmp },
    vHead: WATER_VHEAD,
    vNormal: /* glsl */ `
      vec3 wp0 = (modelMatrix * vec4(position, 1.0)).xyz;
      float dep0 = ${fd} >= 0.0 ? ${fd} : max(-terrainH(wp0.xz), 0.0);
      vSea = ${fd} >= 0.0 ? 0.0 : smoothstep(118.0, 200.0, wp0.z) * smoothstep(0.5, 6.0, dep0);
      gerstner(wp0.xz, vSea * uWaveAmp * (0.55 + uWind.z * 0.9));
      objectNormal = normalize(gNrm);
      vWaveH = gDisp.y;
    `,
    vBegin: 'transformed += gDisp;',
    fHead: /* glsl */ `
      uniform sampler2D uRefl;
      uniform mat4 uReflMat;
      uniform float uReflOn;
      uniform sampler2D uWaterN;
      varying float vSea;
      varying float vWaveH;
      float wA, wFr, wFoam, wRough;
      vec3 wN;
    `,
    fColor: /* glsl */ `
      vec3 V = normalize(cameraPosition - vWPos);
      float dist = length(cameraPosition - vWPos);
      float ground = ${fd} >= 0.0 ? vWPos.y - ${fd} : terrainH(vWPos.xz);
      float depth = max(vWPos.y - ground, 0.0);
      vec2 wd = uWind.xy;
      float ws = uWind.z;
      vec2 p = vWPos.xz;
      vec3 n1 = texture2D(uWaterN, p * 0.041 + wd * uTime * 0.021).xyz * 2.0 - 1.0;
      vec3 n2 = texture2D(uWaterN, p * 0.093 + vec2(-wd.y, wd.x) * uTime * 0.017 + wd * uTime * 0.03).xyz * 2.0 - 1.0;
      vec3 n3 = texture2D(uWaterN, p * 0.29 - wd * uTime * 0.05).xyz * 2.0 - 1.0;
      float fadeD = 1.0 - smoothstep(30.0, 600.0, dist) * 0.75;
      float k = (0.22 + 0.55 * ws) * fadeD;
      vec2 dn = (n1.xy * 0.55 + n2.xy * 0.45 + n3.xy * 0.35 * (1.0 - smoothstep(10.0, 80.0, dist))) * k;
      vec3 gN = normalize(vNormal);
      // vNormal is view space; rebuild world geometric normal from it
      vec3 gW = normalize((vec4(gN, 0.0) * viewMatrix).xyz);
      wN = normalize(gW + vec3(dn.x, 0.0, dn.y));
      float NdV = clamp(dot(wN, V), 0.0, 1.0);
      wFr = 0.02 + 0.98 * pow(1.0 - NdV, 5.0);
      // transparency through the water column
      float thick = depth / max(V.y, 0.08);
      wA = 1.0 - exp(-thick * 0.32);
      wA = max(wA, smoothstep(0.0, 1.2, depth) * 0.25);
      // colours
      vec3 deep = vec3(0.006, 0.045, 0.055);
      vec3 shallow = vec3(0.05, 0.22, 0.2);
      vec3 body = mix(shallow, deep, smoothstep(0.3, 7.0, depth));
      // shoreline + crest foam
      float fn = texture2D(uNoise, p * 0.23 + vec2(uTime * 0.012, -uTime * 0.008)).a;
      float fn2 = texture2D(uNoise, p * 0.9 - vec2(uTime * 0.03, 0.0)).b;
      float lap = sin(uTime * 0.9 - depth * 5.5 + fn * 6.0) * 0.5 + 0.5;
      float shore = (1.0 - smoothstep(0.0, 0.75, depth)) * (${fd} >= 0.0 ? 0.0 : 1.0);
      wFoam = shore * smoothstep(0.35, 0.75, fn2 * 0.6 + lap * 0.5 + (0.75 - depth) * 0.45);
      wFoam += vSea * smoothstep(0.2, 0.42, vWaveH) * smoothstep(0.45, 0.75, fn2) * 0.8;
      wFoam = clamp(wFoam, 0.0, 1.0) * smoothstep(-0.05, 0.08, depth + 0.1);
      body = mix(body, vec3(0.8, 0.84, 0.86), wFoam);
      wA = mix(wA, 1.0, wFoam);
      diffuseColor.rgb = body;
      wRough = mix(0.035, 0.16, smoothstep(40.0, 900.0, dist));
      wRough = mix(wRough, 0.7, wFoam);
    `,
    fRough: 'roughnessFactor = wRough;',
    fNormal: 'normal = normalize((viewMatrix * vec4(wN, 0.0)).xyz);',
    fMaps: /* glsl */ `
      #if defined( RE_IndirectSpecular )
      if (uReflOn > 0.5) {
        vec4 rc = uReflMat * vec4(vWPos.x, 0.0, vWPos.z, 1.0);
        vec2 ruv = rc.xy / rc.w + (wN.xz) * 0.035 * (1.0 - wFoam);
        vec3 rcol = texture2D(uRefl, ruv).rgb;
        float edge = smoothstep(0.0, 0.03, ruv.x) * smoothstep(1.0, 0.97, ruv.x) * smoothstep(0.0, 0.03, ruv.y) * smoothstep(1.0, 0.97, ruv.y);
        radiance = mix(radiance, rcol, edge * (1.0 - wFoam));
      }
      #endif
    `,
    fDir: /* glsl */ `
      // sub-surface glow of backlit swell
      reflectedLight.directDiffuse += directLight.color * vec3(0.05, 0.25, 0.2) * vSea * max(vWaveH + 0.15, 0.0)
        * pow(clamp(dot(normalize(cameraPosition - vWPos), -uSunDir), 0.0, 1.0), 3.0) * 1.2;
    `,
    fOut: /* glsl */ `
      outgoingLight = totalSpecular + totalDiffuse * wA + totalEmissiveRadiance;
      diffuseColor.a = clamp(wA + wFr * (1.0 - wA), 0.0, 1.0);
    `,
    fog: /* glsl */ `
      { float ff = fogAmount(vWPos); gl_FragColor.rgb = gl_FragColor.rgb * (1.0 - ff) + fogColorFor(vWPos) * ff * gl_FragColor.a; }
    `,
  });
  return mat;
}

function buildWater() {
  WATER.uWaterN.value = TEX.water;
  WATER.mat = makeWaterMaterial();
  WATER.mesh = new THREE.Mesh(waterGrid(220, 70, 12500), WATER.mat);
  WATER.mesh.frustumCulled = false;
  WATER.mesh.renderOrder = 1;
  WATER.mesh.receiveShadow = true;
  scene.add(WATER.mesh);
  resizeReflection();
}

function resizeReflection() {
  if (WATER.reflRT) { WATER.reflRT.dispose(); WATER.reflRT = null; }
  if (!Qs.refl) { WATER.uReflOn.value = 0; return; }
  const w = Math.max(64, Math.floor(renderer.domElement.width * Qs.refl));
  const h = Math.max(64, Math.floor(renderer.domElement.height * Qs.refl));
  WATER.reflRT = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType });
  WATER.uRefl.value = WATER.reflRT.texture;
  WATER.uReflOn.value = 1;
}

const _rq = new THREE.Vector4(), _plane = new THREE.Plane(), _cp = new THREE.Vector4();
function renderReflection() {
  const cam = camera;
  // follow camera (snapped) so the fine inner rings stay under the viewer
  WATER.mesh.position.set(Math.round(cam.position.x), 0, Math.round(cam.position.z));
  if (!WATER.reflRT || cam.position.y < 0.05) return;
  const rc = WATER.reflCam;
  rc.copy(cam, false);
  rc.position.set(cam.position.x, -cam.position.y, cam.position.z);
  const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
  dir.y = -dir.y;
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
  up.y = -up.y;
  rc.up.copy(up);
  rc.lookAt(rc.position.clone().add(dir));
  rc.updateMatrixWorld();
  rc.projectionMatrix.copy(cam.projectionMatrix);
  // texture matrix (before oblique clip; clip only alters depth)
  WATER.uReflMat.value.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
    .multiply(rc.projectionMatrix).multiply(rc.matrixWorldInverse);
  // oblique near plane = water plane
  _plane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -0.05, 0));
  _plane.applyMatrix4(rc.matrixWorldInverse);
  _cp.set(_plane.normal.x, _plane.normal.y, _plane.normal.z, _plane.constant);
  const pm = rc.projectionMatrix.elements;
  _rq.x = (Math.sign(_cp.x) + pm[8]) / pm[0];
  _rq.y = (Math.sign(_cp.y) + pm[9]) / pm[5];
  _rq.z = -1.0;
  _rq.w = (1.0 + pm[10]) / pm[14];
  _cp.multiplyScalar(2.0 / _cp.dot(_rq));
  pm[2] = _cp.x; pm[6] = _cp.y; pm[10] = _cp.z + 1.0; pm[14] = _cp.w;
  rc.projectionMatrixInverse.copy(rc.projectionMatrix).invert();
  rc.layers.set(0);

  WATER.mesh.visible = false;
  const prevRT = renderer.getRenderTarget();
  renderer.setRenderTarget(WATER.reflRT);
  renderer.clear();
  renderer.render(scene, rc);
  renderer.setRenderTarget(prevRT);
  WATER.mesh.visible = true;
}
