# OtherWorlds core — API contract

This is the only core document a world author needs. You write `worlds/<id>/world.js` (default export = world module) and
`worlds/<id>/postcard.wgsl`. The core owns the GPU, frame loop, post stack, camera and movement, doors and transitions,
audio engine, UI (English) and test harness. A complete working example is `worlds/_test/` (terrain generated in a compute
shader, instanced rocks, compute particles, sky, audio). Copy patterns from it.

**Rules:** raw WebGPU + WGSL + Web Audio only (no engines or libraries), everything procedural (no texture, model or audio
files), no network, **zero per-frame JS allocations** in `update` / `render` / `computeBefore` / `renderTransparent` /
`afterScene` (no `new`, array or object literals, closures, template strings, spread, `map`/`filter`). Preallocate typed
arrays and reuse them. UI text is English; world titles come from core/src/worlds.js. Work only in `worlds/<id>/`.

---

## 1. World module

```js
export default {
  id: 'meadow',                     // must equal the folder name
  title: 'Enchanted Meadow',       // fallback only; the displayed title comes from core/src/worlds.js
  movement: 'walk',                 // 'fly' | 'swim' | 'walk'   (URL ?movement= overrides, for testing)
  spawn: { pos: [x, y, z], yaw, pitch },   // eye position. Face AWAY from your door, 15–40 m from it
  poses: [{ pos, yaw, pitch, t? }, ...6],   // fixed critic camera poses (eye positions, used verbatim). t = anim time (default 10)
  flythrough: [{ pos, yaw, pitch }, ...],   // Catmull-Rom control points for the perf run; cover the heavy areas
  flythroughDuration: 60,                  // seconds (default 60). Speed is constant along the path length
  doors: [{ pos: [x, y | null, z], yaw, to: 'dream-desert' }],  // y = null -> placed on heightAt(x, z). Max 4 doors
  bounds: { center: [x, y, z], radius } | { min: [x,y,z], max: [x,y,z] },  // soft: slows you and pushes back gently
  env: { sunDir, sunColor, fogColor, fogDensity, ambientSky, ambientGround },  // initial lighting (see ctx.env)
  post: { exposure, bloom, ... },          // initial post params (see ctx.post)
  clearColor: [r, g, b],                   // HDR clear color (default fogColor)
  // optional tuning
  fov: 62, near: 0.05, eyeHeight: 1.6, radius: 0.3, speed: 1 /* multiplier */, seed: 1337,
  doorLight: [r, g, b],                    // extra fill light on the doors (use in dark worlds so the door is findable)

  heightAt(x, z) { return h; },            // walk: ground height. fly/swim: keeps you >= 0.6 m above it. Optional
  sdf(x, y, z) { return d; },              // collision distance (positive outside). Optional
  async init(ctx, progress) {},            // build everything; `await progress(0..1)` repaints the loading bar
  update(ctx, dt, t, cam) {},              // per frame, before rendering. No allocations
  computeBefore(ctx, encoder) {},          // optional: your compute passes (particles, boids, sims), before the scene
  render(ctx, pass) {},                    // draw opaque things into the core HDR pass (group 0 already bound)
  renderTransparent(ctx, pass) {},         // optional: after the doors are drawn. Re-bind your groups >= 1 here
  afterScene(ctx, encoder) {},             // optional: extra passes after the scene, before post (e.g. reading depth)
  resize(ctx) {},                          // optional: output size changed (rebuild bind groups using ctx.hdrView/depthView)
  audio(ctx, a) {},                        // called once when audio starts (after "Vstúpiť"); build the soundscape
};
```

`heightAt`, `sdf` and all hooks are called with `this` = your world object, so you can keep state on `this`.
`heightAt`/`sdf` are called only after `init` resolves, up to ~40 times per frame. Keep them cheap and allocation-free.

**Frame order:** input → camera → doors → `update` → globals upload → `computeBefore` → HDR pass { `render`, doors,
`renderTransparent`, transition overlay } → `afterScene` → post (bloom, tonemap, AA, dither) → swapchain.

