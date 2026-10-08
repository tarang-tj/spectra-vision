/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { BLUE, LAVENDER, MINT } from "../gl/color";
import { clamp, mix } from "../gl/maths";
import * as mesh from "./lib/face-contours";
import { contour, iris, poseFace } from "./lib/face-glow";
import { DEFAULT_INTENSITY, glEffect } from "./lib/gl-effect";
import {
  blendshapesOf,
  facesOf,
  posesOf,
  px,
  py,
  shape,
  span,
} from "./lib/inputs";
import type { EffectDef } from "./types";

/** Face light: the irises and the contours of the face glow, driven by the
 * measured blendshapes. A blink puts out that eye, an open jaw lights the
 * mouth, a smile turns the lips from lavender to mint, raised brows flare.
 * In Body mode there is no face mesh, so only the eyes and mouth that the
 * pose model reports are lit, at a fixed strength. */
const faceLight: EffectDef = {
  id: "face-light",
  label: "Face light",
  modes: ["face", "fusion", "body"],
  kind: "gl",
  order: 80,
  intensity: { default: DEFAULT_INTENSITY },
  create: (env) =>
    glEffect(env, { id: "face-light", exposure: 1.2, bloom: 1.5 }, () => {
      const lip: [number, number, number] = [0, 0, 0];
      return {
        paint(frame, kit) {
          const lines = kit.lines,
            faces = facesOf(frame);
          let drawn = 0;
          for (let f = 0; f < faces.length; f++) {
            const face = faces[f];
            if (!face || face.length < 468) continue;
            const s = blendshapesOf(frame, f),
              size = span(frame, face[33], face[263]),
              w = Math.max(2.5, size * 0.035),
              jaw = shape(s, "jawOpen"),
              smile =
                (shape(s, "mouthSmileLeft") + shape(s, "mouthSmileRight")) / 2,
              brow = Math.max(
                shape(s, "browInnerUp"),
                (shape(s, "browOuterUpLeft") + shape(s, "browOuterUpRight")) /
                  2,
              ),
              openL = 1 - clamp(shape(s, "eyeBlinkLeft") * 1.4),
              openR = 1 - clamp(shape(s, "eyeBlinkRight") * 1.4);
            for (let c = 0; c < 3; c++)
              lip[c] = mix(LAVENDER[c], MINT[c], clamp(smile * 1.6));
            contour(lines, frame, face, mesh.FACE_OVAL, w * 1.2, BLUE, 0.3);
            contour(
              lines,
              frame,
              face,
              mesh.LEFT_BROW,
              w * (1 + brow),
              BLUE,
              0.3 + 1.2 * brow,
            );
            contour(
              lines,
              frame,
              face,
              mesh.RIGHT_BROW,
              w * (1 + brow),
              BLUE,
              0.3 + 1.2 * brow,
            );
            contour(
              lines,
              frame,
              face,
              mesh.LEFT_EYE,
              w,
              MINT,
              0.25 + 0.5 * openL,
            );
            contour(
              lines,
              frame,
              face,
              mesh.RIGHT_EYE,
              w,
              MINT,
              0.25 + 0.5 * openR,
            );
            contour(
              lines,
              frame,
              face,
              mesh.LIPS_OUTER,
              w * (1.1 + smile),
              lip,
              0.45 + 0.7 * smile,
            );
            contour(
              lines,
              frame,
              face,
              mesh.LIPS_INNER,
              w * (1 + 1.5 * jaw),
              lip,
              0.2 + 1.3 * jaw,
            );
            if (face.length >= 478) {
              iris(
                lines,
                frame,
                face,
                mesh.LEFT_IRIS,
                openL,
                shape(s, "eyeWideLeft"),
              );
              iris(
                lines,
                frame,
                face,
                mesh.RIGHT_IRIS,
                openR,
                shape(s, "eyeWideRight"),
              );
            }
            // Light spilling from an open mouth.
            if (jaw > 0.08 && face[13] && face[14])
              lines.dot(
                (px(frame, face[13]) + px(frame, face[14])) / 2,
                (py(frame, face[13]) + py(frame, face[14])) / 2,
                size * (0.12 + 0.3 * jaw),
                lip[0],
                lip[1],
                lip[2],
                jaw,
              );
            drawn++;
          }
          // No face mesh: the pose model's eyes and mouth.
          if (!drawn && poseFace(lines, frame, posesOf(frame)[0])) drawn++;
          if (!drawn) return null;
          kit.flush(false, 0.6);
          return kit.scene;
        },
        dispose() {},
      };
    }),
};
export default faceLight;
