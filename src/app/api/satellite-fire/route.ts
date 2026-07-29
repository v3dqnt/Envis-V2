import { NextResponse } from "next/server";

export interface FireHotspot {
  lat: number;
  lng: number;
  confidence: string;
  frp: number | null;
  acqDate: string;
  distanceKm: number;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const cols = line.split(",");
    const row: Record<string, string> = {};
    headers.forEach((h, i) => (row[h.trim()] = cols[i]?.trim() ?? ""));
    return row;
  });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = parseFloat(searchParams.get("lat") || "");
  const lng = parseFloat(searchParams.get("lng") || "");
  const radiusKm = Math.min(Math.max(parseFloat(searchParams.get("radiusKm") || "50"), 5), 200);

  if (isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: "lat and lng are required" }, { status: 400 });
  }

  const mapKey = process.env.NASA_FIRMS_MAP_KEY;
  if (!mapKey) {
    return NextResponse.json({ available: false, note: "NASA_FIRMS_MAP_KEY not configured — satellite fire detection disabled.", hotspots: [] });
  }

  const dLat = radiusKm / 111.32;
  const dLng = radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180));
  const west = (lng - dLng).toFixed(4);
  const east = (lng + dLng).toFixed(4);
  const south = (lat - dLat).toFixed(4);
  const north = (lat + dLat).toFixed(4);

  try {
    const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${mapKey}/VIIRS_SNPP_NRT/${west},${south},${east},${north}/1`;
    const res = await fetch(url, { next: { revalidate: 1800 } });
    if (!res.ok) {
      return NextResponse.json({ available: false, note: `FIRMS API returned ${res.status}`, hotspots: [] });
    }
    const text = await res.text();
    const rows = parseCsv(text);

    const hotspots: FireHotspot[] = rows
      .map((row) => {
        const hLat = parseFloat(row.latitude);
        const hLng = parseFloat(row.longitude);
        if (isNaN(hLat) || isNaN(hLng)) return null;
        return {
          lat: hLat,
          lng: hLng,
          confidence: row.confidence || "unknown",
          frp: row.frp ? parseFloat(row.frp) : null,
          acqDate: row.acq_date || "",
          distanceKm: haversineKm(lat, lng, hLat, hLng),
        };
      })
      .filter((h): h is FireHotspot => h !== null)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, 20);

    return NextResponse.json({
      available: true,
      hotspotCount: hotspots.length,
      nearestDistanceKm: hotspots.length > 0 ? hotspots[0].distanceKm : null,
      hotspots,
      source: "NASA FIRMS VIIRS_SNPP_NRT",
    });
  } catch (error: any) {
    return NextResponse.json({ available: false, note: error.message, hotspots: [] }, { status: 200 });
  }
}
