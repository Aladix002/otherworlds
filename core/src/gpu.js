// WebGPU bootstrap + pipeline/bind-group helpers exposed on ctx.
import GLOBALS from '../wgsl/globals.wgsl';
import HASH from '../wgsl/hash.wgsl';
import NOISE from '../wgsl/noise.wgsl';
import SDF from '../wgsl/sdf.wgsl';
import COLOR from '../wgsl/color.wgsl';
import LIGHTING from '../wgsl/lighting.wgsl';

export const HDR_FORMAT = 'rgba16float';
export const DEPTH_FORMAT = 'depth32float';
export const WGSL = { globals: GLOBALS, hash: HASH, noise: NOISE, sdf: SDF, color: COLOR, lighting: LIGHTING };
// pure library (no globals): usable in postcards and standalone modules
export const LIB_PURE = HASH + '\n' + NOISE + '\n' + SDF + '\n' + COLOR + '\n';
export const PRELUDE = GLOBALS + '\n' + LIB_PURE + LIGHTING + '\n';

export async function initGPU(canvas) {
  if (!navigator.gpu) throw new Error('nogpu');
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) throw new Error('noadapter');
  const want = ['timestamp-query', 'shader-f16', 'float32-filterable', 'rg11b10ufloat-renderable', 'indirect-first-instance'];
  const requiredFeatures = want.filter((f) => adapter.features.has(f));
  const requiredLimits = {};
  for (const k of ['maxStorageBufferBindingSize', 'maxBufferSize', 'maxComputeWorkgroupStorageSize', 'maxComputeInvocationsPerWorkgroup',
    'maxComputeWorkgroupSizeX', 'maxStorageBuffersPerShaderStage', 'maxStorageTexturesPerShaderStage', 'maxVertexBuffers',
    'maxVertexAttributes', 'maxColorAttachmentBytesPerSample', 'maxTextureDimension2D', 'maxBindGroups']) {
    if (adapter.limits[k] !== undefined) requiredLimits[k] = adapter.limits[k];
  }
  const device = await adapter.requestDevice({ requiredFeatures, requiredLimits });
  const context = canvas.getContext('webgpu');
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: 'opaque' });
  const info = adapter.info || {};
  return { adapter, device, context, format, info, features: new Set(requiredFeatures) };
}

const U = () => GPUBufferUsage;
const VIS_ALL = () => GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE;

