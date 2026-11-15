# OtherWorlds — common rules for every world

Read `/core/README.md` first. It is the API contract. Then read your own world prompt (`/prompts/NN-*.md`), which says **what** to build. This file says **how**.

## Scope
- Work **only** inside `/worlds/<your-id>/`. Do not edit `/core`, `/tools` or other worlds; other agents work in parallel. If the core truly blocks you (a bug or a missing hook), write the problem into `/worlds/<your-id>/CORE-REQUESTS.md` and work around it locally if you can.
- Deliver `world.js` (the world module), `postcard.wgsl` (how your world looks through a door from another world) and a short `NOTES.md` (what is where, tunables, known issues).

## Priorities (in this order when they conflict)
1. **Feel and visual quality.** This is an anti-stress app. Slow, soft, open, magical, a little mysterious, never threatening. No jump scares, no fast motion near the camera, no harsh flicker, no loud or sudden sounds. Non-realistic, saturated, dreamy colors are welcome when the world prompt asks for them.
2. **Stable frame pacing** on the target hardware (perf gate below).
3. **Small size.** Soft budget ≤ 150 KB for the built world.

## Hard constraints (same as core)
Raw WebGPU, WGSL and Web Audio only, with no engines. Everything procedural, with no texture, model or sound files. Zero per-frame JS allocations. Generate heavy content on the GPU at load time when possible.

## Make it alive, not crowded
Every world has slow ambient life: something drifts, sways, breathes, glows or migrates. Keep the density calm. One beautiful creature passing slowly beats fifty frantic ones. Use curl noise, boids with low speeds and long smoothing, and gentle phase-shifted oscillations. Avoid anything perfectly periodic that the eye can lock onto; layer two or three incommensurate frequencies.

## Sound
Every world has a generative soundscape built with core audio helpers: a base bed (drone or noise), a mid layer (pads, wind, water) and sparse events (calls, chimes, chirps) at random intervals. It stays quiet and warm, with nothing above the bed by more than about 6 dB. It must loop forever without audible repetition.

## Doors
Place the door(s) given in your world prompt. A door must be easy to find from the spawn area but not right in the face of the player at arrival: the player spawns facing away from it, within roughly 15–40 m. Each door stands in a pleasant open spot. Make sure your `sdf` and terrain do not intersect the doorway.

## Postcard (`postcard.wgsl`)
A cheap, single-function shader (see README for the exact signature) that conveys your world's identity when seen through a door elsewhere: its sky, horizon, palette and one or two signature elements (e.g. a whale silhouette, a moon). It runs in other worlds' frame budgets, so keep it cheap (aim for < 0.3 ms at 1080p for a door-sized area), and do not raymarch heavily.

## Verification — you are not done until both gates pass
1. **Visual critic.** Run `node tools/shoot.mjs <id>` and look at the 6 poses, the motion frames and the contact sheet yourself. Fix obvious problems: banding, aliasing, shimmer, popping, overexposure, mud, empty or boring framing, anything that breaks the mood. When you think it is good, **stop and report** with the shots path. The orchestrator then runs an independent critic that sees only the renders, and sends you its defect list. Iterate until the critic reports nothing above "minor".
2. **Performance.** `node tools/perf.mjs <id> --quality medium` on the shared AMD iGPU: **avg GPU ≤ 12 ms, p99 ≤ 16.7 ms** at 1920×1080 output (dynamic resolution floor 0.6). The perf tool takes a lock, so wait for it and do not run your own benchmarks in parallel. Also sanity-check `--quality low`. High should be visibly richer, but it is not gated here.

## Report when you stop
Paths to the shots, the perf numbers (avg/p99/max, resolution scale), the bundle size, what you built, and what you would improve next. Keep it short.
