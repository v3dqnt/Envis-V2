import { NextResponse } from "next/server";
import { getSupabaseAdmin, supabaseUnavailable } from "@/lib/supabase";

/**
 * Register (or update) a mobile device. Called once on first launch, and
 * again whenever the push token rotates (Expo/FCM tokens are not stable
 * forever). `deviceId` is a UUID the app generates itself and persists
 * locally — there is no account/login involved.
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

  const { deviceId, pushToken, pushProvider, platform } = body;
  if (!deviceId || typeof deviceId !== "string") {
    return NextResponse.json({ error: "deviceId is required" }, { status: 400 });
  }
  if (pushProvider && !["expo", "fcm", "apns"].includes(pushProvider)) {
    return NextResponse.json({ error: "pushProvider must be expo, fcm, or apns" }, { status: 400 });
  }
  if (platform && !["ios", "android", "web"].includes(platform)) {
    return NextResponse.json({ error: "platform must be ios, android, or web" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("devices")
    .upsert(
      {
        device_id: deviceId,
        push_token: pushToken ?? null,
        push_provider: pushProvider ?? null,
        platform: platform ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "device_id" }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ device: data });
}
