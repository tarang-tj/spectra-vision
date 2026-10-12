/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { downloadText } from "../../../download";
import { useStudio } from "../../../studio-context";
import { planSvg } from "../plan/export-plan";
import { drawPrims } from "../plan/plan-draw";
import { LEGEND, layoutScene, type Prim } from "../plan/plan-layout";
import { fitBox, type Fit } from "../plan/topdown";
import type { Unit } from "../units";
import { keepOnly, pixelsOf, rasterVersion, subscribeRasters } from "./rasters";
import { roomCsv } from "./room-export";
import { mergeTopDown } from "./room-plan";
import {
  FULL_LABELS_FROM,
  keepInside,
  layoutExtras,
  planLayers,
  thinFor,
  WALL_LABELS_FROM,
} from "./room-plan-draw";
import { roomScene } from "./room-scene";
import type { RoomSolution } from "./room-solve";
import type { RoomState } from "./store";
import { picturesText, roomBasis } from "./text";
import type { View } from "./views-store";

/** The plan is never drawn wider than this, and is saved at this width. */
const FULL_WIDTH = 480;
type Drawn = { fit: Fit; prims: Prim[]; floor: HTMLCanvasElement };

/** The room seen from above: the floor of every picture on the plan laid in
 * one frame, with every shape on it, and "Save room plan". A picture that is
 * not on the plan is not drawn at all. */
export default function RoomPlanPanel({
  views,
  room,
  solution,
  unit,
}: {
  views: readonly View[];
  room: RoomState;
  solution: RoomSolution;
  unit: Unit;
}) {
  const { notice } = useStudio(),
    canvas = useRef<HTMLCanvasElement>(null),
    holder = useRef<HTMLDivElement>(null),
    [width, setWidth] = useState(0),
    [photo, setPhoto] = useState(false),
    pixels = useSyncExternalStore(subscribeRasters, rasterVersion),
    order = useMemo(() => views.map((v) => v.id), [views]),
    built = useMemo(() => {
      const on = solution.views.filter((v) => v.rigid).map((v) => v.id);
      return roomScene(views, solution, room, unit, roomBasis(on, order));
    }, [views, solution, room, unit, order]);

  const shown = !!built && views.length >= 2;
  // The plan is drawn at the size it is shown, so a label is as large on a
  // narrow rail as on a wide one, and it is drawn again when that changes.
  useEffect(() => {
    const el = holder.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const watch = new ResizeObserver(() => setWidth(el.clientWidth));
    watch.observe(el);
    setWidth(el.clientWidth);
    return () => watch.disconnect();
  }, [shown]);

  /** Draw the plan `wide` pixels wide; `el` is the canvas on the page, or
   * null for the full-size drawing that is saved. */
  const draw = useCallback(
    (wide: number, el: HTMLCanvasElement | null): Drawn | null => {
      if (!built) return null;
      const scene = thinFor(built, wide),
        fit = fitBox(scene.scene.bounds, wide, Math.round(wide * 0.75)),
        floor = document.createElement("canvas"),
        page = el ?? document.createElement("canvas");
      floor.width = page.width = fit.width;
      floor.height = page.height = fit.height;
      const fctx = floor.getContext("2d"),
        ctx = page.getContext("2d");
      if (!fctx || !ctx) return null;
      const layers = planLayers(views, solution, pixelsOf);
      if (layers.length) {
        const top = mergeTopDown(layers, fit).image;
        fctx.putImageData(new ImageData(top.data, top.w, top.h), 0, 0);
      }
      ctx.fillStyle = "#0b1214";
      ctx.fillRect(0, 0, fit.width, fit.height);
      ctx.drawImage(floor, 0, 0);
      const prims = keepInside(
        [...layoutScene(scene.scene, fit), ...layoutExtras(scene.extras, fit)],
        fit.width,
        fit.height,
        (text, size) => {
          ctx.font = `600 ${size}px system-ui, sans-serif`;
          return ctx.measureText(text).width;
        },
      );
      drawPrims(ctx, prims);
      return { fit, prims, floor };
    },
    [built, views, solution],
  );

  useEffect(() => {
    keepOnly(order);
    if (canvas.current && width)
      draw(Math.min(FULL_WIDTH, Math.max(160, width)), canvas.current);
  }, [draw, width, pixels, order]);

  if (!built || !shown) return null;
  const on = built.placed,
    off = views.filter((v) => !on.includes(v.id)).map((v) => v.id),
    noPicture = views.filter((v) => on.includes(v.id) && !v.blob).length;

  function save() {
    // The saved drawing is full size with every label, whatever the page shows.
    const out = draw(FULL_WIDTH, null);
    if (!out || !built) {
      notice("The plan is still drawing. Try again in a moment.");
      return;
    }
    try {
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-"),
        svg = planSvg(
          built.scene,
          out.fit,
          out.prims,
          photo ? out.floor.toDataURL("image/png") : null,
        );
      downloadText(`spectra-room-plan-${stamp}.svg`, svg, "image/svg+xml");
      setTimeout(
        () =>
          downloadText(
            `spectra-room-plan-${stamp}.csv`,
            roomCsv(views, solution, room.closed, unit),
            "text/csv",
          ),
        150,
      );
      notice("Room plan saved to your downloads.");
    } catch {
      notice("The plan could not be saved by this browser.");
    }
  }

  return (
    <div className="ruler-plan room-plan" ref={holder}>
      <h4>Room plan</h4>
      <canvas
        ref={canvas}
        role="img"
        data-testid="room-plan"
        data-pictures={on.length}
        data-labels={
          width >= FULL_LABELS_FROM
            ? "all"
            : width >= WALL_LABELS_FROM
              ? "walls"
              : "few"
        }
        aria-label={`The room seen from above, drawn to scale from ${picturesText(on, order)}, with the reference, every shape and the room's outline`}
      />
      <p className="ruler-basis" data-testid="room-plan-note">
        Drawn from {picturesText(on, order)}, each laid in the first picture's
        frame.{" "}
        {off.length
          ? `Not drawn: ${picturesText(off, order)}, which ${off.length === 1 ? "is" : "are"} not on the plan. `
          : ""}
        {noPicture
          ? "A picture that is not in the room file is drawn as lines only. "
          : ""}
        Where pictures overlap, the one that shows that patch of floor in more
        pixels is used, which is the nearer camera. A small cross is where one
        picture alone puts a point that several show. {LEGEND}{" "}
        {width < FULL_LABELS_FROM
          ? `This plan is under ${width < WALL_LABELS_FROM ? WALL_LABELS_FROM : FULL_LABELS_FROM} px wide, so ${width < WALL_LABELS_FROM ? "the wall lengths and " : ""}the smaller labels are left out here: every number is in the lists above, and the saved plan has them all.`
          : "Every number on the plan is also in the lists above."}
      </p>
      <div className="ruler-group" role="group" aria-label="Room plan">
        <button
          className="button"
          aria-pressed={photo}
          onClick={() => setPhoto(!photo)}
        >
          Include photos in the saved plan
        </button>
        <button className="button" onClick={save}>
          Save room plan
        </button>
      </div>
      <p className="ruler-basis">
        Save room plan downloads an SVG drawing and a CSV of every number with
        its bar and the pictures it rests on. Both stay on this device.
      </p>
    </div>
  );
}
