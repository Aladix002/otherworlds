# spirit-forest — Duchovný les svetlušiek (mossy laurel cloud forest at night)

## Files
- `world.js` — layout constants, CPU terrain, placement, baked maps (height + moon map, glow/occlusion lightmap, tileable noise),
  CPU culling with 2 LODs, spirit behaviour (`update`), audio.
- `geo.js` — mesh builders (48-byte vertex: pos, nrm, uv, attr; attr.x = material id, list at the top of the file): gnarled laurel
  and weeping willow (`laurel(seed, lod, kind)`: knobby trunk, snaking roots, limbs + sub-branches, foliage cards, moss beards or
  glowing strands), fern, mycena cluster, shelf fungus, fallen log, tuft, deer spirit, lantern creature.
- `common.wgsl` — uniforms `U` (232 floats, see struct), maps, `pulse()`, `moonVis()`, `dynL()` (16 moving lights, per vertex),
  `shade()`, `glow()` (HDR push).
- `scene.wgsl` — terrain (moss, litter, earth path, foxfire specks, door moss ring / contact shadow / light spill), one instanced
  pipeline for every mesh (`vsObj`/`fsObj`, branch on attr.x), sky dome with a closed canopy and a moon gap.
- `fx.wgsl` — deferred ground mist with lightmap glow scatter and moon shafts (afterScene), spirit beings (depth layer + additive
  shell, drawn in `renderTransparent`), halos, wisps, fireflies with short light trails (additive pass with read-only depth).
- `postcard.wgsl` — the spawn view: path to the glowing willow, side trunks with low limbs, canopy, wisp, fireflies, fungi.

## Layout
Spawn (0, 0) looks north-west along the path (`PATH`) to the hero willow `WIL[0]` (−8, −28). Door to `meadow` at (8, 22), ~23 m
behind the spawn, in a clearing beside the path. Deer loops `LOOPS` (glades at (18, −37) and (−32, −6)); lantern creatures drift
around `lanHome`; wisps hover at `wispHome` and back away when approached; wisp 0 waits ~15 m ahead on the path.
`keep` (init) lists camera spots/routes that stay clear of trunks (poses, fly-through, deer loops, view corridors).

## Light
`env.fogDensity` is 0: all fog comes from the mist pass. Moonlight is modulated by the baked moon map (hmap.g: noise dapples +
`SHAFTS` spots); the same `SHAFTS` drive the volumetric columns. Emitters (fungi, willows) are splatted into the lightmap
(rgb, tone-compressed) and trunk/log/rock occlusion into its alpha. `U.misc` = (moon, mist density, haze density, glow gain).
Post: exposure 1.55, bloom 0.36 / threshold 0.9.

## Spirits
Deer: position is a pure function of time along its loop minus a `lag` that grows while it is watching the visitor (within
~19 m it slows to a stop, turns its head, a chime plays, then it walks on). Head turn and attention are damped in `update`.
Beings are additive shells; a depth-only layer (`fsBeingZ`) hides inner surfaces so only the nearest layer glows.

## Perf (Medium, 1080p)
~6.5–7 ms GPU at scale 1 along the fly-through when the iGPU is free (probe). Counts per quality in `init` (trees, ferns, tufts,
rocks, logs, fireflies). Foliage cards run the leaf pattern only within 16 m; beyond that they are solid with a ragged noise edge.

## Known issues / next
Foliage cards are flat; far crowns read as soft blobs. Deer legs only swing (no real gait). Wisps are billboards.
The door target `meadow` did not exist when this was built (default postcard in the doorway).
