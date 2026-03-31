import { openDB } from "idb";

export type Pin = {
  id: string;
  lat: number;
  lon: number;
  label?: string;
  createdAt: number;

  // snapshot / metadata (optional)
  bearingDeg?: number;
  rangeM?: number;
  observerLat?: number;
  observerLon?: number;
  lidarQual?: number;
};

const DB_NAME = "binocHud";
const STORE = "pins";

async function db() {
  return openDB(DB_NAME, 1, {
    upgrade(d) {
      if (!d.objectStoreNames.contains(STORE)) {
        d.createObjectStore(STORE, { keyPath: "id" });
      }
    },
  });
}

export async function getAllPins(): Promise<Pin[]> {
  const d = await db();
  return (await d.getAll(STORE)).sort((a, b) => b.createdAt - a.createdAt);
}

export async function addPin(pin: Pin) {
  const d = await db();
  await d.put(STORE, pin);
}

export async function deletePin(id: string) {
  const d = await db();
  await d.delete(STORE, id);
}

export async function clearPins() {
  const d = await db();
  await d.clear(STORE);
}

export async function pruneOldPins(maxPins: number) {
  const pins = await getAllPins(); // newest-first
  if (pins.length <= maxPins) return;

  const toDelete = pins.slice(maxPins);
  for (const p of toDelete) {
    await deletePin(p.id);
  }
}
