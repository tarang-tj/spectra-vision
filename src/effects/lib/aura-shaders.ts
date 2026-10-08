/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { ACCENT_GLSL } from "../../gl/color";
import { GLSL_FLOW } from "../../gl/glsl";

/** One step of the aura field. The field is carried along a flow (away from
 * where it is dense, upward, and around a slow swirl), fades, and is fed
 * again from the silhouette, so light keeps streaming off the person. */
export const AURA_STEP = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
uniform sampler2D uField;
uniform sampler2D uMatte;
uniform vec2 uTexel;
uniform float uDt;
uniform float uTime;
uniform float uAspect;
${GLSL_FLOW}
void main() {
  vec2 e = uTexel * 2.5;
  float l = texture(uField, vUv - vec2(e.x, 0.0)).r;
  float r = texture(uField, vUv + vec2(e.x, 0.0)).r;
  float d = texture(uField, vUv - vec2(0.0, e.y)).r;
  float u = texture(uField, vUv + vec2(0.0, e.y)).r;
  vec2 p = vec2(vUv.x * uAspect, vUv.y);
  vec2 v = -vec2(r - l, u - d) * 0.15 + flow(p * 11.0, uTime * 0.7) * 0.15 + vec2(0.0, 0.12);
  v.x /= uAspect;
  float f = texture(uField, vUv - v * uDt).r;
  f = max(0.0, f * exp(-1.1 * uDt) - 0.06 * uDt);
  float m = texture(uMatte, vUv).r;
  float streak = 0.5 + 0.5 * sin(p.x * 70.0 + sin(p.y * 41.0 + uTime * 1.9) * 2.6 + uTime * 3.1);
  o = vec4(max(f, m * (0.25 + 0.75 * streak * streak * streak)), 0.0, 0.0, 1.0);
}`;

/** Colour the field: lavender where it is thin, then blue, mint and white
 * where it is dense. The inside of the silhouette stays clear so the person
 * is rimmed, not covered. */
export const AURA_SHOW = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
uniform sampler2D uField;
uniform sampler2D uMatte;
${ACCENT_GLSL}
void main() {
  float f = texture(uField, vUv).r;
  float m = texture(uMatte, vUv).r;
  float rim = smoothstep(0.06, 0.8, f) * (1.0 - smoothstep(0.3, 0.9, m) * 0.94);
  vec3 c = mix(LAVENDER, BLUE, smoothstep(0.05, 0.45, rim));
  c = mix(c, MINT, smoothstep(0.4, 0.8, rim));
  c += vec3(smoothstep(0.8, 1.0, rim) * 0.4);
  o = vec4(c * pow(rim, 1.3) * 1.6, 0.0);
}`;
