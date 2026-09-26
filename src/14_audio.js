// ============================================================================
// Generative soundscape (WebAudio, no samples): wind, waves, fountain,
// songbirds + gulls by day, crickets at night, optional gentle music
// ============================================================================

const AUD = { ctx: null, on: false, music: false };

function noiseBuffer(ctx, type = 'brown', secs = 4) {
  const n = ctx.sampleRate * secs;
  const b = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    if (type === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    else d[i] = w;
  }
  return b;
}
function loopNoise(ctx, buf, filterType, freq, q = 0.7) {
  const src = ctx.createBufferSource();
  src.buffer = buf; src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = filterType; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain(); g.gain.value = 0;
  src.connect(f).connect(g).connect(AUD.master);
  src.start(0, Math.random() * 3);
  return { src, f, g };
}
function reverb(ctx, secs = 3.2) {
  const n = ctx.sampleRate * secs;
  const b = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.6);
  }
  const cv = ctx.createConvolver();
  cv.buffer = b;
  return cv;
}

function initAudio() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return false;
  const ctx = new Ctx();
  AUD.ctx = ctx;
  AUD.master = ctx.createGain();
  AUD.master.gain.value = 0;
  AUD.master.connect(ctx.destination);
  AUD.verb = reverb(ctx);
  AUD.verbGain = ctx.createGain(); AUD.verbGain.gain.value = 0.35;
  AUD.verb.connect(AUD.verbGain).connect(AUD.master);
  const brown = noiseBuffer(ctx, 'brown'), white = noiseBuffer(ctx, 'white', 2);
  AUD.wind = loopNoise(ctx, brown, 'lowpass', 420, 0.5);
  AUD.waves = loopNoise(ctx, brown, 'lowpass', 900, 0.4);
  AUD.fount = loopNoise(ctx, white, 'bandpass', 2400, 0.5);
  AUD.crick = ctx.createOscillator(); AUD.crick.frequency.value = 4300;
  const am = ctx.createOscillator(); am.type = 'square'; am.frequency.value = 28;
  const amG = ctx.createGain(); amG.gain.value = 0.5;
  AUD.crickG = ctx.createGain(); AUD.crickG.gain.value = 0;
  const cg2 = ctx.createGain(); cg2.gain.value = 0.5;
  am.connect(amG).connect(cg2.gain);
  AUD.crick.connect(cg2).connect(AUD.crickG).connect(AUD.master);
  AUD.crick.start(); am.start();
  AUD.musicBus = ctx.createGain(); AUD.musicBus.gain.value = 0;
  AUD.musicBus.connect(AUD.master);
  AUD.musicBus.connect(AUD.verb);
  AUD.nextBird = 0; AUD.nextNote = 0; AUD.nextChord = 0; AUD.chord = 0;
  return true;
}

function setAudio(on) {
  if (on && !AUD.ctx && !initAudio()) return;
  AUD.on = on;
  if (!AUD.ctx) return;
  if (on && AUD.ctx.state === 'suspended') AUD.ctx.resume();
  AUD.master.gain.setTargetAtTime(on ? 0.9 : 0, AUD.ctx.currentTime, 0.4);
}
function setMusic(on) {
  if (on && !AUD.ctx) setAudio(true);
  AUD.music = on;
  if (AUD.ctx) AUD.musicBus.gain.setTargetAtTime(on ? 0.22 : 0, AUD.ctx.currentTime, 1.2);
}

