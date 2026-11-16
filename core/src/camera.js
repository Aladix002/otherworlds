// Inertial camera with fly / swim / walk movement modes. Allocation-free update.
import { v3, set3, copy3, fwdFromYawPitch, cross3, norm3, damp, clamp, DEG, smoothstep } from './math.js';

const MODES = {
  fly: { speed: 3.2, boost: 2.6, tau: 0.75, look: 0.07 },
  swim: { speed: 2.4, boost: 2.2, tau: 0.95, look: 0.09 },
  walk: { speed: 1.9, boost: 2.0, tau: 0.28, look: 0.06 },
};
const UP = new Float32Array([0, 1, 0]);

export function createCamera(world, mode) {
  const M = MODES[mode] || MODES.fly;
  const cam = {
    mode, pos: v3(), eye: v3(), vel: v3(), yaw: 0, pitch: 0, roll: 0, yawT: 0, pitchT: 0,
    fwd: v3(), right: v3(), up: v3(), fov: (world.fov ?? 62) * DEG, near: world.near ?? 0.05,
    eyeHeight: world.eyeHeight ?? 1.6, radius: world.radius ?? 0.3,
    speed: M.speed * (world.speed ?? 1), boost: M.boost, moving: 0, bob: 0, t: 0,
    frozen: false, // when true (poses / flythrough) physics is skipped and pos/yaw/pitch are used verbatim
  };
  const des = v3(), g = v3(), tmp = v3(), tmp2 = v3();

  cam.basis = () => {
    fwdFromYawPitch(cam.fwd, cam.yaw, cam.pitch);
    norm3(cam.right, cross3(cam.right, cam.fwd, UP));
    cross3(cam.up, cam.right, cam.fwd);
    if (cam.roll) {
      const c = Math.cos(cam.roll), s = Math.sin(cam.roll);
      for (let i = 0; i < 3; i++) { const r = cam.right[i], u = cam.up[i]; cam.right[i] = r * c + u * s; cam.up[i] = u * c - r * s; }
    }
  };
  cam.set = (pos, yaw = 0, pitch = 0) => {
    copy3(cam.pos, pos); cam.yaw = cam.yawT = yaw; cam.pitch = cam.pitchT = pitch; set3(cam.vel, 0, 0, 0); cam.roll = 0;
    copy3(cam.eye, cam.pos); cam.basis();
  };

  function gradient(sdf, p) {
    const e = 0.02;
    g[0] = sdf(p[0] + e, p[1], p[2]) - sdf(p[0] - e, p[1], p[2]);
    g[1] = sdf(p[0], p[1] + e, p[2]) - sdf(p[0], p[1] - e, p[2]);
    g[2] = sdf(p[0], p[1], p[2] + e) - sdf(p[0], p[1], p[2] - e);
    return norm3(g, g);
  }
  function collide(sdf, p, r, horizontal) {
    for (let it = 0; it < 3; it++) {
      const d = sdf(p[0], p[1], p[2]);
      if (d >= r) return;
      gradient(sdf, p);
      if (horizontal) { g[1] = 0; norm3(g, g); }
      const push = r - d;
      p[0] += g[0] * push; p[1] += g[1] * push; p[2] += g[2] * push;
      const vn = cam.vel[0] * g[0] + cam.vel[1] * g[1] + cam.vel[2] * g[2];
      if (vn < 0) { cam.vel[0] -= g[0] * vn; cam.vel[1] -= g[1] * vn; cam.vel[2] -= g[2] * vn; }
    }
  }

  // input: { keys, dx, dy, touches }, opts: { sens, invertY, sdf, heightAt, bounds, upKeyBlocked }
  cam.update = (dt, input, o) => {
    cam.t += dt;
    if (cam.frozen) { copy3(cam.eye, cam.pos); cam.basis(); input.dx = input.dy = 0; return; }
    const k = input.keys;
    // look
    const s = 0.0022 * o.sens;
    cam.yawT -= input.dx * s; cam.pitchT = clamp(cam.pitchT - input.dy * s * (o.invertY ? -1 : 1), -1.5, 1.5);
    input.dx = input.dy = 0;
    const lk = damp(M.look, dt);
    cam.yaw += (cam.yawT - cam.yaw) * lk; cam.pitch += (cam.pitchT - cam.pitch) * lk;
    cam.basis();
    // wish direction
    let f = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
    const r = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
    let u = (k.Space || (k.KeyE && !o.upKeyBlocked) ? 1 : 0) - (k.KeyQ || k.KeyC || k.ControlLeft ? 1 : 0);
    // touch joystick / up-down buttons (see touch.js)
    let r2 = r;
    if (input.joyX || input.joyY) { f -= input.joyY; r2 += input.joyX; }
    if (input.vert) u += input.vert;
    const fast = k.ShiftLeft || k.ShiftRight || input.joyFast;
    const sp = cam.speed * (fast ? cam.boost : 1);
    if (mode === 'walk') {
      const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw);
      set3(des, fx * f + cam.right[0] * r2, 0, fz * f + cam.right[2] * r2);
      u = 0;
    } else {
      set3(des, cam.fwd[0] * f + cam.right[0] * r2, cam.fwd[1] * f + u, cam.fwd[2] * f + cam.right[2] * r2);
    }
    const dl = Math.hypot(des[0], des[1], des[2]);
    if (dl > 1) { des[0] /= dl; des[1] /= dl; des[2] /= dl; }
    des[0] *= sp; des[1] *= sp; des[2] *= sp;
    // soft bounds: fade out the outward wish and push back gently
    const b = o.bounds;
    if (b) {
      if (b.radius !== undefined) {
        const c = b.center || UP; // UP is never used as center when provided
        tmp[0] = cam.pos[0] - (b.center ? c[0] : 0); tmp[1] = mode === 'walk' ? 0 : cam.pos[1] - (b.center ? c[1] : 0); tmp[2] = cam.pos[2] - (b.center ? c[2] : 0);
        const dist = Math.hypot(tmp[0], tmp[1], tmp[2]), over = dist - b.radius;
        if (over > -3 && dist > 1e-3) {
          tmp[0] /= dist; tmp[1] /= dist; tmp[2] /= dist;
          const w = smoothstep(-3, 2, over), out = des[0] * tmp[0] + des[1] * tmp[1] + des[2] * tmp[2];
          if (out > 0) { des[0] -= tmp[0] * out * w; des[1] -= tmp[1] * out * w; des[2] -= tmp[2] * out * w; }
          if (over > 0) { const push = Math.min(over, 4) * 0.9; des[0] -= tmp[0] * push; des[1] -= tmp[1] * push; des[2] -= tmp[2] * push; }
        }
      } else if (b.min && b.max) {
        for (let i = 0; i < 3; i++) {
          if (mode === 'walk' && i === 1) continue;
          const lo = b.min[i] - cam.pos[i], hi = cam.pos[i] - b.max[i];
          if (hi > -3) { const w = smoothstep(-3, 2, hi); if (des[i] > 0) des[i] *= 1 - w; if (hi > 0) des[i] -= Math.min(hi, 4) * 0.9; }
          if (lo > -3) { const w = smoothstep(-3, 2, lo); if (des[i] < 0) des[i] *= 1 - w; if (lo > 0) des[i] += Math.min(lo, 4) * 0.9; }
        }
      }
    }
    // inertia
    const a = damp(M.tau, dt);
    cam.vel[0] += (des[0] - cam.vel[0]) * a; cam.vel[2] += (des[2] - cam.vel[2]) * a;
    if (mode !== 'walk') cam.vel[1] += (des[1] - cam.vel[1]) * a; else cam.vel[1] = 0;
    // swim: gentle buoyancy drift
    if (mode === 'swim') {
      const t = cam.t;
      cam.vel[1] += (Math.sin(t * 0.31) * 0.6 + Math.sin(t * 0.173 + 1.7) * 0.4) * 0.06 * dt;
      cam.vel[0] += Math.sin(t * 0.13 + 0.5) * 0.02 * dt; cam.vel[2] += Math.cos(t * 0.11 + 2.1) * 0.02 * dt;
    }
    cam.pos[0] += cam.vel[0] * dt; cam.pos[1] += cam.vel[1] * dt; cam.pos[2] += cam.vel[2] * dt;
    const hs = Math.hypot(cam.vel[0], cam.vel[2]);
    cam.moving = clamp(Math.hypot(hs, cam.vel[1]) / (cam.speed + 1e-3), 0, 2);
    // ground
    if (o.heightAt) {
      const h = o.heightAt(cam.pos[0], cam.pos[2]);
      if (mode === 'walk') {
        const target = h + cam.eyeHeight, dy = target - cam.pos[1];
        cam.pos[1] += dy * damp(dy > 0 ? 0.14 : 0.09, dt);
        if (cam.pos[1] < h + 0.5) cam.pos[1] = h + 0.5;
      } else {
        const minY = h + Math.max(0.6, cam.radius * 2);
        if (cam.pos[1] < minY) { cam.pos[1] += (minY - cam.pos[1]) * damp(0.12, dt); if (cam.vel[1] < 0) cam.vel[1] *= 0.8; }
      }
    }
    if (o.sdf) {
      collide(o.sdf, cam.pos, cam.radius, mode === 'walk');
      if (mode === 'walk') { // body point near the hips
        copy3(tmp2, cam.pos); tmp2[1] -= cam.eyeHeight * 0.55;
        const before0 = tmp2[0], before2 = tmp2[2];
        collide(o.sdf, tmp2, cam.radius, true);
        cam.pos[0] += tmp2[0] - before0; cam.pos[2] += tmp2[2] - before2;
      }
    }
    // eye = pos + subtle life (walk bob / swim sway)
    copy3(cam.eye, cam.pos);
    if (mode === 'walk') {
      cam.bob += hs * dt * (Math.PI * 2 / 1.5);
      const amp = 0.018 * clamp(hs / cam.speed, 0, 1.5);
      cam.eye[1] += Math.sin(cam.bob * 2) * amp;
      cam.roll = Math.sin(cam.bob) * amp * 0.25;
    } else if (mode === 'swim') {
      const t = cam.t;
      cam.eye[1] += Math.sin(t * 0.47) * 0.05 + Math.sin(t * 0.29 + 1) * 0.03;
      cam.roll = (Math.sin(t * 0.23) * 0.7 + Math.sin(t * 0.37 + 2) * 0.3) * 0.012;
    } else cam.roll = 0;
    cam.basis();
  };
  return cam;
}
