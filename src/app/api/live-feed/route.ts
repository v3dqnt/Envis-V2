import { NextResponse } from "next/server";

export interface CycloneEvent {
  id: string;
  name: string;
  source: string;
  type: "Tropical Cyclone" | "Hurricane" | "Typhoon" | "Extreme Rainfall";
  category: string;
  alertLevel: "red" | "orange" | "green";
  coordinates: [number, number];
  country: string;
  windSpeed?: number;
  date: string;
}

export interface EarthquakeEvent {
  id: string;
  name: string;
  source: string;
  magnitude: number;
  depth?: number;
  alertLevel: "red" | "orange" | "yellow" | "green";
  coordinates: [number, number];
  country: string;
  tsunami: boolean;
  felt?: number;
  date: string;
  /** USGS's own event id (e.g. "us7000abcd"), present only for USGS-sourced
   * events. Feeds /api/earthquake-impact's ShakeMap/PAGER lookup — GDACS events
   * have no USGS id and always use that route's modelled fallback instead. */
  usgsId?: string;
}

async function fetchGdacs(): Promise<{ cyclones: CycloneEvent[]; earthquakes: EarthquakeEvent[] }> {
  const res = await fetch(
    "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?alertlevel=green;orange;red&pagesize=30",
    { next: { revalidate: 300 } }
  );
  if (!res.ok) throw new Error(`GDACS responded ${res.status}`);
  const data = await res.json();
  const features: any[] = data.features || [];

  const cyclones: CycloneEvent[] = [];
  const earthquakes: EarthquakeEvent[] = [];

  for (const f of features) {
    const p = f.properties || {};
    const coords = f.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) continue;
    const lngLat: [number, number] = [coords[0], coords[1]];
    const alert = (["red", "orange", "green"].includes((p.alertlevel || "").toLowerCase())
      ? p.alertlevel.toLowerCase()
      : "green") as "red" | "orange" | "green";
    const date = p.todate || p.fromdate || new Date().toISOString();

    if (p.eventtype === "TC") {
      cyclones.push({
        id: `gdacs-tc-${p.eventid}`,
        name: p.eventname || "Unnamed Cyclone",
        source: "GDACS",
        type: "Tropical Cyclone",
        category: p.severitydata?.severity || "Tropical Cyclone",
        alertLevel: alert,
        coordinates: lngLat,
        country: p.country || "International",
        date,
      });
    } else if (p.eventtype === "EQ") {
      const mag = parseFloat(p.severitydata?.severity) || parseFloat(p.severity) || 0;
      earthquakes.push({
        id: `gdacs-eq-${p.eventid}`,
        name: p.eventname || "Unnamed Earthquake",
        source: "GDACS",
        magnitude: mag,
        alertLevel: alert,
        coordinates: lngLat,
        country: p.country || "International",
        tsunami: false,
        date,
      });
    }
  }

  return { cyclones, earthquakes };
}

