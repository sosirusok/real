// ============================================================================
// Sky: time-of-day palette, scattering-style gradient, volumetric clouds,
// sun/moon discs, stars. Sun/moon directional light + IBL environment.
// ============================================================================

const SKY_KEYS = [
  // elev(deg), zenith, horizon, glow, sunLight colour, sunLight intensity, env intensity, exposure, fogDensity
  { e: -24, zen: [0.004, 0.007, 0.018], hor: [0.012, 0.018, 0.036], glow: [0.01, 0.012, 0.03], sun: [0.55, 0.66, 0.95], si: 0.34, env: 0.55, exp: 1.5, fog: 0.00032 },
  { e: -10, zen: [0.012, 0.024, 0.07], hor: [0.07, 0.07, 0.13], glow: [0.18, 0.08, 0.12], sun: [0.55, 0.66, 0.95], si: 0.22, env: 0.6, exp: 1.35, fog: 0.00036 },
  { e: -3, zen: [0.035, 0.07, 0.19], hor: [0.42, 0.24, 0.22], glow: [0.95, 0.32, 0.14], sun: [1.0, 0.42, 0.18], si: 0.2, env: 0.65, exp: 1.15, fog: 0.00028 },
  { e: 2, zen: [0.08, 0.16, 0.38], hor: [0.95, 0.52, 0.30], glow: [1.6, 0.62, 0.22], sun: [1.0, 0.50, 0.22], si: 2.2, env: 0.72, exp: 0.88, fog: 0.00030 },
  { e: 8, zen: [0.12, 0.26, 0.56], hor: [0.95, 0.72, 0.52], glow: [1.25, 0.72, 0.36], sun: [1.0, 0.68, 0.40], si: 3.0, env: 0.85, exp: 0.82, fog: 0.00026 },
  { e: 20, zen: [0.11, 0.28, 0.66], hor: [0.66, 0.74, 0.84], glow: [0.7, 0.6, 0.45], sun: [1.0, 0.86, 0.70], si: 3.4, env: 0.95, exp: 0.86, fog: 0.00021 },
  { e: 45, zen: [0.08, 0.25, 0.66], hor: [0.55, 0.68, 0.86], glow: [0.5, 0.5, 0.45], sun: [1.0, 0.95, 0.88], si: 3.7, env: 1.0, exp: 0.84, fog: 0.00018 },
  { e: 90, zen: [0.07, 0.23, 0.64], hor: [0.52, 0.66, 0.86], glow: [0.45, 0.45, 0.42], sun: [1.0, 0.97, 0.93], si: 3.8, env: 1.0, exp: 0.84, fog: 0.00017 },
];
function skyPalette(elevDeg) {
  let a = SKY_KEYS[0], b = SKY_KEYS[SKY_KEYS.length - 1];
  for (let i = 0; i < SKY_KEYS.length - 1; i++) {
    if (elevDeg >= SKY_KEYS[i].e && elevDeg <= SKY_KEYS[i + 1].e) { a = SKY_KEYS[i]; b = SKY_KEYS[i + 1]; break; }
  }
  if (elevDeg < SKY_KEYS[0].e) b = a;
  const t = a === b ? 0 : smoothstep(0, 1, (elevDeg - a.e) / (b.e - a.e));
  const mix3 = (p, q) => [lerp(p[0], q[0], t), lerp(p[1], q[1], t), lerp(p[2], q[2], t)];
  return {
    zen: mix3(a.zen, b.zen), hor: mix3(a.hor, b.hor), glow: mix3(a.glow, b.glow), sun: mix3(a.sun, b.sun),
    si: lerp(a.si, b.si, t), env: lerp(a.env, b.env, t), exp: lerp(a.exp, b.exp, t), fog: lerp(a.fog, b.fog, t),
  };
}

