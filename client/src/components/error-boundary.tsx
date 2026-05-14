import { Component, type ReactNode, type ErrorInfo } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    console.error("[ErrorBoundary] Caught error:", error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleHome = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.href = "/";
  };

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div
          className="min-h-screen flex flex-col items-center justify-center bg-gray-50 text-center px-4"
          data-testid="error-boundary"
        >
          <div className="w-24 h-24 bg-red-50 rounded-full flex items-center justify-center mb-6">
            <AlertTriangle className="w-12 h-12 text-[#FF385C]" />
          </div>

          <h1 className="text-3xl font-bold text-slate-900 mb-2">
            Something went wrong
          </h1>
          <p className="text-slate-500 max-w-md mb-2">
            An unexpected error occurred on this page. You can try refreshing,
            going back, or returning home.
          </p>

          {this.state.error && (
            <p
              className="text-sm text-slate-400 max-w-md mb-8 font-mono bg-slate-100 rounded-lg px-3 py-2"
              data-testid="error-boundary-message"
            >
              {this.state.error.message}
            </p>
          )}

          <div className="flex flex-wrap gap-3 justify-center">
            <Button
              onClick={this.handleRetry}
              variant="outline"
              className="rounded-full px-6"
              data-testid="error-boundary-retry"
            >
              Try Again
            </Button>
            <Button
              onClick={this.handleReload}
              variant="outline"
              className="rounded-full px-6 gap-2"
              data-testid="error-boundary-reload"
            >
              <RefreshCw className="w-4 h-4" />
              Reload Page
            </Button>
            <Button
              onClick={this.handleHome}
              className="rounded-full px-6 gap-2 bg-[#FF385C] hover:bg-[#FF385C]/90 text-white"
              data-testid="error-boundary-home"
            >
              <Home className="w-4 h-4" />
              Return Home
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
