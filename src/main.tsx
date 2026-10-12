/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/inter";
import "./styles/index.css";
import App from "./App";
import { exposeTestProbes } from "./test-hooks";

exposeTestProbes();
// An error a boundary catches is logged once, by that boundary, with the name
// of what failed (components/ErrorBoundary.tsx), so React's own log is off.
createRoot(document.getElementById("root")!, {
  onCaughtError: () => {},
}).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
