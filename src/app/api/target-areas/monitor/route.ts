import { NextResponse } from "next/server";
import { getSupabaseAdmin, supabaseUnavailable } from "@/lib/supabase";
import { TARGET_AREA_RULES } from "@/lib/targetAreaRules";
import type { DisasterRisk } from "@/app/api/weather-risk/route";

/**
 * Auto Jobs monitor — the scheduled job behind "mark an area as a target and
 * get flagged automatically." Mirrors /api/forecast/broadcast's shape
 * (CRON_SECRET auth, a run-history table, a dedupe key so repeat runs don't
 * spam) but a different output: this never publishes an alert on its own. It
 * only raises a *suggestion* for a human to review, because a target area
 * isn't tied to anyone's actual location the way a device-driven broadcast is
 * — there's no "someone is standing here right now" urgency backing it.
 *
 * Deliberately cheap: only /api/weather-risk runs here (the same
 * climatological signal the dashboard already fetches the moment a location
 * is set). No forecast-risk, no hazard-zones, no vulnerability-zones, no
 * OpenAI calls — those only ever run once a human opens a suggestion in
 * GAIA Prevent (see AutoJobsSidebar's "Review" action).
 */

function reasonFor(risk: DisasterRisk): string {
  return risk.recentSignal ?? risk.historicalBasis;
}

export async function POST(req: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json(supabaseUnavailable(), { status: 503 });

  const secret = process.env.CRON_SECRET;
  if (secret) {
    const provided = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    if (provided !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const origin = new URL(req.url).origin;
  const stats = { areasScanned: 0, suggestionsCreated: 0 };

  const { data: runRow } = await supabase.from("target_area_runs").insert({}).select("id").single();
  const runId = runRow?.id ?? null;

  try {
    const { data: areas, error: areasError } = await supabase
      .from("target_areas_view")
      .select("id, name, city_name, lat, lng")
      .eq("active", true);
    if (areasError) throw new Error(`target_areas: ${areasError.message}`);

    stats.areasScanned = areas?.length ?? 0;

    for (const area of areas ?? []) {
      let risks: DisasterRisk[] = [];
      try {
        const res = await fetch(
          `${origin}/api/weather-risk?lat=${area.lat}&lng=${area.lng}&city=${encodeURIComponent(area.city_name ?? area.name)}`,
          { cache: "no-store" }
        );
        if (!res.ok) continue;
        risks = (await res.json())?.risks ?? [];
      } catch {
        continue; // one unreachable area must not abort the whole run
      }

      for (const rule of TARGET_AREA_RULES) {
        const match = risks.find(
          (r) => r.type === rule.watchRiskType && (r.confidence === "medium" || r.confidence === "high")
        );
        if (!match) continue;

        const dedupeKey = `targetarea:${area.id}:${rule.id}`;
        const { data: existing } = await supabase
          .from("target_area_suggestions")
          .select("id")
          .eq("dedupe_key", dedupeKey)
          .maybeSingle();
        if (existing) continue; // still live — a human hasn't acted on it yet, don't re-suggest

        const { error: insertError } = await supabase.from("target_area_suggestions").insert({
          target_area_id: area.id,
          hazard_types: rule.hazards,
          trigger_rule: rule.id,
          reason: reasonFor(match),
          risk_snapshot: match,
          dedupe_key: dedupeKey,
        });
        if (!insertError) stats.suggestionsCreated++;
      }
    }

    await finishRun(supabase, runId, stats, null);
    return NextResponse.json({ ok: true, ...stats });
  } catch (err: any) {
    await finishRun(supabase, runId, stats, err?.message ?? String(err));
    return NextResponse.json({ error: err?.message ?? "Monitor run failed", ...stats }, { status: 500 });
  }
}

async function finishRun(supabase: any, runId: string | null, stats: { areasScanned: number; suggestionsCreated: number }, error: string | null) {
  if (!runId) return;
  await supabase
    .from("target_area_runs")
    .update({
      finished_at: new Date().toISOString(),
      areas_scanned: stats.areasScanned,
      suggestions_created: stats.suggestionsCreated,
      error,
    })
    .eq("id", runId);
}

/** Recent run history — same "quiet vs stopped" observability as broadcast_runs. */
export async function GET() {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json(supabaseUnavailable(), { status: 503 });

  const { data, error } = await supabase
    .from("target_area_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ runs: data ?? [] });
}
