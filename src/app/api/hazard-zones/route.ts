import { NextResponse } from "next/server";

/**
 * Real hazard-zone engine.
 *
 * Unlike the AI-guessed point/radius circles in /api/vulnerability-zones, every zone
 * returned here is a REAL polygon taken from OpenStreetMap geometry, scored
 * deterministically against real weather/elevation data. Nothing is invented:
 *
 *   Wildfire  = actual forest / wood / scrub polygons, scored by heat + rainfall deficit
 *   Flooding  = actual water bodies, reservoirs and rivers, scored by recent rainfall
 *               and how low-lying the surrounding terrain is
 *   Landslide = actual steep terrain sampled from elevation data, scored by recent rainfall
 *
 * If the underlying feature does not exist in OSM at this location, no zone is returned
 * for it — the API reports an empty list rather than fabricating one.
 */

type Severity = "high" | "medium" | "low";

interface OverpassElement {
  type: string;
  id: number;
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
}

// The main Overpass instance frequently returns 504 under load, which would silently
// produce zero zones. Rotate through mirrors so a busy primary doesn't break the map.
const OVERPASS_MIRRORS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

// A hung/overloaded mirror can otherwise stall a request for well over a minute before
// the platform's own default timeout kicks in (observed: 114s on a single mirror during
// testing). Each mirror gets a hard budget; a slow one is abandoned in favour of the next
// rather than left to hang the whole analysis.
const MIRROR_TIMEOUT_MS = 8_000;

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function runOverpass(query: string): Promise<OverpassElement[]> {
  for (const url of OVERPASS_MIRRORS) {
    try {
      // Overpass expects the query as a URL-encoded `data` form field, and rejects
      // requests without an identifying User-Agent (406). Public mirrors also
      // rate-limit aggressively (429), hence the rotation.
      const res = await fetchWithTimeout(
        url,
        {
          method: "POST",
          body: `data=${encodeURIComponent(query)}`,
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "Envis-Aegis/1.0 (climate resilience mapping)",
          },
          cache: "no-store",
        },
        MIRROR_TIMEOUT_MS
      );
      if (!res.ok) {
        console.log(`[hazard-zones] ${url} -> HTTP ${res.status}`);
        continue;
      }
      const text = await res.text();
      if (!text.trim().startsWith("{")) {
        console.log(`[hazard-zones] ${url} -> non-JSON response (busy mirror)`);
        continue;
      }
      const data = JSON.parse(text);
      const elements = (data.elements || []) as OverpassElement[];
      console.log(`[hazard-zones] ${url} -> ${elements.length} elements`);
      if (elements.length > 0) return elements;
    } catch (err: any) {
      const reason = err?.name === "AbortError" ? `timed out after ${MIRROR_TIMEOUT_MS}ms` : err.message;
      console.log(`[hazard-zones] ${url} -> ${reason}`);
      continue;
    }
  }
  return [];
}

// In-memory response cache. Overpass/elevation/weather calls here are the slowest and
// most rate-limit-prone part of the app, and re-analyzing the same location (or two
// judges/users looking at the same city) previously re-ran all of them from scratch
// every time. Keyed on rounded coordinates so nearby clicks share a cache entry.
// Process-lifetime only — resets on redeploy, which is an acceptable tradeoff for the
// quota/latency it saves versus the complexity of a real cache backend.
const RESULT_CACHE_TTL_MS = 20 * 60 * 1000;
const resultCache = new Map<string, { expires: number; body: any }>();

function cacheKey(hazardType: string, lat: number, lng: number, radiusKm: number): string {
  return `${hazardType}:${lat.toFixed(2)}:${lng.toFixed(2)}:${radiusKm}`;
}

function getCached(key: string): any | null {
  const entry = resultCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    resultCache.delete(key);
    return null;
  }
  return entry.body;
}

