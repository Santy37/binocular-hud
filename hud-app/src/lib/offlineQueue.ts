// IndexedDB-backed offline queue for unsent pin payloads

import { openDB, type IDBPDatabase } from "idb";
import type { PinPayload } from "./payloadTypes";

const DB_NAME = "binocHudQueue";
const STORE = "pendingPins";
const DB_VERSION = 1;

export interface QueueEntry {
  /** Same id as the PinPayload. */
  id: string;
  payload: PinPayload;
  /** Number of POST attempts so far. */
  attempts: number;
  /** Epoch-ms of last attempt (0 = never tried). */
  lastAttempt: number;
  /** "pending" | "sending" | "acked" */
  status: "pending" | "sending" | "acked";
}

let _db: IDBPDatabase | null = null;

async function db() {
  if (_db) return _db;
  _db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(d) {
      if (!d.objectStoreNames.contains(STORE)) {
        d.createObjectStore(STORE, { keyPath: "id" });
      }
    },
  });
  return _db;
}

/** Enqueue a new payload (called when BLE delivers a pin). */
export async function enqueue(payload: PinPayload): Promise<void> {
  const d = await db();
  const entry: QueueEntry = {
    id: payload.id,
    payload,
    attempts: 0,
    lastAttempt: 0,
    status: "pending",
  };
  await d.put(STORE, entry);
}

/** Get all entries that still need sending. */
export async function getPending(): Promise<QueueEntry[]> {
  const d = await db();
  const all: QueueEntry[] = await d.getAll(STORE);
  return all.filter((e) => e.status !== "acked");
}

/** Get every entry (including acked) for debugging / UI. */
export async function getAll(): Promise<QueueEntry[]> {
  const d = await db();
  return d.getAll(STORE);
}

/** Mark an entry as currently being sent. */
export async function markSending(id: string): Promise<void> {
  const d = await db();
  const entry: QueueEntry | undefined = await d.get(STORE, id);
  if (!entry) return;
  entry.status = "sending";
  entry.attempts += 1;
  entry.lastAttempt = Date.now();
  await d.put(STORE, entry);
}

/** Mark delivered — we got a server 200 AND sent the BLE ACK. */
export async function markAcked(id: string): Promise<void> {
  const d = await db();
  const entry: QueueEntry | undefined = await d.get(STORE, id);
  if (!entry) return;
  entry.status = "acked";
  await d.put(STORE, entry);
}

/** Reset a failed entry back to pending. */
export async function markPending(id: string): Promise<void> {
  const d = await db();
  const entry: QueueEntry | undefined = await d.get(STORE, id);
  if (!entry) return;
  entry.status = "pending";
  await d.put(STORE, entry);
}

/** Remove delivered entries older than `maxAgeMs` (default 24h). */
export async function pruneAcked(maxAgeMs = 86_400_000): Promise<void> {
  const d = await db();
  const all: QueueEntry[] = await d.getAll(STORE);
  const cutoff = Date.now() - maxAgeMs;
  for (const e of all) {
    if (e.status === "acked" && e.lastAttempt < cutoff) {
      await d.delete(STORE, e.id);
    }
  }
}

/** Nuke everything. */
export async function clearQueue(): Promise<void> {
  const d = await db();
  await d.clear(STORE);
}
