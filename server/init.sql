-- Run this in Supabase SQL Editor to create the pins table
CREATE TABLE IF NOT EXISTS pins (
  id            TEXT PRIMARY KEY,
  received_at   BIGINT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now(),
  observer_lat  DOUBLE PRECISION NOT NULL,
  observer_lon  DOUBLE PRECISION NOT NULL,
  observer_alt  DOUBLE PRECISION,
  observer_acc  DOUBLE PRECISION,
  target_lat    DOUBLE PRECISION NOT NULL,
  target_lon    DOUBLE PRECISION NOT NULL,
  target_alt    DOUBLE PRECISION,
  bearing_deg   DOUBLE PRECISION,
  pitch_deg     DOUBLE PRECISION,
  range_m       DOUBLE PRECISION,
  lidar_quality INTEGER,
  label         TEXT,
  telemetry     JSONB
);
