# aurora-fjord — Polárna žiara nad fjordom

A winter night at the head of a narrow fjord: colourful rorbuer on stilts around a cove, a pier, boats, a drying rack,
swaying snowy spruce forest on the slopes, jagged peaks, folding aurora curtains mirrored in still water, soft snowfall.

## Files
- `terrain.js` — pure-JS world: `shore()` (signed shore distance; WGSL twin `shoreD`), `height()`, village layout (`HS` house
  table, lamps, paths, trees, baked footprints), collision (`makeSdf`, water is closed except the pier), the 4 nested terrain
  grids (1/4/16/64 m cells, skirts, per-vertex moon shadow + forest density) and the village map (`buildMap`).
- `geo.js` — meshes. `HOUSE[4]` variants (small/long rorbu, two-storey house, boathouse) with trims, snow blankets, sills,
  chimneys, decks, stilts; `village()` (pier, lamp posts, boats, rack, drifts at the door); `spruce(lod)`.
  `uv.y = material id + fraction` (list at the top of the file), `uv.x` = free parameter (metres / window id*4+u / snow weight).
- `common.wgsl` — bindings (noise, village map, reflection), sky colour, fog, `light()`, `snow()`, `shoreD()`. `MIR` override = -1
  in the mirrored pipelines.
- `scene.wgsl` — terrain, objects (materials + lit windows), window glow quads, spruces (sway), water (planar reflection +
  ice shelf), sky (stars, moon), aurora ribbons.
- `fx.wgsl` — snowfall, chimney smoke + powder falling off boughs, lamp halos, footprint decals.
- `world.js` — module: init, tree LOD binning, reflection pass (`computeBefore`), footprints ring buffer, audio.

## How it works
- **Reflection:** the whole opaque scene is drawn a second time mirrored about y = 0 (`clip()` flips y, cull flipped, fragments
  below the water discarded) into a 960x540 HDR target; the water samples it at the screen uv with ripple offsets.
- **Aurora:** `nRib` instanced strips (320 segments) generated in the vertex shader: a slowly folding path at ~3.2 km altitude,
  rays from stretched noise, brighter where a sheet is seen edge-on. `G.params.x` = activity (also lights snow and fog).
- **Village map** (1024^2 over ±80 m): r warm light pools from lit windows/lamps, g contact shade, b trodden paths, a door spill
  (scaled by the door's `open`). Lit windows per house come from the bit mask in the instance (`b.w`).
- **Trees:** 3 LODs binned per frame on the CPU (horizontal frustum + distance); beyond ~1 km the terrain shader paints forest.
- `G.params`: x aurora activity, y snowfall density, z door open.

## Tunables
`HS` (houses), `LAMPS`, `PATHS`, `HERO_TREES`, `MOON`, tree counts `NT` (terrain.js); `nSnow`, `nRib`, reflection size `RW`
(world.js); aurora shape in `aurP` / `fsAur`; palette in `paint()`.

## Known issues
- The water position is reconstructed from the view ray (interpolating the 80 km quad gave 0.5 m steps).
- Objects have no moon shadow on each other; house/tree shadows on the ground are baked per terrain vertex (1 m).
- Terrain build takes ~2 s of JS at load.
