// Push / local notification helpers

/* Ask the browser for Notification permission if we don't already have it.
 Resolves true only when the final state is "granted" — "denied" is sticky
 on most browsers (no second-chance prompt), so we bail early in that case
 instead of triggering a no-op requestPermission() call.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;

  const result = await Notification.requestPermission();
  return result === "granted";
}

/* Fire a local notification — no server push, all client-side.
 On Android the plain `new Notification()` constructor is blocked inside
 PWAs, so we route through the SW registration when one's available and
 only fall back to the constructor on desktop. If permission is missing
 we just log to console so dev/debug still sees the event.
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

// Notify about a new pin that just arrived from the binoculars over BLE.
export function notifyNewPin(label: string, lat: number, lon: number) {
  showNotification(
    "New Waypoint Received",
    `${label} at (${lat.toFixed(5)}, ${lon.toFixed(5)})`,
    { tag: "new-pin" },
  );
}

// Warn the user when a sensor module flips to degraded/failed so they
// know readings might be stale or off before they trust a waypoint.
export function notifyModuleWarning(module: string, status: string) {
  showNotification(
    "Module Warning",
    `${module.toUpperCase()} is ${status}. Functionality may be limited.`,
    { tag: `mod-${module}` },
  );
}
