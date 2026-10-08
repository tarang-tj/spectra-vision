/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { ACCENT_GLSL } from "../../gl/color";
import { GLSL_FLOW, GLSL_HASH } from "../../gl/glsl";

/** Ember particles. State: aA = position and velocity in stage units (the
 * image height is 1, y down); aB = life left, life span, seed, emitter.
 * A dead particle is reborn with chance uSpawn on the measured segment an
 * emitter just travelled (uEmit: current xy, previous xy) and inherits part
 * of that emitter's measured velocity. Nothing is born without an emitter. */
export const EMBER_UPDATE = `#version 300 es
precision highp float;
layout(location = 0) in vec4 aA;
layout(location = 1) in vec4 aB;
out vec4 vA;
out vec4 vB;
uniform float uDt;
uniform float uTime;
uniform float uSpawn;
uniform float uScale;
uniform int uCount;
uniform vec4 uEmit[8];
uniform vec2 uVel[8];
uniform float uWeight[8];
${GLSL_HASH}
${GLSL_FLOW}
void main() {
  vec2 pos = aA.xy, vel = aA.zw;
  float life = aB.x, span = aB.y, seed = aB.z, from = aB.w;
  float s = seed * 977.0;
  if (life <= 0.0) {
    if (uCount > 0 && hash(vec2(s, uTime * 61.3)) < uSpawn) {
      float pick = hash(vec2(s * 0.37, uTime * 97.7 + 5.0));
      int e = 0;
      for (int i = 0; i < 7; i++) if (i < uCount - 1 && pick > uWeight[i]) e = i + 1;
      float along = hash(vec2(s * 0.71, uTime * 43.1 + 9.0));
      float angle = hash(vec2(s * 1.31, uTime * 29.3 + 2.0)) * 6.2831853;
      float reach = sqrt(hash(vec2(s * 0.53, uTime * 83.9 + 7.0)));
      vec2 dir = vec2(cos(angle), sin(angle));
      pos = mix(uEmit[e].zw, uEmit[e].xy, along) + dir * reach * uScale * 0.09;
      vel = uVel[e] * 0.6 + dir * reach * uScale * 0.7 + vec2(0.0, -uScale * 0.4);
      span = mix(0.9, 2.6, hash(vec2(s * 0.19, uTime * 11.1)));
      life = span;
      from = float(e);
    }
  } else {
    vel += (flow(pos * 9.0, uTime * 0.7) * uScale * 2.4 + vec2(0.0, -uScale * 1.7)) * uDt;
    vel *= exp(-0.9 * uDt);
    pos += vel * uDt;
    life -= uDt;
  }
  vA = vec4(pos, vel);
  vB = vec4(life, span, seed, from);
}`;

/** White hot at birth, then mint, blue and lavender as the ember cools. */
export const EMBER_VERTEX = `#version 300 es
precision highp float;
layout(location = 0) in vec4 aA;
layout(location = 1) in vec4 aB;
out vec4 vColor;
uniform vec4 uRect;
uniform vec2 uRes;
uniform float uSize;
uniform float uTime;
${ACCENT_GLSL}
void main() {
  float life = aB.x, span = max(aB.y, 0.001), seed = aB.z;
  if (life <= 0.0) {
    gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
    gl_PointSize = 1.0;
    vColor = vec4(0.0);
    return;
  }
  float age = 1.0 - life / span;
  vec2 clip = (uRect.xy + aA.xy * uRect.z) / uRes * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  gl_PointSize = max(1.5, uSize * uRect.w * (0.45 + fract(seed * 7.13)) * (1.0 - age * 0.55));
  vec3 c = age < 0.2 ? mix(vec3(1.0), MINT, age / 0.2)
    : age < 0.6 ? mix(MINT, BLUE, (age - 0.2) / 0.4)
    : mix(BLUE, LAVENDER, (age - 0.6) / 0.4);
  float fade = smoothstep(0.0, 0.06, age) * (1.0 - smoothstep(0.5, 1.0, age));
  float twinkle = 0.7 + 0.3 * sin(uTime * 13.0 + seed * 90.0);
  vColor = vec4(c * fade * twinkle, 1.0);
}`;
