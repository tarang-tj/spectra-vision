import { fit, project, HAND_EDGES, POSE_EDGES } from "./geometry";
import { COLORS } from "./types";
import type { Mode, Point, Source, Track, VisionResult } from "./types";
export type Stroke = { points: Point[]; color: string };
export function draw(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  source: Source | null,
  mode: Mode,
  result: VisionResult | null,
  tracks: Track[],
  mirror: boolean,
  trails: boolean,
  strokes: Stroke[],
  selected: number | null,
  time: number,
) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#10191c";
  ctx.fillRect(0, 0, width, height);
  if (!source) return;
  const e = source.element,
    sw = e instanceof HTMLVideoElement ? e.videoWidth : e.naturalWidth,
    sh = e instanceof HTMLVideoElement ? e.videoHeight : e.naturalHeight;
  if (!sw || !sh) return;
  const rect = fit(sw, sh, width, height),
    point = (p: Point) => project(p, rect, mirror);
  ctx.save();
  if (mirror) {
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(e, rect.x, rect.y, rect.w, rect.h);
  ctx.restore();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const path = (
    points: Point[],
    color: string,
    lineWidth: number,
    glow = 0,
  ) => {
    if (!points.length) return;
    ctx.beginPath();
    points.forEach((p, i) => {
      const q = point(p);
      if (i === 0) ctx.moveTo(q.x, q.y);
      else ctx.lineTo(q.x, q.y);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.shadowColor = color;
    ctx.shadowBlur = glow;
    ctx.stroke();
    ctx.shadowBlur = 0;
  };
  if (mode === "objects")
    tracks.forEach((t) => {
      const color = COLORS[(t.id - 1) % COLORS.length],
        b = t.box,
        q = point({ x: mirror ? b.x + b.w : b.x, y: b.y }),
        w = b.w * rect.w,
        h = b.h * rect.h;
      const opacity = selected === null || selected === t.id ? 1 : 0.32;
      ctx.save();
      ctx.globalAlpha = opacity;
      if (trails) path(t.trail, color, 1.5, 5);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.globalAlpha = opacity * 0.55;
      ctx.strokeRect(q.x, q.y, w, h);
      ctx.globalAlpha = opacity;
      ctx.lineWidth = 2.5;
      const c = Math.min(20, w / 4, h / 4);
      ctx.beginPath();
      [
        [q.x, q.y, 1, 1],
        [q.x + w, q.y, -1, 1],
        [q.x, q.y + h, 1, -1],
        [q.x + w, q.y + h, -1, -1],
      ].forEach(([x, y, sx, sy]) => {
        ctx.moveTo(x + c * sx, y);
        ctx.lineTo(x, y);
        ctx.lineTo(x, y + c * sy);
      });
      ctx.stroke();
      const label = `${t.label}  ${(t.score * 100).toFixed(0)}% · ${String(t.id).padStart(2, "0")}`;
      ctx.font = "600 12px Inter Variable, sans-serif";
      const tw = ctx.measureText(label).width + 14,
        lx = Math.min(Math.max(q.x, rect.x), rect.x + rect.w - tw),
        ly = Math.max(rect.y + 8, q.y - 25);
      ctx.fillStyle = color;
      ctx.fillRect(lx, ly, tw, 23);
      ctx.fillStyle = "#07130e";
      ctx.fillText(label, lx + 7, ly + 16);
      ctx.restore();
    });
  if (mode !== "objects" && result)
    result.landmarks.forEach((landmarks, index) => {
      const color = COLORS[index % COLORS.length],
        edges = mode === "body" ? POSE_EDGES : HAND_EDGES;
      if (mode === "body") {
        const torso = [11, 12, 24, 23].map((i) => landmarks[i]);
        if (torso.every((p) => p && (p.visibility ?? 1) > 0.4)) {
          ctx.beginPath();
          torso.forEach((p, i) => {
            const q = point(p);
            if (i === 0) ctx.moveTo(q.x, q.y);
            else ctx.lineTo(q.x, q.y);
          });
          ctx.closePath();
          ctx.fillStyle = "#a4ffd917";
          ctx.fill();
          path([torso[0], torso[2]], "#a4ffd977", 1);
          path([torso[1], torso[3]], "#a4ffd977", 1);
        }
      }
      edges.forEach(([a, b]) => {
        if (
          landmarks[a] &&
          landmarks[b] &&
          (mode === "hands" ||
            ((landmarks[a].visibility ?? 1) > 0.4 &&
              (landmarks[b].visibility ?? 1) > 0.4))
        )
          path([landmarks[a], landmarks[b]], color, 2.5, 9);
      });
      landmarks.forEach((p, i) => {
        if (mode === "body" && (p.visibility ?? 1) < 0.4) return;
        const q = point(p);
        ctx.beginPath();
        ctx.arc(
          q.x,
          q.y,
          mode === "hands" && [4, 8].includes(i) ? 5 : 3,
          0,
          Math.PI * 2,
        );
        ctx.fillStyle = i === 8 ? "#ffffff" : color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.shadowBlur = 0;
      });
      if (mode === "hands" && landmarks[8]) {
        const q = point(landmarks[8]);
        ctx.beginPath();
        ctx.arc(q.x, q.y, 12 + 2 * Math.sin(time / 180), 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    });
  if (trails && mode !== "objects")
    strokes.forEach((s) => {
      path(
        s.points,
        s.color,
        mode === "body" ? 2 : 8,
        mode === "body" ? 10 : 22,
      );
      if (mode === "hands") path(s.points, "#ffffffbb", 2, 2);
      if (mode === "hands" && s.points.length === 1) {
        const p = point(s.points[0]);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
        ctx.fillStyle = s.color;
        ctx.shadowColor = s.color;
        ctx.shadowBlur = 20;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    });
}
