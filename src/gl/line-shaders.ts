/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */

/** Positions arrive in CSS pixels with the origin at the top left, the same
 * space the 2d stage draws in. */
export const LINE_VERTEX = `#version 300 es
layout(location = 0) in vec2 aPos;
layout(location = 1) in vec3 aLocal;
layout(location = 2) in vec4 aColor;
uniform vec2 uRes;
out vec3 vLocal;
out vec4 vColor;
void main() {
  vLocal = aLocal;
  vColor = aColor;
  vec2 clip = aPos / uRes * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}`;

/** vLocal is (along, across, length) in units of the half width, so the
 * distance to the segment is exact and the caps are round. uShape 0 draws
 * light (a thin hot core inside a soft halo); uShape 1 draws a solid matte
 * with a soft edge, used for silhouettes. */
export const LINE_FRAGMENT = `#version 300 es
precision highp float;
in vec3 vLocal;
in vec4 vColor;
out vec4 o;
uniform float uShape;
uniform float uCore;
void main() {
  float along = vLocal.x - clamp(vLocal.x, 0.0, vLocal.z);
  float d = length(vec2(along, vLocal.y));
  float halo = pow(max(0.0, 1.0 - d), 2.4);
  float core = smoothstep(0.3, 0.08, d);
  vec3 light = vColor.rgb * (halo * 0.5 + core) + vec3(core * uCore);
  vec3 matte = vColor.rgb * smoothstep(1.0, 0.72, d);
  o = vec4(mix(light, matte, uShape) * vColor.a, 0.0);
}`;
