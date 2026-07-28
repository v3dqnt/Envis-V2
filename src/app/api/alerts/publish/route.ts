import { NextResponse } from "next/server";
import { getSupabaseAdmin, supabaseUnavailable } from "@/lib/supabase";

const VALID_SEVERITY = new Set(["low", "medium", "high"]);
const VALID_SOURCE = new Set(["forecast", "polygon", "gdacs", "manual"]);

/**
 * Materialize a hazard prediction into the alerts table so mobile devices can
 * be matched against it. This is the handoff point between the web app's
 * prediction engines (forecast-risk, hazard-zones, GDACS) and the mobile
 * delivery pipeline — none of those engines write to Supabase themselves,
 * they stay pure prediction services. Something calls this route (Aegis
 * Prevent's "Publish Alert" action, or a scheduled job) once a prediction is
 * judged worth surfacing.
 */
export async function POST(req: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json(supabaseUnavailable(), { status: 503 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    hazardType,
    severity,
    source,
    title,
    message,
    method,
    riskScore,
    leadTimeHours,
    lat,
    lng,
    radiusM,
    impactAreaRing, // optional: [[lng,lat], ...] closed ring, e.g. from a hazard-zones polygon
    cityName,
    rawPayload,
    expiresInHours,
  } = body;

  if (!hazardType || typeof hazardType !== "string") {
    return NextResponse.json({ error: "hazardType is required" }, { status: 400 });
  }
  if (!VALID_SEVERITY.has(severity)) {
    return NextResponse.json({ error: "severity must be low, medium, or high" }, { status: 400 });
  }
  if (!VALID_SOURCE.has(source)) {
    return NextResponse.json({ error: "source must be forecast, polygon, gdacs, or manual" }, { status: 400 });
  }
  if (!title || !message) {
    return NextResponse.json({ error: "title and message are required" }, { status: 400 });
  }
  if (typeof lat !== "number" || typeof lng !== "number" || isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: "lat and lng must be numbers" }, { status: 400 });
  }

  let impactAreaWkt: string | null = null;
  if (Array.isArray(impactAreaRing) && impactAreaRing.length >= 4) {
    const coordsText = impactAreaRing.map((p: number[]) => `${p[0]} ${p[1]}`).join(", ");
    impactAreaWkt = `SRID=4326;POLYGON((${coordsText}))`;
  }

  const expiresAt = new Date(Date.now() + (typeof expiresInHours === "number" ? expiresInHours : 48) * 3600_000).toISOString();

  const { data, error } = await supabase
    .from("alerts")
    .insert({
      hazard_type: hazardType,
      severity,
      source,
      title,
      message,
      method: method ?? null,
      risk_score: typeof riskScore === "number" ? riskScore : null,
      lead_time_hours: typeof leadTimeHours === "number" ? leadTimeHours : null,
      origin: `SRID=4326;POINT(${lng} ${lat})`,
      radius_m: typeof radiusM === "number" ? radiusM : 5000,
      impact_area: impactAreaWkt,
      city_name: cityName ?? null,
      raw_payload: rawPayload ?? null,
      expires_at: expiresAt,
    })
    .select("id, hazard_type, severity, published_at, expires_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ alert: data });
}
