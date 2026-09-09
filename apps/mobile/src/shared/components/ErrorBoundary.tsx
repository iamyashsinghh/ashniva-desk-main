import { Component, type ErrorInfo, type ReactNode } from 'react';
import { View } from 'react-native';

import { AppText, Button, Screen } from './primitives';

/**
 * The last line of defence.
 *
 * Without this, a render error in one screen unmounts the whole tree and the app shows a blank
 * white rectangle — which, on a phone, is indistinguishable from a crash. This catches it and
 * offers a way back.
 *
 * The message is deliberately not shown to the person. A React error message can contain data
 * from the record being rendered, and a crash screen is not a place to leak it. It goes to the
 * console for a developer instead.
 */

interface Props {
  children: ReactNode;
  /** Called when the person taps "Start again", to send them somewhere safe. */
  onReset?: () => void;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled error in the render tree', error, info.componentStack);
  }

  private readonly reset = () => {
    this.setState({ hasError: false });
    this.props.onReset?.();
  };

  override render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <Screen>
        <View style={{ flex: 1, gap: 16, justifyContent: 'center', padding: 24 }}>
          <AppText size="xl" weight="bold">
            Something went wrong
          </AppText>
          <AppText tone="muted">
            This screen could not be shown. Nothing you did has been lost — go back and try again.
          </AppText>
          <Button label="Start again" onPress={this.reset} />
        </View>
      </Screen>
    );
  }
}
