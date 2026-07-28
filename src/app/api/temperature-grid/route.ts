import { NextResponse } from "next/server";
import type { Feature, FeatureCollection } from "geojson";

interface GridPoint {
  lat: number;
  lng: number;
}

function buildGrid(
  centerLat: number,
  centerLng: number,
  gridSize: number,
  spanDeg: number
): GridPoint[] {
  const points: GridPoint[] = [];
  const halfSpan = spanDeg / 2;
  const step = gridSize > 1 ? spanDeg / (gridSize - 1) : 0;

  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      points.push({
        lat: centerLat - halfSpan + row * step,
        lng: centerLng - halfSpan + col * step,
      });
    }
  }
  return points;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = parseFloat(searchParams.get("lat") || "");
  const lng = parseFloat(searchParams.get("lng") || "");
  const gridSize = Math.min(Math.max(parseInt(searchParams.get("grid") || "11", 10), 3), 13);
  // Allow sub-degree spans — a tight grid is what makes the heatmap read as a continuous
  // field rather than isolated blobs at city zoom levels.
  const spanDeg = Math.min(Math.max(parseFloat(searchParams.get("span") || "0.6"), 0.1), 10);

  if (isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: "lat and lng are required" }, { status: 400 });
  }

  const grid = buildGrid(lat, lng, gridSize, spanDeg);
  const lats = grid.map((p) => p.lat.toFixed(4)).join(",");
  const lngs = grid.map((p) => p.lng.toFixed(4)).join(",");

  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lngs}&current=temperature_2m,relative_humidity_2m,apparent_temperature&timezone=auto`,
      { next: { revalidate: 600 } } // cache 10 min
    );

    if (!res.ok) {
      const text = await res.text();
      console.error("[Temperature Grid] Open-Meteo error:", text);
      return NextResponse.json({ error: "Open-Meteo fetch failed" }, { status: 502 });
    }

    const data = await res.json();

    // For multi-coordinate requests Open-Meteo returns an ARRAY of location objects,
    // each with its own `current` block — not a single object holding arrays.
    // (A single-coordinate request returns one bare object, hence the fallback.)
    const locations: any[] = Array.isArray(data) ? data : [data];
    const temps: (number | null)[] = locations.map((loc) => loc?.current?.temperature_2m ?? null);
    const humids: (number | null)[] = locations.map((loc) => loc?.current?.relative_humidity_2m ?? null);
    const apparentTemps: (number | null)[] = locations.map((loc) => loc?.current?.apparent_temperature ?? null);

    const features: Feature[] = grid.map((point, idx) => {
      const temp = temps[idx] ?? null;
      const tempLabel = temp !== null && !isNaN(temp)
        ? `${Math.round(temp)}°`
        : "—";
      return {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [point.lng, point.lat],
        },
        properties: {
          temperature: temp,
          temperatureLabel: tempLabel,
          humidity: humids[idx] ?? null,
          apparentTemperature: apparentTemps[idx] ?? null,
        },
      };
    });

    const geojson: FeatureCollection = {
      type: "FeatureCollection",
      features,
    };

    // Compute grid metadata for legend
    const validTemps = temps.filter((t): t is number => t !== null && !isNaN(t));
    const minTemp = validTemps.length > 0 ? Math.min(...validTemps) : 0;
    const maxTemp = validTemps.length > 0 ? Math.max(...validTemps) : 0;

    return NextResponse.json({
      grid: geojson,
      meta: {
        center: [lng, lat],
        gridSize,
        spanDeg,
        pointCount: grid.length,
        minTemp,
        maxTemp,
        avgTemp: validTemps.length > 0
          ? validTemps.reduce((a, b) => a + b, 0) / validTemps.length
          : 0,
      },
    });
  } catch (error: any) {
    console.error("[Temperature Grid] Fatal error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
