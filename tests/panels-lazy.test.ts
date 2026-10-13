/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The four large panels are fetched when their tab is first opened. Their
// definition files must stay thin: one static import of a panel body puts
// that body, and everything it reaches, back in the entry script.
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { isPanel, panels } from "../src/panels";
import { addressIn, lazyPanel } from "../src/panels/shared/lazy-panel";

const ON_DEMAND = ["lab", "library", "presence", "ruler"];
/** Every module a file imports with a static `import`, type imports left out
 * (they are erased). A dynamic `import("...")` is not one. */
const staticImports = (text: string) =>
  [
    ...text.matchAll(
      /^import\s+(?!type\s)(?:[^"';]*?\sfrom\s+)?["']([^"']+)["']/gm,
    ),
  ].map((match) => match[1]);
const source = (id: string) =>
  readFileSync(new URL(`../src/panels/${id}.tsx`, import.meta.url), "utf8");

describe("panels fetched on demand", () => {
  it("reads static imports, and only those", () => {
    expect(
      staticImports(
        'import a from "./a";\nimport {\n  b,\n} from "./b";\nimport "./c.css";\nimport type { D } from "./d";\nconst e = () => import("./e");\n',
      ),
    ).toEqual(["./a", "./b", "./c.css"]);
  });
  it.each(ON_DEMAND)("%s.tsx imports no panel body", (id) => {
    const imports = staticImports(source(id)),
      // The Library counts what Objects saw while its tab is closed.
      allowed = id === "library" ? ["./library/seen"] : [];
    expect(
      imports.filter((path) =>
        /^\.\/(ruler|lab|library|presence)(\/|$)/.test(path),
      ),
    ).toEqual(allowed);
    expect(imports).toContain("./shared/lazy-panel");
    expect(source(id)).toContain(`import("./${id}/panel")`);
    // A definition, not a body: no markup in it.
    expect(source(id)).not.toMatch(/<[A-Za-z]/);
  });
  it("still registers all five panels, each a valid definition", () => {
    expect(panels.map((panel) => panel.id)).toEqual([
      "inspect",
      "lab",
      "library",
      "ruler",
      "presence",
    ]);
    expect(panels.every(isPanel)).toBe(true);
  });
  it("says which panel is loading until its body arrives", () => {
    const Waiting = lazyPanel("Ruler", () => new Promise(() => {}));
    expect(typeof Waiting).toBe("function");
    expect(renderToStaticMarkup(createElement(Waiting))).toBe(
      '<p class="panel-loading" role="status">Loading the Ruler panel…</p>',
    );
  });
  it("reads the script's address from a failed import, and from nothing else", () => {
    const at = "http://x/spectra-vision/assets/panel-BIurUozo.js";
    // Chrome's words, then Firefox's.
    expect(
      addressIn(
        new TypeError(`Failed to fetch dynamically imported module: ${at}`),
      ),
    ).toBe(at);
    expect(
      addressIn(
        new TypeError(`error loading dynamically imported module: ${at}`),
      ),
    ).toBe(at);
    expect(
      addressIn(
        new TypeError("Failed: http://x/src/panels/ruler/panel.tsx?t=1"),
      ),
    ).toBe("http://x/src/panels/ruler/panel.tsx?t=1");
    // Safari names no address; a stylesheet that failed is not a script.
    expect(addressIn(new TypeError("Importing a module script failed."))).toBe(
      null,
    );
    expect(
      addressIn(
        new Error("Unable to preload CSS for http://x/assets/panel.css"),
      ),
    ).toBe(null);
    expect(addressIn("http://x/a.js")).toBe(null);
  });
});
