import { useEffect, useState, useCallback } from "react";
import MapView from "./components/MapView";
import BleStatus from "./components/BleStatus";
import MobileSheet, { type TabId } from "./components/MobileSheet";
import { bleManager } from "./lib/ble";
import type { BleConnectionState } from "./lib/ble";
import { destinationPoint } from "./lib/geo";
import { haversineMeters, fmtDist } from "./lib/distance";
import { useBlePipeline } from "./hooks/useBlePipeline";
import "./App.css";
import {
  getAllPins,
  addPin as persistPin,
  clearPins as clearPinsDb,
  pruneOldPins,
  type Pin,
} from "./lib/pinsStore";

export default function App() {
  const [pins, setPins] = useState<Pin[]>([]);
  const [basemap, setBasemap] = useState<"streets" | "satellite">("satellite");

  type UserLoc = { lat: number; lon: number; accM?: number };

  const [userLoc, setUserLoc] = useState<UserLoc | null>(null);
  const [deviceLoc, setDeviceLoc] = useState<UserLoc | null>(null);
  const [bleConnected, setBleConnected] = useState(false);
  const [locErr, setLocErr] = useState<string | null>(null);
  const [centerMeTick, setCenterMeTick] = useState(0);
  const [selectedPingId, setSelectedPingId] = useState<string | null>(null);

  // BLE pipeline: handles incoming pins from ESP32 → queue → server → ACK
  const handleBlePin = useCallback((pin: Pin) => {
    setPins((prev) => [pin, ...prev].slice(0, 6));
  }, []);

  const { latestTelemetry, queueSize, manualFlush } = useBlePipeline({
    onNewPin: handleBlePin,
  });

  // Mobile detection
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth <= 700);
  const [mobileTab, setMobileTab] = useState<TabId>("pings");
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 700);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Derive binocular location from BLE telemetry GNSS
  const binocularLoc = latestTelemetry &&
    latestTelemetry.gnss.fix !== "none"
    ? {
        lat: latestTelemetry.gnss.lat,
        lon: latestTelemetry.gnss.lon,
        sats: latestTelemetry.gnss.sats,
        fix: latestTelemetry.gnss.fix,
        accM: latestTelemetry.gnss.accM,
      }
    : null;

  // Whether ESP32 GPS is the active location source
  const usingEsp32 = bleConnected && binocularLoc != null;

  // Track BLE connection state
  useEffect(() => {
    const unsub = bleManager.on("connectionChange", (state: BleConnectionState) => {
      setBleConnected(state === "connected");
    });
    return unsub;
  }, []);

  /* When ESP32 has a GPS fix, use it as primary (blue dot).
   * Otherwise fall back to phone GPS (green dot).
   */
  useEffect(() => {
    if (usingEsp32) {
      setUserLoc({ lat: binocularLoc!.lat, lon: binocularLoc!.lon, accM: binocularLoc!.accM });
    } else if (deviceLoc) {
      setUserLoc(deviceLoc);
    }
  }, [usingEsp32, binocularLoc, deviceLoc]);

  // 1) LOAD pins on startup
  useEffect(() => {
    getAllPins()
      .then((loaded) => setPins(loaded.slice(0, 6)))
      .catch(console.error);
  }, []);

  // 2) WATCH device GPS location (always runs, stored separately)
  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setLocErr("Geolocation not supported in this browser.");
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setDeviceLoc({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accM: pos.coords.accuracy,
        });
        setLocErr(null);
      },
      (err) => {
        setLocErr(err.message);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 15000,
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // helper: add pin + persist to IndexedDB
  async function addPin(pin: Omit<Pin, "createdAt">) {
    const full: Pin = { ...pin, createdAt: Date.now() };

    setPins((prev) => [full, ...prev].slice(0, 6)); // ✅ limit to 6
    await persistPin(full);
    await pruneOldPins(6); // ✅ keep DB trimmed too
  }

  async function clearAllPins() {
    setPins([]);
    await clearPinsDb();
  }

const simulatePing = async () => {
  // use your current location if available, otherwise a default
  const observer = userLoc
    ? { lat: userLoc.lat, lon: userLoc.lon }
    : { lat: 28.6012, lon: -81.2005 };

  const bearingDeg = Math.random() * 360;
  const rangeM = 50 + Math.random() * 450;

  const dst = destinationPoint(observer.lat, observer.lon, bearingDeg, rangeM);

  await addPin({
    id: crypto.randomUUID(),
    lat: dst.lat,
    lon: dst.lon,
    label: "Ping",
    bearingDeg,
    rangeM,
    observerLat: observer.lat,
    observerLon: observer.lon,
    lidarQual: Math.floor(200 + Math.random() * 55), // fake quality for now
  });
};


  /* ── Shared UI fragments ── */
  const locationText = usingEsp32
    ? `ESP32: ${binocularLoc!.lat.toFixed(5)}, ${binocularLoc!.lon.toFixed(5)}`
    : userLoc
    ? `Phone: ${userLoc.lat.toFixed(5)}, ${userLoc.lon.toFixed(5)}`
    : locErr ?? "Getting location...";

  const pingListJsx = (
    <div className="pingList">
      {pins.length === 0 && <div className="smallText">No pings yet.</div>}
      {pins.map((p, idx) => {
        const dist = userLoc ? haversineMeters(userLoc.lat, userLoc.lon, p.lat, p.lon) : null;
        return (
          <div
            key={p.id}
            className="pingItem"
            onClick={() => setSelectedPingId(p.id)}
            style={{
              cursor: "pointer",
              outline: selectedPingId === p.id ? "2px solid rgba(94,196,245,0.7)" : "none",
            }}
          >
            <div className="pingRow">
              <div className="pingName">#{idx + 1} {p.label ?? "Ping"}</div>
              <div className="pingDist">{dist !== null ? fmtDist(dist) : "--"}</div>
            </div>
            <div className="pingMeta">({p.lat.toFixed(5)}, {p.lon.toFixed(5)})</div>
            <div className="pingMeta">
              {p.bearingDeg !== undefined && p.rangeM !== undefined
                ? `Bearing ${p.bearingDeg.toFixed(0)}° • Range ${p.rangeM.toFixed(0)}m`
                : "—"}
            </div>
            <div className="pingMeta">{new Date(p.createdAt).toLocaleTimeString()}</div>
          </div>
        );
      })}
    </div>
  );

  /* ── Mobile tab content ── */
  const mobileTabContent = () => {
    switch (mobileTab) {
      case "pings":
        return (
          <>
            <div className="sectionTitle" style={{ textAlign: "center" }}>Recent Pings</div>
            {pingListJsx}
          </>
        );
      case "esp32":
        return <BleStatus />;
      case "controls":
        return (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "4px 0" }}>
            <div className="smallText">{locationText}</div>
            <div style={{ display: "flex", gap: 8, width: "100%" }}>
              <select
                value={basemap}
                onChange={(e) => setBasemap(e.target.value as "streets" | "satellite")}
                className="select"
                style={{ flex: 1 }}
              >
                <option value="satellite">Satellite</option>
                <option value="streets">Streets</option>
              </select>
              <button onClick={simulatePing} className="secondaryBtn" style={{ flex: 1, padding: "8px 0" }}>
                Sim Ping
              </button>
            </div>
            <button onClick={clearAllPins} className="secondaryBtn" style={{ width: "100%" }}>
              Clear Pins ({pins.length})
            </button>
            {queueSize > 0 && (
              <button onClick={manualFlush} className="secondaryBtn" style={{ fontSize: 12, width: "100%" }}>
                {queueSize} unsent pin{queueSize !== 1 ? "s" : ""} — tap to retry
              </button>
            )}
          </div>
        );
    }
  };

  return (
  <div className="appRoot">
    {/* Full-screen map */}
    <div className="mapLayer">
      <MapView
        pins={pins}
        basemap={basemap}
        userLoc={userLoc}
        centerMeTick={centerMeTick}
        selectedPingId={selectedPingId}
        locSource={usingEsp32 ? "esp32" : "phone"}
      />
    </div>

    {/* ── Desktop layout (hidden on mobile via CSS) ── */}
    <div className="leftCluster desktop-only">
      <div className="controlCard">
        <div className="title">LINK Map</div>
        <BleStatus />
        <div style={{ display: "flex", gap: 8, width: "100%", maxWidth: 220 }}>
          <select
            value={basemap}
            onChange={(e) => setBasemap(e.target.value as "streets" | "satellite")}
            className="select"
            style={{ flex: 1 }}
          >
            <option value="satellite">Satellite</option>
            <option value="streets">Streets</option>
          </select>
          <button onClick={simulatePing} className="secondaryBtn" style={{ flex: 1, padding: "8px 0" }}>
            Sim Ping
          </button>
        </div>
        <div className="smallText">{locationText}</div>
        <div style={{ display: "flex", gap: 8, width: "100%", maxWidth: 220 }}>
          <button onClick={clearAllPins} className="secondaryBtn" style={{ flex: 1 }}>
            Clear Pins ({pins.length})
          </button>
        </div>
        {queueSize > 0 && (
          <button onClick={manualFlush} className="secondaryBtn" style={{ fontSize: 12 }}>
            {queueSize} unsent pin{queueSize !== 1 ? "s" : ""} — tap to retry
          </button>
        )}
      </div>
      <button
        className="centerBtn"
        title="Center on Me"
        onClick={() => setCenterMeTick((t) => t + 1)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
        </svg>
      </button>
    </div>

    <div className="pingCard desktop-only">
      <div className="sectionTitle" style={{ textAlign: "center" }}>Recent Pings</div>
      {pingListJsx}
    </div>

    {/* ── Mobile layout (hidden on desktop via CSS) ── */}
    {isMobile && (
      <>
        <button
          className="centerBtn mobile-center-btn"
          onClick={() => setCenterMeTick((t) => t + 1)}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
          </svg>
        </button>
        <MobileSheet activeTab={mobileTab} onTabChange={setMobileTab}>
          {mobileTabContent()}
        </MobileSheet>
      </>
    )}
  </div>
);

}
