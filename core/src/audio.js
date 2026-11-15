// Web Audio engine: master bus with soft limiter + synthesized convolution reverb, and generative helpers.
// Everything is synthesized; no audio files. Created only after a user gesture (or attempted on door arrival).
import { makeRng } from './math.js';

export function createAudio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  const ac = new AC({ latencyHint: 'playback' });
  const rng = makeRng((Math.random() * 1e9) | 0);
  const master = ac.createGain(); master.gain.value = 0;
  const limiter = ac.createDynamicsCompressor();
  limiter.threshold.value = -10; limiter.knee.value = 8; limiter.ratio.value = 8; limiter.attack.value = 0.01; limiter.release.value = 0.4;
  const volume = ac.createGain(); volume.gain.value = 1;
  master.connect(limiter); limiter.connect(volume); volume.connect(ac.destination);
  const out = ac.createGain(); out.connect(master);                // dry world bus
  const wet = ac.createGain();                                       // reverb send
  const conv = ac.createConvolver(); const wetGain = ac.createGain(); wetGain.gain.value = 0.9;
  wet.connect(conv); conv.connect(wetGain); wetGain.connect(master);

  const noiseBufs = {};
  function noiseBuffer(color = 'pink') {
    if (noiseBufs[color]) return noiseBufs[color];
    const len = ac.sampleRate * 7, b = ac.createBuffer(1, len, ac.sampleRate), d = b.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (color === 'white') d[i] = w * 0.5;
      else if (color === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
      else { // pink (Paul Kellet)
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
      }
    }
    // crossfade the loop seam
    const fade = 4096; for (let i = 0; i < fade; i++) { const t = i / fade; d[len - fade + i] = d[len - fade + i] * (1 - t) + d[i] * t; }
    return (noiseBufs[color] = b);
  }

  function setReverb({ seconds = 3.5, damp = 0.55, wet: w = 0.9, predelay = 0.02 } = {}) {
    const sr = ac.sampleRate, len = Math.floor(sr * seconds), ir = ac.createBuffer(2, len, sr);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c); let lp = 0;
      const pre = Math.floor(predelay * sr);
      for (let i = pre; i < len; i++) {
        const t = (i - pre) / sr, env = Math.pow(1 - (i - pre) / (len - pre), 2) * Math.exp(-t * 3 / seconds);
        const k = 0.05 + 0.9 * Math.pow(1 - damp, 1 + t * 3);      // high frequencies decay faster
        lp += (Math.random() * 2 - 1 - lp) * k; d[i] = lp * env;
      }
    }
    conv.buffer = ir; wetGain.gain.setTargetAtTime(w, ac.currentTime, 0.1);
  }
  setReverb();

  const now = () => ac.currentTime;
  const param = (p, v, tc = 0.5, at = ac.currentTime) => { p.cancelScheduledValues(at); p.setTargetAtTime(v, at, tc); };
  const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
  const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], lydian: [0, 2, 4, 6, 7, 9, 11],
    pentatonic: [0, 2, 4, 7, 9], minorPentatonic: [0, 3, 5, 7, 10], mixolydian: [0, 2, 4, 5, 7, 9, 10] };
  const scale = (root, name = 'pentatonic', octaves = 2) => { const s = SCALES[name], r = []; for (let o = 0; o < octaves; o++) for (const x of s) r.push(root + 12 * o + x); return r; };

  // routing: every voice ends in a bus. bus({gain, reverb, pan, parent}) -> { input, gain, set(g, tc) }
  function bus({ gain = 1, reverb = 0.35, pan = 0, parent = null } = {}) {
    const input = ac.createGain(); const g = ac.createGain(); g.gain.value = gain;
    const p = ac.createStereoPanner(); p.pan.value = pan;
    input.connect(g); g.connect(p);
    if (parent) p.connect(parent.input);
    else {
      p.connect(out);
      const s = ac.createGain(); s.gain.value = reverb; p.connect(s); s.connect(wet);
    }
    return { input, gain: g, panner: p, set: (v, tc = 1) => param(g.gain, v, tc) };
  }
  const defaultBus = bus({ reverb: 0.35 });
  const route = (o) => (o.bus ? o.bus.input : (o.reverb !== undefined || o.pan !== undefined) ? bus({ reverb: o.reverb ?? 0.35, pan: o.pan ?? 0 }).input : defaultBus.input);

  // positional source: spatial({pos:[x,y,z], ref=5, rolloff=1, reverb}) -> bus-like {input, gain, set, setPos}
  function spatial({ pos = [0, 0, 0], ref = 5, rolloff = 1, maxDistance = 200, reverb = 0.35, gain = 1 } = {}) {
    const input = ac.createGain(); const g = ac.createGain(); g.gain.value = gain;
    const pn = ac.createPanner(); pn.panningModel = 'equalpower'; pn.distanceModel = 'inverse';
    pn.refDistance = ref; pn.rolloffFactor = rolloff; pn.maxDistance = maxDistance;
    pn.positionX.value = pos[0]; pn.positionY.value = pos[1]; pn.positionZ.value = pos[2];
    input.connect(g); g.connect(pn); pn.connect(out);
    const s = ac.createGain(); s.gain.value = reverb; pn.connect(s); s.connect(wet);
    return { input, gain: g, set: (v, tc = 1) => param(g.gain, v, tc), setPos: (x, y, z) => { pn.positionX.value = x; pn.positionY.value = y; pn.positionZ.value = z; } };
  }

  // slow non-periodic modulation: two incommensurate LFOs summed into an AudioParam
  function wander(target, depth, rate = 0.05) {
    for (const [r, d] of [[rate, 0.6], [rate * 0.37 + 0.003, 0.4]]) {
      const o = ac.createOscillator(); o.frequency.value = r * (0.8 + rng() * 0.4);
      const g = ac.createGain(); g.gain.value = depth * d; o.connect(g); g.connect(target); o.start(now() + rng() * 2);
    }
  }

  // continuous filtered noise (wind, water, surf, rain...)
  function noiseBed(o = {}) {
    const src = ac.createBufferSource(); src.buffer = noiseBuffer(o.color || 'pink'); src.loop = true;
    const f = ac.createBiquadFilter(); f.type = o.filter || 'lowpass'; f.frequency.value = o.freq ?? 800; f.Q.value = o.q ?? 0.7;
    const g = ac.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(route(o));
    if (o.mod !== 0) wander(f.frequency, (o.freq ?? 800) * (o.mod ?? 0.35), o.modRate ?? 0.06);
    const base = o.gain ?? 0.15;
    if (o.gainMod !== 0) { wander(g.gain, base * (o.gainMod ?? 0.35), (o.modRate ?? 0.06) * 1.3); }
    src.start(now(), rng() * 6);
    param(g.gain, base, o.attack ?? 2);
    return { source: src, filter: f, gain: g, set: (v, tc = 1) => param(g.gain, v, tc), setFreq: (v, tc = 1) => param(f.frequency, v, tc), stop: (t = 2) => { param(g.gain, 0, t / 3); src.stop(now() + t); } };
  }

  // sustained drone: detuned oscillator pairs on harmonic partials with slow breathing
  function drone(o = {}) {
    const g = ac.createGain(); g.gain.value = 0;
    const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.cutoff ?? 900; f.Q.value = 0.5;
    f.connect(g); g.connect(route(o));
    const freq = o.freq ?? 55, partials = o.partials || [1, 2, 3, 4.01], det = o.detune ?? 7;
    const oscs = [];
    partials.forEach((p, i) => {
      for (const s of [-1, 1]) {
        const os = ac.createOscillator(); os.type = o.type || 'sine'; os.frequency.value = freq * p; os.detune.value = s * det * (1 + rng() * 0.3);
        const pg = ac.createGain(); pg.gain.value = (o.amps ? o.amps[i] : 1 / (i + 1)) * 0.5;
        wander(pg.gain, pg.gain.value * 0.5, 0.03 + rng() * 0.04);
        os.connect(pg); pg.connect(f); os.start(); oscs.push(os);
      }
    });
    wander(f.frequency, (o.cutoff ?? 900) * 0.3, 0.02);
    param(g.gain, o.gain ?? 0.08, o.attack ?? 4);
    return { gain: g, filter: f, oscs, set: (v, tc = 2) => param(g.gain, v, tc),
      setFreq: (v, tc = 2) => oscs.forEach((os, i) => param(os.frequency, v * partials[i >> 1], tc)),
      stop: (t = 4) => { param(g.gain, 0, t / 3); oscs.forEach((os) => os.stop(now() + t)); } };
  }

  // evolving pad: plays chords (arrays of midi notes), crossfading to a random next chord every `change` [min,max] seconds
  function pad(o = {}) {
    const chords = o.chords || [[48, 55, 60, 64]], bus0 = bus({ gain: 1, reverb: o.reverb ?? 0.6, pan: o.pan ?? 0, parent: o.bus || null });
    const level = o.gain ?? 0.05, attack = o.attack ?? 5;
    let voices = [], stopped = false, timer = 0;
    function play(ch) {
      const old = voices; voices = [];
      for (const v of old) { param(v.g.gain, 0, attack / 3); v.oscs.forEach((x) => x.stop(now() + attack * 2)); }
      for (const m of ch) {
        const g = ac.createGain(); g.gain.value = 0;
        const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.cutoff ?? 1400; f.Q.value = 0.3;
        const oscs = [];
        for (const d of [-6, 5]) { const os = ac.createOscillator(); os.type = o.type || 'triangle'; os.frequency.value = hz(m); os.detune.value = d + rng() * 3; os.connect(f); os.start(); oscs.push(os); }
        f.connect(g); g.connect(bus0.input);
        param(g.gain, level / ch.length, attack / 3);
        voices.push({ g, oscs });
      }
    }
    function next() {
      if (stopped) return;
      play(chords[Math.floor(rng() * chords.length)]);
      const [a, b] = o.change || [14, 26];
      timer = setTimeout(next, (a + rng() * (b - a)) * 1000);
    }
    next();
    return { bus: bus0, set: bus0.set, stop: () => { stopped = true; clearTimeout(timer); play([]); } };
  }

  // ---- one-shot voices (all accept { gain, pan, reverb, bus, when }) ----
  function env(g, when, attack, decay, peak) {
    g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(peak, when + attack);
    g.gain.setTargetAtTime(0, when + attack, decay / 4);
  }
  // FM bell / chime
  function bell(o = {}) {
    const t = o.when ?? now(), f0 = o.freq ?? 880, decay = o.decay ?? 3, out0 = ac.createGain();
    const car = ac.createOscillator(); car.frequency.value = f0;
    const mod = ac.createOscillator(); mod.frequency.value = f0 * (o.ratio ?? 3.5);
    const mg = ac.createGain(); mg.gain.setValueAtTime(f0 * (o.index ?? 2), t); mg.gain.setTargetAtTime(0, t, decay / 5);
    mod.connect(mg); mg.connect(car.frequency); car.connect(out0); out0.connect(route(o));
    env(out0, t, o.attack ?? 0.005, decay, o.gain ?? 0.06);
    car.start(t); mod.start(t); car.stop(t + decay * 1.6); mod.stop(t + decay * 1.6);
  }
  // generic FM voice: { carrier, ratio, index, attack, decay }
  const fm = (o = {}) => bell({ freq: o.carrier ?? o.freq, ...o });
  // additive tone: partials = [amp1, amp2, ...] on integer harmonics (or o.ratios)
  function additive(o = {}) {
    const t = o.when ?? now(), f0 = o.freq ?? 440, parts = o.partials || [1, 0.5, 0.25], decay = o.decay ?? 2, g = ac.createGain();
    g.connect(route(o)); env(g, t, o.attack ?? 0.02, decay, o.gain ?? 0.05);
    parts.forEach((a, i) => {
      const os = ac.createOscillator(); os.frequency.value = f0 * (o.ratios ? o.ratios[i] : i + 1);
      const pg = ac.createGain(); pg.gain.value = a; os.connect(pg); pg.connect(g); os.start(t); os.stop(t + decay * 1.6);
    });
  }
  // soft plucked string (Karplus-free: filtered decaying triangle)
  function pluck(o = {}) {
    const t = o.when ?? now(), decay = o.decay ?? 1.5, g = ac.createGain(), f = ac.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.setValueAtTime((o.freq ?? 440) * 6, t); f.frequency.setTargetAtTime(o.freq ?? 440, t, decay / 4);
    const os = ac.createOscillator(); os.type = 'triangle'; os.frequency.value = o.freq ?? 440;
    os.connect(f); f.connect(g); g.connect(route(o)); env(g, t, 0.004, decay, o.gain ?? 0.06); os.start(t); os.stop(t + decay * 1.6);
  }
  // bird-like chirp: pitch sweep f0->f1 with vibrato, optionally repeated n times
  function chirp(o = {}) {
    const t0 = o.when ?? now(), n = o.repeat ?? 1, dur = o.dur ?? 0.12, gap = o.gap ?? 0.06;
    const r = route(o);
    for (let i = 0; i < n; i++) {
      const t = t0 + i * (dur + gap), os = ac.createOscillator(), g = ac.createGain();
      const f0 = (o.f0 ?? 2600) * (1 + (rng() - 0.5) * 0.06), f1 = (o.f1 ?? 3800) * (1 + (rng() - 0.5) * 0.06);
      os.frequency.setValueAtTime(f0, t); os.frequency.exponentialRampToValueAtTime(f1, t + dur);
      const vib = ac.createOscillator(); vib.frequency.value = o.vibRate ?? 28; const vg = ac.createGain(); vg.gain.value = o.vib ?? 80;
      vib.connect(vg); vg.connect(os.frequency);
      os.connect(g); g.connect(r);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(o.gain ?? 0.025, t + dur * 0.25); g.gain.linearRampToValueAtTime(0, t + dur);
      os.start(t); vib.start(t); os.stop(t + dur + 0.05); vib.stop(t + dur + 0.05);
    }
  }
  // filtered-noise swell (whoosh, wave, gust)
  function whoosh(o = {}) {
    const t = o.when ?? now(), dur = o.dur ?? 3, src = ac.createBufferSource(); src.buffer = noiseBuffer(o.color || 'pink');
    const f = ac.createBiquadFilter(); f.type = o.filter || 'bandpass'; f.Q.value = o.q ?? 0.8;
    f.frequency.setValueAtTime(o.f0 ?? 300, t); f.frequency.exponentialRampToValueAtTime(o.f1 ?? 1200, t + dur * 0.5); f.frequency.exponentialRampToValueAtTime(o.f0 ?? 300, t + dur);
    const g = ac.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(o.gain ?? 0.08, t + dur * (o.peak ?? 0.45)); g.gain.linearRampToValueAtTime(0, t + dur);
    src.connect(f); f.connect(g); g.connect(route(o)); src.start(t, rng() * 5); src.stop(t + dur + 0.1);
  }

  // sparse random events: every(min, max, fn) calls fn(when) at random intervals. Returns { stop }.
  const timers = new Set();
  function every(min, max, fn, { startDelay } = {}) {
    let id = 0, stopped = false;
    const tick = () => { if (stopped) return; if (ac.state === 'running') fn(now() + 0.05); id = setTimeout(tick, (min + rng() * (max - min)) * 1000); };
    id = setTimeout(tick, (startDelay ?? min + rng() * (max - min)) * 1000);
    const h = { stop: () => { stopped = true; clearTimeout(id); timers.delete(h); } }; timers.add(h); return h;
  }

  // core sounds
  function creak(dur = 1.5) {
    const t = now() + 0.02, os = ac.createOscillator(); os.type = 'sawtooth';
    const N = 48, fc = new Float32Array(N), gc = new Float32Array(N); let f = 38;
    for (let i = 0; i < N; i++) { f = Math.min(85, Math.max(22, f + (rng() - 0.45) * 14)); fc[i] = f; const x = i / (N - 1); gc[i] = Math.sin(Math.PI * Math.min(1, x * 1.15)) * (0.55 + 0.45 * rng()) * (x < 0.92 ? 1 : 0.2); }
    os.frequency.setValueCurveAtTime(fc, t, dur);
    const b1 = ac.createBiquadFilter(); b1.type = 'bandpass'; b1.frequency.value = 620; b1.Q.value = 5;
    const b2 = ac.createBiquadFilter(); b2.type = 'bandpass'; b2.frequency.value = 1450; b2.Q.value = 7;
    const g = ac.createGain(); g.gain.value = 0; g.gain.setValueCurveAtTime(gc.map((v) => v * 0.09), t, dur);
    const r = bus({ reverb: 0.4, gain: 1 }).input;
    os.connect(b1); os.connect(b2); b1.connect(g); b2.connect(g); g.connect(r);
    os.start(t); os.stop(t + dur + 0.1);
    // soft wooden settle at the end
    additive({ freq: 92, partials: [1, 0.35, 0.2], ratios: [1, 2.3, 3.9], attack: 0.01, decay: 0.5, gain: 0.05, when: t + dur * 0.97 });
  }

  let vol = 1, muted = false;
  const engine = {
    ctx: ac, out, wet, master, rng, now, param, hz, scale, bus, spatial, wander, noiseBed, drone, pad, bell, fm, additive, pluck, chirp, whoosh, every,
    noiseBuffer, setReverb, creak,
    fadeIn: (sec = 3) => param(master.gain, 1, sec / 3),
    fadeOut: (sec = 1) => param(master.gain, 0, sec / 3),
    setVolume(v) { vol = v; param(volume.gain, muted ? 0 : vol * vol, 0.1); },
    setMuted(m) { muted = m; param(volume.gain, muted ? 0 : vol * vol, 0.2); },
    get muted() { return muted; },
    setListener(pos, fwd, up) {
      const l = ac.listener;
      if (l.positionX) {
        l.positionX.value = pos[0]; l.positionY.value = pos[1]; l.positionZ.value = pos[2];
        l.forwardX.value = fwd[0]; l.forwardY.value = fwd[1]; l.forwardZ.value = fwd[2]; l.upX.value = up[0]; l.upY.value = up[1]; l.upZ.value = up[2];
      }
    },
    resume: () => ac.resume(),
    dispose() { for (const h of [...timers]) h.stop(); },
  };
  return engine;
}
