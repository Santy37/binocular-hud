import { useEffect, useState, useCallback } from "react";
import MapView from "./components/MapView";
import BleStatus from "./components/BleStatus";
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

  // Derive binocular location from BLE telemetry GNSS
  const binocularLoc = latestTelemetry &&
    latestTelemetry.gnss.fix !== "none"
    ? {
        lat: latestTelemetry.gnss.lat,
        lon: latestTelemetry.gnss.lon,
        sats: latestTelemetry.gnss.sats,
        fix: latestTelemetry.gnss.fix,
      }
    : null;

  const [followBinoc, setFollowBinoc] = useState(true);

  // 1) LOAD pins on startup
  useEffect(() => {
    getAllPins()
      .then((loaded) => setPins(loaded.slice(0, 6)))
      .catch(console.error);
  }, []);

  // 2) WATCH user's GPS location
  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setLocErr("Geolocation not supported in this browser.");
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setUserLoc({
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
        maximumAge: 0,     // don't reuse cached positions
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


  return (
  <div className="appRoot">
    {/* Full-screen map behind everything */}
    <div className="mapLayer">
      <MapView
        pins={pins}
        basemap={basemap}
        userLoc={userLoc}
        centerMeTick={centerMeTick}
        selectedPingId={selectedPingId}
        binocularLoc={binocularLoc}
        followBinoculars={followBinoc}
      />
    </div>

    {/* Left cluster: control card + center button */}
    <div className="leftCluster">
      <div className="controlCard">
        <div className="title">LINK Map</div>

      {/* BLE connection status + live telemetry */}
      <BleStatus />

      <button onClick={simulatePing} className="primaryBtn">
        Simulate Ping
      </button>

      <select
        value={basemap}
        onChange={(e) => setBasemap(e.target.value as "streets" | "satellite")}
        className="select"
      >
        <option value="satellite">Satellite</option>
        <option value="streets">Streets</option>
      </select>

      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#4a7a9b" }}>
        <input
          type="checkbox"
          checked={followBinoc}
          onChange={(e) => setFollowBinoc(e.target.checked)}
        />
        Follow Binoculars {binocularLoc ? "(GPS fix)" : "(no fix)"}
      </label>

      <div className="smallText">Pins: {pins.length}</div>

      <div className="smallText">
        {userLoc
          ? `You: ${userLoc.lat.toFixed(6)}, ${userLoc.lon.toFixed(6)} (${Math.round(
              userLoc.accM ?? 0
            )}m)`
          : locErr
          ? `Location error: ${locErr}`
          : "Getting location..."}
      </div>

      <button onClick={clearAllPins} className="secondaryBtn">
        Clear Pins
      </button>

      <div className="sectionTitle">Binocular Telemetry</div>

      <div className="telemetryBox">
        <div className="telemetryRow">
          <span>GNSS Fix</span>
          <span className="telemetryValue">
            {latestTelemetry ? latestTelemetry.gnss.fix.toUpperCase() : "--"}
          </span>
        </div>

        <div className="telemetryRow">
          <span>Heading</span>
          <span className="telemetryValue">
            {latestTelemetry ? `${latestTelemetry.imu.heading.toFixed(0)}°` : "--"}
          </span>
        </div>

        <div className="telemetryRow">
          <span>LiDAR Range</span>
          <span className="telemetryValue">
            {latestTelemetry?.lidar.valid
              ? `${latestTelemetry.lidar.rangeM.toFixed(1)} m`
              : pins[0]?.rangeM !== undefined
              ? `${pins[0].rangeM.toFixed(0)} m`
              : "--"}
          </span>
        </div>

        <div className="telemetryRow">
          <span>Last Bearing</span>
          <span className="telemetryValue">
            {latestTelemetry
              ? `${latestTelemetry.imu.heading.toFixed(0)}°`
              : pins[0]?.bearingDeg !== undefined
              ? `${pins[0].bearingDeg.toFixed(0)}°`
              : "--"}
          </span>
        </div>

        <div className="telemetryRow">
          <span>Battery</span>
          <span className="telemetryValue">
            {latestTelemetry ? `${latestTelemetry.battery}%` : "--%"}
          </span>
        </div>

        <div className="telemetryRow">
          <span>Satellites</span>
          <span className="telemetryValue">
            {latestTelemetry ? latestTelemetry.gnss.sats : "--"}
          </span>
        </div>

        <div className="telemetryRow">
          <span>Baro Alt</span>
          <span className="telemetryValue">
            {latestTelemetry ? `${latestTelemetry.baro.altEstM.toFixed(0)} m` : "--"}
          </span>
        </div>
      </div>

      {/* Offline queue indicator */}
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
          <path
            d="M12 2v3M12 19v3M2 12h3M19 12h3"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
        </svg>
      </button>
    </div>

    <div className="pingCard">
      <div className="sectionTitle" style={{ textAlign: "center" }}>
        Recent Pings
      </div>

      <div className="pingList">
        {pins.length === 0 && <div className="smallText">No pings yet.</div>}

        {pins.map((p, idx) => {
          const dist =
            userLoc ? haversineMeters(userLoc.lat, userLoc.lon, p.lat, p.lon) : null;

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

              <div className="pingMeta">
                ({p.lat.toFixed(5)}, {p.lon.toFixed(5)})
              </div>

              <div className="pingMeta">
                {p.bearingDeg !== undefined && p.rangeM !== undefined
                  ? `Bearing ${p.bearingDeg.toFixed(0)}° • Range ${p.rangeM.toFixed(0)}m`
                  : "—"}
              </div>

              <div className="pingMeta">
                {new Date(p.createdAt).toLocaleTimeString()}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  </div>
);

}
