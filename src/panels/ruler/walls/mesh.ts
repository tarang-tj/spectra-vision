/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The shell as a mesh in metres, z up, right-handed, and its Wavefront OBJ.
// Pure. The plane's x and y come from the order the reference's corners were
// read in; when they and up form a left-handed set, y is negated, so the
// exported room is the real one and not its mirror image.
import type { V3 } from "../../../measure/vec";
import { heightAt, type Shell } from "./shell";

export type Face = {
  name: string;
  kind: "floor" | "wall" | "ceiling";
  at: number[];
};
export type Mesh = {
  /** Metres. The first `corners` are the floor in tap order; the ceiling
   * points follow in the same order when heights exist. */
  verts: V3[];
  faces: Face[];
  corners: number;
};

/** Null until the outline is closed. Floor only when no height was measured.
 * Faces are wound so their normals point into the room. */
export function shellMesh(shell: Shell, handed: 1 | -1): Mesh | null {
  const n = shell.floor.length;
  if (!shell.closed || n < 3) return null;
  const verts: V3[] = shell.floor.map((p) => [
      p.x / 1000,
      (handed * p.y) / 1000,
      0,
    ]),
    ring = verts.map((_, i) => i);
  let twice = 0;
  for (let i = 0; i < n; i++) {
    const a = verts[i],
      b = verts[(i + 1) % n];
    twice += a[0] * b[1] - b[0] * a[1];
  }
  // Counter-clockwise seen from above: the floor's normal points up.
  const ccw = twice >= 0,
    faces: Face[] = [
      { name: "floor", kind: "floor", at: ccw ? ring : ring.slice().reverse() },
    ];
  if (shell.meanHeight === null) return { verts, faces, corners: n };
  shell.floor.forEach((_, i) =>
    verts.push([verts[i][0], verts[i][1], (heightAt(shell, i) ?? 0) / 1000]),
  );
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n,
      quad = [i, j, n + j, n + i];
    faces.push({
      name: `wall_${i + 1}`,
      kind: "wall",
      at: ccw ? quad.reverse() : quad,
    });
  }
  const lid = ring.map((i) => n + i);
  faces.push({
    name: "ceiling",
    kind: "ceiling",
    at: ccw ? lid.reverse() : lid,
  });
  return { verts, faces, corners: n };
}

const num = (v: number) => {
  const t = v.toFixed(4);
  return /^-0\.0+$/.test(t) ? t.slice(1) : t;
};

/** Wavefront OBJ text: one group per face, 1-based vertex indices. */
export function meshObj(mesh: Mesh, note: string): string {
  const lines = [
    "# SPECTRA Ruler, Walls: a room shell from one picture.",
    "# Units: metres. z is up. Right-handed. Normals point into the room.",
    ...note.split("\n").map((l) => `# ${l}`),
    "o room_shell",
    ...mesh.verts.map((v) => `v ${num(v[0])} ${num(v[1])} ${num(v[2])}`),
  ];
  for (const f of mesh.faces)
    lines.push(`g ${f.name}`, `f ${f.at.map((i) => i + 1).join(" ")}`);
  return lines.join("\n") + "\n";
}
