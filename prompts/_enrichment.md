# OtherWorlds — variety & life pass (applies to an existing world)

The user's feedback after trying the first worlds: they are pretty, but some feel **dry, with not much in them** (explicitly: sky-mountains). Every world must offer **variety inside itself**: when you look around or travel 100 m, something new should catch the eye. Worlds must also stay clearly different from each other.

## Goals of this pass
1. **More life and motion.** Add 3–5 new kinds of living or moving things that fit the world. Mix scales: one or two big, slow "wow" creatures, a few mid-size ones, and many tiny ones (insects, motes, petals). Prefer original designs, slow and calm, never threatening.
2. **Distinct sub-areas.** The world should have 3–5 recognizable places with their own character (a landmark, a different palette accent, a different plant or creature mix). Make the journey between them interesting.
3. **Small discoveries.** Things you find when exploring: a hidden pool, a ruin, a nest, a glowing circle of mushrooms, a little shrine, a swing, a bench with a view, wind chimes, a sleeping creature. Some react gently to the player (turn to look, follow a bit, light up, scatter softly and return).
4. **Sound follows variety.** New creatures and places get their own sparse, quiet sounds (positional).
5. **Keep what works.** Don't break the existing look, the door, the postcard, or perf.

## Rules
- Same hard rules as `/prompts/_world-template.md`: procedural only, WebGPU and WGSL, zero per-frame allocations, work only inside your world folder, never edit core/tools/other worlds.
- **Perf gate is unchanged** (Medium 1920×1080: avg ≤ 12 ms, p99 ≤ 16.7 ms on the shared AMD iGPU). New life must be cheap: GPU instancing, compute-driven boids, LODs, distance culling. Use `tools/perf.mjs` and `tools/probe.mjs` (they take a lock) and re-run on contention.
- Bundle ≤ about 175 KB.
- Update `poses` so at least two of the six critic poses show the new variety, and route the flythrough through it.
- UI is English. Titles come from `core/src/worlds.js`.
- Commit only your paths (`git commit -m "..." -- worlds/<id> dist/<id>.html`). End messages with the attribution line you were given. Never push.

## Idea lists per world (pick what fits, invent better ones)
- **astral-ocean**: a pod of small luminous dolphins or rays darting in arcs; drifting space-coral reefs on asteroid chunks; a slow comet with a long tail; a mother and calf whale pair; glowing plankton clouds that swirl when you pass; a ring of floating crystal shards; tiny star-sprites that follow you a little.
- **underwater**: an octopus on the temple steps changing color; seahorses in seagrass; a slow school of jacks circling a column; a sea-turtle nest on the sand; an eel peeking from a broken amphora; dolphins passing high near the surface; a kelp-zone sea otter or seal floating at the surface; in the deep, a giant slow jellyfish and a bioluminescent anglerfish-like (cute, not scary) creature.
- **jungle**: glowing butterflies and moths; a tree-dwelling family of small glowing lemur-like creatures; dragonflies over the lagoon; a hanging vine bridge; a giant glowing flower that opens when you approach; luminous snails on rocks; a hummingbird-like bird that hovers at flowers; a small cave behind the waterfall.
- **sky-mountains** (top priority, the user called it dry): big, gentle **flying creatures** — e.g. sky-mantas or long-finned gliders soaring between pillars; flocks of colorful birds (not just cranes); butterflies and dragonflies around island meadows; floating seed-pods or dandelion-like puffs drifting on the wind; kites or prayer-flag lines between pines; a small pagoda or shrine on a pillar top with wind chimes; a rope bridge between two floating islands; a rainbow in the mist of a waterfall; mountain goats on ledges; a nest with a large bird.
- **moon-sea**: a pod of glowing fish under the mirror surface; a slow sea turtle swimming beneath; floating paper boats with candles; fireflies over the sandbar; a distant lighthouse or small island with a lit hut; shooting-star showers now and then; a gentle whale tail rising far away.
- **aurora-fjord**: arctic foxes or hares crossing the snow; owls on fence posts; seals on the ice shelf; a reindeer herd on a slope; a lit sauna with steam by the water; a tiny fishing boat drifting with a lantern; children's snowmen and sleds by houses.
- **crystal-cave**: glowing cave moths; blind white fish in the pool; crystal "flowers" that chime when you pass; an underground stream; mushrooms in a side grotto; floating light orbs following air currents; a hidden chamber of a different crystal color (green or gold).
- **spirit-forest**, **meadow**, **dream-desert**, **light-library**, **turtle-island**: new or in-progress worlds already target variety. Apply the same thinking if you are enriching them.

## Report
List what you added (by sub-area), perf (avg/p99/max, scale), bundle size, and the shots path.
