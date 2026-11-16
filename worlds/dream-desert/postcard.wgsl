fn postcard(rd: vec3f, t: f32) -> vec3f { return mix(vec3f(0.5, 0.1, 0.2), vec3f(2.0, 1.0, 0.5), max(rd.y, 0.0)); }
