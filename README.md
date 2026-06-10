# Envis — Aegis Command Centre

A real-time disaster intelligence platform built with Next.js 16 + MapLibre GL. Provides live global hazard feeds, AI-powered vulnerability auditing, climate risk analysis, and evacuation routing on an interactive 3D map.

## Modules

| Module | Description |
|---|---|
| **Envis Route** | Real-time evacuation routing around active hazard zones with AI shelter recommendations |
| **Envis Prevent** | Climate-informed structural auditing using Open-Meteo weather archive + OpenAI analysis |

---

## Running Locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment variables (`.env.local`)

```env
NEXT_PUBLIC_MAPTILER_API_KEY=       # MapTiler — map tiles + geocoding
OPENAI_API_KEY=                     # OpenAI — AI audit, vulnerability zones, shelters
NEXT_PUBLIC_TOMTOM_API_KEY=         # TomTom — routing engine
TOMORROW_IO_API_KEY=                # Optional: Tomorrow.io tropical cyclone feed
XWEATHER_CLIENT_ID=                 # Optional: XWeather cyclone feed
XWEATHER_CLIENT_SECRET=             # Optional: XWeather cyclone feed
```

---

## REST API Reference

All endpoints are available at `https://<your-deployment-url>/api/...` and can be consumed by any client — including the companion React Native / Expo mobile app.

### `GET /api/live-feed`

Returns active global disasters categorised by type, sourced from GDACS, USGS, Tomorrow.io, and XWeather.

**Response**
```json
{
  "cyclones": [
    {
      "id": "gdacs-tc-1234",
      "name": "CRISTINA-26",
      "source": "GDACS",
      "type": "Tropical Cyclone",
      "category": "Category 2",
      "alertLevel": "orange",
      "coordinates": [-87.5, 14.2],
      "country": "Honduras",
      "windSpeed": 120,
      "date": "2026-06-09T00:00:00Z"
    }
  ],
  "earthquakes": [
    {
      "id": "usgs-us7000abc",
      "name": "45km NNE of Kathmandu, Nepal",
      "source": "USGS",
      "magnitude": 5.8,
      "depth": 12.4,
      "alertLevel": "orange",
      "coordinates": [85.3, 28.2],
      "country": "Nepal",
      "tsunami": false,
      "felt": 1200,
      "date": "2026-06-09T04:13:00Z"
    }
  ]
}
```

---

### `GET /api/gdacs`

Returns all active GDACS events (all disaster types) as a flat list.

**Response**
```json
{
  "events": [
    {
      "id": 1234,
      "name": "BORIS-26",
      "gdacsType": "TC",
      "type": "Tornado",
      "alertLevel": "green",
      "date": "2026-06-09",
      "country": "Mexico",
      "coordinates": [-95.1, 19.4]
    }
  ]
}
```

---

### `GET /api/weather-risk?lat=<lat>&lng=<lng>&city=<name>`

Returns 10-year historical weather archive + recent 30-day conditions, with AI-derived disaster risk signals for any coordinates. Powered by Open-Meteo — no API key required.

**Parameters**

| Name | Type | Description |
|---|---|---|
| `lat` | number | Latitude |
| `lng` | number | Longitude |
| `city` | string | Human-readable location name (for context) |

**Response**
```json
{
  "city": "Manila",
  "historical": {
    "maxDailyPrecipMm": 312,
    "maxTempC": 38.4,
    "minTempC": 18.2,
    "maxWindKmh": 185,
    "maxDailySnowCm": 0,
    "annualAvgPrecipMm": 1876,
    "yearsAnalyzed": 10,
    "startYear": 2014,
    "endYear": 2024
  },
  "recent": {
    "totalPrecipMm": 245,
    "maxTempC": 35.1,
    "minTempC": 24.0,
    "maxWindKmh": 62,
    "totalSnowCm": 0,
    "avgTempC": 31.3,
    "days": 30
  },
  "risks": [
    {
      "type": "Flooding",
      "confidence": "high",
      "historicalBasis": "Peak single-day rainfall of 312mm recorded in historical archive",
      "recentSignal": "Recent 30-day precipitation (245mm) is significantly above the historical monthly average (156mm)"
    },
    {
      "type": "Tropical Cyclone",
      "confidence": "high",
      "historicalBasis": "Historical maximum sustained wind speed of 185 km/h",
      "recentSignal": null
    }
  ]
}
```

