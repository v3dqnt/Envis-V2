import { NextResponse } from "next/server";

// Generate a circle polygon as GeoJSON coordinates
function circlePolygon(
  lng: number,
  lat: number,
  radiusKm: number,
  points = 64
): number[][] {
  const coords: number[][] = [];
  for (let i = 0; i <= points; i++) {
    const angle = (i / points) * 2 * Math.PI;
    const dLng =
      (radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180))) * Math.cos(angle);
    const dLat = (radiusKm / 110.574) * Math.sin(angle);
    coords.push([lng + dLng, lat + dLat]);
  }
  return coords;
}

// Synthetic cyclone forecast track + uncertainty cone
function generateCycloneTrack(
  lng: number,
  lat: number,
  windSpeed = 100
): GeoJSON.FeatureCollection {
  // Basin-aware motion vector
  const isNH = lat > 0;
  // Atlantic/Gulf curves poleward-northeast; Pacific curves northwest then northeast
  const latStep = isNH ? 1.4 : -1.4;
  const lngStep = isNH
    ? lng < -30
      ? 0.9   // Atlantic — northeast
      : -0.5  // Eastern Pacific — northwest
    : lng > 100
    ? -0.6   // Western Pacific — northwest
    : 0.8;   // Indian Ocean — southeast

  // 6 forecast nodes × 12 hours = 72-hour track
  const forecastPts: [number, number][] = [[lng, lat]];
  for (let i = 1; i <= 6; i++) {
    forecastPts.push([lng + lngStep * i, lat + latStep * i]);
  }

  // Cone: half-width widens 30 km per step (NHC-style)
  const perpAngle = Math.atan2(latStep, lngStep) + Math.PI / 2;
  const left: number[][] = [];
  const right: number[][] = [];
  forecastPts.forEach((pt, i) => {
    const halfKm = 40 + i * 35;
    const dLng =
      (halfKm / (111.32 * Math.cos((pt[1] * Math.PI) / 180))) * Math.cos(perpAngle);
    const dLat = (halfKm / 110.574) * Math.sin(perpAngle);
    left.push([pt[0] - dLng, pt[1] - dLat]);
    right.push([pt[0] + dLng, pt[1] + dLat]);
  });
  const coneRing = [...left, ...[...right].reverse(), left[0]];

  // Wind radii circles (at current position)
  const r64 = windSpeed >= 119 ? windSpeed * 0.4 : 0; // kt 64 radius in km approx
  const r34 = windSpeed * 0.8;

  const features: GeoJSON.Feature[] = [
    {
      type: "Feature",
      properties: { role: "cone" },
      geometry: { type: "Polygon", coordinates: [coneRing] },
    },
    {
      type: "Feature",
      properties: { role: "forecast_track" },
      geometry: { type: "LineString", coordinates: forecastPts },
    },
    {
      type: "Feature",
      properties: { role: "wind_r34", radius_km: Math.round(r34) },
      geometry: {
        type: "Polygon",
        coordinates: [circlePolygon(lng, lat, r34)],
      },
    },
    {
      type: "Feature",
      properties: { role: "current", windSpeed },
      geometry: { type: "Point", coordinates: [lng, lat] },
    },
  ];

  if (r64 > 0) {
    features.splice(3, 0, {
      type: "Feature",
      properties: { role: "wind_r64", radius_km: Math.round(r64) },
      geometry: {
        type: "Polygon",
        coordinates: [circlePolygon(lng, lat, r64)],
      },
    });
  }

  return { type: "FeatureCollection", features };
}

// Earthquake affected zones — three concentric rings using empirical magnitude scaling
function generateEarthquakeZones(
  lng: number,
  lat: number,
  magnitude: number,
  depth = 10
): GeoJSON.FeatureCollection {
  // Wells & Coppersmith-inspired empirical radius (km)
  // Adjusted by focal depth: shallow quakes feel wider
  const depthFactor = depth < 30 ? 1.3 : depth < 70 ? 1.0 : 0.7;
  const base = Math.pow(10, (magnitude - 4.0) / 2.0) * depthFactor;

  const severeKm   = Math.max(5,  Math.round(base * 7));
  const moderateKm = Math.max(20, Math.round(base * 22));
  const lightKm    = Math.max(60, Math.round(base * 65));

  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { zone: "light", label: `Felt (IV–V MMI) · ~${lightKm} km` },
        geometry: { type: "Polygon", coordinates: [circlePolygon(lng, lat, lightKm)] },
      },
      {
        type: "Feature",
        properties: { zone: "moderate", label: `Moderate damage (VI–VII MMI) · ~${moderateKm} km` },
        geometry: { type: "Polygon", coordinates: [circlePolygon(lng, lat, moderateKm)] },
      },
      {
        type: "Feature",
        properties: { zone: "severe", label: `Severe damage (VIII+ MMI) · ~${severeKm} km` },
        geometry: { type: "Polygon", coordinates: [circlePolygon(lng, lat, severeKm)] },
      },
      {
        type: "Feature",
        properties: { zone: "epicentre" },
        geometry: { type: "Point", coordinates: [lng, lat] },
      },
    ],
  };
}

export async function POST(req: Request) {
  const { id, type, source, coordinates, magnitude, depth, windSpeed } =
    await req.json();

  const [lng, lat] = coordinates as [number, number];
  const isCyclone = ["Tropical Cyclone", "Hurricane", "Typhoon", "Tornado", "Extreme Rainfall"].includes(type);
  const isEarthquake = type === "Earthquake";

  if (isCyclone) {
    const geojson = generateCycloneTrack(lng, lat, windSpeed ?? 100);
    return NextResponse.json({ eventType: "cyclone", geojson });
  }

  if (isEarthquake) {
    const geojson = generateEarthquakeZones(lng, lat, magnitude ?? 5, depth ?? 10);
    return NextResponse.json({ eventType: "earthquake", geojson });
  }

  return NextResponse.json({ eventType: null, geojson: null });
}
