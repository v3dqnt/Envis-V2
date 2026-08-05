import { NextResponse } from "next/server";
import {
  windChillC,
  frostbiteMinutes,
  saffirSimpson,
  antecedentPrecipitationIndex,
  zScore,
  spiCategory,
  blizzardHours,
  freezingRainAnalysis,
  iceAccretionImpact,
  longestRun,
  clamp01,
  caineIdThresholdMmPerHr,
  rollingIntensityMmPerHr,
  soilMechanicalParams,
  infiniteSlopeFactorOfSafety,
} from "@/lib/meteorology";

/**
 * Short-range (72h) hazard FORECAST engine.
 *
 * Distinct from /api/weather-risk, which is climatological. This route answers
 * "what is likely in the next three days" using live numerical weather prediction
 * (Open-Meteo's ECMWF/GFS/ICON blend), and every hazard follows a published
 * operational method rather than an invented threshold — see src/lib/meteorology.ts.
 *
 * A same-season historical baseline is fetched alongside the forecast so severity
 * is judged relative to what is normal FOR THIS PLACE AT THIS TIME OF YEAR. A
 * -10 °C night is unremarkable in Yakutsk and an emergency in Mumbai; a fixed
 * global threshold cannot express that, a standardized anomaly can.
 */

export interface ForecastDriver {
  label: string;
  value: string;
  meaning: string;
}

export interface HazardForecast {
  hazard: string;
  method: string;
  riskScore: number;
  confidence: "high" | "medium" | "low";
  leadTimeHours: number | null;
  peakTimeIso: string | null;
  window: string;
  drivers: ForecastDriver[];
  compound: boolean;
  action: string;
}

const HOURLY_VARS = [
  "temperature_2m",
  "relative_humidity_2m",
  "precipitation",
  "precipitation_probability",
  "cape",
  "lifted_index",
  "convective_inhibition",
  "cloud_cover",
  "wind_speed_10m",
  "wind_gusts_10m",
  "visibility",
  "pressure_msl",
  "snowfall",
  "snow_depth",
  "soil_moisture_0_to_1cm",
  "soil_moisture_3_to_9cm",
  "soil_moisture_9_to_27cm",
  "vapour_pressure_deficit",
  "temperature_850hPa",
  "wind_speed_925hPa",
  "wind_direction_925hPa",
  "wind_speed_500hPa",
  "wind_direction_500hPa",
].join(",");

const DAILY_VARS = ["et0_fao_evapotranspiration", "precipitation_sum", "temperature_2m_max", "temperature_2m_min"].join(",");

function num(v: any): number | null {
  return typeof v === "number" && !isNaN(v) ? v : null;
}
function nums(arr: any[]): number[] {
  return (arr || []).map(num).filter((v): v is number => v !== null);
}
function peak(series: (number | null)[]) {
  let best: { value: number; index: number } | null = null;
  series.forEach((v, i) => {
    const n = num(v);
    if (n === null) return;
    if (!best || n > best.value) best = { value: n, index: i };
  });
  return best as { value: number; index: number } | null;
}
function trough(series: (number | null)[]) {
  let best: { value: number; index: number } | null = null;
  series.forEach((v, i) => {
    const n = num(v);
    if (n === null) return;
    if (!best || n < best.value) best = { value: n, index: i };
  });
  return best as { value: number; index: number } | null;
}
function mean(series: (number | null)[]): number {
  const vals = nums(series as any[]);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
}
function firstIndexWhere(series: (number | null)[], pred: (v: number) => boolean): number | null {
  for (let i = 0; i < series.length; i++) {
    const n = num(series[i]);
    if (n !== null && pred(n)) return i;
  }
  return null;
}
const conf = (s: number): "high" | "medium" | "low" => (s >= 0.62 ? "high" : s >= 0.38 ? "medium" : "low");

/**
 * Same-calendar-window historical sample, so anomalies are seasonal rather than annual.
 * Pulls a +/-10 day window around today across the last 10 years.
 */
