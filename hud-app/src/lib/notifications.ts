/* ── Push / local notification helpers ────────────────────────────── */

/**
 * Request Notification permission if not already granted.
 * Returns true if permission is "granted".
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;

  const result = await Notification.requestPermission();
  return result === "granted";
}

/**
 * Show a local notification (no server push needed).
 *
 * Falls back to console.log when notifications are blocked.
 */
export function showNotification(
  title: string,
  body: string,
  opts?: { tag?: string; icon?: string },
) {
  if (!("Notification" in window) || Notification.permission !== "granted") {
    console.log(`[Notification] ${title}: ${body}`);
    return;
  }

  // Use the service worker registration if available (required on Android)
  if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.ready.then((reg) => {
      reg.showNotification(title, {
        body,
        tag: opts?.tag ?? "link-hud",
        icon: opts?.icon ?? "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
      });
    });
  } else {
    new Notification(title, { body, tag: opts?.tag });
  }
}

/** Notify about a new pin that arrived from the binoculars. */
export function notifyNewPin(label: string, lat: number, lon: number) {
  showNotification(
    "New Waypoint Received",
    `${label} at (${lat.toFixed(5)}, ${lon.toFixed(5)})`,
    { tag: "new-pin" },
  );
}

/** Warn the user about a degraded or failed module. */
export function notifyModuleWarning(module: string, status: string) {
  showNotification(
    "Module Warning",
    `${module.toUpperCase()} is ${status}. Functionality may be limited.`,
    { tag: `mod-${module}` },
  );
}
