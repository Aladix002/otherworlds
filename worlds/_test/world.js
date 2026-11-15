// Minimal test world: gradient sky, GPU-generated fbm terrain, instanced rocks, compute-driven motes, a door to itself.
const SIZE = 420, SEG = 256, DOOR = [0, -24];
const EMPTY = typeof location !== 'undefined' && /[?&]empty=1/.test(location.search);

const COMMON = /* wgsl */`
override DOORX: f32 = 0.0;
override DOORZ: f32 = -24.0;
fn terrainRaw(p: vec2f) -> f32 { return 6.0 * fbm2(p * 0.01, 5) + 1.5 * fbm2(p * 0.05 + vec2f(3.0, 0.0), 3); }
fn terrain(p: vec2f) -> f32 {
  let d = vec2f(DOORX, DOORZ);
  return mix(terrainRaw(p), terrainRaw(d), 1.0 - smoothstep(2.5, 7.0, distance(p, d)));
}
fn skyColor(rd: vec3f) -> vec3f {
  let h = clamp(rd.y, 0.0, 1.0);
  var c = mix(G.fogColor, vec3f(0.16, 0.32, 0.72), pow(h, 0.55));
  let sd = max(dot(rd, G.sunDir), 0.0);
  c += G.sunColor * (pow(sd, 900.0) * 30.0 + pow(sd, 8.0) * 0.12 + pow(sd, 64.0) * 0.25);
  if (rd.y > 0.0) {
    let uv = rd.xz / (rd.y + 0.15) * 1.6 + vec2f(G.time * 0.004, 0.0);
    let n = fbm2(uv, select(3, 5, G.quality > 0.5));
    let cl = smoothstep(0.05, 0.6, n) * smoothstep(0.0, 0.25, rd.y);
    c = mix(c, vec3f(1.0, 0.97, 0.94) * (0.9 + 0.6 * pow(sd, 4.0)), cl * 0.75);
  }
  return mix(c, G.fogColor, 1.0 - smoothstep(-0.02, 0.06, rd.y));
}
`;

const TERRAIN_GEN = COMMON + /* wgsl */`
override SEG: u32 = 256u;
override SIZE: f32 = 420.0;
@group(1) @binding(0) var<storage, read_write> verts: array<f32>;
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id: vec3u) {
  let n = SEG + 1u;
  if (id.x >= n * n) { return; }
  let i = id.x % n; let j = id.x / n;
  let uv = vec2f(f32(i), f32(j)) / f32(SEG);
  let p = (uv - 0.5) * SIZE;
  let e = 0.6;
  let h = terrain(p);
  let nx = terrain(p - vec2f(e, 0.0)) - terrain(p + vec2f(e, 0.0));
  let nz = terrain(p - vec2f(0.0, e)) - terrain(p + vec2f(0.0, e));
  let nrm = normalize(vec3f(nx, 2.0 * e, nz));
  let o = id.x * 8u;
  verts[o] = p.x; verts[o + 1u] = h; verts[o + 2u] = p.y;
  verts[o + 3u] = nrm.x; verts[o + 4u] = nrm.y; verts[o + 5u] = nrm.z;
  verts[o + 6u] = uv.x; verts[o + 7u] = uv.y;
}`;

const SKY = COMMON + /* wgsl */`
struct VO { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) vi: u32) -> VO { var o: VO; o.pos = fsPos(vi); o.uv = fsUV(vi); return o; }
@fragment fn fs(in: VO) -> @location(0) vec4f { return vec4f(skyColor(viewRay(in.uv)), 1.0); }`;

const GROUND = COMMON + /* wgsl */`
struct VO { @builtin(position) pos: vec4f, @location(0) w: vec3f, @location(1) n: vec3f };
@vertex fn vs(@location(0) p: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f) -> VO {
  var o: VO; o.w = p; o.n = n; o.pos = G.viewProj * vec4f(p, 1.0); return o;
}
@fragment fn fs(in: VO) -> @location(0) vec4f {
  let n = normalize(in.n);
  let q = in.w.xz;
  let patches = fbm2(q * 0.035, 4) * 0.5 + 0.5;
  let fine = vnoise2(q * 1.7) * 0.5 + 0.5;
  var albedo = mix(hex(0x4f7a32), hex(0x9a9a46), smoothstep(0.35, 0.75, patches));
  albedo = mix(albedo, hex(0xb98d4a), smoothstep(0.7, 0.9, patches) * 0.6);
  albedo *= 0.85 + 0.3 * fine;
  let slope = 1.0 - n.y;
  albedo = mix(albedo, hex(0x7d7468), smoothstep(0.18, 0.35, slope));
  return vec4f(lit(albedo, n, in.w), 1.0);
}`;

