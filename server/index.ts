import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { closePool, pool } from "./db";

// Global error handlers to prevent process crashes from unhandled errors
process.on('unhandledRejection', (reason, promise) => {
  // Check if this is a Windows file locking error (common with Puppeteer cleanup)
  const isFileLockError = reason && typeof reason === 'object' && 
    ('code' in reason) && 
    ((reason as any).code === 'EBUSY' || (reason as any).code === 'EPERM');
  
  // Check if this is a database connection error (recoverable)
  const isDbConnectionError = reason && typeof reason === 'object' &&
    reason instanceof Error && 
    (reason.message.includes('Connection terminated') || 
     reason.message.includes('connection reset') ||
     reason.message.includes('ECONNRESET'));
  
  if (isFileLockError) {
    console.warn('[Process] Ignored Windows file lock error (non-fatal):', (reason as any).path || reason);
  } else if (isDbConnectionError) {
    console.warn('[Process] Database connection error (pool will recover):', (reason as Error).message);
  } else {
    console.error('[Process] Unhandled Rejection:', reason);
  }
});

process.on('uncaughtException', (error) => {
  // Check if this is a Windows file locking error
  const isFileLockError = error && 
    ('code' in error) && 
    ((error as any).code === 'EBUSY' || (error as any).code === 'EPERM');
  
  // Check if this is a database connection error (recoverable - pool handles it)
  const isDbConnectionError = error && 
    (error.message.includes('Connection terminated') || 
     error.message.includes('connection reset') ||
     error.message.includes('ECONNRESET') ||
     error.message.includes('Connection ended'));
  
  if (isFileLockError) {
    console.warn('[Process] Ignored Windows file lock error (non-fatal):', (error as any).path || error.message);
  } else if (isDbConnectionError) {
    console.warn('[Process] Database connection terminated (pool will auto-recover):', error.message);
    // Don't exit - the pool will automatically create a new connection
  } else {
    console.error('[Process] Uncaught Exception:', error);
    // For non-recoverable errors, still exit to prevent undefined state
    process.exit(1);
  }
});

// Graceful shutdown handlers
async function gracefulShutdown(signal: string) {
  console.log(`[Process] Received ${signal}, shutting down gracefully...`);
  try {
    await closePool();
    process.exit(0);
  } catch (err) {
    console.error('[Process] Error during shutdown:', err);
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    limit: "50mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false, limit: "50mb" }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  try {
    await registerRoutes(httpServer, app);

    // Seed system prompts on startup (idempotent - only inserts missing prompts)
    try {
      const { seedSystemPrompts } = await import("./src/agents/llmService");
      const result = await seedSystemPrompts();
      if (result.seeded > 0) {
        log(`Seeded ${result.seeded} system prompts (${result.existing} already existed)`, "startup");
      }
    } catch (seedError: any) {
      console.error("======================================================");
      console.error("[STARTUP WARNING] Failed to seed system prompts!");
      console.error("Agents may fail until prompts are seeded.");
      console.error("Check /api/health or /api/system-instructions/status");
      console.error("Error:", seedError.message || seedError);
      console.error("======================================================");
      // Don't fail startup - prompts can still be seeded via the UI or on-demand
    }

    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";

      res.status(status).json({ message });
      throw err;
    });

    // importantly only setup vite in development and after
    // setting up all the other routes so the catch-all route
    // doesn't interfere with the other routes
    if (process.env.NODE_ENV === "production") {
      serveStatic(app);
    } else {
      const { setupVite } = await import("./vite");
      await setupVite(httpServer, app);
    }

    // ALWAYS serve the app on the port specified in the environment variable PORT
    // Other ports are firewalled. Default to 5000 if not specified.
    // this serves both the API and the client.
    // It is the only port that is not firewalled.
    const port = parseInt(process.env.PORT || "5000", 10);
    httpServer.listen(port, "0.0.0.0", () => {
      log(`serving on port ${port}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
      console.error("Error stack:", error.stack);
    }
    process.exit(1);
  }
})();