function setCached(key: string, body: any) {
  resultCache.set(key, { expires: Date.now() + RESULT_CACHE_TTL_MS, body });
  // Simple unbounded-growth guard — this is a demo-scale cache, not a production LRU.
  if (resultCache.size > 500) {
    const oldestKey = resultCache.keys().next().value;
    if (oldestKey) resultCache.delete(oldestKey);
  }
}

function bbox(lat: number, lng: number, radiusKm: number) {
  const dLat = radiusKm / 111.32;
  const dLng = radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180));
  return {
    south: lat - dLat,
    north: lat + dLat,
    west: lng - dLng,
    east: lng + dLng,
  };
}

/** Convert an Overpass way's geometry into a closed GeoJSON polygon ring. */
function toPolygon(el: OverpassElement): number[][] | null {
  if (!el.geometry || el.geometry.length < 3) return null;
  const ring = el.geometry.map((p) => [p.lon, p.lat]);
  const [fx, fy] = ring[0];
  const [lx, ly] = ring[ring.length - 1];
  if (fx !== lx || fy !== ly) ring.push([fx, fy]);
  if (ring.length < 4) return null;
  return ring;
}

/** Rough polygon area in km² (equirectangular shoelace — fine at city scale). */
function polygonAreaKm2(ring: number[][]): number {
  if (ring.length < 4) return 0;
  const latRef = (ring[0][1] * Math.PI) / 180;
  const kx = 111.32 * Math.cos(latRef);
  const ky = 110.57;
  let area = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    area += x1 * kx * (y2 * ky) - x2 * kx * (y1 * ky);
  }
  return Math.abs(area / 2);
}

function centroid(ring: number[][]): [number, number] {
  let sx = 0;
  let sy = 0;
  const n = ring.length - 1;
  for (let i = 0; i < n; i++) {
    sx += ring[i][0];
    sy += ring[i][1];
  }
  return [sx / n, sy / n];
}

/** Expand a line (river/stream) into a polygon corridor of the given half-width. */
function bufferLine(geometry: { lat: number; lon: number }[], halfWidthKm: number): number[][] | null {
  if (geometry.length < 2) return null;
  const latRef = (geometry[0].lat * Math.PI) / 180;
  const dLat = halfWidthKm / 110.57;
  const dLng = halfWidthKm / (111.32 * Math.cos(latRef));

  const left: number[][] = [];
  const right: number[][] = [];
  for (let i = 0; i < geometry.length; i++) {
    const prev = geometry[Math.max(0, i - 1)];
    const next = geometry[Math.min(geometry.length - 1, i + 1)];
    let dx = next.lon - prev.lon;
    let dy = next.lat - prev.lat;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    // perpendicular
    const px = -dy * dLng;
    const py = dx * dLat;
    left.push([geometry[i].lon + px, geometry[i].lat + py]);
    right.push([geometry[i].lon - px, geometry[i].lat - py]);
  }
  const ring = [...left, ...right.reverse()];
  ring.push(ring[0]);
  return ring.length >= 4 ? ring : null;
}

