/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { Component, type ErrorInfo, type ReactNode } from "react";
import { testHooksEnabled } from "../test-hooks";

type Props = {
  /** What is inside, as the subject of the message: "The Ruler panel". */
  name: string;
  children: ReactNode;
};
type State = { failed: boolean };

/** Browser tests only (a page opened with `?spectra-test`): throws while
 * `window.__spectraFault` is this boundary's name. It stands in for a panel
 * that fails, since no shipped panel has an input known to make it throw. */
function TestFault({ name }: { name: string }) {
  if ((window as { __spectraFault?: string }).__spectraFault === name)
    throw new Error(`test fault in ${name}`);
  return null;
}

/** Keeps a throw while rendering one part of the rail inside that part: the
 * part shows a plain message with a way to try again, the error is logged
 * once, and the stage and everything else on the page go on working. Give it
 * a `key` that changes with its content, so another panel starts clean. */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      `[spectra] ${this.props.name} failed to render:`,
      error,
      info.componentStack,
    );
  }

  render() {
    const { name, children } = this.props;
    if (this.state.failed)
      return (
        <div className="panel-fault" role="alert" data-testid="panel-fault">
          <p>
            {name} stopped on an error. The stage and the rest of the app still
            work.
          </p>
          <button
            className="button compact"
            onClick={() => this.setState({ failed: false })}
          >
            Try again
          </button>
        </div>
      );
    return (
      <>
        {testHooksEnabled() && <TestFault name={name} />}
        {children}
      </>
    );
  }
}
