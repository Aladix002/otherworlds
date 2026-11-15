# sky-mountains — Lietajúce hory nad morom oblakov

Fly world. Sunrise over a sea of clouds, karst pillars in aerial-perspective layers, floating islands with waterfalls, pines, cranes.

## Files
- `layout.js` — pure JS, deterministic: islands (`ISL`, first = hero island with the door), pillar scatter (`buildLayout`), trees on
  pillar ledges (`pillarTrees` samples the pillar surface function), hero-island cover, rock fragments, waterfalls, bird loops, `makeSdf`.
- `geo.js` — mesh builders. `uv` = (ao, material + sway weight); materials 0 rock, 1 vine/root, 2 bark, 3 needles, 4 grass, 5 flower, 6 bird.
  `pillarFn` (strata, terraces as flat ledges, optional overhanging head, floating variant with a ragged tapered bottom), `island`
  (top + tapered underside + dangling vines/roots), `pine` (4 LODs; LOD 0 adds needle sprays), `crane`, `tuft`, `flower`, `stone`.
- `common.wgsl` — baked 256² noise (r billow height, g/b gradient, a detail), cloud height field `cloudHG` (3 scales; CPU twin
  `cloudAt` in world.js keeps the camera above the billows), `hazeCol`/`atmo` (direction-dependent haze + low dense layer), sky base, `bump`.
- `scene.wgsl` — instanced VS (wind sway, drifting fragments), `shade` (soft sun, rim, translucency, mist where things sink into the
  clouds), `fsRock`, `fsVeg`, sky (cirrus, day moon, sun), cloud sea (camera-centred polar grid + dithered translucent shells + a high drifting veil, `fsVeil`), birds.
- `fx.wgsl` — waterfalls (three thin eroding strands per fall + five sinking mist puffs), motes. `rays.wgsl` — sun shafts: quarter-res
  radial march of sky visibility (depth), additive composite weighted by the depth of air.
- `postcard.wgsl` — sky, sun, cloud sea, three rows of pillar silhouettes, a floating island with a fall.

## Layout
Hero island at (0, 70, 0), 19 × 27 m. Spawn (0, ~72.6, −7) looks −Z over the edge; the sun is ahead-left (`SUN`). Door at (0, 70.9, 15),
22 m behind the spawn, facing it, with stepping stones, boulders, lusher grass and baked contact shade. Waterfall island = `ISL[1]`.
Bounds: sphere r 280 around (0, 95, −70). `heightAt` = cloud top + 9 m. `sdf` = pillar cylinders + island slabs.

## Rendering
All instanced kinds go through `makeBatch`/`binBatch`: per frame CPU frustum + distance culling into LOD ranges of one vertex buffer
(no allocations). Hero-island sun shadows (trees, door, stones) + contact shade are baked on the CPU into a 256² map (`SM`).
Draw order: rock, vegetation, birds, cloud sea, sky (last, depth-tested) → doors → cloud shells, falls, motes → shafts (afterScene).

## Tunables
`env`/`post` in world.js; haze in `hazeCol`/`atmoT`; cloud amplitudes/scales in `cloudUV`/`cloudMix` (keep `cloudAt` in sync);
counts per quality: pillars (`buildLayout`), trees per pillar (init), tufts/flowers (`heroCover`), shells, motes.

## Perf (Medium, 1920×1080, RADV Renoir)
Quiet GPU: avg 5.5 ms, p50 5.4, p99 7.7, scale 1.0; probe at scale 1: 5.7–8.1 ms (heaviest near the door). When other jobs share
the GPU the whole run scales up (avg ≈ 8.9, p99 ≈ 15.6) and single frames spike to 30 ms at random places.

## Known issues / next
No real shadows off the hero island (AO + soft wrap only). Cloud sea is a height field: flying into a tall billow is prevented by
`heightAt`, not by volume. Waterfall strands and puffs are not depth-sorted or depth-faded against rock. Rock detail normals come from the baked noise
gradients (no screen-space derivatives), so very close rock is soft rather than crisp.
