// Core render targets + post stack. Targets are allocated at OUTPUT size; dynamic resolution renders
// into the top-left sub-rectangle (viewport) and the post stack rescales, so no reallocation on scale changes.
import POST from '../wgsl/post.wgsl';
import { HDR_FORMAT, DEPTH_FORMAT } from './gpu.js';

export const DEFAULT_POST = {
  exposure: 1, bloom: 0.08, bloomThreshold: 0.9, bloomKnee: 0.6, bloomRadius: 1,
  vignette: 0.25, saturation: 1.05, contrast: 1.0, tonemap: 'agx',
  tint: [1, 1, 1], lift: [0, 0, 0], dither: 1, aa: true,
};

function blueNoiseData(N = 64) {
  const R = 4, sig = 1.6, K = 2 * R + 1, ker = new Float32Array(K * K);
  for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) ker[(y + R) * K + x + R] = Math.exp(-(x * x + y * y) / (2 * sig * sig));
  const e = new Float32Array(N * N), filled = new Uint8Array(N * N), out = new Uint8Array(N * N);
  let seed = 12345; const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);
  for (let i = 0; i < e.length; i++) e[i] = rnd() * 1e-4;   // tie breaker
  for (let k = 0; k < N * N; k++) {
    let best = -1, bv = Infinity;
    for (let i = 0; i < e.length; i++) if (!filled[i] && e[i] < bv) { bv = e[i]; best = i; }
    filled[best] = 1; out[best] = Math.floor((k / (N * N)) * 256);
    const bx = best % N, by = (best / N) | 0;
    for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) e[((by + y + N) % N) * N + ((bx + x + N) % N)] += ker[(y + R) * K + x + R];
  }
  return out;
}

export function createPost(ctx) {
  const device = ctx.device;
  const module = ctx.rawShader(POST, 'post');
  const bgl = ctx.layout(['uniform', 'sampler', 'texture', 'texture', 'texture'], 'post');
  const pl = device.createPipelineLayout({ bindGroupLayouts: [bgl] });
  const mk = (fs, format, blend, constants) => device.createRenderPipeline({
    layout: pl, vertex: { module, entryPoint: 'vs' },
    fragment: { module, entryPoint: fs, targets: [{ format, blend }], constants }, primitive: { topology: 'triangle-list' },
  });
  const addBlend = { color: { srcFactor: 'one', dstFactor: 'one' }, alpha: { srcFactor: 'one', dstFactor: 'one' } };
  const pDown0 = mk('down', HDR_FORMAT, undefined, { FIRST: 1 });
  const pDown = mk('down', HDR_FORMAT, undefined, { FIRST: 0 });
  const pUp = mk('up', HDR_FORMAT, addBlend);
  const pComp = mk('composite', ctx.canvasFormat);
  const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });

  const bn = blueNoiseData(64);
  const bnTex = device.createTexture({ size: [64, 64], format: 'r8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
  device.queue.writeTexture({ texture: bnTex }, bn, { bytesPerRow: 64 }, [64, 64]);
  const bnView = bnTex.createView();
  const dummy = device.createTexture({ size: [1, 1], format: 'rgba16float', usage: GPUTextureUsage.TEXTURE_BINDING }).createView();

  const ubuf = device.createBuffer({ size: 128, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const u = new Float32Array(32);

  const params = { ...DEFAULT_POST, tint: [...DEFAULT_POST.tint], lift: [...DEFAULT_POST.lift] };
  const st = { W: 0, H: 0, levels: 5, hdr: null, depth: null, bloom: null, passes: [], comp: null, compBG: null };

  // div = bloom chain start resolution divisor (2 = half res, 4 = quarter res)
  function resize(W, H, levels, div = 2) {
    if (st.hdr) { st.hdr.destroy(); st.depth.destroy(); st.bloom.destroy(); }
    st.W = W; st.H = H;
    st.hdr = device.createTexture({ size: [W, H], format: HDR_FORMAT, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC });
    st.depth = device.createTexture({ size: [W, H], format: DEPTH_FORMAT, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
    st.div = div;
    const bw = Math.max(1, Math.round(W / div)), bh = Math.max(1, Math.round(H / div));
    const L = Math.max(1, Math.min(levels, Math.floor(Math.log2(Math.min(bw, bh))) - 1));
    st.levels = L;
    st.bloom = device.createTexture({ size: [bw, bh], mipLevelCount: L, format: HDR_FORMAT, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
    st.hdrView = st.hdr.createView(); st.depthView = st.depth.createView();
    const mip = []; for (let i = 0; i < L; i++) mip.push(st.bloom.createView({ baseMipLevel: i, mipLevelCount: 1 }));
    const bg = (srcView, bloomView = dummy) => ctx.bindGroup(bgl, [ubuf, sampler, srcView, bloomView, bnView]);
    const pass = (view, load) => ({ colorAttachments: [{ view, loadOp: load ? 'load' : 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }] });
    st.passes = [{ pipe: pDown0, bg: bg(st.hdrView), desc: pass(mip[0], false) }];
    for (let i = 1; i < L; i++) st.passes.push({ pipe: pDown, bg: bg(mip[i - 1]), desc: pass(mip[i], false) });
    for (let i = L - 2; i >= 0; i--) st.passes.push({ pipe: pUp, bg: bg(mip[i + 1]), desc: pass(mip[i], true) });
    st.compBG = bg(st.hdrView, mip[0]);
    st.comp = { colorAttachments: [{ view: null, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }] };
  }

  // rw, rh = rendered region in pixels; frame = counter for dither animation
  function update(rw, rh, frame, fade) {
    const p = params;
    u[0] = p.exposure; u[1] = p.bloom; u[2] = p.bloomThreshold; u[3] = Math.max(1e-3, p.bloomKnee);
    u[4] = p.vignette; u[5] = p.saturation; u[6] = p.contrast; u[7] = p.tonemap === 'aces' ? 1 : 0;
    u[8] = rw / st.W; u[9] = rh / st.H; u[10] = (rw - 0.5) / st.W; u[11] = (rh - 0.5) / st.H;
    u[12] = p.tint[0]; u[13] = p.tint[1]; u[14] = p.tint[2]; u[15] = frame % 4096;
    u[16] = p.bloomRadius; u[17] = p.aa ? 1 : 0; u[18] = 1 / st.levels; u[19] = p.dither;
    u[20] = p.lift[0]; u[21] = p.lift[1]; u[22] = p.lift[2]; u[23] = fade;
    u[24] = 1 / st.W; u[25] = 1 / st.H; u[26] = st.div / 2;
    device.queue.writeBuffer(ubuf, 0, u);
  }

  function encode(encoder, targetView, tsWrites) {
    if (params.bloom > 0) {
      for (let i = 0; i < st.passes.length; i++) {
        const ps = st.passes[i];
        const pass = encoder.beginRenderPass(ps.desc);
        pass.setPipeline(ps.pipe); pass.setBindGroup(0, ps.bg); pass.draw(3); pass.end();
      }
    }
    st.comp.colorAttachments[0].view = targetView;
    st.comp.timestampWrites = tsWrites;
    const pass = encoder.beginRenderPass(st.comp);
    pass.setPipeline(pComp); pass.setBindGroup(0, st.compBG); pass.draw(3); pass.end();
  }
  return { params, st, resize, update, encode };
}
