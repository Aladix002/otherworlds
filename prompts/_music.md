# OtherWorlds — music identity pass

User feedback: the music of the worlds sounds **almost the same everywhere**. That's true. Every world uses the same recipe:
- a low drone,
- a slow `pad` with 4-note chords every ~20 s,
- random bells from a **pentatonic** scale,
- a 4–7 s reverb.

Goal: **each world gets its own recognizable musical identity**. Someone who walks through a door should *hear* within 10–20 seconds that they are somewhere else. It stays calm, ambient and anti-stress: no drums that drive, no busy melodies, no loud moments. Think "a soundtrack for that place".

## How to make worlds differ (use several at once)
- **Scale or mode and key**: not pentatonic everywhere. Each world has its own (see the table).
- **Signature instrument**: one lead timbre that is clearly this world's.
- **Time feel**:
  - some worlds are free-floating (no pulse),
  - some have a very gentle, slow pulse or ostinato (a repeating soft pattern),
  - at most 2–3 worlds have soft percussion.
- **Melody**: a short recurring **motif** (3–7 notes) that the world plays now and then, with variations and rests. This helps more than anything else to make a place memorable. It is not an endless random note stream.
- **Texture and room**: dry and close versus a huge reverb; bright versus dark; wide versus narrow.
- **Drone and pad**: keep only where they fit. Change their character (tanpura cycle, organ, bowed, choir) or drop them.

## Per-world identity (follow it; refine if something sounds better)
| world | mood | scale / key | signature | time feel |
|---|---|---|---|---|
| astral-ocean | cosmic, vast, weightless | E lydian | whale-song glides (sine with slow pitch bends), shimmering high glassy harmonics; deep sub swell | free, no pulse, very slow |
| underwater | warm, muffled, sunlit water | F# dorian | soft electric-piano (FM tine) through a slowly wobbling lowpass/chorus; bubbly up-arpeggio blips | very slow gentle pulse (~56 bpm) of the e-piano |
| jungle | organic, alive, playful | A mixolydian | wooden marimba/kalimba interlocking ostinato (3 against 4); breathy wooden flute phrases | soft pulse; light shaker or hand drum, very quiet |
| sky-mountains | airy, East Asian, high | D "yo" or "in" scale (Japanese) | koto/guzheng plucks with small pitch bends; breathy shakuhachi long tones; wind chimes | free, phrase-based |
| moon-sea | nocturne, lullaby | C# minor (aeolian) | solo felt-piano lullaby: a simple melody, sparse left hand, 3/4 lilt | slow 3/4, lots of space |
| aurora-fjord | Nordic, cold, solemn | D dorian | bowed low strings (cello and viola: saw, lowpass, vibrato, slow bow attack) in open fifths; distant "ah" choir (formant) | free, long bow phrases |
| crystal-cave | glassy, resonant, deep | whole-tone or C lydian augmented | glass harmonica and singing bowls with beating partials; pitched water drips that form a slow random rhythm | free; drips give an irregular pulse |
| spirit-forest | mysterious, sacred, gentle | D kurd (D A Bb C D E F G A) | handpan (hang): FM or additive with a soft attack; slow frame-drum heartbeat; low humming voices | slow pulse, heartbeat |
| meadow | bright, pastoral, sunny | G major (ionian) | harp arpeggios and a recorder or tin-whistle folk melody | gentle 6/8 lilt; the brightest world |
| dream-desert | Middle Eastern, warm night | D hijaz / phrygian dominant | oud-like plucks with bends and slides; ney flute (breathy, vibrato); tanpura drone cycle (Sa-Pa-Sa-Sa); a very soft darbuka now and then | slow, rubato; soft sparse percussion |
| light-library | sacred, luminous, still | Eb major with suspensions | choir "ooh" chorales (formant pad); celesta or music box; a soft organ undertone; a very long reverb | free, hymn-like chord changes |
| turtle-island | tropical sunset, warm, happy | F major pentatonic plus the 4th | steel pan (FM, bright); ukulele-like soft strums; ocean-wave timing | gentle lilt (~70 bpm), soft shaker |

## Constraints
- **Calm first.** Peaks are soft. The overall loudness of each world must stay close to before; tools/listen.mjs reports RMS and peak. Aim for RMS within ±3 dB of the old world and no limiter pumping.
- **Sparse.** At least 30–50% of the time the music has space (only ambience and drone). The motif appears roughly every 40–90 s, never constantly.
- **Not repetitive over 10 minutes.** Use variation (transposition within the scale, rhythmic displacement, alternate endings), and use rng for choices.
- **Cheap.** Keep the number of live voices modest (≤ about 24 concurrent oscillators plus notes). Stop and disconnect nodes after notes. No per-frame allocations in `update`. Scheduling via `a.every` or timers is fine.
- Keep the existing ambience SFX (water, wind, birds, creatures, positional sounds). Only the *music* layer changes, unless an ambience clashes with the new key.
- Procedural only, Web Audio only, no samples or audio files.
- Bundle ≤ about 205 KB per world in dist/. Smoke test 8/8: `node tools/smoke.mjs <id> --no-build`.
- Work only in your world folders; never edit core or tools (the core agent is the exception).
- Commit only your paths, with the attribution line you were given. Never push.
