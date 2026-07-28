import { NextResponse } from "next/server";
import { getSupabaseAdmin, supabaseUnavailable } from "@/lib/supabase";

/**
 * Home, work, and any other named waypoints a user wants covered by alerts
 * even when they aren't physically there — e.g. flooding near a child's
 * school while the user is at the office. POST replaces the full set for a
 * device (simplest contract for a mobile settings screen: send the whole
 * list every time it's edited, rather than diffing).
 */
export async function GET(req: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json(supabaseUnavailable(), { status: 503 });

  const { searchParams } = new URL(req.url);
  const deviceId = searchParams.get("deviceId");
  if (!deviceId) return NextResponse.json({ error: "deviceId query param is required" }, { status: 400 });

  const { data, error } = await supabase
    .from("commute_points_view")
    .select("id, label, lat, lng, sort_order, created_at")
    .eq("device_id", deviceId)
    .order("sort_order", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const points = (data || []).map((p: any) => ({
    id: p.id,
    label: p.label,
    lat: p.lat,
    lng: p.lng,
    sortOrder: p.sort_order,
  }));

  return NextResponse.json({ points });
}

export async function POST(req: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json(supabaseUnavailable(), { status: 503 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { deviceId, points } = body;
  if (!deviceId || typeof deviceId !== "string") {
    return NextResponse.json({ error: "deviceId is required" }, { status: 400 });
  }
  if (!Array.isArray(points)) {
    return NextResponse.json({ error: "points must be an array of { label, lat, lng }" }, { status: 400 });
  }
  for (const p of points) {
    if (!p.label || typeof p.lat !== "number" || typeof p.lng !== "number") {
      return NextResponse.json({ error: "each point requires label, lat, lng" }, { status: 400 });
    }
  }

  const { error: deleteError } = await supabase.from("commute_points").delete().eq("device_id", deviceId);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  if (points.length === 0) return NextResponse.json({ points: [] });

  const rows = points.map((p: any, i: number) => ({
    device_id: deviceId,
    label: p.label,
    location: `SRID=4326;POINT(${p.lng} ${p.lat})`,
    sort_order: typeof p.sortOrder === "number" ? p.sortOrder : i,
  }));

  const { data, error: insertError } = await supabase.from("commute_points").insert(rows).select();
  if (insertError) {
    const status = insertError.code === "23503" ? 404 : 500;
    return NextResponse.json(
      { error: status === 404 ? "Device not registered. Call /api/devices/register first." : insertError.message },
      { status }
    );
  }

  // Insert returns the base table shape (no lat/lng columns) — re-fetch from
  // the view so the response shape matches GET.
  const { data: view, error: viewError } = await supabase
    .from("commute_points_view")
    .select("id, label, lat, lng, sort_order")
    .eq("device_id", deviceId)
    .order("sort_order", { ascending: true });
  if (viewError) return NextResponse.json({ error: viewError.message }, { status: 500 });

  const result = (view || []).map((p: any) => ({
    id: p.id,
    label: p.label,
    lat: p.lat,
    lng: p.lng,
    sortOrder: p.sort_order,
  }));
  return NextResponse.json({ points: result });
}
