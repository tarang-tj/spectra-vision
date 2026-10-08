/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { useCallback, useEffect, useRef, useState } from "react";

/** One short status line at a time, cleared after a few seconds. */
export function useToast(): [string, (text: string) => void] {
  const [toast, setToast] = useState(""),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notice = useCallback((text: string) => {
    setToast(text);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(""), 3200);
  }, []);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return [toast, notice];
}