/** Batch elevation lookup (Open-Meteo, keyless). Returns null on failure. */
async function fetchElevations(points: [number, number][]): Promise<number[] | null> {
  if (points.length === 0) return [];
  try {
    const lats = points.map((p) => p[1].toFixed(5)).join(",");
    const lngs = points.map((p) => p[0].toFixed(5)).join(",");
    const res = await fetch(
      `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lngs}`,
      { next: { revalidate: 86400 } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const elev = data.elevation;
    return Array.isArray(elev) ? elev : null;
  } catch {
    return null;
  }
}

/** Recent + historical rainfall and temperature for scoring. */
async function fetchWeatherContext(lat: number, lng: number) {
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&past_days=30&daily=precipitation_sum,temperature_2m_max&timezone=auto`,
      { next: { revalidate: 3600 } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const precip: number[] = (data.daily?.precipitation_sum || []).filter((v: any) => typeof v === "number");
    const temps: number[] = (data.daily?.temperature_2m_max || []).filter((v: any) => typeof v === "number");
    const recent7 = precip.slice(-7).reduce((a, b) => a + b, 0);
    const total = precip.reduce((a, b) => a + b, 0);
    const maxTemp = temps.length ? Math.max(...temps) : 0;
    const avgTemp = temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : 0;
    return { recent7DayPrecipMm: recent7, total30DayPrecipMm: total, maxTempC: maxTemp, avgTempC: avgTemp };
  } catch {
    return null;
  }
}

function feature(ring: number[][], props: Record<string, any>) {
  return {
    type: "Feature" as const,
    geometry: { type: "Polygon" as const, coordinates: [ring] },
    properties: props,
  };
}

export async function POST(req: Request) {
  let lat: number, lng: number, hazardType: string, radiusKm: number;
  try {
    const body = await req.json();
    lat = body.lat;
    lng = body.lng;
    hazardType = body.hazardType;
    radiusKm = body.radiusKm ?? 12;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof lat !== "number" || typeof lng !== "number" || !hazardType) {
    return NextResponse.json({ error: "lat, lng, hazardType required" }, { status: 400 });
  }

  const key = cacheKey(hazardType, lat, lng, radiusKm);
  const cached = getCached(key);
  if (cached) {
    return NextResponse.json({ ...cached, cached: true });
  }

  function respond(body: any) {
    setCached(key, body);
    return NextResponse.json(body);
  }

  const b = bbox(lat, lng, radiusKm);
  const bboxStr = `${b.south},${b.west},${b.north},${b.east}`;
  const weather = await fetchWeatherContext(lat, lng);

  // ---------------- WILDFIRE: real forest/scrub polygons scored by dryness ----------------
  if (hazardType === "Wildfire") {
    const elements = await runOverpass(`[out:json][timeout:30];
(
  way["landuse"="forest"](${bboxStr});
  way["natural"="wood"](${bboxStr});
  way["natural"="scrub"](${bboxStr});
  way["landuse"="meadow"](${bboxStr});
);
out geom 220;`);

    // Sentinel-2 NDMI measures actual leaf water content — a green canopy can still be
    // water-stressed and combustible, which temperature+rainfall alone cannot see.
    let fuel: { fuelDrynessIndex: number; ndmi: number } | null = null;
    try {
      const origin = new URL(req.url).origin;
      const vegRes = await fetch(`${origin}/api/vegetation?lat=${lat}&lng=${lng}&radiusKm=${Math.min(radiusKm, 20)}`, { next: { revalidate: 3600 } });
      if (vegRes.ok) {
        const vegData = await vegRes.json();
        if (vegData.available) fuel = { fuelDrynessIndex: vegData.fuelDrynessIndex, ndmi: vegData.ndmi };
      }
    } catch {
      /* keep null — falls back to temp+rain proxy */
    }

    const weatherDryness = weather
      ? Math.max(0, Math.min(1, (weather.maxTempC - 22) / 20)) *
        Math.max(0, Math.min(1, 1 - weather.total30DayPrecipMm / 60))
      : 0.4;
    const dryness = fuel ? fuel.fuelDrynessIndex * 0.65 + weatherDryness * 0.35 : weatherDryness;

    const zones = elements
      .map((el) => {
        const ring = toPolygon(el);
        if (!ring) return null;
        const areaKm2 = polygonAreaKm2(ring);
        if (areaKm2 < 0.005) return null;
        // Bigger contiguous vegetation + drier conditions = higher fire risk
        const sizeFactor = Math.min(1, areaKm2 / 2);
        const score = dryness * 0.7 + sizeFactor * 0.3;
        const severity: Severity = score > 0.55 ? "high" : score > 0.3 ? "medium" : "low";
        return feature(ring, {
          hazardType: "Wildfire",
          severity,
          score: Number(score.toFixed(2)),
          areaKm2: Number(areaKm2.toFixed(3)),
          name: el.tags?.name || null,
          landcover: el.tags?.landuse || el.tags?.natural || "vegetation",
          reason: `${(el.tags?.landuse || el.tags?.natural || "vegetation").replace(/_/g, " ")} block of ${areaKm2.toFixed(2)} km²${fuel ? ` · NDMI ${fuel.ndmi.toFixed(2)} (fuel moisture)` : ""}${weather ? ` · ${weather.total30DayPrecipMm.toFixed(0)}mm rain in 30d, peak ${weather.maxTempC.toFixed(0)}°C` : ""}`,
        });
      })
      .filter(Boolean)
      .sort((a: any, z: any) => z.properties.score - a.properties.score)
      .slice(0, 120);

    return respond({
      hazardType,
      source: fuel ? "osm+sentinel2+weather" : "osm+weather",
      method: fuel
        ? "OSM forest/wood/scrub polygons scored by Sentinel-2 NDMI fuel moisture and 30-day rainfall/temperature"
        : "OSM forest/wood/scrub polygons scored by 30-day rainfall deficit and peak temperature (NDMI unavailable)",
      weather,
      fuel,
      zones,
    });
  }

  // ---------------- FLOODING: real water bodies + river corridors, scored by rain ----------------
  if (hazardType === "Flooding" || hazardType === "Thunderstorm" || hazardType === "Tropical Cyclone") {
    const elements = await runOverpass(`[out:json][timeout:30];
(
  way["natural"="water"](${bboxStr});
  way["landuse"="reservoir"](${bboxStr});
  way["water"="reservoir"](${bboxStr});
  way["waterway"="riverbank"](${bboxStr});
  way["waterway"="river"](${bboxStr});
  way["waterway"="stream"](${bboxStr});
);
out geom 200;`);

    const rainFactor = weather
      ? Math.max(0, Math.min(1, weather.recent7DayPrecipMm / 60)) * 0.6 +
        Math.max(0, Math.min(1, weather.total30DayPrecipMm / 150)) * 0.4
      : 0.35;

    const candidates: { ring: number[][]; el: OverpassElement; isBody: boolean }[] = [];
    for (const el of elements) {
      const isLine = el.tags?.waterway === "river" || el.tags?.waterway === "stream";
      if (isLine && el.geometry) {
        const width = el.tags?.waterway === "river" ? 0.35 : 0.15;
        const ring = bufferLine(el.geometry, width);
        if (ring) candidates.push({ ring, el, isBody: false });
      } else {
        const ring = toPolygon(el);
        if (ring && polygonAreaKm2(ring) > 0.002) candidates.push({ ring, el, isBody: true });
      }
    }

    // Sample elevation at each candidate centroid + the target point, so we can tell
    // which water-adjacent areas actually sit low relative to local terrain.
    const sample = candidates.slice(0, 90);
    const centers: [number, number][] = sample.map((c) => centroid(c.ring));
    const elevations = await fetchElevations([[lng, lat], ...centers]);
    const baseElev = elevations?.[0] ?? null;
    const zoneElevs = elevations ? elevations.slice(1) : null;
    const validElevs = (zoneElevs || []).filter((e) => typeof e === "number");
    const medianElev = validElevs.length
      ? [...validElevs].sort((a, b) => a - b)[Math.floor(validElevs.length / 2)]
      : null;

    const zones = sample
      .map((c, i) => {
        const areaKm2 = polygonAreaKm2(c.ring);
        const elev = zoneElevs?.[i] ?? null;
        // Lower than surrounding median terrain = more flood-prone
        let lowLyingFactor = 0.5;
        if (elev !== null && medianElev !== null) {
          lowLyingFactor = elev <= medianElev ? 0.85 : Math.max(0.15, 0.85 - (elev - medianElev) / 60);
        }
        const score = rainFactor * 0.6 + lowLyingFactor * 0.4;
        const severity: Severity = score > 0.6 ? "high" : score > 0.38 ? "medium" : "low";
        const kind = c.el.tags?.landuse === "reservoir" || c.el.tags?.water === "reservoir"
          ? "reservoir"
          : c.el.tags?.waterway === "river"
          ? "river corridor"
          : c.el.tags?.waterway === "stream"
          ? "stream corridor"
          : "water body";
        return feature(c.ring, {
          hazardType: "Flooding",
          severity,
          score: Number(score.toFixed(2)),
          areaKm2: Number(areaKm2.toFixed(3)),
          name: c.el.tags?.name || null,
          waterKind: kind,
          elevationM: elev,
          reason: `Land adjacent to ${c.el.tags?.name ? `${c.el.tags.name} (${kind})` : kind}${elev !== null ? ` at ${elev.toFixed(0)}m` : ""}${weather ? ` · ${weather.recent7DayPrecipMm.toFixed(0)}mm rain in last 7d` : ""}`,
        });
      })
      .sort((a: any, z: any) => z.properties.score - a.properties.score)
      .slice(0, 100);

    return respond({
      hazardType,
      source: "osm+elevation+weather",
      method: "OSM reservoirs/water bodies/river corridors, scored by recent rainfall and elevation relative to local terrain",
      weather,
      baseElevationM: baseElev,
      zones,
    });
  }

  // ---------------- URBAN FLASH FLOOD POINTS: drainage chokepoints ----------------
  // These are the specific places a city floods first: road underpasses, tunnels and
  // culverts sit below surrounding grade, so runoff collects there before anywhere
  // else. Scored by how low each point sits relative to nearby terrain, combined with
  // live soil saturation (saturated ground sheds water instead of absorbing it).
  if (hazardType === "Flash Flood") {
    const elements = await runOverpass(`[out:json][timeout:30];
(
  way["highway"]["tunnel"="yes"](${bboxStr});
  way["highway"]["layer"~"^-"](${bboxStr});
  way["waterway"="culvert"](${bboxStr});
  way["waterway"="drain"](${bboxStr});
  way["waterway"="ditch"](${bboxStr});
  way["man_made"="storm_drain"](${bboxStr});
);
out geom 120;`);

    // Live soil saturation — saturated soil cannot absorb further rainfall.
    let soilSaturation = 0.5;
    let soilNote = "soil moisture unavailable";
    try {
      const smRes = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=soil_moisture_0_to_1cm,soil_moisture_3_to_9cm&forecast_days=1&timezone=auto`,
        { next: { revalidate: 1800 } }
      );
      if (smRes.ok) {
        const smData = await smRes.json();
        const s0: number[] = (smData.hourly?.soil_moisture_0_to_1cm || []).filter((v: any) => typeof v === "number");
        const s9: number[] = (smData.hourly?.soil_moisture_3_to_9cm || []).filter((v: any) => typeof v === "number");
        const avg =
          [...s0, ...s9].length > 0 ? [...s0, ...s9].reduce((a, b) => a + b, 0) / [...s0, ...s9].length : 0.25;
        soilSaturation = Math.max(0, Math.min(1, (avg - 0.22) / 0.18));
        soilNote = `soil moisture ${avg.toFixed(3)} m³/m³`;
      }
    } catch {
      /* keep defaults */
    }

    const rainFactor = weather
      ? Math.max(0, Math.min(1, weather.recent7DayPrecipMm / 60))
      : 0.3;

    // Take a representative point from each candidate feature.
    const candidates = elements
      .filter((el) => el.geometry && el.geometry.length > 0)
      .slice(0, 60)
      .map((el) => {
        const g = el.geometry!;
        const mid = g[Math.floor(g.length / 2)];
        return { el, point: [mid.lon, mid.lat] as [number, number] };
      });

    if (candidates.length === 0) {
      return respond({
        hazardType,
        source: "osm+elevation+weather",
        method: "Road underpasses, tunnels and culverts scored by depth below surrounding grade and live soil saturation",
        weather,
        zones: [],
        note: "No mapped underpasses, tunnels or culverts found in this area.",
      });
    }

    // For each candidate, sample its own elevation plus 4 surrounding points so we can
    // measure how far below local grade it sits.
    const offset = 0.0025; // ~275m
    const lngScale = 1 / Math.cos((lat * Math.PI) / 180);
    const samplePoints: [number, number][] = [];
    for (const c of candidates) {
      const [cx, cy] = c.point;
      samplePoints.push([cx, cy]);
      samplePoints.push([cx, cy + offset]);
      samplePoints.push([cx, cy - offset]);
      samplePoints.push([cx + offset * lngScale, cy]);
      samplePoints.push([cx - offset * lngScale, cy]);
    }

    const elevations = await fetchElevations(samplePoints);

    const cellDeg = 0.0009; // ~100m box drawn around each point
    const zones = candidates
      .map((c, i) => {
        const base = i * 5;
        const own = elevations?.[base] ?? null;
        const around = elevations ? elevations.slice(base + 1, base + 5).filter((v) => typeof v === "number") : [];
        let depthBelowGrade = 0;
        if (own !== null && around.length > 0) {
          const surroundAvg = around.reduce((a, b) => a + b, 0) / around.length;
          depthBelowGrade = surroundAvg - own; // positive = sits in a dip
        }

        const tags = c.el.tags || {};
        const isUnderpass = tags.tunnel === "yes" || (tags.layer && tags.layer.startsWith("-"));
        const kind = isUnderpass
          ? "road underpass"
          : tags.waterway === "culvert"
          ? "culvert"
          : tags.waterway === "drain"
          ? "storm drain"
          : tags.waterway === "ditch"
          ? "drainage ditch"
          : "drainage structure";

        // Structure type is the dominant signal: an underpass is by construction the
        // low point of its road, and OSM tags that reliably. Depth-below-grade is kept
        // but weighted lightly — the public elevation DEM is ~90m resolution and usually
        // cannot resolve a dip only a few metres deep, so it confirms rather than drives.
        const depthFactor = Math.max(0, Math.min(1, depthBelowGrade / 6));
        const structureFactor = isUnderpass ? 0.85 : 0.4;
        const score =
          structureFactor * 0.4 + soilSaturation * 0.28 + rainFactor * 0.22 + depthFactor * 0.1;

        const severity: Severity = score > 0.6 ? "high" : score > 0.42 ? "medium" : "low";
        const [cx, cy] = c.point;
        const ring = [
          [cx - cellDeg * lngScale, cy - cellDeg],
          [cx + cellDeg * lngScale, cy - cellDeg],
          [cx + cellDeg * lngScale, cy + cellDeg],
          [cx - cellDeg * lngScale, cy + cellDeg],
          [cx - cellDeg * lngScale, cy - cellDeg],
        ];

        return feature(ring, {
          hazardType: "Flash Flood",
          severity,
          score: Number(score.toFixed(2)),
          name: tags.name || null,
          structure: kind,
          elevationM: own,
          depthBelowGradeM: Number(depthBelowGrade.toFixed(1)),
          reason: `${tags.name ? `${tags.name} — ` : ""}${kind}${depthBelowGrade > 0.5 ? ` sitting ${depthBelowGrade.toFixed(1)}m below surrounding grade` : ""} · ${soilNote}${weather ? ` · ${weather.recent7DayPrecipMm.toFixed(0)}mm rain in last 7d` : ""}`,
        });
      })
      .sort((a: any, z: any) => z.properties.score - a.properties.score);

    return respond({
      hazardType,
      source: "osm+elevation+weather",
      method: "Road underpasses, tunnels and culverts scored by structure type, live soil saturation and recent rainfall",
      limitation:
        "Depth-below-grade is sampled from a ~90m-resolution public elevation model, which usually cannot resolve an underpass only a few metres deep. Structure type from OpenStreetMap is therefore the primary signal.",
      weather,
      soilSaturation: Number(soilSaturation.toFixed(2)),
      zones,
    });
  }

  // ---------------- LANDSLIDE: steep high ground + recent rainfall ----------------
  if (hazardType === "Landslide") {
    // Sample an elevation grid, then flag cells that are both high relative to the
    // area and steep relative to their neighbours.
    const N = 9;
    const half = radiusKm / 111.32;
    const step = (half * 2) / (N - 1);
    const lngScale = 1 / Math.cos((lat * Math.PI) / 180);

    const grid: [number, number][] = [];
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        grid.push([lng - half * lngScale + c * step * lngScale, lat - half + r * step]);
      }
    }
    const elevations = await fetchElevations(grid);
    if (!elevations) {
      return NextResponse.json({ hazardType, source: "unavailable", zones: [], note: "Elevation data unavailable." });
    }

    const valid = elevations.filter((e) => typeof e === "number");
    const maxElev = Math.max(...valid);
    const minElev = Math.min(...valid);
    const coarseRelief = Math.max(1, maxElev - minElev);

    // Copernicus DEM (30m) resolves relief and slope an order of magnitude finer than
    // the 9x9 Open-Meteo grid (~1.3km cell spacing at 12km radius). When available,
    // its relief figure and steepest-cell reading replace the coarse estimate.
    let terrainNote = "";
    let relief = coarseRelief;
    let slopeCeilingPct = 12; // slopeFactor saturates here by default
    let terrainSource: any = null;
    try {
      const origin = new URL(req.url).origin;
      const terrainRes = await fetch(`${origin}/api/terrain?lat=${lat}&lng=${lng}&radiusKm=${Math.min(radiusKm, 15)}`, { next: { revalidate: 604800 } });
      if (terrainRes.ok) {
        const t = await terrainRes.json();
        if (t.available) {
          relief = Math.max(1, t.reliefM);
          // A confirmed steep DEM reading means real slopes exceed what the coarse
          // grid can resolve — lower the saturation ceiling so genuinely steep cells
          // score correctly instead of being compressed toward 1.0 by a fixed cap.
          slopeCeilingPct = Math.max(8, Math.min(20, t.maxSlopePct * 0.6));
          terrainSource = t;
          terrainNote = `30m DEM: ${t.reliefM}m relief, ${t.maxSlopePct}% max slope`;
        }
      }
    } catch {
      /* keep coarse elevation-grid estimate */
    }

    const rainFactor = weather
      ? Math.max(0, Math.min(1, weather.recent7DayPrecipMm / 50)) * 0.65 +
        Math.max(0, Math.min(1, weather.total30DayPrecipMm / 120)) * 0.35
      : 0.3;

    // Soil composition governs whether a wet slope actually fails. Clay-rich soil
    // holds water and loses shear strength once saturated, which is why two
    // hillsides at the same gradient and rainfall can behave differently.
    let soilFactor = 0.4;
    let soilNote = "soil composition unavailable";
    try {
      const soilRes = await fetch(
        `https://rest.isric.org/soilgrids/v2.0/properties/query?lon=${lng}&lat=${lat}&property=clay&property=sand&depth=15-30cm&value=mean`,
        { next: { revalidate: 604800 } }
      );
      if (soilRes.ok) {
        const soilData = await soilRes.json();
        const layers = soilData?.properties?.layers || [];
        const clayRaw = layers.find((l: any) => l.name === "clay")?.depths?.[0]?.values?.mean;
        const sandRaw = layers.find((l: any) => l.name === "sand")?.depths?.[0]?.values?.mean;
        if (typeof clayRaw === "number") {
          const clayPct = clayRaw / 10;
          const sandPct = typeof sandRaw === "number" ? sandRaw / 10 : null;
          // 15% clay -> 0, 45% clay -> 1; free-draining sand pulls the score back down.
          soilFactor = Math.max(0, Math.min(1, (clayPct - 15) / 30));
          if (sandPct !== null && sandPct > 60) soilFactor *= 0.6;
          soilNote = `${clayPct.toFixed(0)}% clay${sandPct !== null ? `, ${sandPct.toFixed(0)}% sand` : ""}`;
        }
      }
    } catch {
      /* keep the neutral default */
    }

    const cellLat = step;
    const cellLng = step * lngScale;
    const zones: any[] = [];

    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const idx = r * N + c;
        const e = elevations[idx];
        if (typeof e !== "number") continue;

        // Max gradient against 4-neighbours, in metres per metre
        let maxDrop = 0;
        const neighbours = [
          r > 0 ? elevations[(r - 1) * N + c] : null,
          r < N - 1 ? elevations[(r + 1) * N + c] : null,
          c > 0 ? elevations[r * N + (c - 1)] : null,
          c < N - 1 ? elevations[r * N + (c + 1)] : null,
        ];
        for (const nb of neighbours) {
          if (typeof nb === "number") maxDrop = Math.max(maxDrop, Math.abs(e - nb));
        }
        const cellMeters = step * 111320;
        const gradientPct = (maxDrop / cellMeters) * 100;

        const heightFactor = (e - minElev) / relief;
        const slopeFactor = Math.min(1, gradientPct / slopeCeilingPct);
        // Landslides need BOTH steep ground and water — rain is the trigger.
        const score = slopeFactor * 0.38 + heightFactor * 0.15 + rainFactor * 0.3 + soilFactor * 0.17;
        if (slopeFactor < 0.12) continue; // genuinely flat ground is not a landslide zone

        const severity: Severity = score > 0.6 ? "high" : score > 0.4 ? "medium" : "low";
        const [cx, cy] = grid[idx];
        const ring = [
          [cx - cellLng / 2, cy - cellLat / 2],
          [cx + cellLng / 2, cy - cellLat / 2],
          [cx + cellLng / 2, cy + cellLat / 2],
          [cx - cellLng / 2, cy + cellLat / 2],
          [cx - cellLng / 2, cy - cellLat / 2],
        ];
        zones.push(
          feature(ring, {
            hazardType: "Landslide",
            severity,
            score: Number(score.toFixed(2)),
            elevationM: Number(e.toFixed(0)),
            gradientPct: Number(gradientPct.toFixed(1)),
            soil: soilNote,
            reason: `Elevation ${e.toFixed(0)}m with ${gradientPct.toFixed(1)}% local gradient · ${soilNote}${weather ? ` · ${weather.recent7DayPrecipMm.toFixed(0)}mm rain in last 7d saturating slope` : ""}`,
          })
        );
      }
    }

    zones.sort((a, z) => z.properties.score - a.properties.score);

    return respond({
      hazardType,
      source: terrainSource ? "elevation+copernicus-dem+soil+weather" : "elevation+weather",
      method: terrainSource
        ? "Elevation grid slope, calibrated against Copernicus DEM (30m) relief and steepest-cell reading, scored against soil clay content and recent rainfall"
        : "Elevation grid sampled for slope gradient and relative height, scored against recent rainfall as the saturation trigger (Copernicus DEM unavailable)",
      weather,
      reliefM: Number(relief.toFixed(0)),
      terrain: terrainSource ? { reliefM: terrainSource.reliefM, maxSlopePct: terrainSource.maxSlopePct, meanSlopePct: terrainSource.meanSlopePct, note: terrainNote } : null,
      zones: zones.slice(0, 60),
    });
  }

  // No polygon model for this hazard type — caller should fall back to the AI zones.
  return NextResponse.json({
    hazardType,
    source: "unsupported",
    zones: [],
    note: `No physical polygon model for "${hazardType}". Use /api/vulnerability-zones for an AI structural assessment instead.`,
  });
}