const ROCK = /* wgsl */`
struct VO { @builtin(position) pos: vec4f, @location(0) w: vec3f, @location(1) n: vec3f, @location(2) @interpolate(flat) tint: f32, @location(3) lp: vec3f };
@vertex fn vs(@location(0) p: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f, @location(3) a: vec4f, @location(4) b: vec4f) -> VO {
  let R = rotY(b.x);
  let s = vec3f(a.w, a.w * b.z, a.w);
  var o: VO;
  o.w = a.xyz + R * (p * s); o.n = normalize(R * (n / s)); o.tint = b.y; o.lp = p;
  o.pos = G.viewProj * vec4f(o.w, 1.0); return o;
}
@fragment fn fs(in: VO) -> @location(0) vec4f {
  let n = normalize(in.n);
  let grain = fbm2(in.lp.xz * 4.0 + in.lp.y * 3.0 + in.tint * 10.0, 3) * 0.5 + 0.5;
  var albedo = mix(hex(0x6f6a64), hex(0x9a938a), grain) * (0.8 + 0.4 * in.tint);
  albedo = mix(albedo, hex(0x5d7a2e), smoothstep(0.55, 0.85, n.y + grain * 0.2) * 0.8);
  return vec4f(litSpec(albedo, n, in.w, 24.0, 0.15), 1.0);
}`;

const MOTES = /* wgsl */`
struct Mote { p: vec4f, v: vec4f };
@group(1) @binding(0) var<storage, read_write> motes: array<Mote>;
@compute @workgroup_size(64) fn sim(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= arrayLength(&motes)) { return; }
  var m = motes[id.x];
  let flow = curl3(m.p.xyz * 0.06 + vec3f(0.0, G.time * 0.03, m.p.w * 0.001)) * 0.7 + vec3f(0.12, 0.03, 0.05);
  m.v = vec4f(mix(m.v.xyz, flow, 1.0 - exp(-G.dt * 0.7)), m.v.w);
  var p = m.p.xyz + m.v.xyz * G.dt;
  let rel = p - G.camPos;
  p = G.camPos + rel - 48.0 * round(rel / 48.0);
  m.p = vec4f(p, m.p.w);
  motes[id.x] = m;
}`;
const MOTES_DRAW = /* wgsl */`
struct Mote { p: vec4f, v: vec4f };
@group(1) @binding(0) var<storage, read> motes: array<Mote>;
struct VO { @builtin(position) pos: vec4f, @location(0) c: vec2f, @location(1) a: f32 };
@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VO {
  var cs = array<vec2f, 6>(vec2f(-1, -1), vec2f(1, -1), vec2f(-1, 1), vec2f(-1, 1), vec2f(1, -1), vec2f(1, 1));
  let m = motes[ii];
  let c = cs[vi];
  let d = distance(m.p.xyz, G.camPos);
  var o: VO;
  o.pos = G.viewProj * vec4f(billboard(m.p.xyz, c, vec2f(0.035 + 0.004 * d)), 1.0);
  o.c = c;
  let tw = 0.6 + 0.4 * sin(G.time * (0.7 + fract(m.p.w * 0.37)) + m.p.w);
  o.a = tw * smoothstep(0.8, 3.0, d) * (1.0 - smoothstep(14.0, 23.0, d));
  return o;
}
@fragment fn fs(in: VO) -> @location(0) vec4f {
  let r = dot(in.c, in.c);
  let a = exp(-r * 4.0) * in.a;
  return vec4f(vec3f(1.6, 1.25, 0.7) * a * 0.35, 0.0);
}`;

