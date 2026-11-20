import React from 'react';
import { ServerErrorPage } from '../pages/ErrorPages';

interface ErrorBoundaryState {
  hasError: boolean;
  referenceId: string;
}

export class GlobalErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = {
      hasError: false,
      referenceId: '',
    };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    const ref = `MS-UI-${Math.random().toString(16).slice(2, 10).toUpperCase()}`;
    return {
      hasError: true,
      referenceId: ref,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // Log diagnostic information for developers without rendering stack traces in the UI
    console.error('[MarkSure GlobalErrorBoundary]', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, referenceId: '' });
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <ServerErrorPage
          referenceId={this.state.referenceId}
          onRetry={this.handleReset}
        />
      );
    }
    return this.props.children;
  }
}
