# meadow — Čarovná lúka

Walk world. Low golden sun over rolling flower fields, a misty river with two bridges and golden trees, one long wisteria tunnel. Door → `dream-desert`.

## Files
- `layout.js` — terrain function (`hAt`), river curve, paths, bridges, tunnel centreline (`TUN`), colour fields (`FIELDS`, `zone`), tree placement, and `buildMap()` which bakes the CPU/GPU maps: height, flower cover, water/path, sun visibility (hill march + soft blob shadows), colour-field texture.
- `geo.js` — flora meshes with **two poses per vertex** (closed bud / open bloom) built by one `petal()` strip generator; 8 species × 3 LODs (`flower`, `clump`), grass `tuft`; trees and tunnel foliage as a dark core + shell of real leaves (`leafMass`), wisteria `raceme`, `woodwork` (tunnel frame + bridges).
- `common.wgsl` — map sampling, wind `gust()`, sky/haze colours, `atmo()` (aerial haze + height mist), shared `shade()`.
- `scene.wgsl` — sky, terrain (colour field, lavender stripes, path), flora, objects (trees, wood, wisteria), river.
- `fx.wgsl` — seeds/pollen, falling leaves and petals, bees, butterflies, river mist sheets.
- `world.js` — init, per-frame flora binning, draw, audio.

## How the flowers work
World-fixed jittered cells around the camera are walked every frame on the CPU (`update`, allocation-free) and written into per-species / per-LOD instance bins (4 floats each: x, z, accent+seed, scale). Three layers: near flowers (0.34 m cells, to 17 m, LOD0 < 6.5 m), clumps of 4 low-poly flowers (1.02 m cells, to 75 m on Medium), grass tufts. Each instance has its own vanish distance, so layers thin out and cross-fade by scaling instead of popping. Beyond the clumps the terrain shader carries the colour field.
The vertex shader blends bud → bloom by distance to `G.params.xy` (walker position with 0.8 s lag), scales flowers up near the walker, turns spiral blooms, parts stems away from the camera and bends everything with `gust()`.
Lavender fields are planted in rows (cell index modulo) and the terrain draws matching stripes.

## Places and life (variety pass)
- **Poppy field + path** at the spawn; **lavender rows** to the left; **wisteria tunnel** to the right; **river** with two bridges, mist sheets, koi under the bridges (in `fsWater`) and dragonflies; golden trees along the banks.
- **Ring of giant flowers** (`RING`) in the lavender: the normal flower meshes at 6.5x, pushed into the flora bins each frame; they open when you step inside, and chime (spatial bells).
- **Big tree** (`BIGTREE`) near the door with a swing (mat 5, pendulum in `vsObj`), a straw beehive and the bees.
- **Rabbits** (`WARREN`, mat 4) on a grassy patch by the first bridge and near the big tree: they sit up when you come close and hop now and then.
- **Birds** (`FLOCK`) resting on the path fly up and circle when you pass (`G.params.z`, smoothed in `update`), with a soft whoosh.
- Butterflies in four colours, dandelion seeds that scatter away from the walker (`G.params.w`), falling leaves and wisteria petals.

## Tunables
- `FIELDS`, `FT`, `SITES` (layout.js): palette, species mix and where fields lie. `?z=N` forces one field everywhere (debug).
- `flo.rad`, `flo.cell`, `CAP` (world.js): layer radii per quality, cell sizes, bin capacity.
- Bloom radius / growth: `near` in `vsFlora`. Wind: `gust()` and `WD`.
- Mist: `0.02` density and `0.5` falloff in `atmo()`, sheets in `vsMist`.
- Post: ACES, exposure 0.92 (AgX washed the colours out).
- Critic round 1: sun lowered to ~10 degrees with warm key / lavender fill, coral poppies with gold and blue drifts at the spawn, wisteria rebuilt from rounded petals (no cones), leaf-only tunnel roof, leafy far tree LOD, far fields speckled and desaturated, reeds on the banks (grass layer), lily pads, shore fade, sky flock, camera-wrapped butterflies.

## Known issues / next
- Tree crowns are a core + leaf shell; very close the smooth core can show between leaves.
- River surface is simple (noise normals, fake bank reflections), no real reflections.
- Far hills are colour fields only (no geometry flowers beyond ~75 m).
- Flowers outside the baked map (±140 m) are skipped; bounds keep the walker well inside.