**Time:** `t`/`ctx.time` is animation time in seconds, `dt`/`ctx.dt` its step. Drive ALL animation and simulation from
these (and `G.time` / `G.dt` in WGSL), never `performance.now()`. In screenshot mode time is frozen (`dt = 0`) or stepped
at exactly 1/60 s, so shots are deterministic. Simulations must therefore be deterministic given the same `dt` sequence (seed
your RNG, don't use `Math.random()` for visual state).

---

## 2. `ctx`

| field | meaning |
|---|---|
| `device`, `queue` | GPUDevice / GPUQueue |
| `hdrFormat` (`'rgba16float'`), `depthFormat` (`'depth32float'`), `canvasFormat` | formats of the core targets |
| `quality` (`'low'\|'medium'\|'high'`), `q` | `q.level` = 0/1/2. Scale counts, step counts and shadows by `q.level` |
| `movement` | the active movement mode (may differ from yours via `?movement=`) |
| `shot`, `bench`, `via` | screenshot mode / benchmark mode / arrived through a door |
| `time`, `dt`, `frame` | animation time, step, frame counter |
| `width`, `height` | output size in px. `renderWidth`, `renderHeight`, `renderScale` = current dynamic-resolution region |
| `camera` | the camera (see §4). Same object as the `cam` argument |
| `env` | live lighting, uploaded every frame: `sunDir` (normalized for you), `sunColor`, `fogColor`, `fogDensity` (number), `ambientSky`, `ambientGround`, `params`, `params2` (Float32Array(4) each, free for your shaders as `G.params`/`G.params2`) |
| `post` | live post params (see §6) |
| `clearColor` | Float32Array(3), HDR clear color, mutable |
| `globalsBuffer`, `globalsLayout`, `globalsBindGroup` | group 0 (the core binds it for you in the HDR pass and in `beginCompute`) |
| `hdrTexture`/`hdrView`, `depthTexture`/`depthView` | core targets (output-sized; see dynamic resolution in §9) |
| `doors` | live door states `{ pos, yaw, to, open (0..1), lx, ly, lz (camera in door space) }` |
| `audio` | the audio helper object `a` once audio is running, else `null` (always `null` in shot/bench mode) |
| `rng` | seeded RNG: `rng()` [0,1), `rng.range(a,b)`, `rng.int(n)`, `rng.pick(arr)`, `rng.sign()`, `rng.gauss()`, `rng.seed(n)` |
| `math` | allocation-free math (§8) |
| `noise` | CPU noise twins of the WGSL noise (§7) |
| `mesh` | geometry helpers (§5) |
| `wgsl` | WGSL source strings: `globals`, `hash`, `noise`, `sdf`, `color`, `lighting`, `lib` (pure, no globals), `prelude` (all) |
| `samplers` | `linear`, `repeat` (anisotropic), `nearest`, `nearestRepeat` |
| `features` | Set of enabled device features (`timestamp-query`, `shader-f16`, `float32-filterable`, ...) |
| `gpuMs`, `cpuMs` | latest measured GPU frame time / JS frame time |

### GPU helpers
```js
ctx.shader(code, label)        // GPUShaderModule = PRELUDE (globals + whole WGSL library) + your code.
                               // `enable f16;` lines are hoisted. Errors are logged with YOUR line numbers.
ctx.rawShader(code, label)     // no prelude
ctx.pipeline(desc) / await ctx.pipelineAsync(desc)   // render pipeline targeting the core HDR pass
  desc = { code | module, vs = 'vs', fs = 'fs' (null = depth-only), buffers = [], layouts = [] /* groups 1.. */,
           blend: undefined | 'alpha' | 'premul' | 'add' | 'multiply' | GPUBlendState,
           depthWrite (default: true if opaque, false if blended), depthTest = true, depthCompare = 'greater-equal',
           cull = 'back' (front face = CCW), topology = 'triangle-list', constants: { overrideName: value },
           format / targets / depthFormat (null = no depth) for your own offscreen passes, noGlobals, depthBias, label }
ctx.compute(desc) / await ctx.computeAsync(desc)     // { code | module, entry = 'main', layouts = [], constants }
ctx.beginCompute(encoder)      // compute pass with group 0 (globals) already set
ctx.layout(['uniform', 'storage', 'storage-rw', 'texture', 'texture-unfilterable', 'texture-depth', 'texture-3d',
            'texture-2d-array', 'texture-cube', 'sampler', 'sampler-nonfiltering', 'sampler-comparison',
            'storage-texture:rgba16float[:3d]'])   // -> GPUBindGroupLayout, binding i = entry i
ctx.bindGroup(layout, [GPUBuffer | {buffer, offset, size} | GPUTextureView | GPUSampler, ...])
ctx.buffer(typedArrayOrByteSize, usage = 'storage')  // 'storage' (also VERTEX|COPY_*), 'vertex' (also STORAGE),
                                                     // 'index', 'uniform', 'indirect', or GPUBufferUsage flags
ctx.write(buffer, typedArray, byteOffset = 0)        // queue.writeBuffer, no allocation
ctx.texture(w, h, format = 'rgba8unorm', usage?, { mips, depth, dimension })
```
**Group 0 is reserved** for the core globals in every pipeline made with these helpers. Your bindings start at
`@group(1)`. Do not call `setBindGroup(0, ...)`. Pipelines built by hand must use `ctx.globalsLayout` as group 0.

---

## 3. WGSL: globals and library

Every module from `ctx.shader` starts with:
```wgsl
struct Globals {
  viewProj, invViewProj, view, proj: mat4x4f,
  camPos: vec3f, time: f32,        camFwd: vec3f, dt: f32,
  camRight: vec3f, aspect: f32,    camUp: vec3f, tanHalfFov: f32,
  resolution: vec2f /* render region px */, invResolution: vec2f,
  sunDir: vec3f, renderScale: f32, sunColor: vec3f, frame: f32,
  fogColor: vec3f, fogDensity: f32, ambientSky: vec3f, quality: f32 /* 0,1,2 */,
  ambientGround: vec3f, near: f32, params: vec4f, params2: vec4f,
  outResolution: vec2f, uvScale: vec2f /* render region / texture size */, wallTime: f32, transition: f32, ...
};
@group(0) @binding(0) var<uniform> G: Globals;
```
**Reverse-Z, infinite far plane:** depth 1 = near, 0 = infinity. Depth clears to 0, the default compare is `greater-equal`.
Draw a sky as a fullscreen triangle (`fsPos`, z = 0) first with `depthTest: false, depthWrite: false`.

Library functions (reserved names, don't redefine them):
- **math/hash:** `PI`, `TAU`, `remap(x,a,b,c,d)`, `rot2(a)`, `rotX/rotY/rotZ(a) -> mat3x3f` (rotY(yaw) matches camera/door yaw),
  `quatRotate(q,v)`, `quatAxisAngle(axis,a)`, `pcg(u32)`, `pcg3d(vec3u)`, `u2f(u32)->[0,1)`, `hash2i(vec2i)`, `hash3i(vec3i)`,
  `hash11`, `hash1u(u32)`, `hash21`, `hash31`, `hash22`, `hash33`, `hash3u(vec3u)`.
- **noise** (≈[-1,1] unless noted; `[JS]` = exact CPU twin in `ctx.noise`): `vnoise2` [JS], `snoise2` [JS],
  `fbm2(p, octaves)` [JS], `vfbm2(p, oct)` [JS], `ridge2(p, oct)` [JS, 0..1], `vnoise3`, `snoise3`, `snoise3d -> vec4(grad, value)`,
  `fbm3(p, oct)`, `vfbm3(p, oct)`, `curl3(p) -> vec3` (divergence-free flow for particles), `warp2(p, amount, oct)`,
  `voronoi2(p)`, `voronoi3(p) -> vec3(F1, F2, cellId)`, `sgrad2`, `sgrad3`.
- **sdf:** `sdSphere`, `sdBox`, `sdRoundBox`, `sdBox2`, `sdCapsule(p,a,b,r)`, `sdCylinder(p,h,r)`, `sdTorus(p,R,r)`,
  `sdPlane(p,n,h)`, `sdEllipsoid(p,r)`, `sdCappedCone(p,h,r1,r2)`, `opU`, `opS` (a minus b), `opI`, `smin(a,b,k)`, `smax`,
  `opRep(p,c)`, `opRep2`.
- **color** (linear): `srgbToLinear`, `linearToSrgb`, `hex(0xRRGGBB)` (sRGB hex → linear), `luminance`, `saturation(c,s)`,
  `hsv2rgb`, `rgb2hsv`, `palette(t,a,b,c,d)` (iq cosine), `blackbody(kelvin)`.
- **lighting/geometry** (use `G`): `wrapDiffuse(n,l,w)`, `hemi(n,sky,ground)`, `fresnelSchlick(cos,f0)`,
  `specBlinn(n,l,v,shin)`, `phaseHG(cos,g)`, `fogAmount(dist)`, `applyFog(col, worldPos)`,
  `heightFog(col, worldPos, density, falloff, fogCol)`, `lit(albedo, n, worldPos)` (sun + hemi ambient + fog),
  `litSpec(albedo, n, worldPos, shininess, specAmt)`, `fsPos(vi)`, `fsUV(vi)` (fullscreen triangle, uv y-down),
  `screenUV(fragCoord)`, `viewRay(uv)` (world ray, per fragment), `linearDepth(d)`, `billboard(center, corner, halfSize)`,
  `billboardY(...)` (upright), `distFade(worldPos, near, far)`.

---

## 4. Camera and movement

`cam` fields: `pos` (physics position), `eye` (rendered eye incl. bob/sway), `vel`, `yaw`, `pitch`, `roll`, `fwd`, `right`,
`up` (Float32Array(3)), `fov` (radians), `near`, `eyeHeight`, `radius`, `speed`, `moving` (0..~2, speed ratio, for
footsteps/reactions), `mode`, `frozen` (poses/fly-through, physics off). Yaw 0 looks toward −Z, positive yaw turns left.

- **fly**: free 6-DOF float, heavy inertia (τ 0.75 s), 3.2 m/s, Shift ×2.6.
- **swim**: like fly but slower to respond (τ 0.95 s), 2.4 m/s, gentle buoyancy drift and a tiny sway/roll.
- **walk**: horizontal only, follows `heightAt` at `eyeHeight` with a smooth step-up, 1.9 m/s, Shift ×2, subtle head bob. No jumping.
  Without `heightAt` the walk height stays where it is.
- Controls: WASD/arrows move, mouse look (pointer lock; drag-look without lock), Q/C/Ctrl down, E/Space up (fly/swim;
  E opens a door instead when the hint is shown), Shift faster, E or click opens a door, Esc menu, M mute, H perf overlay.
  Touch: one finger looks and moves forward, a second finger speeds up.
- Collision: `sdf` pushes the eye sphere (`radius`) out along the gradient; walk also tests a hip point, horizontally.
  The door frames are added to your `sdf` automatically. `bounds` fades the outward input over 3 m and pushes back softly.
- To make the player float or wade higher, return a higher `heightAt`. To block an area, put it in `sdf` (keep it smooth).

---

## 5. Meshes and instancing (`ctx.mesh`)

A geo is `{ pos, nrm: Float32Array(3n), uv: Float32Array(2n), idx: Uint32Array }`. Generators (all CCW, outward normals):
`plane(w, d, segX, segZ)` (XZ, y = 0), `box(w,h,d)`, `sphere(r, subdiv)` (icosphere), `lathe([[r,y],...], segs)`,
`cylinder(rBottom, rTop, h, segs, rings)`, `cone(r, h, segs)`, `torus(R, r, segs, ring)`, `tube(path[[x,y,z]...], radius | t=>r, segs)`,
`rock(seed, subdiv, roughness)`. Operations: `computeNormals(g)`, `transform(g, mat4)`, `translate(g,x,y,z)`, `scale(g,sx,sy,sz)`,
`merge([g...])`, `interleave(g)`.

`ctx.mesh.upload(g)` → `{ vertexBuffer, indexBuffer, indexCount, indexFormat, draw(pass, instances = 1, firstInstance = 0) }`
with the standard vertex layout `ctx.mesh.layout` = locations 0 pos (vec3f), 1 normal (vec3f), 2 uv (vec2f), 32 bytes.

Instancing, either way:
- **Vertex-rate instances:** `ctx.mesh.instanceLayout(['float32x4', 'float32x4'], 3)` → buffer layout at locations 3, 4.
  Pass `buffers: [ctx.mesh.layout, instLayout]`, `pass.setVertexBuffer(1, instBuf)`, `drawIndexed(count, n)` (see `_test` rocks).
- **Storage instances (GPU-driven):** keep instances in a `ctx.buffer(..., 'storage')`, read `arr[instance_index]` in the vertex
  shader, write them from a compute pass. Use `'indirect'` buffers plus `drawIndexedIndirect` for GPU culling.

### Particles and boids (compute)
```js
// init
this.buf = ctx.buffer(initialData, 'storage');                      // e.g. struct P { p: vec4f, v: vec4f }
const simL = ctx.layout(['storage-rw']), drawL = ctx.layout(['storage']);
this.sim = ctx.compute({ code: SIM, entry: 'sim', layouts: [simL] });
this.simBG = ctx.bindGroup(simL, [this.buf]);
this.draw = ctx.pipeline({ code: DRAW, layouts: [drawL], blend: 'add', cull: 'none' });
this.drawBG = ctx.bindGroup(drawL, [this.buf]);
// computeBefore(ctx, enc)
const p = ctx.beginCompute(enc); p.setPipeline(this.sim); p.setBindGroup(1, this.simBG);
p.dispatchWorkgroups(Math.ceil(N / 64)); p.end();
// renderTransparent(ctx, pass)
pass.setPipeline(this.draw); pass.setBindGroup(1, this.drawBG); pass.draw(6, N);   // 6-vertex quads, billboard() in WGSL
```
In WGSL integrate with `G.dt` and use `curl3()` for calm drifting flow. For boids, read neighbours from the same buffer
(read the previous frame's state from a second "ping" buffer if you need stable results, and swap bind groups each frame,
with both bind groups created in `init`). Keep counts modest on Medium (thousands, not millions) and use long smoothing.

---

## 6. Post stack (`ctx.post`, initial values from `world.post`)

| param | default | |
|---|---|---|
| `exposure` | 1 | linear multiplier before tonemapping |
| `bloom` | 0.08 | mix amount of the bloom chain (energy-conserving mix) |
| `bloomThreshold`, `bloomKnee` | 0.9, 0.6 | soft threshold (after exposure) |
| `bloomRadius` | 1 | upsample tent radius |
| `tonemap` | `'agx'` | `'agx'` (soft, filmic) or `'aces'` (punchier) |
| `saturation`, `contrast` | 1.05, 1.0 | applied after tonemapping |
| `tint`, `lift` | [1,1,1], [0,0,0] | color grade (multiply before tonemap / add) |
| `vignette` | 0.25 | |
| `dither` | 1 | triangular blue-noise dither (±1 LSB). Keep it on: it removes banding in dark gradients |
| `aa` | true (off on Low) | FXAA-style edge AA on the HDR image |

All live: change them in `update` (e.g. underwater exposure by depth). Dev override in the URL: `?post.bloom=0&post.exposure=1.4`.
Bloom runs from ¼ resolution on Low/Medium and ½ on High.

---

## 7. CPU noise twins (`ctx.noise`)

`vnoise2(x,z)`, `snoise2(x,z)`, `fbm2(x,z,oct)`, `vfbm2(x,z,oct)`, `ridge2(x,z,oct)`, `pcg`, `u2f`, `hash2i`, `hash3i`,
`smoothstep`, `mix`, `clamp`. They use the same integer hashing as WGSL, so a terrain written as
`h = 6 * fbm2(p * 0.01, 5)` in WGSL and `6 * fbm2(x * 0.01, z * 0.01, 5)` in JS agree to ~1e-5. Note that WGSL `fbm2(p * 0.01, 5)`
takes a vec2; the JS version takes `(x, z, octaves)`. This is how `heightAt` matches GPU terrain (see `_test`).

## 8. Math (`ctx.math`)

`v3()`, `m4()`, `set3`, `copy3`, `add3`, `sub3`, `scale3`, `addScaled3`, `lerp3`, `dot3`, `len3`, `dist3`, `norm3`, `cross3`,
`fwdFromYawPitch(out, yaw, pitch)`, `identity`, `mul4`, `invert4`, `perspectiveRevZ`, `viewFromBasis`, `trsY(out, x,y,z, yaw, s)`,
`damp(tau, dt)` (exponential smoothing factor), `clamp`, `lerp`, `smoothstep`, `easeInOut`, `wrapAngle`, `makeRng(seed)`, `DEG`.
Vector functions write into `out` and return it.

---

## 9. Rendering details and limits

- **Dynamic resolution:** targets are allocated at output size; the scene renders into the top-left sub-rectangle
  `ctx.renderWidth × ctx.renderHeight` (viewport and scissor are set for you). Fullscreen passes inside `render` work unchanged
  (`fragCoord * G.invResolution` gives 0..1). When you **sample** `ctx.hdrView`/`ctx.depthView` in `afterScene`, use
  `uv * G.uvScale`. The scale adapts in 0.025–0.1 steps toward the preset target (Medium 10.5 ms, floor 0.6).
- **Budget (Medium, 1920×1080, Barcelo iGPU):** gate is avg GPU ≤ 12 ms and p99 ≤ 16.7 ms. The core post stack + door costs
  about 1.5–2 ms at full resolution. Aim for ≤ 8 ms of your own work at scale 1.0, so dynamic resolution has headroom.
  Fragment-heavy work (raymarching, big fbm in fullscreen passes) is the usual offender; prefer baking noise into
  vertices or textures in `init` (compute), use fewer octaves far away, and keep overdraw of additive particles low.
- **No MSAA, no TAA.** Avoid sub-pixel geometry and high-frequency specular in the distance; fade thin things with distance.
- **Bundle:** the core is ~88 KB minified and the build inlines **every** world's postcard into every world. Budget about
  50 KB for your `world.js` + `postcard.wgsl` together (soft 150 KB per built file). WGSL is minified at build (comments and whitespace).
- **Transparency:** draw blended things in `renderTransparent` (after doors) with `depthWrite: false` (the default when blending).
- Quality presets: Low = output ≤ 1600×900, dpr 1, scale 0.5–0.85, no AA. Medium = ≤ 1920×1200, scale 0.6–1. High = ≤ 2560×1600, 0.7–1.
  Device loss reloads the page one quality level lower.

---

## 10. Doors and postcards

The core builds, lights, animates and collides the door. You only place it: `doors: [{ pos, yaw, to }]`.
- `pos` = ground point at the centre of the threshold (`y: null` → `heightAt`). The opening is 0.96 × 2.05 m, the frame about
  1.4 m wide (lintel), 2.3 m tall and 0.2 m deep. `yaw` = the camera yaw of someone standing in front of it looking through
  it (`yaw: 0` → the front faces +Z and you look toward −Z through it). It works from both sides.
- The leaf swings ~100° **toward the viewer** around the hinge on door-local −X (the left post seen from the front), so keep about 1.2 m
  clear around it, flat ground within ~2.5 m, and make sure your `sdf`/terrain leave the walk-through corridor free
  (|x| < 0.5 m, 0–2.2 m high, ±2 m in front and behind).
- The door is lit by `G.sunDir/sunColor/ambient*` and fogged with your fog. In dark worlds set `doorLight: [r,g,b]` (e.g.
  `[0.05, 0.06, 0.08]`) so it stays findable, and give it a pleasant open spot.
- Flow: near and looking at it → hint "E – otvoriť" → E/click → 1.6 s eased swing with a synthesized creak → the doorway
  shows the target's postcard → walking into it fades the postcard to full screen, fades audio, navigates to
  `<to>.html?via=door&dy=..&dp=..` → the next world starts with ITS postcard full screen (rendered while it loads) and
  dissolves into the real view at `spawn` over ~3 s while its audio fades in.

### `postcard.wgsl`
```wgsl
fn postcard(rd: vec3f, t: f32) -> vec3f {   // rd: normalized view direction, t: seconds. Return linear HDR color.
  ...
}
```
- `rd` is in **postcard space**: +Y up and **(0,0,−1) = looking straight through the door**. On arrival the same space is
  aligned with your `spawn` yaw, so **postcard forward must look like what the player sees at spawn**. Make it resemble the
  spawn view: sky, horizon silhouettes, palette, one or two signature elements.
- It must cover the whole sphere of directions plausibly (arrival shows it full screen at any pitch).
- Output is shown at exposure 1 through the host world's tonemapper (AgX). Typical values 0–2, highlights up to ~10.
- Available: the pure library (hash, noise, sdf, color). **Do not use `G`**, because it belongs to the host world. Add helper
  functions with a unique prefix (e.g. `pcMeadow_`). Don't use the names `PcU`, `PCU`, `PcOut`, `pc_vs_quad`, `pc_vs_full`, `pc_fs`.
- Cost: it runs in other worlds' budgets and full screen during transitions. Aim for < 0.3 ms for a door-sized area and
  a few ms full screen at most: a handful of noise calls, no raymarch loops over ~16 steps.
- Missing or failing postcard → a calm default dawn gradient (and an error in the console).

---

## 11. Audio (`a`, passed to `world.audio(ctx, a)`; also `ctx.audio` afterwards)

Master bus → soft limiter → volume (menu, M mute). Convolution reverb with a synthesized IR. Audio starts after
"Vstúpiť" (or the first click after a door arrival) and fades in over 3–4 s. Never in shot/bench mode.
Every voice accepts `{ gain, pan, reverb (send 0..1), bus, when }`. Keep everything quiet (beds ~0.03–0.08, events ≤ ~6 dB above the bed).

```js
a.ctx, a.now(), a.rng, a.hz(midi), a.scale(rootMidi, 'pentatonic'|'major'|'minor'|'dorian'|'lydian'|'mixolydian'|'minorPentatonic', octaves)
a.param(audioParam, value, timeConstant = 0.5)              // smooth setTargetAtTime
a.setReverb({ seconds = 3.5, damp = 0.55, wet = 0.9, predelay = 0.02 })
a.bus({ gain = 1, reverb = 0.35, pan = 0, parent })         // -> { input, gain, panner, set(g, tc) }  layers for crossfades
a.spatial({ pos: [x,y,z], ref = 5, rolloff = 1, reverb, gain }) // positional bus -> { input, set, setPos } (listener = camera)
a.noiseBed({ color: 'pink'|'white'|'brown', filter = 'lowpass', freq = 800, q, gain = 0.15, mod = 0.35, modRate = 0.06,
             gainMod = 0.35, attack = 2, bus })            // wind/water/surf -> { set(g), setFreq(f), stop(), filter, gain }
a.drone({ freq = 55, partials = [1,2,3,4.01], amps, detune = 7, type = 'sine', cutoff = 900, gain = 0.08, attack = 4 })
                                                            // -> { set, setFreq, stop }
a.pad({ chords: [[midi...], ...], gain = 0.05, attack = 5, change: [14, 26] /* s */, cutoff = 1400, type = 'triangle', reverb = 0.6 })
                                                            // -> { set, stop }
a.bell({ freq, gain = 0.06, decay = 3, ratio = 3.5, index = 2 })   // FM chime;  a.fm({ carrier, ratio, index, ... })
a.additive({ freq, partials: [amps], ratios?, attack, decay })
a.pluck({ freq, decay }), a.chirp({ f0, f1, dur, repeat, gap, vib, vibRate }), a.whoosh({ dur, f0, f1, filter, q })
a.every(minSec, maxSec, (when) => { ... }, { startDelay })  // sparse random events -> { stop }
a.wander(audioParam, depth, rate)                           // slow non-periodic modulation
```
Crossfade layers from `update` via `ctx.audio` (check it is not null): e.g. `this.deep.set(depth01 * 0.8, 2)`. Don't call
`set` every frame with the same value; update when it changes noticeably or a few times per second. Everything must loop
forever without audible repetition (`wander`, `every` and random chord changes help).

---

## 12. Tools

```bash
npm install                                  # once (esbuild, puppeteer-core)
node tools/build.mjs <id> [--readable]       # -> dist/<id>.html, prints size (+gzip); `all` builds every world + dist/index.html
node tools/shoot.mjs <id> [--quality medium] [--params "movement=fly"] [--no-build]
     # -> shots/<id>/pose-0..5.png, door-{closed,side,back,open,open-side,near,through,arrival}.png,
     #    motion-00..23.png (3 clips x 8 frames, 1/15 s apart), sheet.png (contact sheet), console.txt. Fails on console errors.
node tools/perf.mjs <id> [--quality medium] [--series] [--no-build]
     # 60 s fly-through at 1920x1080 with GPU timestamps -> perf/<id>.json (avg/p50/p99/max GPU ms, CPU ms, scale history)
     # PASS = avg <= 12, p99 <= 16.7, scale >= 0.6. Takes an exclusive lock (perf/.lock): runs queue up, never overlap.
node tools/probe.mjs <id> [--at 0,10,20] [--params "..."]  # GPU ms at scale 1 at fly-through times (finds the heavy spot; locked)
node tools/smoke.mjs <id> [--movement walk]  # interactive e2e: enter, WASD, Esc menu, open door, walk through, arrival
node tools/debug.mjs <id> ["shot=1&pose=2"] [--wait 6] [--png out.png]   # print console output of a page
```
All tools build first (unless `--no-build`), use the real AMD adapter (they fail on SwiftShader), keep the browser profile
inside the repo and delete it afterwards. `shoot`, `smoke` and `debug` may run in parallel; `perf` and `probe` serialize.
The iGPU is shared with the desktop (and with other agents' shoots), so single-frame spikes happen. Judge by the 60 s averages.

**URL parameters** (for the HTML in `dist/`): `?pose=N`, `?t=SECONDS` (freeze time), `?shot=1` (no UI, no audio, no start
overlay, scale 1), `?quality=low|medium|high`, `?flythrough=1` (looping fly-through), `?movement=`, `?scale=0.75` (fixed
render scale), `?bench=1`, `?post.<param>=value`, `?via=door` (arrival).

**Harness `window.__ow`:** `ready` (Promise), `info`, `stats(series?)`, `resetStats()`, `frames(n)`, `setPose(i)`,
`setTime(t)` (freeze), `unfreeze()`, `settle(t, sec = 2)` (run time from t−sec to t at 1/60 s, then freeze),
`flyAt(seconds)`, `startFlythrough()` (Promise → stats), `setScale(s)`, `door(i, open01)`, `doorView(i, dist, height, angle)`,
`transition(alpha, doorIndex)`, `arrival(alpha)`, `camera`, `ctx`.

---

## 13. Gotchas checklist

- Group 0 is the core's. Your bindings are group ≥ 1. Re-bind them in `renderTransparent`, because the doors use group 1.
- Reverse-Z: `greater-equal`, clear 0, sky at z = 0 drawn first without depth test. Projection matrices from `G`, not your own.
- `cull: 'back'` by default, so set `cull: 'none'` for leaves, cards and particles.
- All shading is linear HDR. Use `hex()` for sRGB colors. Never tonemap or gamma-encode yourself.
- Poses and fly-through points are **eye** positions used verbatim (no ground follow, no collision). Check they are not inside geometry.
- Spawn faces away from the door, 15–40 m from it. The door must be findable but not in the player's face on arrival.
- Animate from `t`/`G.time`, simulate with `dt`/`G.dt`; seed randomness → deterministic shots.
- No allocation in per-frame hooks. Build bind groups, pipelines and typed arrays in `init` (or `resize`).
- Keep `heightAt`/`sdf` smooth (C1 if possible); discontinuities make the camera jitter.
- Test `--quality low` too. Use `ctx.q.level` to scale counts.
