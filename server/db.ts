import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const connectionString = process.env.DATABASE_URL;

// Supabase / managed Postgres commonly requires SSL; local dev typically does not.
const shouldUseSsl =
  !connectionString.includes("localhost") &&
  !connectionString.includes("127.0.0.1") &&
  !connectionString.includes("0.0.0.0");

// Supabase pooler-optimized connection settings
export const pool = new Pool({
  connectionString,
  ...(shouldUseSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  // Pool sizing - Supabase transaction pooler allows many concurrent connections
  max: 10,
  min: 2,
  // Connection timeouts
  connectionTimeoutMillis: 8000,
  idleTimeoutMillis: 30000,
  // Keep connections alive - critical for Supabase pooler
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
  // Allow connections to be reused
  allowExitOnIdle: false,
});

// Handle pool errors to prevent uncaught exceptions crashing the process
pool.on('error', (err, client) => {
  console.error('[DB Pool] Unexpected error on idle client:', err.message);
  // Don't crash - pool will automatically remove the bad client and create a new one
});

// Handle connect events for debugging
pool.on('connect', (client) => {
  // Set statement timeout on each new connection to prevent long-running queries
  client.query('SET statement_timeout = 120000'); // 2 minutes
});

// Graceful shutdown helper
export async function closePool(): Promise<void> {
  console.log('[DB Pool] Closing connections...');
  await pool.end();
  console.log('[DB Pool] All connections closed');
}

export const db = drizzle(pool, { schema });

function isMessageMatch(message: string, patterns: string[]): boolean {
  const lower = message.toLowerCase();
  return patterns.some((pattern) => lower.includes(pattern));
}

export function isDatabaseConnectionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as any;
  const message = typeof err.message === "string" ? err.message : "";
  const code = typeof err.code === "string" ? err.code : "";
  if (
    [
      "ETIMEDOUT",
      "ECONNRESET",
      "ECONNREFUSED",
      "ENOTFOUND",
      "EHOSTUNREACH",
      "EPIPE",
    ].includes(code)
  ) {
    return true;
  }
  if (
    isMessageMatch(message, [
      "connection terminated",
      "connection reset",
      "connection ended",
      "getaddrinfo",
      "timeout",
    ])
  ) {
    return true;
  }
  if (Array.isArray(err.errors)) {
    return err.errors.some((inner: unknown) => isDatabaseConnectionError(inner));
  }
  return false;
}

// Retry wrapper for database operations with exponential backoff
export async function withDbRetry<T>(
  operation: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    operationName?: string;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelayMs = 500,
    maxDelayMs = 5000,
    operationName = "database operation",
  } = options;

  let lastError: Error | null = null;
  let delay = initialDelayMs;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;

      if (!isDatabaseConnectionError(error)) {
        // Non-connection error - don't retry
        throw error;
      }

      if (attempt === maxRetries) {
        console.error(`[DB Retry] ${operationName} failed after ${maxRetries} attempts:`, error.message);
        throw error;
      }

      console.warn(`[DB Retry] ${operationName} attempt ${attempt} failed: ${error.message}. Retrying in ${delay}ms...`);
      
      await new Promise(resolve => setTimeout(resolve, delay));
      delay = Math.min(delay * 2, maxDelayMs);
    }
  }

  throw lastError || new Error(`${operationName} failed after ${maxRetries} retries`);
}

// Connection health check
export async function isPoolHealthy(): Promise<boolean> {
  try {
    const client = await pool.connect();
    try {
      await client.query('SELECT 1');
      return true;
    } finally {
      client.release();
    }
  } catch {
    return false;
  }
}

// Force reconnect all pool clients
export async function refreshPool(): Promise<void> {
  console.log('[DB Pool] Refreshing connections...');
  try {
    // Drain idle clients
    const idleCount = pool.idleCount;
    const totalCount = pool.totalCount;
    console.log(`[DB Pool] Before refresh: ${idleCount} idle / ${totalCount} total`);
    
    // Close and reopen pool is too aggressive, instead just let bad connections expire
    // Pool will automatically replace them
  } catch (err: any) {
    console.error('[DB Pool] Refresh error:', err.message);
  }
}
