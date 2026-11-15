# Astrálny oceán (`astral-ocean`) — notes

Fly mode (speed ×0.7). Spawn (0,0,0) looks −Z at the warm nebula core; the door to `underwater` stands on a floating
islet at (0,−2,26), behind the spawn.

## Files
- `layout.js` — pure layout: `PATHS` (0–2 whales, 3–4 shoals, 5 = escort shoal riding beside whale 1), `JGROUPS`, poses
  and fly-through. Phases (`u0`) are solved at load: whale 0 for the spawn view, whale 1 so it passes the camera in
  profile at the last motion clip (49.2 s), shoals for clips 1/2, and whale 2 by a small search so that in every key
  view it is either whole in frame or clearly out and never overlaps another whale. `flyCam`/`wpTimes` mirror the core
  spline timing. `spine()` is the allocation-free twin used by `sdf` (whales gently push the camera aside).
- `world.js` — whale mesh builder (humpback profile; curved, tapered, knobbly flippers; falcate notched horizontal fluke;
  small midline dorsal), jelly placement with enforced column spacing, clustered puffs, islet builder, pipelines, audio.
- `common.wgsl` — path storage + `aoPathPos`/`aoFrame` (spine frame at body fraction s) + `aoWave`.
  **Keep in sync with `pathPos` in layout.js.**
- `util.wgsl` — `aoPix` (meters per pixel), `aoCorner` (quad corners).
- `nebula.wgsl` + `bake.wgsl` — far nebula (continuous low-frequency haze everywhere, band, rose-gold core with soft
  roll-off, dust lanes, galaxies, spiral landmark) and mid "wisp" layer, baked at load into two rgba16f cubemaps.
- `sky.wgsl` — far cube + two parallax shells + two layers of procedural stars (power-law magnitudes, larger = softer,
  windowed inside their cell, dimmed behind dense gas).
- `whale.wgsl` — three draws: aura sprites (`vsh/fsh`), depth prepass (`vs/fsd`, colour mask 0), colour at depth `equal`
  (premul). One clean shell: dark glassy centre (alpha ~0.3) with inner drifting nebula, strong fresnel rim, spine and
  lateral lines with travelling pulses, mouth line, eye, ventral pleats (fade with fwidth → no moiré), warm constellation
  points with irregular links, distance haze. Everything drawn after the whales is depth-tested against them.
- `trail.wgsl` — stateless stardust shed from the whole fluke edge, flipper tips and tail stock.
- `jelly.wgsl` — bells (asymmetric pulse, inner glow that swells with the pulse), halo sprite (`vsg`), 10 swaying
  tapered tentacles + 4 frilly oral arms (`vst`), distance haze (`aoHaze`).
- `fish.wgsl` / `fishdraw.wgsl` — compute: each fish targets a lagged point of its shoal path (continuous ribbon) +
  damped deviation that parts around the camera and whales. Drawn as small additive comets (bright head, fading tail),
  capped to ~22 px and dissolved within 7 m of the camera; teal → cyan → violet per fish.
- `motes.wgsl`, `puffs.wgsl`/`puffbake.wgsl`, `glow.wgsl`, `postcard.wgsl` (same nebula + a rim-lit whale silhouette
  using the mesh profile, low-left so it never sits on the real whales during the arrival dissolve).
- `islet.wgsl` — materials by `uv.x`: rock (bump from noise gradients, strata, crack lines, moss in hollows, lichen
  specks, AO, crystal light spill from `CL`), crystal, debris, root (travelling light pulses), tendril, grass, worked
  stone steps (inlaid line of light around the threshold).

## Tunables
`PATHS`, `JGROUPS`, `WP` (fly-through), counts per quality in `init`. Thin things clamp to ≥ ~1.6–2.4 px and scale
intensity by area, so they stay temporally stable.

## Perf (Barcelo iGPU, 1920×1080)
Medium: avg 4.9 ms, p99 10.8 ms, scale 1.0 over the fly-through. Low: avg 2.7 ms. Standing at the islet costs more
(roughly 8–10 ms at scale 1: the rock shader fills the lower half of the screen).

## Known issues / ideas
- Whale depth prepass: things behind a whale are fully hidden, not dimmed (reads as volume; fine at these distances).
- The fly-through does not pass the islet; probe it with `__ow.doorView` when touching `islet.wgsl`.
- Roots on the steps are plain tubes; a bark normal pattern would help up close.
