import Database from "better-sqlite3";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, "..", "..", "linkhud.db");

const db = Database(dbPath);

// Enable WAL mode for better concurrent read performance
db.pragma("journal_mode = WAL");

// Create table on first load
db.exec(`
  CREATE TABLE IF NOT EXISTS pins (
    id            TEXT PRIMARY KEY,
    received_at   INTEGER NOT NULL,
    created_at    TEXT DEFAULT (datetime('now')),
    observer_lat  REAL NOT NULL,
    observer_lon  REAL NOT NULL,
    observer_alt  REAL,
    observer_acc  REAL,
    target_lat    REAL NOT NULL,
    target_lon    REAL NOT NULL,
    target_alt    REAL,
    bearing_deg   REAL,
    pitch_deg     REAL,
    range_m       REAL,
    lidar_quality INTEGER,
    label         TEXT,
    telemetry     TEXT
  )
`);

export default db;
