/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The shell drawn in 3D on a plain 2D canvas: turned by two angles, seen
// without perspective, far faces first (painter's algorithm). Called on
// input only; there is no animation.
import type { Mesh } from "./mesh";

export type View = { yaw: number; pitch: number };
export const START: View = { yaw: 0.6, pitch: 0.5 };
/** One arrow key press, radians. */
export const TURN = Math.PI / 18;
const PITCH_MIN = 0.05,
  PITCH_MAX = 1.5;

export const turned = (v: View, dYaw: number, dPitch: number): View => ({
  yaw: v.yaw + dYaw,
  pitch: Math.min(PITCH_MAX, Math.max(PITCH_MIN, v.pitch + dPitch)),
});

const FILL = { floor: "#3d5a52", wall: "#8ec5ff", ceiling: "#ffd18d" };

export function drawPreview(
  ctx: CanvasRenderingContext2D,
  mesh: Mesh,
  view: View,
  w: number,
  h: number,
) {
  ctx.fillStyle = "#0b1214";
  ctx.fillRect(0, 0, w, h);
  const n = mesh.verts.length,
    mid = [0, 1, 2].map((k) => mesh.verts.reduce((t, v) => t + v[k], 0) / n),
    cy = Math.cos(view.yaw),
    sy = Math.sin(view.yaw),
    cp = Math.cos(view.pitch),
    sp = Math.sin(view.pitch),
    // Screen x, screen y (down) and depth (larger is further away).
    pts = mesh.verts.map((v) => {
      const x = v[0] - mid[0],
        y = v[1] - mid[1],
        z = v[2] - mid[2],
        rx = x * cy - y * sy,
        ry = x * sy + y * cy;
      return [rx, -(z * cp + ry * sp), ry * cp - z * sp];
    }),
    reach = Math.max(1e-9, ...pts.map((p) => Math.hypot(p[0], p[1]))),
    scale = (Math.min(w, h) / 2 - 14) / reach,
    at = (i: number) => [w / 2 + pts[i][0] * scale, h / 2 + pts[i][1] * scale],
    depth = (f: { at: number[] }) =>
      f.at.reduce((t, i) => t + pts[i][2], 0) / f.at.length;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = "round";
  ctx.font = "600 12px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const f of mesh.faces.slice().sort((a, b) => depth(b) - depth(a))) {
    ctx.beginPath();
    f.at.forEach((i, k) => {
      const [x, y] = at(i);
      if (k) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    });
    ctx.closePath();
    // The ceiling is an outline, so the room can be seen into.
    if (f.kind !== "ceiling") {
      ctx.globalAlpha = f.kind === "floor" ? 0.9 : 0.28;
      ctx.fillStyle = FILL[f.kind];
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = FILL[f.kind];
    ctx.stroke();
    if (f.kind === "wall") {
      // Each wall carries its number, so nothing rests on colour alone.
      const c = f.at.map(at),
        x = c.reduce((t, p) => t + p[0], 0) / c.length,
        y = c.reduce((t, p) => t + p[1], 0) / c.length;
      ctx.fillStyle = "#ffffff";
      ctx.fillText(f.name.replace("wall_", ""), x, y);
    }
  }
  if (mesh.faces.length === 1) {
    // Floor only: number the sides instead.
    ctx.fillStyle = "#ffffff";
    for (let i = 0; i < mesh.corners; i++) {
      const a = at(i),
        b = at((i + 1) % mesh.corners);
      ctx.fillText(String(i + 1), (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    }
  }
}
