# moon-sea — Moon Mirror Sea

Walk on a few centimetres of still water under a huge moon. Spawn at the origin facing −Z (the moon). The door to
`aurora-fjord` stands in the shallows 25 m behind the spawn, marked by two floating lanterns.

## Files
- `world.js` — layout constants (top of file), CPU terrain (`terrain`, `shoreS`), mesh builders (sand grids, tree, grass),
  instance data (rocks, lanterns, stars), pipelines, the reflection pass, footsteps, audio.
- `common.wgsl` — uniform block `MU`, `sky()` (baked dome + moon + meteor), lantern kinematics `lanternAt`, lamp light.
- `bake.wgsl` — one-time bakes: sky dome (2048×640 equirect of the upper hemisphere: gradient, airglow, Milky Way,
  cirrus, moon halo) and the moon disc (768², maria, craters, rays).
- `sky.wgsl` — dome + star sprites (round gaussians, ≥ ~2 px, power-law brightness, hidden behind the moon).
- `scene.wgsl` — sand, rocks, tree, leaves, lanterns, glows, light pools, dune grass.
- `life.wgsl` — fish pods and the turtle (flat sprites on the water), fireflies, the lighthouse and its beams, the whale fluke.
- `water.wgsl` — the mirror. `postcard.wgsl` — the spawn view, analytic.

## How the mirror works
`computeBefore` renders the scene mirrored about y = 0 with the **main** camera (override `MIR = -1` flips world y in the
vertex shaders, fragments below the water are discarded) into `rtex` (scale `rs` = 0.5 / 0.75 / 1 by quality, scissored
to the rows below the horizon). The texture is therefore screen-aligned: the water samples it at the projection of its
mirrored reflection vector, so a flat surface is an exact mirror and ripples only shift the lookup. Slope amplitudes are
limited by `lim` (∝ eye height / distance²) so reflections never shred at grazing angles. The core draws the door, so its
reflection is traced analytically in `doorRefl` (posts, lintel, swinging leaf).

## Round-1 critic changes
- The moon is a screen-space disc (`sky()` in common.wgsl): it stays round off-axis and in the mirror; fov is 58.
- Moon bake has a crater height field with relief shading (`moonH`), stronger limb darkening, no thin ray spokes.
- Light pools only under lanterns that have left the water; the lamp-lit seabed is weak, so floating lanterns show a
  symmetric glow + reflection instead of a flat tint.
- Rings are capillary (short wavelength, noisy fronts); the door sheds one wave train from its threshold.
- Milky Way pole moved so the band no longer rises through the moon; longitude wrap fixed (no straight edge).

## Variety and life pass
Places (constants at the top of world.js): the spawn mirror with the lantern launch, the lone-tree sandbar (`TREE`),
the glowing dune shore, the lighthouse islet (`ISL`, 90 m front-left of the spawn: boulders, a striped stone tower with a
lit window, two slow beams, three toro lanterns, a bell buoy sound) and the lotus candle field (`LOTUS`, behind-left of
the spawn, near the door).
- **Floaters** share the lantern instance buffer and `lanternAt` (mode 0 sky lantern, 1 static, 2 paper boat, 3 lotus).
  One vertex stage (`vsLant`) draws four meshes with `firstInstance` ranges; floater meshes carry uv.x = material and
  uv.y = candle light. Lotus flowers are buds from afar and open and brighten within ~12 m. Door lanterns are now toro
  (square paper shades on a float) instead of the vase-like sky-lantern shape.
- **Swimmers** (`vsSwim`, main pass only): 4 fish pods on closed-form Lissajous paths (`PODS`, JS twin `podPath`), fish
  part softly around the walker and fade over the shallows; one turtle drawn as a dark shape with luminous scutes (`TURTLE`).
- **Fireflies** (`vsFly`): tree bar, islet, lotus field, dune grass. Also in the mirror.
- **Whale fluke** (`vsWhale`): every `WHALE_T` = 83 s, 230-310 m out to the front-left, 20 s rise and sink, glowing wake,
  a low call (`update`). Cycle 0 is visible from t = 0 to 20 (poses 1 and 4 use it).
- **Shooting stars** are instanced quads now (`vsMet` in sky.wgsl, no per-pixel cost): one every 31 s, a shower of 7 every 127 s.
- Fixes: moon bake is head-on lit (albedo features, faint relief, ray craters), rocks have chipped facets, strata, patchy
  cracks and lichen (+ a second rougher mesh for big ones), blossoms are quad cards cut to five-petal flowers with cupped
  normals, the hanging lantern keeps the sky-lantern shape.
- Mirror cost: the islet, tower, floaters, fireflies, beams and the whale are in the mirror pass; swimmers are not.
- Big islet boulders (scale > 1) and the tower collide through `sdf`.

## Tunables
- `MOON_EL`, `MOON_R`, `MW_POLE` (world.js) — moon elevation/size, Milky Way orientation. Moon brightness: `sky()` (×1.2).
- `BARS` — sandbars; `ISX/ISZ/ISR` — dune island (also in common.wgsl); `HM` must match `HMAP`.
- Lantern count `nL`, launch area `LAUNCH`, cycle `LT` (common.wgsl, 250 s), wind `WIND`.
- Bioluminescence: `BIO` colour; crests in water.wgsl (`s > -42` block); swash/sparks in `fsTerr`.
- Post: exposure 1.3, bloom threshold 1.7 so only lanterns, surf and the brightest stars bloom (the moon stays below it).

## Known issues / ideas
- Small rocks have no collision. The postcard does not show the lighthouse yet.
- Reflection has no door hardware (hinges) and shows the open doorway as a flat glow.
- Light pools under lanterns are additive decals, not real lighting; sand is lit only by the 3 static lamps.
- The far end of the dune island simply fades into fog; the island cannot be circled (bounds).
