// pixel footprint (world meters per pixel) at distance d
fn aoPix(d: f32) -> f32 { return d * 2.0 * G.tanHalfFov / G.resolution.y; }

fn aoCorner(vi: u32) -> vec2f {
  var cs = array<vec2f, 6>(vec2f(-1, -1), vec2f(1, -1), vec2f(-1, 1), vec2f(-1, 1), vec2f(1, -1), vec2f(1, 1));
  return cs[vi % 6u];
}
