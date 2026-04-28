/* Weather API helper — fetches current sea-level pressure (QNH) for a location.
 
 Uses Open-Meteo (https://open-meteo.com) — free, no API key, no rate limit for
 reasonable use.  Returns the sea-level pressure (hPa, a.k.a. QNH) so the
 ESP32 can calibrate its barometer for true MSL altitude.
 */

export interface QnhResult {
  qnhHPa: number;
  fetchedAt: number;  // Date.now()
  lat: number;
  lon: number;
}

/*
 Fetch current sea-level pressure for the given coordinates.
 Returns null on network/parse failure.
 */
export async function fetchQnh(lat: number, lon: number): Promise<QnhResult | null> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&current=pressure_msl`;
    const resp = await fetch(url);
    if (!resp.ok) {
      console.warn("[weather] fetch failed", resp.status);
      return null;
    }
    const data = await resp.json();
    const qnh = data?.current?.pressure_msl;
    if (typeof qnh !== "number" || qnh < 800 || qnh > 1100) {
      console.warn("[weather] invalid pressure_msl", qnh);
      return null;
    }
    return { qnhHPa: qnh, fetchedAt: Date.now(), lat, lon };
  } catch (err) {
    console.warn("[weather] fetch error", err);
    return null;
  }
}