async function fetchUsgsEarthquakes(): Promise<EarthquakeEvent[]> {
  const url =
    "https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&minmagnitude=4.5&limit=25&orderby=time";
  const res = await fetch(url, { next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`USGS responded ${res.status}`);
  const data = await res.json();

  return (data.features || []).map((f: any): EarthquakeEvent => {
    const p = f.properties;
    const coords = f.geometry?.coordinates;
    const mag: number = p.mag || 0;
    const rawAlert = (p.alert || "").toLowerCase();
    const alertLevel: "red" | "orange" | "yellow" | "green" = (
      ["red", "orange", "yellow", "green"].includes(rawAlert)
        ? rawAlert
        : mag >= 7.0
        ? "red"
        : mag >= 5.5
        ? "orange"
        : "green"
    ) as "red" | "orange" | "yellow" | "green";

    const place: string = p.place || "Unknown region";
    const country = place.includes(", ") ? place.split(", ").at(-1)! : place;

    return {
      id: `usgs-${f.id}`,
      name: place,
      source: "USGS",
      magnitude: mag,
      depth: coords?.[2] ?? undefined,
      alertLevel,
      coordinates: [coords[0], coords[1]],
      country,
      tsunami: p.tsunami === 1,
      felt: p.felt || undefined,
      date: new Date(p.time).toISOString(),
      usgsId: f.id,
    };
  });
}

async function fetchTomorrowCyclones(): Promise<CycloneEvent[]> {
  const key = process.env.TOMORROW_IO_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch(
      `https://api.tomorrow.io/v4/storms?apikey=${key}&units=metric`,
      { next: { revalidate: 300 } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    const storms: any[] = data?.data?.storms || [];

    return storms.map((s): CycloneEvent => {
      const windSpeed: number = s.windSpeed || 0;
      const alertLevel: "red" | "orange" | "green" =
        windSpeed >= 96 ? "red" : windSpeed >= 48 ? "orange" : "green";
      return {
        id: `tomorrow-${s.id || Math.random().toString(36).slice(2)}`,
        name: s.name || "Unnamed Storm",
        source: "Tomorrow.io",
        type: "Tropical Cyclone",
        category: s.classification || s.status || "Tropical Storm",
        alertLevel,
        coordinates: [s.location?.lon || 0, s.location?.lat || 0],
        country: s.basin || "International",
        windSpeed,
        date: s.updated || new Date().toISOString(),
      };
    });
  } catch {
    return [];
  }
}

async function fetchXWeatherCyclones(): Promise<CycloneEvent[]> {
  const clientId = process.env.XWEATHER_CLIENT_ID;
  const clientSecret = process.env.XWEATHER_CLIENT_SECRET;
  if (!clientId || !clientSecret) return [];
  try {
    const res = await fetch(
      `https://data.api.xweather.com/tropicalcyclones/active?client_id=${clientId}&client_secret=${clientSecret}&limit=20`,
      { next: { revalidate: 300 } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    const storms: any[] = data?.response || [];

    return storms.map((s): CycloneEvent => {
      const profile = s.profile || {};
      const windSpeed: number = profile.windSpeedKTS || 0;
      const alertLevel: "red" | "orange" | "green" =
        windSpeed >= 96 ? "red" : windSpeed >= 48 ? "orange" : "green";
      return {
        id: `xweather-${s.id || Math.random().toString(36).slice(2)}`,
        name: s.name || s.stormName || "Unnamed Storm",
        source: "XWeather",
        type: "Tropical Cyclone",
        category: profile.classification || "Tropical Storm",
        alertLevel,
        coordinates: [s.loc?.long || 0, s.loc?.lat || 0],
        country: profile.basin || "International",
        windSpeed,
        date: s.updated || new Date().toISOString(),
      };
    });
  } catch {
    return [];
  }
}

function deduplicateByProximity<T extends { coordinates: [number, number]; id: string }>(
  items: T[],
  thresholdDeg: number
): T[] {
  const kept: T[] = [];
  for (const item of items) {
    const isDuplicate = kept.some((k) => {
      const dlng = Math.abs(k.coordinates[0] - item.coordinates[0]);
      const dlat = Math.abs(k.coordinates[1] - item.coordinates[1]);
      return dlng < thresholdDeg && dlat < thresholdDeg;
    });
    if (!isDuplicate) kept.push(item);
  }
  return kept;
}

const ALERT_ORDER: Record<string, number> = { red: 0, orange: 1, yellow: 2, green: 3 };

export async function GET() {
  const [gdacsResult, usgsResult, tomorrowResult, xweatherResult] = await Promise.allSettled([
    fetchGdacs(),
    fetchUsgsEarthquakes(),
    fetchTomorrowCyclones(),
    fetchXWeatherCyclones(),
  ]);

  const gdacs =
    gdacsResult.status === "fulfilled"
      ? gdacsResult.value
      : { cyclones: [], earthquakes: [] };
  const usgsEqs = usgsResult.status === "fulfilled" ? usgsResult.value : [];
  const tomorrowCyclones = tomorrowResult.status === "fulfilled" ? tomorrowResult.value : [];
  const xweatherCyclones = xweatherResult.status === "fulfilled" ? xweatherResult.value : [];

  const allCyclones = deduplicateByProximity(
    [...gdacs.cyclones, ...tomorrowCyclones, ...xweatherCyclones],
    1.0
  );

  // Merge GDACS EQs and USGS EQs — GDACS first, then USGS deduped by proximity
  const allEqs = deduplicateByProximity([...gdacs.earthquakes, ...usgsEqs], 0.5);

  allCyclones.sort((a, b) => (ALERT_ORDER[a.alertLevel] ?? 3) - (ALERT_ORDER[b.alertLevel] ?? 3));

  allEqs.sort((a, b) => {
    const alertDiff = (ALERT_ORDER[a.alertLevel] ?? 3) - (ALERT_ORDER[b.alertLevel] ?? 3);
    return alertDiff !== 0 ? alertDiff : b.magnitude - a.magnitude;
  });

  return NextResponse.json({ cyclones: allCyclones, earthquakes: allEqs });
}
