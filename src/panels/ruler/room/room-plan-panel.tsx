/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { downloadText } from "../../../download";
import { useStudio } from "../../../studio-context";
import { planSvg } from "../export-plan";
import { drawPrims } from "../plan-draw";
import { LEGEND, layoutScene, type Prim } from "../plan-layout";
import { fitBox, type Fit } from "../topdown";
import type { Unit } from "../units";
import { keepOnly, pixelsOf, rasterVersion, subscribeRasters } from "./rasters";
import { roomCsv } from "./room-export";
import { mergeTopDown } from "./room-plan";
import { layoutExtras, planLayers, roomScene } from "./room-scene";
import type { RoomSolution } from "./room-solve";
import type { RoomState } from "./store";
import { picturesText, roomBasis } from "./text";
import type { View } from "./views-store";

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
    drawn = useRef<Drawn | null>(null),
    [photo, setPhoto] = useState(false),
    pixels = useSyncExternalStore(subscribeRasters, rasterVersion),
    order = useMemo(() => views.map((v) => v.id), [views]),
    built = useMemo(() => {
      const on = solution.views.filter((v) => v.rigid).map((v) => v.id);
      return roomScene(views, solution, room, unit, roomBasis(on, order));
    }, [views, solution, room, unit, order]);

  useEffect(() => {
    const el = canvas.current;
    drawn.current = null;
    keepOnly(order);
    if (!built || !el) return;
    const fit = fitBox(built.scene.bounds),
      floor = document.createElement("canvas");
    floor.width = el.width = fit.width;
    floor.height = el.height = fit.height;
    const fctx = floor.getContext("2d"),
      ctx = el.getContext("2d");
    if (!fctx || !ctx) return;
    const layers = planLayers(views, solution, pixelsOf);
    if (layers.length) {
      const top = mergeTopDown(layers, fit).image;
      fctx.putImageData(new ImageData(top.data, top.w, top.h), 0, 0);
    }
    ctx.fillStyle = "#0b1214";
    ctx.fillRect(0, 0, fit.width, fit.height);
    ctx.drawImage(floor, 0, 0);
    const prims = [
      ...layoutScene(built.scene, fit),
      ...layoutExtras(built.extras, fit),
    ];
    drawPrims(ctx, prims);
    drawn.current = { fit, prims, floor };
  }, [built, views, solution, pixels, order]);

  if (!built || views.length < 2) return null;
  const on = built.placed,
    off = views.filter((v) => !on.includes(v.id)).map((v) => v.id),
    noPicture = views.filter((v) => on.includes(v.id) && !v.blob).length;

  function save() {
    const out = drawn.current;
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
    <div className="ruler-plan room-plan">
      <h4>Room plan</h4>
      <canvas
        ref={canvas}
        role="img"
        data-testid="room-plan"
        data-pictures={on.length}
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
        picture alone puts a point that several show. {LEGEND}
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
