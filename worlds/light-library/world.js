// Sanctuary of Light and Books — a cross-shaped baroque library drifting in deep space. See NOTES.md.
import { heightAt, sdf, DOOR } from './layout.js';
import { buildBay, buildStatic, bayInstances, bookMesh, quillMesh, SPH } from './geo.js';
import COMMON from './common.wgsl';
import SCENE from './scene.wgsl';
import FX from './fx.wgsl';

const yawTo = (x, z, tx, tz) => Math.atan2(x - tx, z - tz);
const look = (x, y, z, tx, ty, tz, t) => ({ pos: [x, y, z], yaw: yawTo(x, z, tx, tz), pitch: Math.atan2(ty - y, Math.hypot(tx - x, tz - z)), t });
// fly-through: nave -> past the door and back -> stair side -> crossing -> court -> west transept -> nook -> up to the gallery
const PATH = [[0, 1.7, 26], [0.6, 1.7, 34], [1.6, 1.7, 40.5], [0, 1.8, 37], [-1.2, 1.8, 28], [0.8, 2.2, 18], [1.5, 3, 8], [3, 3.4, 1], [12, 2.4, -0.5], [24, 1.9, 0.5],
  [36, 1.8, 0], [43, 1.9, 3.6], [50.5, 2.2, 2], [49, 2.4, -4], [41, 2, -2.5], [30, 2.6, 0], [14, 4.5, 0.8], [0, 6.5, 2], [-14, 4, 0.5], [-28, 2.2, -0.5],
  [-40, 1.8, 0.5], [-44, 1.8, 0.2], [-36, 3.2, -1], [-22, 6.4, 3.5], [-8, 6.7, 5.6], [-5.7, 6.7, 12], [-5.4, 6.8, 22], [-2, 7.5, 30], [0, 8, 20]];
function flyPath() {
  const out = []; let prev = 0;
  for (let i = 0; i < PATH.length; i++) {
    const p = PATH[i], a = PATH[Math.max(i - 1, 0)], b = PATH[Math.min(i + 1, PATH.length - 1)];
    let yaw = yawTo(a[0], a[2], b[0], b[2]);
    if (i === 2) yaw = Math.PI; if (i === 3) yaw = Math.PI * 1.6; if (i === 21) yaw = Math.PI / 2; if (i === 22) yaw = Math.PI * 1.1; if (i === 28) yaw = 0;
    while (yaw - prev > Math.PI) yaw -= 2 * Math.PI;
    while (yaw - prev < -Math.PI) yaw += 2 * Math.PI;
    prev = yaw;
    out.push({ pos: p, yaw, pitch: i > 22 ? -0.22 : i === 7 || i === 17 ? 0.3 : 0.04 });
  }
  return out;
}
// floating books: home (x, y, z), shelf normal (x, z), hover point, period, offset, hue key
const BOOKS = [
  [-4.5, 2.0, 27, 1, 0, -1.7, 1.5, 23.6, 64, 22, 0.05], [4.5, 1.6, 33, -1, 0, 1.3, 1.45, 31.5, 77, 50, 0.3], [-4.5, 2.8, 12.2, 1, 0, -0.6, 1.6, 9.6, 71, 5, 0.55],
  [4.5, 2.4, -14, -1, 0, 1.5, 1.55, -12, 83, 30, 0.8], [-12.4, 2.2, -4.5, 0, 1, -14, 1.5, -1, 69, 12, 0.18], [20, 1.8, 4.5, 0, -1, 22, 1.55, 1.4, 74, 40, 0.68],
];
// orrery: orbit radius, size, angular speed, tilt x, tilt z, hue
const ORB = [[1.5, 0.11, 0.26, 0.05, 0.02, 0.07], [2.3, 0.17, 0.17, -0.04, 0.06, 0.55], [3.2, 0.2, 0.12, 0.07, -0.03, 0.33], [4.3, 0.36, 0.065, -0.05, -0.05, 0.09], [5.4, 0.28, 0.04, 0.04, 0.07, 0.62]];
const OC = [0, 9, 0], NS = 11, NR = 6, NBK = BOOKS.length;
const ss = (a, b, x) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); };