---

### `POST /api/vulnerability-zones`

Returns AI-identified geographic zones most vulnerable to a specific disaster, inferred from real OpenStreetMap data. Use these coordinates to draw highlighted polygons on your mobile map.

**Request body**
```json
{
  "lat": 14.5995,
  "lng": 120.9842,
  "disasterType": "Flooding",
  "cityName": "Manila",
  "radiusKm": 5
}
```

**Response**
```json
{
  "source": "ai",
  "zones": [
    {
      "type": "Feature",
      "id": "zone-0",
      "geometry": {
        "type": "Point",
        "coordinates": [120.991, 14.607]
      },
      "properties": {
        "severity": "high",
        "reason": "Low-lying estero network near Binondo — historically inundated during Typhoon Ondoy-level rainfall",
        "radius_km": 0.9
      }
    },
    {
      "type": "Feature",
      "id": "zone-1",
      "geometry": {
        "type": "Point",
        "coordinates": [120.978, 14.593]
      },
      "properties": {
        "severity": "medium",
        "reason": "Dense residential barangay with inadequate drainage infrastructure",
        "radius_km": 0.6
      }
    }
  ]
}
```

**Severity levels:** `"high"` (red), `"medium"` (orange), `"low"` (yellow)

Each zone returns a center `Point` and a `radius_km` you can use to draw a circle overlay on the map.

---

### `POST /api/evacuation-points`

Returns AI-suggested evacuation shelters safely outside the hazard radius.

**Request body**
```json
{
  "hazardCenter": [120.9842, 14.5995],
  "hazardRadius": 2000
}
```

**Response**
```json
{
  "shelters": [
    {
      "id": "shelter-north",
      "name": "Quezon City Sports Complex",
      "direction": "North",
      "coordinates": [121.003, 14.638],
      "reason": "Large-capacity public facility outside flood zone, equipped with generators"
    }
  ]
}
```

---

## Connecting the Expo Mobile App

The mobile companion app shows the user their current location relative to active disaster zones, highlights affected areas, and provides turn-by-turn evacuation directions.

### 1. Install dependencies

```bash
npx expo install expo-location @rnmapbox/maps
npm install @tanstack/react-query
```

### 2. Configure base URL

```ts
// lib/api.ts
export const API_BASE =
  process.env.EXPO_PUBLIC_API_URL ?? "https://<your-deployment>.vercel.app";
```

### 3. Fetch active disasters near the user

```ts
// hooks/useNearbyDisasters.ts
import { useQuery } from "@tanstack/react-query";
import * as Location from "expo-location";
import { API_BASE } from "../lib/api";

export function useNearbyDisasters() {
  return useQuery({
    queryKey: ["live-feed"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/live-feed`);
      if (!res.ok) throw new Error("Feed unavailable");
      return res.json(); // { cyclones: [...], earthquakes: [...] }
    },
    refetchInterval: 5 * 60 * 1000, // refresh every 5 min
  });
}
```

### 4. Get affected area + vulnerability zones for a disaster

When a user taps a disaster on the map, call `/api/vulnerability-zones` to get the affected polygons and overlay them.

```ts
// hooks/useVulnerabilityZones.ts
export async function fetchVulnerabilityZones(
  lat: number,
  lng: number,
  disasterType: string
) {
  const res = await fetch(`${API_BASE}/api/vulnerability-zones`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lat, lng, disasterType, radiusKm: 5 }),
  });
  if (!res.ok) throw new Error("Zones unavailable");
  const data = await res.json();
  return data.zones; // GeoJSON Feature[]
}
```

Render on the map (using `@rnmapbox/maps`):

```tsx
import MapboxGL from "@rnmapbox/maps";

