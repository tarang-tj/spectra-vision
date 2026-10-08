/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { ACCENT_GLSL } from "../../gl/color";
import { GLSL_HASH } from "../../gl/glsl";

/** Starfield particles. State: aA = position and velocity in stage units
 * (the image height is 1, y down); aB = life left, life span, seed, cycle.
 * Stars are born anywhere on the image and fall toward the tracked points
 * (uPull: xy position, z strength), swirling as they go. With no tracked
 * point nothing is born and nothing is drawn. */
export const STAR_UPDATE = `#version 300 es
precision highp float;
layout(location = 0) in vec4 aA;
layout(location = 1) in vec4 aB;
out vec4 vA;
out vec4 vB;
uniform float uDt;
uniform float uAspect;
uniform int uCount;
uniform vec3 uPull[4];
${GLSL_HASH}
void main() {
  vec2 pos = aA.xy, vel = aA.zw;
  float life = aB.x, span = aB.y, seed = aB.z, cycle = aB.w;
  float s = seed * 977.0;
  if (life <= 0.0) {
    if (uCount > 0) {
      cycle = mod(cycle + 1.0, 4096.0);
      pos = vec2(hash(vec2(s, cycle)) * uAspect, hash(vec2(cycle * 3.7 + 1.0, s * 0.43)));
      vel = vec2(0.0);
      span = mix(2.4, 6.5, hash(vec2(s * 0.19, cycle * 1.3)));
      life = span;
    }
  } else {
    vec2 force = vec2(0.0);
    float hold = 0.0;
    // A star that reaches the centre burns out, so the field keeps flowing.
    float sink = 0.0;
    for (int i = 0; i < 4; i++) {
      if (i >= uCount) break;
      vec2 d = uPull[i].xy - pos;
      float r = length(d) + 0.0001;
      vec2 n = d / r;
      float g = uPull[i].z / (r * r + 0.012);
      force += n * g * 0.022 + vec2(-n.y, n.x) * g * 0.02;
      // Close in, a star is captured into orbit instead of slung back out.
      hold += exp(-r * r / 0.02) * uPull[i].z;
      sink += exp(-r * r / 0.003);
    }
    vel += force * uDt;
    vel *= exp(-(0.9 + 3.0 * hold) * uDt);
    pos += vel * uDt;
    life -= uDt * (1.0 + 5.0 * sink);
  }
  vA = vec4(pos, vel);
  vB = vec4(life, span, seed, cycle);
}`;

/** A star is bright near a tracked point and faint far from it. */
export const STAR_VERTEX = `#version 300 es
precision highp float;
layout(location = 0) in vec4 aA;
layout(location = 1) in vec4 aB;
out vec4 vColor;
uniform vec4 uRect;
uniform vec2 uRes;
uniform float uSize;
uniform float uTime;
uniform float uReach;
uniform float uAspect;
uniform int uCount;
uniform vec3 uPull[4];
${ACCENT_GLSL}
void main() {
  float life = aB.x, span = max(aB.y, 0.001), seed = aB.z;
  bool outside = aA.x < 0.0 || aA.x > uAspect || aA.y < 0.0 || aA.y > 1.0;
  if (life <= 0.0 || uCount == 0 || outside) {
    gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
    gl_PointSize = 1.0;
    vColor = vec4(0.0);
    return;
  }
  float near = 0.0;
  for (int i = 0; i < 4; i++) {
    if (i >= uCount) break;
    vec2 d = uPull[i].xy - aA.xy;
    near = max(near, exp(-dot(d, d) / (uReach * uReach)));
  }
  float age = 1.0 - life / span;
  vec2 clip = (uRect.xy + aA.xy * uRect.z) / uRes * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  float kind = fract(seed * 5.31);
  gl_PointSize = max(1.5, uSize * uRect.w * (0.3 + 1.3 * fract(seed * 7.13) * fract(seed * 3.7)) * (0.6 + 0.9 * near));
  vec3 c = kind < 0.4 ? MINT : kind < 0.7 ? BLUE : kind < 0.9 ? LAVENDER : vec3(1.0);
  float fade = smoothstep(0.0, 0.12, age) * (1.0 - smoothstep(0.8, 1.0, age));
  float twinkle = 0.65 + 0.35 * sin(uTime * (3.0 + kind * 6.0) + seed * 90.0);
  vColor = vec4(c * fade * twinkle * (0.06 + 0.9 * near * near), 1.0);
}`;
