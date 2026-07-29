# Envis — Aegis Command Centre

A real-time disaster intelligence platform built with Next.js 16 + MapLibre GL. Provides live global hazard feeds, AI-powered vulnerability auditing, climate risk analysis, and evacuation routing on an interactive 3D map.

## Modules

| Module | Description |
|---|---|
| **Aegis Route** | Real-time evacuation routing around active hazard zones with AI shelter recommendations |
| **Aegis Prevent** | Multi-hazard prediction using real meteorological formulas (72h forecast) and OSM+elevation+weather polygon zones, with a "Route to Safety" handoff into Aegis Route |
| **Mobile Alert Delivery** | Supabase/PostGIS backend matching published hazard alerts against a device's current location and saved commute points — see [Mobile Alert Delivery](#mobile-alert-delivery-supabase-backed) and [Agent instructions](#agent-instructions-wiring-alert-delivery-into-the-mobile-app) below |

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
NASA_FIRMS_MAP_KEY=                 # Optional: satellite fire hotspot detection (free signup: https://firms.modaps.eosdis.nasa.gov/api/map_key/)
OPENAQ_API_KEY=                     # Optional: ground air-quality sensor network (free signup: https://explore.openaq.org/register)
OPENTOPOGRAPHY_API_KEY=             # Optional: Copernicus DEM GLO-30 terrain (free signup: https://portal.opentopography.org/newUser)
COPERNICUS_CLIENT_ID=               # Optional: Sentinel-2 NDVI/NDMI vegetation dryness (free: https://dataspace.copernicus.eu/)
COPERNICUS_CLIENT_SECRET=           # Optional: paired with COPERNICUS_CLIENT_ID
SUPABASE_URL=                       # Optional: mobile alert delivery backend (free tier: https://supabase.com)
SUPABASE_SERVICE_ROLE_KEY=          # Optional: paired with SUPABASE_URL — see supabase/migrations/0001_init.sql
```

Keyless data sources used with no configuration required: Open-Meteo (forecast, archive, elevation),
OpenStreetMap via Overpass, ISRIC SoilGrids, GDACS and USGS.

### Setting up Supabase (mobile alert delivery)

1. Create a free project at [supabase.com](https://supabase.com).
2. In the SQL editor, run `supabase/migrations/0001_init.sql` — it enables PostGIS and creates the devices/locations/commute-points/alerts schema described below.
3. Copy the project URL and the `service_role` key (Project Settings → API) into `.env.local`.
4. Without these two variables, every `/api/devices/*` and `/api/alerts/*` route returns `503` with a setup note instead of failing — the rest of the app is unaffected.

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

## Mobile Alert Delivery (Supabase-backed)

These endpoints are the bridge to a mobile app: register a device, keep its location (and commute points) up to date, and poll for alerts matching either. Requires `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` — see setup steps above. All return `503` with a setup note if unconfigured.

### `POST /api/devices/register`

Register a device on first launch, or whenever its push token rotates.

**Request body**
```json
{
  "deviceId": "a1b2c3d4-...",
  "pushToken": "ExponentPushToken[...]",
  "pushProvider": "expo",
  "platform": "ios"
}
```

### `POST /api/devices/location`

Upsert a device's current location. Call on a background interval or significant-location-change — only the latest position is kept.

**Request body**
```json
{ "deviceId": "a1b2c3d4-...", "lat": 34.0537, "lng": -118.2428, "accuracyM": 15 }
```

### `GET /api/devices/commute-points?deviceId=...`  ·  `POST /api/devices/commute-points`

Home, work, and any other named points a user wants covered even when they aren't physically there. `POST` replaces the full set for a device — send the whole list every time it's edited.

**POST request body**
```json
{
  "deviceId": "a1b2c3d4-...",
  "points": [
    { "label": "home", "lat": 34.05, "lng": -118.24 },
    { "label": "work", "lat": 34.02, "lng": -118.30 }
  ]
}
```

### `POST /api/alerts/publish`

Materializes a hazard prediction into the alerts table. This is what Aegis Prevent's "Publish Alert" button calls once a hazard has been analyzed — it can also be called from a scheduled job for automated publishing.

**Request body**
```json
{
  "hazardType": "Wildfire",
  "severity": "high",
  "source": "forecast",
  "title": "Wildfire risk near Los Angeles",
  "message": "Elevated fire danger — enforce burn precautions.",
  "method": "Vapour pressure deficit + humidity + wind + Sentinel-2 NDMI fuel moisture",
  "riskScore": 0.53,
  "leadTimeHours": 44,
  "lat": 34.0537,
  "lng": -118.2428,
  "radiusM": 8000,
  "impactAreaRing": [[-118.25, 34.05], [-118.24, 34.05], [-118.24, 34.06], [-118.25, 34.05]],
  "cityName": "Los Angeles",
  "expiresInHours": 48
}
```

### `GET /api/alerts/nearby?lat=&lng=&radiusKm=`

Point-radius alert lookup, independent of any registered device — useful for a map view.

### `GET /api/alerts/feed?deviceId=...`

The main mobile polling endpoint. Returns every active alert matching the device's current location or any commute point, tagged with which one matched, the label (for commute points), and distance.

**Response**
```json
{
  "alerts": [
    {
      "id": "b7e1...",
      "hazardType": "Wildfire",
      "severity": "high",
      "title": "Wildfire risk near Los Angeles",
      "message": "Elevated fire danger — enforce burn precautions.",
      "riskScore": 0.53,
      "leadTimeHours": 44,
      "matchedVia": "commute_point",
      "matchedPointLabel": "work",
      "distanceM": 3120,
      "publishedAt": "2026-07-28T18:00:00Z",
      "expiresAt": "2026-07-30T18:00:00Z"
    }
  ],
  "checkedPoints": 3
}
```

---

## Agent instructions: wiring alert delivery into the mobile app

This section is written to be handed directly to a coding agent building or maintaining the Expo mobile app. It assumes the backend above is already deployed and `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` are configured server-side — the mobile app never talks to Supabase directly, it only calls the Next.js API routes.

**Goal:** the app registers itself as a device, keeps its location (and the user's saved commute points) up to date, and polls `/api/alerts/feed` to know what to show/notify the user about.

### Step 1 — Generate and persist a device ID

On first launch, generate a UUID and store it in `SecureStore` (not `AsyncStorage` — it should survive reinstalls where possible and not be trivially readable). This ID is the device's identity for every call below; there is no login.

```ts
// lib/deviceId.ts
import * as SecureStore from "expo-secure-store";
import { randomUUID } from "expo-crypto";

const KEY = "envis_device_id";

export async function getDeviceId(): Promise<string> {
  let id = await SecureStore.getItemAsync(KEY);
  if (!id) {
    id = randomUUID();
    await SecureStore.setItemAsync(KEY, id);
  }
  return id;
}
```

### Step 2 — Register the device + push token on launch

Request notification permission, get the Expo push token, and call `/api/devices/register`. Re-run this whenever the token changes (Expo can rotate it) — `addPushTokenListener` covers that.

```ts
// lib/registerDevice.ts
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { getDeviceId } from "./deviceId";
import { API_BASE } from "./api";

export async function registerDevice() {
  const deviceId = await getDeviceId();

  const { status } = await Notifications.requestPermissionsAsync();
  let pushToken: string | null = null;
  if (status === "granted") {
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: Constants.expoConfig?.extra?.eas?.projectId,
    });
    pushToken = tokenData.data;
  }

  await fetch(`${API_BASE}/api/devices/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      deviceId,
      pushToken,
      pushProvider: "expo",
      platform: Constants.platform?.ios ? "ios" : "android",
    }),
  });

  return deviceId;
}

// Call once at app startup, and again on token rotation:
Notifications.addPushTokenListener(() => registerDevice());
```

### Step 3 — Push location updates on an interval

Foreground: update on a timer while the app is open. Background: register a `expo-location` background task (`TaskManager`) with `significantChanges` accuracy so it doesn't drain the battery — this is the location `/api/alerts/feed` matches against, not a live track, so infrequent updates (every 5-15 min, or on significant movement) are enough.

```ts
// lib/locationSync.ts
import * as Location from "expo-location";
import { getDeviceId } from "./deviceId";
import { API_BASE } from "./api";

export async function syncLocation() {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") return;

  const deviceId = await getDeviceId();
  const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });

  await fetch(`${API_BASE}/api/devices/location`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      deviceId,
      lat: loc.coords.latitude,
      lng: loc.coords.longitude,
      accuracyM: loc.coords.accuracy ?? undefined,
    }),
  });
}

// In your root layout / app entry:
// useEffect(() => { syncLocation(); const t = setInterval(syncLocation, 5 * 60 * 1000); return () => clearInterval(t); }, []);
```

For true background delivery (app closed), wire this into a `TaskManager.defineTask` + `Location.startLocationUpdatesAsync` background task per the [expo-location background docs](https://docs.expo.dev/versions/latest/sdk/location/#background-location-methods) — the fetch body is identical, only the trigger changes.

### Step 4 — Build the commute points settings screen

A simple screen where the user sets "Home", "Work", and optionally more waypoints. Send the full list on every save — the endpoint replaces the whole set for a device, there's no partial update.

```ts
// lib/commutePoints.ts
import { getDeviceId } from "./deviceId";
import { API_BASE } from "./api";

export async function saveCommutePoints(
  points: { label: string; lat: number; lng: number }[]
) {
  const deviceId = await getDeviceId();
  await fetch(`${API_BASE}/api/devices/commute-points`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId, points }),
  });
}

export async function loadCommutePoints() {
  const deviceId = await getDeviceId();
  const res = await fetch(`${API_BASE}/api/devices/commute-points?deviceId=${deviceId}`);
  const data = await res.json();
  return data.points; // [{ id, label, lat, lng, sortOrder }]
}
```

### Step 5 — Poll the alert feed and surface local notifications

This is the payoff: call `/api/alerts/feed` on the same interval as location sync (right after `syncLocation()` resolves, so the feed reflects the freshest position). Diff against alert IDs already shown locally (store them in `AsyncStorage`) so a repeat poll of a still-active alert doesn't re-notify.

```ts
// lib/alertFeed.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { getDeviceId } from "./deviceId";
import { API_BASE } from "./api";

const SEEN_KEY = "envis_seen_alert_ids";

export async function pollAlertFeed() {
  const deviceId = await getDeviceId();
  const res = await fetch(`${API_BASE}/api/alerts/feed?deviceId=${deviceId}`);
  if (!res.ok) return [];
  const { alerts } = await res.json();

  const seenRaw = await AsyncStorage.getItem(SEEN_KEY);
  const seen: string[] = seenRaw ? JSON.parse(seenRaw) : [];
  const seenSet = new Set(seen);

  for (const alert of alerts) {
    if (seenSet.has(alert.id)) continue;
    seenSet.add(alert.id);

    await Notifications.scheduleNotificationAsync({
      content: {
        title: alert.title,
        body:
          alert.matchedVia === "commute_point"
            ? `Near your ${alert.matchedPointLabel}: ${alert.message}`
            : alert.message,
        data: { alertId: alert.id, hazardType: alert.hazardType },
      },
      trigger: null, // fire immediately
    });
  }

  await AsyncStorage.setItem(SEEN_KEY, JSON.stringify(Array.from(seenSet)));
  return alerts; // also render these in-app, e.g. a map overlay or alert list screen
}
```

### Step 6 — Wire the polling loop

```ts
// App.tsx (or root layout)
useEffect(() => {
  registerDevice();
  const tick = async () => {
    await syncLocation();
    await pollAlertFeed();
  };
  tick();
  const interval = setInterval(tick, 5 * 60 * 1000); // every 5 min while foregrounded
  return () => clearInterval(interval);
}, []);
```

### Checklist for the agent

- [ ] Device ID generated once, stored in `SecureStore`, reused for every call
- [ ] `expo-notifications` permission requested and push token registered via `/api/devices/register`, re-registered on token rotation
- [ ] Location synced via `/api/devices/location` on an interval (foreground timer at minimum; background task if the app needs closed-app delivery)
- [ ] Commute points settings screen reads/writes `/api/devices/commute-points`
- [ ] Alert feed polled via `/api/alerts/feed`, deduped against a locally stored seen-ID set before firing a notification
- [ ] `matchedVia` / `matchedPointLabel` used to phrase the notification ("near your work" vs "at your current location")
- [ ] `EXPO_PUBLIC_API_URL` (or equivalent) points at the deployed Next.js backend, not `localhost`, in any non-dev build
- [ ] Verify end-to-end once by calling `/api/alerts/publish` manually (see Mobile Alert Delivery section above) for a coordinate near the test device's location, then confirming the feed picks it up

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
