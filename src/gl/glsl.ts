/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */

/** GLSL pieces shared by several shaders. */

/** hash(vec2) in [0, 1): stable across drivers, no trigonometry. */
export const GLSL_HASH = `
float hash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}`;

/** flow(p, t): a divergence-free swirl (the curl of a moving sine
 * potential), roughly unit length. It moves particles and fields without
 * piling them up or tearing holes. */
export const GLSL_FLOW = `
vec2 flow(vec2 p, float t) {
  vec2 a = vec2(
    -1.3 * sin(p.x + t) * sin(p.y * 1.3 - t * 0.8),
    -cos(p.x + t) * cos(p.y * 1.3 - t * 0.8));
  vec2 q = p * 2.1 + 4.0;
  vec2 b = vec2(
    -0.9 * sin(q.x - t * 1.3) * sin(q.y * 0.9 + t),
    -cos(q.x - t * 1.3) * cos(q.y * 0.9 + t));
  return a * 0.7 + b * 0.4;
}`;

/** A soft round point sprite. The vertex shader passes the light in vColor. */
export const POINT_FRAGMENT = `#version 300 es
precision highp float;
in vec4 vColor;
out vec4 o;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = pow(max(0.0, 1.0 - d), 3.0) + smoothstep(0.35, 0.0, d) * 0.6;
  o = vec4(vColor.rgb * a, 0.0);
}`;
