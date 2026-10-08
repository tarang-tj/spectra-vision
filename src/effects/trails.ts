import { strokePath } from "../vision/draw";
import { isPinching } from "../vision/geometry";
import { COLORS } from "../vision/types";
import type { Point, VisionResult } from "../vision/types";
import type { EffectDef } from "./types";

type Stroke = { points: Point[]; color: string; kind: "pose" | "hand" };
// Wrists and ankles leave the body trails.
const JOINTS = [15, 16, 27, 28];
const MAX_STROKES = 40;

/** Trails: object tracks leave their recent path, wrists and ankles leave
 * ribbons, and a thumb-index pinch paints with light. Every point comes from a
 * model result; nothing is synthesized between results. */
const trails: EffectDef = {
  id: "trails",
  label: "Trails",
  // The modes that give it something to follow: object tracks, pose joints
  // or hand landmarks.
  modes: ["objects", "body", "hands", "fusion"],
  kind: "2d",
  order: 10,
  defaultOn: true,
  create({ ctx, mode }) {
    let strokes: Stroke[] = [],
      joints: (Stroke | null)[] = [],
      fingers: (Stroke | null)[] = [],
      pinches: boolean[] = [],
      seen: VisionResult | null = null;
    // Lift every pen so the next result starts new strokes.
    const lift = () => {
      joints = [];
      fingers = [];
      pinches = [];
    };
    const extend = (stroke: Stroke, p: Point, limit: number) => {
      const last = stroke.points.at(-1);
      if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 0.002)
        stroke.points.push({ ...p });
      if (stroke.points.length > limit) stroke.points.shift();
    };
    const begin = (index: number, kind: Stroke["kind"]) => {
      const stroke = { points: [], color: COLORS[index % COLORS.length], kind };
      strokes.push(stroke);
      return stroke;
    };
    const followBody = (points: Point[] | undefined) => {
      if (!points) {
        joints = [];
        return;
      }
      JOINTS.forEach((joint, i) => {
        const p = points[joint];
        if (!p || (p.visibility ?? 1) < 0.4) {
          joints[i] = null;
          return;
        }
        extend((joints[i] ??= begin(i, "pose")), p, 64);
      });
      if (strokes.length > MAX_STROKES)
        strokes.splice(0, strokes.length - MAX_STROKES);
    };
    const paint = (hands: Point[][], aspect: number) => {
      hands.forEach((points, i) => {
        const pinching = isPinching(points, pinches[i] ?? false, aspect);
        if (pinching) {
          if (!pinches[i] || !fingers[i]) fingers[i] = begin(i, "hand");
          extend(fingers[i]!, points[8], 500);
        } else fingers[i] = null;
        pinches[i] = pinching;
      });
      for (let i = hands.length; i < pinches.length; i++) {
        pinches[i] = false;
        fingers[i] = null;
      }
      if (strokes.length > MAX_STROKES) strokes.shift();
    };
    return {
      // An object's recent path, under its box and sharing its selection dimming.
      before(frame, kind, index) {
        if (kind !== "object") return;
        const t = frame.tracks[index];
        if (t)
          strokePath(
            ctx,
            frame,
            t.trail,
            COLORS[(t.id - 1) % COLORS.length],
            1.5,
            5,
          );
      },
      draw(frame) {
        // Grow strokes once per new model result, never per rendered frame.
        const result = frame.result;
        // A result left over from the previous mode must not leave a stroke.
        if (result && result !== seen && result.mode === mode.id) {
          seen = result;
          if (result.tasks.pose) followBody(result.tasks.pose.landmarks[0]);
          if (result.tasks.hand)
            paint(result.tasks.hand.landmarks, frame.aspect);
        }
        strokes.forEach((s) => {
          const hand = s.kind === "hand";
          strokePath(
            ctx,
            frame,
            s.points,
            s.color,
            hand ? 8 : 2,
            hand ? 22 : 10,
          );
          if (!hand) return;
          strokePath(ctx, frame, s.points, "#ffffffbb", 2, 2);
          if (s.points.length === 1) {
            const p = frame.project(s.points[0]);
            ctx.beginPath();
            ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
            ctx.fillStyle = s.color;
            ctx.shadowColor = s.color;
            ctx.shadowBlur = 20;
            ctx.fill();
            ctx.shadowBlur = 0;
          }
        });
      },
      // Strokes are kept while the switch is off; only the pens are lifted, and
      // the current result is read again when it comes back on.
      enable() {
        lift();
        seen = null;
      },
      reset() {
        strokes = [];
        lift();
      },
      dispose() {
        strokes = [];
      },
    };
  },
};
export default trails;