export default {
  id: '_test',
  title: 'Testovací svet',
  movement: 'walk',
  spawn: { pos: [0, 0, 6], yaw: Math.PI, pitch: -0.03 },
  poses: [
    { pos: [0, 1.7, 6], yaw: Math.PI, pitch: -0.04 },
    { pos: [0.8, 1.6, -18.5], yaw: 0.08, pitch: 0.02 },
    { pos: [40, 9, 60], yaw: 0.65, pitch: -0.12 },
    { pos: [-30, 3, -10], yaw: -1.3, pitch: -0.08 },
    { pos: [10, 2, 20], yaw: -2.35, pitch: 0.1 },
    { pos: [0, 1.6, -21.2], yaw: 0, pitch: 0.0, t: 4 },
  ],
  flythrough: [
    { pos: [0, 2.2, 10], yaw: 0, pitch: -0.05 }, { pos: [0, 1.8, -14], yaw: 0, pitch: 0 },
    { pos: [-18, 3, -40], yaw: 0.6, pitch: -0.05 }, { pos: [-50, 6, -30], yaw: 1.6, pitch: -0.1 },
    { pos: [-60, 8, 20], yaw: 2.6, pitch: -0.12 }, { pos: [-20, 4, 55], yaw: 3.6, pitch: -0.08 },
    { pos: [30, 6, 50], yaw: 4.4, pitch: -0.1 }, { pos: [60, 9, 5], yaw: 5.3, pitch: -0.15 },
    { pos: [35, 5, -35], yaw: 6.0, pitch: -0.06 }, { pos: [5, 2.5, -10], yaw: 6.6, pitch: -0.03 },
    { pos: [0, 2.2, 10], yaw: 6.28, pitch: -0.05 },
  ],
  flythroughDuration: 60,
  doors: [{ pos: [DOOR[0], null, DOOR[1]], yaw: 0, to: '_test' }],   // y = null -> placed on heightAt()
  bounds: { center: [0, 0, 0], radius: 150 },
  env: {
    sunDir: [0.45, 0.42, -0.55], sunColor: [2.2, 1.9, 1.5], fogColor: [0.62, 0.72, 0.86], fogDensity: 0.0045,
    ambientSky: [0.32, 0.42, 0.6], ambientGround: [0.2, 0.18, 0.12],
  },
  post: { exposure: 1.0, bloom: 0.06, vignette: 0.22, saturation: 1.08 },

  heightAt(x, z) {
    const { fbm2 } = this.noise;
    const raw = (x, z) => 6 * fbm2(x * 0.01, z * 0.01, 5) + 1.5 * fbm2(x * 0.05 + 3, z * 0.05, 3);
    const d = Math.hypot(x - DOOR[0], z - DOOR[1]);
    const t = 1 - Math.min(1, Math.max(0, (d - 2.5) / 4.5)), s = t * t * (3 - 2 * t);
    return raw(x, z) * (1 - s) + this.doorH * s;
  },

  async init(ctx, progress) {
    this.noise = ctx.noise;
    const { fbm2 } = ctx.noise;
    this.doorH = 6 * fbm2(DOOR[0] * 0.01, DOOR[1] * 0.01, 5) + 1.5 * fbm2(DOOR[0] * 0.05 + 3, DOOR[1] * 0.05, 3);
    // test-world convenience: pose / fly-through heights are authored relative to the ground
    for (const p of [...this.poses, ...this.flythrough]) if (!p.abs) { p.pos = [p.pos[0], p.pos[1] + this.heightAt(p.pos[0], p.pos[2]), p.pos[2]]; p.abs = true; }
    const consts = { DOORX: DOOR[0], DOORZ: DOOR[1] };
    const movement = ctx.movement;
    if (movement !== 'walk') ctx.camera.pos[1] = this.heightAt(ctx.camera.pos[0], ctx.camera.pos[2]) + 2.5;

    // terrain generated on the GPU into a vertex buffer
    const nv = (SEG + 1) * (SEG + 1);
    const plane = ctx.mesh.plane(SIZE, SIZE, SEG, SEG);
    this.vbuf = ctx.buffer(nv * 32, 'vertex');
    this.ibuf = ctx.buffer(plane.idx, 'index');
    this.icount = plane.idx.length;
    const genLayout = ctx.layout(['storage-rw']);
    const gen = ctx.compute({ code: TERRAIN_GEN, layouts: [genLayout], constants: { ...consts, SEG, SIZE } });
    const enc = ctx.device.createCommandEncoder();
    const cp = ctx.beginCompute(enc);
    cp.setPipeline(gen); cp.setBindGroup(1, ctx.bindGroup(genLayout, [this.vbuf])); cp.dispatchWorkgroups(Math.ceil(nv / 64)); cp.end();
    ctx.queue.submit([enc.finish()]);
    await progress(0.3);

    this.sky = ctx.pipeline({ code: SKY, depthTest: false, depthWrite: false, constants: consts, label: 'sky' });
    this.ground = ctx.pipeline({ code: GROUND, buffers: [ctx.mesh.layout], constants: consts, label: 'ground' });
    await progress(0.5);

    // instanced rocks placed on the CPU with the matching heightAt
    const rng = ctx.rng, nRocks = [180, 320, 520][ctx.q.level];
    const inst = new Float32Array(nRocks * 8);
    for (let i = 0; i < nRocks; i++) {
      let x, z; do { x = rng.range(-140, 140); z = rng.range(-140, 140); } while (Math.hypot(x - DOOR[0], z - DOOR[1]) < 6 || Math.hypot(x, z - 6) < 4);
      const s = 0.25 + Math.pow(rng(), 3) * 2.2;
      inst.set([x, this.heightAt(x, z) - s * 0.25, z, s, rng() * 6.283, rng(), 0.55 + rng() * 0.4, 0], i * 8);
    }
    this.rockMesh = ctx.mesh.upload(ctx.mesh.rock(7, 2, 0.4));
    this.rockInst = ctx.buffer(inst, 'vertex');
    this.nRocks = nRocks;
    this.rock = ctx.pipeline({ code: ROCK, buffers: [ctx.mesh.layout, ctx.mesh.instanceLayout(['float32x4', 'float32x4'], 3)], label: 'rock' });
    await progress(0.7);

    // compute-driven motes (particles)
    const nMotes = [1024, 3072, 8192][ctx.q.level];
    const md = new Float32Array(nMotes * 8);
    for (let i = 0; i < nMotes; i++) md.set([rng.range(-24, 24), rng.range(0, 14) + this.doorH, rng.range(-24, 24), i, 0, 0, 0, 0], i * 8);
    this.motesBuf = ctx.buffer(md, 'storage');
    const simL = ctx.layout(['storage-rw']), drawL = ctx.layout(['storage']);
    this.moteSim = ctx.compute({ code: MOTES, entry: 'sim', layouts: [simL] });
    this.moteSimBG = ctx.bindGroup(simL, [this.motesBuf]);
    this.moteDraw = ctx.pipeline({ code: MOTES_DRAW, layouts: [drawL], blend: 'add', cull: 'none', label: 'motes' });
    this.moteDrawBG = ctx.bindGroup(drawL, [this.motesBuf]);
    this.nMotes = nMotes;
    await progress(1);
  },

  computeBefore(ctx, encoder) {
    const p = ctx.beginCompute(encoder);
    p.setPipeline(this.moteSim); p.setBindGroup(1, this.moteSimBG); p.dispatchWorkgroups(Math.ceil(this.nMotes / 64)); p.end();
  },

  update(ctx, dt, t) {
    // slow sun drift to prove env is live
    const a = 0.75 + Math.sin(t * 0.01) * 0.05;
    ctx.env.sunDir[0] = Math.cos(a) * 0.62; ctx.env.sunDir[2] = -Math.sin(a) * 0.62;
  },

  render(ctx, pass) {
    if (EMPTY) return; // ?empty=1 measures the bare core cost (post stack + door)
    pass.setPipeline(this.sky); pass.draw(3);
    pass.setPipeline(this.ground);
    pass.setVertexBuffer(0, this.vbuf); pass.setIndexBuffer(this.ibuf, 'uint32'); pass.drawIndexed(this.icount);
    pass.setPipeline(this.rock);
    pass.setVertexBuffer(0, this.rockMesh.vertexBuffer); pass.setVertexBuffer(1, this.rockInst);
    pass.setIndexBuffer(this.rockMesh.indexBuffer, this.rockMesh.indexFormat);
    pass.drawIndexed(this.rockMesh.indexCount, this.nRocks);
  },

  renderTransparent(ctx, pass) {
    if (EMPTY) return;
    pass.setPipeline(this.moteDraw); pass.setBindGroup(1, this.moteDrawBG); pass.draw(6, this.nMotes);
  },

  audio(ctx, a) {
    a.setReverb({ seconds: 4, damp: 0.6, wet: 0.8 });
    a.noiseBed({ color: 'pink', freq: 500, q: 0.6, gain: 0.05, mod: 0.5, modRate: 0.04 });            // wind
    a.noiseBed({ color: 'brown', filter: 'lowpass', freq: 180, gain: 0.04, mod: 0.3 });              // low rumble
    a.drone({ freq: a.hz(38), partials: [1, 1.5, 2, 3], gain: 0.035, cutoff: 600 });
    a.pad({ chords: [[50, 57, 62, 66], [47, 54, 59, 62], [43, 50, 55, 59], [45, 52, 57, 61]], gain: 0.03, change: [16, 28] });
    const notes = a.scale(74, 'pentatonic', 2);
    a.every(5, 13, (when) => a.bell({ freq: a.hz(a.rng.pick(notes)), gain: 0.022, decay: 4, when, pan: a.rng.range(-0.6, 0.6), reverb: 0.7 }));
    a.every(9, 22, (when) => a.chirp({ f0: 2400, f1: 3600, repeat: 2 + a.rng.int(3), gain: 0.012, when, pan: a.rng.range(-0.8, 0.8) }));
  },
};
