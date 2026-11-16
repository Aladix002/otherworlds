// Open water background, drawn LAST among opaques at depth 0 (only where nothing else was drawn):
// depth-graded water color, wavy surface with Snell's window, distant light streaks.
struct VO { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) vi: u32) -> VO { var o: VO; o.pos = fsPos(vi); o.uv = fsUV(vi); return o; }

const SUNAIR = vec3f(0.559, 0.776, 0.293);

@fragment fn fs(in: VO) -> @location(0) vec4f {
  let rd = viewRay(in.uv);
  var c = uwFogCol(rd, 1e4);
  let cy = G.camPos.y;
  // far light streaks radiating from the refracted sun
  let mu = dot(rd, SUN);
  let pr = rd - SUN * mu;
  let e1 = normalize(cross(SUN, vec3f(0.0, 0.0, 1.0)));
  let ang = atan2(dot(pr, cross(SUN, e1)), dot(pr, e1));
  let st = textureSampleLevel(tNoise, sRep, vec2f(ang * (5.0 / TAU), G.time * 0.004), 1.0).b;
  let sh = 1.0 - G.params.z;
  c += lightAt(cy) * vec3f(0.06, 0.2, 0.2) * smoothstep(0.45, 0.85, st) * pow(max(mu, 0.0), 3.0) * sh * (1.0 - uss(0.97, 1.0, mu));
  if (rd.y > 0.0) {
    let tt = -cy / rd.y;
    if (tt < 200.0) {
      let q = G.camPos.xz + rd.xz * tt;
      let lod = clamp(log2(tt * G.invResolution.y * 2.0 * G.tanHalfFov / max(rd.y, 0.05) * 256.0 * 0.03), 0.0, 8.0);
      let t = G.time;
      let a = textureSampleLevel(tNoise, sRep, q * 0.21 + vec2f(t * 0.03, t * 0.017), lod + 2.8).xy;
      let b = textureSampleLevel(tNoise, sRep, q * vec2f(0.47, -0.43) + vec2f(-t * 0.041, t * 0.029), lod + 4.3).xy;
      let g = ((a - 0.5) * 0.34 + (b - 0.5) * 0.22) * (1.0 - 0.6 * uss(15.0, 90.0, tt));
      let n = normalize(vec3f(g.x, 1.0, g.y));
      // refraction water -> air
      let ci = dot(rd, n);
      let k = 1.0 - 1.769 * (1.0 - ci * ci);
      let rr = normalize(refract(rd, -n, 1.33) + vec3f(0.0, 1e-4, 0.0));
      let sd = max(dot(rr, SUNAIR), 0.0);
      // Snell's window: bright turquoise-white sky with a soft sun glow, rolled off so it never clips flat
      var win = mix(vec3f(0.55, 1.05, 1.2), vec3f(0.4, 0.85, 1.25), clamp(rr.y, 0.0, 1.0)) * 1.25
              + vec3f(1.5, 1.35, 1.0) * (pow(sd, 90.0) * 2.5 + pow(sd, 10.0) * 0.9 + pow(sd, 2.5) * 0.3);
      // a colossal pale moon hangs in the other sky above the stair
      let mn = dot(rr, vec3f(0.32, 0.8, -0.5));
      win = mix(win, vec3f(1.9, 1.8, 1.6), smoothstep(0.9, 0.915, mn)) + vec3f(0.5, 0.45, 0.6) * smoothstep(0.7, 0.92, mn);
      // total internal reflection: mirror of the water below
      let tir = waterAt(cy) * vec3f(0.9, 1.1, 1.1) * (0.6 + 0.6 * (a.y - 0.3));
      let cw = textureSampleLevel(tCaus, sRep, q * 0.09 + g * 0.3 + vec2f(t * 0.01, 0.0), lod + 1.5).g;
      win *= 0.8 + 0.55 * cw * (1.0 - uss(10.0, 60.0, tt));
      win = win / (1.0 + 0.2 * luminance(win));
      var s = mix(tir * (0.85 + 0.5 * cw * (1.0 - uss(10.0, 60.0, tt))), win * exp(cy * vec3f(0.03, 0.012, 0.01)), smoothstep(-0.06, 0.3, k));
      c = mix(s, c, fogF(tt * 0.85));
    }
  }
  return vec4f(c, 1.0);
}
