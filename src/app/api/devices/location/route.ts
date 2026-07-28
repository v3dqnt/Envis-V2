import { NextResponse } from "next/server";
import { getSupabaseAdmin, supabaseUnavailable } from "@/lib/supabase";

/**
 * Upsert a device's current location. The mobile app calls this on a
 * background interval (e.g. every few minutes, or on significant location
 * change) — this table holds only the latest position, not a track history.
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

  const { deviceId, lat, lng, accuracyM } = body;
  if (!deviceId || typeof deviceId !== "string") {
    return NextResponse.json({ error: "deviceId is required" }, { status: 400 });
  }
  if (typeof lat !== "number" || typeof lng !== "number" || isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: "lat and lng must be numbers" }, { status: 400 });
  }

  // Foreign key requires the device to already be registered.
  const { error: upsertError } = await supabase.from("device_locations").upsert(
    {
      device_id: deviceId,
      location: `SRID=4326;POINT(${lng} ${lat})`,
      accuracy_m: typeof accuracyM === "number" ? accuracyM : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "device_id" }
  );

  if (upsertError) {
    const status = upsertError.code === "23503" ? 404 : 500;
    return NextResponse.json(
      { error: status === 404 ? "Device not registered. Call /api/devices/register first." : upsertError.message },
      { status }
    );
  }

  return NextResponse.json({ ok: true, location: { lat, lng } });
}
