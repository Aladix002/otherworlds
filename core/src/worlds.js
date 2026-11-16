// The ring of worlds (order from /SVETY.md). Door default: each world -> next.
export const WORLDS = [
  ['astral-ocean', 'Astral Ocean'],
  ['underwater', 'Underwater World'],
  ['jungle', 'Bioluminescent Jungle'],
  ['sky-mountains', 'Floating Mountains'],
  ['moon-sea', 'Moon Mirror Sea'],
  ['aurora-fjord', 'Aurora Fjord'],
  ['crystal-cave', 'Crystal Cave'],
  ['spirit-forest', 'Firefly Spirit Forest'],
  ['meadow', 'Enchanted Meadow'],
  ['dream-desert', 'Dream Desert'],
  ['light-library', 'Sanctuary of Light and Books'],
  ['turtle-island', 'Turtle Island'],
].map(([id, title]) => ({ id, title }));
export const nextWorld = (id) => { const i = WORLDS.findIndex((w) => w.id === id); return i < 0 ? WORLDS[0].id : WORLDS[(i + 1) % WORLDS.length].id; };

// Release builds (tools/release.mjs) inject __OW_RELEASED__ = [ids]. Dev builds: null = every world is open.
export const RELEASED = typeof __OW_RELEASED__ !== 'undefined' ? __OW_RELEASED__ : null;
export const isOpen = (id) => !RELEASED || RELEASED.includes(id);
// Door target in a release: the intended world if it's published, else the next published one along the ring.
export const resolveTarget = (from, to) => {
  if (isOpen(to)) return to;
  let i = WORLDS.findIndex((w) => w.id === to);
  for (let k = 0; k < WORLDS.length && i >= 0; k++) { i = (i + 1) % WORLDS.length; if (isOpen(WORLDS[i].id)) return WORLDS[i].id; }
  return from;
};
export const titleOf = (id, fallback) => (WORLDS.find((w) => w.id === id) || {}).title || fallback || id;
