# jungle — Bioluminescent jungle with a lily lagoon

## Files
- `world.js` — layout, CPU terrain (`terrain()`), placement, lightmap bake, CPU culling, frogs/ripples/palette update, audio.
- `geo.js` — mesh builders (48-byte vertex: pos, nrm, uv, attr). Trees (twisted trunk, buttress fins, branches, leaf clusters, vines),
  fern frond / fan / spiral templates (shaped in the vertex shader), lotus, Victoria pad, koi, frog, mushrooms, fractal shrub.
- `common.wgsl` — world uniforms `U`, baked maps (height, glow lightmap, tileable noise), palette slots, `pulse()` waves, `glowAt()`, `shadeJ()`.
- `opaque.wgsl` — terrain, trees, props, ferns, fans, spirals, pads, lotus, koi, frogs, petals, sky (drawn last, only where depth = 0).
- `fx.wgsl` — water (renderTransparent), deferred mist pass (afterScene, reads depth: height mist + haze + glow scattered from the
  lightmap + analytic moon shafts), additive FX pass with read-only depth (waterfall sheets, spray/mist puffs, spores, fireflies).
- `postcard.wgsl` — spawn view: cliff + waterfall ahead, glowing forest silhouettes, mirror lagoon with lotus glows.

## Layout
Lagoon centre (0, −36), radii 21 × 13. Cliff arcs around the back (≈15 m), waterfall at x = 2.5. Clearing around (0, −4).
Spawn (0, −9) faces the lagoon; door to `sky-mountains` at (9.5, 17), ~27 m behind, next to the glowing path (`PATH`).
Wading: `heightAt` is clamped smoothly at −0.55 in the lagoon; lily pads are walkable (`padsW`). `sdf` = cliff + tree trunks (grid).

## Light / colour
Fog density in `env` is 0 on purpose (the door uses core fog); all fog/mist happens in the deferred mist pass.
4 palette slots (cyan, magenta, violet, lime) rotate over ~14 min (`update`). Every emitter is splatted into a 160² slot-weight
lightmap at load; surfaces, water reflections and mist read it, modulated by `pulse()` (two slow travelling wave fronts).
Touch response: `touch()` brightens plants within ~4 m; ferns unfurl fiddleheads, fans open, spirals uncoil.

## Tunables
`U.misc` = (moon strength, mist density, haze density, glow gain) in init. Counts per quality in init (trees, ferns, fans,
spirals, shrubs, pads, spores, fireflies). Shafts list in init. Post in the module (`exposure 1.35, bloom 0.16`).

## Perf
GPU at scale 1 (Medium, 1080p) ≈ 6–7 ms in probes. CPU frustum/distance culling with 2 LODs per instanced category.

## Known issues / next
Canopy leaves are flat polygons (read as silhouettes). Water has no true reflections (sky + glow lightmap + waterfall streak only).