const SKY_GLSL = /* glsl */ `
uniform vec3 uGlow;
uniform vec3 uSunDisc;
uniform vec3 uMoonDir;
uniform sampler3D uCloud3D;
uniform float uCloudSteps;
uniform float uStars;
uniform float uFrame;

float hgPhase(float c, float g) { float g2 = g * g; return (1.0 - g2) / (4.0 * 3.14159 * pow(1.0 + g2 - 2.0 * g * c, 1.5)); }

vec3 skyBase(vec3 d) {
  float y = max(d.y, 0.0);
  vec3 sd = uTrueSun;
  vec2 dh = normalize(d.xz + 1e-5), sh = normalize(sd.xz + 1e-5);
  float az = max(dot(dh, sh), 0.0);
  float azs = dot(dh, sh) * 0.5 + 0.5;
  vec3 horC = mix(mix(uHorizon, uZenith * 1.35 + vec3(0.02), 0.42), uHorizon, pow(azs, 1.6));
  vec3 col = mix(horC, uZenith, pow(y, 0.5));
  float c = dot(d, sd);
  float sunUp = smoothstep(-0.25, 0.05, sd.y);
  col += uGlow * pow(az, 4.0) * exp(-y * 6.0) * 0.9 * sunUp;
  col += uGlow * hgPhase(c, 0.76) * 0.55 * sunUp;
  col += uGlow * pow(max(c, 0.0), 3.0) * 0.12 * sunUp;
  // horizon haze band
  col = mix(col, horC * 1.05, exp(-y * 30.0) * 0.4);
  if (d.y < 0.0) col = mix(horC, horC * 0.55 + uZenith * 0.1, smoothstep(0.0, -0.3, d.y));
  return col;
}

float cloudDensity(vec3 p, float detail) {
  float h = clamp((p.y - 1500.0) / 750.0, 0.0, 1.0);
  float cov = cloudCov(p.xz);
  if (cov < 0.01) return 0.0;
  float top = 0.3 + 0.7 * cov;
  float profile = smoothstep(0.0, 0.08, h) * (1.0 - smoothstep(top * 0.55, top, h));
  vec3 q = vec3((p.x + uCloudOff.x * 0.4) * 0.00024, p.y * 0.0007, (p.z + uCloudOff.y * 0.4) * 0.00024);
  float shape = textureLod(uCloud3D, q, 0.0).r;
  float d = cov * profile * 1.3 - 0.32 + (shape - 0.5) * 0.75;
  if (detail > 0.5 && d > 0.0) {
    float det = textureLod(uCloud3D, p * vec3(0.0019, 0.0026, 0.0019) + vec3(uTime * 0.004, 0.0, 0.0), 0.0).r;
    d -= (1.0 - det) * 0.22 * (1.0 - clamp(d * 2.5, 0.0, 1.0));
  }
  return clamp(d, 0.0, 1.0);
}

vec4 flatClouds(vec3 ro, vec3 rd, vec3 sunCol, float phase, vec3 amb, float t0) {
  vec3 p = ro + rd * t0;
  float d = cloudDensity(vec3(p.x, 1690.0, p.z), 0.0);
  float d2 = cloudDensity(vec3(p.x, 1880.0, p.z) + vec3(rd.x, 0.0, rd.z) * 300.0, 0.0);
  float a = smoothstep(0.0, 0.25, max(d, d2)) * 0.96;
  float thick = clamp(d + d2, 0.0, 1.0);
  vec3 col = amb * (0.55 + 0.45 * (1.0 - thick)) + sunCol * phase * (0.9 - thick * 0.45) * 0.8;
  return vec4(col * a, a);
}

vec4 renderClouds(vec3 ro, vec3 rd, vec3 sunCol, float jitter) {
  if (rd.y < 0.012) return vec4(0.0);
  float t0 = (1500.0 - ro.y) / rd.y;
  float farK = smoothstep(3500.0, 8000.0, t0);
  float t1 = (2250.0 - ro.y) / rd.y;
  if (t0 < 0.0) t0 = 0.0;
  t1 = min(t1, t0 + 5200.0);
  float steps = uCloudSteps;
  float dt = (t1 - t0) / steps;
  float T = 1.0;
  vec3 acc = vec3(0.0);
  vec3 L = uTrueSun.y > -0.05 ? uTrueSun : uMoonDir;
  float c = dot(rd, L);
  float phase = mix(hgPhase(c, 0.62), hgPhase(c, -0.18), 0.35) * 4.0 * 3.14159;
  vec3 amb = mix(uHorizon, uZenith, 0.5) * 1.3 + vec3(0.02);
  float t = t0 + dt * jitter;
  if (farK > 0.999) {
    vec4 fc = flatClouds(ro, rd, sunCol, phase, amb, t0);
    float fade = exp(-t0 * 0.00007);
    return vec4(fc.rgb * fade, fc.a * fade);
  }
  for (int i = 0; i < 40; i++) {
    if (float(i) >= steps) break;
    vec3 p = ro + rd * t;
    float dens = cloudDensity(p, 1.0);
    if (dens > 0.001) {
      float ld = 0.0;
      for (int k = 1; k <= 4; k++) ld += cloudDensity(p + L * float(k * k) * 40.0, 0.0);
      float beer = exp(-ld * 1.6) ;
      float powder = 1.0 - exp(-dens * 4.0) * 0.8;
      float h = clamp((p.y - 1500.0) / 750.0, 0.0, 1.0);
      vec3 lit = sunCol * beer * powder * phase * 1.7 + amb * (0.45 + 0.55 * h);
      float a = 1.0 - exp(-dens * dt * 0.012);
      acc += T * a * lit;
      T *= 1.0 - a;
      if (T < 0.02) break;
    }
    t += dt;
  }
  vec4 res = vec4(acc, 1.0 - T);
  if (farK > 0.001) res = mix(res, flatClouds(ro, rd, sunCol, phase, amb, t0), farK);
  float fade = exp(-t0 * 0.00007);
  return vec4(res.rgb * fade, res.a * fade);
}

vec3 starField(vec3 d) {
  vec3 p = d * 280.0;
  vec3 cell = floor(p);
  float h = hash12(cell.xy + cell.z * 17.13);
  vec3 f = fract(p) - 0.5;
  float star = 0.0;
  if (h > 0.985) {
    float tw = 0.6 + 0.4 * sin(uTime * (1.0 + h * 5.0) + h * 40.0);
    star = smoothstep(0.18, 0.0, length(f)) * tw * (h - 0.985) * 90.0;
  }
  // faint milky way band
  float band = exp(-pow(dot(d, normalize(vec3(0.3, 0.2, -0.93))) * 3.2, 2.0));
  float mw = texture2D(uNoise, d.xz * 1.7 + d.y).b * band;
  return vec3(0.8, 0.85, 1.0) * star + vec3(0.12, 0.13, 0.18) * mw * mw * 0.35;
}
`;

