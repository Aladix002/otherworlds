// Core globals, bound by the core at @group(0) @binding(0) in every world pipeline.
// Layout mirrors core/src/main.js (G_* offsets). 128 floats = 512 bytes.
struct Globals {
  viewProj: mat4x4f,
  invViewProj: mat4x4f,
  view: mat4x4f,
  proj: mat4x4f,
  camPos: vec3f, time: f32,
  camFwd: vec3f, dt: f32,
  camRight: vec3f, aspect: f32,
  camUp: vec3f, tanHalfFov: f32,
  resolution: vec2f, invResolution: vec2f,
  sunDir: vec3f, renderScale: f32,
  sunColor: vec3f, frame: f32,
  fogColor: vec3f, fogDensity: f32,
  ambientSky: vec3f, quality: f32,
  ambientGround: vec3f, near: f32,
  params: vec4f,
  params2: vec4f,
  outResolution: vec2f, uvScale: vec2f,
  wallTime: f32, transition: f32, _pad0: f32, _pad1: f32,
};
@group(0) @binding(0) var<uniform> G: Globals;
