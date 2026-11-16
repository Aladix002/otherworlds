# OtherWorlds — surreal pass (applies to an existing world)

The user's feedback: some worlds look **too realistic** — like a beautiful real place. OtherWorlds should feel like *other worlds*: **dreamlike and surreal**, while staying calm, soothing and beautiful. Never creepy, never chaotic.

## What "surreal" means here
Gentle impossibilities that make you smile or wonder, mixed into the existing world, not replacing it:
- **Physics bending softly**: things floating that shouldn't (stones, water droplets, houses, columns), waterfalls or snow drifting *upward*, slow orbiting objects, upside-down elements.
- **Impossible scale**: a giant creature of light in the sky, tiny worlds inside bubbles or lanterns, a colossal moon very close.
- **Light as matter**: creatures, rivers or bridges made of light; reflections that show a *different* sky or scene than above.
- **Dream colors**: shift part of the palette away from realism (pastel or iridescent accents, colored shadows, glowing materials), but keep harmony.
- **Living elements that respond**: things that bloom, chime, glow, or turn toward you.

Aim for 4–6 clearly surreal elements, at least one big "wow" visible from the spawn or hero view, plus smaller ones to discover. The world must still read as itself (the fjord is still a fjord) — just a dream version of it.

## Rules (same as always)
- Read `/prompts/_world-template.md` and `/core/README.md`.
- Work only in your world folder; never edit core, tools or other worlds.
- Procedural only, zero per-frame allocations.
- Perf gate: Medium avg ≤ 12 ms, p99 ≤ 16.7 ms, on the shared iGPU with the locking tools.
- Bundle ≤ about 205 KB in dist/.
- Update the poses so at least two show the surreal elements, and route the flythrough through them.
- Keep `node tools/smoke.mjs <id> --no-build` at 8/8 (the door must stay reachable — check your sdf/collision).
- Commit only your paths, with the attribution line you were given. Never push.

## Ideas per world (pick, combine, invent better)
- **aurora-fjord**:
  - aurora ribbons that descend and flow slowly between the houses like luminous rivers,
  - snowflakes that drift upward near the aurora,
  - a giant whale or koi made of aurora light swimming across the sky,
  - the fjord reflecting a *different* sky (a summer sunset or a starfield with a second moon),
  - chimney smoke curling into glowing fish that swim away,
  - small ice floes floating in the air with tiny lit cabins on them.
- **underwater**:
  - marble columns and statue fragments floating upside-down in the water column,
  - a staircase rising from the temple through the surface into a sky,
  - schools of fish made of light or gold leaf,
  - a "sky" below — clouds drifting under the seabed through a rift,
  - bubbles that contain tiny gardens,
  - the temple's reflection on the surface showing it whole and new,
  - giant pastel coral trees.
- **crystal-cave**:
  - crystals floating in mid-air, slowly orbiting a glowing core,
  - a pool that shows a starry sky or a galaxy instead of a reflection,
  - crystals that emit slow color rings when you pass,
  - one chamber upside down (floor crystals on the ceiling, a waterfall falling up),
  - a geode you can step into that contains a tiny nebula,
  - singing crystal "jellyfish" drifting through the air.
- **turtle-island**:
  - smaller turtle-islands drifting in the distant sky,
  - lava that cools into glowing pastel glass,
  - palms with glowing fruit,
  - clouds shaped like slow whales,
  - a second, huge pale moon rising beside the sunset,
  - lanterns or jellyfish rising from the sea into the sky,
  - giant shells on the beach that hum.
- **sky-mountains** (lighter touch; it's already fantastic):
  - a waterfall flowing upward into a cloud,
  - giant koi swimming through the cloud sea,
  - one pillar floating upside down,
  - pastel iridescent mist at sunrise.

## Report
List the surreal elements you added, perf (avg/p99/max, scale), bundle size, the smoke result and the shots path.
