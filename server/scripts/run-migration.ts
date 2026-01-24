import "dotenv/config";
import fs from "fs";
import path from "path";
import { pool } from "../db";

async function runMigration() {
  try {
    const migrationPath = path.join(process.cwd(), "migrations", "0006_content_traces.sql");
    const sql = fs.readFileSync(migrationPath, "utf8");
    
    console.log("Running migration: 0006_content_traces.sql");
    await pool.query(sql);
    console.log("Migration completed successfully!");
  } catch (error: any) {
    console.error("Migration failed:", error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
