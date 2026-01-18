import { Database } from "bun:sqlite";
import { readFileSync } from "fs";
import { join, dirname } from "path";

const dbPath = join(dirname(dirname(dirname(import.meta.path))), "data", "aod.db");
const schemaPath = join(dirname(import.meta.path), "schema.sql");

console.log("Initializing SQLite database...");
console.log("Database path:", dbPath);
console.log("Schema path:", schemaPath);

const db = new Database(dbPath, { create: true });

// Read and execute schema
const schema = readFileSync(schemaPath, "utf-8");
db.exec(schema);

// Verify tables were created
const tables = db.query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
console.log("\nCreated tables:");
tables.forEach((t: any) => console.log(`  - ${t.name}`));

// Test write operation
const testResult = db.query("SELECT 1 as test").get();
console.log("\nDatabase test:", testResult);

db.close();
console.log("\nSQLite database initialized successfully!");
