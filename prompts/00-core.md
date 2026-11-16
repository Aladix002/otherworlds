# OtherWorlds — shared core (build this first)

OtherWorlds is a set of 12 calm, open, magical anti-stress worlds that run in the browser. You move through each one freely, and ordinary wooden doors stand in the landscape. A door swings open, the next world is already visible through the frame, and you step through into it. The world list is in `/SVETY.md` and each world has its own prompt in `/prompts/NN-*.md`.

Your job is the **shared core**: everything the worlds have in common. Also build one minimal **test world** that proves the core works end to end. Do not build any of the 12 real worlds. Other agents will build those in parallel on top of your core, so the API you design is the contract they code against. Make it small, stable and documented.

## Priorities (in this order when they conflict)
1. Feel: calm, smooth and beautiful. Inertial camera, no stutter, no harsh contrast, no sudden sounds.
2. Stable frame pacing on the target hardware.
3. Small bundle size.

## Hard constraints
- **Raw WebGPU + WGSL + Web Audio.** No Three.js, Babylon.js or any other engine or 3D library. A build tool (esbuild) is fine.
- **Everything procedural.** No texture, model or audio files. Each world ships as one self-contained `.html` file.
- **Zero per-frame JS allocations.** Preallocate all buffers, typed arrays and uniform staging, and reuse command structures where possible.
- No network requests at runtime. Must work offline from `file://`.

## Target hardware (this machine — the perf gate runs here)
- Laptop, AMD Ryzen APU with **integrated Radeon "Barcelo"** (Chrome reports vendor amd, rdna-2), 30 GB RAM, Linux, Chromium 157 (snap).
- Gate: **Medium preset, 1920×1080 output**, with dynamic internal resolution allowed (floor 0.6× scale). **Average GPU frame ≤ 12 ms, p99 ≤ 16.7 ms** during a scripted 60 s fly-through.
- High preset is for strong desktop GPUs (enabled automatically when the adapter is fast). Low is for phones and weak iGPUs.

## Repo layout (create it)
```
/package.json            root, type: module, devDeps: esbuild, puppeteer-core
/core/src/…              shared runtime (ES modules)
/core/wgsl/…             shared WGSL snippets (imported as strings)
/core/README.md          THE API CONTRACT — world authors read only this + their prompt
/worlds/_test/           minimal test world
/worlds/<id>/            one folder per world (built by other agents)
  world.js               default export = world module (see API)
  postcard.wgsl          the world's "postcard" shader (see Doors)
/tools/build.mjs         node tools/build.mjs <id|all> [--readable]
/tools/shoot.mjs         screenshots for the visual critic
/tools/perf.mjs          GPU-timed fly-through benchmark
/dist/<id>.html          built single-file worlds
/dist/index.html         start page = links to all worlds (simple, calm)
```

## Core runtime responsibilities
1. **GPU bootstrap.** Adapter and device, canvas configuration, resize, `timestamp-query` when available, device-lost recovery (retry one quality level lower, as Abyssal Garden does).
2. **Frame loop.** Fixed order: world `update` → world renders into core-owned HDR targets (`rgba16float` color + `depth32float`) → core post stack → swapchain.
3. **Post stack (core-owned, world-tunable).** Bloom, exposure, filmic tonemap (AgX or ACES-fit), subtle vignette and **blue-noise dithering** so there is no banding in dark gradients (critical for night and underwater worlds). Expose its parameters so a world can tune them.
4. **Dynamic resolution.** Render scale adapts in small steps toward the frame budget.
5. **Camera and movement**, with three modes chosen by the world:
   - `fly`: free 6-DOF float, heavy damping, slow.
   - `swim`: like fly plus gentle buoyancy drift and a tiny sway.
   - `walk`: ground-following via the world's `heightAt(x,z)`, eye height ~1.6 m, smooth step-up, no jumping.
   - Controls: WASD move, mouse look (pointer lock), Q/E down/up (fly/swim), Shift faster, `E` or click to interact with a door when near, Esc menu, M mute, H perf overlay. Touch: one finger swims, a second finger speeds up.
   - Collision: a world-provided signed distance function `sdf(x,y,z)` (optional) plus soft world bounds that push back gently, never as a hard wall.
6. **Quality presets** Low, Medium and High. Worlds read `ctx.quality` (counts, shadow on/off, step counts). The choice is remembered in localStorage with try/catch.
7. **UI.** Calm loading screen with a progress bar driven by `init` progress callbacks, start overlay ("Vstúpiť"), and an Esc menu with: world list (jump anywhere), quality, volume, mouse sensitivity, invert Y, resume. UI text is in English.
8. **Audio engine.** Master bus with a gentle limiter and a convolution reverb from a synthesized impulse response. Helpers for drones, pads, noise beds (filtered noise for wind and water), simple FM/additive voices and a scheduler for sparse random events. Audio starts only after the user clicks "Vstúpiť". It fades in and out across door transitions.
9. **Doors and transitions** (see below).
10. **Test harness API** on `window.__ow` for tools: `ready` promise, `setPose(i)`, `setTime(t)` (freezes animation time for deterministic shots), `startFlythrough()`, `stats()` (cpu/gpu ms, p99, resolution scale). URL params: `?pose=N&t=SECONDS&shot=1` (hide UI, skip start overlay, no audio), `?quality=low|medium|high`, `?flythrough=1`.

