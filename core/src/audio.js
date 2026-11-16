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
  const G = (o, d) => (o.gain ?? d) * (o.vel ?? 1);   // gain x velocity
  const param = (p, v, tc = 0.5, at = ac.currentTime) => { p.cancelScheduledValues(at); p.setTargetAtTime(v, at, tc); };
  const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
  const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], lydian: [0, 2, 4, 6, 7, 9, 11],
    pentatonic: [0, 2, 4, 7, 9], minorPentatonic: [0, 3, 5, 7, 10], mixolydian: [0, 2, 4, 5, 7, 9, 10],
    aeolian: [0, 2, 3, 5, 7, 8, 10], phrygianDominant: [0, 1, 4, 5, 7, 8, 10], hijaz: [0, 1, 4, 5, 7, 8, 10], wholeTone: [0, 2, 4, 6, 8, 10],
    lydianAug: [0, 2, 4, 6, 8, 9, 11], yo: [0, 2, 5, 7, 9], in: [0, 1, 5, 7, 8], kurd: [0, 2, 3, 5, 7, 8, 10], majorPent4: [0, 2, 4, 5, 7, 9] };
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
    env(out0, t, o.attack ?? 0.005, decay, G(o, 0.06));
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
    os.connect(f); f.connect(g); g.connect(route(o)); env(g, t, 0.004, decay, G(o, 0.06)); os.start(t); os.stop(t + decay * 1.6);
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


  // ---- instruments: one-shot notes { freq|midi, when, gain, vel, bus|pan|reverb } (see README 11) ----
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x)), FQ = (o, d = 440) => o.freq ?? (o.midi != null ? hz(o.midi) : d), T = (o) => o.when ?? now(), st = (n) => Math.pow(2, n / 12);
  const mk = (type, f, t, end) => { const os = ac.createOscillator(); os.type = type; os.frequency.value = f; os.start(t); os.stop(end); return os; };
  const gn = (v, to) => { const g = ac.createGain(); g.gain.value = v; if (to) g.connect(to); return g; };
  // output stage: envelope gain (decaying, or sustained for `sus` s then released over `rel`) -> routed; optional lowpass in front. Returns { i: input, g, f, end }
  function chain(o, t, { att = 0.005, decay = 1, sus, rel = 0.5, peak, lp, q = 0.5 }) {
    const g = ac.createGain(); let i = g, f = null, end, gg = g.gain;
    if (sus !== undefined) { const h = t + Math.max(att, sus); gg.setValueAtTime(0, t); gg.linearRampToValueAtTime(peak, t + att); gg.setValueAtTime(peak, h); gg.setTargetAtTime(0, h, rel / 4); end = h + rel * 2; }
    else { env(g, t, att, decay, peak); end = t + att + decay * 2; }
    if (lp) { f = ac.createBiquadFilter(); f.frequency.value = Math.min(lp, 16000); f.Q.value = q; f.connect(g); i = f; }
    g.connect(route(o)); return { i, g, f, end };
  }
  const noiseSrc = (t, end, to) => { const s = ac.createBufferSource(); s.buffer = noiseBuffer('pink'); s.loop = true; s.connect(to); s.start(t, rng() * 5); s.stop(end); };
  const bq = (type, f, q = 1, to) => { const x = ac.createBiquadFilter(); x.type = type; x.frequency.value = f; x.Q.value = q; if (to) x.connect(to); return x; };
  // pitch schedule: optional slide from `from` (exp, over gt) and optional bend (semitones, after bendAt, over bt)
  function sched(p, t, f, from, gt, bend, ba, bt) {
    if (from) { p.setValueAtTime(from, t); p.exponentialRampToValueAtTime(f, t + gt); } else p.setValueAtTime(f, t);
    if (bend) { const b = t + (from ? gt : 0) + ba; p.setValueAtTime(f, b); p.linearRampToValueAtTime(f * st(bend), b + bt); }
  }
  const FROM = (o) => o.from ?? (o.fromMidi != null ? hz(o.fromMidi) : 0);
  // additive partial note: lowpass -> master env (decaying or sustained); higher partials decay faster (dk)
  function partials(o, t, f0, ratios, amps, c) {
    const ch = chain(o, t, { ...c, peak: G(o, c.peak), lp: clamp(f0 * c.lp + 500, 800, 14000) });
    ch.f.type = 'lowpass';
    ratios.forEach((r, i) => {
      if (f0 * r > 15000) return;
      const pg = gn(amps[i]); if (c.sus === undefined && i && c.dk) pg.gain.setTargetAtTime(0, t + c.att, c.decay / 4 / (i * c.dk));
      mk('sine', f0 * r, t, ch.end).connect(pg); pg.connect(ch.i);
    });
    return ch;
  }
  const pitchDecay = (f) => clamp(1.5 - f / 1200, 0.35, 1.2);
  const partInst = (ratios, amps, c) => (o = {}) => { const f = FQ(o); partials(o, T(o), f, ratios, amps, { ...c, decay: o.decay ?? c.decay * (c.fix ? 1 : pitchDecay(f)), sus: c.sus ? (o.dur ?? 3) : undefined }); };
  const marimba = partInst([1, 3.9, 9.2], [1, 0.35, 0.1], { att: 0.003, decay: 1.3, peak: 0.06, dk: 1.5, lp: 8 });
  const kalimba = partInst([1, 5.4, 12.2], [1, 0.22, 0.06], { att: 0.002, decay: 2.2, peak: 0.06, dk: 2, lp: 7 });
  const pianoFelt = partInst([1, 2, 3, 4, 5, 6, 7].map((n) => n * Math.sqrt(1 + 4e-4 * n * n)), [1, 0.6, 0.35, 0.2, 0.12, 0.07, 0.04], { att: 0.012, decay: 5, peak: 0.05, dk: 0.7, lp: 5 });
  const celeI = partInst([1, 4.01, 9.9], [1, 0.4, 0.1], { att: 0.002, decay: 2.5, peak: 0.05, dk: 1.2, lp: 9 }), boxI = partInst([1, 3, 6.2], [1, 0.45, 0.15], { att: 0.002, decay: 1.6, peak: 0.05, dk: 1.5, lp: 9 });
  const celesta = (o = {}) => (o.box ? boxI : celeI)(o), musicBox = (o = {}) => boxI(o);
  const handpan = partInst([1, 2, 3, 1.004, 2.007], [1, 0.5, 0.2, 0.35, 0.12], { att: 0.02, decay: 5, peak: 0.05, dk: 0.5, lp: 5 });
  const glassHarmonica = partInst([1, 2, 3, 4.2], [1, 0.3, 0.12, 0.04], { att: 0.4, rel: 1.8, sus: 1, peak: 0.04, lp: 5, fix: 1 });
  function singingBowl(o = {}) {
    const f = FQ(o, 220), t = T(o), c = { att: 0.08, decay: o.decay ?? 14, peak: 0.035, dk: 0.3, lp: 4 };
    for (const m of [1, 1.0035]) partials(o, t, f * m, [1, 2.71, 5.15], [1, 0.45, 0.2], c);
  }
  // FM electric piano: tine attack that softens, chorus pair, optional wobbling lowpass (wobble 0..1)
  function epiano(o = {}) {
    const f = FQ(o), t = T(o), d = o.decay ?? clamp(5 - f / 200, 1.2, 4), v = 0.6 + 0.4 * (o.vel ?? 1), cut = o.cutoff ?? clamp(f * 5, 1200, 4500);
    const ch = chain(o, t, { att: 0.004, decay: d, peak: G(o, 0.07), lp: cut }); ch.f.type = 'lowpass';
    for (const dt of [-5, 5]) {
      const car = mk('sine', f, t, ch.end); car.detune.value = dt; car.connect(gn(0.5, ch.i));
      const m1 = mk('sine', f, t, ch.end), g1 = gn(f * 1.1 * v), m2 = mk('sine', f * 14, t, ch.end), g2 = gn(f * 1.2 * v);
      g1.gain.setTargetAtTime(f * 0.15, t, d / 6); g2.gain.setTargetAtTime(0, t, 0.05);
      m1.connect(g1); m2.connect(g2); g1.connect(car.frequency); g2.connect(car.frequency);
    }
    if (o.wobble) { const l = mk('sine', 0.7 + rng() * 0.5, t, ch.end); l.connect(gn(cut * 0.4 * o.wobble, ch.f.frequency)); }
  }
  function steelPan(o = {}) {
    const f = FQ(o), d = o.decay ?? 1.3;
    bell({ ...o, freq: f, ratio: 2, index: 1.6, decay: d, attack: 0.004, gain: G(o, 0.05) }); bell({ ...o, freq: f * 2, ratio: 3, index: 0.8, decay: d * 0.4, attack: 0.004, gain: G(o, 0.05) * 0.4 });
  }
  // plucked strings: filtered saw/triangle, bright -> dark, optional slide from `from|fromMidi`, bend (semitones, koto push)
  function str(o, f, c) {
    const t = T(o), d = o.decay ?? c.decay, ch = chain(o, t, { att: c.att ?? 0.004, decay: d, peak: G(o, c.peak), lp: f * c.br }); ch.f.type = 'lowpass';
    ch.f.frequency.setValueAtTime(Math.min(f * c.br, 16000), t); ch.f.frequency.setTargetAtTime(Math.max(f * c.end, 250), t, d / 6);
    for (const dt of c.det || [0]) { const os = mk(c.type, f, t, ch.end); os.detune.value = dt; sched(os.frequency, t, f, FROM(o), o.slide ?? 0.12, o.bend, o.bendAt ?? 0.06, o.bendTime ?? 0.3); os.connect(ch.i); }
    if (c.oct) { const os = mk('sine', f * 2, t, ch.end); os.connect(gn(c.oct, ch.i)); }
  }
  const koto = (o = {}) => str(o, FQ(o), { type: 'sawtooth', br: 7, end: 1.6, decay: 1.6, peak: 0.035 });
  const oud = (o = {}) => str(o, FQ(o), { type: 'sawtooth', br: 4, end: 1.1, decay: 1.9, peak: 0.04, det: [-7, 7], att: 0.006 });
  const harp = (o = {}) => str(o, FQ(o), { type: 'triangle', br: 6, end: 2, decay: 3.5, peak: 0.07, oct: 0.25, att: 0.006 });
  function strum(o = {}) {
    const ns = o.notes || [60, 64, 67, 72], t = T(o), sp = o.spread ?? [0.015, 0.04]; let w = t;
    (o.dir < 0 ? [...ns].reverse() : ns).forEach((m, i) => { str({ ...o, when: w, vel: (o.vel ?? 1) * (1 - 0.06 * i) }, hz(m), { type: 'triangle', br: 6, end: 1.4, decay: 1.2, peak: 0.06 }); w += sp[0] + rng() * (sp[1] - sp[0]); });
  }
  // sustained voices: oscs [[type, mult, amp, detuneCents]], delayed vibrato (cents), optional breath noise, from/bend for portamento and scoops
  function sv(o, f, c) {
    const t = T(o), dur = o.dur ?? 3, att = o.attack ?? c.att, ch = chain(o, t, { att, sus: dur, rel: o.release ?? c.rel, peak: G(o, c.peak), lp: c.lp * f }); ch.f.type = 'lowpass';
    if (c.swell) { ch.f.frequency.setValueAtTime(c.lp * f * 0.45, t); ch.f.frequency.linearRampToValueAtTime(c.lp * f, t + att * 1.2); }
    const vib = o.vibrato ?? c.vib, vd = o.vibDelay ?? c.vd, bend = o.bend ?? c.bend, from = FROM(o) || (bend ? f * st(bend) : 0);
    let vg = null; if (vib) { vg = gn(0); vg.gain.setValueAtTime(0, t + vd); vg.gain.linearRampToValueAtTime(vib, t + vd + 1.2); mk('sine', c.vr * (0.9 + rng() * 0.2), t, ch.end).connect(vg); }
    for (const [type, m, a, dt = 0] of c.oscs) { const os = mk(type, f * m, t, ch.end); os.detune.value = dt; sched(os.frequency, t, f * m, from && from * m, o.glide ?? 0.12); if (vg) vg.connect(os.detune); os.connect(gn(a, ch.i)); }
    if (c.breath) noiseSrc(t, ch.end, bq('bandpass', f * c.bf, 1.2, gn(c.breath * (o.breath ?? 1), ch.i)));
    return ch;
  }
  const S1 = (a = 1, b = 0.2, c = 0.06) => [['sine', 1, a], ['sine', 2, b], ['sine', 3, c]];
  const FL = {
    wood: { oscs: S1(1, 0.2, 0.06), breath: 0.2, bf: 2.2, att: 0.1, rel: 0.25, vib: 14, vr: 5, vd: 0.5, peak: 0.05, lp: 5 },
    shakuhachi: { oscs: S1(1, 0.35, 0.15), breath: 0.7, bf: 2.2, att: 0.14, rel: 0.4, vib: 22, vr: 5.3, vd: 0.8, bend: -1.2, peak: 0.05, lp: 4 },
    ney: { oscs: [['triangle', 1, 0.8], ['sine', 2, 0.35]], breath: 0.45, bf: 2.2, att: 0.1, rel: 0.3, vib: 30, vr: 5.5, vd: 0.6, bend: -0.6, peak: 0.05, lp: 4.5 },
    whistle: { oscs: S1(1, 0.05, 0.01), breath: 0.05, bf: 3, att: 0.05, rel: 0.15, vib: 25, vr: 6, vd: 0.35, peak: 0.045, lp: 8 } };
  const flute = (o = {}) => sv(o, FQ(o), FL[o.preset || o.type || 'wood']);
  const bowed = (o = {}) => sv(o, FQ(o, 110), { oscs: [['sawtooth', 1, 0.4, -8], ['sawtooth', 1, 0.4, 8], ['sawtooth', 1, 0.3], ['sine', 1, 0.3]], breath: 0.02, bf: 3, att: 0.7, rel: 0.6, vib: 12, vr: 5.2, vd: 1, peak: 0.035, lp: 3.5, swell: 1 });
  // choir: detuned saws -> parallel formant bandpasses
  const VOW = { ah: [[800, 1], [1150, 0.5], [2900, 0.15], [3900, 0.07]], oo: [[330, 1], [700, 0.4], [2500, 0.08]], mm: [[250, 1], [1100, 0.1], [2200, 0.05]], oh: [[450, 1], [800, 0.6], [2830, 0.1]], ee: [[300, 1], [2300, 0.5], [3000, 0.2]] };
  function choir(o = {}) {
    const f = FQ(o, 220), t = T(o), n = o.voices ?? 4, ch = chain(o, t, { att: o.attack ?? 1, sus: o.dur ?? 5, rel: o.release ?? 1.5, peak: G(o, 0.05) });
    const src = ac.createGain(), vg = gn(0); vg.gain.setValueAtTime(0, t + 1); vg.gain.linearRampToValueAtTime(12, t + 2.5); mk('sine', 5 + rng() * 0.5, t, ch.end).connect(vg);
    for (let i = 0; i < n; i++) { const os = mk(o.pulse ? 'square' : 'sawtooth', f, t, ch.end); os.detune.value = (n > 1 ? i / (n - 1) - 0.5 : 0) * 26 + rng() * 4; vg.connect(os.detune); os.connect(gn(1 / n, src)); }
    for (const [fc, a] of VOW[o.vowel || 'ah']) src.connect(bq('bandpass', fc, 8, gn(a * 3, ch.i)));
  }
  // whale song: sine (+2nd/3rd harmonics) gliding along `path` (midi list; or midi + `to`) with eased holds; long
  function whaleSong(o = {}) {
    const t = T(o), dur = o.dur ?? 9, m0 = o.midi ?? (o.freq ? 12 * Math.log2(o.freq / 440) + 69 : 45), pts = o.path || [m0, ...[].concat(o.to ?? m0 - 3)];
    const N = 128, base = new Float32Array(N);
    for (let i = 0; i < N; i++) { const x = (i / (N - 1)) * (pts.length - 1), k = Math.min(pts.length - 2, Math.floor(x)), u = clamp((x - k - 0.2) / 0.6, 0, 1); base[i] = hz(pts[k] + (pts[k + 1] - pts[k]) * u * u * (3 - 2 * u)); }
    const ch = chain(o, t, { att: dur * 0.3, sus: dur * 0.55, rel: dur * 0.45, peak: G(o, 0.06), lp: 1400 }); ch.f.type = 'lowpass';
    const vg = gn(0); vg.gain.setValueAtTime(0, t + 2); vg.gain.linearRampToValueAtTime(15, t + 4.5); mk('sine', 0.35, t, ch.end).connect(vg);
    [[1, 1], [2, 0.22], [3, 0.06]].forEach(([m, a]) => { const os = mk('sine', 100, t, ch.end); os.frequency.setValueCurveAtTime(base.map((x) => x * m), t, dur); vg.connect(os.detune); os.connect(gn(a, ch.i)); });
  }
  // soft percussion
  function thump(o, t, f, k, tc, decay, peak, noise) {
    const ch = chain(o, t, { att: 0.002, decay, peak: G(o, peak) }), os = mk('sine', f * k, t, ch.end);
    os.frequency.exponentialRampToValueAtTime(f, t + tc); os.connect(ch.i);
    if (noise) { const n = chain(o, t, { att: 0.002, decay: noise[2], peak: G(o, noise[3]) }); noiseSrc(t, n.end, bq(noise[0], noise[1], 1.5, n.i)); }
  }
  const frameDrum = (o = {}) => thump(o, T(o), FQ(o, 90), 1.4, 0.05, 0.6, 0.12, ['lowpass', 500, 0.06, 0.03]);
  const handDrum = (o = {}) => thump(o, T(o), FQ(o, 150), 1.3, 0.04, 0.3, 0.09, ['bandpass', 1800, 0.05, 0.035]);
  const darbuka = (o = {}) => o.type === 'tek' ? thump(o, T(o), FQ(o, 420), 1.2, 0.02, 0.06, 0.03, ['bandpass', 3500, 0.08, 0.05]) : thump(o, T(o), FQ(o, 110), 1.5, 0.05, 0.35, 0.13, ['lowpass', 300, 0.1, 0.03]);
  function shaker(o = {}) { const t = T(o), ch = chain(o, t, { att: 0.015, decay: o.decay ?? 0.07, peak: G(o, 0.03) }); noiseSrc(t, ch.end, bq('highpass', 5500, 0.7, bq('bandpass', 7000, 0.8, ch.i))); }
  function drip(o = {}) { const t = T(o), f = FQ(o, 1200), ch = chain(o, t, { att: 0.003, decay: o.decay ?? 0.22, peak: G(o, 0.05) }), os = mk('sine', f, t, ch.end); os.frequency.exponentialRampToValueAtTime(f * ((o.dir ?? 1) > 0 ? 1.7 : 0.6), t + 0.09); os.connect(ch.i); }
  // tanpura: Pa-Sa-Sa-low Sa plucks, buzzing saws with a sweeping bright peak (jawari). -> { set, stop }
  function tanpura(o = {}) {
    const root = o.root ?? 38, b = bus({ gain: o.gain ?? 0.06, reverb: o.reverb ?? 0.5, parent: o.bus || null }), notes = [root - 5, root, root, root - 12], gaps = [1.05, 1, 1, 2.6]; let i = 0, id = 0, stopped = false;
    const tick = () => {
      if (stopped) return; const t = now() + 0.05, f = hz(notes[i]), ch = chain({ bus: b }, t, { att: 0.01, decay: 5, peak: 1, lp: 6000 }); ch.f.type = 'lowpass';
      const pk = bq('peaking', f * 3, 4, ch.i); pk.gain.value = 14; pk.frequency.setValueAtTime(f * 3, t); pk.frequency.exponentialRampToValueAtTime(Math.min(f * 14, 9000), t + 3);
      for (const dt of [-3, 3]) { const os = mk('sawtooth', f, t, ch.end); os.detune.value = dt; os.connect(gn(0.5, pk)); }
      id = setTimeout(tick, gaps[i] * (0.95 + rng() * 0.1) * 1000); i = (i + 1) % 4;
    };
    tick(); const h = { set: b.set, stop: () => { stopped = true; clearTimeout(id); b.set(0, 0.5); timers.delete(h); } }; timers.add(h); return h;
  }
  // phrase: notes [{ midi|deg (index into `scale` array), dur (beats), vel, rest }] with one instrument at `tempo` bpm; humanized; returns end time
  function phrase({ notes = [], inst = pluck, opts = {}, when, tempo = 60, humanize = 0.015, scale: sc } = {}) {
    let t = when ?? now() + 0.05; const beat = 60 / tempo;
    for (const n of notes) {
      const m = n.midi ?? (n.deg != null && sc ? sc[clamp(n.deg, 0, sc.length - 1)] : null), d = (n.dur ?? 1) * beat;
      if (m != null && !n.rest) inst({ ...opts, midi: m, freq: undefined, dur: d * (opts.durMul ?? 1), vel: (n.vel ?? 1) * (1 + (rng() - 0.5) * 2 * humanize * 6), when: Math.max(now(), t + (rng() - 0.5) * 2 * humanize) });
      t += d;
    }
    return t;
  }

  let vol = 1, muted = false;
  const engine = {
    ctx: ac, out, wet, master, rng, now, param, hz, scale, bus, spatial, wander, noiseBed, drone, pad, bell, fm, additive, pluck, chirp, whoosh, every,
    epiano, marimba, kalimba, koto, oud, harp, pianoFelt, celesta, musicBox, steelPan, handpan, singingBowl, glassHarmonica, flute, bowed, choir, whaleSong, strum,
    frameDrum, handDrum, shaker, darbuka, drip, tanpura, phrase, loop: (o) => every(o.every[0], o.every[1], o.fn, { startDelay: o.startDelay }), SCALES, volume,
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
