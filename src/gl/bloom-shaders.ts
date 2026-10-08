/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */

/** Halve a texture with four bilinear taps (each averages four texels). */
export const DOWNSAMPLE_FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
uniform sampler2D uTex;
uniform vec2 uTexel;
void main() {
  vec4 sum = texture(uTex, vUv + uTexel * vec2(-1.0, -1.0))
    + texture(uTex, vUv + uTexel * vec2(1.0, -1.0))
    + texture(uTex, vUv + uTexel * vec2(-1.0, 1.0))
    + texture(uTex, vUv + uTexel * vec2(1.0, 1.0));
  o = sum * 0.25;
}`;

/** One direction of a nine-texel Gaussian, done in five linear taps. */
export const BLUR_FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
uniform sampler2D uTex;
uniform vec2 uStep;
void main() {
  vec4 sum = texture(uTex, vUv) * 0.2270270270;
  sum += texture(uTex, vUv + uStep * 1.3846153846) * 0.3162162162;
  sum += texture(uTex, vUv - uStep * 1.3846153846) * 0.3162162162;
  sum += texture(uTex, vUv + uStep * 3.2307692308) * 0.0702702703;
  sum += texture(uTex, vUv - uStep * 3.2307692308) * 0.0702702703;
  o = sum;
}`;

/** Scene plus three blurred levels, tone mapped so additive light rolls off
 * instead of clipping. The output is premultiplied: alpha is the brightest
 * channel (or the scene's own alpha), so on the stage the light adds where it
 * is faint and covers where it is strong. A little noise hides 8-bit banding. */
export const COMPOSITE_FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
uniform sampler2D uScene;
uniform sampler2D uBloom0;
uniform sampler2D uBloom1;
uniform sampler2D uBloom2;
uniform float uExposure;
uniform float uBloom;
void main() {
  vec4 scene = texture(uScene, vUv);
  vec3 glow = texture(uBloom0, vUv).rgb * 0.5
    + texture(uBloom1, vUv).rgb * 0.3
    + texture(uBloom2, vUv).rgb * 0.2;
  vec3 c = 1.0 - exp(-(scene.rgb + glow * uBloom) * uExposure);
  float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  c = max(c + (n - 0.5) / 255.0, 0.0);
  float a = clamp(max(max(c.r, c.g), max(c.b, scene.a)), 0.0, 1.0);
  o = vec4(min(c, vec3(a)), a);
}`;
