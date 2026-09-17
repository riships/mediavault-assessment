import { Component, type ErrorInfo, type ReactNode } from 'react';

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode | ((error: Error, reset: () => void) => ReactNode);
  onReset?: () => void;
  resetKeys?: unknown[];
  className?: string;
  title?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error boundary component that catches unhandled React runtime errors,
 * prevents the whole page from blanking, and provides a clear way back.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, State> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught error:', error, errorInfo);
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (this.state.hasError && this.props.resetKeys) {
      const hasChanged = this.props.resetKeys.some(
        (key, i) => key !== prevProps.resetKeys?.[i],
      );
      if (hasChanged) {
        this.handleReset();
      }
    }
  }

  handleReset = () => {
    this.props.onReset?.();
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (typeof this.props.fallback === 'function') {
        return this.props.fallback(
          this.state.error ?? new Error('Unknown rendering error'),
          this.handleReset,
        );
      }
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div
          className={`error-boundary${this.props.className ? ` ${this.props.className}` : ''}`}
          role="alert"
        >
          <div className="error-boundary__card">
            <h2>{this.props.title || 'Something went wrong'}</h2>
            <p className="muted">
              {this.state.error?.message || 'An unexpected rendering error occurred.'}
            </p>
            <div className="error-boundary__actions">
              <button type="button" onClick={this.handleReset}>
                Try again
              </button>
              <button type="button" onClick={() => window.location.reload()}>
                Reload page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