export default {
  id: 'light-library',
  title: 'Sanctuary of Light and Books',
  movement: 'walk',
  spawn: { pos: [0, 1.6, 25], yaw: 0, pitch: 0.07 },
  poses: [
    look(0.4, 1.7, 30, 0, 5.6, 0, 20),                 // the long hall toward the orrery
    look(1.6, 2.3, 21, -3.6, 0.2, 26.5, 20),          // stained-glass light on the floor and shelves
    look(-41.5, 1.7, 1.2, -49, 5.2, -0.4, 30),        // the galaxy through the great window of the nook
    look(-0.3, 1.85, 24.9, -1.7, 1.75, 23.6, 8),      // a floating book with glowing letters
    look(-4.7, 7.5, 10.5, 1.5, 4.6, 0, 20),          // upper gallery looking down on the crossing and orrery
    look(-1.4, 1.65, 38.6, 0.3, 1.25, 44, 20),        // the door between the shelves
    look(40.2, 1.8, 3.8, 48, 2.2, -1, 20),            // fountain court
    look(-43.2, 1.5, 1.4, -45.9, 0.9, 3.6, 20),       // the sleeping cat in the nook
  ],
  flythrough: flyPath(),
  flythroughDuration: 75,
  doors: [{ pos: DOOR, yaw: Math.PI, to: 'turtle-island' }],
  bounds: { min: [-49, -1, -47.5], max: [57.2, 30, 47.5] },
  env: { sunDir: [0.6, 0.68, -0.42], sunColor: [0.5, 0.42, 0.34], fogColor: [0.5, 0.33, 0.15], fogDensity: 0.004,
    ambientSky: [0.34, 0.3, 0.26], ambientGround: [0.2, 0.16, 0.12] },
  post: { exposure: 1.05, bloom: 0.16, bloomThreshold: 1.0, bloomKnee: 0.6, bloomRadius: 1.15, vignette: 0.28, saturation: 1.08, contrast: 1.03 },
  clearColor: [0.5, 0.33, 0.15],
  doorLight: [0.1, 0.08, 0.06],
  eyeHeight: 1.6,
  foot: 0,

  heightAt(x, z) { return heightAt(x, z, this.foot); },
  sdf(x, y, z) { return sdf(x, y, z, this.foot); },

  async init(ctx, progress) {
    const M = ctx.mesh, lv = ctx.q.level;
    const up = (g) => ({ vb: ctx.buffer(g.verts, 'vertex'), ib: ctx.buffer(g.idx, 'index'), n: g.idx.length });
    const [bay, bayT] = buildBay(M);
    await progress(0.2);
    const [stat, statT] = buildStatic(M);
    this.bay = up(bay); this.bayT = up(bayT); this.stat = up(stat); this.statT = up(statT);
    const BI = bayInstances();
    this.bayI = ctx.buffer(BI, 'vertex'); this.nBay = BI.length / 16;
    const ID = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0];
    this.idI = ctx.buffer(new Float32Array(ID), 'vertex');
    // spheres (orrery, globes), quill
    this.sph = up(sphereGeo(M));
    this.SD = new Float32Array(NS * 16); this.sphI = ctx.buffer(this.SD, 'vertex');
    this.quill = up(quillMesh(M));
    this.QD = new Float32Array(ID); this.quillI = ctx.buffer(this.QD, 'vertex');
    // floating books
    const bm = bookMesh();
    this.bookV = ctx.buffer(bm.verts, 'vertex'); this.bookX = ctx.buffer(bm.idx, 'index'); this.nBookI = bm.idx.length;
    this.BD = new Float32Array(NBK * 16); this.bookI = ctx.buffer(this.BD, 'storage');
    // orbit rings
    this.ring = M.upload(M.torus(1, 0.0001, 72, 6));
    this.RD = new Float32Array(NR * 8); this.ringI = ctx.buffer(this.RD, 'vertex');
    for (let i = 0; i < 5; i++) this.RD.set([ORB[i][0], ORB[i][3], ORB[i][4], 0.028, OC[0], OC[1], OC[2], 0], i * 8);
    // lights: orrery sun, door candles, fireplace, lamps, fountain, celestial globe
    const LD = new Float32Array([0, 9, 0, 19, 9, 5.6, 2.4, 0, 1.7, 1.9, 44, 7, 2.6, 1.6, 0.7, 0, -1.7, 1.9, 44, 7, 2.6, 1.6, 0.7, 0,
      -43, 0.9, -6.3, 9, 5, 1.8, 0.5, 0, -45.9, 1.35, 3.65, 5, 1.6, 1.0, 0.45, 0, 3.35, 1.35, 29.4, 5, 1.6, 1.0, 0.45, 0,
      47, 2.2, 0, 8, 0.5, 1.1, 1.2, 0, 0, 2.2, -28, 6, 0.9, 0.7, 0.5, 0]);
    const uL = ctx.layout(['uniform']), sL = ctx.layout(['storage']);
    this.dL = ctx.layout(['texture-depth']); this.vL = ctx.layout(['texture', 'sampler']);
    this.uBG = ctx.bindGroup(uL, [ctx.buffer(LD, 'uniform')]);
    this.bkBG = ctx.bindGroup(sL, [this.bookI]);

    const scene = ctx.shader(COMMON + SCENE, 'scene'), fx = ctx.shader(COMMON + FX, 'fx');
    const v4 = { arrayStride: 48, stepMode: 'vertex', attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32x3' },
      { shaderLocation: 2, offset: 24, format: 'float32x2' }, { shaderLocation: 3, offset: 32, format: 'float32x4' }] };
    const IL = M.instanceLayout(['float32x4', 'float32x4', 'float32x4', 'float32x4'], 4), IB = M.instanceLayout(['float32x4', 'float32x4', 'float32x4', 'float32x4'], 3);
    const P = (d) => ctx.pipelineAsync(d), geo = { module: scene, buffers: [v4, IL], layouts: [uL] };
    await progress(0.6);
    [this.pPre, this.pMain, this.pObj, this.pT, this.pBook, this.pBird, this.pRing, this.pMote, this.pGlyph, this.pDrop, this.pVol, this.pMix] = await Promise.all([
      P({ ...geo, fs: 'fsPre', writeMask: 0, label: 'pre' }),
      P({ ...geo, depthCompare: 'equal', depthWrite: false, label: 'main' }),
      P({ ...geo, label: 'obj' }),
      P({ ...geo, fs: 'fsT', blend: 'premul', cull: 'none', label: 'blend' }),
      P({ module: scene, vs: 'vsBook', fs: 'fsBook', buffers: [M.layout, IB], layouts: [uL], cull: 'none', label: 'book' }),
      P({ module: scene, vs: 'vsBird', fs: 'fsBird', layouts: [uL], cull: 'none', label: 'bird' }),
      P({ module: fx, vs: 'vsRing', fs: 'fsRing', buffers: [M.layout, M.instanceLayout(['float32x4', 'float32x4'], 3)], layouts: [uL], blend: 'premul', label: 'ring' }),
      P({ module: fx, vs: 'vsMote', fs: 'fsDot', layouts: [uL], blend: 'add', cull: 'none', label: 'mote' }),
      P({ module: fx, vs: 'vsGlyph', fs: 'fsGlyph', layouts: [uL, sL], blend: 'add', cull: 'none', label: 'glyph' }),
      P({ module: fx, vs: 'vsDrop', fs: 'fsDot', layouts: [uL], blend: 'add', cull: 'none', label: 'drop' }),
      P({ module: fx, vs: 'vsFs', fs: 'fsVol', layouts: [uL, this.dL], format: 'rgba16float', depthFormat: null, label: 'vol' }),
      P({ module: fx, vs: 'vsFs', fs: 'fsMix', layouts: [uL, this.dL, this.vL], blend: 'add', depthFormat: null, label: 'mix' }),
    ]);
    this.nMote = [1200, 2600, 4500][lv]; this.nBird = [30, 48, 72][lv]; this.nDrop = [90, 150, 220][lv];
    this.volDiv = lv > 1 ? 1.5 : 2;
    this.resize(ctx);
    this.pageT = 0; this.stepT = 0;
    await progress(1);
  },
  resize(ctx) {
    if (!ctx.depthView) return;
    this.dv = ctx.depthView;
    const w = Math.ceil(ctx.width / this.volDiv), h = Math.ceil(ctx.height / this.volDiv);
    if (!this.vt || this.vw !== w || this.vh !== h) {
      this.vt?.destroy(); this.vw = w; this.vh = h;
      this.vt = ctx.texture(w, h, 'rgba16float', GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT);
      this.passV = { colorAttachments: [{ view: this.vt.createView(), clearValue: [0, 0, 0, 0], loadOp: 'clear', storeOp: 'store' }] };
      this.vBG = ctx.bindGroup(this.vL, [this.vt.createView(), ctx.samplers.linear]);
    }
    this.dBG = ctx.bindGroup(this.dL, [ctx.depthView]);
    this.passM = { colorAttachments: [{ view: ctx.hdrView, loadOp: 'load', storeOp: 'store' }] };
  },

  update(ctx, dt, t, cam) {
    this.foot = cam.pos[1] - cam.eyeHeight;
    // the sun drifts slowly, so the colours creep across floor and shelves
    const el = 0.75 + 0.06 * Math.sin(t * 0.013), az = 0.61 + 0.1 * Math.sin(t * 0.019 + 1), S = ctx.env.sunDir;
    S[0] = Math.cos(el) * Math.cos(az); S[1] = Math.sin(el); S[2] = -Math.cos(el) * Math.sin(az);
    // spheres: orrery sun, planets and a moon, three globes
    this.k = 0;
    this.put(OC[0], OC[1], OC[2], 0.6, t * 0.02, 0, 2, 0);
    for (let i = 0; i < 5; i++) {
      const o = ORB[i], a = t * o[2] + i * 2.4, x = o[0] * Math.cos(a), z = o[0] * Math.sin(a);
      const c1 = Math.cos(o[3]), s1 = Math.sin(o[3]), c2 = Math.cos(o[4]), s2 = Math.sin(o[4]), y1 = -s1 * z, z1 = c1 * z;
      const px = OC[0] + c2 * x - s2 * y1, py = OC[1] + s2 * x + c2 * y1, pz = OC[2] + z1;
      this.put(px, py, pz, o[1], t * 0.3, i + 1, 1, o[5]);
      if (i === 2) { const m = t * 0.7; this.put(px + 0.5 * Math.cos(m), py + 0.08 * Math.sin(m), pz + 0.5 * Math.sin(m), 0.06, 0, 9, 1, 0.12); }
      if (i === 3) { const R = this.RD; R[40] = 0.62; R[41] = 0.35; R[42] = 0.2; R[43] = 0.035; R[44] = px; R[45] = py; R[46] = pz; }
    }
    this.put(3.2, 1.25, 21, 0.45, t * 0.11, 3, 0, 0); this.put(-47.6, 1.25, 4.6, 0.45, -t * 0.08, 8, 0, 0); this.put(0, 1.95, -28, 1.25, t * 0.045, 0, 3, 0);
    this.put(0, -50, 0, 0.01, 0, 0, 0, 0);
    ctx.write(this.sphI, this.SD); ctx.write(this.ringI, this.RD);
    // quill writing on the desk (same schedule as the page shader)
    const pr = (t / 120 % 1) * 17, row = Math.floor(pr), uy = (17 - row + 0.45) / 19, ux = 0.1 + 0.8 * (pr - row), Q = this.QD;
    const ux2 = 0.3 + 0.1 * Math.sin(t * 6.1) , uz2 = 0.22 + 0.1 * Math.cos(t * 4.3), ul = Math.hypot(ux2, 1, uz2);
    Q[0] = 1; Q[1] = ux2 / ul; Q[2] = 0; Q[3] = 3.1 - 0.15 + (1 - uy) * 0.3;
    Q[4] = 0; Q[5] = 1 / ul; Q[6] = 0; Q[7] = 0.86 + 0.004 * Math.sin(t * 9);
    Q[8] = 0; Q[9] = uz2 / ul; Q[10] = 1; Q[11] = 28.6 + 0.1 + ux * 0.23 + 0.004 * Math.sin(t * 13);
    ctx.write(this.quillI, Q);
    // floating books
    const B = this.BD;
    let turn = false;
    for (let i = 0; i < NBK; i++) {
      const b = BOOKS[i], o = i * 16, u = ((t + b[9]) / b[8]) % 1;
      const slide = ss(0, 0.05, u) * (1 - ss(0.88, 0.93, u)), fly = ss(0.05, 0.22, u) * (1 - ss(0.72, 0.88, u));
      const open = ss(0.14, 0.27, u) * (1 - ss(0.7, 0.8, u));
      const fl = (t * 0.21 + i * 0.37) % 1, flip = ss(0.72, 1, fl);
      const bob = fly * 0.12 * Math.sin(t * 0.5 + i * 2), yw = fly * (0.5 * Math.sin(t * 0.13 + i) + 0.4);
      const nx = b[3], nz = b[4], hx = b[0] + nx * 0.45, hz = b[2] + nz * 0.45;
      const px = b[0] - nx * 0.02 + nx * 0.47 * slide + (b[5] - hx) * fly, py = b[1] + (b[6] - b[1]) * fly + bob, pz = b[2] - nz * 0.02 + nz * 0.47 * slide + (b[7] - hz) * fly;
      // hover frame: pages up, tilted toward f; shelf frame: body into the shelf, spine up
      const fx = nx * Math.cos(yw) + nz * Math.sin(yw), fz = -nx * Math.sin(yw) + nz * Math.cos(yw), w = ss(0.0, 0.8, fly);
      let yx = -nx + (fx * 0.6 + nx) * w, yy = 0.8 * w, yz = -nz + (fz * 0.6 + nz) * w;
      let l = Math.hypot(yx, yy, yz); yx /= l; yy /= l; yz /= l;
      let zx = -fz * w, zy = 1 - w, zz = fx * w;
      const d = zx * yx + zy * yy + zz * yz; zx -= yx * d; zy -= yy * d; zz -= yz * d;
      l = Math.hypot(zx, zy, zz) || 1; zx /= l; zy /= l; zz /= l;
      B[o] = yy * zz - yz * zy; B[o + 1] = yz * zx - yx * zz; B[o + 2] = yx * zy - yy * zx; B[o + 3] = open;
      B[o + 4] = yx; B[o + 5] = yy; B[o + 6] = yz; B[o + 7] = open > 0.9 ? flip : 0;
      B[o + 8] = zx; B[o + 9] = zy; B[o + 10] = zz; B[o + 11] = b[10];
      B[o + 12] = px; B[o + 13] = py; B[o + 14] = pz; B[o + 15] = 1;
      if (open > 0.9 && fl > 0.72 && fl < 0.76 && Math.hypot(px - cam.eye[0], pz - cam.eye[2]) < 14) turn = true;
    }
    ctx.write(this.bookI, B);
    const A = ctx.audio;
    if (A) {
      if (turn && t - this.pageT > 1.5) { this.pageT = t; A.whoosh({ dur: 0.35, f0: 2600, f1: 5200, filter: 'bandpass', q: 0.8, gain: 0.012, reverb: 0.7, pan: A.rng.range(-0.5, 0.5) }); }
      if (cam.moving > 0.2 && t - this.stepT > 0.56 / Math.min(cam.moving, 1.6)) {       // footsteps: wood upstairs and on the stair, stone below
        this.stepT = t;
        const wood = this.foot > 0.1;
        A.pluck({ freq: wood ? 110 + A.rng() * 30 : 180 + A.rng() * 50, decay: wood ? 0.09 : 0.05, gain: 0.012, reverb: 0.5 });
      }
    }
  },

  put(x, y, z, s, spin, seed, type, hue) {
    const D = this.SD, c = Math.cos(spin) * s, n = Math.sin(spin) * s, o = this.k++ * 16;
    D[o] = c; D[o + 1] = 0; D[o + 2] = n; D[o + 3] = x; D[o + 4] = 0; D[o + 5] = s; D[o + 6] = 0; D[o + 7] = y;
    D[o + 8] = -n; D[o + 9] = 0; D[o + 10] = c; D[o + 11] = z; D[o + 12] = seed; D[o + 13] = type; D[o + 14] = hue; D[o + 15] = 0;
  },
  draw(pass, m, inst, n, pipe) {
    pass.setPipeline(pipe); pass.setVertexBuffer(0, m.vb); pass.setVertexBuffer(1, inst); pass.setIndexBuffer(m.ib, 'uint32'); pass.drawIndexed(m.n, n);
  },
  render(ctx, pass) {
    pass.setBindGroup(1, this.uBG);
    this.draw(pass, this.bay, this.bayI, this.nBay, this.pPre); this.draw(pass, this.stat, this.idI, 1, this.pPre);
    this.draw(pass, this.bay, this.bayI, this.nBay, this.pMain); this.draw(pass, this.stat, this.idI, 1, this.pMain);
    this.draw(pass, this.sph, this.sphI, NS, this.pObj); this.draw(pass, this.quill, this.quillI, 1, this.pObj);
    pass.setPipeline(this.pBook); pass.setVertexBuffer(0, this.bookV); pass.setVertexBuffer(1, this.bookI); pass.setIndexBuffer(this.bookX, 'uint16');
    pass.drawIndexed(this.nBookI, NBK);
    pass.setPipeline(this.pBird); pass.draw(12, this.nBird);
  },
  renderTransparent(ctx, pass) {
    pass.setBindGroup(1, this.uBG);
    this.draw(pass, this.statT, this.idI, 1, this.pT); this.draw(pass, this.bayT, this.bayI, this.nBay, this.pT);
    const r = this.ring;
    pass.setPipeline(this.pRing); pass.setVertexBuffer(0, r.vertexBuffer); pass.setVertexBuffer(1, this.ringI); pass.setIndexBuffer(r.indexBuffer, r.indexFormat);
    pass.drawIndexed(r.indexCount, NR);
    pass.setPipeline(this.pDrop); pass.draw(6, this.nDrop);
    pass.setPipeline(this.pGlyph); pass.setBindGroup(2, this.bkBG); pass.draw(6, NBK * 8);
    pass.setPipeline(this.pMote); pass.draw(6, this.nMote);
  },
  afterScene(ctx, enc) {
    if (this.dv !== ctx.depthView) this.resize(ctx);
    let p = enc.beginRenderPass(this.passV);
    p.setViewport(0, 0, Math.ceil(ctx.renderWidth / this.volDiv), Math.ceil(ctx.renderHeight / this.volDiv), 0, 1);
    p.setBindGroup(0, ctx.globalsBindGroup); p.setBindGroup(1, this.uBG); p.setBindGroup(2, this.dBG); p.setPipeline(this.pVol); p.draw(3); p.end();
    p = enc.beginRenderPass(this.passM);
    p.setViewport(0, 0, ctx.renderWidth, ctx.renderHeight, 0, 1); p.setScissorRect(0, 0, ctx.renderWidth, ctx.renderHeight);
    p.setBindGroup(0, ctx.globalsBindGroup); p.setBindGroup(1, this.uBG); p.setBindGroup(2, this.dBG); p.setBindGroup(3, this.vBG); p.setPipeline(this.pMix); p.draw(3); p.end();
  },

  audio(ctx, a) {
    a.setReverb({ seconds: 7, damp: 0.45, wet: 0.95, predelay: 0.05 });
    a.noiseBed({ color: 'brown', filter: 'lowpass', freq: 130, gain: 0.03, mod: 0.3, modRate: 0.03 });           // the air of a huge room
    a.drone({ freq: a.hz(38), partials: [1, 2, 3, 4.01], amps: [1, 0.5, 0.2, 0.08], detune: 4, cutoff: 300, gain: 0.03, attack: 6 });
    // choir: sawtooth voices through two vowel formants, chords drifting slowly
    const ac = a.ctx, bus = a.bus({ gain: 0.5, reverb: 0.85 }), chords = [[50, 57, 62, 66], [47, 54, 59, 62], [43, 50, 59, 62], [45, 52, 57, 61], [50, 54, 57, 64]];
    const voices = [0, 1, 2, 3].map((i) => {
      const o = ac.createOscillator(), o2 = ac.createOscillator(), g = ac.createGain(), f1 = ac.createBiquadFilter(), f2 = ac.createBiquadFilter(), g2 = ac.createGain();
      o.type = o2.type = 'sawtooth'; o2.detune.value = 9; o.frequency.value = o2.frequency.value = a.hz(chords[0][i] + 12);
      f1.type = f2.type = 'bandpass'; f1.frequency.value = 620; f1.Q.value = 5; f2.frequency.value = 1050; f2.Q.value = 7; g2.gain.value = 0.45; g.gain.value = 0;
      o.connect(g); o2.connect(g); g.connect(f1); g.connect(f2); f1.connect(bus.input); f2.connect(g2); g2.connect(bus.input);
      o.start(); o2.start(); a.wander(f1.frequency, 120, 0.05); a.wander(g.gain, 0.012, 0.07 + i * 0.013);
      a.param(g.gain, 0.03, 6);
      return [o, o2];
    });
    a.every(18, 30, () => { const c = a.rng.pick(chords); voices.forEach((v, i) => { a.param(v[0].frequency, a.hz(c[i] + 12), 2.5); a.param(v[1].frequency, a.hz(c[i] + 12), 2.5); }); });
    const notes = a.scale(62, 'major', 2);
    a.every(14, 34, (when) => a.bell({ freq: a.hz(a.rng.pick(notes)), gain: 0.007, decay: 7, ratio: 2.76, index: 1.2, when, pan: a.rng.range(-0.7, 0.7), reverb: 0.95 }), { startDelay: 8 });
    a.every(9, 22, (when) => a.whoosh({ dur: 0.3, f0: 3000, f1: 5500, filter: 'bandpass', q: 0.8, gain: 0.005, reverb: 0.9, pan: a.rng.range(-0.8, 0.8), when }), { startDelay: 6 });   // far pages
    // places
    a.noiseBed({ color: 'white', filter: 'bandpass', freq: 1700, q: 0.5, gain: 0.09, mod: 0.15, modRate: 0.3, bus: a.spatial({ pos: [47, 1.5, 0], ref: 5, rolloff: 1.4, reverb: 0.3 }) });
    a.noiseBed({ color: 'brown', filter: 'lowpass', freq: 110, q: 3, gain: 0.5, mod: 0.5, modRate: 0.33, gainMod: 0.6, bus: a.spatial({ pos: [-45.9, 1, 3.4], ref: 1.2, rolloff: 2.2, reverb: 0.1 }) });   // purr
    const fire = a.spatial({ pos: [-43, 0.8, -6.5], ref: 3, rolloff: 1.6, reverb: 0.25 });
    a.noiseBed({ color: 'brown', filter: 'lowpass', freq: 400, gain: 0.09, mod: 0.5, modRate: 0.5, bus: fire });
    a.every(0.6, 2.8, (when) => a.chirp({ f0: a.rng.range(900, 2200), f1: 400, dur: 0.02, gain: 0.02, bus: fire, when }));
    const orr = a.spatial({ pos: OC, ref: 7, rolloff: 1.2, reverb: 0.7 }), on = a.scale(74, 'pentatonic', 2);
    a.every(4, 11, (when) => a.bell({ freq: a.hz(a.rng.pick(on)), gain: 0.02, decay: 5, ratio: 3.5, index: 0.8, bus: orr, when }), { startDelay: 3 });
  },
};

function sphereGeo(M) {
  const g = M.sphere(1, 3), n = g.pos.length / 3, v = new Float32Array(n * 12);
  for (let i = 0; i < n; i++) v.set([g.pos[i * 3], g.pos[i * 3 + 1], g.pos[i * 3 + 2], g.nrm[i * 3], g.nrm[i * 3 + 1], g.nrm[i * 3 + 2], 0, 0, 1, 1, 1, SPH], i * 12);
  return { verts: v, idx: g.idx };
}
