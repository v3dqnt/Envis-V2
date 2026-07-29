import { NextResponse } from "next/server";
import { getSupabaseAdmin, supabaseUnavailable } from "@/lib/supabase";
import { formatRoute, formatShelter } from "@/lib/evacuationRoutes";

/**
 * Transmit the evacuation routes Aegis Route computed for a published alert.
 *
 * The dashboard already solves the hard part — a real road route around the
 * hazard dome, with live traffic — but until now that stayed on the operator's
 * screen. This is the handoff: the geometry becomes a PostGIS linestring
 * attached to the alert, so a phone that matches the alert also receives the
 * way out rather than just the warning.
 *
 * Routes cascade-delete with their alert, so an expired hazard cannot leave a
 * stale evacuation route behind.
 */

type LngLat = [number, number];

const VALID_KINDS = new Set(["primary", "detour"]);

/**
 * A TomTom/OSRM route can carry several thousand coordinates. That is far more
 * precision than a phone needs to draw a line, and it makes both the insert and
 * every subsequent feed response heavier. Keep the shape by sampling evenly and
 * always retaining the true first and last point.
 */
function downsample(coords: LngLat[], maxPoints = 500): LngLat[] {
  if (coords.length <= maxPoints) return coords;
  const step = (coords.length - 1) / (maxPoints - 1);
  const out: LngLat[] = [];
  for (let i = 0; i < maxPoints; i++) {
    out.push(coords[Math.min(Math.round(i * step), coords.length - 1)]);
  }
  out[out.length - 1] = coords[coords.length - 1];
  return out;
}

/** Drop consecutive duplicate points — PostGIS accepts them but they add nothing. */
function dedupe(coords: LngLat[]): LngLat[] {
  return coords.filter((c, i) => i === 0 || c[0] !== coords[i - 1][0] || c[1] !== coords[i - 1][1]);
}

function isLngLat(v: any): v is LngLat {
  return (
    Array.isArray(v) &&
    v.length >= 2 &&
    typeof v[0] === "number" &&
    typeof v[1] === "number" &&
    !isNaN(v[0]) &&
    !isNaN(v[1]) &&
    Math.abs(v[0]) <= 180 &&
    Math.abs(v[1]) <= 90
  );
}

function toLineStringEwkt(coords: LngLat[]): string {
  return `SRID=4326;LINESTRING(${coords.map((c) => `${c[0]} ${c[1]}`).join(", ")})`;
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

  const { alertId, routes, shelters, replace = true } = body;

  if (!alertId || typeof alertId !== "string") {
    return NextResponse.json({ error: "alertId is required" }, { status: 400 });
  }
  if (!Array.isArray(routes) || routes.length === 0) {
    return NextResponse.json({ error: "routes must be a non-empty array" }, { status: 400 });
  }

  // Validate every route before writing anything, so a bad second route cannot
  // leave a half-transmitted evacuation plan attached to a live alert.
  const prepared: any[] = [];
  for (const [i, r] of routes.entries()) {
    if (!VALID_KINDS.has(r?.kind)) {
      return NextResponse.json({ error: `routes[${i}].kind must be "primary" or "detour"` }, { status: 400 });
    }
    if (!r?.label || typeof r.label !== "string") {
      return NextResponse.json({ error: `routes[${i}].label is required` }, { status: 400 });
    }
    const raw = Array.isArray(r.path) ? r.path.filter(isLngLat) : [];
    const path = dedupe(downsample(raw));
    if (path.length < 2) {
      return NextResponse.json(
        { error: `routes[${i}].path needs at least 2 valid [lng, lat] points (got ${path.length})` },
        { status: 400 }
      );
    }

    const hasDest = isLngLat([r.destinationLng, r.destinationLat]);
    prepared.push({
      alert_id: alertId,
      kind: r.kind,
      label: r.label,
      destination_name: r.destinationName ?? null,
      destination: hasDest ? `SRID=4326;POINT(${r.destinationLng} ${r.destinationLat})` : null,
      path: toLineStringEwkt(path),
      distance_km: typeof r.distanceKm === "number" ? r.distanceKm : null,
      duration_min: typeof r.durationMin === "number" ? r.durationMin : null,
      traffic_delay_min: typeof r.trafficDelayMin === "number" ? r.trafficDelayMin : null,
      is_recommended: r.isRecommended === true,
    });
  }

  // The schema allows at most one recommended route per alert. Catch a caller
  // sending two here with a clear message rather than a raw unique-violation.
  if (prepared.filter((p) => p.is_recommended).length > 1) {
    return NextResponse.json({ error: "Only one route may be marked isRecommended" }, { status: 400 });
  }

  // Confirm the alert exists — otherwise the FK error surfaces as an opaque 500.
  const { data: alertRow, error: alertErr } = await supabase
    .from("alerts")
    .select("id")
    .eq("id", alertId)
    .maybeSingle();
  if (alertErr) return NextResponse.json({ error: alertErr.message }, { status: 500 });
  if (!alertRow) return NextResponse.json({ error: "No alert with that id" }, { status: 404 });

  // Re-transmitting replaces the previous plan by default. A partially updated
  // route set is worse than either the old one or the new one.
  if (replace) {
    await supabase.from("evacuation_routes").delete().eq("alert_id", alertId);
    await supabase.from("evacuation_shelters").delete().eq("alert_id", alertId);
  }

  const { error: routeErr } = await supabase.from("evacuation_routes").insert(prepared);
  if (routeErr) return NextResponse.json({ error: routeErr.message }, { status: 500 });

  if (Array.isArray(shelters) && shelters.length > 0) {
    const shelterRows = shelters
      .filter((s: any) => s?.name && isLngLat([s.lng, s.lat]))
      .map((s: any) => ({
        alert_id: alertId,
        name: s.name,
        direction: s.direction ?? null,
        reason: s.reason ?? null,
        location: `SRID=4326;POINT(${s.lng} ${s.lat})`,
        distance_km: typeof s.distanceKm === "number" ? s.distanceKm : null,
      }));
    if (shelterRows.length > 0) {
      const { error: shelterErr } = await supabase.from("evacuation_shelters").insert(shelterRows);
      if (shelterErr) return NextResponse.json({ error: shelterErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({
    ok: true,
    alertId,
    routesTransmitted: prepared.length,
    sheltersTransmitted: Array.isArray(shelters) ? shelters.length : 0,
    pointsPerRoute: prepared.map((p) => (p.path.match(/,/g)?.length ?? 0) + 1),
  });
}

export async function GET(req: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json(supabaseUnavailable(), { status: 503 });

  const { searchParams } = new URL(req.url);
  const alertId = searchParams.get("alertId");
  if (!alertId) return NextResponse.json({ error: "alertId query param is required" }, { status: 400 });

  const [routesRes, sheltersRes] = await Promise.all([
    supabase.from("evacuation_routes_view").select("*").eq("alert_id", alertId).order("is_recommended", { ascending: false }),
    supabase.from("evacuation_shelters_view").select("*").eq("alert_id", alertId).order("distance_km", { ascending: true }),
  ]);

  if (routesRes.error) return NextResponse.json({ error: routesRes.error.message }, { status: 500 });
  if (sheltersRes.error) return NextResponse.json({ error: sheltersRes.error.message }, { status: 500 });

  return NextResponse.json({
    alertId,
    routes: (routesRes.data || []).map(formatRoute),
    shelters: (sheltersRes.data || []).map(formatShelter),
  });
}

