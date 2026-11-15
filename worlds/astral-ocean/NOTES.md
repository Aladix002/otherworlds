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

## Round 3 changes (what moved since the notes above)
- Whale mesh: bulkier front third, arched back, dorsal hump + fin, deep tail stock (height profile `hB`, width narrows
  instead), flippers ~30 % of body length with a wavy leading edge, wide notched fluke that pitches with the stroke
  (`uv.x == 2` in `vs`). Shader: lower opacity (0.13 + rim), head tubercles as light points, haze sampled from the far
  nebula cube behind the whale (bindings 1/2 of the whale group), fins get a little extra opacity so they do not vanish.
- Whale paths are wider (whale 0 R 112, whale 1 R 60) so bodies no longer bend into a C; whale 0 swims the other way.
- Jellies: per-jelly offset `d` written from `update()` each frame (damped push away from whale spines); hue range
  pink/peach/violet/cyan/teal, per-jelly bell height, softer ribs, stronger sway and frills.
- Sky: stars use the true angular distance to the star direction (round discs); soft peach/rose wisps and a wide glow
  around the core instead of the cellular lanes; dark veins softened. Puffs: 60 on Medium, rgba16f 384² density
  texture, colour mostly taken from the backdrop cube behind each puff.
- Islet: three stepped tiers (`TIER`, also injected into the shader as `TIERS` for step AO), stone feet at the jambs
  (the creeping roots were removed: they read as cables), worn rune strokes instead of the line, contact AO under the
  threshold, crystals with inner light + bright edges, cooler slate rock with finer grain, broken-up under-glow.
- Layout: the fly-through now starts at the door on the islet, so the perf run covers it. Clip 1 = whale + fish
  ribbon, clip 2 = jellies with whale 0 gliding past whole, clip 3 = close whale in profile. Pose 4 = under the great
  whale, pose 5 = islet off-centre with jellies behind.

## Perf (Barcelo iGPU, 1920×1080)
Medium: avg 5.7 ms, p99 13.9 ms, min scale 0.95 over the fly-through (the first seconds at the islet are the heavy part:
about 11–13 ms at scale 1, then 4–6 ms). Low: avg 2.7 ms, p99 8.6 ms.

## Known issues / ideas
- Whale depth prepass: things behind a whale are fully hidden, not dimmed (reads as volume; fine at these distances).
- The islet rock shader is the most expensive thing in the world when it fills the screen.
- The framing search in `layout.js` is weak (its score is dominated by unavoidable terms); key views were tuned by hand.
