// Plan, walk height and collision of the library. World axes: nave along Z, transept along X, crossing at the origin.
export const HW = 4.5, WX = 7, BAY = 6, GY = 5;
export const NAVE = 24, EAST = 5, WEST = 7;            // bays per arm (west: 5 hall bays + 2 nook bays)
export const STAIR = [-2.62, 16, 1.75];                // spiral stair: centre x, z, outer radius
export const TURN = 3 * Math.PI;                       // 1.5 turns, entry toward +x, exit toward -x (gallery)
export const DOOR = [0, 0, 44];
export const COURT = [47, 0];
// round obstacles on the ground floor: x, z, r
export const OBST = [
  [47, 0, 3.95], [41.5, 6.6, 0.75], [41.5, -6.6, 0.75], [52.5, 6.6, 0.75], [52.5, -6.6, 0.75],      // fountain, trees
  [0, -28, 1.55],                                                                                    // celestial globe
  [3.1, 28, 1.0], [3.1, 29.2, 1.0], [-3.1, 34, 1.0], [-3.1, 35.2, 1.0], [3.2, 21, 0.6],              // desks, globe
  [-3.1, -11.4, 1.0], [-3.1, -12.6, 1.0], [-3.1, -17.4, 1.0], [-3.1, -18.6, 1.0], [-3.1, -23.4, 1.0], [-3.1, -24.6, 1.0], [3.1, -36, 1.0], [3.1, -37.2, 1.0],
  [-20, 3.1, 1.0], [-21.2, 3.1, 1.0], [16, 3.4, 0.5], [16, -3.4, 0.5], [28, 3.4, 0.5], [28, -3.4, 0.5],
  [-44.6, 3.4, 1.0], [-45.6, 3.4, 1.0], [-41.3, -4.2, 0.7], [-44.9, -4.4, 0.7], [-43.1, -4.9, 0.6], [-46.2, -4.6, 0.4], [3.92, 3.92, 0.4], [-3.92, 3.92, 0.4], [3.92, -3.92, 0.4], [-3.92, -3.92, 0.4], [-3.9, 21.7, 0.5], [-47.6, 4.6, 0.5],
  [1.7, 44, 0.3], [-1.7, 44, 0.3],
];
const box = (x, z, x0, x1, z0, z1) => Math.max(Math.max(x0 - x, x - x1), Math.max(z0 - z, z - z1));   // 2-D box sdf (negative inside)

// helix height for a point inside the stair cylinder, choosing the turn closest to the current foot height
export function stairH(dx, dz, foot) {
  let th = Math.atan2(dz, dx); if (th < -0.6) th += 2 * Math.PI;
  const h = (a) => GY * Math.min(Math.max((a - 0.3) / (TURN - 0.6), 0), 1);
  const a = h(th), b = th + 2 * Math.PI <= TURN + 0.5 ? h(th + 2 * Math.PI) : a;
  return Math.abs(a - foot) <= Math.abs(b - foot) ? a : b;
}
export function onGallery(x, z) {
  const ax = Math.abs(x), az = Math.abs(z);
  return (ax >= 4.25 && ax <= WX && az >= 4.25) || (az >= 4.25 && az <= WX && ax >= 4.25 && ax <= 37);
}
export function heightAt(x, z, foot) {
  const dx = x - STAIR[0], dz = z - STAIR[1];
  if (dx * dx + dz * dz < STAIR[2] * STAIR[2]) return stairH(dx, dz, foot);
  return foot > 2.5 && onGallery(x, z) ? GY : 0;
}
// positive in free space
export function sdf(x, y, z, foot) {
  const ax = Math.abs(x), az = Math.abs(z);
  let d;
  if (foot > 2.5) {       // gallery level: the two strips of each L
    d = -Math.min(box(ax, az, 4.42, 6.85, 4.42, 200), box(ax, az, 4.42, 36.8, 4.42, 6.85));
  } else {                // ground: nave corridor, transept corridor, nook, court
    d = -Math.min(box(x, z, -HW, HW, -200, 200), box(x, z, -37.5, 38, -HW, HW), box(x, z, -48.4, -37, -6.8, 6.8), box(x, z, 37.4, 56.6, -9.6, 9.6));
    for (let i = 0; i < OBST.length; i++) { const o = OBST[i]; d = Math.min(d, Math.hypot(x - o[0], z - o[1]) - o[2]); }
  }
  // spiral stair: free inside the ring; the ring wall has a gap at the bottom (+x) and at the top (-x)
  const dx = x - STAIR[0], dz = z - STAIR[1], r = Math.hypot(dx, dz), R = STAIR[2];
  if (r < R + 0.5) {
    const th = Math.atan2(dz, dx);
    const gap = foot < 0.9 ? (th > -0.25 && th < 0.75) : foot > 4.3 ? Math.abs(th) > 2.7 : false;
    if (gap) d = Math.max(d, 0.35);
    else d = r < R ? R - r : Math.min(d, r - R);
    d = Math.min(d, r - 0.3);
  }
  return d;
}
