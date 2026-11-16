# Kryštálová jaskyňa (`crystal-cave`)

Walkable cavern: main hall with giant selenite beams (spawn), pool chamber (east), amethyst geode alcove (north),
moonlight shaft chamber (south), door chamber (west, door -> `spirit-forest`), mushroom grotto (south-west), rift with the
selenite bridge and the citrine chamber with the sleeper (north-east, hidden passage).

## Files
- `cave.js` — everything built on the CPU at load: chamber/tunnel SDF (`sdfCave`, JS only), floor heightfield `floorY`
  (WGSL twin in `common.wgsl`), crystal/beam placement + light list (`placeCrystals`), block-sparse surface-nets mesher
  and per-vertex light bake (`buildMesh`: light rgb, AO, dominant light dir, caustic weight, wetness, pulse phase),
  unit crystal mesh, tileable rock detail texture (height + gradient + specks, with mips).
- `scene.wgsl` — rock (depth prepass + `equal` shading pass, triplanar detail normals from the baked texture, baked
  crystal light, caustic lines) and crystals (one hex-prism mesh for amethyst points and selenite beams; the fragment
  shader refracts the view ray, walks it through the hexagonal cross-section to the exit facet and builds inner glow,
  back edges, veils, bevels, dispersion fringes and facet flashes from that).
- `life.wgsl` — moths, orbs, spores, fish, jellyfish, nebula; mushrooms; the sleeper.
- `fx.wgsl` — stream and upward waterfall, pool water (planar reflection rendered in `computeBefore` with `MIRROR = 1` pipelines into a small target,
  drop ripples), falling drops, analytic moonlight shaft, soft additive light pools. `motes*.wgsl` — dust motes.
- `postcard.wgsl` — analytic spawn view (violet hall, beams, amethyst clusters, cyan pool-chamber mouth).

## Tunables
- Layout: `CH`, `TU`, `COLS`, `BEAMS`, `scatter(...)` calls and hero cluster lists in `cave.js`.
- Light strength: `cluster(..., I)` and beam `light(...)` in `cave.js`; ambient in `fsRock` (`amb`).
- Crystal look: `fsCry` (`axial`, `facet`, e0 gains); caustics: `caustic()` and the `ca` weight in the bake.
- Reflection resolution: `RW` in `world.js`; it is rendered only while `poolVis`.

## Critic round 1 changes
Selenite got its own translucent branch in `fsCry` (`sel`: thin-edge scatter, milky core, fractures, env tint), irregular
cross-sections and satellite crystals + glow pool at every base. The geode is a packed shell (dark rind + agate banding in
`fsRock`, ~1700 fat clusters leaning to the centre). Rock is neutral charcoal with desaturated baked light; caustics are
softer, two-layer, tighter and distance-faded; the shaft is a seamless cone with a baked landing pool; water ripples are
finer and the reflection target is 960x540 on Medium.

## Variety, life and surreal pass
New places (all in `cave.js`: `CH` 5-7, `TU`, `floorY`):
- **Mushroom grotto** (south-west, loop hall -> grotto -> shaft chamber): ~290 instanced glowing mushrooms (`patch`, `vsMush`/`fsMush`,
  they brighten when you are near), moss on the rock, a pond, and a stream (`STREAM` polyline carved into `floorY`, JS + WGSL twin,
  ribbon mesh `streamGeo`) that runs through the moonlight chamber. The **waterfall falls upward**: a column of water rises from
  the pond into a chimney in the ceiling (`fallGeo`, `fsFall`), with drops rising around it.
- **The rift** (hidden passage behind the column in the north-east of the hall, gold light leaks from it): a chasm carved into `floorY`
  with citrine glowing in its depth, crossed by a fallen selenite beam (flat side up; `heightAt` in `world.js` returns the beam top,
  `sdfWorld` blocks the rift except along the beam).
- **Citrine chamber** beyond the bridge: gold/amber crystals and **the sleeper**, a curled crystal salamander (`spine`, `salR`, `salGeo`,
  `vsSal`/`fsSal`): it breathes, has a crest of citrine plates and rose gill-stalks (ordinary crystal instances), running lights along
  the back, and its eyes open a slit when you come close. Positional purr + breath that follows the body.

Life (`life.wgsl`, one instanced quad pipeline `vsLife`, kinds 0-5, list built in `world.js` init): cave moths around clusters and
flowers, light orbs that drift toward you, gold sparks rising from the rift, spores over the mushrooms, blind white fish in the pool
and the pond (they drift away from your feet), crystal jellyfish, the nebula. **Crystal flowers** (12, `flower()` in `cave.js`,
glow >= 8 marks them): they light up when you are near, chime once (`chime`) and send a colour ring over the rock (`G.params2`).

Surreal elements: (1) the **floating heart of the hall** - a burst of crystals in mid-air with ~130 double-pointed shards orbiting it
(`OC`, separate instance buffer drawn with the `ORBIT = 1` variant of the crystal pipeline; beams keep out of its sphere);
(2) **slow colour rings** breathing out of the heart over all the rock (`fsRock`), plus the flower rings; (3) the pool shows a
**small galaxy** deep under the reflection (`galaxy()` in `fsWater`); (4) the **upward waterfall** and a stream that flows toward it,
its water faintly luminous; (5) **crystal jellyfish** singing in the air; (6) a **tiny nebula** hanging in the heart of the geode.

Fixes: beams no longer pass through each other (`crosses()` shortens or drops them); wall and floor clusters sit in sockets
hollowed out of the voxel field (`SOCK`, `socketed`) with a druse rim; amethyst/citrine faces carry per-face depth of colour,
pale root to dark point, fewer white flashes; the geode is drawn front to back from its mouth.

The fly-through `PATH` was routed with an A* over a clearance grid (crystals included); if placement changes (any extra `rng()` call
in `placeCrystals` shifts everything after it) re-check that it does not pass through crystals.

## Known issues
- Light is baked: the "brighten as you approach" effect is a camera-distance boost, not per crystal.
- Reflection pass is skipped when the pool is behind the camera or > 44 m away.
- The player walks on `floorY`; steep bowl walls stop the camera through the SDF, small crystals have no collision.
- Postcard is a stylised approximation of the spawn view.
