import { NextResponse } from "next/server";
import { getSupabaseAdmin, supabaseUnavailable } from "@/lib/supabase";

/**
 * Point-radius alert lookup — used for a simple "what's near this
 * coordinate" query (e.g. a mobile app's map view), independent of any
 * registered device. Delegates the actual distance math to the
 * nearby_alerts() PostGIS function so it's a single indexed query rather
 * than pulling every alert row and filtering in JS.
 */
export async function GET(req: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json(supabaseUnavailable(), { status: 503 });

  const { searchParams } = new URL(req.url);
  const lat = parseFloat(searchParams.get("lat") || "");
  const lng = parseFloat(searchParams.get("lng") || "");
  const radiusKm = searchParams.get("radiusKm");

  if (isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: "lat and lng are required" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("nearby_alerts", {
    p_lat: lat,
    p_lng: lng,
    p_radius_m: radiusKm ? parseFloat(radiusKm) * 1000 : null,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const alerts = (data || []).map(formatAlertRow);
  return NextResponse.json({ alerts });
}

function formatAlertRow(a: any) {
  return {
    id: a.id,
    hazardType: a.hazard_type,
    severity: a.severity,
    source: a.source,
    title: a.title,
    message: a.message,
    method: a.method,
    riskScore: a.risk_score,
    leadTimeHours: a.lead_time_hours,
    radiusM: a.radius_m,
    cityName: a.city_name,
    origin: { lat: a.origin_lat, lng: a.origin_lng },
    distanceM: Math.round(a.distance_m),
    publishedAt: a.published_at,
    expiresAt: a.expires_at,
  };
}
