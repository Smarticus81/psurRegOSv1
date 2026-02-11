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
      <div className="flex h-screen w-full items-center justify-center p-6">
        <div className="glass-card max-w-2xl w-full p-12 text-center space-y-8 shadow-2xl animate-scale-in">
          <div className="w-20 h-20 rounded-3xl bg-destructive/10 flex items-center justify-center mx-auto text-destructive shadow-sm">
            <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div className="space-y-2">
            <h1 className="text-4xl font-black tracking-tighter text-foreground">Kernel Panic</h1>
            <p className="text-lg text-muted-foreground font-medium">
              A critical runtime exception has been identified and reported to the orchestration layer.
            </p>
          </div>
          <div className="text-left space-y-4">
            <div className="p-6 rounded-3xl bg-secondary/50 font-mono text-sm text-foreground/80 break-words shadow-inner">
              <div className="font-black text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Diagnostic Data</div>
              {this.state.errorMessage}
            </div>
          </div>
          <button
            type="button"
            onClick={this.handleReload}
            className="glossy-button bg-primary text-white py-4 px-12 text-lg font-black shadow-xl hover:scale-105 active:scale-95 transition-all w-full"
          >
            REINITIALIZE SYSTEM
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
