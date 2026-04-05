// Database initialisation — run once with: npm run db:init
import pool from "./pool.js";

const SQL = `
-- Enable PostGIS if available (optional — graceful skip if not installed)
-- CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS pins (
  -- Primary key: UUID generated on the ESP32
  id            TEXT PRIMARY KEY,

  -- Timestamps
  received_at   BIGINT NOT NULL,           -- epoch-ms stamped on phone
  created_at    TIMESTAMPTZ DEFAULT NOW(),  -- when server stored it

  -- Observer position at moment of ping
  observer_lat  DOUBLE PRECISION NOT NULL,
  observer_lon  DOUBLE PRECISION NOT NULL,
  observer_alt  DOUBLE PRECISION,
  observer_acc  DOUBLE PRECISION,

  -- Computed target waypoint
  target_lat    DOUBLE PRECISION NOT NULL,
  target_lon    DOUBLE PRECISION NOT NULL,
  target_alt    DOUBLE PRECISION,

  -- Aiming data used for the computation
  bearing_deg   DOUBLE PRECISION,
  pitch_deg     DOUBLE PRECISION,
  range_m       DOUBLE PRECISION,
  lidar_quality INTEGER,

  -- Optional label
  label         TEXT,

  -- Full telemetry snapshot stored as JSONB for flexibility
  telemetry     JSONB
);

-- Index for time-based queries (newest first)
CREATE INDEX IF NOT EXISTS idx_pins_created ON pins (created_at DESC);
`;

async function init() {
  console.log("Initialising database...");
  await pool.query(SQL);
  console.log("✓ pins table ready");
  await pool.end();
}

init().catch((err) => {
  console.error("DB init failed:", err);
  process.exit(1);
});
