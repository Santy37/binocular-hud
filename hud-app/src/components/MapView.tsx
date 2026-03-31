import { useEffect, useRef } from "react";
import maplibregl, { Map, Marker, type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

type Pin = { id: string; lat: number; lon: number; label?: string };
type Basemap = "streets" | "satellite";
type UserLoc = { lat: number; lon: number; accM?: number };
type BinocLoc = { lat: number; lon: number; sats: number; fix: string };

function circlePolygon(lon: number, lat: number, radiusM: number, points = 64) {
  const coords: [number, number][] = [];
  const earthRadius = 6371000;

  const latRad = (lat * Math.PI) / 180;
  const lonRad = (lon * Math.PI) / 180;
  const angular = radiusM / earthRadius;

  for (let i = 0; i <= points; i++) {
    const bearing = (2 * Math.PI * i) / points;

    const lat2 = Math.asin(
      Math.sin(latRad) * Math.cos(angular) +
        Math.cos(latRad) * Math.sin(angular) * Math.cos(bearing)
    );

    const lon2 =
      lonRad +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angular) * Math.cos(latRad),
        Math.cos(angular) - Math.sin(latRad) * Math.sin(lat2)
      );

    coords.push([(lon2 * 180) / Math.PI, (lat2 * 180) / Math.PI]);
  }

  return {
    type: "FeatureCollection" as const,
    features: [
      {
        type: "Feature" as const,
        properties: {},
        geometry: {
          type: "Polygon" as const,
          coordinates: [coords],
        },
      },
    ],
  };
}

