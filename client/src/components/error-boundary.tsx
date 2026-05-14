import { Component, type ReactNode, type ErrorInfo } from "react";
import { useLocation } from "wouter";
import { AlertTriangle, RefreshCw, Home, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  section?: string;
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

  handleBack = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.history.back();
  };

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      const { section } = this.props;

      return (
        <div
          className="min-h-screen flex flex-col items-center justify-center bg-gray-50 text-center px-4"
          data-testid="error-boundary"
        >
          <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mb-6">
            <AlertTriangle className="w-10 h-10 text-[#FF385C]" />
          </div>

          <h1 className="text-3xl font-bold text-slate-900 mb-2">
            Something went wrong
          </h1>
          <p className="text-slate-500 max-w-md mb-2">
            {section
              ? `An error occurred in the ${section} section. Other parts of the app are unaffected — use the buttons below to recover.`
              : "An unexpected error occurred. You can try going back, refreshing, or returning home."}
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
              onClick={this.handleBack}
              variant="outline"
              className="rounded-full px-6 gap-2"
              data-testid="error-boundary-back"
            >
              <ArrowLeft className="w-4 h-4" />
              Go Back
            </Button>
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

/**
 * Route-level error boundary that automatically resets whenever the user
 * navigates to a different URL. A crash on one page will never bleed into
 * another — navigating away always gives a fresh start.
 */
export function RouteErrorBoundary({ children, section }: { children: ReactNode; section?: string }) {
  const [location] = useLocation();
  return (
    <ErrorBoundary key={location} section={section}>
      {children}
    </ErrorBoundary>
  );
}

export default ErrorBoundary;
