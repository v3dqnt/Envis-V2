import { NextResponse } from "next/server";

/**
 * Tornado tracking: real NWS warning polygons + embedded storm motion where
 * they exist (the US only — api.weather.gov has no equivalent elsewhere),
 * falling back to an operator-placed position/bearing/speed anywhere else.
 * Both paths run through the same forward-projection math, so the map layer
 * doesn't need to know which one produced a given feature.
 *
 * GET  -> live NWS active tornado warnings, each with a projected corridor.
 * POST -> one operator-placed tornado, projected the same way.
 */

const EARTH_RADIUS_KM = 6371;

/** Destination point given a start coordinate, bearing (deg) and distance (km). */
function destinationPoint(start: [number, number], bearingDeg: number, distKm: number): [number, number] {
  const bearing = (bearingDeg * Math.PI) / 180;
  const lat1 = (start[1] * Math.PI) / 180;
  const lng1 = (start[0] * Math.PI) / 180;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(distKm / EARTH_RADIUS_KM) + Math.cos(lat1) * Math.sin(distKm / EARTH_RADIUS_KM) * Math.cos(bearing)
  );
  const lng2 = lng1 + Math.atan2(
    Math.sin(bearing) * Math.sin(distKm / EARTH_RADIUS_KM) * Math.cos(lat1),
    Math.cos(distKm / EARTH_RADIUS_KM) - Math.sin(lat1) * Math.sin(lat2)
  );
  return [(lng2 * 180) / Math.PI, (lat2 * 180) / Math.PI];
}

/** Perpendicular offset point, for building a corridor polygon either side of the centreline. */
function offsetPoint(point: [number, number], bearingDeg: number, distKm: number): [number, number] {
  return destinationPoint(point, bearingDeg + 90, distKm);
}

const LEAD_TIME_MINUTES = [5, 10, 15, 30];

// Damage-corridor half-width by EF rating. Path width correlates with
// intensity (roughly +17% expected intensity per +1km of path width in the
// literature) but varies enough that width alone cannot pin a rating — these
// are display defaults, not a claim about this specific tornado, and every
// response carries a note saying so. "unknown" uses the EF1 figure, since most
// tornadoes are weak and defaulting to the least alarming plausible width is
// the safer error when a rating genuinely isn't known.
const CORRIDOR_HALF_WIDTH_KM: Record<string, number> = {
  EF0: 0.04,
  EF1: 0.075,
  EF2: 0.15,
  EF3: 0.25,
  EF4: 0.4,
  EF5: 0.6,
  unknown: 0.075,
};

interface ProjectedTornado {
  id: string;
  source: "nws" | "operator";
  position: [number, number];
  bearingDeg: number;
  speedKmh: number;
  efRating: string;
  warningPolygon: number[][] | null;
  centreline: number[][];
  corridor: number[][];
  leadTimeMarkers: { minutes: number; position: [number, number] }[];
  note: string;
}

function projectTornado(
  id: string,
  source: "nws" | "operator",
  position: [number, number],
  bearingDeg: number,
  speedKmh: number,
  efRating: string,
  warningPolygon: number[][] | null
): ProjectedTornado {
  const halfWidth = CORRIDOR_HALF_WIDTH_KM[efRating] ?? CORRIDOR_HALF_WIDTH_KM.unknown;
  const maxMinutes = LEAD_TIME_MINUTES[LEAD_TIME_MINUTES.length - 1];
  const maxDistKm = (speedKmh / 60) * maxMinutes;

  const farEnd = destinationPoint(position, bearingDeg, maxDistKm);
  const centreline: number[][] = [position, farEnd];
  const leadTimeMarkers = LEAD_TIME_MINUTES.map((minutes) => ({
    minutes,
    position: destinationPoint(position, bearingDeg, (speedKmh / 60) * minutes),
  }));

  // Corridor: a rectangle along the centreline, offset half-width either side.
  const nearLeft = offsetPoint(position, bearingDeg, halfWidth);
  const nearRight = offsetPoint(position, bearingDeg, -halfWidth);
  const farLeft = offsetPoint(farEnd, bearingDeg, halfWidth);
  const farRight = offsetPoint(farEnd, bearingDeg, -halfWidth);
  const corridor = [nearLeft, farLeft, farRight, nearRight, nearLeft];

  return {
    id,
    source,
    position,
    bearingDeg,
    speedKmh,
    efRating,
    warningPolygon,
    centreline,
    corridor,
    leadTimeMarkers,
    note: `Corridor width modelled for ${efRating === "unknown" ? "an assumed EF1 (rating unconfirmed)" : efRating} — path width correlates with intensity but does not by itself confirm a rating.`,
  };
}

