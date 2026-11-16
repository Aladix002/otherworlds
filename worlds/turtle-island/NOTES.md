# turtle-island — Turtle Island

A volcanic island at dusk that turns out to ride on the back of a colossal sea turtle. Spawn on the black-sand front beach
facing −Z (the sunset and the turtle's head); the door to `astral-ocean` stands 28 m behind the spawn at the jungle edge.

## Places
- **Front beach** (−Z): black sand, hatchlings crawling from a nest to the sea (with tracks), pebbles, leaning palms.
- **Basalt organ** (west end of the beach, `COLS`): ~1500 instanced hex columns stepping up to a cliff.
- **Lava field** (west/south): two rivulets run from the crater to the sea (steam, glowing water), a third dives into a
  lava tube with skylights and ends in a pond beside three **hot springs** (milky turquoise, sinter rims, steam).
- **Shell ledge + tide pools** (east, `TIDE`): exposed scutes of the turtle's shell, pools with crabs and starfish, the
  right front flipper rising beyond.
- **Hut and hammock** (behind the door, `HUT`, `HAM`): a lit fisherman's hut on stilts with shell chimes, a hammock
  between two palms. A palm grove stands on the east beach; palms also climb the jungle slopes.
- **Shrine** (north knoll, `SHRINE`): torii facing the wake, stone lantern, fireflies and crickets.
- **Summit**: breached crater with a crusted lava lake, plume trailing behind the moving island, embers.
- Around: seabirds circling the cone / front beach / head, dolphins leaping ahead-left of the spawn (in the sun
  glitter), a whale spouting on the horizon ahead-right.

## Files
- `terrain.js` — analytic height `raw()` → 449² grid (walk height = bilinear, mesh = same grid), flattened spots, guided
  lava paths, baked mask texture (rgba16f 1024² over ±200 m: lava edge distance, metres along the flow / −1 = hot spring,
  pool edge distance, ground height), per-vertex materials (ao, shell, sand, vegetation).
- `geo.js` — meshes; `uv.y = material id + 0.9·v`, `uv.x` = free parameter. `loft()` builds the flipper, head, creatures.
- `common.wgsl` — bindings, baked-sky lookup, haze/fog, hex scutes, turtle kinematics (`flipM/flipW`, `headW`), `swell()`.
- `bake.wgsl` — one-time dusk dome (2048×512, v = sqrt(dir.y)); also used for every water / wet reflection.
- `scene.wgsl` — sky + stars, terrain, ocean, turtle skin, instanced objects. `fx.wgsl` — stateless billboards.
- `world.js` — detail texture, placement, pipelines, per-frame creature instances, audio.

## How the turtle works
`G.params = (flow metres, stroke phase, head rise, head yaw)`, `G.params2 = (breath, -, whale x, whale z)`.
The island never moves; the ocean detail, foam and swell scroll past by `flow` (speed pulses with each stroke), a wake fans
out behind (+Z), the plume and steam trail backwards. Front flippers (period `STROKE` 14 s) lift like great fins, sweep
back and under, shedding ring waves (`swell`) and churned foam; the head (cycle `HEADT` 80 s, up at t = 0..18) rises,
turns to glance back, breathes out a mist puff and sinks.

## Tunables
`V0` (swim speed), `STROKE`, `HEADT` (world.js); `FP`, `FL`, `HB`, `HL` (common.wgsl); `LAVA`, `HOT`, `TIDE`, `FLATS`
(terrain.js); counts scale with `ctx.q.level` in `init`; post: exposure 1.05, bloom threshold 1.2.

## Critic round 1 changes
Turtle head rebuilt (hooked beak, jaw line, lidded eye, nostril, neck folds, graded scutes, wet band, foam collar);
flipper is an airfoil paddle with a mostly submerged stroke, foam ring and streaming water; scute seams wobble and read
as algae grooves; soft depth-faded shore; V wake, bow wave and flow streaks; taller cone; soil grain everywhere; jungle
palms replace most broadleaf trees; hut/hammock moved into the door sightline; bigger hatchlings, crabs, starfish.

## Known issues
- No planar reflection: the water mirrors the baked sky only (plus a soft dark smear for the head); the island, flippers
  and lava are not reflected (lava adds an under-water glow instead).
- Clouds are baked and static. Columns, hut and shrine lantern collide as simple blobs; palms and trees do not collide.
- Flippers are cut hard at the waterline (foam churn hides most of it). Turtle parts have no shadows (sun has set).
- Crabs and hatchlings are simple meshes; fine at walking distance, toy-like in extreme close-up.
