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
