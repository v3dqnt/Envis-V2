import { NextResponse } from "next/server";

/**
 * Observed vegetation condition from Sentinel-2, via the Copernicus Data Space
 * Sentinel Hub Statistical API.
 *
 * The wildfire model currently infers fuel state from the existence of a forest
 * polygon in OpenStreetMap, which says what grows there but nothing about whether
 * it is currently dry enough to burn. Two indices fix that:
 *
 *   NDVI  (NIR - Red) / (NIR + Red)          vegetation greenness and vigour
 *   NDMI  (NIR - SWIR) / (NIR + SWIR)        vegetation water content
 *
 * NDMI is the more direct fuel-moisture signal. NDVI can stay high in vegetation
 * that is green but water stressed, whereas NDMI falls as leaf water declines.
 *
 * Requires COPERNICUS_CLIENT_ID and COPERNICUS_CLIENT_SECRET (free registration at
 * https://dataspace.copernicus.eu/). Without them this route reports unavailable and
 * the wildfire scoring keeps using vapour pressure deficit and soil moisture alone.
 */

const TOKEN_URL = "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token";
const STATS_URL = "https://sh.dataspace.copernicus.eu/api/v1/statistics";

const EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B04", "B08", "B11", "dataMask"] }],
    output: [
      { id: "ndvi", bands: 1, sampleType: "FLOAT32" },
      { id: "ndmi", bands: 1, sampleType: "FLOAT32" },
      { id: "dataMask", bands: 1 }
    ]
  };
}
function evaluatePixel(s) {
  let ndvi = (s.B08 + s.B04) === 0 ? 0 : (s.B08 - s.B04) / (s.B08 + s.B04);
  let ndmi = (s.B08 + s.B11) === 0 ? 0 : (s.B08 - s.B11) / (s.B08 + s.B11);
  return { ndvi: [ndvi], ndmi: [ndmi], dataMask: [s.dataMask] };
}`;

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(id: string, secret: string): Promise<string | null> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) return cachedToken.token;
  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: id,
        client_secret: secret,
      }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.access_token) return null;
    cachedToken = {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in ?? 600) * 1000,
    };
    return cachedToken.token;
  } catch {
    return null;
  }
}

function interpretNdmi(ndmi: number): string {
  if (ndmi < 0) return "Very low vegetation water content — fuels critically dry";
  if (ndmi < 0.1) return "Low water content — vegetation stressed, readily combustible";
  if (ndmi < 0.25) return "Moderate water content";
  return "High water content — vegetation well hydrated";
}

function interpretNdvi(ndvi: number): string {
  if (ndvi < 0.1) return "Bare ground, water or built surface";
  if (ndvi < 0.3) return "Sparse vegetation";
  if (ndvi < 0.5) return "Moderate vegetation cover";
  return "Dense healthy vegetation";
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = parseFloat(searchParams.get("lat") || "");
  const lng = parseFloat(searchParams.get("lng") || "");
  const radiusKm = Math.min(Math.max(parseFloat(searchParams.get("radiusKm") || "5"), 0.5), 20);

  if (isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: "lat and lng are required" }, { status: 400 });
  }

  const id = process.env.COPERNICUS_CLIENT_ID;
  const secret = process.env.COPERNICUS_CLIENT_SECRET;
  if (!id || !secret) {
    return NextResponse.json({
      available: false,
      note: "COPERNICUS_CLIENT_ID and COPERNICUS_CLIENT_SECRET not configured. Wildfire scoring continues using vapour pressure deficit and soil moisture.",
    });
  }

  const token = await getAccessToken(id, secret);
  if (!token) {
    return NextResponse.json({ available: false, note: "Copernicus authentication failed" });
  }

  const dLat = radiusKm / 111.32;
  const dLng = radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180));

  // Look back 30 days so there is a reasonable chance of a low cloud scene.
  const to = new Date();
  const from = new Date(to);
  from.setDate(to.getDate() - 30);
  const iso = (d: Date) => d.toISOString().split("T")[0];

  try {
    const res = await fetch(STATS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: {
          bounds: {
            bbox: [lng - dLng, lat - dLat, lng + dLng, lat + dLat],
            properties: { crs: "http://www.opengis.net/def/crs/EPSG/0/4326" },
          },
          data: [
            {
              type: "sentinel-2-l2a",
              dataFilter: { maxCloudCoverage: 40 },
            },
          ],
        },
        aggregation: {
          timeRange: { from: `${iso(from)}T00:00:00Z`, to: `${iso(to)}T23:59:59Z` },
          aggregationInterval: { of: "P30D" },
          evalscript: EVALSCRIPT,
          resx: 60,
          resy: 60,
        },
      }),
      cache: "no-store",
    });

    if (!res.ok) {
      const detail = await res.text();
      return NextResponse.json({
        available: false,
        note: `Copernicus statistics API returned ${res.status}`,
        detail: detail.slice(0, 200),
      });
    }

    const data = await res.json();
    const intervals = data?.data || [];
    const withData = intervals.filter((i: any) => i?.outputs?.ndvi?.bands?.B0?.stats?.mean != null);
    if (withData.length === 0) {
      return NextResponse.json({
        available: false,
        note: "No cloud-free Sentinel-2 observation in the last 30 days for this area",
      });
    }

    const latest = withData[withData.length - 1];
    const ndviStats = latest.outputs.ndvi.bands.B0.stats;
    const ndmiStats = latest.outputs.ndmi.bands.B0.stats;

    const ndvi = ndviStats.mean;
    const ndmi = ndmiStats.mean;

    // Fuel dryness rises as water content falls. NDMI near or below zero indicates
    // vegetation that will carry fire readily.
    const fuelDryness = Math.max(0, Math.min(1, (0.25 - ndmi) / 0.35));

    return NextResponse.json({
      available: true,
      ndvi: Number(ndvi.toFixed(3)),
      ndviMin: Number(ndviStats.min.toFixed(3)),
      ndviMax: Number(ndviStats.max.toFixed(3)),
      ndmi: Number(ndmi.toFixed(3)),
      fuelDrynessIndex: Number(fuelDryness.toFixed(2)),
      vegetationCover: interpretNdvi(ndvi),
      moistureStatus: interpretNdmi(ndmi),
      observationDate: latest.interval?.to ?? null,
      source: "Sentinel-2 L2A via Copernicus Data Space",
    });
  } catch (error: any) {
    return NextResponse.json({ available: false, note: error.message });
  }
}
