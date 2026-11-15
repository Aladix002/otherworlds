// Podmorský svet: turquoise shallows with a sunken Greek temple -> golden kelp forest -> the bioluminescent deep.
import COMMON from './common.wgsl';
import GEN from './gen.wgsl';
import BG from './bg.wgsl';
import TERRAIN from './terrain.wgsl';
import TEMPLE from './temple.wgsl';
import { buildTemple } from './temple.js';
import KELP from './kelp.wgsl';

const PADY = -13.0, DOORX = -3.0, DOORZ = 104.0;
const SEGX = 256, SEGZ = 384, SX = 320, SZ = 480, CZ = -90;
const SUN = [0.2425, 0.9216, -0.3031], WCOL = [0.045, 0.3, 0.36];

const ss = (a, b, x) => { let t = (x - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
function sdBox2(px, pz, bx, bz) {
  const qx = Math.abs(px) - bx, qz = Math.abs(pz) - bz;
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0);
}
// CPU twin of terrainH() in common.wgsl (without/with the flattened pads)
function rawH(N, x, z) {
  const zw = z + 8 * N.fbm2(x * 0.008 + 3.1, z * 0.008 - 1.7, 2);
  let y = -7 - 6 * ss(115, 15, zw) - 8 * ss(25, -25, zw) - 14 * ss(-20, -140, zw) - 72 * ss(-135, -245, zw) - 6 * ss(-230, -320, zw);
  const kelp = ss(10, -30, zw) * (1 - ss(-125, -160, zw));
  y += N.fbm2(x * 0.035, z * 0.035, 3) * (0.7 + 1.3 * kelp);
  const slope = ss(-120, -150, zw) * (1 - ss(-250, -290, zw));
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
// CPU twins of lightAt / waterAt (for env + door lighting)
function lightAt(out, y) {
  const d = Math.min(Math.max(-y, 0), 150);
  const kb = ss(12, 24, d) * (1 - ss(34, 55, d)), db = ss(35, 80, d), e = Math.exp(-Math.max(d - 35, 0) * 0.045) * 2.2;
  out[0] = Math.exp(-d * 0.045) * mix(1, 1.3, kb) * mix(1, 0.4, db) * e;
  out[1] = Math.exp(-d * 0.022) * mix(1, 1.08, kb) * mix(1, 0.75, db) * e;
  out[2] = Math.exp(-d * 0.02) * mix(1, 0.6, kb) * mix(1, 1.6, db) * e;
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
    { pos: [-10, -22, -38], yaw: 0.1, pitch: 0.16 },
    { pos: [10, -18, -50], yaw: 0, pitch: 0.05, t: 20 },
    { pos: [0, -33, -122], yaw: 0, pitch: -0.32 },
    { pos: [0, -95, -255], yaw: 0, pitch: 0.06 },
  ],
  flythrough: [
    { pos: [2, -6.5, 80], yaw: 0, pitch: -0.08 }, { pos: [10, -8, 62], yaw: 0.3, pitch: -0.05 },
    { pos: [12, -9, 36], yaw: 0.6, pitch: 0 }, { pos: [-2, -14, 8], yaw: 0.2, pitch: -0.1 },
    { pos: [-10, -22, -38], yaw: 0.1, pitch: 0.1 }, { pos: [6, -20, -75], yaw: -0.3, pitch: 0 },
    { pos: [0, -32, -125], yaw: 0, pitch: -0.3 }, { pos: [0, -62, -185], yaw: 0, pitch: -0.25 },
    { pos: [0, -95, -255], yaw: 0, pitch: 0.05 },
  ],
  flythroughDuration: 60,
  doors: [{ pos: [DOORX, null, DOORZ], yaw: Math.PI, to: 'jungle' }],
  bounds: { min: [-140, -125, -310], max: [140, -0.9, 135] },
  env: {
    sunDir: SUN, sunColor: [1.0, 1.5, 1.6], fogColor: [0.05, 0.5, 0.62], fogDensity: 0.016,
    ambientSky: [0.08, 0.7, 0.85], ambientGround: [0.03, 0.25, 0.3],
  },
  post: { exposure: 1.0, bloom: 0.1, bloomThreshold: 1.0, vignette: 0.3, saturation: 1.12, contrast: 1.02 },
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
    const tMod = ctx.shader(COMMON + TERRAIN, 'uw-terrain');
    const tGenL = ctx.layout(['storage-rw']);
    const tc = { ...this.consts, SEGX, SEGZ, SX, SZ, CZ };
    const tGen = ctx.compute({ module: tMod, entry: 'gen', layouts: [this.envL, tGenL], constants: tc });
    let cp = ctx.beginCompute(enc);
    cp.setPipeline(tGen); cp.setBindGroup(1, this.envBG); cp.setBindGroup(2, ctx.bindGroup(tGenL, [this.tVB]));
    cp.dispatchWorkgroups(Math.ceil(nv / 64)); cp.end();
    ctx.queue.submit([enc.finish()]);
    await progress(0.3);

    this.terrain = ctx.pipeline({ module: tMod, buffers: [ctx.mesh.layout], layouts: [this.envL], constants: this.consts, label: 'uw-terrain' });
    // --- temple and ruins (one static mesh)
    const T = buildTemple(ctx.mesh, (x, z) => this.heightAt(x, z), PADY, [DOORX, this.doorY, DOORZ], ctx.math.makeRng(7));
    this.cols = T.cols; this.boxes = T.boxes;
    this.templeMesh = ctx.mesh.upload(T.geo, 'uw-temple');
    this.temple = ctx.pipeline({ code: COMMON + TEMPLE, buffers: [ctx.mesh.layout], layouts: [this.envL], constants: this.consts, label: 'uw-temple' });
    await progress(0.5);
    // --- kelp forest
    {
      const rng = ctx.math.makeRng(11), nK = [150, 260, 380][ctx.q.level], K = [], C = [];
      for (let tries = 0; C.length < nK * 2 && tries < 40000; tries++) {
        const x = rng() * 230 - 115, z = rng() * -136 - 6;
        const zone = ss(-6, -20, z) * (1 - ss(-122, -142, z)) * ss(-0.35, 0.15, N.fbm2(x * 0.02 + 9, z * 0.02, 2));
        if (rng() > zone || Math.hypot(x - 10, z + 70) < 17 || Math.abs(x) > 105) continue;
        let ok = true;
        for (let i = 0; i < C.length; i += 2) if (Math.hypot(C[i] - x, C[i + 1] - z) < 3.4) { ok = false; break; }
        if (!ok) continue;
        C.push(x, z);
        const ns = 2 + (rng() < 0.6 ? 1 : 0) + (rng() < 0.3 ? 1 : 0), top = 1 + rng() * 5;
        for (let k = 0; k < ns; k++) {
          const a = rng() * 6.283, rr = k ? 0.25 + rng() * 0.35 : 0, sx = x + Math.cos(a) * rr, sz = z + Math.sin(a) * rr;
          const y = this.heightAt(sx, sz);
          K.push(sx, y - 0.3, sz, Math.max(4, -y - top - rng() * 4 - k * 1.5), rng() * 6.283, 1.0 + rng() * 0.5, rng(), 0);
        }
      }
      this.kelpData = new Float32Array(K); this.nKelp = K.length / 8;
      this.kelpVis = new Uint32Array(this.nKelp); this.nKelpVis = 0;
      this.kelpVisBuf = ctx.buffer(this.nKelp * 4, 'storage');
      const kl = ctx.layout(['storage', 'storage']);
      this.kelpBG = ctx.bindGroup(kl, [ctx.buffer(this.kelpData, 'storage'), this.kelpVisBuf]);
      this.kelpMesh = ctx.mesh.upload(kelpGeo(34, 4), 'uw-kelp');
      this.kelp = ctx.pipeline({ code: COMMON + KELP, buffers: [ctx.mesh.layout], layouts: [this.envL, kl], cull: 'none', constants: this.consts, label: 'uw-kelp' });
    }
    await progress(0.7);
    this.bg = ctx.pipeline({ code: COMMON + BG, layouts: [this.envL], depthWrite: false, constants: this.consts, label: 'uw-bg' });
    await progress(1);
  },

  update(ctx, dt, t, cam) {
    const y = cam.eye[1], d = Math.max(-y, 0);
    const kelp = ss(14, 22, d) * (1 - ss(38, 55, d)), deep = ss(36, 95, d);
    const e = ctx.env, L = lightAt(this.L, y);
    e.params[0] = mix(mix(0.015, 0.024, kelp), 0.02, deep);   // fog density
    e.params[1] = mix(mix(105, 85, kelp), 75, deep);           // fog max distance
    e.params[2] = deep; e.params[3] = kelp;
    // door / core lighting follows the water
    e.fogDensity = e.params[0];
    for (let i = 0; i < 3; i++) {
      const w = L[i] * WCOL[i];
      e.fogColor[i] = w; ctx.clearColor[i] = w;
      e.sunColor[i] = L[i] * 0.5; e.ambientSky[i] = w * 2.0; e.ambientGround[i] = w * 0.7;
    }
    ctx.post.exposure = mix(1.0, 2.6, ss(25, 105, d));
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

  render(ctx, pass) {
    pass.setBindGroup(1, this.envBG);
    pass.setPipeline(this.temple); this.templeMesh.draw(pass);
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
