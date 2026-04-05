// Pin routes — POST /api/pins + GET /api/pins
import { Router } from "express";
import db from "../db/pool.js";

const router = Router();

/* Prepared statements (faster than re-parsing each time) */
const insertPin = db.prepare(`
  INSERT OR IGNORE INTO pins (
    id, received_at,
    observer_lat, observer_lon, observer_alt, observer_acc,
    target_lat, target_lon, target_alt,
    bearing_deg, pitch_deg, range_m, lidar_quality,
    label, telemetry
  ) VALUES (
    @id, @receivedAt,
    @observerLat, @observerLon, @observerAlt, @observerAcc,
    @targetLat, @targetLon, @targetAlt,
    @bearingDeg, @pitchDeg, @rangeM, @lidarQuality,
    @label, @telemetry
  )
`);

const selectPins = db.prepare(`
  SELECT * FROM pins ORDER BY created_at DESC LIMIT 100
`);

// POST /api/pins — receive a pin from the phone PWA
router.post("/", (req, res) => {
  try {
    const p = req.body;

    // Basic server-side validation
    const errors = [];
    if (!p.id) errors.push("missing id");
    if (!p.observer?.lat || !p.observer?.lon) errors.push("missing observer position");
    if (!p.target?.lat || !p.target?.lon) errors.push("missing target position");
    if (Math.abs(p.target.lat) > 90) errors.push("target.lat out of range");
    if (Math.abs(p.target.lon) > 180) errors.push("target.lon out of range");

    if (errors.length) {
      return res.status(400).json({ ok: false, pinId: p.id ?? null, error: errors.join(", ") });
    }

    insertPin.run({
      id: p.id,
      receivedAt: p.receivedAt ?? Date.now(),
      observerLat: p.observer.lat,
      observerLon: p.observer.lon,
      observerAlt: p.observer.altM ?? null,
      observerAcc: p.observer.accM ?? null,
      targetLat: p.target.lat,
      targetLon: p.target.lon,
      targetAlt: p.target.altEstM ?? null,
      bearingDeg: p.aiming?.bearingDeg ?? null,
      pitchDeg: p.aiming?.pitchDeg ?? null,
      rangeM: p.aiming?.rangeM ?? null,
      lidarQuality: p.aiming?.lidarQuality ?? null,
      label: p.label ?? null,
      telemetry: p.telemetry ? JSON.stringify(p.telemetry) : null,
    });

    console.log(`[PIN] stored ${p.id} → (${p.target.lat.toFixed(5)}, ${p.target.lon.toFixed(5)})`);
    return res.json({ ok: true, pinId: p.id });
  } catch (err) {
    console.error("[PIN] insert error:", err);
    return res.status(500).json({ ok: false, pinId: req.body?.id ?? null, error: "internal server error" });
  }
});

// GET /api/pins — retrieve stored waypoints (newest first)
router.get("/", (_req, res) => {
  try {
    const rows = selectPins.all();
    return res.json({ ok: true, pins: rows });
  } catch (err) {
    console.error("[PIN] query error:", err);
    return res.status(500).json({ ok: false, error: "internal server error" });
  }
});

export default router;
