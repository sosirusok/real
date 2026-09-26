// Run with three@0.170.0 installed, or THREE_MODULE pointing to its module file.
// Exercises reflection cleanup after a failed offscreen draw, using actual
// Three.js camera/projection math and a renderer double (no GPU required).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { pathToFileURL } from 'node:url';

const THREE = await import(process.env.THREE_MODULE ? pathToFileURL(process.env.THREE_MODULE).href : 'three');
const camera = new THREE.PerspectiveCamera(60, 5 / 3, 0.1, 14000);
camera.position.set(12, 7, 20);
camera.lookAt(0, 0, 0);
camera.updateMatrixWorld();
const viewport = new THREE.Vector4(11, 13, 800, 500);
const scissor = new THREE.Vector4(21, 23, 400, 300);
const originalTarget = { name: 'main' };
let target = originalTarget, scissorTest = true, face = 2, mip = 1, onRender;
const renderer = {
  domElement: { width: 1000, height: 600 },
  shadowMap: { autoUpdate: true, needsUpdate: true }, xr: { enabled: true },
  state: { buffers: { depth: { setMask() {} } } },
  getRenderTarget: () => target,
  getActiveCubeFace: () => face, getActiveMipmapLevel: () => mip,
  setRenderTarget(rt, f = 0, m = 0) { target = rt; face = f; mip = m; },
  getViewport: (v) => v.copy(viewport), setViewport: (v) => viewport.copy(v),
  getScissor: (v) => v.copy(scissor), setScissor: (v) => scissor.copy(v),
  getScissorTest: () => scissorTest, setScissorTest: (v) => { scissorTest = v; },
  clear() {}, render: () => onRender(),
};
const Qs = { refl: 0.5 };
const context = createContext({ THREE, camera, renderer, Qs,
  RENDER_CAPS: { type: THREE.HalfFloatType }, scene: new THREE.Scene(), console });
runInContext(readFileSync(new URL('../src/05_water.js', import.meta.url), 'utf8') +
  '\nglobalThis.api = { WATER, renderReflection, resizeReflection };', context);
const { WATER, renderReflection, resizeReflection } = context.api;
WATER.mesh = new THREE.Object3D();

function assertRestored() {
  assert.equal(target, originalTarget);
  assert.equal(face, 2); assert.equal(mip, 1);
  assert.deepEqual(viewport.toArray(), [11, 13, 800, 500]);
  assert.deepEqual(scissor.toArray(), [21, 23, 400, 300]);
  assert.equal(scissorTest, true);
  assert.equal(renderer.shadowMap.autoUpdate, true);
  assert.equal(renderer.shadowMap.needsUpdate, true);
  assert.equal(renderer.xr.enabled, true);
}

resizeReflection();
assert.equal(WATER.uRefl.value, null, 'unrendered target must not be sampled');
assert.equal(WATER.uReflOn.value, 0);
onRender = () => {
  assert.equal(target, WATER.reflRT);
  assert.equal(WATER.uRefl.value, null, 'reflection draw must not bind its own colour attachment');
  assert.equal(WATER.uReflOn.value, 0);
  assert.equal(WATER.mesh.visible, false);
  assert.equal(renderer.shadowMap.autoUpdate, false);
  assert.equal(renderer.shadowMap.needsUpdate, false);
  assert.equal(renderer.xr.enabled, false);
  assert.ok(WATER.reflCam.projectionMatrix.elements.every(Number.isFinite));
};
renderReflection();
assertRestored();
assert.equal(WATER.mesh.visible, true);
assert.equal(WATER.uRefl.value, WATER.reflRT.texture);
assert.equal(WATER.uReflOn.value, 1);

onRender = () => { throw new Error('simulated offscreen render failure'); };
WATER.mesh.visible = false;
assert.throws(renderReflection, /simulated offscreen/);
assertRestored();
assert.equal(WATER.mesh.visible, false, 'original visibility is restored, not forced on');
assert.equal(WATER.uRefl.value, null);
assert.equal(WATER.uReflOn.value, 0);

let disposed = 0;
WATER.reflRT.addEventListener('dispose', () => disposed++);
Qs.refl = 0;
resizeReflection();
assert.equal(disposed, 1);
assert.equal(WATER.reflRT, null);
assert.equal(WATER.uRefl.value, null, 'quality switch must not retain a disposed sampler');
assert.equal(WATER.uReflOn.value, 0);
renderReflection();
assertRestored();
console.log('PASS: valid reflection, feedback prevention, exception cleanup, quality disposal');
