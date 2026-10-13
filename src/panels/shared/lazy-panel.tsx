/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// A panel whose body is fetched the first time its tab is opened, so the
// entry script carries only its definition. While the body is on its way the
// panel says so; when the fetch fails it says that, with a way to try again.
// This file lives in a subfolder because every .tsx file directly under
// src/panels is read as a panel (index.ts).
import { Component, Suspense, lazy, useState } from "react";
import type { ComponentType, ReactNode } from "react";

type Load = () => Promise<{ default: ComponentType }>;

/** The body's script could not be fetched. Anything else a panel throws is
 * its own fault and goes on to the rail's error boundary. */
class PanelLoadError extends Error {}

type Props = {
  label: string;
  /** A retry has already failed: only a reload can fetch the file now. */
  retried: boolean;
  onRetry(): void;
  children: ReactNode;
};

/** Catches a failed fetch of the body, and nothing else. */
class LoadBoundary extends Component<Props, { error: unknown }> {
  state = { error: null as unknown };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  render() {
    const { error } = this.state,
      { label, retried, onRetry, children } = this.props;
    if (!error) return children;
    // Thrown again from here, it reaches the boundary around the panel.
    if (!(error instanceof PanelLoadError)) throw error;
    return (
      <div className="panel-fault" role="alert" data-testid="panel-load-fault">
        <p>
          {retried
            ? `The ${label} panel still could not be loaded. Reload the page to fetch it again.`
            : `The ${label} panel could not be loaded. Check your connection and try again, or reload the page.`}
        </p>
        <button
          className="button compact"
          onClick={() => {
            if (retried) return location.reload();
            onRetry();
            this.setState({ error: null });
          }}
        >
          {retried ? "Reload the page" : "Try again"}
        </button>
      </div>
    );
  }
}

/** The address of the script a failed import names, if it names one. Chrome
 * and Firefox end the message with it. */
export const addressIn = (cause: unknown): string | null =>
  (cause instanceof Error &&
    /https?:\/\/\S+\.(?:js|tsx?)(?:\?\S*)?$/.exec(cause.message)?.[0]) ||
  null;

/** Whether a stylesheet link has no rules to give: its fetch failed. Chrome
 * still hangs a sheet on such a link, one whose rules cannot be read. */
function dead(link: HTMLLinkElement) {
  try {
    return !link.sheet?.cssRules;
  } catch {
    return true;
  }
}
/** A stylesheet whose fetch failed stays in the page as a dead link, and the
 * bundler's loader does not ask for it twice. Put a new link in its place. */
function refetchStyles() {
  for (const link of document.querySelectorAll<HTMLLinkElement>(
    'link[rel="stylesheet"]',
  ))
    if (link.href.startsWith(location.origin) && dead(link))
      link.replaceWith(link.cloneNode());
}

/** A panel component that loads `load` on first render. `label` is the tab's
 * own text. Once loaded, the body renders at once on every later visit. */
export function lazyPanel(label: string, load: Load): ComponentType {
  // Chrome keeps a failed fetch of a module for the life of the page: the
  // same import fails again at once, with no request (seen in Chrome 154). So
  // a retry asks for the address the failure named under a new query, which
  // is another address to the browser and the same file to the server. That
  // cannot help when the file that failed is one the body imports (a chunk
  // two panels share), so after one retry the button reloads the page.
  let failedAt: string | null = null,
    tries = 0,
    retried = false;
  const fetchBody = (): ReturnType<Load> =>
    (failedAt
      ? import(
          /* @vite-ignore */ `${failedAt}${failedAt.includes("?") ? "&" : "?"}retry=${++tries}`
        )
      : load()
    ).catch((cause: unknown) => {
      failedAt ??= addressIn(cause);
      throw new PanelLoadError(`The ${label} panel could not be loaded`, {
        cause,
      });
    });
  // React.lazy keeps a failed load for good, so each retry needs a new one.
  let Body = lazy(fetchBody);
  return function LazyPanel() {
    const [, setAttempt] = useState(0);
    return (
      <LoadBoundary
        label={label}
        retried={retried}
        onRetry={() => {
          retried = true;
          refetchStyles();
          Body = lazy(fetchBody);
          setAttempt((count) => count + 1);
        }}
      >
        <Suspense
          fallback={
            <p className="panel-loading" role="status">
              Loading the {label} panel…
            </p>
          }
        >
          <Body />
        </Suspense>
      </LoadBoundary>
    );
  };
}
