// Shared types for ESP32 ↔ Phone ↔ Server payloads

/** Raw telemetry snapshot the ESP32 streams via BLE notify. */
export interface TelemetrySnapshot {
  /** ISO-8601 timestamp on the ESP32 (may drift — phone re-stamps). */
  ts: string;

  // IMU
  imu: {
    heading: number;   // degrees true-north
    pitch: number;     // degrees
    roll: number;      // degrees
  };

  // GNSS
  gnss: {
    lat: number;
    lon: number;
    altM: number;      // metres above sea level
    accM: number;      // horizontal accuracy estimate
    fix: "none" | "2d" | "3d" | "dgps";
    sats: number;
  };

  // Barometer
  baro: {
    pressHPa: number;
    tempC: number;
    altEstM: number;   // barometric altitude estimate
  };

  // LiDAR
  lidar: {
    rangeM: number;    // measured distance
    quality: number;   // signal quality 0-255
    valid: boolean;
  };

  // Device health
  battery: number;     // 0-100 %
  modules: ModuleStatus;
}

/** Per-module health flags advertised in telemetry. */
export interface ModuleStatus {
  imu: "ok" | "degraded" | "fail";
  gnss: "ok" | "degraded" | "fail";
  baro: "ok" | "degraded" | "fail";
  lidar: "ok" | "degraded" | "fail";
  hud: "ok" | "degraded" | "fail";
}

/**
 * Pin payload the ESP32 sends when the user presses the "ping" button.
 * This is the JSON blob that travels:  ESP32 → Phone → Server.
 */
export interface PinPayload {
  /** UUID generated on the ESP32 so both sides can track delivery. */
  id: string;

  /** Epoch-ms stamped on the phone when the payload arrives. */
  receivedAt: number;

  /** Observer position at moment of ping. */
  observer: {
    lat: number;
    lon: number;
    altM: number;
    accM: number;
  };

  /** Computed target waypoint. */
  target: {
    lat: number;
    lon: number;
    altEstM?: number;
  };

  /** Aiming data used for the computation. */
  aiming: {
    bearingDeg: number;
    pitchDeg: number;
    rangeM: number;
    lidarQuality: number;
  };

  /** Optional label (e.g. "waypoint", "poi"). */
  label?: string;

  /** Full telemetry snapshot embedded for server-side validation. */
  telemetry: TelemetrySnapshot;
}

// Server response

export interface ServerPinResponse {
  ok: boolean;
  pinId: string;
  error?: string;
}

// Payload validation

/** Quick client-side bounds check before POSTing. */
export function validatePinPayload(p: PinPayload): string[] {
  const errors: string[] = [];

  if (!p.id) errors.push("missing id");
  if (Math.abs(p.target.lat) > 90) errors.push("target.lat out of range");
  if (Math.abs(p.target.lon) > 180) errors.push("target.lon out of range");
  if (Math.abs(p.observer.lat) > 90) errors.push("observer.lat out of range");
  if (Math.abs(p.observer.lon) > 180) errors.push("observer.lon out of range");
  if (p.aiming.rangeM < 0 || p.aiming.rangeM > 50_000)
    errors.push("rangeM implausible");
  if (p.aiming.bearingDeg < 0 || p.aiming.bearingDeg > 360)
    errors.push("bearingDeg out of range");

  return errors;
}
