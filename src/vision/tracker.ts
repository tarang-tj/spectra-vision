import type { Box, Detection, Track } from "./types";
export function iou(a: Box, b: Box) {
  const overlap =
    Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return overlap / Math.max(1e-9, a.w * a.h + b.w * b.h - overlap);
}
export class Tracker {
  private nextId = 1;
  private tracks: Track[] = [];
  reset() {
    this.nextId = 1;
    this.tracks = [];
  }
  update(detections: Detection[], time: number): Track[] {
    const previous = this.tracks.filter((t) => time - t.lastSeen < 750);
    const candidates: { di: number; ti: number; score: number }[] = [];
    detections.forEach((d, di) =>
      previous.forEach((t, ti) => {
        if (d.label !== t.label) return;
        const overlap = iou(d.box, t.box);
        const distance = Math.hypot(
          d.box.x + d.box.w / 2 - t.box.x - t.box.w / 2,
          d.box.y + d.box.h / 2 - t.box.y - t.box.h / 2,
        );
        if (overlap > 0.15 || distance < 0.075)
          candidates.push({ di, ti, score: overlap + 0.15 * (1 - distance) });
      }),
    );
    const matches = new Map<number, Track>(),
      used = new Set<number>();
    candidates
      .sort((a, b) => b.score - a.score)
      .forEach((c) => {
        if (!matches.has(c.di) && !used.has(c.ti)) {
          matches.set(c.di, previous[c.ti]);
          used.add(c.ti);
        }
      });
    const current = detections.map((d, i) => {
      const old = matches.get(i);
      return {
        ...d,
        id: old?.id ?? this.nextId++,
        lastSeen: time,
        trail: [
          ...(old?.trail ?? []),
          { x: d.box.x + d.box.w / 2, y: d.box.y + d.box.h / 2 },
        ].slice(-32),
      };
    });
    this.tracks = [...current, ...previous.filter((_, i) => !used.has(i))];
    // Recently lost tracks are retained for association only, never rendered as fresh detections.
    return current;
  }
}
