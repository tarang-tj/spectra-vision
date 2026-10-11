/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Draws the placed box on the stage: its footprint on the floor and, when the
// camera's focal length is known, the whole box in perspective. Called by the
// Ruler for every still frame; it keeps no loop and no state of its own.
import type { DrawEnv } from "../extension-types";
import { isCompact } from "../overlay-labels";
import { dot, tag } from "../overlay-parts";
import { fromMm, type Unit } from "../units";
import { getBox } from "./box-state";
import {
  clipSegment,
  facesToward,
  nearEdges,
  projectorOf,
  solidOf,
  type P2,
} from "./project";
import { verdicts } from "./verdict";
import { COLOR, headline, tagText } from "./verdict-mark";

/** The box's own colour until it has a verdict: apart from the reference,
 * spans, paths and edges. With a verdict it takes the verdict's colour. */
export const BOX = "#c9a8ff";
/** The footprint corner that carries the turn handle. */
export const TURN_CORNER = 2;

/** A typed size in the chosen unit, e.g. "200 cm". Not a measurement: the
 * user gave it, so it has no bar. */
export const sizeText = (mm: number, unit: Unit): string =>
  `${Number(fromMm(mm, unit).toFixed(unit === "mm" ? 0 : 2))} ${unit}`;

const lower = (a: [P2, P2], b: [P2, P2]) =>
  a[0].y + a[1].y >= b[0].y + b[1].y ? a : b;

export function drawBox(ctx: CanvasRenderingContext2D, env: DrawEnv) {
  const box = getBox(),
    at = box.at,
    view = projectorOf(env);
  if (!at || !view) return;
  // Memoized on the state (verdict.ts): no retakes are run again per frame.
  const verdict = headline(verdicts(env.s, env.d, box).rows),
    ink = verdict ? COLOR[verdict.kind] : BOX,
    solid = solidOf({ ...box, at }),
    toward = view.camera ? facesToward(solid, view.camera.centre) : null,
    near = toward ? nearEdges(solid, toward) : null,
    // Without a focal length only the floor is drawn: the bottom face.
    edges = view.full ? solid.edges : solid.edges.slice(0, 4),
    faces = view.full ? solid.faces : solid.faces.slice(0, 1),
    lines = edges.map(([a, b]) => {
      const cut = clipSegment(view.project, solid.corners[a], solid.corners[b]);
      return cut
        ? ([env.toCanvas(cut[0]), env.toCanvas(cut[1])] as [P2, P2])
        : null;
    });

  // Faces, lightly: only those turned toward the camera and wholly in view.
  ctx.fillStyle = ink;
  ctx.globalAlpha = 0.14;
  faces.forEach((face, f) => {
    if (toward && !toward[f]) return;
    const pts = face.map((i) => {
      const c = solid.corners[i];
      return view.project(c[0], c[1], c[2]);
    });
    if (pts.some((p) => !p)) return;
    ctx.beginPath();
    pts.forEach((p, i) => {
      const c = env.toCanvas(p!);
      if (i) ctx.lineTo(c.x, c.y);
      else ctx.moveTo(c.x, c.y);
    });
    ctx.closePath();
    ctx.fill();
  });

  // Edges: the far ones thin and faint first, the near ones on top.
  ctx.strokeStyle = ink;
  ctx.lineJoin = "round";
  for (const strong of [false, true]) {
    ctx.globalAlpha = strong ? 1 : 0.5;
    ctx.lineWidth = strong ? 2.5 : 1.25;
    lines.forEach((line, i) => {
      if (!line || (near ? near[i] : true) !== strong) return;
      ctx.beginPath();
      ctx.moveTo(line[0].x, line[0].y);
      ctx.lineTo(line[1].x, line[1].y);
      ctx.stroke();
    });
  }
  ctx.globalAlpha = 1;

  // The three sizes on their edges, each on the copy lowest in the picture.
  const { unit } = env.s,
    label = (text: string, among: number[]) => {
      const shown = among
        .map((i) => lines[i])
        .filter((l): l is [P2, P2] => !!l);
      if (!shown.length) return;
      const l = shown.reduce(lower);
      // Typed by the user and shown in the panel: a detail on the stage.
      tag(
        text,
        (l[0].x + l[1].x) / 2 + 6,
        (l[0].y + l[1].y) / 2 - 8,
        ink,
        "detail",
      );
    };
  label(`W ${sizeText(box.w, unit)}`, [0, 2]);
  label(`D ${sizeText(box.d, unit)}`, [1, 3]);
  if (view.full) label(`H ${sizeText(box.h, unit)}`, [8, 9, 10, 11]);

  // The verdict beside the box, above its highest drawn point: a mark and a
  // word in the verdict's colour, the same as in the panel.
  const drawn = lines.filter((l): l is [P2, P2] => !!l).flat();
  if (verdict && drawn.length) {
    const top = drawn.reduce((a, b) => (b.y < a.y ? b : a));
    tag(tagText(verdict), top.x + 8, top.y - (isCompact() ? 12 : 16), ink);
  }

  // The turn handle, while the Box tool is the one taking taps.
  if (env.s.tool === "box") {
    const c = solid.corners[TURN_CORNER],
      p = view.project(c[0], c[1], 0);
    if (p) {
      const h = env.toCanvas(p);
      dot(ctx, h.x, h.y, ink, "turn", "detail");
    }
  }
}
