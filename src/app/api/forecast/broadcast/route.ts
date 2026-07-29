import { NextResponse } from "next/server";
import { getSupabaseAdmin, supabaseUnavailable } from "@/lib/supabase";

/**
 * Continuous 72h forecast broadcast.
 *
 * Everything else in this app is pull: an operator picks a location and asks
 * for an analysis. This is the push half. On a schedule it re-runs the 72h
 * forecast for every area where a device is actually registered and keeps the
 * alerts table in sync with what the weather model currently says.
 *
 * Three behaviours make it a broadcast rather than a spam cannon:
 *
 *   PUBLISH   a hazard crossing the threshold in a cell with no active alert
 *   UPDATE    the same hazard still active — refresh score, lead time, expiry,
 *             in place, so the phone sees one evolving alert rather than 24 a day
 *   WITHDRAW  a previously broadcast hazard that has dropped below threshold —
 *             expired immediately, because an all-clear matters as much as an alarm
 *
 * Identity comes from `dedupe_key` (see migration 0003): forecast:<hazard>:<cell>.
 *
 * Trigger with a scheduler (Supabase pg_cron, Vercel Cron, GitHub Actions).
 * Protected by CRON_SECRET — an unauthenticated endpoint that fans out to an
 * external weather API and writes alerts is not something to leave open.
 */

// Forecast models resolve ~11 km, so a finer grid would issue several identical
// API calls for one model gridpoint. 0.1 degrees keeps calls proportional to
// real coverage rather than to how many people happen to be standing together.
const CELL_DEG = 0.1;

// Bounds one run's fan-out. Open-Meteo is generous but not unlimited, and a
// scheduled job that silently takes ten minutes is its own kind of outage.
const MAX_CELLS_PER_RUN = 40;

// Only hazards at or above this score broadcast. Below it the forecast is real
// but not actionable, and a warning nobody acts on trains people to ignore the
// next one.
const DEFAULT_MIN_SCORE = 0.45;

// Forecast alerts self-clear if broadcasting stops, so a dead cron degrades to
// silence rather than to stale warnings that look live.
const DEFAULT_TTL_HOURS = 6;

type Cell = { key: string; lat: number; lng: number };

function toCell(lat: number, lng: number): Cell {
  const cLat = Math.round(lat / CELL_DEG) * CELL_DEG;
  const cLng = Math.round(lng / CELL_DEG) * CELL_DEG;
  return { key: `${cLat.toFixed(1)},${cLng.toFixed(1)}`, lat: cLat, lng: cLng };
}

function severityFor(confidence: string, score: number): "low" | "medium" | "high" {
  if (confidence === "high" || score >= 0.75) return "high";
  if (confidence === "medium" || score >= 0.5) return "medium";
  return "low";
}

