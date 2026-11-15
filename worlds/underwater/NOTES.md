# underwater — Podmorský svet

One continuous dive along -Z: turquoise shallows with a sunken Doric temple (z ≈ 30…130, 6–14 m) → golden kelp
shelf (z ≈ -10…-140, 20–36 m) → a shelf drop-off wall (z ≈ -140…-170) → the bioluminescent deep floor (≈ -110 m).
Water surface is y = 0. Spawn (2, -6.5, 80) faces the temple; the jungle door stands between two broken gateway
columns at (-3, seabed, 104), behind the spawn.

## Files
- `world.js` — config, terrain CPU twin (`rawH`, must match `terrainH` in common.wgsl), init, per-frame env/exposure,
  kelp CPU culling, audio.
- `common.wgsl` — prepended to every scene shader: terrain function, depth light model (`lightAt`, `waterAt`,
  `causAmt`), fog (`uwFog`, uses `G.params` = density, max distance, deepness, kelpness), caustics, `uwLit`.
- `gen.wgsl` — load-time tileable caustic (rgb chromatic) and fbm noise textures + mip chain (compute).
- `bg.wgsl` — open water, Snell's window surface with ripples, far light streaks. Drawn last among opaques at z = 0.
- `terrain.wgsl` — GPU-generated 256×384 grid; sand ripples (fwidth-faded), zone materials, kelp dapple.
- `temple.js` / `temple.wgsl` — merged static mesh: stylobate, fluted columns (some broken), entablature, pediment,
  cella walls, fallen drums/blocks, statues, amphorae, gateway ruins. Colliders for `sdf` and fish.
- `kelp.wgsl` — parameter mesh (stipe + 2 blades per node) instanced per stipe, swayed in VS, pixel-width clamped.
- `scatter.js` / `flora.wgsl` / `rock.wgsl` — rocks, seagrass tufts, anemones, sea whips, glowing sea pens.
- `fish.wgsl` — boid schools (ping-pong compute) with seabed/temple/column/camera avoidance; 6 species.
- `critters.js` / `critter.wgsl` — turtles, stingray (settles on sand every ~70 s), manta pair loops, whale shark.
- `deep.wgsl` — siphonophore chains (beads trail their head's path) and comb jellies with rainbow comb rows.
- `shafts.wgsl` — god-ray impostors wrapped around the camera; `motes.wgsl` — marine snow / bioluminescent plankton
  (compute) + bubble streams.
- `postcard.wgsl` — spawn view: water gradient, surface, sand caustics, temple facade silhouette.

## Tunables
- Light/fog by depth: `lightAt` / `waterAt` in common.wgsl (+ JS twin `lightAt`, `WCOL`), fog in `update()`.
- Exposure by depth: `update()` (0.95 shallow → 2.6 deep).
- Counts per quality: kelp clusters, seagrass, rocks, fish schools (`SC`), motes, shafts in `init`.

## Known issues / ideas
- No real shadows (temple columns don't shadow the sand); kelp canopy uses a moving noise dapple instead.
- Kelp blades are flat ribbons; very close up they read as low-poly.
