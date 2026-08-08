import { NextResponse } from "next/server";
import { modelledMmiBands, ringPolygonKm, roadCapacityRetention, MMI_BANDS } from "@/lib/seismology";
import { clearanceTime, EVACUATION_VEHICLE_OCCUPANCY } from "@/lib/evacuationCapacity";

/**
 * Earthquake shaking footprint, exposed population, magnitude context, and a
 * realistic post-event evacuation estimate for each intensity band.
 *
 * Prefers real USGS products over anything Envis models itself:
 *
 *   1. ShakeMap  — actual MMI contour polygons, generated for significant events.
 *   2. PAGER     — actual population exposure per MMI band, for every M5.5+ event.
 *   3. Modelled  — src/lib/seismology.ts's Kövesligethy/Blake-form intensity
 *      attenuation + /api/population density, for events with neither product
 *      yet (younger than a few minutes) or below PAGER's M5.5 floor.
 *
 * `source` on the response says honestly which path produced the bands, because
 * a ShakeMap contour and a generalised distance-attenuation estimate are not
 * the same kind of claim and the UI should not present them identically.
 */

const PAGER_MAGNITUDE_FLOOR = 5.5;
// Post-earthquake road capacity assumption for the modelled path: no OSM road
// survey is run here (that is /api/hazard-zones's job for other hazards), so
// this is a stated default rather than a measurement — a mid-size urban area's
// worth of outbound arterials, degraded per band by roadCapacityRetention().
const ASSUMED_OUTBOUND_LANES = 6;
const LANE_CAPACITY_VPH = 1700; // primary-road figure from evacuationCapacity.ts's table

interface Band {
  mmi: number;
  label: string;
  description: string;
  radiusKm: number;
  polygon: number[][];
  population: number;
  populationConfidence: "shakemap-pager" | "modelled-low";
  clearanceHours: number;
  unassignablePeople: number;
  roadCapacityRetention: number;
}

async function tryFetchShakemapPager(usgsId: string): Promise<{
  bands: Omit<Band, "clearanceHours" | "unassignablePeople" | "roadCapacityRetention">[];
} | null> {
  try {
    const detailRes = await fetch(`https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/${usgsId}.geojson`, {
      next: { revalidate: 3600 },
    });
    if (!detailRes.ok) return null;
    const detail = await detailRes.json();
    const products = detail?.properties?.products ?? {};

    const shakemap = products.shakemap?.[0];
    const pager = products.losspager?.[0];
    if (!shakemap) return null;

    // ShakeMap's content keys and PAGER's exposure schema are not officially
    // stable, so this is deliberately defensive: probe for a contour-shaped
    // JSON content, and fall through to the modelled path on anything
    // unexpected rather than throw or fabricate a number.
    const contents = shakemap.contents ?? {};
    const contourKey = Object.keys(contents).find(
      (k) => /cont.*mmi|mmi.*cont/i.test(k) && /\.(geo)?json$/i.test(k)
    );
    if (!contourKey) return null;

    const contourRes = await fetch(contents[contourKey].url, { next: { revalidate: 3600 } });
    if (!contourRes.ok) return null;
    const contourData = await contourRes.json();
    const features: any[] = contourData?.features ?? [];
    if (features.length === 0) return null;

    // PAGER exposure, when present, maps MMI (roman numeral properties like
    // "mmi9") to population. Read defensively; absence just means bands carry
    // no population from this source and the caller can fall back per-band.
    const exposureByMmi: Record<number, number> = {};
    const pagerContents = pager?.contents ?? {};
    const exposureKey = Object.keys(pagerContents).find((k) => /exposure/i.test(k) && /\.json$/i.test(k));
    if (exposureKey) {
      try {
        const expRes = await fetch(pagerContents[exposureKey].url, { next: { revalidate: 3600 } });
        if (expRes.ok) {
          const expData = await expRes.json();
          const populations: number[] = expData?.population ?? [];
          const mmiVals: number[] = expData?.mmi ?? [];
          mmiVals.forEach((mmi: number, i: number) => {
            exposureByMmi[Math.round(mmi)] = (exposureByMmi[Math.round(mmi)] ?? 0) + (populations[i] ?? 0);
          });
        }
      } catch {
        // Exposure is a bonus on top of the contours; keep going without it.
      }
    }

    const bands = features
      .map((f) => {
        const mmiRaw = f.properties?.value ?? f.properties?.mmi ?? f.properties?.MMI;
        const mmi = typeof mmiRaw === "number" ? mmiRaw : parseFloat(mmiRaw);
        if (isNaN(mmi)) return null;
        const ring: number[][] =
          f.geometry?.type === "Polygon"
            ? f.geometry.coordinates[0]
            : f.geometry?.type === "MultiPolygon"
            ? f.geometry.coordinates[0]?.[0]
            : null;
        if (!ring) return null;
        const bandMeta = MMI_BANDS.find((b) => Math.round(mmi) === b.mmi);
        return {
          mmi: Math.round(mmi),
          label: bandMeta?.label ?? `MMI ${Math.round(mmi)}`,
          description: bandMeta?.description ?? "",
          radiusKm: 0, // not meaningful for a real contour; polygon is authoritative
          polygon: ring,
          population: exposureByMmi[Math.round(mmi)] ?? 0,
          populationConfidence: "shakemap-pager" as const,
        };
      })
      .filter((b): b is NonNullable<typeof b> => b != null && b.mmi >= 5);

    return bands.length > 0 ? { bands } : null;
  } catch {
    return null;
  }
}

