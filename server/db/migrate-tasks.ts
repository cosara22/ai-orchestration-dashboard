import { Database } from "bun:sqlite";
import { join, dirname } from "path";

const dbPath = join(dirname(dirname(dirname(import.meta.path))), "data", "aod.db");

console.log("Migrating tasks table...");
console.log("Database path:", dbPath);

const db = new Database(dbPath);

// Check if description column exists
const tableInfo = db.query("PRAGMA table_info(tasks)").all() as Array<{ name: string }>;
const columnNames = tableInfo.map((col) => col.name);

if (!columnNames.includes("description")) {
  console.log("Adding description column...");
  db.exec("ALTER TABLE tasks ADD COLUMN description TEXT");
}

if (!columnNames.includes("priority")) {
  console.log("Adding priority column...");
  db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT DEFAULT 'medium'");
}

if (!columnNames.includes("project")) {
  console.log("Adding project column...");
  db.exec("ALTER TABLE tasks ADD COLUMN project TEXT");
}

// Make session_id nullable if needed (SQLite doesn't support ALTER COLUMN, but the schema allows NULL)
console.log("Current tasks table structure:");
const updatedInfo = db.query("PRAGMA table_info(tasks)").all();
console.log(updatedInfo);

db.close();
console.log("\nTasks table migration completed!");