let skyMesh, sunLight, skyMat;
const skyState = { hour: 16.85, elev: 10, flow: false, flowRate: 1 / 60, cover: 0.42, envDirty: true, lastEnvElev: 999, lastEnvCover: -1 };

function buildSky() {
  skyMat = new THREE.ShaderMaterial({
    uniforms: {
      ...G,
      uGlow: { value: new THREE.Color() },
      uSunDisc: { value: new THREE.Color() },
      uMoonDir: { value: new THREE.Vector3() },
      uCloud3D: { value: TEX.cloud3d },
      uCloudSteps: { value: Qs.cloudSteps },
      uStars: { value: 0 },
      uFrame: { value: 0 },
      uEnvPass: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }
    `,
    fragmentShader: /* glsl */ `
      ${GLSL_COMMON}
      ${SKY_GLSL}
      uniform float uEnvPass;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        vec3 col = skyBase(d);
        float night = uStars;
        if (night > 0.001 && d.y > 0.0) col += starField(d) * night;
        // moon
        float cm = dot(d, uMoonDir);
        if (night > 0.001) {
          float md = smoothstep(0.99955, 0.99975, cm);
          float mare = texture2D(uNoise, (d.xz - uMoonDir.xz) * 60.0).g;
          col += vec3(1.0, 0.97, 0.9) * md * (0.9 + mare * 0.4) * 1.6 * night;
          col += vec3(0.25, 0.3, 0.45) * pow(max(cm, 0.0), 400.0) * 0.4 * night;
        }
        // sun disc (limb darkened), hidden by clouds below
        float cs = dot(d, uTrueSun);
        float disc = smoothstep(0.99962, 0.9998, cs);
        vec3 sunC = uSunDisc * disc * (1.0 - uEnvPass * 0.97);
        vec3 camPos = vec3(cameraPosition.x, max(cameraPosition.y, 2.0), cameraPosition.z);
        float j = hash12(gl_FragCoord.xy + fract(uFrame * 0.618) * 100.0);
        vec3 sunLightCol = uSunCol;
        if (uTrueSun.y < -0.05) sunLightCol = vec3(0.25, 0.3, 0.42) * 0.4;
        else sunLightCol = uSunCol * 1.25 + vec3(0.25, 0.1, 0.05) * uGlow;
        vec4 cl = renderClouds(camPos, d, sunLightCol, j);
        col = col * (1.0 - cl.a) + cl.rgb + sunC * (1.0 - cl.a);
        // horizon fog to match terrain fog
        float hz = exp(-max(d.y, 0.0) * 16.0);
        col = mix(col, fogColorDir(d), hz * 0.5);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: true,
  });
  skyMesh = new THREE.Mesh(new THREE.SphereGeometry(10000, 48, 24), skyMat);
  skyMesh.frustumCulled = false;
  skyMesh.renderOrder = -10;
  scene.add(skyMesh);

  sunLight = new THREE.DirectionalLight(0xffffff, 3);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(Qs.shadow, Qs.shadow);
  sunLight.shadow.bias = -0.0004;
  sunLight.shadow.normalBias = 0.05;
  sunLight.shadow.camera.near = 1;
  sunLight.shadow.camera.far = 2400;
  scene.add(sunLight);
  scene.add(sunLight.target);
}

