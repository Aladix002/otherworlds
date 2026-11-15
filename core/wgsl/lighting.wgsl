// ---- lighting & geometry helpers. These read the core globals G (not available in postcards). ----
fn wrapDiffuse(n: vec3f, l: vec3f, w: f32) -> f32 { return max((dot(n, l) + w) / (1.0 + w), 0.0); }
fn hemi(n: vec3f, sky: vec3f, ground: vec3f) -> vec3f { return mix(ground, sky, n.y * 0.5 + 0.5); }
fn fresnelSchlick(cosT: f32, f0: f32) -> f32 { return f0 + (1.0 - f0) * pow(1.0 - clamp(cosT, 0.0, 1.0), 5.0); }
fn specBlinn(n: vec3f, l: vec3f, v: vec3f, shininess: f32) -> f32 { let h = normalize(l + v); return pow(max(dot(n, h), 0.0), shininess) * (shininess + 8.0) / 25.13; }
fn phaseHG(cosT: f32, g: f32) -> f32 { let g2 = g * g; return (1.0 - g2) / (12.566 * pow(max(1.0 + g2 - 2.0 * g * cosT, 1e-4), 1.5)); }

// exponential distance fog toward G.fogColor (density G.fogDensity per meter)
fn fogAmount(dist: f32) -> f32 { return 1.0 - exp(-G.fogDensity * dist); }
fn applyFog(col: vec3f, worldPos: vec3f) -> vec3f { return mix(col, G.fogColor, fogAmount(distance(worldPos, G.camPos))); }
// height fog: density falls off exponentially with height (falloff per meter), integrated along the view ray
fn heightFog(col: vec3f, worldPos: vec3f, density: f32, falloff: f32, fogCol: vec3f) -> vec3f {
  let rd = worldPos - G.camPos; let d = length(rd);
  let k = falloff * rd.y;
  let base = density * exp(-falloff * G.camPos.y) * d;
  let f = select(base * (1.0 - exp(-k)) / k, base, abs(k) < 1e-4);
  return mix(col, fogCol, 1.0 - exp(-f));
}

// Default world lighting: sun (G.sunDir/G.sunColor, wrap diffuse) + hemispherical ambient + fog.
fn lit(albedo: vec3f, n: vec3f, worldPos: vec3f) -> vec3f {
  let sun = G.sunColor * wrapDiffuse(n, G.sunDir, 0.2);
  let amb = hemi(n, G.ambientSky, G.ambientGround);
  return applyFog(albedo * (sun + amb), worldPos);
}
fn litSpec(albedo: vec3f, n: vec3f, worldPos: vec3f, shininess: f32, specAmt: f32) -> vec3f {
  let v = normalize(G.camPos - worldPos);
  let sun = G.sunColor * (wrapDiffuse(n, G.sunDir, 0.2) * albedo + specAmt * specBlinn(n, G.sunDir, v, shininess) * max(dot(n, G.sunDir), 0.0));
  let amb = hemi(n, G.ambientSky, G.ambientGround) * albedo;
  return applyFog(sun + amb, worldPos);
}

// fullscreen triangle: draw(3) with no vertex buffers
fn fsPos(vi: u32) -> vec4f { let uv = vec2f(f32((vi << 1u) & 2u), f32(vi & 2u)); return vec4f(uv * 2.0 - 1.0, 0.0, 1.0); }
fn fsUV(vi: u32) -> vec2f { let uv = vec2f(f32((vi << 1u) & 2u), f32(vi & 2u)); return vec2f(uv.x, 1.0 - uv.y); }
// screen uv (0..1, y down) from @builtin(position) inside the core HDR pass
fn screenUV(fragCoord: vec4f) -> vec2f { return fragCoord.xy * G.invResolution; }
// world-space view ray direction through screen uv (0..1, y down)
fn viewRay(uv: vec2f) -> vec3f {
  let ndc = vec2f(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0);
  return normalize(G.camFwd + ndc.x * G.tanHalfFov * G.aspect * G.camRight + ndc.y * G.tanHalfFov * G.camUp);
}
// linear view distance from a reverse-Z infinite-far depth value (depth 0 = infinity)
fn linearDepth(d: f32) -> f32 { return G.near / max(d, 1e-7); }
// camera-facing quad corner: corner in [-1,1]^2, size = half extents in meters
fn billboard(center: vec3f, corner: vec2f, size: vec2f) -> vec3f { return center + G.camRight * corner.x * size.x + G.camUp * corner.y * size.y; }
// billboard that only rotates around world Y (for upright sprites like grass cards)
fn billboardY(center: vec3f, corner: vec2f, size: vec2f) -> vec3f {
  let r = normalize(vec3f(G.camRight.x, 0.0, G.camRight.z));
  return center + r * corner.x * size.x + vec3f(0.0, corner.y * size.y, 0.0);
}
// fade factor for soft distance culling (1 near, 0 beyond far)
fn distFade(worldPos: vec3f, near: f32, far: f32) -> f32 { return 1.0 - smoothstep(near, far, distance(worldPos, G.camPos)); }
