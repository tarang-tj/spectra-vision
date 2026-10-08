/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { ACCENT_GLSL } from "../../gl/color";
import { GLSL_HASH } from "../../gl/glsl";

/** Turns the scene (red: bones, green: body shape) into a hologram: scan
 * lines, a rolling bar, bands that glitch sideways, and the three colour
 * channels pulled apart. With uSource the body is lit by the person's own
 * pixels; with uCover the hologram replaces the person instead of adding to
 * them. Only the picture is disturbed: the shape is the model's. */
export const HOLOGRAM_FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
uniform sampler2D uScene;
uniform sampler2D uSource;
uniform float uHasSource;
uniform float uCover;
uniform float uTime;
uniform float uLines;
uniform vec4 uRect;
uniform float uMirror;
${GLSL_HASH}
${ACCENT_GLSL}
float lum(vec2 uv) {
  vec2 q = (vec2(uv.x, 1.0 - uv.y) - uRect.xy) / uRect.zw;
  if (uMirror > 0.5) q.x = 1.0 - q.x;
  return dot(texture(uSource, clamp(q, 0.0, 1.0)).rgb, vec3(0.299, 0.587, 0.114));
}
void main() {
  float band = floor(vUv.y * 38.0);
  float tick = floor(uTime * 10.0);
  float torn = step(0.92, hash(vec2(band, tick)));
  float bar = smoothstep(0.07, 0.0, abs(fract(vUv.y + uTime * 0.21) - 0.5));
  vec2 uv = vUv + vec2(torn * (hash(vec2(tick, band)) - 0.5) * 0.05 + bar * 0.004, 0.0);
  vec2 split = vec2(0.0035 + torn * 0.007, 0.0);
  vec2 sr = texture(uScene, uv + split).rg;
  vec2 sg = texture(uScene, uv).rg;
  vec2 sb = texture(uScene, uv - split).rg;
  // The three displaced copies take the three accent colours, so the split
  // stays in the product's palette instead of red, green and blue.
  mat3 accents = mat3(LAVENDER, MINT, BLUE);
  vec3 body = vec3(sr.g, sg.g, sb.g);
  vec3 bones = vec3(sr.r, sg.r, sb.r);
  float scan = 0.45 + 0.55 * smoothstep(-0.2, 0.6, sin(vUv.y * uLines));
  float flicker = 0.9 + 0.1 * sin(uTime * 37.0);
  vec3 tint = mix(BLUE, MINT, smoothstep(0.15, 0.9, vUv.y));
  vec3 lit = vec3(0.55);
  if (uHasSource > 0.5)
    lit = vec3(lum(uv + split), lum(uv), lum(uv - split)) * 1.5 + 0.12;
  vec3 c = accents * (body * lit) * 0.62 * scan * flicker
    + accents * bones * 0.75 * (0.65 + 0.35 * scan)
    + tint * sg.g * (0.12 + bar * 0.5);
  o = vec4(c, sg.g * uCover);
}`;
