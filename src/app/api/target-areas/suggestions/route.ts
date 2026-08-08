import { NextResponse } from "next/server";
import { getSupabaseAdmin, supabaseUnavailable } from "@/lib/supabase";

/**
 * Feeds the workspace's persistent Notification Panel — every suggestion the
 * monitor job has raised, and the human review/publish/dismiss actions on them.
 */

export async function GET(req: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json(supabaseUnavailable(), { status: 503 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status"); // optional filter: pending | published | dismissed

  let query = supabase
    .from("target_area_suggestions_view")
    .select("*")
    .order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ suggestions: data ?? [] });
}

export async function PATCH(req: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json(supabaseUnavailable(), { status: 503 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { id, status, publishedAlertId } = body;
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  if (!["pending", "published", "dismissed"].includes(status)) {
    return NextResponse.json({ error: "status must be pending, published, or dismissed" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("target_area_suggestions")
    .update({
      status,
      published_alert_id: typeof publishedAlertId === "string" ? publishedAlertId : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id, status, published_alert_id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ suggestion: data });
}
