# underwater — Podmorský svet

One continuous dive along -Z: turquoise shallows with a sunken Doric temple (z ≈ 30…130, 6–14 m) → golden kelp
shelf (z ≈ -10…-140, 20–36 m) → a shelf drop-off wall (z ≈ -140…-170) → the bioluminescent deep floor (≈ -110 m).
Water surface is y = 0. Spawn (2, -6.5, 80) faces the temple; the jungle door stands in a ruined gateway (two
columns on plinths, flagstones, wall stubs, rubble, amphorae) at (14, seabed, 104), behind the spawn, and looks
back toward the temple. A boulder shore rises to the surface behind it (z > 106).

## Files
- `world.js` — config, terrain CPU twin (`rawH`, must match `terrainH` in common.wgsl), init, per-frame env/exposure/bloom,
  kelp placement + CPU culling, generated WGSL for the analytic column / entablature shadows and sand contact shade
  (`colShadow`, `sandAO`), audio.
- `common.wgsl` — prepended to every scene shader: terrain function, depth light model (`lightAt`, `waterAt`,
  `causAmt`), fog (`uwFog`, `fogF`; `G.params` = density, max distance, deepness, kelpness), caustics, `uwLit`
  (warm sun + cool water ambient from above + sand bounce from below). `SUN` points toward +x/+z so the temple is side-lit.
- `gen.wgsl` — load-time tileable caustic (rgb chromatic) and fbm noise textures + mip chain (compute).
- `bg.wgsl` — open water, Snell's window surface with ripples (rolled off, never clips), far light streaks.
- `terrain.wgsl` — GPU-generated 256×440 grid; sand ripples (fwidth-faded), zone materials, kelp dapple, contact shade.
- `temple.js` / `temple.wgsl` — one merged static mesh: stylobate, 160-segment fluted columns (chunky fractures on the
  broken ones), entablature with a painted Greek-key band (procedural, material 2), triglyphs, pediment with relief
  medallion / rosettes / acroteria, cella walls, fallen drums and blocks, a kore statue on a pedestal + a fallen one,
  amphorae, starfish, the gateway. Vertex AO is baked from the colliders into `uv.x` (material + ao * 0.9), `uv.y` =
  height above the seabed (algae-stained base band).
- `kelp.wgsl` — parameter mesh (stipe + 1 ruffled 3-wide blade per node) instanced per stipe; S-bent stipes, plants
  longer than the water column trail under the surface as a canopy; translucent backlit blades with midrib / veins;
  sub-pixel parts fade into the fog instead of aliasing.
- `scatter.js` / `flora.wgsl` / `rock.wgsl` — rocks, clumped seagrass, anemones, sea whips, glowing sea pens.
- `fish.wgsl` — boid schools (ping-pong compute); per-fish size / hue variation, loose reef schools vs tight sardines.
- `critters.js` / `critter.wgsl` — turtles (one passes the hero view), stingray gliding by the temple steps, manta pair
  (swept wings from `wing()`, countershading, rim), a whale and calf circling between the drop-off and the deep.
- `deep.wgsl` — siphonophore chains (bells, beads with halos, tentacle curtain, running pulse) and comb jellies
  (glassy fresnel body, rainbow waves travelling along the comb rows).
- `shafts.wgsl` — many thin god-ray blades wrapped around the camera; `motes.wgsl` — marine snow / plankton + bubbles.
- `postcard.wgsl` — spawn view as a soft impression (water, surface, sand caustics, a pale hazy hint of the temple).

## Variety and life pass (places, creatures, discoveries)
- **Shallows / temple**: a dolphin pod (2 adults + calf) rolls along under the surface in a wide loop over the temple and
  spawn; an octopus sits on the stylobate between the front columns and washes through coral / violet / teal / pale
  colours (shifts when the swimmer is near); a moray peeks from a big broken pithos at (-4.5, 68.5) and shrinks back when
  approached; five seahorses hover in a guaranteed seagrass meadow at (-20, 72); a turtle sleeps beside a nest of eggs in
  a stone ring at (22, 74) and hatchlings paddle from it up toward the light. The turtle is rebuilt (domed carapace,
  flat plastron, head, eyes, tapered flippers); the kore has a face (`head()` in temple.js).
- **Tholos** (new place, (-26, 6), on the way to the kelp): round stepped base, three standing columns with lintels,
  broken stubs, an altar basin with a pearl that glows brighter as you approach (material 4), a school of jacks circling
  it (fish species 6), lyre-like plucks (positional). Its columns use their own range in the analytic shadow loop (`NT`).
- **Kelp**: understory fronds in red / purple / gold / green (flora type 4), barrel sponges and coral heads (rock flag 2),
  turf and shell grit on the floor, a colossal marble head resting in the manta clearing (18, -77); manta wings now bend
  progressively with lagging, curling tips.
- **Deep**: a giant medusa (bell, oral arms, camera-facing tentacles; `vsMed` / `fsMed` in deep.wgsl, instances appended to
  the comb-jelly buffer) at `MED`, small medusae along the drop-off, three lantern fish (`LAN` homes) that turn toward
  the swimmer and brighten their lure.
- Critter instance table (25): see the comment above `animate()` in critters.js. `kind` carries a 0..0.45 fraction used
  as a per-creature reaction value (lure glow, octopus flush).
- Positional sounds: tholos lyre, dolphin whistles + clicks (bus follows the pod), lantern-fish chimes, medusa bell,
  moray bubbles.

## Tunables
- Light/fog by depth: `lightAt` / `waterAt` in common.wgsl (+ JS twins `lightAt`, `WCOL`, `KCOL`), fog in `update()`.
  Kelpness (amber-green water) depends on camera z and depth.
- Exposure / bloom by depth: `update()` (0.74 shallow → 2.6 deep; bloom 0.1 → 0.3).
- Counts per quality: kelp clusters, seagrass, rocks, fish schools (`SC`), motes, shafts in `init`.
- Creature paths and timing: `animate()` in critters.js. Poses 3–5 use their own `t` so the manta / whales are in frame;
  the fly-through tail is tuned so 82 % lands in the deep creature cluster.

## Known issues / ideas
- Shadows are analytic (columns + front entablature only); statues and blocks get contact shade but cast no shadow.
- The faces (kore, colossal head) are assembled from ellipsoids: archaic and stylised, readable but not sculpted.
- Bundle: the world's own share grew by ~14 KB in the variety pass; the built file is ~203 KB because every world's
  postcard is inlined and those grew a lot (a `_test` build alone is ~126 KB now).