async function fetchSeasonalBaseline(lat: number, lng: number) {
  const today = new Date();
  const end = new Date(today);
  end.setDate(today.getDate() - 5);
  const start = new Date(end);
  start.setFullYear(end.getFullYear() - 10);
  const fmt = (d: Date) => d.toISOString().split("T")[0];

  try {
    const res = await fetch(
      `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}` +
        `&start_date=${fmt(start)}&end_date=${fmt(end)}` +
        `&daily=precipitation_sum,temperature_2m_min,temperature_2m_max,wind_speed_10m_max,snowfall_sum` +
        `&timezone=auto&wind_speed_unit=kmh`,
      { next: { revalidate: 86400 } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const times: string[] = data.daily?.time || [];
    const doy = (iso: string) => {
      const d = new Date(iso);
      return Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86400000);
    };
    const todayDoy = doy(today.toISOString());

    // Keep only days within +/-10 of today's day-of-year (wrapping at year end).
    const keep: number[] = [];
    times.forEach((t, i) => {
      const diff = Math.abs(doy(t) - todayDoy);
      if (Math.min(diff, 365 - diff) <= 10) keep.push(i);
    });

    const pick = (key: string) => keep.map((i) => data.daily?.[key]?.[i]).filter((v: any) => typeof v === "number");

    return {
      precip: pick("precipitation_sum") as number[],
      tempMin: pick("temperature_2m_min") as number[],
      tempMax: pick("temperature_2m_max") as number[],
      windMax: pick("wind_speed_10m_max") as number[],
      snow: pick("snowfall_sum") as number[],
      sampleDays: keep.length,
    };
  } catch {
    return null;
  }
}

/** Sentinel-2 fuel dryness, when Copernicus credentials are configured. Degrades to null. */
async function fetchFuelDryness(req: Request, lat: number, lng: number): Promise<{ fuelDrynessIndex: number; ndmi: number } | null> {
  try {
    const origin = new URL(req.url).origin;
    const res = await fetch(`${origin}/api/vegetation?lat=${lat}&lng=${lng}`, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.available) return null;
    return { fuelDrynessIndex: data.fuelDrynessIndex, ndmi: data.ndmi };
  } catch {
    return null;
  }
}

/**
 * Local slope from a 5-point elevation cross (Open-Meteo elevation API, free, no
 * key) — always available, same technique as the vulnerability-zones and
 * hazard-zones landslide models. Gives a slope estimate even when nothing else
 * below does.
 */
async function fetchSlopeGradient(lat: number, lng: number): Promise<{ gradientPct: number; elevationM: number } | null> {
  const offsetDeg = 0.01; // ~1.1km
  const latOffsetLng = offsetDeg / Math.cos((lat * Math.PI) / 180);
  const points = [
    { lat, lng },
    { lat: lat + offsetDeg, lng },
    { lat: lat - offsetDeg, lng },
    { lat, lng: lng + latOffsetLng },
    { lat, lng: lng - latOffsetLng },
  ];
  const lats = points.map((p) => p.lat.toFixed(5)).join(",");
  const lngs = points.map((p) => p.lng.toFixed(5)).join(",");
  try {
    const res = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lngs}`, {
      next: { revalidate: 604800 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const elev: number[] = data.elevation || [];
    if (elev.length < 5 || elev.some((e) => e === null || isNaN(e))) return null;
    const [center, north, south, east, west] = elev;
    const distanceMeters = offsetDeg * 111320;
    const maxDrop = Math.max(Math.abs(center - north), Math.abs(center - south), Math.abs(center - east), Math.abs(center - west));
    return { gradientPct: (maxDrop / distanceMeters) * 100, elevationM: center };
  } catch {
    return null;
  }
}

/** Copernicus 30m DEM refinement, when OPENTOPOGRAPHY_API_KEY is configured. Degrades to null. */
async function fetchTerrainRefinement(req: Request, lat: number, lng: number): Promise<{ maxSlopePct: number; reliefM: number } | null> {
  try {
    const origin = new URL(req.url).origin;
    const res = await fetch(`${origin}/api/terrain?lat=${lat}&lng=${lng}&radiusKm=1.5`, { next: { revalidate: 604800 } });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.available) return null;
    return { maxSlopePct: data.maxSlopePct, reliefM: data.reliefM };
  } catch {
    return null;
  }
}

/** ISRIC SoilGrids texture class, for geotechnical parameter lookup. Degrades to null. */
async function fetchSoilTexture(req: Request, lat: number, lng: number): Promise<{ texture: string | undefined; clayPct: number | null; note: string } | null> {
  try {
    const origin = new URL(req.url).origin;
    const res = await fetch(`${origin}/api/soil?lat=${lat}&lng=${lng}`, { next: { revalidate: 604800 } });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.available) return null;
    return { texture: data.texture, clayPct: data.subsoil?.clayPct ?? null, note: data.landslideRelevance ?? "" };
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = parseFloat(searchParams.get("lat") || "");
  const lng = parseFloat(searchParams.get("lng") || "");
  if (isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: "lat and lng are required" }, { status: 400 });
  }

  let data: any;
  let baseline: Awaited<ReturnType<typeof fetchSeasonalBaseline>> = null;
  let fuel: { fuelDrynessIndex: number; ndmi: number } | null = null;
  let slope: { gradientPct: number; elevationM: number } | null = null;
  let terrain: { maxSlopePct: number; reliefM: number } | null = null;
  let soilTexture: { texture: string | undefined; clayPct: number | null; note: string } | null = null;
  try {
    const [fRes, bl, fl, sl, tr, st] = await Promise.all([
      fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
          `&hourly=${HOURLY_VARS}&daily=${DAILY_VARS}&forecast_days=3&past_days=14&timezone=auto&wind_speed_unit=kmh`,
        { next: { revalidate: 1800 } }
      ),
      fetchSeasonalBaseline(lat, lng),
      fetchFuelDryness(req, lat, lng),
      fetchSlopeGradient(lat, lng),
      fetchTerrainRefinement(req, lat, lng),
      fetchSoilTexture(req, lat, lng),
    ]);
    if (!fRes.ok) return NextResponse.json({ error: `Open-Meteo returned ${fRes.status}` }, { status: 502 });
    data = await fRes.json();
    baseline = bl;
    fuel = fl;
    slope = sl;
    terrain = tr;
    soilTexture = st;
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }

  const h = data.hourly || {};
  const d = data.daily || {};
  const allTimes: string[] = h.time || [];

  // past_days=14 means the series starts in the past; find "now" so lead times are honest.
  const nowIso = new Date().toISOString().slice(0, 13);
  let nowIdx = allTimes.findIndex((t) => t.slice(0, 13) >= nowIso);
  if (nowIdx < 0) nowIdx = Math.max(0, allTimes.length - 72);

  const slice = <T,>(arr: T[]) => (arr || []).slice(nowIdx);
  const times = slice(allTimes);

  const temp = slice<number | null>(h.temperature_2m);
  const rh = slice<number | null>(h.relative_humidity_2m);
  const precip = slice<number | null>(h.precipitation);
  const precipProb = slice<number | null>(h.precipitation_probability);
  const cape = slice<number | null>(h.cape);
  const li = slice<number | null>(h.lifted_index);
  const cin = slice<number | null>(h.convective_inhibition);
  const cloud = slice<number | null>(h.cloud_cover);
  const wind = slice<number | null>(h.wind_speed_10m);
  const gusts = slice<number | null>(h.wind_gusts_10m);
  const visibility = slice<number | null>(h.visibility);
  const pressure = slice<number | null>(h.pressure_msl);
  const snowfall = slice<number | null>(h.snowfall);
  const snowDepth = slice<number | null>(h.snow_depth);
  const vpd = slice<number | null>(h.vapour_pressure_deficit);
  const t850 = slice<number | null>(h.temperature_850hPa);
  const wind925 = slice<number | null>(h.wind_speed_925hPa);
  const dir925 = slice<number | null>(h.wind_direction_925hPa);
  const wind500 = slice<number | null>(h.wind_speed_500hPa);
  const dir500 = slice<number | null>(h.wind_direction_500hPa);

  // Bulk shear between low and mid levels — the standard discriminant between an
  // ordinary pulse thunderstorm and an organized, severe one. Vector difference from
  // speed+direction, not a scalar subtraction (two winds from different directions at
  // the same speed still produce strong shear).
  function bulkShear(i: number): number | null {
    const s1 = wind925[i], d1 = dir925[i], s2 = wind500[i], d2 = dir500[i];
    if (s1 === null || d1 === null || s2 === null || d2 === null) return null;
    const r1 = (d1 * Math.PI) / 180, r2 = (d2 * Math.PI) / 180;
    const ux = s1 * Math.sin(r1), uy = s1 * Math.cos(r1);
    const vx = s2 * Math.sin(r2), vy = s2 * Math.cos(r2);
    return Math.hypot(vx - ux, vy - uy);
  }
  const shear = times.map((_, i) => bulkShear(i));
  const sm0 = slice<number | null>(h.soil_moisture_0_to_1cm);
  const sm9 = slice<number | null>(h.soil_moisture_3_to_9cm);
  const sm27 = slice<number | null>(h.soil_moisture_9_to_27cm);

  // Past 14 days of daily rainfall, for catchment wetness.
  const dailyTimes: string[] = d.time || [];
  const todayStr = new Date().toISOString().split("T")[0];
  const pastDailyPrecip: number[] = [];
  dailyTimes.forEach((t, i) => {
    if (t < todayStr) {
      const v = num(d.precipitation_sum?.[i]);
      if (v !== null) pastDailyPrecip.push(v);
    }
  });

  const forecasts: HazardForecast[] = [];
  const smSurface = mean(sm0);
  const smRoot = mean(sm9);
  const smDeep = mean(sm27);

  const capePeak = peak(cape);
  const liTrough = trough(li);
  const gustPeak = peak(gusts);
  const precipPeak = peak(precip);

  // ============ THUNDERSTORM — convective instability ============
  if (capePeak) {
    const capeVal = capePeak.value;
    const liVal = liTrough?.value ?? 0;
    const cinAtPeak = num(cin[capePeak.index]) ?? 0;
    const cloudAtPeak = num(cloud[capePeak.index]) ?? 0;
    const probAtPeak = num(precipProb[capePeak.index]) ?? 0;

    const shearAtPeak = shear[capePeak.index] ?? null;
    // CAPE x shear is the standard severe-weather discriminant: high CAPE with weak shear
    // produces short-lived pulse storms, while the same CAPE with strong shear organizes
    // into longer-lived, more damaging systems (supercells, squall lines).
    const shearF = shearAtPeak !== null ? clamp01(shearAtPeak / 25) : 0;
    const organized = shearAtPeak !== null && shearAtPeak > 15;

    const capeF = clamp01((capeVal - 300) / 2200);
    const liF = clamp01(-liVal / 6);
    const uncapped = clamp01(1 - Math.abs(cinAtPeak) / 150);
    const support = clamp01((cloudAtPeak / 100) * 0.5 + (probAtPeak / 100) * 0.5);
    const score = clamp01(capeF * 0.32 + liF * 0.2 + uncapped * 0.13 + support * 0.15 + shearF * 0.2);

    if (score > 0.2) {
      forecasts.push({
        hazard: "Thunderstorm",
        method: shearAtPeak !== null
          ? "Convective instability (CAPE, Lifted Index, CIN) + 925-500hPa bulk wind shear"
          : "Convective instability indices (CAPE, Lifted Index, CIN) — shear levels unavailable",
        riskScore: Number(score.toFixed(2)),
        confidence: conf(score),
        leadTimeHours: firstIndexWhere(cape, (v) => v >= Math.max(500, capeVal * 0.7)),
        peakTimeIso: times[capePeak.index] || null,
        window: "next 72h",
        compound: false,
        drivers: [
          { label: "CAPE", value: `${capeVal.toFixed(0)} J/kg`, meaning: capeVal > 2500 ? "Strong instability" : capeVal > 1000 ? "Moderate instability" : "Weak instability" },
          { label: "Lifted Index", value: liVal.toFixed(1), meaning: liVal < -6 ? "Strongly unstable" : liVal < -3 ? "Moderately unstable" : "Marginally unstable" },
          { label: "Convective inhibition", value: `${cinAtPeak.toFixed(0)} J/kg`, meaning: Math.abs(cinAtPeak) < 25 ? "Uncapped — convection can fire freely" : "Capped — needs stronger forcing" },
          shearAtPeak !== null
            ? { label: "925-500hPa bulk shear", value: `${shearAtPeak.toFixed(0)} km/h`, meaning: organized ? "Organized potential — supercells or squall lines possible" : "Weak shear — short-lived pulse storms expected" }
            : { label: "Cloud / precip probability", value: `${cloudAtPeak.toFixed(0)}% / ${probAtPeak.toFixed(0)}%`, meaning: "Model confidence convection develops" },
        ],
        action: organized
          ? "Organized severe potential — issue tornado/hail watch guidance and secure structures ahead of the peak window."
          : score > 0.6
          ? "Secure loose outdoor structures; expect lightning and damaging gusts near the peak window."
          : "Monitor updates; localised storms possible.",
      });
    }
  }

  // ============ FLASH FLOOD — API + rainfall intensity on saturated ground ============
  const api = antecedentPrecipitationIndex(pastDailyPrecip);
  if (precipPeak && precipPeak.value > 0.5) {
    const total72 = nums(precip as any[]).reduce((a, b) => a + b, 0);
    const saturation = clamp01(((smSurface + smRoot) / 2 - 0.22) / 0.18);
    const apiF = clamp01(api / 40); // 40mm decayed antecedent rain = very wet catchment
    const intensity = clamp01(precipPeak.value / 15);
    const volume = clamp01(total72 / 80);
    const convective = capePeak ? clamp01((capePeak.value - 500) / 2000) * 0.25 : 0;

    const score = clamp01(saturation * 0.25 + apiF * 0.2 + intensity * 0.3 + volume * 0.15 + convective);

    if (score > 0.22) {
      forecasts.push({
        hazard: "Flash Flooding",
        method: "Antecedent Precipitation Index + rainfall intensity on soil moisture state",
        riskScore: Number(score.toFixed(2)),
        confidence: conf(score),
        leadTimeHours: firstIndexWhere(precip, (v) => v >= Math.max(2, precipPeak.value * 0.6)),
        peakTimeIso: times[precipPeak.index] || null,
        window: "next 72h",
        compound: true,
        drivers: [
          { label: "Peak rainfall intensity", value: `${precipPeak.value.toFixed(1)} mm/h`, meaning: precipPeak.value > 10 ? "Intense convective rate" : "Moderate rate" },
          { label: "Antecedent Precipitation Index", value: `${api.toFixed(1)} mm`, meaning: api > 30 ? "Catchment already wet — little absorption left" : "Catchment has absorption capacity" },
          { label: "Soil moisture (surface / root)", value: `${smSurface.toFixed(3)} / ${smRoot.toFixed(3)} m³/m³`, meaning: (smSurface + smRoot) / 2 > 0.35 ? "Near saturation — rain becomes runoff" : "Retains absorption capacity" },
          { label: "72h rainfall total", value: `${total72.toFixed(0)} mm`, meaning: "Cumulative load on drainage" },
        ],
        action: score > 0.6 ? "Clear drains and culverts now; avoid underpasses and low-lying roads during the peak window." : "Check drainage on low-lying streets ahead of peak rainfall.",
      });
    }
  }

  // ============ LANDSLIDE — Caine rainfall I-D threshold + infinite-slope stability ============
  if (slope && slope.gradientPct > 3) {
    const slopeSourcePct = terrain?.maxSlopePct ?? slope.gradientPct;
    const slopeDeg = Math.atan(slopeSourcePct / 100) * (180 / Math.PI);

    // Rainfall trigger: test forecast intensity at several durations against Caine's
    // (1980) global rainfall intensity-duration threshold, and find the first hour
    // any duration crosses it — a short intense burst and a long moderate soak are
    // both real triggers, so every duration is checked independently.
    const durations = [1, 3, 6, 12, 24];
    let worstRatio = 0;
    let worstDriver: { durationH: number; intensity: number; threshold: number } | null = null;
    let triggerIndex: number | null = null;
    for (const dHrs of durations) {
      const rolling = rollingIntensityMmPerHr(precip, dHrs);
      const threshold = caineIdThresholdMmPerHr(dHrs);
      for (let i = 0; i < rolling.length; i++) {
        const v = rolling[i];
        if (v === null) continue;
        const ratio = v / threshold;
        if (ratio > worstRatio) {
          worstRatio = ratio;
          worstDriver = { durationH: dHrs, intensity: v, threshold };
        }
        if (ratio >= 1 && triggerIndex === null) triggerIndex = i;
      }
    }
    const triggerF = clamp01(worstRatio);

    // Saturation: blend real-time soil moisture with antecedent rainfall — the same
    // signals the Flash Flood model above uses. A slope loses shear strength the
    // same way a catchment loses absorption capacity.
    const saturationState = clamp01(((smSurface + smRoot) / 2 - 0.15) / 0.25);
    const apiF = clamp01(api / 40);
    const saturationF = clamp01(saturationState * 0.6 + apiF * 0.4);

    // Slope stability: infinite-slope factor of safety (Montgomery & Dietrich 1994 /
    // TRIGRS-SHALSTAB form), using texture-derived strength parameters and the
    // saturation state as the fraction of an assumed 1.2m shallow regolith column
    // carrying pore pressure.
    const mech = soilMechanicalParams(soilTexture?.texture);
    const fs = infiniteSlopeFactorOfSafety({
      slopeDeg,
      cohesionKPa: mech.cohesionKPa,
      frictionAngleDeg: mech.frictionAngleDeg,
      unitWeightKNm3: mech.unitWeightKNm3,
      soilDepthM: 1.2,
      saturationFraction: saturationState,
    });
    const stabilityF = clamp01((1.6 - fs) / 1.1); // FS 1.6 (comfortably stable) -> 0, FS 0.5 (failing) -> 1

    const score = clamp01(triggerF * 0.4 + stabilityF * 0.35 + saturationF * 0.25);

    if (score > 0.22) {
      forecasts.push({
        hazard: "Landslide",
        method: terrain
          ? "Caine rainfall I-D threshold + infinite-slope factor of safety (Copernicus 30m DEM slope, SoilGrids texture)"
          : "Caine rainfall I-D threshold + infinite-slope factor of safety (elevation-cross slope, SoilGrids texture)",
        riskScore: Number(score.toFixed(2)),
        confidence: conf(score),
        leadTimeHours: triggerIndex,
        peakTimeIso: triggerIndex !== null ? times[triggerIndex] || null : null,
        window: "next 72h",
        compound: true,
        drivers: [
          {
            label: "Rainfall vs Caine I-D threshold",
            value: worstDriver
              ? `${worstDriver.intensity.toFixed(1)} mm/h over ${worstDriver.durationH}h (threshold ${worstDriver.threshold.toFixed(1)} mm/h)`
              : "no significant rain forecast",
            meaning: worstRatio >= 1 ? "Forecast rainfall crosses the global triggering envelope" : worstRatio >= 0.7 ? "Approaching the triggering envelope" : "Below the triggering envelope",
          },
          {
            label: "Infinite-slope factor of safety",
            value: fs.toFixed(2),
            meaning: fs < 1.0 ? "Below 1.0 — driving stress exceeds resisting strength under these conditions" : fs < 1.5 ? "Marginal — limited safety margin" : "Stable under current conditions",
          },
          {
            label: "Slope angle",
            value: `${slopeDeg.toFixed(1)}°`,
            meaning: terrain ? "Refined against Copernicus 30m DEM" : "From a 5-point elevation cross (~1.1km spacing)",
          },
          {
            label: "Soil texture & strength",
            value: soilTexture?.texture
              ? `${soilTexture.texture} (φ'=${mech.frictionAngleDeg}°, c'=${mech.cohesionKPa}kPa)`
              : `assumed loam-like (φ'=${mech.frictionAngleDeg}°, c'=${mech.cohesionKPa}kPa)`,
            meaning: soilTexture?.note || "SoilGrids texture unavailable — using a mid-range default",
          },
          {
            label: "Saturation state",
            value: `${(saturationState * 100).toFixed(0)}% of assumed regolith column + API ${api.toFixed(1)}mm`,
            meaning: saturationState > 0.6 ? "Near-saturated — little pore-pressure buffer left" : "Some absorption capacity remains",
          },
        ],
        action:
          score > 0.6
            ? "Evacuate or avoid steep terrain now — forecast rainfall crosses the triggering threshold on already-saturated ground."
            : score > 0.4
            ? "Monitor closely and prepare evacuation routes for hillside settlements ahead of the peak rainfall window."
            : "Watch conditions; slope shows elevated but not yet critical risk.",
      });
    }
  }

  // ============ BLIZZARD — official NWS three-part criteria ============
  const bz = blizzardHours(wind, gusts, visibility, snowfall, snowDepth);
  if (bz.qualifyingHours > 0) {
    // NWS requires the conditions to persist for at least 3 hours to be a blizzard.
    const meetsDuration = bz.longestRunHours >= 3;
    const durationF = clamp01(bz.longestRunHours / 6);
    const extentF = clamp01(bz.qualifyingHours / 12);
    const score = clamp01((meetsDuration ? 0.45 : 0.2) + durationF * 0.35 + extentF * 0.2);

    forecasts.push({
      hazard: "Blizzard",
      method: "NWS blizzard criteria — wind ≥56 km/h + visibility <400 m + snow, ≥3h",
      riskScore: Number(score.toFixed(2)),
      confidence: conf(score),
      leadTimeHours: bz.firstIndex,
      peakTimeIso: bz.firstIndex !== null ? times[bz.firstIndex] || null : null,
      window: "next 72h",
      compound: true,
      drivers: [
        { label: "Hours meeting all three criteria", value: `${bz.qualifyingHours}h`, meaning: "Wind, visibility and snow simultaneously" },
        { label: "Longest continuous spell", value: `${bz.longestRunHours}h`, meaning: meetsDuration ? "Meets the 3-hour blizzard threshold" : "Below the 3-hour threshold — severe snowstorm, not formally a blizzard" },
        { label: "Peak wind / gusts", value: `${(peak(wind)?.value ?? 0).toFixed(0)} / ${(gustPeak?.value ?? 0).toFixed(0)} km/h`, meaning: "Drives blowing snow and whiteout" },
        { label: "Minimum visibility", value: `${(trough(visibility)?.value ?? 0).toFixed(0)} m`, meaning: "Below 400 m qualifies as blizzard-level" },
      ],
      action: "Avoid travel during the spell; whiteout conditions make roads impassable and disorienting.",
    });
  }

  // ============ EXTREME COLD — wind chill and frostbite time, anomaly-aware ============
  const chills = temp.map((t, i) => (t === null ? null : windChillC(t, wind[i] ?? 0)));
  const chillTrough = trough(chills);
  if (chillTrough && chillTrough.value < 0) {
    const wc = chillTrough.value;
    const fbMin = frostbiteMinutes(wc);
    const hoursBelowM15 = longestRun(chills, (v) => v <= -15);

    // How unusual is this for this location at this time of year?
    const tMinNow = trough(temp)?.value ?? 0;
    const z = baseline && baseline.tempMin.length > 5 ? zScore(tMinNow, baseline.tempMin) : null;

    const absoluteF = clamp01((-wc - 10) / 35); // -10C -> 0, -45C -> 1
    const durationF = clamp01(hoursBelowM15 / 12);
    const anomalyF = z !== null ? clamp01(-z / 2.5) : 0.3; // 2.5 sd below seasonal norm -> 1
    const score = clamp01(absoluteF * 0.4 + durationF * 0.25 + anomalyF * 0.35);

    if (score > 0.25) {
      forecasts.push({
        hazard: "Extreme Cold",
        method: "JAG/TI wind chill + frostbite thresholds, scored against seasonal norms",
        riskScore: Number(score.toFixed(2)),
        confidence: conf(score),
        leadTimeHours: firstIndexWhere(chills, (v) => v <= Math.min(-10, wc * 0.7)),
        peakTimeIso: times[chillTrough.index] || null,
        window: "next 72h",
        compound: true,
        drivers: [
          { label: "Minimum wind chill", value: `${wc.toFixed(1)} °C`, meaning: fbMin ? `Frostbite on exposed skin in ~${fbMin} min` : "Uncomfortable but below frostbite threshold" },
          { label: "Air temperature / wind", value: `${tMinNow.toFixed(1)} °C @ ${(peak(wind)?.value ?? 0).toFixed(0)} km/h`, meaning: "Wind is what converts cold into danger" },
          { label: "Hours below −15 °C wind chill", value: `${hoursBelowM15}h`, meaning: "Sustained exposure risk for unhoused and outdoor workers" },
          {
            label: "Seasonal anomaly",
            value: z !== null ? `${z.toFixed(1)} σ` : "baseline unavailable",
            meaning: z !== null ? (z < -1.5 ? "Far colder than normal for this date here" : "Within normal seasonal range") : "No historical baseline for comparison",
          },
        ],
        action: "Open warming centres and check on unhoused, elderly and outdoor workers; protect pipes and livestock.",
      });
    }
  }

  // ============ ICE STORM — freezing-rain signature with accretion estimate ============
  const ice = freezingRainAnalysis(temp, t850, precip, snowfall);
  if (ice.hours > 0) {
    const accretionF = clamp01(ice.accretionMm / 12); // 12mm threatens power infrastructure
    const durationF = clamp01(ice.hours / 8);
    const score = clamp01(accretionF * 0.6 + durationF * 0.4);

    forecasts.push({
      hazard: "Ice Storm",
      method: "Freezing-rain thermal profile (warm layer aloft over sub-freezing surface) + ice accretion",
      riskScore: Number(score.toFixed(2)),
      confidence: conf(score),
      leadTimeHours: ice.firstIndex,
      peakTimeIso: ice.peakIndex !== null ? times[ice.peakIndex] || null : null,
      window: "next 72h",
      compound: true,
      drivers: [
        { label: "Estimated ice accretion", value: `${ice.accretionMm.toFixed(1)} mm`, meaning: iceAccretionImpact(ice.accretionMm) },
        { label: "Freezing-rain hours", value: `${ice.hours}h`, meaning: "Liquid precipitation onto a sub-freezing surface" },
        { label: "Warm layer aloft (850 hPa)", value: ice.warmLayerC !== null ? `${ice.warmLayerC.toFixed(1)} °C` : "—", meaning: "Above freezing aloft — snow melts before descending" },
        { label: "Surface temperature", value: `${(trough(temp)?.value ?? 0).toFixed(1)} °C`, meaning: "At or below freezing — rain glazes on contact" },
      ],
      action: "Pre-treat roads, stage line crews and prepare for outages; ice accretion brings down limbs and conductors.",
    });
  }

  // ============ TROPICAL CYCLONE — pressure fall + Saffir-Simpson wind ============
  const pressureTrough = trough(pressure);
  const sustainedPeak = peak(wind);
  if (pressureTrough && sustainedPeak) {
    const minP = pressureTrough.value;
    const maxWind = sustainedPeak.value;
    const ss = saffirSimpson(maxWind);

    // Deep low pressure is the defining structural signature of a cyclone.
    const pressureF = clamp01((1010 - minP) / 60); // 1010 hPa -> 0, 950 hPa -> 1
    const windF = clamp01((maxWind - 60) / 190); // 60 km/h -> 0, 250 km/h -> 1
    const zWind = baseline && baseline.windMax.length > 5 ? zScore(maxWind, baseline.windMax) : null;
    const anomalyF = zWind !== null ? clamp01(zWind / 3) : 0;
    const score = clamp01(pressureF * 0.4 + windF * 0.45 + anomalyF * 0.15);

    // Only report when there is a genuine signature — ordinary weather has neither.
    if (score > 0.3 && (minP < 1000 || maxWind >= 63)) {
      forecasts.push({
        hazard: "Tropical Cyclone",
        method: "Mean sea-level pressure minimum + Saffir–Simpson wind classification",
        riskScore: Number(score.toFixed(2)),
        confidence: conf(score),
        leadTimeHours: firstIndexWhere(wind, (v) => v >= Math.max(50, maxWind * 0.7)),
        peakTimeIso: times[sustainedPeak.index] || null,
        window: "next 72h",
        compound: true,
        drivers: [
          { label: "Minimum sea-level pressure", value: `${minP.toFixed(0)} hPa`, meaning: minP < 950 ? "Very deep low — intense system" : minP < 980 ? "Deep low — significant system" : "Modest pressure fall" },
          { label: "Peak sustained wind", value: `${maxWind.toFixed(0)} km/h`, meaning: ss.category },
          { label: "Peak gusts", value: `${(gustPeak?.value ?? 0).toFixed(0)} km/h`, meaning: "Gusts drive structural damage" },
          { label: "Wind anomaly vs season", value: zWind !== null ? `${zWind.toFixed(1)} σ` : "baseline unavailable", meaning: zWind !== null && zWind > 2 ? "Far above normal for this date here" : "Within seasonal range" },
        ],
        action: "Secure structures and windows, prepare for storm surge in coastal zones, and stage evacuation of low-lying areas.",
      });
    }
  }

  // ============ FIRE WEATHER — VPD-led fuel dryness ============
  const vpdPeak = peak(vpd);
  const rhTrough = trough(rh);
  if (vpdPeak && vpdPeak.value > 1.0) {
    const vpdF = clamp01((vpdPeak.value - 1.0) / 2.5);
    const rhF = rhTrough ? clamp01((40 - rhTrough.value) / 25) : 0;
    const gustF = gustPeak ? clamp01((gustPeak.value - 20) / 40) : 0;
    const soilDryFuel = clamp01((0.25 - smDeep) / 0.15);
    // Sentinel-2 NDMI measures actual leaf water content, a more direct fuel-moisture
    // signal than soil moisture alone — vegetation can be green but water-stressed.
    // When available it replaces the soil-moisture proxy rather than just averaging with it.
    const dryFuel = fuel ? fuel.fuelDrynessIndex : soilDryFuel;
    const weights = fuel ? { vpd: 0.3, rh: 0.2, gust: 0.15, fuel: 0.35 } : { vpd: 0.35, rh: 0.25, gust: 0.2, fuel: 0.2 };
    const score = clamp01(vpdF * weights.vpd + rhF * weights.rh + gustF * weights.gust + dryFuel * weights.fuel);

    if (score > 0.25) {
      forecasts.push({
        hazard: "Fire Weather",
        method: fuel
          ? "Vapour pressure deficit + humidity + wind + Sentinel-2 NDMI fuel moisture"
          : "Vapour pressure deficit + humidity + wind + root-zone soil moisture (NDMI unavailable)",
        riskScore: Number(score.toFixed(2)),
        confidence: conf(score),
        leadTimeHours: firstIndexWhere(vpd, (v) => v >= Math.max(1.5, vpdPeak.value * 0.8)),
        peakTimeIso: times[vpdPeak.index] || null,
        window: "next 72h",
        compound: true,
        drivers: [
          { label: "Vapour pressure deficit", value: `${vpdPeak.value.toFixed(2)} kPa`, meaning: vpdPeak.value > 2.5 ? "Extreme atmospheric drying of fuels" : "Elevated fuel drying" },
          { label: "Minimum relative humidity", value: rhTrough ? `${rhTrough.value.toFixed(0)}%` : "—", meaning: (rhTrough?.value ?? 100) < 25 ? "Critically dry air" : "Moderately dry air" },
          { label: "Peak wind gusts", value: gustPeak ? `${gustPeak.value.toFixed(0)} km/h` : "—", meaning: "Wind-driven spread potential" },
          fuel
            ? { label: "Vegetation water content (NDMI)", value: fuel.ndmi.toFixed(3), meaning: fuel.ndmi < 0 ? "Critically dry leaf tissue" : fuel.ndmi < 0.1 ? "Stressed, readily combustible" : "Retains moisture" }
            : { label: "Root-zone soil moisture", value: `${smDeep.toFixed(3)} m³/m³`, meaning: smDeep < 0.15 ? "Severely depleted — vegetation stressed" : "Some moisture retained" },
        ],
        action: score > 0.6 ? "Restrict open burning and machinery use; stage suppression near the vegetated urban fringe." : "Elevated fire danger — enforce burn precautions.",
      });
    }
  }

  // ============ DROUGHT — SPI-style standardized anomaly + water balance ============
  const et0Sum = nums(d.et0_fao_evapotranspiration || []).reduce((a, b) => a + b, 0);
  const precipRecent30 = pastDailyPrecip.slice(-30).reduce((a, b) => a + b, 0);
  const dryDayRun = longestRun(pastDailyPrecip, (v) => v < 1);

  if (baseline && baseline.precip.length > 5) {
    // Compare recent rainfall to the same calendar window in previous years.
    const baselineWindowTotal = (baseline.precip.reduce((a, b) => a + b, 0) / baseline.sampleDays) * 30;
    const z = zScore(precipRecent30 / 30, baseline.precip);
    const spi = z !== null ? spiCategory(z) : null;

    if (spi && spi.severity >= 0.35) {
      const soilF = clamp01((0.22 - smDeep) / 0.14);
      const dryRunF = clamp01(dryDayRun / 21);
      const balanceF = clamp01((et0Sum - nums(d.precipitation_sum || []).reduce((a, b) => a + b, 0)) / 15);
      const score = clamp01(spi.severity * 0.45 + soilF * 0.25 + dryRunF * 0.15 + balanceF * 0.15);

      forecasts.push({
        hazard: "Drought Stress",
        method: "SPI-style standardized precipitation anomaly vs 10-year seasonal baseline + ET0 water balance",
        riskScore: Number(score.toFixed(2)),
        confidence: conf(score),
        leadTimeHours: null,
        peakTimeIso: null,
        window: "30-day trailing + 3-day outlook",
        compound: true,
        drivers: [
          { label: "Standardized precipitation anomaly", value: z !== null ? `${z.toFixed(2)} σ` : "—", meaning: spi.label },
          { label: "Recent 30-day rainfall", value: `${precipRecent30.toFixed(0)} mm`, meaning: `Seasonal norm for this window is about ${baselineWindowTotal.toFixed(0)} mm` },
          { label: "Longest dry spell", value: `${dryDayRun} days`, meaning: dryDayRun > 14 ? "Extended rainless period" : "Intermittent rainfall" },
          { label: "Root-zone soil moisture", value: `${smDeep.toFixed(3)} m³/m³`, meaning: smDeep < 0.15 ? "Depleted — vegetation under stress" : "Adequate" },
          { label: "3-day evaporative demand (ET0)", value: `${et0Sum.toFixed(1)} mm`, meaning: "Water the atmosphere will pull from soil and plants" },
        ],
        action: "Prioritise irrigation scheduling and water conservation; monitor reservoir drawdown and crop stress.",
      });
    }
  }

  forecasts.sort((a, b) => b.riskScore - a.riskScore);

  return NextResponse.json({
    location: { lat, lng },
    generatedAt: new Date().toISOString(),
    model: "Open-Meteo NWP blend (ECMWF/GFS/ICON)",
    window: "72 hours",
    baseline: baseline
      ? { source: "Open-Meteo archive, ±10 days around today across 10 years", sampleDays: baseline.sampleDays }
      : { source: "unavailable — thresholds fall back to absolute values" },
    soilMoisture: {
      surface: Number(smSurface.toFixed(3)),
      rootZone: Number(smRoot.toFixed(3)),
      deep: Number(smDeep.toFixed(3)),
      antecedentPrecipitationIndexMm: Number(api.toFixed(1)),
      interpretation:
        (smSurface + smRoot) / 2 > 0.35
          ? "Near saturation — low infiltration capacity"
          : (smSurface + smRoot) / 2 < 0.15
          ? "Depleted — drought/fire relevant"
          : "Moderate",
    },
    forecasts,
  });
}