async function modelledFallback(
  origin: string,
  lat: number,
  lng: number,
  magnitude: number,
  depthKm: number
): Promise<Omit<Band, "clearanceHours" | "unassignablePeople" | "roadCapacityRetention">[]> {
  const bands = modelledMmiBands(magnitude, depthKm);

  // Sample density once at the epicentre — /api/population caps radiusKm at 8,
  // and MMI bands routinely extend well past that, so density is measured near
  // the centre and area-scaled outward rather than requesting a radius the
  // route would silently clamp.
  let densityPerKm2 = 1500; // generic urban fallback if /api/population is unavailable
  try {
    const res = await fetch(`${origin}/api/population?lat=${lat}&lng=${lng}&radiusKm=2`, { next: { revalidate: 3600 } });
    if (res.ok) {
      const data = await res.json();
      if (data.available && typeof data.densityPerKm2 === "number") densityPerKm2 = data.densityPerKm2;
    }
  } catch {
    // Keep the generic default; this is already the low-confidence path.
  }

  return bands.map((b) => {
    const areaKm2 = Math.PI * b.radiusKm * b.radiusKm;
    return {
      mmi: b.mmi,
      label: b.label,
      description: b.description,
      radiusKm: b.radiusKm,
      polygon: ringPolygonKm([lng, lat], b.radiusKm),
      population: Math.round(densityPerKm2 * areaKm2),
      populationConfidence: "modelled-low" as const,
    };
  });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const usgsId = searchParams.get("usgsId");
  const lat = parseFloat(searchParams.get("lat") || "");
  const lng = parseFloat(searchParams.get("lng") || "");
  const magnitude = parseFloat(searchParams.get("magnitude") || "");
  const depthKm = parseFloat(searchParams.get("depth") || "10");

  if (isNaN(lat) || isNaN(lng) || isNaN(magnitude)) {
    return NextResponse.json({ error: "lat, lng and magnitude are required" }, { status: 400 });
  }

  const origin = new URL(req.url).origin;

  let rawBands: Omit<Band, "clearanceHours" | "unassignablePeople" | "roadCapacityRetention">[] | null = null;
  let source: "shakemap" | "modelled" = "modelled";

  if (usgsId && magnitude >= PAGER_MAGNITUDE_FLOOR) {
    const shakemapResult = await tryFetchShakemapPager(usgsId);
    if (shakemapResult) {
      rawBands = shakemapResult.bands;
      source = "shakemap";
    }
  }

  if (!rawBands) {
    rawBands = await modelledFallback(origin, lat, lng, magnitude, Math.max(1, depthKm));
  }

  const bands: Band[] = rawBands.map((b) => {
    const retention = roadCapacityRetention(b.mmi);
    const outboundCapacityVph = ASSUMED_OUTBOUND_LANES * LANE_CAPACITY_VPH * retention;
    const clearance = clearanceTime({
      population: b.population,
      outboundCapacityVph,
      occupancy: EVACUATION_VEHICLE_OCCUPANCY,
      mobilisationHours: 0.5, // shaking has already stopped; this is search/assess/decide time, not warning lead time
    });
    return {
      ...b,
      clearanceHours: Number(clearance.clearanceHours.toFixed(1)),
      unassignablePeople: clearance.unassignablePeople,
      roadCapacityRetention: retention,
    };
  });

  return NextResponse.json({
    source,
    magnitude,
    depthKm,
    epicentre: { lat, lng },
    note:
      source === "shakemap"
        ? "MMI contours from USGS ShakeMap; population exposure from USGS PAGER where available."
        : `No ShakeMap available (event below M${PAGER_MAGNITUDE_FLOOR} or too recent) — bands modelled from a generalised intensity-attenuation relation, and population is area-scaled from a single density sample near the epicentre. Treat as indicative, not authoritative.`,
    assumedOutboundLanes: ASSUMED_OUTBOUND_LANES,
    bands,
  });
}
