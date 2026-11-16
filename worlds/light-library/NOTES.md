# Sanctuary of Light and Books (`light-library`)

A cross-shaped baroque library drifting in deep space. Walk mode, door -> `turtle-island`.

## Places
- **Nave south** (spawn, +z): Persian-lattice windows, spiral stair (bay 1, west side) to the gallery, writing desk with a
  quill that writes by itself, globe, the door at z = 44 on a rug between two candelabra. The nave continues as 24 bays
  per side into golden haze (soft bounds stop the player at |z| = 47.5).
- **Nave north** (-z): cool blue-green windows, big celestial globe, desks.
- **Crossing**: compass rose floor, star-chart sail vault with an oculus to the galaxy, hanging orrery (sun, 5 planets,
  a moon, ringed planet) that lights the crossing.
- **East transept -> fountain court**: warm windows, rose window on the end wall, archway into a stone court with a glass
  roof, three-tier fountain, trees, ivy.
- **West transept -> reading nook**: violet windows; the last two bays lose the lower bookcases and become a room with a
  great clear window on the galaxy, fireplace, armchairs, rug, desk with a sleeping (breathing, purring) cat, globe.
- **Gallery** (y = 5): L-shaped walkways in all four quadrants, reached by the spiral stair.
- Life: 6 floating books (leave the shelf, open, turn pages, shed glowing letters, return), paper birds (three flocks:
  nave, dome, court), dust motes that light up in the beams, turning globes, orrery, fountain drops, the quill.

## Files
- `layout.js` — plan constants, `heightAt` / `sdf`. Both take the current foot height (`world.foot`, tracked in
  `update`), which is how the gallery level and the 1.5-turn spiral stair work with a 2-D height function.
- `geo.js` — `Geo` builder (quads/boxes/ctx.mesh geos with material ids, mirror and yaw frames), `buildBay` (one 6 m
  hall bay, instanced 60 times; hide-groups switch off the lower block for the nook and one rail segment at the stair),
  `buildStatic` (crossing, stair, end walls, court, nook, furniture), book and quill meshes.
- `common.wgsl` — stained glass (`pane`, `glass`), `sunAt` (analytic sun through the windows: nave, transept, rose,
  court roof), `winEmit` (windows seen along a ray, for floor/gold reflections), sconce + free lights, `sky`, haze.
  `V2/V3/V4/ss` are aliases for `vec2f/vec3f/vec4f/smoothstep` (bundle size).
- `scene.wgsl` — one instanced vertex format and one material switch (`shade`): procedural bookshelves, marble, fresco,
  glass, globes, dome, foliage, rail lattice, water...; floating books (hinged in the vertex shader); paper birds.
- `fx.wgsl` — motes, letters, fountain drops, orrery rings (min pixel width), volumetric beams (half-res march limited
  to the slabs of air each window band can light, composited additively in `afterScene`).
- `postcard.wgsl` — analytic spawn view of the nave.

## Tunables
- Sun: direction drift in `update`, strength `SUNI`, beam density `0.034` in `fsVol`, haze in `haze()`.
- Ambient and arm tints: end of `shade`. Lights: `LD` in `world.js` (8 free lights), sconces in `lamps()`.
- Books: `books()` (row height, widths, sets, leaning, far look). Floating books: `BOOKS` in `world.js`.
- Counts by quality: `nMote`, `nBird`, `nDrop`, `volDiv` in `init`.

## Known issues
- Bundle is a few KB over the 175 KB guide (every world's postcard is inlined into every build).
- Sunlight ignores occluders other than the window walls (no railing or furniture shadows).
- Bookshelves are flat shaded faces; only floating books, piles and desk books are real geometry.
- Railings are zero-thickness lattice cards; court foliage and the cat are simple shapes.
- No collision for small props; the spiral stair collision is a ring with an entry and an exit gap.
