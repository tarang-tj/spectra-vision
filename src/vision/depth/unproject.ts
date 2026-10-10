/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// A depth map to points in space, two ways. Pure.
//   metric  each map cell goes out along its camera ray to its fitted depth:
//           real positions in the camera's frame (x right, y down, z forward)
//   relief  no depth is known, so the picture is kept flat and each cell is
//           raised by the model's output: the shape of the scene's order,
//           not its geometry

export type Pinhole = {
  /** Focal length and principal point, in source pixels. */
  f: number;
  cx: number;
  cy: number;
  /** Source size in pixels. */
  width: number;
  height: number;
};

export type Cloud = {
  /** x, y, z per point. */
  positions: Float32Array;
  /** The map cell each point came from (to look its colour up). */
  cells: Uint32Array;
  count: number;
  /** The middle of the points and the radius of a ball that holds them. */
  centre: [number, number, number];
  radius: number;
};

/** The source pixel at the middle of map cell (col, row). */
export const cellCentre = (
  col: number,
  row: number,
  mapWidth: number,
  mapHeight: number,
  width: number,
  height: number,
) => ({
  x: ((col + 0.5) / mapWidth) * width,
  y: ((row + 0.5) / mapHeight) * height,
});

function finish(positions: Float32Array, cells: Uint32Array, n: number): Cloud {
  const low = [Infinity, Infinity, Infinity],
    high = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n; i++)
    for (let k = 0; k < 3; k++) {
      const v = positions[3 * i + k];
      if (v < low[k]) low[k] = v;
      if (v > high[k]) high[k] = v;
    }
  const centre: [number, number, number] = n
    ? [(low[0] + high[0]) / 2, (low[1] + high[1]) / 2, (low[2] + high[2]) / 2]
    : [0, 0, 0];
  return {
    positions: positions.subarray(0, 3 * n),
    cells: cells.subarray(0, n),
    count: n,
    centre,
    radius: n
      ? Math.hypot(high[0] - low[0], high[1] - low[1], high[2] - low[2]) / 2
      : 1,
  };
}

/** Metric points. `depthOf` gives a cell's depth along the camera axis from
 * the model's output, or null where it has none; such cells, and any deeper
 * than `maxDepth`, are left out. `undistort` maps a source pixel to the flat
 * picture the camera model describes (the lens correction), if there is one. */
export function unprojectMetric(
  values: Float32Array,
  mapWidth: number,
  mapHeight: number,
  camera: Pinhole,
  depthOf: (output: number) => number | null,
  maxDepth: number,
  undistort?: (p: { x: number; y: number }) => { x: number; y: number },
): Cloud {
  const positions = new Float32Array(values.length * 3),
    cells = new Uint32Array(values.length);
  let n = 0;
  for (let row = 0; row < mapHeight; row++)
    for (let col = 0; col < mapWidth; col++) {
      const cell = row * mapWidth + col,
        z = depthOf(values[cell]);
      if (z === null || !(z > 0) || z > maxDepth) continue;
      const centre = cellCentre(
          col,
          row,
          mapWidth,
          mapHeight,
          camera.width,
          camera.height,
        ),
        p = undistort ? undistort(centre) : centre;
      positions[3 * n] = ((p.x - camera.cx) / camera.f) * z;
      positions[3 * n + 1] = ((p.y - camera.cy) / camera.f) * z;
      positions[3 * n + 2] = z;
      cells[n++] = cell;
    }
  return finish(positions, cells, n);
}

/** How far the nearest value is raised, as a share of the picture's height. */
export const RELIEF_HEIGHT = 0.6;

/** Relief points: x across the picture (-aspect to aspect), y down (-1 to 1),
 * and z from 0 at the nearest value back to RELIEF_HEIGHT * 2 at the farthest.
 * Nothing here is a length. */
export function unprojectRelief(
  values: Float32Array,
  mapWidth: number,
  mapHeight: number,
  min: number,
  max: number,
): Cloud {
  const positions = new Float32Array(values.length * 3),
    cells = new Uint32Array(values.length),
    aspect = mapWidth / mapHeight,
    span = max - min,
    scale = span > 0 ? (2 * RELIEF_HEIGHT) / span : 0;
  let n = 0;
  for (let row = 0; row < mapHeight; row++)
    for (let col = 0; col < mapWidth; col++) {
      const cell = row * mapWidth + col;
      positions[3 * n] = (((col + 0.5) / mapWidth) * 2 - 1) * aspect;
      positions[3 * n + 1] = ((row + 0.5) / mapHeight) * 2 - 1;
      positions[3 * n + 2] = (max - values[cell]) * scale;
      cells[n++] = cell;
    }
  return finish(positions, cells, n);
}
