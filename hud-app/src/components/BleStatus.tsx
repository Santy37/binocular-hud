/* ── BleStatus: connection button + live telemetry badge ──────────── */

import { useEffect, useState } from "react";
import { bleManager, BleManager, type BleConnectionState } from "../lib/ble";
import type { TelemetrySnapshot, ModuleStatus } from "../lib/payloadTypes";

const STATE_LABEL: Record<BleConnectionState, string> = {
  disconnected: "Connect ESP32",
  connecting: "Connecting…",
  connected: "Connected",
  error: "Retry Connection",
};

const STATE_COLOR: Record<BleConnectionState, string> = {
  disconnected: "rgba(255,255,255,0.5)",
  connecting: "#f5a623",
  connected: "#4cd964",
  error: "#ff3b30",
};

interface Props {
  onTelemetry?: (t: TelemetrySnapshot) => void;
}

export default function BleStatus({ onTelemetry }: Props) {
  const [connState, setConnState] = useState<BleConnectionState>(
    bleManager.state,
  );
  const [battery, setBattery] = useState<number | null>(null);
  const [modules, setModules] = useState<ModuleStatus | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  // Subscribe to BLE events
  useEffect(() => {
    const unsubs: (() => void)[] = [];

    unsubs.push(
      bleManager.on("connectionChange", (state) => {
        setConnState(state);
        if (state === "disconnected") {
          setBattery(null);
          setModules(null);
        }
      }),
    );

    unsubs.push(
      bleManager.on("telemetry", (snap) => {
        setBattery(snap.battery);
        setModules(snap.modules);
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

  // Poll pending queue count
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      const { pendingCount: pc } = await import("../lib/api");
      const n = await pc();
      if (alive) setPendingCount(n);
    };
    poll();
    const id = setInterval(poll, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

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
        ? "0 0 6px rgba(76,217,100,0.6)"
        : undefined,
  };

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

      {/* Error toast */}
      {lastError && (
        <div className="bleError smallText">{lastError}</div>
      )}

      {/* Live stats when connected */}
      {connState === "connected" && (
        <div className="telemetryBox">
          <div className="telemetryRow">
            <span>Battery</span>
            <span className="telemetryValue">
              {battery !== null ? `${battery}%` : "--"}
            </span>
          </div>

          {modules &&
            (Object.entries(modules) as [string, string][]).map(
              ([mod, status]) => (
                <div className="telemetryRow" key={mod}>
                  <span>{mod.toUpperCase()}</span>
                  <span
                    className="telemetryValue"
                    style={{
                      color:
                        status === "ok"
                          ? "#4cd964"
                          : status === "degraded"
                          ? "#f5a623"
                          : "#ff3b30",
                    }}
                  >
                    {status}
                  </span>
                </div>
              ),
            )}

          {pendingCount > 0 && (
            <div className="telemetryRow">
              <span>Queued</span>
              <span className="telemetryValue" style={{ color: "#f5a623" }}>
                {pendingCount} pin{pendingCount !== 1 ? "s" : ""}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Re-export for convenience
export { bleManager, BleManager } from "../lib/ble";