const SEVERITY_COLORS = {
  high: "#dc2626",
  medium: "#ea580c",
  low: "#eab308",
};

function VulnerabilityLayer({ zones }) {
  const geojson = { type: "FeatureCollection", features: zones };

  return (
    <MapboxGL.ShapeSource id="vuln-zones" shape={geojson}>
      {["high", "medium", "low"].map((severity) => (
        <MapboxGL.CircleLayer
          key={severity}
          id={`vuln-${severity}`}
          filter={["==", ["get", "severity"], severity]}
          style={{
            circleRadius: ["interpolate", ["linear"], ["zoom"], 10, 25, 15, 80],
            circleColor: SEVERITY_COLORS[severity],
            circleOpacity: 0.3,
            circleStrokeColor: SEVERITY_COLORS[severity],
            circleStrokeWidth: 2,
            circleStrokeOpacity: 0.8,
          }}
        />
      ))}
    </MapboxGL.ShapeSource>
  );
}
```

### 5. Get evacuation shelters and route

```ts
// Get shelters outside the hazard
async function getEvacuationShelters(
  hazardCenter: [number, number],
  hazardRadiusMeters: number
) {
  const res = await fetch(`${API_BASE}/api/evacuation-points`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hazardCenter, hazardRadius: hazardRadiusMeters }),
  });
  const data = await res.json();
  return data.shelters; // [{ id, name, direction, coordinates, reason }]
}
```

### 6. Get climate risk for the user's current location

```ts
async function getLocalWeatherRisk(lat: number, lng: number, city: string) {
  const params = new URLSearchParams({
    lat: lat.toString(),
    lng: lng.toString(),
    city,
  });
  const res = await fetch(`${API_BASE}/api/weather-risk?${params}`);
  const data = await res.json();
  // data.risks[] — sorted high → low confidence
  return data;
}
```

### Full screen example

```tsx
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import * as Location from "expo-location";
import MapboxGL from "@rnmapbox/maps";
import { useNearbyDisasters } from "./hooks/useNearbyDisasters";
import { fetchVulnerabilityZones } from "./hooks/useVulnerabilityZones";

export default function DisasterMap() {
  const [location, setLocation] = useState(null);
  const [zones, setZones] = useState([]);
  const { data: feed } = useNearbyDisasters();

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const loc = await Location.getCurrentPositionAsync({});
      setLocation(loc.coords);
    })();
  }, []);

  // When feed loads, get vulnerability zones for the highest-severity event near user
  useEffect(() => {
    if (!feed || !location) return;
    const topEvent = [...(feed.cyclones ?? []), ...(feed.earthquakes ?? [])].find(
      (e) => e.alertLevel === "red"
    );
    if (!topEvent) return;

    fetchVulnerabilityZones(
      topEvent.coordinates[1],
      topEvent.coordinates[0],
      topEvent.type
    ).then(setZones);
  }, [feed, location]);

  return (
    <MapboxGL.MapView style={styles.map}>
      <MapboxGL.Camera
        centerCoordinate={
          location ? [location.longitude, location.latitude] : [0, 0]
        }
        zoomLevel={11}
      />
      {zones.length > 0 && <VulnerabilityLayer zones={zones} />}
    </MapboxGL.MapView>
  );
}

const styles = StyleSheet.create({
  map: { flex: 1 },
});
```

---

## Data Sources

| Source | Data | Refresh |
|---|---|---|
| [GDACS](https://gdacs.org) | Global tropical cyclones, floods, earthquakes, wildfires | 5 min |
| [USGS](https://earthquake.usgs.gov) | Global earthquakes ≥ M4.5 | 5 min |
| [Open-Meteo](https://open-meteo.com) | 10-year weather archive + 30-day recent conditions | Daily |
| [Tomorrow.io](https://tomorrow.io) | Tropical cyclone tracks & forecast cones | 5 min (requires key) |
| [XWeather](https://xweather.com) | Global tropical cyclones (NHC + JTWC) | 5 min (requires key) |
| [OpenStreetMap / Overpass](https://overpass-api.de) | Buildings, waterways, land use for vulnerability analysis | On demand |
