// HTTP API service — POST pins to the server endpoint

import type { PinPayload, ServerPinResponse } from "./payloadTypes";
import { validatePinPayload } from "./payloadTypes";
import {
  enqueue,
  getPending,
  markSending,
  markAcked,
  markPending,
  pruneAcked,
} from "./offlineQueue";
import { bleManager } from "./ble";

/*
 Base URL for the pin-ingest server.
 In production this comes from env; for local dev it can be overridden.
 */
const SERVER_BASE =
  import.meta.env.VITE_API_BASE ?? "https://link-hud-api.example.com";

const PIN_ENDPOINT = `${SERVER_BASE}/api/pins`;

// Public API

/*
 Full pipeline for a pin payload that arrived over BLE:
   validate → enqueue → POST → ACK back to ESP32
 
 If the POST fails (offline, 5xx, timeout), the payload stays in the
 local queue and `flushQueue()` will retry later.
 */
export async function ingestPin(payload: PinPayload): Promise<boolean> {
  // 1. Client-side validation
  const errors = validatePinPayload(payload);
  if (errors.length) {
    console.warn("[API] payload validation failed:", errors);
    return false;
  }

  // 2. Persist to offline queue immediately
  await enqueue(payload);

  // 3. Attempt POST right away
  return attemptPost(payload);
}

/*
 Retry all pending payloads in the queue.
 Call this on a timer, on "online" event, or after reconnecting.
 */
export async function flushQueue(): Promise<number> {
  const pending = await getPending();
  let delivered = 0;

  for (const entry of pending) {
    const ok = await attemptPost(entry.payload);
    if (ok) delivered++;
  }

  // Clean up old delivered entries
  await pruneAcked();
  return delivered;
}

/*
 Returns the number of payloads still waiting to be sent.
 */
export async function pendingCount(): Promise<number> {
  return (await getPending()).length;
}

// Internals

async function attemptPost(payload: PinPayload): Promise<boolean> {
  try {
    await markSending(payload.id);

    const resp = await fetch(PIN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000), // 10s timeout
    });

    if (!resp.ok) {
      console.warn(`[API] server responded ${resp.status}`);
      await markPending(payload.id);
      return false;
    }

    const body: ServerPinResponse = await resp.json();

    if (!body.ok) {
      console.warn("[API] server rejected payload:", body.error);
      await markPending(payload.id);
      return false;
    }

    // 4. Server accepted — send ACK back to ESP32 over BLE
    try {
      await bleManager.sendAck(payload.id);
    } catch {
      // If BLE is disconnected that's ok — the ESP32 will resend on reconnect
      console.warn("[API] BLE ACK failed (device may be disconnected)");
    }

    // 5. Mark as delivered in local queue
    await markAcked(payload.id);
    return true;
  } catch (err) {
    // Network error / offline — stay in queue
    console.warn("[API] POST failed, will retry:", err);
    await markPending(payload.id);
    return false;
  }
}

// Auto-flush on connectivity changes

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    console.log("[API] Back online — flushing queue…");
    flushQueue();
  });
}