function chirp(t, pan, base) {
  const ctx = AUD.ctx;
  const n = 2 + Math.floor(Math.random() * 5);
  const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  const out = ctx.createGain(); out.gain.value = 0.05 + Math.random() * 0.05;
  if (p) { p.pan.value = pan; out.connect(p).connect(AUD.master); } else out.connect(AUD.master);
  out.connect(AUD.verb);
  for (let i = 0; i < n; i++) {
    const o = ctx.createOscillator(); o.type = 'sine';
    const g = ctx.createGain();
    const t0 = t + i * (0.09 + Math.random() * 0.05);
    const f0 = base * (0.9 + Math.random() * 0.3);
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(f0 * (1.3 + Math.random() * 0.5), t0 + 0.05);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.85, t0 + 0.08);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(1, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.085);
    o.connect(g).connect(out);
    o.start(t0); o.stop(t0 + 0.1);
  }
}
function gullCall(t, pan) {
  const ctx = AUD.ctx;
  const o = ctx.createOscillator(); o.type = 'sawtooth';
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1500; f.Q.value = 3;
  const g = ctx.createGain();
  const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  o.frequency.setValueAtTime(900, t);
  o.frequency.linearRampToValueAtTime(1500, t + 0.12);
  o.frequency.linearRampToValueAtTime(1000, t + 0.45);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.035, t + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
  o.connect(f).connect(g);
  if (p) { p.pan.value = pan; g.connect(p).connect(AUD.master); } else g.connect(AUD.master);
  g.connect(AUD.verb);
  o.start(t); o.stop(t + 0.55);
}
const PENTA = [0, 2, 4, 7, 9];
function note(t, midi, dur, vel) {
  const ctx = AUD.ctx;
  const f = 440 * Math.pow(2, (midi - 69) / 12);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vel, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  for (const [mult, amp, type] of [[1, 1, 'sine'], [2, 0.18, 'sine'], [3, 0.06, 'triangle']]) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = f * mult;
    const og = ctx.createGain(); og.gain.value = amp;
    o.connect(og).connect(g);
    o.start(t); o.stop(t + dur + 0.1);
  }
  g.connect(AUD.musicBus);
}
function pad(t, midis, dur) {
  const ctx = AUD.ctx;
  for (const m of midis) {
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.value = 440 * Math.pow(2, (m - 69) / 12);
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = o.frequency.value * 1.003;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.05, t + dur * 0.4);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(g); o2.connect(g); g.connect(AUD.musicBus);
    o.start(t); o2.start(t); o.stop(t + dur + 0.1); o2.stop(t + dur + 0.1);
  }
}

function updateAudio() {
  if (!AUD.ctx || !AUD.on) return;
  const ctx = AUD.ctx, now = ctx.currentTime;
  const cam = camera.position;
  const w = G.uWind.value.z;
  const day = G.uDay.value, night = G.uNight.value;
  // distances
  const seaD = Math.max(0, 146 - cam.z);
  const seaK = clamp(1 - seaD / 260, 0, 1) * (cam.z > 146 ? 1 : 0.7) + (cam.x < -250 ? 0.4 : 0);
  const F = CITYDATA.fountain;
  const fd = F ? Math.hypot(cam.x - F.x, cam.z - F.z, cam.y - F.y) : 999;
  const alt = clamp(cam.y / 120, 0, 1);
  const swell = 0.6 + 0.4 * Math.sin(now * 0.55) * Math.sin(now * 0.23 + 1);
  AUD.wind.g.gain.setTargetAtTime((0.05 + w * 0.3) * (0.5 + alt * 0.8), now, 0.5);
  AUD.wind.f.frequency.setTargetAtTime(300 + w * 500 + alt * 300, now, 0.5);
  AUD.waves.g.gain.setTargetAtTime(clamp(seaK, 0, 1) * 0.32 * swell * (0.6 + w * 0.6), now, 0.3);
  AUD.fount.g.gain.setTargetAtTime(clamp(1 - fd / 45, 0, 1) * 0.1, now, 0.3);
  AUD.crickG.gain.setTargetAtTime(smoothstep(0.5, 1, night) * 0.012 * (0.5 + 0.5 * Math.sin(now * 0.7)), now, 0.4);
  if (now > AUD.nextBird) {
    AUD.nextBird = now + 1.2 + Math.random() * 4;
    if (day > 0.25 && Math.random() < 0.8) chirp(now + 0.05, Math.random() * 1.6 - 0.8, 2600 + Math.random() * 1800);
    if (day > 0.25 && seaK > 0.3 && Math.random() < 0.25) gullCall(now + 0.2, Math.random() * 1.6 - 0.8);
  }
  if (AUD.music) {
    if (now > AUD.nextChord) {
      const chords = [[57, 64, 69], [53, 60, 65], [55, 62, 67], [52, 59, 64]];
      pad(now + 0.1, chords[AUD.chord % chords.length], 9.5);
      AUD.chord++;
      AUD.nextChord = now + 8;
    }
    if (now > AUD.nextNote) {
      AUD.nextNote = now + 0.9 + Math.random() * 2.4;
      const oct = 72 + (Math.random() < 0.3 ? 12 : 0);
      note(now + 0.05, oct + PENTA[Math.floor(Math.random() * 5)] - 3, 2.8, 0.05 + Math.random() * 0.04);
    }
  }
}
