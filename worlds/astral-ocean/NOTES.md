# Astrálny oceán (`astral-ocean`) — notes

Fly mode (speed ×0.7). Spawn (0,0,0) looks −Z at the warm nebula core; the door to `underwater` stands on a floating
islet at (0,−2,26), behind the spawn.

## Files
- `world.js` — paths, whale mesh builder, jelly/puff/islet data, pipelines, audio. Poses and fly-through are computed at
  module load from the creatures' analytic paths (JS twin `pathPos`/`frame`).
- `common.wgsl` — path storage + `aoPathPos`/`aoFrame` (spine frame at body fraction s, body follows head) + `aoWave`.
  **Keep in sync with `pathPos` in world.js.**
- `util.wgsl` — `aoPix` (meters per pixel), `aoCorner` (quad corners).
- `nebula.wgsl` + `bake.wgsl` — far nebula (band, warm core, dust lanes, galaxies, spiral landmark) and mid "wisp"
  layer, baked at load into two rgba16f cubemaps, one face per submit.
- `sky.wgsl` — per-frame sky: far cube + two parallax shells (r 420 / 210, ray-sphere) sampling the wisp cube, plus two
  layers of procedural, pixel-stable gaussian stars.
- `whale.wgsl` (premul) — L = 1 mesh bent along path, vertical travelling body wave, flipper flap; fresnel rim, noise veins
  with travelling pulses, throat pleats, constellation dots + lines, all AA'd via fwidth with energy conservation.
- `trail.wgsl` — stateless stardust shed from whale skin (born at t − age, curl drift).
- `jelly.wgsl` — bells (lathe, asymmetric pulse: fast contract / slow relax, stepwise upward thrust) and procedural
  ribbon tentacles + oral arms with light beads travelling down after each pulse.
- `fish.wgsl` / `fishdraw.wgsl` — compute: each fish targets a lagged point of the shoal path (clumped, twisting,
  undulating ribbon) + damped deviation that parts around the camera and wanders on curl noise.
- `motes.wgsl` (stateless camera-wrapped dust), `puffs.wgsl`/`puffbake.wgsl` (local gas cards from a baked 4-channel
  density texture), `glow.wgsl` (islet halos), `islet.wgsl`, `postcard.wgsl`.

## Tunables
`PATHS` (whale/shoal loops: center, radius, ellipse, height wave, yaw, speed, u0, dir, length), `JGROUPS`, counts per
quality in `init` (cube sizes, fish, trail particles, jellies, tentacle segments, motes, puffs). Thin things all clamp to
≥ ~1.3 px and scale intensity by area, so they stay temporally stable.

## Perf
Medium ≈ 4.6 ms avg GPU at scale 1.0 on the Barcelo iGPU (core post included). Heaviest: sky pass and close whales.

## Known issues / ideas
- Fish shoals may pass through the islet edge.
- Whale throat pleats can look busy on the side at close range.
