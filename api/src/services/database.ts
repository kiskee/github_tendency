import { Pool } from "pg";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on("error", (err) => {
  console.error("PostgreSQL pool error:", err);
});

export async function runMigrations(): Promise<void> {
  try {
    await pool.query(`
      ALTER TABLE repositories
      ADD COLUMN IF NOT EXISTS open_issues INT DEFAULT 0,
      ADD COLUMN IF NOT EXISTS license VARCHAR(100),
      ADD COLUMN IF NOT EXISTS latest_release VARCHAR(255),
      ADD COLUMN IF NOT EXISTS languages JSONB,
      ADD COLUMN IF NOT EXISTS topics JSONB,
      ADD COLUMN IF NOT EXISTS homepage_url VARCHAR(512),
      ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS disk_usage INT DEFAULT 0
    `);
    console.log("[db] Migrations applied successfully");
  } catch (err) {
    console.error("[db] Migration failed:", err);
  }
}
