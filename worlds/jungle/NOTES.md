# jungle — Bioluminescent jungle with a lily lagoon

## Files
- `world.js` — layout, CPU terrain (`terrain()`), placement (hue zones `zs()`), lightmap bake, CPU culling, frogs/ripples/lotus/palette
  update, audio.
- `geo.js` — mesh builders (48-byte vertex: pos, nrm, uv, attr). Trees (twisted trunk, buttress fins, two tiers of branches and leaf
  clusters, sagging/dangling vines with small leaves), fern frond / fan / spiral / lotus templates (shaped in the vertex shader),
  Victoria pad (thin upturned rim), koi, frog, mushrooms (stem, cap, gills), candelabra shrub, rosette, lantern plant, reeds, ground tufts.
- `common.wgsl` — world uniforms `U` (172 floats, offsets listed in the struct), baked maps (height, glow lightmap, tileable noise),
  palette slots, `pulse()` waves, `glowAt()`, `shadeJ()`, `fishPos()`.
- `opaque.wgsl` — terrain (moss, pebbles, cobbled path with glowing joints and beaded edge moss, door moss ring), trees (bark bump,
  veins with core + halo, moonlit rim, leaf veins and translucency, vines with a travelling pulse), generic props (`fsProp`, type in
  instance `b.w`: 0 rock, 1 shrub, 2 mushroom, 3 rosette, 4 lantern, 5 reed, 6 tuft), ferns, fans, spirals, pads, lotus, koi, frogs,
  petals, sky.
- `fx.wgsl` — water (renderTransparent: 4 ripple layers, fresnel, reflections of sky/moon, shore glow, waterfall and each lotus),
  deferred mist pass (afterScene, reads depth: height mist + haze + glow scattered from the lightmap + analytic moon shafts), additive
  FX pass with read-only depth (waterfall sheets, mist billows, spray, lotus and frog halos, koi glow on the water, spores, fireflies).
- `postcard.wgsl` — the spawn view, all soft: canopy with a moon gap, cliff and waterfall ahead, glowing trunks at the sides, the
  lagoon as an ellipse on the ground plane (reflections only there), mossy shore.

## Layout
Lagoon centre (0, −36), radii 21 × 13. Cliff arcs around the back (≈15 m), waterfall at x = 2.5. Clearing around (0, −4).
Spawn (0, −9) faces the lagoon; door to `sky-mountains` at (9.5, 17), ~27 m behind, next to the cobbled path (`PATH`, with a
stepping-stone spur `SPUR` to the door). The door is framed by lantern plants, rosettes, shrubs and mushrooms, has a moss ring at
its foot and its own moon shaft.
Wading: `heightAt` is clamped smoothly at −0.55 in the lagoon; lily pads are walkable (`padsW`). `sdf` = cliff + tree trunks (grid).

## Light / colour
Fog density in `env` is 0 on purpose (the door uses core fog); all fog/mist happens in the deferred mist pass (thinner when the
camera is low over the water).
4 palette slots (cyan, magenta, violet, lime) rotate over ~14 min (`update`). Plants take their slot from hue zones (`zs`): groves of
cyan, violet or magenta with a neighbouring hue mixed in, lime as a rare accent. Every emitter is splatted into a 256² slot-weight
lightmap at load (small radii = light pools); terrain, water, mist and rims read it, modulated by `pulse()`.
Touch response: `touch()` brightens plants within ~4 m; ferns unfurl fiddleheads, fans open, spirals uncoil, props sway more.

## Tunables
`U.misc` = (moon strength, mist density, haze density, glow gain) in init. Counts per quality in init (trees, ferns, fans, spirals,
shrubs, rosettes, lanterns, reeds, tuft clumps, pads, spores, fireflies). Shafts list in init (x, z, radius, intensity).
Post in the module (`exposure 1.35, bloom 0.2`). Puff instance ranges in `vsPuff` (40 billows, 220 spray, 10 lotus halos, 6 frog halos).