// Installs helper functions on ctx. ctx.device and ctx.globalsLayout must exist.
export function installHelpers(ctx) {
  const device = ctx.device;
  const preludeLines = PRELUDE.split('\n').length - 1;

  function hoist(code) { // move `enable ...;` directives to the very top
    const en = [];
    const body = code.replace(/^\s*enable\s+[^;]+;\s*$/gm, (m) => { en.push(m.trim()); return ''; });
    return { en: en.join('\n'), body };
  }
  function report(module, label, offset) {
    module.getCompilationInfo?.().then((ci) => {
      for (const m of ci.messages) {
        if (m.type === 'info') continue;
        const line = m.lineNum - offset;
        console[m.type === 'error' ? 'error' : 'warn'](`[wgsl ${label || ''}] ${m.type} at your line ${line}: ${m.message}`);
      }
    });
  }
  ctx.shader = (code, label = '') => {
    const h = hoist(code);
    const src = (h.en ? h.en + '\n' : '') + PRELUDE + h.body;
    const module = device.createShaderModule({ code: src, label });
    report(module, label, preludeLines + (h.en ? h.en.split('\n').length : 0));
    return module;
  };
  ctx.rawShader = (code, label = '') => { const m = device.createShaderModule({ code, label }); report(m, label, 0); return m; };

  // bind group layout shorthand. Entry strings:
  // 'uniform' 'storage' (read-only) 'storage-rw' 'texture' 'texture-unfilterable' 'texture-depth' 'texture-3d'
  // 'texture-2d-array' 'texture-cube' 'sampler' 'sampler-nonfiltering' 'sampler-comparison' 'storage-texture:<format>'
  ctx.layout = (entries, label) => device.createBindGroupLayout({
    label,
    entries: entries.map((e, binding) => {
      const vis = VIS_ALL();
      if (typeof e === 'object') return { binding, visibility: vis, ...e };
      if (e === 'uniform') return { binding, visibility: vis, buffer: { type: 'uniform' } };
      if (e === 'storage') return { binding, visibility: vis, buffer: { type: 'read-only-storage' } };
      if (e === 'storage-rw') return { binding, visibility: GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT, buffer: { type: 'storage' } };
      if (e === 'texture') return { binding, visibility: vis, texture: { sampleType: 'float' } };
      if (e === 'texture-unfilterable') return { binding, visibility: vis, texture: { sampleType: 'unfilterable-float' } };
      if (e === 'texture-depth') return { binding, visibility: vis, texture: { sampleType: 'depth' } };
      if (e === 'texture-3d') return { binding, visibility: vis, texture: { sampleType: 'float', viewDimension: '3d' } };
      if (e === 'texture-2d-array') return { binding, visibility: vis, texture: { sampleType: 'float', viewDimension: '2d-array' } };
      if (e === 'texture-cube') return { binding, visibility: vis, texture: { sampleType: 'float', viewDimension: 'cube' } };
      if (e === 'sampler') return { binding, visibility: vis, sampler: { type: 'filtering' } };
      if (e === 'sampler-nonfiltering') return { binding, visibility: vis, sampler: { type: 'non-filtering' } };
      if (e === 'sampler-comparison') return { binding, visibility: vis, sampler: { type: 'comparison' } };
      if (e.startsWith('storage-texture:')) {
        const [, format, dim] = e.split(':');
        return { binding, visibility: GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT, storageTexture: { access: 'write-only', format, viewDimension: dim || '2d' } };
      }
      throw new Error('layout entry ' + e);
    }),
  });
  ctx.bindGroup = (layout, resources, label) => device.createBindGroup({
    label, layout,
    entries: resources.map((r, binding) => ({ binding, resource: r instanceof GPUBuffer ? { buffer: r } : r })),
  });

  // buffer: data (TypedArray) or byte size; usage: 'vertex'|'index'|'storage'|'uniform'|'indirect' or GPUBufferUsage flags
  ctx.buffer = (dataOrSize, usage = 'storage', label) => {
    const u = typeof usage === 'number' ? usage
      : usage === 'vertex' ? U().VERTEX | U().COPY_DST | U().STORAGE
      : usage === 'index' ? U().INDEX | U().COPY_DST
      : usage === 'uniform' ? U().UNIFORM | U().COPY_DST
      : usage === 'indirect' ? U().INDIRECT | U().STORAGE | U().COPY_DST
      : U().STORAGE | U().VERTEX | U().COPY_DST | U().COPY_SRC;
    const isData = typeof dataOrSize !== 'number';
    const size = Math.max(16, Math.ceil((isData ? dataOrSize.byteLength : dataOrSize) / 4) * 4);
    const buf = device.createBuffer({ label, size, usage: u, mappedAtCreation: isData });
    if (isData) {
      new Uint8Array(buf.getMappedRange()).set(new Uint8Array(dataOrSize.buffer, dataOrSize.byteOffset, dataOrSize.byteLength));
      buf.unmap();
    }
    return buf;
  };
  ctx.write = (buffer, data, offset = 0) => device.queue.writeBuffer(buffer, offset, data.buffer, data.byteOffset, data.byteLength);

  const BLENDS = {
    alpha: { color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' } },
    premul: { color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' } },
    add: { color: { srcFactor: 'one', dstFactor: 'one' }, alpha: { srcFactor: 'one', dstFactor: 'one' } },
    multiply: { color: { srcFactor: 'dst', dstFactor: 'zero' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' } },
  };
  function renderDesc(d) {
    const module = d.module || ctx.shader(d.code, d.label);
    const blend = typeof d.blend === 'string' ? BLENDS[d.blend] : d.blend; // undefined/'opaque' -> no blending
    const targets = d.targets || [{ format: d.format || ctx.hdrFormat, blend, writeMask: d.writeMask ?? 0xf }];
    const depthFmt = d.depthFormat === undefined ? ctx.depthFormat : d.depthFormat;
    const desc = {
      label: d.label,
      layout: d.layout || device.createPipelineLayout({ bindGroupLayouts: d.noGlobals ? (d.layouts || []) : [ctx.globalsLayout, ...(d.layouts || [])] }),
      vertex: { module, entryPoint: d.vs || 'vs', buffers: d.buffers || [], constants: d.constants },
      fragment: d.fs === null ? undefined : { module, entryPoint: d.fs || 'fs', targets, constants: d.constants },
      primitive: { topology: d.topology || 'triangle-list', cullMode: d.cull || 'back', frontFace: 'ccw', stripIndexFormat: d.stripIndexFormat },
    };
    if (depthFmt) {
      const transparent = blend && d.depthWrite === undefined;
      desc.depthStencil = {
        format: depthFmt,
        depthWriteEnabled: d.depthWrite ?? !transparent,
        depthCompare: d.depthTest === false ? 'always' : (d.depthCompare || 'greater-equal'),
        depthBias: d.depthBias, depthBiasSlopeScale: d.depthBiasSlopeScale,
      };
    }
    return desc;
  }
  ctx.pipeline = (d) => device.createRenderPipeline(renderDesc(d));
  ctx.pipelineAsync = (d) => device.createRenderPipelineAsync(renderDesc(d));
  function computeDesc(d) {
    const module = d.module || ctx.shader(d.code, d.label);
    return {
      label: d.label,
      layout: device.createPipelineLayout({ bindGroupLayouts: d.noGlobals ? (d.layouts || []) : [ctx.globalsLayout, ...(d.layouts || [])] }),
      compute: { module, entryPoint: d.entry || 'main', constants: d.constants },
    };
  }
  ctx.compute = (d) => device.createComputePipeline(computeDesc(d));
  ctx.computeAsync = (d) => device.createComputePipelineAsync(computeDesc(d));
  ctx.beginCompute = (encoder) => { const p = encoder.beginComputePass(); p.setBindGroup(0, ctx.globalsBindGroup); return p; };

  ctx.texture = (w, h, format = 'rgba8unorm', usage, opts = {}) => device.createTexture({
    size: [w, h, opts.depth || 1], format, dimension: opts.dimension || '2d', mipLevelCount: opts.mips || 1,
    usage: usage ?? (GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT),
  });
  ctx.samplers = {
    linear: device.createSampler({ magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear' }),
    repeat: device.createSampler({ magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear', addressModeU: 'repeat', addressModeV: 'repeat', addressModeW: 'repeat', maxAnisotropy: 4 }),
    nearest: device.createSampler({ magFilter: 'nearest', minFilter: 'nearest' }),
    nearestRepeat: device.createSampler({ addressModeU: 'repeat', addressModeV: 'repeat' }),
  };
}