// environment map from the sky (clouds included)
let pmrem, envRT, envScene, envSky;
function initEnv() {
  pmrem = new THREE.PMREMGenerator(renderer);
  envScene = new THREE.Scene();
  envSky = new THREE.Mesh(skyMesh.geometry, skyMat);
  envSky.frustumCulled = false;
  envScene.add(envSky);
}
function updateEnv() {
  skyMat.uniforms.uEnvPass.value = 1;
  const steps = skyMat.uniforms.uCloudSteps.value;
  skyMat.uniforms.uCloudSteps.value = 10;
  const old = envRT;
  envRT = pmrem.fromScene(envScene, 0, 1, 20000);
  scene.environment = envRT.texture;
  if (old) old.dispose();
  skyMat.uniforms.uEnvPass.value = 0;
  skyMat.uniforms.uCloudSteps.value = steps;
}

const _v = new THREE.Vector3();
function sunDirection(hour) {
  const a = ((hour - 6) / 12) * Math.PI;
  const lat = THREE.MathUtils.degToRad(30);
  _v.set(Math.cos(a), Math.sin(a) * Math.cos(lat) - 0.1, Math.sin(a) * Math.sin(lat) + 0.3);
  return _v.normalize().clone();
}

function updateSky(dt) {
  if (skyState.flow) skyState.hour = (skyState.hour + dt * skyState.flowRate) % 24;
  const sd = sunDirection(skyState.hour);
  const elev = THREE.MathUtils.radToDeg(Math.asin(sd.y));
  skyState.elev = elev;
  const P = skyPalette(elev);
  const moon = sd.clone().multiplyScalar(-1);
  moon.y = Math.abs(moon.y) * 0.8 + 0.25; moon.normalize();
  const night = smoothstep(-2, -12, elev);
  G.uNight.value = smoothstep(1, -6, elev);
  G.uDay.value = smoothstep(-8, 20, elev);
  G.uTrueSun.value.copy(sd);
  G.uZenith.value.setRGB(...P.zen);
  G.uHorizon.value.setRGB(...P.hor);
  skyMat.uniforms.uGlow.value.setRGB(...P.glow);
  skyMat.uniforms.uMoonDir.value.copy(moon);
  skyMat.uniforms.uStars.value = night;
  skyMat.uniforms.uSunDisc.value.setRGB(P.sun[0] * 28, P.sun[1] * 26, P.sun[2] * 24).multiplyScalar(smoothstep(-1.5, 1, elev));

  // light = sun by day, moon by night (crossfade through twilight)
  const useMoon = elev < -4;
  const ldir = useMoon ? moon : sd;
  let li = P.si;
  if (!useMoon) li *= smoothstep(-4, 1.5, elev);
  else li *= smoothstep(-4, -10, elev);
  G.uSunDir.value.copy(ldir);
  G.uSunCol.value.setRGB(...P.sun).multiplyScalar(li);
  sunLight.color.setRGB(...P.sun);
  sunLight.intensity = li;

  // fog colours follow the horizon; sun side gets warm glow
  G.uFogCol.value.setRGB(P.hor[0] * 0.95, P.hor[1] * 0.97, P.hor[2]);
  G.uFogSunCol.value.setRGB(P.hor[0] + P.glow[0] * 0.3, P.hor[1] + P.glow[1] * 0.25, P.hor[2] + P.glow[2] * 0.15);
  G.uFogDensity.value = P.fog * (1 + skyState.cover * 0.6);
  G.uCloudCover.value = skyState.cover;
  scene.environmentIntensity = P.env;
  renderer.toneMappingExposure = P.exp * (postState.exposure || 1);

  skyMat.uniforms.uFrame.value++;
  if (Math.abs(elev - skyState.lastEnvElev) > 0.6 || Math.abs(skyState.cover - skyState.lastEnvCover) > 0.03) {
    skyState.lastEnvElev = elev;
    skyState.lastEnvCover = skyState.cover;
    skyState.envDirty = true;
  }
}