## Perf
Medium, 1080p fly-through: avg 7.6-7.8 ms, p99 ~10-12.5 ms at scale ~1 when the iGPU is mostly free; up to ~9.8 ms avg with the
scale dipping to 0.6 (and occasional p99 > 16.7) while other agents' shoots share the GPU. Bundle 167 KB.
`shadeG` reuses one lightmap sample per fragment; `dotGlow` layers, fine ground detail (N5) and fine bark are distance-gated.
CPU frustum/distance culling with 2 LODs per instanced category (trees switch at 30 m).

## Round 2 notes
`glow()` (common.wgsl) pushes every emissive term into HDR with a whitening core; post uses bloom 0.3 / threshold 1.0 so only emitters
bloom. `nearFade()` shrinks plants within ~1.7 m of the camera (no near-plane intrusions). The sky pass draws a noise-masked dark
canopy dome with a gap and disc for the moon. Trees get per-instance girth and lean in `vsTree`; trunks/branches are gnarled in geo.
`U.door.w` = door open amount (warm light pool + contact shadow at the threshold in `fsTerrain`).

## Known issues / next
Water has no true reflections of geometry (sky, moon glitter, lightmap glow, waterfall and lotus streaks only). Koi are opaque meshes
under an alpha-blended surface (no refraction). `tools/shoot.mjs` samples three 0.5 s clips of the fly-through, so motion sheets
always show three short segments. Its arrival frame is taken 3 frames after the postcard pipeline is requested, so the
postcard overlay may not be compiled yet in `door-arrival.png` (the frame then shows the plain scene).

## Variety and life pass
Places beyond the lagoon, each reached by a side trail (`TRAILS`, drawn by the terrain shader like the main path, a little narrower):
- **Mushroom grove** `GRV` (-44, 14): 8 giant mushrooms (`gmush`, prop type 7, stems collide), a magenta fairy ring, lime/cyan light, a moon
  shaft, and the creature family on the cap rims (`lemur`, `vsLemur`: heads turn to the visitor within ~18 m, tails sway, eyes blink).
- **Ravine + vine bridge**: `RAV` polyline carved in `terrain()`, glowing mushrooms on the floor, `bridge()` mesh (prop type 9) from
  x = `BRA` to `BRB` at z = `BRZ`. `brOn` (set in `update`) makes `heightAt` return the deck and `sdf` add rails; no wading clamp in the ravine box.
- **Flower knoll** `FLW` (56, -8): a giant lotus (instance `b.w < 0` -> bloom = `U.fx.x`) that opens within ~18 m, with a low chime; lantern plants.
- **Moon pool** `POOL` (31, 35): second water patch in the same water mesh, pale lotuses (`b.y > 3.5` = slot-tinted), pads, reeds, rim stones.
Life: butterflies, 3 large moon moths, dragonflies over the lagoon and pool (`vsWing`, 5 additive quads per flyer, all motion in the vertex
shader), two hovering birds (`update` -> `U.bird`, opaque body `vsBird` + blurred wings in `vsWing`), snails (prop type 8, eye stalks
retract when you come close) on pads, path stones, the bridge and pool rocks, one creature on a bridge post and one at the pool.
The original scatter is untouched: new things use their own RNG (`R2`), and `cat(..., clr)` / the emitter loop drop old instances that
fall inside the new places (`dead()`). Sound: creature calls and low tones in the grove, plucked drops at the pool, a wing hum that follows
the nearer bird, plank creaks on the bridge.
Fixes: fan pleats match the rib count (65 columns), cliff/ravine walls use wall-projected noise (no vertical drips), cooler ground litter,
koi absorbed along the view path through the water.
Not done: the cave behind the waterfall (needs non-heightfield rock and would change the hero view).
Perf after the pass (Medium, 80 s fly-through through all places): avg 8.2 ms, p99 10.2 ms, scale 1. Bundle 214 KB dev build
(base with all postcards is 192 KB before this pass).

## Door fix
`sdf` used `(edge + 0.9 - rc) + (1 - am) * 30` for the cliff, which went negative everywhere more than ~45 m from the lagoon centre
(z > ~9), so the walker was pushed back north and could never reach the door (or anything south of the clearing). The term is now
`(1 - am) * (30 + rc)`: only the cliff arc blocks. `tools/smoke.mjs jungle` passes all checks.
Also: the water alpha fades in over the first 9 cm of depth (soft shoreline), giant mushroom gills are thin lamellae with light at the stem.
