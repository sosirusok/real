// ============================================================================
// Post-processing: HDR scene (MSAA + depth) -> screen-space sun shafts ->
// bloom -> ACES tone map -> subtle photographic colour grade
// ============================================================================

const postState = { rays: true, bloom: true, grade: true, exposure: 1 };
let composer, renderPass, raysPass, bloomPass, outputPass, gradePass;

const FS_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;
// A single NaN entering a bloom mip chain spreads into screen-sized black
// rectangles. Preserve valid HDR values and contain invalid material output
// before any blur. Comparisons also catch NaN on GLSL ES implementations.
const FINITE_HDR = /* glsl */ `
  vec3 finiteHDR(vec3 c) {
    return vec3(c.r >= 0.0 ? min(c.r, 32000.0) : 0.0,
                c.g >= 0.0 ? min(c.g, 32000.0) : 0.0,
                c.b >= 0.0 ? min(c.b, 32000.0) : 0.0);
  }
`;

class SunShaftsPass extends Pass {
  constructor() {
    super();
    this.needsSwap = true;
    this.rt = new THREE.WebGLRenderTarget(2, 2, { type: RENDER_CAPS.type, depthBuffer: false });
    this.samples = Qs.rays;
    this.maskMat = new THREE.ShaderMaterial({
      defines: { SAMPLES: this.samples },
      uniforms: {
        tColor: { value: null }, tDepth: { value: null },
        uSun: { value: new THREE.Vector2(0.5, 0.5) }, uAspect: { value: 1 }, uDensity: { value: 0.9 },
        uDecay: { value: 0.972 }, uWeight: { value: 1.0 }, uThresh: { value: 1.2 },
      },
      vertexShader: FS_VERT,
      fragmentShader: /* glsl */ `
        ${FINITE_HDR}
        uniform sampler2D tColor;
        uniform sampler2D tDepth;
        uniform vec2 uSun;
        uniform float uAspect, uDensity, uDecay, uWeight, uThresh;
        varying vec2 vUv;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        float occ(vec2 uv) {
          if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 0.0;
          float d = texture2D(tDepth, uv).r;
          if (d < 0.999999) return 0.0;
          vec3 c = finiteHDR(texture2D(tColor, uv).rgb);
          float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
          vec2 dd = uv - uSun; dd.x *= uAspect;
          return min(max(l - uThresh, 0.0), 2.5) * exp(-dot(dd, dd) * 7.0);
        }
        void main() {
          vec2 delta = (vUv - uSun) * uDensity / float(SAMPLES);
          vec2 uv = vUv - delta * hash(gl_FragCoord.xy);
          float illum = 1.0, sum = 0.0;
          for (int i = 0; i < SAMPLES; i++) {
            uv -= delta;
            sum += occ(uv) * illum;
            illum *= uDecay;
          }
          gl_FragColor = vec4(vec3(sum * uWeight / float(SAMPLES)), 1.0);
        }
      `,
      depthTest: false, depthWrite: false,
    });
    this.compMat = new THREE.ShaderMaterial({
      uniforms: { tColor: { value: null }, tRays: { value: null }, uCol: { value: new THREE.Color() }, uStrength: { value: 0 } },
      vertexShader: FS_VERT,
      fragmentShader: /* glsl */ `
        ${FINITE_HDR}
        uniform sampler2D tColor;
        uniform sampler2D tRays;
        uniform vec3 uCol;
        uniform float uStrength;
        varying vec2 vUv;
        void main() {
          vec3 c = finiteHDR(texture2D(tColor, vUv).rgb);
          // Do not sample an uninitialized/stale shaft target when the sun is
          // outside the view. Multiplying an invalid sample by zero is unsafe.
          if (uStrength > 0.001) c += finiteHDR(texture2D(tRays, vUv).rgb) * uCol * uStrength;
          gl_FragColor = vec4(finiteHDR(c), 1.0);
        }
      `,
      depthTest: false, depthWrite: false,
    });
    this.q1 = new FullScreenQuad(this.maskMat);
    this.q2 = new FullScreenQuad(this.compMat);
  }
  setSize(w, h) { this.rt.setSize(Math.max(2, w >> 1), Math.max(2, h >> 1)); this.maskMat.uniforms.uAspect.value = w / h; }
  render(r, writeBuffer, readBuffer) {
    const s = this.compMat.uniforms.uStrength.value;
    this.compMat.uniforms.tColor.value = readBuffer.texture;
    if (s > 0.001) {
      this.maskMat.uniforms.tColor.value = readBuffer.texture;
      this.maskMat.uniforms.tDepth.value = readBuffer.depthTexture;
      r.setRenderTarget(this.rt);
      this.q1.render(r);
      this.compMat.uniforms.tRays.value = this.rt.texture;
    } else {
      this.compMat.uniforms.tRays.value = this.rt.texture;
    }
    r.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.q2.render(r);
  }
  dispose() {
    this.rt.dispose(); this.maskMat.dispose(); this.compMat.dispose();
    this.q1.dispose(); this.q2.dispose();
  }
}

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) },
    uVig: { value: 0.065 }, uSat: { value: 1.01 }, uCon: { value: 1.015 }, uGrain: { value: 0.001 }, uCA: { value: 0 },
    uWarm: { value: new THREE.Vector3(1.005, 1.0, 0.995) }, uShadowTint: { value: new THREE.Vector3(0.99, 1.015, 1.02) },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uVig, uSat, uCon, uGrain, uCA;
    uniform vec2 uRes;
    uniform vec3 uWarm, uShadowTint;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);
      vec2 off = c * uCA * r2 * 4.0;
      vec3 col = vec3(texture2D(tDiffuse, vUv - off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv + off).b);
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(l), col, uSat);
      col = (col - 0.5) * uCon + 0.5;
      col *= mix(uShadowTint, uWarm, smoothstep(0.1, 0.8, l));
      col *= 1.0 - uVig * smoothstep(0.08, 0.62, r2 * 1.5);
      col += (hash(vUv * uRes + fract(uTime) * 91.7) - 0.5) * uGrain;
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }
  `,
};

function buildPost() {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: RENDER_CAPS.type, samples: renderSamples() });
  rt.texture.name = 'Harbor.sceneHDR';
  rt.depthTexture = new THREE.DepthTexture(size.x, size.y);
  rt.depthTexture.type = THREE.UnsignedIntType;
  rt.depthTexture.minFilter = rt.depthTexture.magFilter = THREE.NearestFilter;
  composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(1);
  renderPass = new RenderPass(scene, camera);
  raysPass = new SunShaftsPass();
  bloomPass = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.17, 0.35, 2.2);
  outputPass = new OutputPass();
  gradePass = new ShaderPass(GradeShader);
  composer.addPass(renderPass);
  composer.addPass(raysPass);
  composer.addPass(bloomPass);
  composer.addPass(outputPass);
  composer.addPass(gradePass);
  composer.setSize(size.x, size.y);
}

const _sunNdc = new THREE.Vector3(), _camDir = new THREE.Vector3();
function updatePost(t) {
  const sun = G.uTrueSun.value;
  _sunNdc.copy(sun).multiplyScalar(8000).add(camera.position).project(camera);
  camera.getWorldDirection(_camDir);
  const facing = smoothstep(0.0, 0.35, _camDir.dot(sun));
  const on = _sunNdc.z < 1 ? 1 : 0;
  const sx = _sunNdc.x * 0.5 + 0.5, sy = _sunNdc.y * 0.5 + 0.5;
  const edge = smoothstep(-0.4, 0.05, Math.min(sx, sy, 1 - sx, 1 - sy));
  const elevFade = smoothstep(-2, 4, skyState.elev) * (1 - smoothstep(35, 70, skyState.elev) * 0.6);
  raysPass.maskMat.uniforms.uSun.value.set(sx, sy);
  raysPass.compMat.uniforms.uStrength.value = postState.rays ? 0.3 * facing * on * edge * elevFade : 0;
  raysPass.compMat.uniforms.uCol.value.copy(G.uSunCol.value).multiplyScalar(0.25);
  // The composite also protects the subsequent bloom pass. Turning shafts off
  // sets strength to zero and skips their mask draw, retaining the safe copy.
  raysPass.enabled = true;
  bloomPass.enabled = postState.bloom && RENDER_CAPS.hdr;
  gradePass.enabled = postState.grade;
  gradePass.uniforms.uTime.value = t;
  gradePass.uniforms.uRes.value.set(renderer.domElement.width, renderer.domElement.height);
  // night: cooler shadows
  const n = G.uNight.value;
  gradePass.uniforms.uShadowTint.value.set(lerp(0.99, 0.97, n), 1.0, lerp(1.02, 1.06, n));
  gradePass.uniforms.uWarm.value.set(lerp(1.015, 1.025, n), 1.0, lerp(0.985, 0.96, n));
}
