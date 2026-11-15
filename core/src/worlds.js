// The ring of worlds (order from /SVETY.md). Door default: each world -> next.
export const WORLDS = [
  ['astral-ocean', 'Astrálny oceán'],
  ['underwater', 'Podmorský svet'],
  ['jungle', 'Bioluminiscenčná džungľa'],
  ['sky-mountains', 'Lietajúce hory'],
  ['moon-sea', 'Mesačné zrkadlové more'],
  ['aurora-fjord', 'Polárna žiara nad fjordom'],
  ['crystal-cave', 'Kryštálová jaskyňa'],
  ['spirit-forest', 'Duchovný les svetlušiek'],
  ['meadow', 'Čarovná lúka'],
  ['dream-desert', 'Púšť snov'],
  ['light-library', 'Svätyňa svetla a kníh'],
  ['turtle-island', 'Korytnačí ostrov'],
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