export async function POST(req: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json(supabaseUnavailable(), { status: 503 });

  // Auth. Constant-time comparison is overkill for a shared cron token, but a
  // plain equality check on a secret is still the wrong default to teach.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const provided = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    if (provided !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const { searchParams } = new URL(req.url);
  const minScore = Number(searchParams.get("minScore") ?? DEFAULT_MIN_SCORE);
  const ttlHours = Number(searchParams.get("ttlHours") ?? DEFAULT_TTL_HOURS);
  const dryRun = searchParams.get("dryRun") === "true";
  const origin = new URL(req.url).origin;

  const { data: runRow } = await supabase
    .from("broadcast_runs")
    .insert({})
    .select("id")
    .single();
  const runId = runRow?.id ?? null;

  const stats = { cellsScanned: 0, published: 0, updated: 0, withdrawn: 0, forecastErrors: 0 };

  try {
    // 1. Where does anyone actually need coverage? Current locations and saved
    //    commute points both count — the whole point of commute points is being
    //    warned about somewhere you are not standing right now.
    const [locRes, cpRes] = await Promise.all([
      supabase.from("device_locations_view").select("lat, lng"),
      supabase.from("commute_points_view").select("lat, lng"),
    ]);
    if (locRes.error) throw new Error(`device_locations: ${locRes.error.message}`);
    if (cpRes.error) throw new Error(`commute_points: ${cpRes.error.message}`);

    const cells = new Map<string, Cell>();
    for (const row of [...(locRes.data || []), ...(cpRes.data || [])]) {
      if (typeof row.lat !== "number" || typeof row.lng !== "number") continue;
      const c = toCell(row.lat, row.lng);
      if (!cells.has(c.key)) cells.set(c.key, c);
    }

    const targets = Array.from(cells.values()).slice(0, MAX_CELLS_PER_RUN);
    stats.cellsScanned = targets.length;

    if (targets.length === 0) {
      await finishRun(supabase, runId, stats, null);
      return NextResponse.json({
        ok: true,
        note: "No registered device locations or commute points to cover.",
        ...stats,
      });
    }

    // 2. Run the forecast per cell and collect everything worth broadcasting.
    const liveKeys = new Set<string>();
    const upserts: any[] = [];

    for (const cell of targets) {
      let forecasts: any[] = [];
      try {
        const res = await fetch(`${origin}/api/forecast-risk?lat=${cell.lat}&lng=${cell.lng}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`status ${res.status}`);
        forecasts = (await res.json())?.forecasts ?? [];
      } catch (err) {
        // One unreachable cell must not abort the whole broadcast.
        stats.forecastErrors++;
        continue;
      }

      for (const f of forecasts) {
        if (typeof f.riskScore !== "number" || f.riskScore < minScore) continue;

        const dedupeKey = `forecast:${f.hazard}:${cell.key}`;
        liveKeys.add(dedupeKey);

        upserts.push({
          dedupe_key: dedupeKey,
          hazard_type: f.hazard,
          severity: severityFor(f.confidence, f.riskScore),
          source: "forecast",
          title: `${f.hazard} expected${f.leadTimeHours != null ? ` in ~${f.leadTimeHours}h` : ""}`,
          message: f.action ?? `${f.hazard} forecast for your area.`,
          method: f.method ?? null,
          risk_score: f.riskScore,
          lead_time_hours: f.leadTimeHours ?? null,
          origin: `SRID=4326;POINT(${cell.lng} ${cell.lat})`,
          radius_m: 10000,
          city_name: null,
          // Drivers are what make the warning explainable on the phone rather
          // than a bare number the user has to trust blindly.
          raw_payload: { drivers: f.drivers ?? [], window: f.window, compound: f.compound ?? false },
          published_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + ttlHours * 3600_000).toISOString(),
        });
      }
    }

    if (dryRun) {
      await finishRun(supabase, runId, stats, null);
      return NextResponse.json({
        ok: true,
        dryRun: true,
        ...stats,
        wouldBroadcast: upserts.map((u) => ({
          dedupeKey: u.dedupe_key,
          severity: u.severity,
          riskScore: u.risk_score,
        })),
      });
    }

    // 3. Which of these are already live? Needed only to report published vs
    //    updated honestly — the upsert itself handles both.
    const existingKeys = new Set<string>();
    if (upserts.length > 0) {
      const { data: existing } = await supabase
        .from("alerts")
        .select("dedupe_key")
        .in("dedupe_key", upserts.map((u) => u.dedupe_key));
      for (const e of existing || []) existingKeys.add(e.dedupe_key);
    }

    if (upserts.length > 0) {
      const { error } = await supabase.from("alerts").upsert(upserts, { onConflict: "dedupe_key" });
      if (error) throw new Error(`upsert alerts: ${error.message}`);
      stats.updated = upserts.filter((u) => existingKeys.has(u.dedupe_key)).length;
      stats.published = upserts.length - stats.updated;
    }

    // 4. Withdraw. Any still-active forecast alert in a cell we just scanned
    //    that did NOT come back above threshold is over — expire it now so the
    //    phone stops showing a warning the model no longer supports.
    const scannedCellKeys = targets.map((t) => t.key);
    const { data: activeForecasts } = await supabase
      .from("alerts")
      .select("id, dedupe_key")
      .eq("source", "forecast")
      .gt("expires_at", new Date().toISOString())
      .not("dedupe_key", "is", null);

    const stale = (activeForecasts || []).filter((a: any) => {
      if (liveKeys.has(a.dedupe_key)) return false;
      // Only withdraw within cells this run actually covered; a cell we skipped
      // is unknown, not clear.
      const cellKey = String(a.dedupe_key).split(":").slice(2).join(":");
      return scannedCellKeys.includes(cellKey);
    });

    if (stale.length > 0) {
      const nowIso = new Date().toISOString();
      const { error } = await supabase
        .from("alerts")
        .update({ expires_at: nowIso })
        .in("id", stale.map((s: any) => s.id));
      if (!error) stats.withdrawn = stale.length;
    }

    await finishRun(supabase, runId, stats, null);
    return NextResponse.json({ ok: true, ...stats });
  } catch (err: any) {
    await finishRun(supabase, runId, stats, err?.message ?? String(err));
    return NextResponse.json({ error: err?.message ?? "Broadcast failed", ...stats }, { status: 500 });
  }
}

async function finishRun(supabase: any, runId: string | null, stats: any, error: string | null) {
  if (!runId) return;
  await supabase
    .from("broadcast_runs")
    .update({
      finished_at: new Date().toISOString(),
      cells_scanned: stats.cellsScanned,
      alerts_published: stats.published,
      alerts_updated: stats.updated,
      alerts_withdrawn: stats.withdrawn,
      forecast_errors: stats.forecastErrors,
      error,
    })
    .eq("id", runId);
}

/** Recent run history — so "quiet" can be told apart from "stopped". */
export async function GET() {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json(supabaseUnavailable(), { status: 503 });

  const { data, error } = await supabase
    .from("broadcast_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ runs: data ?? [] });
}
