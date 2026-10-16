import { Component, Fragment, ReactNode } from "react";

const REMOUNT_DELAY_MS = 1000;

interface Props {
  children: ReactNode;
}

interface State {
  failed: boolean;
  generation: number;
}

// If anything in the stage throws while rendering or in an effect, show black for a
// moment and remount it from scratch instead of leaving React's blank error screen
// on the TV. Errors inside animation-frame callbacks don't reach here, but those
// loops schedule their next frame before rendering, so one bad frame doesn't stop them.
export class StageErrorBoundary extends Component<Props, State> {
  state: State = { failed: false, generation: 0 };
  private timer = 0;

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("[stage] crashed, remounting", error);
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(
      () => this.setState((s) => ({ failed: false, generation: s.generation + 1 })),
      REMOUNT_DELAY_MS,
    );
  }

  componentWillUnmount() {
    window.clearTimeout(this.timer);
  }

  render() {
    if (this.state.failed) return <main className="stage" />;
    return <Fragment key={this.state.generation}>{this.props.children}</Fragment>;
  }
}
