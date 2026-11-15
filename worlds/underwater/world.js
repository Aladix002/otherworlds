// Podmorský svet: turquoise shallows with a sunken Greek temple -> golden kelp forest -> the bioluminescent deep.
import COMMON from './common.wgsl';
import GEN from './gen.wgsl';
import BG from './bg.wgsl';
import TERRAIN from './terrain.wgsl';
import TEMPLE from './temple.wgsl';
import { buildTemple, mat } from './temple.js';
import FISH from './fish.wgsl';
import CRIT from './critter.wgsl';
import DEEP from './deep.wgsl';
import { turtleGeo, rayGeo, sharkGeo, animate } from './critters.js';
import KELP from './kelp.wgsl';
import FLORA from './flora.wgsl';
import ROCK from './rock.wgsl';
import { scatter } from './scatter.js';
import SHAFTS from './shafts.wgsl';
import MOTES from './motes.wgsl';

const PADY = -13.0, DOORX = -3.0, DOORZ = 104.0;
const SEGX = 256, SEGZ = 384, SX = 320, SZ = 480, CZ = -90;
const SUN = [0.2425, 0.9216, -0.3031], WCOL = [0.03, 0.27, 0.37];

const ss = (a, b, x) => { let t = (x - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
function sdBox2(px, pz, bx, bz) {
  const qx = Math.abs(px) - bx, qz = Math.abs(pz) - bz;
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0);
}
// CPU twin of terrainH() in common.wgsl (without/with the flattened pads)
function rawH(N, x, z) {
  const zw = z + 8 * N.fbm2(x * 0.008 + 3.1, z * 0.008 - 1.7, 2);
  let y = -7 - 6 * ss(115, 15, zw) - 8 * ss(25, -25, zw) - 14 * ss(-20, -140, zw) - 40 * ss(-138, -168, zw) - 32 * ss(-160, -250, zw) - 6 * ss(-230, -320, zw);
  const kelp = ss(10, -30, zw) * (1 - ss(-125, -160, zw));
  y += N.fbm2(x * 0.035, z * 0.035, 3) * (0.7 + 1.3 * kelp);
  const slope = ss(-150, -175, zw) * (1 - ss(-250, -290, zw));
  y += (N.ridge2(x * 0.022 + 5, z * 0.022 + 1, 3) - 0.45) * 10 * slope;
  const ax = Math.abs(x + 6 * N.fbm2(x * 0.01 - 4, z * 0.01 + 2, 2));
  y += ss(80, 150, ax) * Math.min(24, -y - 3);
  y += ss(110, 160, z) * Math.min(16, -y - 3);
  return y;
}
function kelpGeo(nodes, bs) {
  const pos = [], uv = [], idx = [];
  for (let j = 0; j < nodes; j++) for (let s = 0; s < 3; s++) { pos.push(s * 2.0944, j / (nodes - 1), 0); uv.push(0, 0); }
  for (let j = 0; j < nodes - 1; j++) for (let s = 0; s < 3; s++) {
    const a = j * 3 + s, b = j * 3 + (s + 1) % 3; idx.push(a, a + 3, b, b, a + 3, b + 3);
  }
  for (let j = 2; j < nodes; j++) for (let k = 0; k < 2; k++) {
    const ang = j * 2.39996 + k * Math.PI + Math.sin(j * 7.1) * 0.5, r = (Math.sin(j * 12.9898 + k * 78.233) * 43758.5453) % 1;
    const b0 = pos.length / 3;
    for (let i = 0; i <= bs; i++) for (const sd of [-1, 1]) { pos.push(ang, (j - 0.3 * k) / (nodes - 1), sd); uv.push(1 + i / bs, Math.abs(r)); }
    for (let i = 0; i < bs; i++) { const a = b0 + i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  return { pos: new Float32Array(pos), nrm: new Float32Array(pos.length), uv: new Float32Array(uv), idx: new Uint32Array(idx) };
}
// fish: nose +z (0.5), tail -z; uv.y = 1 on fins
function fishGeo(M) {
  const body = M.lathe([[0.001, -0.36], [0.035, -0.32], [0.1, -0.18], [0.155, 0.0], [0.15, 0.15], [0.11, 0.33], [0.06, 0.44], [0.001, 0.5]], 10);
  M.transform(body, mat(Math.PI / 2, 0, 0, 0, 0, 0)); M.scale(body, 0.42, 1, 1);
  for (let i = 0; i < body.uv.length; i += 2) body.uv[i + 1] = 0;
  const P = [[0, 0, -0.32], [0, 0.2, -0.52], [0, 0, -0.42], [0, -0.2, -0.52], [0, 0.13, 0.12], [0, 0.27, -0.12], [0, 0.11, -0.2], [0, -0.12, -0.02], [0, -0.2, -0.2], [0, -0.1, -0.22]];
  const fin = { pos: new Float32Array(P.flat()), nrm: new Float32Array(30), uv: new Float32Array(20), idx: new Uint32Array([0, 1, 2, 0, 2, 3, 4, 5, 6, 7, 8, 9]) };
  for (let i = 0; i < 10; i++) { fin.nrm[i * 3] = 1; fin.uv[i * 2 + 1] = 1; }
  return M.merge([body, fin]);
}
// CPU twins of lightAt / waterAt (for env + door lighting)
function lightAt(out, y) {
  const d = Math.min(Math.max(-y, 0), 150);
  const kb = ss(12, 24, d) * (1 - ss(34, 55, d)), db = ss(35, 80, d), e = Math.exp(-Math.max(d - 35, 0) * 0.045) * 2.2, wm = ss(0, 30, d);
  out[0] = Math.exp(-d * 0.045) * mix(1.18, 1, wm) * mix(1, 1.3, kb) * mix(1, 0.4, db) * e;
  out[1] = Math.exp(-d * 0.022) * mix(1, 1.05, kb) * mix(1, 0.75, db) * e;
  out[2] = Math.exp(-d * 0.02) * mix(0.84, 1, wm) * mix(1, 0.8, kb) * mix(1, 1.6, db) * e;
  return out;
}

export default {
  id: 'underwater',
  title: 'Podmorský svet',
  movement: 'swim',
  spawn: { pos: [2, -6.5, 80], yaw: 0, pitch: -0.08 },
  poses: [
    { pos: [11, -9.5, 66], yaw: 0.5, pitch: 0.02 },
    { pos: [-9.5, -11.6, 61], yaw: -1.0, pitch: 0.5 },
    { pos: [-8, -20, -40], yaw: 0.25, pitch: 0.24 },
    { pos: [10, -18, -50], yaw: 0, pitch: 0.05, t: 20 },
    { pos: [4, -29, -139], yaw: 0.0, pitch: -0.55 },
    { pos: [0, -95, -255], yaw: 0, pitch: 0.2 },
  ],
  flythrough: [
    { pos: [-16, -6.5, 100], yaw: -0.6, pitch: -0.05 },
    { pos: [2, -6.5, 82], yaw: 0, pitch: -0.05 },
    { pos: [12, -8, 66], yaw: 0.5, pitch: 0 },
    { pos: [2, -9, 64], yaw: 0.1, pitch: 0.05 },
    { pos: [-12.5, -11, 50], yaw: -1.0, pitch: 0.05 },
    { pos: [-12.5, -11.5, 40], yaw: -1.3, pitch: 0.05 },
    { pos: [-22, -11, 20], yaw: -0.3, pitch: 0 },
    { pos: [-8, -14, 0], yaw: 0, pitch: 0 },
    { pos: [-30, -17, -22], yaw: 0.5, pitch: 0.1 },
    { pos: [-30, -18.5, -42], yaw: 0.0, pitch: 0.1 },
    { pos: [-14, -18, -50], yaw: -0.6, pitch: 0.05 },
    { pos: [-5, -18, -58], yaw: -0.86, pitch: 0.08 },
    { pos: [-4, -19, -66], yaw: -1.0, pitch: 0.08 },
    { pos: [-4, -21, -84], yaw: -1.9, pitch: 0.1 },
    { pos: [4, -30, -140], yaw: 0, pitch: -0.3 },
    { pos: [-2, -88, -242], yaw: 0, pitch: -0.15 },
    { pos: [0, -93, -262], yaw: 0.15, pitch: 0.1 },
    { pos: [6, -92, -280], yaw: 0.5, pitch: 0.1 },
    { pos: [10, -90, -292], yaw: 0.7, pitch: 0.1 },
    { pos: [-4, -88, -300], yaw: 1.4, pitch: 0.05 },
  ],
  flythroughDuration: 60,
  doors: [{ pos: [DOORX, null, DOORZ], yaw: Math.PI, to: 'jungle' }],
  bounds: { min: [-140, -125, -310], max: [140, -0.9, 135] },
  env: {
    sunDir: SUN, sunColor: [1.0, 1.5, 1.6], fogColor: [0.05, 0.5, 0.62], fogDensity: 0.016,
    ambientSky: [0.08, 0.7, 0.85], ambientGround: [0.03, 0.25, 0.3],
  },
  post: { exposure: 0.95, bloom: 0.1, bloomThreshold: 1.0, vignette: 0.3, saturation: 1.18, contrast: 1.06 },
  clearColor: [0.05, 0.5, 0.62],
  fov: 64,
  doorLight: [0.03, 0.05, 0.06],

  heightAt(x, z) {
    let y = rawH(this.N, x, z);
    y = mix(y, PADY, 1 - ss(0, 7, sdBox2(x, z - 44, 8.5, 13.5)));
    return mix(y, this.doorY, 1 - ss(2.5, 7, Math.hypot(x - DOORX, z - DOORZ)));
  },

  sdf(x, y, z) {
    let d = 1e9;
    for (const c of this.cols) {
      const r = Math.hypot(x - c[0], z - c[1]) - c[2], dy = y - c[3];
      d = Math.min(d, dy > 0 ? Math.hypot(Math.max(r, 0), dy) : r);
    }
    for (const b of this.boxes) {
      const px = x - b[0], pz = z - b[2], c = Math.cos(b[6]), s = Math.sin(b[6]);
      const qx = Math.abs(c * px - s * pz) - b[3], qy = Math.abs(y - b[1]) - b[4], qz = Math.abs(s * px + c * pz) - b[5];
      d = Math.min(d, Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0));
    }
    const R = this.rockCol;
    for (let i = 0; i < R.length; i += 4) d = Math.min(d, Math.hypot(x - R[i], y - R[i + 1], z - R[i + 2]) - R[i + 3]);
    return d;
  },

  async init(ctx, progress) {
    const N = this.N = ctx.noise, dev = ctx.device;
    this.doorY = rawH(N, DOORX, DOORZ);
    this.consts = { PADY, DOORX, DOORZ, DOORY: this.doorY };
    this.L = new Float32Array(3);

    // --- procedural textures (caustics 512², noise 256²) with mip chains, generated on the GPU
    const genL = ctx.layout(['storage-texture:rgba8unorm']);
    const mipL = ctx.layout(['texture', 'storage-texture:rgba8unorm']);
    const genMod = ctx.shader(GEN, 'uw-gen');
    const mipP = ctx.compute({ module: genMod, entry: 'mip', layouts: [mipL] });
    const enc = dev.createCommandEncoder();
    const makeTex = (res, mode) => {
      const mips = Math.log2(res) + 1;
      const tex = ctx.texture(res, res, 'rgba8unorm', GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING, { mips });
      const lv = (i) => tex.createView({ baseMipLevel: i, mipLevelCount: 1 });
      const p = ctx.compute({ module: genMod, entry: 'main', layouts: [genL], constants: { MODE: mode, RES: res } });
      let cp = ctx.beginCompute(enc);
      cp.setPipeline(p); cp.setBindGroup(1, ctx.bindGroup(genL, [lv(0)])); cp.dispatchWorkgroups(res / 8, res / 8); cp.end();
      for (let i = 1; i < mips; i++) {
        const s = res >> i;
        cp = ctx.beginCompute(enc);
        cp.setPipeline(mipP); cp.setBindGroup(1, ctx.bindGroup(mipL, [lv(i - 1), lv(i)])); cp.dispatchWorkgroups(Math.ceil(s / 8), Math.ceil(s / 8)); cp.end();
      }
      return tex;
    };
    const caus = makeTex(512, 0), noise = makeTex(256, 1);
    this.envL = ctx.layout(['texture', 'texture', 'sampler']);
    this.envBG = ctx.bindGroup(this.envL, [caus.createView(), noise.createView(), ctx.samplers.repeat]);

    // --- terrain (GPU-generated vertex buffer)
    const nv = (SEGX + 1) * (SEGZ + 1);
    const plane = ctx.mesh.plane(1, 1, SEGX, SEGZ);
    this.tVB = ctx.buffer(nv * 32, 'vertex');
    this.tIB = ctx.buffer(plane.idx, 'index');
    this.tCount = plane.idx.length;
    const tMod = ctx.shader(COMMON + 'fn colShadow(wp: vec3f) -> f32 { return 1.0; }\n' + TERRAIN, 'uw-terrain-gen');
    const tGenL = ctx.layout(['storage-rw']);
    const tc = { ...this.consts, SEGX, SEGZ, SX, SZ, CZ };
    const tGen = ctx.compute({ module: tMod, entry: 'gen', layouts: [this.envL, tGenL], constants: tc });
    let cp = ctx.beginCompute(enc);
    cp.setPipeline(tGen); cp.setBindGroup(1, this.envBG); cp.setBindGroup(2, ctx.bindGroup(tGenL, [this.tVB]));
    cp.dispatchWorkgroups(Math.ceil(nv / 64)); cp.end();
    ctx.queue.submit([enc.finish()]);
    await progress(0.3);

    // --- temple and ruins (one static mesh)
    const T = buildTemple(ctx.mesh, (x, z) => this.heightAt(x, z), PADY, [DOORX, this.doorY, DOORZ], ctx.math.makeRng(7));
    this.cols = T.cols; this.boxes = T.boxes;
    this.templeMesh = ctx.mesh.upload(T.geo, 'uw-temple');
    // analytic column shadows (temple + gateway columns) shared by the terrain and temple shaders
    const SC = T.cols.filter((c) => c[3] - this.heightAt(c[0], c[1]) > 1.5);
    const SH = `const NCOL = ${SC.length}u;\nconst COLS = array<vec4f, ${SC.length}>(${SC.map((c) => `vec4f(${c[0].toFixed(2)}, ${c[1].toFixed(2)}, ${(c[2] - 0.05).toFixed(2)}, ${c[3].toFixed(2)})`).join(',')});
fn colShadow(wp: vec3f) -> f32 {
  if (abs(wp.x) > 14.0 || wp.z < 28.0 || wp.z > 112.0 || (wp.z > 62.0 && wp.z < 96.0)) { return 1.0; }
  let d = SUN.xz / SUN.y;
  var s = 1.0;
  for (var i = 0u; i < NCOL; i++) {
    let C = COLS[i];
    let h = C.w - wp.y;
    if (h <= 0.0) { continue; }
    let rel = C.xy - wp.xz;
    let t = clamp(dot(rel, d) / dot(d, d), 0.0, h);
    let dist = length(wp.xz + d * t - C.xy);
    s *= mix(1.0, smoothstep(C.z - 0.2, C.z + 0.25, dist), smoothstep(0.0, 0.5, h - t) * step(0.05, t));
  }
  return mix(1.0, s, 0.85);
}
`;
    this.terrain = ctx.pipeline({ code: COMMON + SH + TERRAIN, buffers: [ctx.mesh.layout], layouts: [this.envL], constants: this.consts, label: 'uw-terrain' });
    this.temple = ctx.pipeline({ code: COMMON + SH + TEMPLE, buffers: [ctx.mesh.layout], layouts: [this.envL], constants: this.consts, label: 'uw-temple' });
    await progress(0.5);
    // --- kelp forest
    {
      const rng = ctx.math.makeRng(11), nK = [200, 380, 520][ctx.q.level], K = [], C = [];
      const keep = [...this.poses, ...this.flythrough].map((p) => p.pos);
      const cluster = (x, z) => {
        C.push(x, z);
        const ns = 2 + (rng() < 0.6 ? 1 : 0) + (rng() < 0.3 ? 1 : 0), top = 1 + rng() * 5;
        for (let k = 0; k < ns; k++) {
          const a = rng() * 6.283, rr = k ? 0.25 + rng() * 0.35 : 0, sx = x + Math.cos(a) * rr, sz = z + Math.sin(a) * rr;
          const y = this.heightAt(sx, sz);
          K.push(sx, y - 0.3, sz, Math.max(4, -y - top - rng() * 4 - k * 1.5), rng() * 6.283, 1.4 + rng() * 0.7, rng(), 0);
        }
      };
      for (const [x, z] of [[-7, -137], [-12, -133], [15, -135], [20, -131], [-3, -42], [-15, -48]]) cluster(x, z);
      for (let tries = 0; C.length < nK * 2 && tries < 40000; tries++) {
        const x = rng() * 230 - 115, z = rng() * -142 - 6;
        const zone = ss(-6, -20, z) * (1 - ss(-130, -147, z)) * ss(-0.35, 0.15, N.fbm2(x * 0.02 + 9, z * 0.02, 2));
        if (rng() > zone || Math.hypot(x - 10, z + 70) < 17 || Math.abs(x) > 105 || keep.some((k) => Math.hypot(k[0] - x, k[2] - z) < 4.5)) continue;
        let ok = true;
        for (let i = 0; i < C.length; i += 2) if (Math.hypot(C[i] - x, C[i + 1] - z) < 3.0) { ok = false; break; }
        if (!ok) continue;
        cluster(x, z);
      }
      this.kelpData = new Float32Array(K); this.nKelp = K.length / 8;
      this.kelpVis = new Uint32Array(this.nKelp); this.nKelpVis = 0;
      this.kelpVisBuf = ctx.buffer(this.nKelp * 4, 'storage');
      const kl = ctx.layout(['storage', 'storage']);
      this.kelpBG = ctx.bindGroup(kl, [ctx.buffer(this.kelpData, 'storage'), this.kelpVisBuf]);
      this.kelpMesh = ctx.mesh.upload(kelpGeo(30, 5), 'uw-kelp');
      this.kelp = ctx.pipeline({ code: COMMON + KELP, buffers: [ctx.mesh.layout], layouts: [this.envL, kl], cull: 'none', constants: this.consts, label: 'uw-kelp' });
    }
    await progress(0.6);
    // --- rocks + blade flora
    {
      const pad = (x, z) => Math.min(sdBox2(x, z - 44, 8.5, 13.5), Math.hypot(x - DOORX, z - DOORZ) - 2.5);
      const S = scatter((x, z) => this.heightAt(x, z), N, ctx.math.makeRng(23), ctx.q.level, pad, [...this.poses, ...this.flythrough].map((p) => p.pos));
      this.rockCol = S.colliders;
      this.nRocks = S.rocks.length / 8;
      this.rockInst = ctx.buffer(S.rocks, 'vertex');
      this.rockMesh = ctx.mesh.upload(ctx.mesh.rock(5, ctx.q.level > 0 ? 3 : 2, 0.45), 'uw-rock');
      this.rock = ctx.pipeline({ code: COMMON + ROCK, buffers: [ctx.mesh.layout, ctx.mesh.instanceLayout(['float32x4', 'float32x4'], 3)], layouts: [this.envL], constants: this.consts, label: 'uw-rock' });
      this.nBlades = S.blades.length / 8;
      const fl = ctx.layout(['storage']);
      this.floraBG = ctx.bindGroup(fl, [ctx.buffer(S.blades, 'storage')]);
      this.flora = ctx.pipeline({ code: COMMON + FLORA, layouts: [this.envL, fl], topology: 'triangle-strip', cull: 'none', constants: this.consts, label: 'uw-flora' });
    }
    // --- fish schools
    {
      const q = ctx.q.level, rng = ctx.math.makeRng(31);
      const SC = [ // center, speed, wander radius, size, count, species
        [0, -8.2, 44, 0.8, 14, 1.0, 19, 0.34, 36, 0], [5, -9.6, 59, 0.6, 6, 0.8, 4, 0.3, 24, 1],
        [-14, -10, 46, 0.5, 4, 1.5, 9, 0.16, [36, 60, 80][q], 2], [-6, -6.8, 90, 0.7, 8, 1, 7, 0.26, 26, 3],
        [-15, -17, -55, 1.5, 22, 3, 25, 0.3, [120, 220, 320][q], 4], [30, -24, -95, 0.4, 6, 1.5, 6, 0.42, 8, 5],
        [-6, -19, -50, 0.6, 6, 2, 6, 0.36, 16, 3]];
      const sd = new Float32Array(SC.length * 12), fd = [];
      let start = 0;
      SC.forEach((c, k) => {
        sd.set([c[0], c[1], c[2], c[3], c[4], c[5], c[6], c[7], start, c[8], c[9], rng() * 6.283], k * 12);
        for (let i = 0; i < c[8]; i++) fd.push(c[0] + c[4] * Math.sin(sd[k * 12 + 11]) + (rng() - 0.5) * 4, c[1] + (rng() - 0.5), c[2] + c[6] * Math.sin(sd[k * 12 + 11] * 1.3 + 1) + (rng() - 0.5) * 4, k,
          rng() - 0.5, 0, rng() - 0.5, rng() * 6.283);
        start += c[8];
      });
      const NF = this.nFish = start;
      const fa = ctx.buffer(new Float32Array(fd), 'storage'), fb = ctx.buffer(new Float32Array(fd), 'storage');
      const sb = ctx.buffer(sd, 'storage'), cb = ctx.buffer(new Float32Array(this.cols.flat()), 'storage');
      const sl = ctx.layout(['storage', 'storage-rw', 'storage', 'storage']), dl = ctx.layout(['storage', 'storage']);
      const mod = ctx.shader(COMMON + FISH, 'uw-fish');
      this.fishSim = ctx.compute({ module: mod, entry: 'sim', layouts: [this.envL, sl], constants: { ...this.consts, NF } });
      this.fishSimBG = [ctx.bindGroup(sl, [fa, fb, sb, cb]), ctx.bindGroup(sl, [fb, fa, sb, cb])];
      this.fishDrawBG = [ctx.bindGroup(dl, [fb, sb]), ctx.bindGroup(dl, [fa, sb])];
      this.fishDraw = ctx.pipeline({ module: mod, buffers: [ctx.mesh.layout], layouts: [this.envL, dl], cull: 'none', constants: this.consts, label: 'uw-fish' });
      this.fishMesh = ctx.mesh.upload(fishGeo(ctx.mesh), 'uw-fishmesh');
      this.fishPing = 0;
    }
    // --- turtles, rays, mantas, whale shark
    {
      this.H = (x, z) => this.heightAt(x, z);
      this.critData = new Float32Array(6 * 12);
      animate(this.critData, 0, this.H);
      this.critBuf = ctx.buffer(this.critData, 'storage');
      const cl = ctx.layout(['storage']);
      this.critBG = ctx.bindGroup(cl, [this.critBuf]);
      this.crit = ctx.pipeline({ code: COMMON + CRIT, buffers: [ctx.mesh.layout], layouts: [this.envL, cl], cull: 'none', constants: this.consts, label: 'uw-crit' });
      const M = ctx.mesh;
      this.critMeshes = [[M.upload(turtleGeo(M)), 2, 0], [M.upload(rayGeo(M, false)), 1, 2], [M.upload(rayGeo(M, true)), 2, 3], [M.upload(sharkGeo(M)), 1, 5]];
    }
    // --- deep life
    {
      const rng = ctx.math.makeRng(41), J = [[-2.5, -93.5, -262, 0.45], [3.5, -96, -267, 0.38], [-6, -89.5, -276, 0.55], [6, -92, -281, 0.5]];
      for (let i = 0; i < 12; i++) J.push([(rng() - 0.5) * 120, -60 - rng() * 45, -200 - rng() * 100, 0.35 + rng() * 0.35]);
      for (const j of J) j[1] = Math.max(j[1], this.heightAt(j[0], j[2]) + 3);
      this.nJel = J.length;
      const dl = ctx.layout(['storage']);
      this.deepBG = ctx.bindGroup(dl, [ctx.buffer(new Float32Array(J.flat()), 'storage')]);
      const mod = ctx.shader(COMMON + DEEP, 'uw-deep');
      this.chain = ctx.pipeline({ module: mod, vs: 'vsChain', fs: 'fsGlow', layouts: [this.envL, dl], blend: 'add', cull: 'none', constants: this.consts, label: 'uw-chain' });
      this.jelly = ctx.pipeline({ module: mod, vs: 'vsJelly', fs: 'fsJelly', buffers: [ctx.mesh.layout], layouts: [this.envL, dl], blend: 'add', cull: 'back', constants: this.consts, label: 'uw-jelly' });
      this.jellyMesh = ctx.mesh.upload(ctx.mesh.lathe([[0.001, -1], [0.35, -0.9], [0.62, -0.5], [0.7, 0], [0.6, 0.55], [0.35, 0.92], [0.001, 1.02]], 24));
    }
    await progress(0.7);
    // --- god rays + particles
    this.nShafts = [24, 40, 56][ctx.q.level];
    this.shafts = ctx.pipeline({ code: COMMON + SHAFTS, layouts: [this.envL], blend: 'add', cull: 'none', topology: 'triangle-strip', constants: this.consts, label: 'uw-shafts' });
    {
      const NM = this.nMotes = [2048, 4096, 8192][ctx.q.level], rng = ctx.math.makeRng(5), md = new Float32Array(NM * 8);
      for (let i = 0; i < NM; i++) md.set([rng() * 36 - 18, -6 - rng() * 30, rng() * 36 + 62, i, 0, 0, 0, 0], i * 8);
      const buf = ctx.buffer(md, 'storage'), sl = ctx.layout(['storage-rw']), dl = ctx.layout(['storage']);
      const mod = ctx.shader(COMMON + MOTES, 'uw-motes');
      this.moteSim = ctx.compute({ module: mod, entry: 'sim', layouts: [this.envL, sl], constants: { ...this.consts, NM } });
      this.moteSimBG = ctx.bindGroup(sl, [buf]);
      this.moteDraw = ctx.pipeline({ module: mod, layouts: [this.envL, dl], blend: 'add', cull: 'none', constants: { ...this.consts, NM }, label: 'uw-motes' });
      this.moteDrawBG = ctx.bindGroup(dl, [buf]);
    }
    this.bg = ctx.pipeline({ code: COMMON + BG, layouts: [this.envL], depthWrite: false, constants: this.consts, label: 'uw-bg' });
    await progress(1);
  },

  update(ctx, dt, t, cam) {
    const y = cam.eye[1], d = Math.max(-y, 0);
    const kelp = ss(14, 22, d) * (1 - ss(38, 55, d)), deep = ss(36, 95, d);
    const e = ctx.env, L = lightAt(this.L, y);
    e.params[0] = mix(mix(0.015, 0.027, kelp), 0.02, deep);   // fog density
    e.params[1] = mix(mix(105, 85, kelp), 75, deep);           // fog max distance
    e.params[2] = deep; e.params[3] = kelp;
    // door / core lighting follows the water
    e.fogDensity = e.params[0];
    for (let i = 0; i < 3; i++) {
      const w = L[i] * WCOL[i];
      e.fogColor[i] = w; ctx.clearColor[i] = w;
      e.sunColor[i] = L[i] * 0.5; e.ambientSky[i] = w * 2.0; e.ambientGround[i] = w * 0.7;
    }
    ctx.post.exposure = mix(0.95, 2.6, ss(25, 105, d));
    if (ctx.audio && this.zones && (ctx.frame & 15) === 0) {
      const g0 = 1 - ss(12, 24, d), g2 = ss(38, 70, d), g1 = Math.max(0, 1 - g0 - g2);
      if (Math.abs(g0 - this.zoneG[0]) + Math.abs(g1 - this.zoneG[1]) + Math.abs(g2 - this.zoneG[2]) > 0.02) {
        this.zoneG[0] = g0; this.zoneG[1] = g1; this.zoneG[2] = g2;
        this.zones[0].set(g0, 2); this.zones[1].set(g1, 2); this.zones[2].set(g2, 2);
      }
    }
    animate(this.critData, t, this.H);
    ctx.write(this.critBuf, this.critData);
    // kelp culling (distance + frustum) -> compact visible index list
    const f = cam.fwd, r = cam.right, u = cam.up, ty = Math.tan(cam.fov / 2), tx = ty * ctx.width / ctx.height;
    const kx = Math.sqrt(1 + tx * tx), ky = Math.sqrt(1 + ty * ty), maxD = e.params[1] + 4;
    const K = this.kelpData, V = this.kelpVis; let n = 0;
    for (let i = 0; i < this.nKelp; i++) {
      const o = i * 8, h = K[o + 3] * 0.5, rad = h * 1.35 + 2;
      const vx = K[o] - cam.eye[0], vy = K[o + 1] + h - cam.eye[1], vz = K[o + 2] - cam.eye[2];
      const z = vx * f[0] + vy * f[1] + vz * f[2];
      if (z < -rad || Math.hypot(vx, vy, vz) - rad > maxD) continue;
      if (Math.abs(vx * r[0] + vy * r[1] + vz * r[2]) - rad * kx > z * tx) continue;
      if (Math.abs(vx * u[0] + vy * u[1] + vz * u[2]) - rad * ky > z * ty) continue;
      V[n++] = i;
    }
    this.nKelpVis = n;
    if (n) ctx.queue.writeBuffer(this.kelpVisBuf, 0, V.buffer, 0, n * 4);
  },

  computeBefore(ctx, enc) {
    const p = ctx.beginCompute(enc);
    p.setBindGroup(1, this.envBG);
    this.fishPing ^= 1;
    p.setPipeline(this.fishSim); p.setBindGroup(2, this.fishSimBG[this.fishPing]); p.dispatchWorkgroups(Math.ceil(this.nFish / 64));
    p.setPipeline(this.moteSim); p.setBindGroup(2, this.moteSimBG); p.dispatchWorkgroups(Math.ceil(this.nMotes / 64));
    p.end();
  },

  renderTransparent(ctx, pass) {
    pass.setBindGroup(1, this.envBG);
    pass.setPipeline(this.shafts); pass.draw(22, this.nShafts);
    if (ctx.camera.eye[1] < -22) {
      pass.setBindGroup(2, this.deepBG);
      pass.setPipeline(this.chain); pass.draw(12, 5 * 70);
      pass.setPipeline(this.jelly); this.jellyMesh.draw(pass, this.nJel);
    }
    pass.setPipeline(this.moteDraw); pass.setBindGroup(2, this.moteDrawBG); pass.draw(6, this.nMotes + 12 * 18);
  },

  audio(ctx, a) {
    a.setReverb({ seconds: 6.5, damp: 0.72, wet: 0.95, predelay: 0.045 });
    const r = a.rng, Z = this.zones = [a.bus({ gain: 1, reverb: 0.45 }), a.bus({ gain: 0, reverb: 0.55 }), a.bus({ gain: 0, reverb: 0.75 })];
    const sub = Z.map((z) => [-0.65, 0, 0.65].map((pan) => a.bus({ pan, parent: z })));
    const pick = (k) => sub[k][Math.floor(r() * 3)];
    // everywhere: soft muffled water body
    a.noiseBed({ color: 'brown', freq: 240, q: 0.5, gain: 0.05, mod: 0.4, modRate: 0.03 });
    // shallows: bright water, distant surf swells, little bubble bloops, a light pad
    a.noiseBed({ color: 'pink', filter: 'bandpass', freq: 1500, q: 0.45, gain: 0.014, mod: 0.5, modRate: 0.05, bus: Z[0] });
    a.noiseBed({ color: 'brown', freq: 420, gain: 0.03, gainMod: 0.8, modRate: 0.07, bus: Z[0] });
    a.every(1.2, 4.5, (when) => a.chirp({ f0: 420 + r() * 380, f1: 1100 + r() * 700, dur: 0.05 + r() * 0.04, repeat: 1 + Math.floor(r() * 3), gap: 0.05 + r() * 0.08, vib: 0, gain: 0.007, when, bus: pick(0) }));
    a.pad({ chords: [[62, 66, 69, 73], [59, 64, 66, 71], [57, 61, 64, 69], [64, 68, 71, 76], [61, 64, 68, 73]], gain: 0.014, cutoff: 1700, change: [16, 30], bus: Z[0] });
    // kelp: deeper current, wood-like creaks of stipes, a far whale call
    a.noiseBed({ color: 'brown', freq: 150, q: 0.6, gain: 0.05, mod: 0.5, modRate: 0.04, bus: Z[1] });
    a.every(5, 14, (when) => a.chirp({ f0: 150 + r() * 60, f1: 110 + r() * 30, dur: 0.25 + r() * 0.3, vib: 6, vibRate: 18, gain: 0.006, when, bus: pick(1) }));
    a.every(28, 60, (when) => {
      const f = 230 + r() * 80;
      a.chirp({ f0: f, f1: f * (1.3 + r() * 0.4), dur: 2.4 + r() * 1.5, vib: 5, vibRate: 0.9, gain: 0.011, when, bus: pick(1) });
      a.chirp({ f0: f * 1.6, f1: f * 1.2, dur: 2.2, vib: 4, vibRate: 0.7, gain: 0.007, when: when + 2.8 + r(), bus: pick(1) });
    }, { startDelay: 12 });
    a.pad({ chords: [[50, 57, 62, 64], [48, 55, 60, 62], [45, 52, 57, 60], [53, 57, 60, 64]], gain: 0.016, cutoff: 900, change: [18, 34], bus: Z[1] });
    // deep: low pressure drone, sparse glassy bioluminescent pings
    a.drone({ freq: a.hz(29), partials: [1, 2, 3.01, 4.53], gain: 0.05, cutoff: 280, bus: Z[2] });
    const notes = a.scale(81, 'minorPentatonic', 2);
    a.every(3, 9, (when) => a.bell({ freq: a.hz(notes[Math.floor(r() * notes.length)]), gain: 0.012, decay: 6 + r() * 3, ratio: 2.76, index: 0.9, when, bus: pick(2) }));
    this.zoneG = [1, 0, 0];
  },

  render(ctx, pass) {
    pass.setBindGroup(1, this.envBG);
    pass.setPipeline(this.temple); this.templeMesh.draw(pass);
    pass.setPipeline(this.rock);
    pass.setVertexBuffer(0, this.rockMesh.vertexBuffer); pass.setVertexBuffer(1, this.rockInst);
    pass.setIndexBuffer(this.rockMesh.indexBuffer, this.rockMesh.indexFormat); pass.drawIndexed(this.rockMesh.indexCount, this.nRocks);
    pass.setPipeline(this.fishDraw); pass.setBindGroup(2, this.fishDrawBG[this.fishPing]); this.fishMesh.draw(pass, this.nFish);
    pass.setPipeline(this.crit); pass.setBindGroup(2, this.critBG);
    for (const m of this.critMeshes) m[0].draw(pass, m[1], m[2]);
    pass.setPipeline(this.flora); pass.setBindGroup(2, this.floraBG); pass.draw(10, this.nBlades);
    if (this.nKelpVis) {
      pass.setPipeline(this.kelp); pass.setBindGroup(2, this.kelpBG);
      pass.setVertexBuffer(0, this.kelpMesh.vertexBuffer); pass.setIndexBuffer(this.kelpMesh.indexBuffer, this.kelpMesh.indexFormat);
      pass.drawIndexed(this.kelpMesh.indexCount, this.nKelpVis);
    }
    pass.setPipeline(this.terrain);
    pass.setVertexBuffer(0, this.tVB); pass.setIndexBuffer(this.tIB, 'uint32'); pass.drawIndexed(this.tCount);
    pass.setPipeline(this.bg); pass.draw(3);
  },
};
