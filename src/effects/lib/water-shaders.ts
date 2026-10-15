/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { ACCENT_GLSL, WHITE } from "../../gl/color";
import { MAX_DROPS } from "./water-sim";

const white = WHITE.map((v) => v.toFixed(4)).join(", ");

/** Water: the blob, its drops and the puddle are one metaball field in stage
 * CSS pixels, so drops merge back into the blob and each other. Inside the
 * edge the picture behind is bent through a lens shaped like the field, with
 * a pale Fresnel edge, a bright rim line and a glint from an upper-left
 * light. Alpha is coverage, and the colour is written through the inverse of
 * the composite's tone map so the picture comes out at its own brightness. */
export const WATER_FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
uniform sampler2D uSource;
// CSS px: uRect is the picture inside the stage, uBlob x, y, r, squash,
// uDrops and uPuddle x, y, r, strength, uBox the area worth shading.
uniform vec4 uRect, uBlob, uPuddle, uBox, uDrops[${MAX_DROPS}];
uniform vec2 uSize, uDir;
uniform int uCount;
uniform float uHasSource, uMirror, uBend, uLift, uTime, uE, uCap;
${ACCENT_GLSL}
const vec3 WHITE = vec3(${white});
const vec3 L = vec3(-0.42, -0.58, 0.7);
float field(vec2 p) {
  vec2 d = p - uBlob.xy;
  vec2 q = vec2(dot(d, uDir) / uBlob.w, (d.x * uDir.y - d.y * uDir.x) * uBlob.w);
  float wave = 1.0 + 0.035 * sin(atan(d.y, d.x + 1e-4) * 3.0 + uTime * 5.0);
  float f = uBlob.z * uBlob.z * wave / max(dot(q, q), 1.0);
  for (int i = 0; i < ${MAX_DROPS}; i++) {
    if (i >= uCount) break;
    vec2 e = p - uDrops[i].xy;
    f += uDrops[i].z * uDrops[i].z * uDrops[i].w / max(dot(e, e), 1.0);
  }
  vec2 e = (p - uPuddle.xy) * vec2(1.0, 3.5);
  return f + uPuddle.z * uPuddle.z * uPuddle.w / max(dot(e, e), 1.0);
}
// A sphere of radius r has f = r²/d², so this is its height over the
// stage, normalised: 0 at the edge (f = 1) and 1 in the middle.
float height(vec2 p) {
  return sqrt(max(1.0 - 1.0 / max(field(p), 1e-4), 0.0));
}
vec3 behind(vec2 p) {
  vec2 q = (p - uRect.xy) / uRect.zw;
  if (uMirror > 0.5) q.x = 1.0 - q.x;
  return texture(uSource, clamp(q, 0.0, 1.0)).rgb;
}
void main() {
  vec2 p = vec2(vUv.x * uSize.x, (1.0 - vUv.y) * uSize.y);
  if (p.x < uBox.x || p.y < uBox.y || p.x > uBox.z || p.y > uBox.w) discard;
  float f = field(p);
  float cover = smoothstep(0.9, 1.1, f);
  if (cover <= 0.0) {
    o = vec4(0.0);
    return;
  }
  float h = height(p);
  vec2 grad = vec2(height(p + vec2(1.5, 0.0)) - h, height(p + vec2(0.0, 1.5)) - h);
  vec3 n = normalize(vec3(-grad / 1.5 * uLift, 1.0));
  float F = pow(1.0 - n.z, 3.0);
  vec3 pale = mix(BLUE, WHITE, 0.6);
  vec3 c;
  if (uHasSource > 0.5) {
    // A convex lens: the picture is pulled in from the middle, and each
    // channel bends a little differently.
    vec2 bend = n.xy * uBend * (0.35 + 0.65 * h);
    c = vec3(behind(p - bend).r, behind(p - bend * 1.06).g, behind(p - bend * 1.12).b);
    c = c * vec3(0.9, 0.97, 1.04) + BLUE * 0.04;
  } else c = mix(BLUE, MINT, 0.3) * 0.35;
  c = mix(c * (1.0 - 0.25 * F), pale, 0.55 * F);
  float rim = smoothstep(0.92, 1.02, f) * (1.0 - smoothstep(1.02, 1.35, f));
  vec3 r = reflect(-normalize(L), n);
  float glint = pow(max(r.z, 0.0), 28.0) * 1.8 + pow(max(r.z, 0.0), 5.0) * 0.1;
  // Light focused through the water lands on the side away from the lamp.
  float caustic = pow(clamp(dot(n.xy, -L.xy) * 1.6, 0.0, 1.0), 2.0) * h;
  c += pale * (rim * 0.5 + caustic * 0.3) + WHITE * glint;
  float a = cover * (uHasSource > 0.5 ? 1.0 : 0.4);
  c = min(c * a, vec3(uCap));
  o = vec4(-log(1.0 - c) / uE, a);
}`;
