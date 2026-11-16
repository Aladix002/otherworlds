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

## Variety and life pass (round 4)
Four regions around the spawn, all in `layout.js` (`NURSERY`, `REEF`, `RING`, `ROCKS`, `CLOUDS`, paths 6-9):
- **Rose-gold nursery** (toward the core, ~100 m ahead-left): a mother whale and her calf (paths 6/7, whale instances
  3/4, rosier rim; the calf keeps the same angular speed and rides beside her back), a double helix of pearl "eggs",
  baby jellies (JGROUPS[3], size x0.5), rose and gold plankton. The calf answers the whale song in a high voice.
- **Teal reef field** (right of the spawn, inside whale 1's loop): seven asteroid chunks (top rock + keel) merged into
  the islet mesh, grown with branching light-coral (material 5), weed (6) and crystals; tiny darters circle each
  rock; a pod of luminous rays glides in arcs over it (path 8); teal plankton; the comet hangs beyond. Rocks collide
  (`sdf`). Quiet positional plucks and chirps.
- **Crystal ring** (behind the islet, around jelly column 2): 18 double-ended shards, material 8, turning in the
  islet vertex shader about `RA` through `RC`. Home of six star-sprites: within ~60 m the bolder ones drift over and
  circle a few metres ahead of you, then go home (CPU state in `_ld[0..5]`, small bells when they are with you).
- **The quiet deep** (below y = -40): five giant jellies (JGROUPS[4], x2.6) and the giant ray (path 9, y = -140, half
  span 64 m, ray instance 0): a dark silhouette with a faint edge, always a little out of reach under the bounds.
  A low drone layer swells as you sink.
- Everywhere: five plankton clouds that glow when you are near and wind up into a slow whirl while you move through
  them (swirl angle and glow integrated in `update`, `_ld[11..15]`), and a slow comet circling the core far out with
  its tail streaming away from it.

New files: `ray.wgsl` (one sheet mesh, planform + flap in the vertex shader, outline light from the mesh
coordinates) and `life.wgsl` (one additive draw for plankton, darters, pearls, comet, sprites; instance ranges by
override constants). New content uses its own RNG stream (`rng2`), so the older layout did not move.

Fixes: whale fins carry a chordwise coordinate in `uv.x` (part + 0.3 * c) and are shaded as glass lenses (bright
rounded edges, clear middle, three finger-bones of light on the flippers; thicker section). Islet rock: the mid
octave that drew worm-track contours is turned down in favour of fine grain, and cracks stay on the flanks.

Layout: the old whales' phases are frozen numbers now (the framing search is gone). Poses: 0 spawn (whale 0 + nursery
pair), 1 close whale, 2 nursery, 3 reef + rays + comet, 4 the deep, 5 islet + ring. Fly-through: islet -> spawn view
-> fish -> jellies -> across to the reef (clip 3).

## Perf (Barcelo iGPU, 1920×1080)
Medium: avg 5.3 ms, p99 8.1 ms, max 10.7 ms, scale 1.0 over the fly-through. Low: avg 3.7 ms, p99 15.8 ms (scale 0.85).

## Known issues / ideas
- Whale depth prepass: things behind a whale are fully hidden, not dimmed (reads as volume; fine at these distances).
- The islet rock shader is the most expensive thing in the world when it fills the screen.
- Rays are single sheets (no thickness); edge-on they are thin. The reef rocks do not drift.
- Bundle is ~187 KB (the other worlds' postcards alone put the baseline at 178 KB).
