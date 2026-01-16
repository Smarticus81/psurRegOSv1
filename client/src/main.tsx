import React, { Component } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

type ErrorBoundaryState = {
  hasError: boolean;
  errorMessage: string | null;
  stack: string | null;
};

function reportClientError(payload: Record<string, unknown>) {
  fetch("/api/client-errors", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(() => {
    // Intentionally ignore reporting failures to avoid loops
  });
}

function installGlobalErrorHandlers() {
  if (typeof window === "undefined") return;
  const marker = "__psurClientErrorHandlersInstalled";
  if ((window as any)[marker]) return;
  (window as any)[marker] = true;

  window.addEventListener("error", event => {
    reportClientError({
      type: "error",
      message: event.error?.message || event.message || "Unknown error",
      stack: event.error?.stack || null,
      source: event.filename || null,
      line: event.lineno || null,
      column: event.colno || null,
      userAgent: navigator.userAgent,
      url: window.location.href,
    });
  });

  window.addEventListener("unhandledrejection", event => {
    const reason = event.reason as any;
    reportClientError({
      type: "unhandledrejection",
      message: reason?.message || String(reason || "Unhandled rejection"),
      stack: reason?.stack || null,
      userAgent: navigator.userAgent,
      url: window.location.href,
    });
  });
}

class AppErrorBoundary extends Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    errorMessage: null,
    stack: null,
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || "Unknown error",
      stack: error.stack || null,
    };
  }

  componentDidCatch(error: Error) {
    reportClientError({
      type: "error-boundary",
      message: error.message || "Unknown error",
      stack: error.stack || null,
      userAgent: navigator.userAgent,
      url: window.location.href,
    });
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="max-w-2xl rounded border border-destructive/30 bg-card p-6 text-card-foreground shadow">
          <h1 className="mb-2 text-xl font-semibold">Application Error</h1>
          <p className="mb-4 text-sm text-muted-foreground">
            A runtime error occurred. The details have been recorded.
          </p>
          <div className="mb-4 rounded bg-muted p-3 text-sm text-foreground">
            <div className="font-medium">Message</div>
            <div className="break-words">{this.state.errorMessage}</div>
          </div>
          {this.state.stack ? (
            <pre className="mb-4 max-h-64 overflow-auto rounded bg-muted p-3 text-xs text-foreground">
              {this.state.stack}
            </pre>
          ) : null}
          <button
            type="button"
            onClick={this.handleReload}
            className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}

installGlobalErrorHandlers();

createRoot(document.getElementById("root")!).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>
);
