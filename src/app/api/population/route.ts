import { NextResponse } from "next/server";

/**
 * Population density derived from real OpenStreetMap building footprints.
 *
 * The existing /api/city-density route asks a language model to recall a density
 * figure, which is a guess dressed as data. This route measures instead: it sums
 * actual mapped building footprints, multiplies by storey counts where OSM records
 * them, and converts habitable floor area into an occupancy estimate.
 *
 * The method is the same principle behind gridded population products such as
 * WorldPop and GHSL, which also disaggregate population using built-up area. The
 * difference is resolution and calibration: those products are calibrated against
 * censuses, this is not. It is an estimate from observed structures rather than a
 * recalled statistic, and it degrades honestly where OSM coverage is thin.
 */

const OVERPASS_MIRRORS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

// Floor area per resident, in square metres. UN-Habitat and national housing
// surveys put typical figures between 20 (dense, lower income) and 60 (spacious).
const FLOOR_AREA_PER_PERSON_M2 = 40;

// Share of built floor area that is residential rather than commercial or industrial.
const RESIDENTIAL_FRACTION = 0.6;

// Assumed storeys when OSM does not record building:levels.
const DEFAULT_LEVELS = 2;

const NON_RESIDENTIAL = new Set([
  "industrial", "warehouse", "retail", "commercial", "office", "garage", "garages",
  "shed", "hangar", "roof", "carport", "greenhouse", "farm_auxiliary", "barn",
  "service", "hut", "kiosk", "parking",
]);

interface OverpassWay {
  type: string;
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
}

async function runOverpass(query: string): Promise<OverpassWay[]> {
  for (const url of OVERPASS_MIRRORS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        body: `data=${encodeURIComponent(query)}`,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "Envis-Aegis/1.0 (climate resilience mapping)",
        },
        next: { revalidate: 86400 },
      });
      if (!res.ok) continue;
      const text = await res.text();
      if (!text.trim().startsWith("{")) continue;
      const data = JSON.parse(text);
      const elements = (data.elements || []) as OverpassWay[];
      if (elements.length > 0) return elements;
    } catch {
      continue;
    }
  }
  return [];
}

/** Planar polygon area in square metres, adequate at neighbourhood scale. */
function footprintAreaM2(geometry: { lat: number; lon: number }[]): number {
  if (geometry.length < 3) return 0;
  const latRef = (geometry[0].lat * Math.PI) / 180;
  const kx = 111320 * Math.cos(latRef);
  const ky = 110574;
  let area = 0;
  for (let i = 0; i < geometry.length; i++) {
    const a = geometry[i];
    const b = geometry[(i + 1) % geometry.length];
    area += a.lon * kx * (b.lat * ky) - b.lon * kx * (a.lat * ky);
  }
  return Math.abs(area / 2);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = parseFloat(searchParams.get("lat") || "");
  const lng = parseFloat(searchParams.get("lng") || "");
  const radiusKm = Math.min(Math.max(parseFloat(searchParams.get("radiusKm") || "2"), 0.3), 8);

  if (isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: "lat and lng are required" }, { status: 400 });
  }

  const dLat = radiusKm / 111.32;
  const dLng = radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180));
  const bbox = `${lat - dLat},${lng - dLng},${lat + dLat},${lng + dLng}`;

  const elements = await runOverpass(`[out:json][timeout:40];
(
  way["building"](${bbox});
);
out geom 3000;`);

  if (elements.length === 0) {
    return NextResponse.json({
      available: false,
      note: "No mapped buildings found. OpenStreetMap coverage may be sparse here, or Overpass is rate limiting.",
    });
  }

  let residentialFloorAreaM2 = 0;
  let totalFootprintM2 = 0;
  let buildingsWithLevels = 0;

  for (const el of elements) {
    if (!el.geometry) continue;
    const tags = el.tags || {};
    const buildingType = tags.building || "yes";
    const footprint = footprintAreaM2(el.geometry);
    if (footprint <= 0) continue;
    totalFootprintM2 += footprint;

    if (NON_RESIDENTIAL.has(buildingType)) continue;

    const levelsTag = tags["building:levels"];
    const levels = levelsTag && !isNaN(Number(levelsTag)) ? Math.max(1, Number(levelsTag)) : DEFAULT_LEVELS;
    if (levelsTag) buildingsWithLevels++;

    // A building tagged explicitly residential counts fully; an untagged one is
    // discounted by the assumed residential share of the built stock.
    const isExplicitlyResidential =
      buildingType === "residential" || buildingType === "house" ||
      buildingType === "apartments" || buildingType === "detached" ||
      buildingType === "terrace" || buildingType === "dormitory";

    residentialFloorAreaM2 += footprint * levels * (isExplicitlyResidential ? 1 : RESIDENTIAL_FRACTION);
  }

  const areaKm2 = Math.PI * radiusKm * radiusKm;
  const estimatedPopulation = residentialFloorAreaM2 / FLOOR_AREA_PER_PERSON_M2;
  const densityPerKm2 = estimatedPopulation / areaKm2;
  const builtUpPct = (totalFootprintM2 / (areaKm2 * 1_000_000)) * 100;

  // Confidence reflects how much of the estimate rests on assumptions rather than tags.
  const levelsCoverage = elements.length > 0 ? buildingsWithLevels / elements.length : 0;
  const confidence =
    elements.length > 500 && levelsCoverage > 0.3
      ? "medium"
      : elements.length > 200
      ? "low"
      : "very low";

  return NextResponse.json({
    available: true,
    estimatedPopulation: Math.round(estimatedPopulation),
    densityPerKm2: Math.round(densityPerKm2),
    areaKm2: Number(areaKm2.toFixed(2)),
    buildingsCounted: elements.length,
    totalFootprintM2: Math.round(totalFootprintM2),
    builtUpPct: Number(builtUpPct.toFixed(1)),
    levelsTaggedPct: Number((levelsCoverage * 100).toFixed(0)),
    confidence,
    method: `Residential floor area divided by ${FLOOR_AREA_PER_PERSON_M2} m² per person. Buildings without a building:levels tag are assumed to have ${DEFAULT_LEVELS} storeys, and untyped buildings are counted at ${RESIDENTIAL_FRACTION * 100}% residential.`,
    limitation:
      "Derived from OpenStreetMap building coverage, not from a census. Under-counts where mapping is incomplete, notably in informal settlements, which is exactly where exposure is often highest.",
    source: "OpenStreetMap building footprints (ODbL)",
  });
}
