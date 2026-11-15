# 01 · Astrálny oceán — id `astral-ocean`
Movement: `fly` (very slow, floaty; it should feel like drifting in water made of space). Door → `underwater`.

## Mood
You float inside a vast nebula that behaves like an ocean. Enormous translucent whales made of light glide past slowly, trailing stardust. Jellyfish pulse and small shoals of glowing fish flow around you. Everything is slow, weightless and undulating, "realistic" in its motion (real whale and jelly kinematics) but cosmic in its look. The user explicitly wants: other sea creatures that fit (jellyfish, glowing little fish), slow, real-feeling, undulating motion.

## Scene
- **Nebula volume**: layered, colorful gas (violet, magenta, teal, deep blue, warm orange cores) with depth. Fake volumetrics are fine: several large camera-facing noise shells or low-step raymarch at low res plus upsample. Distant bright stars with subtle twinkle, a few galaxies, one huge spiral far away as a landmark.
- **Space whales**: 2–4 at a time, 30–80 m long, translucent bodies with inner glowing veins and constellation-like dots, soft fresnel rim, slowly undulating tail flukes and pectoral fins (skeletal wave along the spine), gentle slow turns on long spline paths. A trail of sparkling dust behind each. One occasionally passes close to the camera (≥ 15 m) — the "wow" moment.
- **Jellyfish**: groups of 10–40, bells pulsing (contract quickly, relax slowly), long trailing tentacles, bioluminescent pink/cyan, drifting upward slowly.
- **Glowing fish shoals**: GPU boids (low speeds, long smoothing), thousands of tiny light points that form flowing ribbons; they part gently around the camera.
- **Drifting particles**: stardust motes for parallax and a sense of motion.
- The door floats on a small rock or crystal "islet" with a soft glow beneath, since there is no ground.

## Light and color
Emissive-dominant scene with heavy but tasteful bloom. Deep blue-black background, never pure black, with dithering. Palette: indigo, violet, magenta, cyan, gold accents. Whales slightly cooler (blue-white) and jellies warmer (pink).

## Sound
Deep warm drone with slow filter movement, a shimmering high pad, and occasional distant whale song (FM/formant glides, long reverb). Soft glassy chimes when jellies pulse nearby.

## Critic poses (suggestions)
Spawn view; a whale passing close in profile; a jellyfish group backlit by a nebula core; a fish shoal ribbon; looking up into a dense nebula; the door islet with the nebula behind.

## Avoid
Hard-edged sprites, obvious billboards, flicker of tiny points (temporal stability!), clipping of whales through the camera, a cartoon look.
