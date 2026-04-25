// useBlePipeline: orchestrates BLE → Queue → API → ACK → UI

import { useEffect, useRef, useCallback, useState } from "react";
import { bleManager } from "../lib/ble";
import { ingestPin, flushQueue, pendingCount } from "../lib/api";
import { notifyNewPin, notifyModuleWarning, requestNotificationPermission } from "../lib/notifications";
import type { PinPayload, TelemetrySnapshot } from "../lib/payloadTypes";
import { addPin as persistPin, pruneOldPins, type Pin } from "../lib/pinsStore";

export interface UseBlePipelineOpts {
  /** Callback to push a new Pin into React state. */
  onNewPin: (pin: Pin) => void;
  /** Max pins to keep in DB. */
  maxPins?: number;
}

/**
 * Hook that:
 *  1. Listens for BLE pin payloads
 *  2. Converts them to local Pin format + persists
 *  3. Sends through the ingest pipeline (validate → queue → POST → ACK)
 *  4. Shows notifications
 *  5. Periodically flushes the offline queue
 */
export function useBlePipeline({ onNewPin, maxPins = 6 }: UseBlePipelineOpts) {
  const [latestTelemetry, setLatestTelemetry] = useState<TelemetrySnapshot | null>(null);
  const [queueSize, setQueueSize] = useState(0);
  const onNewPinRef = useRef(onNewPin);
  onNewPinRef.current = onNewPin;

  // Request notification permission once
  useEffect(() => {
    requestNotificationPermission();
  }, []);

  // Subscribe to BLE pin payloads
  useEffect(() => {
    const unsub = bleManager.on("pinPayload", async (payload: PinPayload) => {
      // Convert to the local Pin shape used by the map
      const pin: Pin = {
        id: payload.id,
        lat: payload.target.lat,
        lon: payload.target.lon,
        label: payload.label ?? "Waypoint",
        createdAt: payload.receivedAt,
        bearingDeg: payload.aiming.bearingDeg,
        rangeM: payload.aiming.rangeM,
        observerLat: payload.observer.lat,
        observerLon: payload.observer.lon,
        lidarQual: payload.aiming.lidarQuality,
      };

      // Persist locally + update React state
      onNewPinRef.current(pin);
      await persistPin(pin);
      await pruneOldPins(maxPins);

      // Notify user
      notifyNewPin(pin.label ?? "Waypoint", pin.lat, pin.lon);

      // Fire the ingest pipeline (queue → POST → ACK)
      await ingestPin(payload);

      // Refresh queue count
      setQueueSize(await pendingCount());
    });

    return unsub;
  }, [maxPins]);

  // Subscribe to telemetry stream
  useEffect(() => {
    const unsub = bleManager.on("telemetry", (snap) => {
      setLatestTelemetry(snap);
      // Debug: log GNSS data so we can verify it's arriving
      if (snap.gnss) {
        console.log("[BLE telemetry] gnss:", snap.gnss.fix, "lat:", snap.gnss.lat, "lon:", snap.gnss.lon, "sats:", snap.gnss.sats);
      }
    });
    return unsub;
  }, []);

  // Module warnings → notifications
  useEffect(() => {
    const unsub = bleManager.on("moduleWarning", ({ module, status }) => {
      notifyModuleWarning(module, status);
    });
    return unsub;
  }, []);

  // Periodically flush the offline queue (every 30s)
  useEffect(() => {
    const id = setInterval(async () => {
      await flushQueue();
      setQueueSize(await pendingCount());
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  // Also flush when we come back online
  useEffect(() => {
    const handler = async () => {
      await flushQueue();
      setQueueSize(await pendingCount());
    };
    window.addEventListener("online", handler);
    return () => window.removeEventListener("online", handler);
  }, []);

  /** Manual flush trigger for the UI. */
  const manualFlush = useCallback(async () => {
    const delivered = await flushQueue();
    setQueueSize(await pendingCount());
    return delivered;
  }, []);

  /** Refresh the queue size badge without attempting any uploads. */
  const refreshQueue = useCallback(async () => {
    setQueueSize(await pendingCount());
  }, []);

  return { latestTelemetry, queueSize, manualFlush, refreshQueue };
}
