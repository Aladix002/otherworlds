# Kryštálová jaskyňa (`crystal-cave`)

Walkable cavern: main hall with giant selenite beams (spawn), pool chamber (east), amethyst geode alcove (north),
moonlight shaft chamber (south), door chamber (west, door -> `spirit-forest`).

## Files
- `cave.js` — everything built on the CPU at load: chamber/tunnel SDF (`sdfCave`, JS only), floor heightfield `floorY`
  (WGSL twin in `common.wgsl`), crystal/beam placement + light list (`placeCrystals`), block-sparse surface-nets mesher
  and per-vertex light bake (`buildMesh`: light rgb, AO, dominant light dir, caustic weight, wetness, pulse phase),
  unit crystal mesh, tileable rock detail texture (height + gradient + specks, with mips).
- `scene.wgsl` — rock (depth prepass + `equal` shading pass, triplanar detail normals from the baked texture, baked
  crystal light, caustic lines) and crystals (one hex-prism mesh for amethyst points and selenite beams; the fragment
  shader refracts the view ray, walks it through the hexagonal cross-section to the exit facet and builds inner glow,
  back edges, veils, bevels, dispersion fringes and facet flashes from that).
- `fx.wgsl` — pool water (planar reflection rendered in `computeBefore` with `MIRROR = 1` pipelines into a small target,
  drop ripples), falling drops, analytic moonlight shaft, soft additive light pools. `motes*.wgsl` — dust motes.
- `postcard.wgsl` — analytic spawn view (violet hall, beams, amethyst clusters, cyan pool-chamber mouth).

## Tunables
- Layout: `CH`, `TU`, `COLS`, `BEAMS`, `scatter(...)` calls and hero cluster lists in `cave.js`.
- Light strength: `cluster(..., I)` and beam `light(...)` in `cave.js`; ambient in `fsRock` (`amb`).
- Crystal look: `fsCry` (`axial`, `facet`, e0 gains); caustics: `caustic()` and the `ca` weight in the bake.
- Reflection resolution: `RW` in `world.js`; it is rendered only while `poolVis`.

## Known issues
- Light is baked: the "brighten as you approach" effect is a camera-distance boost, not per crystal.
- Reflection pass is skipped when the pool is behind the camera or > 44 m away.
- The player walks on `floorY`; steep bowl walls stop the camera through the SDF, small crystals have no collision.
- Postcard is a stylised approximation of the spawn view.
