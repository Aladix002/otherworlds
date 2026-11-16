// one-time bake of the night sky (equirect, upper hemisphere; row 0 = zenith): gradient, afterglow, a saturated Milky Way
struct VO { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) vi: u32) -> VO { var o: VO; o.pos = fsPos(vi); o.uv = fsUV(vi); return o; }
@fragment fn fs(in: VO) -> @location(0) vec4f {
  let az = (in.uv.x - 0.5) * TAU; let el = (1.0 - in.uv.y) * PI * 0.5;
  let rd = vec3f(sin(az) * cos(el), sin(el), -cos(az) * cos(el));
  let sy = sin(el);
  var c = mix(HORIZ, vec3f(0.006, 0.006, 0.028), pow(sy, 0.42));
  c += vec3f(0.05, 0.012, 0.055) * exp(-el * 6.0) * (0.6 + 0.4 * cos(az));     // magenta afterglow, strongest to the north
  c += vec3f(0.0, 0.02, 0.022) * exp(-pow((el - 0.2) / 0.12, 2.0));            // a thread of teal airglow
  // galactic frame: the band rises from the northern horizon and passes near the zenith
  let P = vec3f(0.894, -0.447, 0.0); let A = vec3f(0.0, 0.0, 1.0); let B = vec3f(-0.447, -0.894, 0.0);
  let d = dot(rd, P);
  let lon = atan2(dot(rd, B), dot(rd, A));
  let wq = rd * 3.2 + 0.35 * vec3f(fbm3(rd * 2.1 + 4.0, 3), fbm3(rd * 2.1 + 9.0, 3), fbm3(rd * 2.1 - 5.0, 3));
  let n1 = fbm3(wq * 1.6, 6) * 0.5 + 0.5;
  let n2 = fbm3(wq * 3.4 + 17.0, 6) * 0.5 + 0.5;
  let n3 = fbm3(wq * 2.2 - 11.0, 4) * 0.5 + 0.5;
  let dl0 = abs(lon + 2.53); let dlw = min(dl0, TAU - dl0);
  let core = exp(-pow(dlw / 0.85, 2.0));
  let wdt = 0.14 + 0.09 * core + 0.06 * (n1 - 0.5);
  let band = exp(-d * d / (2.0 * wdt * wdt));
  var mw = band * (0.3 + 1.0 * n1 * n1) * (0.75 + 1.1 * core);
  let rift = smoothstep(0.4, 0.68, n2) * exp(-pow((d + 0.03 * (n1 - 0.5)) / 0.055, 2.0));
  mw *= 1.0 - 0.85 * rift;
  var mc = mix(vec3f(0.2, 0.32, 1.0), vec3f(1.0, 0.55, 0.3), clamp(core * 0.9 + band * 0.25 - 0.2 + 0.5 * (n2 - 0.5), 0.0, 1.0));
  // dream colours: magenta and teal nebula clouds clinging to the band
  let neb = exp(-d * d / 0.09);
  mc = mix(mc, vec3f(1.0, 0.06, 0.5), smoothstep(0.5, 0.75, n3) * 0.8); mc = mix(mc, vec3f(0.0, 0.8, 0.75), smoothstep(0.52, 0.8, 1.0 - n3) * 0.75);
  c += mc * mw * 0.62 * smoothstep(0.0, 0.22, sy);
  c += (vec3f(0.9, 0.08, 0.45) * smoothstep(0.55, 0.9, n3) + vec3f(0.0, 0.5, 0.55) * smoothstep(0.6, 0.9, 1.0 - n3) * 0.6) * neb * 0.03 * smoothstep(0.0, 0.3, sy);
  // unresolved star dust
  c += vec3f(0.5, 0.55, 0.95) * 0.005 * (fbm3(rd * 9.0, 4) * 0.5 + 0.5) * smoothstep(0.0, 0.3, sy);
  return vec4f(c, 1.0);
}