export default function MapView({
  pins,
  basemap,
  userLoc,
  centerMeTick,
  selectedPingId,
  binocularLoc,
  followBinoculars,
}: {
  pins: Pin[];
  basemap: Basemap;
  userLoc: UserLoc | null;
  centerMeTick: number;
  selectedPingId: string | null;
  binocularLoc: BinocLoc | null;
  followBinoculars: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const userMarkerRef = useRef<Marker | null>(null);
  const binocMarkerRef = useRef<Marker | null>(null);
  const didInitUserCenterRef = useRef(false);
  const prevPinsLenRef = useRef(0);
  const didPinsInitRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current) return;

    const style: StyleSpecification = {
      version: 8,
      sources: {
        osm: {
          type: "raster",
          tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
          tileSize: 256,
          maxzoom: 19,
        },
        esri_sat: {
          type: "raster",
          tiles: [
            "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          ],
          tileSize: 256,
          maxzoom: 19,
        },
      },        
      layers: [
        { id: "osm-layer", type: "raster", source: "osm", layout: { visibility: "none" } },
        { id: "sat-layer", type: "raster", source: "esri_sat" },
    ],

    };

    const map = new maplibregl.Map({
      container: containerRef.current,
      style,
      center: [-81.2005, 28.6012],
      zoom: 10, // zoomed out so you see more than Florida coast
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");

    map.on("load", () => {
      // Add accuracy circle source/layers once
      if (!map.getSource("user-acc")) {
        map.addSource("user-acc", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });

        map.addLayer({
          id: "user-acc-fill",
          type: "fill",
          source: "user-acc",
          paint: {
            "fill-color": "#2b7cff",
            "fill-opacity": 0.15,
          },
        });

        map.addLayer({
          id: "user-acc-outline",
          type: "line",
          source: "user-acc",
          paint: {
            "line-color": "#2b7cff",
            "line-width": 2,
            "line-opacity": 0.6,
          },
        });
      }

      map.resize();
    });

    mapRef.current = map;

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];

      if (userMarkerRef.current) {
      userMarkerRef.current.remove();
      userMarkerRef.current = null;
      }

      if (binocMarkerRef.current) {
        binocMarkerRef.current.remove();
        binocMarkerRef.current = null;
      }

      map.remove();
      mapRef.current = null;
    };
  }, []);

  // initial center on user location (once)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !userLoc) return;

    if (didInitUserCenterRef.current) return;
    didInitUserCenterRef.current = true;

    map.flyTo({
      center: [userLoc.lon, userLoc.lat],
      zoom: 17,
      essential: true,
    });
  }, [userLoc]);

  // center map on user when button clicked
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !userLoc) return;

    map.flyTo({
      center: [userLoc.lon, userLoc.lat],
      zoom: Math.max(map.getZoom(), 17),
      essential: true,
    });
  }, [centerMeTick]);

  // fly to selected ping
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedPingId) return;

    const p = pins.find((x) => x.id === selectedPingId);
    if (!p) return;

    map.flyTo({
      center: [p.lon, p.lat],
      zoom: Math.max(map.getZoom(), 18),
      essential: true,
    });
  }, [selectedPingId, pins]);

  // update user location marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!userLoc) return;

    const lngLat: [number, number] = [userLoc.lon, userLoc.lat];

    if (!userMarkerRef.current) {
      // Create a blue dot element
      const el = document.createElement("div");
      el.style.width = "14px";
      el.style.height = "14px";
      el.style.borderRadius = "50%";
      el.style.background = "#2b7cff";
      el.style.border = "2px solid white";
      el.style.boxShadow = "0 0 10px rgba(43,124,255,0.6)";

      userMarkerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat(lngLat)
        .addTo(map);
    } else {
      userMarkerRef.current.setLngLat(lngLat);
    }

    // Update accuracy circle
    const acc = Math.max(10, Math.min(userLoc.accM ?? 0, 500)); // clamp 10..500m for sanity
    const fc = circlePolygon(userLoc.lon, userLoc.lat, acc);

    const src = map.getSource("user-acc") as maplibregl.GeoJSONSource | undefined;
    src?.setData(fc as any);
  }, [userLoc]);

  // update binocular (ESP32) location marker — green dot
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !binocularLoc) return;

    const lngLat: [number, number] = [binocularLoc.lon, binocularLoc.lat];

    if (!binocMarkerRef.current) {
      const el = document.createElement("div");
      el.style.width = "16px";
      el.style.height = "16px";
      el.style.borderRadius = "50%";
      el.style.background = "#22c55e";
      el.style.border = "2px solid white";
      el.style.boxShadow = "0 0 10px rgba(34,197,94,0.6)";

      binocMarkerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat(lngLat)
        .addTo(map);
    } else {
      binocMarkerRef.current.setLngLat(lngLat);
    }

    // Follow binoculars if enabled
    if (followBinoculars) {
      map.easeTo({
        center: lngLat,
        duration: 600,
      });
    }
  }, [binocularLoc, followBinoculars]);

  // toggle basemap
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const showSat = basemap === "satellite";
    // these calls are safe after map has loaded
    if (map.getLayer("sat-layer") && map.getLayer("osm-layer")) {
      map.setLayoutProperty("sat-layer", "visibility", showSat ? "visible" : "none");
      map.setLayoutProperty("osm-layer", "visibility", showSat ? "none" : "visible");
    }
  }, [basemap]);

  // markers
  useEffect(() => {
  const map = mapRef.current;
  if (!map) return;

  markersRef.current.forEach((m) => m.remove());
  markersRef.current = [];

  pins.forEach((p) => {
    markersRef.current.push(
      new maplibregl.Marker().setLngLat([p.lon, p.lat]).addTo(map)
    );
  });
}, [pins]);

  // fly to newest ping ONLY when a new pin is added
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!didPinsInitRef.current) {
      didPinsInitRef.current = true;
      prevPinsLenRef.current = pins.length;
      return; // ✅ don't fly on initial load
    }

    if (pins.length > prevPinsLenRef.current && pins.length > 0) {
      const latest = pins[0]; // newest-first
      map.flyTo({
        center: [latest.lon, latest.lat],
        zoom: Math.max(map.getZoom(), 18),
        essential: true,
      });
    }

    prevPinsLenRef.current = pins.length;
  }, [pins]);


  return <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />;
}
