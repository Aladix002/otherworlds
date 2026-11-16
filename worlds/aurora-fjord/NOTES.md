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

## Critic round 1 changes
Lower/pulled-back peaks with altitude snow and triplanar rock, irregular drooping spruce tiers with normal-based snow, round power-law
stars, softer bluish flakes, pink hem + violet tops and per-band fold scales on the aurora (faded edge-on/overhead), sky now drawn
in the mirror pass (it was culled), radial snow mound at the door, boulders + marker posts, wind ridges in the snow normal.

## Variety and life pass
Places (all inside the walk bounds, joined by trodden paths in `PATHS`):
- **Village and pier** — porch canopies, shutters, roof ladders on the houses; three snowmen with sleds (`SNOWMEN`); a tarred **sauna**
  (house variant 4, paint 5) with steam between the west-arm houses; seals on the ice shelf by the pier; a **fishing boat** with a
  lantern and a fisher drifting on the fjord (`boatD`, moved in `update`, lantern = last lamp halo).
- **Forest clearing** (`CLR`, west) — grove of spruces, campfire (flames/sparks = smoke kinds 2/3, light pool in `L.pools`), lean-to,
  log seats, an owl on a post, and the **frozen waterfall** (`icefall`, material 12) on the rock rib (`cliffD`, also in the sdf).
- **View hill** (`KNOLL`, east) — bench, lantern, cairn, a view down the fjord; the **reindeer herd** (`HERD`) grazes below.
- A **fox** trots a closed round at the cove head (`FOXP` -> `loopPath`, position is a function of time minus the time it waited),
  leaving baked paw prints (print yaw + 100 = small print). It stops and watches while the visitor is within ~5 m.
Creatures share one pipeline (`vsLife`, kinds 0 fox, 1 reindeer, 2 seal, 3 owl): body-part id in `uv.x`, palette index in the
fraction of `uv.y` (material 13). Heads turn toward the visitor when close; reindeer lift their heads, seals raise theirs, owls
swivel. Sounds: campfire crackle, owl hoot, a herd bell (all positional).
Also: near spruces are whorls of separate boughs with a ragged needle fringe (discard in `fsTree`), the far terrain level is 32 m
cells (was 64) with gradient-noise crags in the normal.

Polish after the critic: icicle-column waterfall with a foot mound in a rim notch, soft snow mask / green floor / rim light and
per-tree girth and droop on the spruces, a remodelled fox (walk gait, small single-file prints) and owl (facial disc, wings, round
capped posts), a hole in the ice by the sauna (`G.params2.xy`), signpost + woodpile + a third snowman on the way to the view hill,
stockfish on the rack, softer aurora hem and ends, brighter stars, wider campfire light.

## Dream pass (surreal elements)
- **Sky whale** of aurora light circling over the fjord, and small **smoke fish** that the chimney smoke turns into (`vsWh`/`fsWh`,
  one additive pipeline; instance w = 0 is the whale, 1 + seed a fish born at that chimney). Both are mirrored in the water.
- **Ice floes with lit cabins** hanging in the air over the fjord (`L.floes`, sauna-variant instances + `floe()`), bobbing in `update`.
- **A river of light**: the sixth aurora ribbon (`r = 5` in `aurP`) runs low from the shore out along the fjord.
- **The fjord mirrors another sky**: a huge rose moon appears only in the water (`fsWater`).
- **Rising flakes**: every sixth snowflake glows green and drifts upward (`vsSnow`).

## Known issues
- The water position is reconstructed from the view ray (interpolating the 80 km quad gave 0.5 m steps).
- Objects have no moon shadow on each other; house/tree shadows on the ground are baked per terrain vertex (1 m).
- Terrain build takes ~2 s of JS at load.
