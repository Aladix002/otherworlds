# Dream Desert (`dream-desert`)

Walk world. Spawn inside a slot canyon (dusk light, beams, dancing dust); both canyon mouths open onto night dunes.
Door (-> `light-library`) stands on a knoll ~35 m behind the spawn, outside the south mouth.

## Places
- **Slot canyon** through the mesa (z = +37 .. -37): three skylight chambers with volumetric beams; the dust in each beam
  gathers into figures (double helix, ring stack, torus knot, spiral funnel, vortices), dissolves and reforms (34 s cycle).
- **North dunes**: glowing lizards (footprints) and snakes (trails), fiddlehead whips, lantern cacti, scarab beetles.
- **Hidden oasis** (west, `OASIS`): mirror pool, luminous shore, night-blooming trumpet flowers, trickle sound.
- **Carved arch** (`ARCH`): glowing glyphs that wake as you approach (`G.params.y`), low hum.
- **Sky**: baked Milky Way, star sprites, aurora veil to the south, a star caravan (4 camels + 2 fennec foxes made of stardust, walking across the sky), a caravan of 12 paper lanterns
  circling the desert, three dancing sand spirals on the dunes (`DEVILS`).

## Files
- `geo.js` — layout, `ground()` (dunes, canyon floor, oasis bowl, door knoll), `sdRock()` (mesa + canyon + chimneys, arch),
  surface-nets mesher with baked canyon light / AO / warm factor, warped-grid terrain mesh, tileable detail texture.
- `life.js` — creatures as CPU skeletons (analytic in time, deterministic): lizards (gait + 2-bone IK legs, cached prints),
  snakes + trails, beetles, lanterns, plants. Everything tubular is one spline-tube renderer (`life.wgsl`).
- `scene.wgsl` — rock (triplanar detail, bedding laminae, light ramp inside / night outside, arch glyphs) and sand
  (two ripple scales, creature light pools from a 13-light uniform, glitter, beam pools, oasis shore, door grounding).
- `caravan.js` / `caravan.wgsl` — the star caravan (see below).
- `sky.wgsl` / `bake.wgsl` — sky dome (baked equirect), dusk blend by `G.params.x`, aurora, stars, oasis water.
- `fx.wgsl` — beams (afterScene, depth-aware 10-step march in analytic cylinders) and the mote figures (stateless).
- `postcard.wgsl` — analytic spawn view (canyon corridor, beam, dust).

## Tunables
`ramp()` in `common.wgsl` (canyon palette), `canyonLight()` and `warm()/dusk()` in `geo.js`, `C` table in `life.js`
(creature loops: centre, radii, speed, hue, size), `figure()` and `MT` in `fx.wgsl`, env/post in `world.js`.

## Known issues
- Canyon light is baked per vertex (0.34 m grid); beams never move. Sky dusk/night blend depends on the camera position.
- Creatures walk fixed loops and do not avoid the player or each other; no collision with plants or creatures.
- The pool is a flat disc intersecting the bowl; you can wade through it.
- Terrain is a single 448² warped grid (no LOD); far dune crests are slightly faceted.

## Later passes
- Mesa: benches stepping down to the rim and buttress fins (`sdRock`); canyon glow masked to interior faces.
- Ground: small ridges/swells near the mesa and door, boulders (tube kind 10), deeper oasis basin with palms and reeds (kind 9).
- Star caravan (`caravan.js`, `caravan.wgsl`): animals are capsule-bone skeletons (analytic walk, 2-bone IK legs) in a line at z = CZ, y ~ 36-60, walking +x at CV m/s (wraps). 3-6.6k star particles per camel (1.5-3.3k per fox) pinned to bones (bone, t, direction, radial), placed in the vertex shader with a fresnel rim, plus joint constellation stars, faint nebula blobs and a stateless stardust trail from feet/tail/back. Poses 2 looks at it at t = 10; the flythrough pitches up on the dunes.
- Lanterns light the sand through the terrain light uniform (25 lights: 13 creature + 12 lantern).
- Sand spirals: a CPU helix ribbon (kind 7) plus the mote figures. Beam pool on the floor is clamped below white.
