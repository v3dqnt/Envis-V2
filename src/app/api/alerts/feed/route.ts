import { NextResponse } from "next/server";
import { getSupabaseAdmin, supabaseUnavailable } from "@/lib/supabase";

/**
 * The main mobile polling endpoint: given a registered device, return every
 * active alert matching either its current location or any of its commute
 * points, tagged with which one matched and how far away it is. This is
 * what a mobile app calls on a timer (or via a scheduled push trigger) to
 * decide what to notify the user about.
 *
 * Each match is also recorded in alert_deliveries — not to suppress repeat
 * results (the response is idempotent; a still-active alert keeps appearing
 * until it expires, since the hazard is still real), but so the mobile
 * client and any server-side analytics can tell "already seen" from "new
 * since last poll" using the delivered_at timestamp already on file.
 */
export async function GET(req: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json(supabaseUnavailable(), { status: 503 });

  const { searchParams } = new URL(req.url);
  const deviceId = searchParams.get("deviceId");
  if (!deviceId) return NextResponse.json({ error: "deviceId query param is required" }, { status: 400 });

  const [locationRes, pointsRes] = await Promise.all([
    supabase.from("device_locations_view").select("lat, lng, updated_at").eq("device_id", deviceId).maybeSingle(),
    supabase.from("commute_points_view").select("id, label, lat, lng").eq("device_id", deviceId),
  ]);

  if (locationRes.error) return NextResponse.json({ error: locationRes.error.message }, { status: 500 });
  if (pointsRes.error) return NextResponse.json({ error: pointsRes.error.message }, { status: 500 });

  const checkpoints: { matchedVia: "current_location" | "commute_point"; label: string | null; lat: number; lng: number }[] = [];
  if (locationRes.data) {
    checkpoints.push({ matchedVia: "current_location", label: null, lat: locationRes.data.lat, lng: locationRes.data.lng });
  }
  for (const p of pointsRes.data || []) {
    checkpoints.push({ matchedVia: "commute_point", label: p.label, lat: p.lat, lng: p.lng });
  }

  if (checkpoints.length === 0) {
    return NextResponse.json({
      alerts: [],
      note: "No current location or commute points on file for this device.",
    });
  }

  // Query each checkpoint against nearby_alerts, keep the closest match per
  // alert id (a device can be near the same alert via two different points).
  const bestMatch = new Map<string, { alert: any; matchedVia: string; matchedPointLabel: string | null; distanceM: number }>();

  for (const cp of checkpoints) {
    const { data, error } = await supabase.rpc("nearby_alerts", { p_lat: cp.lat, p_lng: cp.lng, p_radius_m: null });
    if (error) continue; // one bad checkpoint shouldn't fail the whole feed
    for (const alert of data || []) {
      const distanceM = alert.distance_m as number;
      const existing = bestMatch.get(alert.id);
      if (!existing || distanceM < existing.distanceM) {
        bestMatch.set(alert.id, { alert, matchedVia: cp.matchedVia, matchedPointLabel: cp.label, distanceM });
      }
    }
  }

  const matches = Array.from(bestMatch.values());

  // Record deliveries (best-effort — a failure here shouldn't block the response).
  if (matches.length > 0) {
    const deliveryRows = matches.map((m) => ({
      alert_id: m.alert.id,
      device_id: deviceId,
      matched_via: m.matchedVia,
      matched_point_label: m.matchedPointLabel,
      distance_m: Math.round(m.distanceM),
    }));
    await supabase.from("alert_deliveries").upsert(deliveryRows, {
      onConflict: "alert_id,device_id,matched_via,matched_point_label",
      ignoreDuplicates: true,
    });
  }

  const alerts = matches
    .sort((a, b) => (b.alert.risk_score ?? 0) - (a.alert.risk_score ?? 0))
    .map((m) => ({
      id: m.alert.id,
      hazardType: m.alert.hazard_type,
      severity: m.alert.severity,
      source: m.alert.source,
      title: m.alert.title,
      message: m.alert.message,
      method: m.alert.method,
      riskScore: m.alert.risk_score,
      leadTimeHours: m.alert.lead_time_hours,
      cityName: m.alert.city_name,
      publishedAt: m.alert.published_at,
      expiresAt: m.alert.expires_at,
      matchedVia: m.matchedVia,
      matchedPointLabel: m.matchedPointLabel,
      distanceM: Math.round(m.distanceM),
    }));

  return NextResponse.json({ alerts, checkedPoints: checkpoints.length });
}
