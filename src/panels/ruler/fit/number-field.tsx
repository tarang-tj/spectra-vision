/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { useState } from "react";

const close = (a: number, b: number) =>
  Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
const text = (v: number) => String(Number(v.toFixed(3)));

/** A labelled number input for a value kept elsewhere. What is typed stays as
 * typed (so "2." or an empty field can be passed through on the way to a
 * number), and a usable number is handed on at once. When the value changes
 * from outside (a button, Undo, another unit) the field shows the new value. */
export default function NumberField({
  label,
  value,
  onValue,
  usable,
  step = "any",
}: {
  label: string;
  value: number;
  onValue(next: number): void;
  /** Whether a typed number may be handed on. */
  usable(next: number): boolean;
  step?: string;
}) {
  // `base` is the outside value when the user last typed.
  const [typed, setTyped] = useState({ raw: text(value), base: value }),
    n = typed.raw.trim() === "" ? NaN : Number(typed.raw),
    ok = Number.isFinite(n) && usable(n),
    // Mid-edit text stands until the value moves without it.
    keep = ok ? close(n, value) : close(typed.base, value);
  return (
    <label>
      {label}
      <input
        type="number"
        inputMode="decimal"
        step={step}
        value={keep ? typed.raw : text(value)}
        aria-invalid={keep && !ok}
        onChange={(e) => {
          const raw = e.target.value,
            next = raw.trim() === "" ? NaN : Number(raw);
          setTyped({ raw, base: value });
          if (Number.isFinite(next) && usable(next)) onValue(next);
        }}
      />
    </label>
  );
}
