/* ── BleStatus: connection button + fused telemetry panel ─────────── */

import { useEffect, useState } from "react";
import { bleManager, BleManager, type BleConnectionState } from "../lib/ble";
import type { TelemetrySnapshot } from "../lib/payloadTypes";

const STATE_LABEL: Record<BleConnectionState, string> = {
  disconnected: "Connect ESP32",
  connecting: "Connecting…",
  connected: "Connected",
  error: "Retry Connection",
};

const STATE_COLOR: Record<BleConnectionState, string> = {
  disconnected: "#4a7a9b",
  connecting: "#fbbf24",
  connected: "#34d399",
  error: "#f87171",
};

const MOD_COLOR: Record<string, string> = {
  ok: "#34d399",
  degraded: "#fbbf24",
  fail: "#f87171",
};

interface Props {
  onTelemetry?: (t: TelemetrySnapshot) => void;
}

export default function BleStatus({ onTelemetry }: Props) {
  const [connState, setConnState] = useState<BleConnectionState>(
    bleManager.state,
  );
  const [telemetry, setTelemetry] = useState<TelemetrySnapshot | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => {
    const unsubs: (() => void)[] = [];

    unsubs.push(
      bleManager.on("connectionChange", (state) => {
        setConnState(state);
        if (state === "disconnected") setTelemetry(null);
      }),
    );

    unsubs.push(
      bleManager.on("telemetry", (snap) => {
        setTelemetry(snap);
        onTelemetry?.(snap);
      }),
    );

    unsubs.push(
      bleManager.on("error", (err) => {
        setLastError(err);
        setTimeout(() => setLastError(null), 5000);
      }),
    );

    return () => unsubs.forEach((u) => u());
  }, [onTelemetry]);

  const isSupported = BleManager.isSupported();

  const handleClick = () => {
    if (connState === "connected") {
      bleManager.disconnect();
    } else {
      bleManager.connect();
    }
  };

  const dotStyle: React.CSSProperties = {
    width: 10,
    height: 10,
    borderRadius: "50%",
    background: STATE_COLOR[connState],
    display: "inline-block",
    marginRight: 8,
    boxShadow:
      connState === "connected"
        ? "0 0 6px rgba(52,211,153,0.6)"
        : undefined,
  };

  const t = telemetry;
  const m = t?.modules;

  return (
    <div className="bleStatusBox">
      {/* Connection button */}
      <button
        className="primaryBtn"
        onClick={handleClick}
        disabled={!isSupported || connState === "connecting"}
      >
        <span style={dotStyle} />
        {isSupported ? STATE_LABEL[connState] : "BLE Not Supported"}
      </button>

      {lastError && (
        <div className="bleError smallText">{lastError}</div>
      )}

      {/* Fused telemetry + module health */}
      {connState === "connected" && (
        <div className="telemetryBox">
          {/* Module status — pill badges */}
          {m && (
            <div className="moduleBadges">
              {(Object.entries(m) as [string, string][]).map(([mod, status]) => (
                <span
                  key={mod}
                  className="moduleBadge"
                  style={{
                    borderColor: MOD_COLOR[status] ?? "#555",
                    color: MOD_COLOR[status] ?? "#888",
                  }}
                >
                  {mod.toUpperCase()}
                </span>
              ))}
            </div>
          )}

          <div className="telemetryRow">
            <span>Battery</span>
            <span className="telemetryValue">{t ? `${t.battery}%` : "--"}</span>
          </div>
          <div className="telemetryRow">
            <span>GNSS</span>
            <span className="telemetryValue">
              {t ? `${t.gnss.fix.toUpperCase()} · ${t.gnss.sats} sats` : "--"}
            </span>
          </div>
          <div className="telemetryRow">
            <span>Heading</span>
            <span className="telemetryValue">{t ? `${t.imu.heading.toFixed(0)}°` : "--"}</span>
          </div>
          <div className="telemetryRow">
            <span>LiDAR</span>
            <span className="telemetryValue">
              {t?.lidar.valid ? `${t.lidar.rangeM.toFixed(1)} m` : "--"}
            </span>
          </div>
          <div className="telemetryRow">
            <span>Baro Alt</span>
            <span className="telemetryValue">{t ? `${t.baro.altEstM.toFixed(0)} m` : "--"}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export { bleManager, BleManager } from "../lib/ble";