/**
 * Legacy TIME...MOT...LOC storm-motion line, still embedded in NWS warning
 * text: "TIME...MOT...LOC 2253Z 254DEG 42KT 2685 9949" — direction in degrees
 * (the bearing the storm is moving toward), speed in knots, location as
 * lat/lon *100 (implicitly N/W for US warnings, no sign). Parsed from the
 * warning's free-text description since the structured CAP parameter for the
 * same data is not consistently present across all NWS alert products.
 */
function parseMotion(description: string): { position: [number, number]; bearingDeg: number; speedKmh: number } | null {
  const m = description.match(/TIME\.\.\.MOT\.\.\.LOC\s+\d{3,4}Z\s+(\d{1,3})DEG\s+(\d{1,3})KT\s+(\d+)\s+(\d+)/);
  if (!m) return null;
  const [, dirStr, ktStr, latStr, lngStr] = m;
  const bearingDeg = parseInt(dirStr, 10);
  const speedKmh = parseInt(ktStr, 10) * 1.852;
  const lat = parseInt(latStr, 10) / 100;
  const lng = -(parseInt(lngStr, 10) / 100);
  if (isNaN(bearingDeg) || isNaN(speedKmh) || isNaN(lat) || isNaN(lng)) return null;
  return { position: [lng, lat], bearingDeg, speedKmh };
}

function polygonRing(geometry: any): number[][] | null {
  if (geometry?.type === "Polygon") return geometry.coordinates[0];
  if (geometry?.type === "MultiPolygon") return geometry.coordinates[0]?.[0] ?? null;
  return null;
}

export async function GET() {
  try {
    const res = await fetch("https://api.weather.gov/alerts/active?event=Tornado%20Warning", {
      headers: { Accept: "application/geo+json" },
      next: { revalidate: 60 },
    });
    if (!res.ok) {
      return NextResponse.json({ tornadoes: [], note: `NWS alerts responded ${res.status}` });
    }
    const data = await res.json();
    const features: any[] = data?.features ?? [];

    const tornadoes: ProjectedTornado[] = [];
    for (const f of features) {
      const description: string = f.properties?.description ?? "";
      const motion = parseMotion(description);
      const warningPolygon = polygonRing(f.geometry);
      if (!motion) continue; // no NWS estimate of direction/speed to project from — skip rather than guess

      tornadoes.push(
        projectTornado(
          f.properties?.id ?? f.id ?? `nws-${tornadoes.length}`,
          "nws",
          motion.position,
          motion.bearingDeg,
          motion.speedKmh,
          "unknown", // NWS warnings do not carry a confirmed EF rating pre-event
          warningPolygon
        )
      );
    }

    return NextResponse.json({ tornadoes });
  } catch (err: any) {
    return NextResponse.json({ tornadoes: [], error: err?.message ?? "Failed to reach NWS alerts" }, { status: 502 });
  }
}

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { lat, lng, bearingDeg, speedKmh, efRating } = body;
  if (typeof lat !== "number" || typeof lng !== "number" || isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: "lat and lng must be numbers" }, { status: 400 });
  }
  if (typeof bearingDeg !== "number" || typeof speedKmh !== "number" || isNaN(bearingDeg) || isNaN(speedKmh)) {
    return NextResponse.json({ error: "bearingDeg and speedKmh must be numbers — no default is assumed for an operator-placed tornado" }, { status: 400 });
  }

  const tornado = projectTornado(`operator-${Date.now()}`, "operator", [lng, lat], bearingDeg, speedKmh, efRating ?? "unknown", null);
  return NextResponse.json({ tornado });
}
