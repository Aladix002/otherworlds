// The deep: siphonophore chains (beads + glowing stem, a slow light pulse running along) and comb jellies.
@group(2) @binding(0) var<storage, read> jel: array<vec4f>;    // comb jellies: pos, scale
override NBD: u32 = 70u;
const CH = array<vec4f, 5>(vec4f(-6.0, -91.0, -272.0, 0.0), vec4f(14.0, -87.0, -292.0, 1.0), vec4f(-30.0, -78.0, -238.0, 2.0),
                           vec4f(35.0, -99.0, -262.0, 0.0), vec4f(2.0, -68.0, -212.0, 1.0));
fn chainHead(c: u32, t: f32) -> vec3f {
  let C = CH[c]; let f = f32(c) * 1.7;
  return C.xyz + vec3f(9.0 * sin(t * 0.021 + f), 2.5 * sin(t * 0.033 + f * 2.0), 7.0 * sin(t * 0.017 + f * 0.7 + 1.0));
}
fn hue(c: f32) -> vec3f {
  return select(select(vec3f(0.15, 0.85, 1.0), vec3f(0.6, 0.4, 1.0), c > 0.5), vec3f(0.25, 1.0, 0.55), c > 1.5);
}
struct VO { @builtin(position) pos: vec4f, @location(0) c: vec2f, @location(1) col: vec3f, @location(2) @interpolate(flat) kind: f32 };
@vertex fn vsChain(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VO {
  var cs = array<vec2f, 6>(vec2f(-1, -1), vec2f(1, -1), vec2f(-1, 1), vec2f(-1, 1), vec2f(1, -1), vec2f(1, 1));
  let c = ii / NBD; let k = ii % NBD; let fk = f32(k);
  let t = G.time;
  let lag = 0.85;
  let sag = vec3f(0.0, -0.004 * fk * fk * 0.05, 0.0);
  let p = chainHead(c, t - fk * lag) + vec3f(0.12 * sin(t * 0.5 + fk * 0.4), 0.0, 0.0) + sag;
  let pp = chainHead(c, t - (fk - 1.0) * lag) + vec3f(0.12 * sin(t * 0.5 + (fk - 1.0) * 0.4), 0.0, 0.0) + vec3f(0.0, -0.004 * (fk - 1.0) * (fk - 1.0) * 0.05, 0.0);
  let cc = cs[vi % 6u];
  var o: VO;
  o.c = cc;
  let d = distance(p, G.camPos);
  let fade = (1.0 - fogF(d) * 0.85) * uss(0.5, 2.0, d);
  let pulse = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(t * 0.7 - fk * 0.18 + f32(c)), 4.0);
  let col = hue(CH[c].w);
  if (vi < 6u) {
    let bell = step(fk, 5.5);
    let sz = mix(select(0.045, 0.09, k % 3u == 0u), 0.16 - fk * 0.01, bell);
    o.pos = G.viewProj * vec4f(billboard(p, cc, vec2f(sz + d * 0.0015)), 1.0);
    o.col = mix(col * pulse * 1.6, col * 0.3 + vec3f(0.06), bell) * fade;
    o.kind = bell;
  } else {
    // stem segment to the previous bead
    let seg = pp - p;
    let side = normalize(cross(seg, G.camPos - p) + vec3f(1e-5, 0.0, 0.0)) * (0.012 + d * 0.0012);
    let w = p + seg * (cc.y * 0.5 + 0.5) + side * cc.x;
    o.pos = G.viewProj * vec4f(w, 1.0);
    o.col = col * 0.35 * pulse * fade * step(0.5, fk);
    o.kind = 2.0;
  }
  return o;
}
@fragment fn fsGlow(in: VO) -> @location(0) vec4f {
  var a: f32;
  if (in.kind > 1.5) { a = 1.0 - in.c.x * in.c.x; }
  else {
    let r2 = dot(in.c, in.c);
    if (in.kind > 0.5) { let r = sqrt(r2); a = smoothstep(1.0, 0.6, r) * (0.3 + 0.4 * smoothstep(0.3, 0.8, r)); }
    else { a = exp(-r2 * 5.0) + exp(-r2 * 40.0); }
  }
  return vec4f(in.col * a, 0.0);
}

// comb jellies (mesh: unit ovoid, additive)
struct JO { @builtin(position) pos: vec4f, @location(0) lp: vec3f, @location(1) n: vec3f, @location(2) w: vec3f, @location(3) @interpolate(flat) id: f32 };
@vertex fn vsJelly(@location(0) p: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f, @builtin(instance_index) ii: u32) -> JO {
  let J = jel[ii]; let t = G.time; let f = f32(ii) * 2.1;
  let c = J.xyz + vec3f(1.2 * sin(t * 0.05 + f), 0.6 * sin(t * 0.09 + f * 1.3), 1.0 * sin(t * 0.04 + f * 0.7));
  let R = rotY(t * 0.05 + f) * rotX(0.3 * sin(t * 0.07 + f));
  var o: JO;
  o.w = c + R * (p * J.w); o.n = R * n; o.lp = p; o.id = f32(ii);
  o.pos = G.viewProj * vec4f(o.w, 1.0);
  return o;
}
@fragment fn fsJelly(in: JO) -> @location(0) vec4f {
  let v = normalize(G.camPos - in.w);
  let fres = pow(1.0 - abs(dot(normalize(in.n), v)), 2.5);
  let ang = atan2(in.lp.z, in.lp.x);
  let row = abs(fract(ang / TAU * 8.0) - 0.5);
  let y = in.lp.y;
  let mask = smoothstep(0.045, 0.015, row) * smoothstep(1.0, 0.5, abs(y)) * (0.4 + 0.6 * smoothstep(0.2, 0.6, abs(fract(y * 9.0) - 0.5) * 2.0));
  let wave = 0.5 + 0.5 * sin(y * 14.0 - G.time * 2.2 + in.id);
  let rb = hsv2rgb(vec3f(fract(y * 0.5 - G.time * 0.1 + in.id * 0.3), 0.65, 1.0));
  let d = distance(in.w, G.camPos);
  let fade = (1.0 - fogF(d) * 0.8);
  let body = vec3f(0.05, 0.12, 0.2) * fres + vec3f(0.06, 0.04, 0.1) * smoothstep(0.6, 0.0, length(in.lp)) ;
  return vec4f((body + rb * mask * (0.15 + 1.1 * wave * wave)) * fade * 0.8, 0.0);
}
