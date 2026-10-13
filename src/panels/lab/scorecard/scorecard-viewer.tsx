/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { useEffect, useMemo, useRef, useState } from "react";
import { STYLE, drawScore } from "./draw-score";
import { pointsOf } from "./score-prepare";
import type { RunResult } from "./score-run";
import { labelsOf } from "./score-set";
import {
  LABELS_CREDIT,
  LEGEND,
  ONLY_WRONG,
  countsLine,
  itemLine,
  pictureOf,
} from "./score-wording";

const KEYS = ["hit", "miss", "false", "crowd"] as const;

/** Steps through the scored pictures of one run: the photograph, unchanged,
 * with the labels and boxes drawn over it, the same things as a list, the
 * counts, and the photograph's credit. */
export default function ScorecardViewer(props: {
  result: RunResult;
  confidence: number;
  base: string;
}) {
  const { result, confidence, base } = props,
    finished = result.runs.filter((run) => run.status === "ok"),
    [chosen, setChosen] = useState(0),
    [at, setAt] = useState(0),
    [onlyWrong, setOnlyWrong] = useState(false),
    canvas = useRef<HTMLCanvasElement>(null),
    run = finished[Math.min(chosen, finished.length - 1)];
  const points = useMemo(
    () => (run ? pointsOf(run, result, confidence) : []),
    [run, result, confidence],
  );
  const shown = points
      .map((_, index) => index)
      .filter((i) => !onlyWrong || points[i].misses + points[i].falses > 0),
    place = Math.min(at, Math.max(0, shown.length - 1)),
    index = shown[place],
    item = index === undefined ? null : result.items[index],
    point = index === undefined ? null : points[index];
  useEffect(() => {
    if (canvas.current && item && point)
      drawScore(canvas.current, item, labelsOf(item), point);
  }, [item, point]);
  if (!run) return null;
  return (
    <div className="score-viewer">
      <h4>Look at the pictures</h4>
      <div className="score-steps">
        <label>
          Run{" "}
          <select
            value={chosen}
            onChange={(event) => setChosen(Number(event.target.value))}
          >
            {finished.map((each, i) => (
              <option key={each.target.id} value={i}>
                {each.target.label} on {each.target.delegate}
              </option>
            ))}
          </select>
        </label>
        <button
          className="button compact"
          disabled={place <= 0}
          onClick={() => setAt(place - 1)}
        >
          Previous
        </button>
        <button
          className="button compact"
          disabled={place >= shown.length - 1}
          onClick={() => setAt(place + 1)}
        >
          Next
        </button>
        <span data-testid="score-place">
          {shown.length ? pictureOf(place + 1, shown.length) : "No picture"}
        </span>
        <label>
          <input
            type="checkbox"
            checked={onlyWrong}
            onChange={() => {
              setOnlyWrong(!onlyWrong);
              setAt(0);
            }}
          />
          {ONLY_WRONG}
        </label>
      </div>
      {item && point && (
        <>
          <div className="score-picture">
            <img
              src={`${base}eval/${item.file}`}
              width={item.width}
              height={item.height}
              alt={`Photograph ${item.id} of the scorecard set`}
            />
            <canvas ref={canvas} aria-hidden="true" />
          </div>
          <ul className="score-legend">
            {KEYS.map((key) => (
              <li key={key}>
                <i
                  style={{
                    borderColor: STYLE[key].color,
                    borderStyle: STYLE[key].dash.length ? "dashed" : "solid",
                  }}
                />
                {LEGEND[key]}
              </li>
            ))}
          </ul>
          <ul className="score-items lab-note" data-testid="score-items">
            {point.items.map((each, i) => (
              <li key={i}>{itemLine(each)}</li>
            ))}
          </ul>
          <p className="lab-note" data-testid="score-counts">
            {countsLine(point.hits, point.misses, point.falses, confidence)}
          </p>
          <p className="lab-note score-credit" data-testid="score-credit">
            Photo: "<a href={item.page}>{item.title}</a>" by {item.author},{" "}
            <a href={item.licenseUrl}>{item.license}</a>, shown unchanged.{" "}
            {LABELS_CREDIT.replace("CC BY 4.0.", "")}
            <a href={result.set.labelsUrl}>CC BY 4.0</a>.
          </p>
        </>
      )}
    </div>
  );
}
