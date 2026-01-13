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

export const pool = new Pool({
  connectionString,
  ...(shouldUseSsl ? { ssl: { rejectUnauthorized: false } } : {}),
});
export const db = drizzle(pool, { schema });