## World module API (document it precisely in `/core/README.md`)
A world's `world.js` default-exports an object roughly like this. Refine it, but keep it this simple:
```js
export default {
  id: 'astral-ocean', title: 'Astrálny oceán',
  movement: 'fly' | 'swim' | 'walk',
  spawn: { pos:[x,y,z], yaw, pitch },
  poses: [ {pos, yaw, pitch}, … 6 ],          // fixed camera poses for the visual critic
  flythrough: [ {pos, yaw, pitch}, … ],        // spline control points for the perf run (≥ 60 s, covers the heavy areas)
  doors: [ { pos:[x,y,z], yaw, to:'next-world-id' } ],  // core draws and handles them
  post: { exposure, bloom, fogColor?, … },     // initial post params
  heightAt?(x,z), sdf?(x,y,z), bounds: {center, radius} | {min,max},
  async init(ctx, progress) {},                // build pipelines, generate the world on the GPU, progress(0..1)
  update(ctx, dt, t, cam) {},                  // no allocations
  render(ctx, pass) {},                        // draw into core's HDR pass (globals bound at group 0)
  audio(ctx, a) {},                            // build the soundscape with core audio helpers
}
```
- `ctx` provides: `device`, formats, `quality`, `globals` (uniform buffer at `@group(0) @binding(0)` with viewProj, invView, camPos, time, resolution, sunDir/fogColor slots…), the WGSL include library (noise: value/simplex/fbm/curl/voronoi, hash, sdf ops, color helpers, lighting helpers), a mesh-helper module, preallocated scratch math and a seeded RNG.
- A world can add its own extra passes (compute for particles or boids, a shadow pass…) through hooks such as `computeBefore(ctx, encoder)`.

## Doors (core-owned)
- An **ordinary old wooden door** in a simple wooden frame, built procedurally (planks, iron hinges, a round handle, weathered wood shader), standing freely in the landscape. It must look the same in every world, lit by that world's lighting.
- Approaching it shows a soft hint ("E – otvoriť"). On interact, the door swings open slowly (~1.5 s, eased) with a creak synthesized in Web Audio.
- **Through the open frame you see the next world.** The core renders the target world's `postcard.wgsl` into the doorway as a parallax "window": the shader receives the view ray direction through the frame plus time and returns HDR color. Every world agent writes its own postcard (a cheap, stylized, recognizable impression: sky, horizon silhouettes, a few signature elements). The build bundles every world's postcard into every world, so any door can show any target. Missing postcard → elegant default gradient.
- Walking through the frame makes the postcard expand to fill the screen. Audio fades, then navigation goes to `<to>.html?via=door`. The next world starts with the same postcard filling the screen, which dissolves into the real world as its audio fades in. The player arrives facing away from that world's door.
- The default door order is a ring through the 12 worlds (order in `/SVETY.md`). The Esc menu allows jumping anywhere.

## Build
- `tools/build.mjs` uses esbuild to bundle core plus one world into a single minified `dist/<id>.html` with everything inlined, and imports `.wgsl` as text. `--readable` skips minification. `all` builds every world folder and regenerates `dist/index.html`. Report each world's size. Soft budget ≤ 150 KB per world.

## Verification tools (other agents rely on these — make them robust)
Known-good headless setup on this machine (already tested):
```js
puppeteer.launch({ executablePath: '/snap/bin/chromium', headless: 'new',
  userDataDir: '<repo>/.chrome-profile-<random>',   // snap Chromium cannot write to /tmp: keep profiles and outputs inside the repo
  args: ['--no-sandbox','--enable-unsafe-webgpu','--enable-features=Vulkan','--use-angle=vulkan','--ignore-gpu-blocklist'] })
```
This gives the real AMD adapter with `timestamp-query`. Without these flags you get SwiftShader or no adapter. Assert in the tools that the adapter is not SwiftShader.
- `tools/shoot.mjs <id> [--quality medium]` writes `shots/<id>/pose-0..5.png` at 1920×1080 with deterministic time, plus `shots/<id>/motion-*.png` (about 24 frames from a few seconds of the fly-through, for spotting shimmer, popping and aliasing). Also write a contact sheet `shots/<id>/sheet.png` (ImageMagick `montage` is available).
- `tools/perf.mjs <id> [--quality medium]` runs the 60 s scripted fly-through and writes `perf/<id>.json` with avg, p99 and max GPU ms (timestamp queries) and CPU frame ms, plus the resolution-scale history. **It must take an exclusive lock** (`flock` on `perf/.lock`), because several agents share one GPU and parallel runs corrupt the numbers. `shoot.mjs` may run in parallel.
- Remove profile directories after each run.

## Test world (`worlds/_test`)
A simple but pleasant scene: gradient sky, gently rolling fbm ground, some instanced rocks, a door to `_test` itself. It proves: init progress, all three movement modes (switchable via `?movement=`), poses, fly-through, post stack, audio bed, door open + postcard + transition, the shoot and perf tools, and build size reporting.

## Done when
- `node tools/build.mjs _test` produces a working single file, and `shoot` and `perf` both work against it on the real AMD adapter.
- The test world passes the perf gate.
- `/core/README.md` documents the full world API, ctx contents, WGSL library function list, audio helpers, movement modes, door/postcard contract, tool commands and the rules (zero per-frame alloc, no assets, English UI).
- Report: API summary, test-world perf numbers, bundle size, and any limits world authors must know.
