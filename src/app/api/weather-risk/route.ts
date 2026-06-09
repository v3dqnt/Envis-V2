import { NextResponse } from "next/server";

export interface DisasterRisk {
  type: string;
  confidence: "high" | "medium" | "low";
  historicalBasis: string;
  recentSignal: string | null;
}

export interface WeatherRiskPayload {
  city: string;
  historical: {
    maxDailyPrecipMm: number;
    maxTempC: number;
    minTempC: number;
    maxWindKmh: number;
    maxDailySnowCm: number;
    annualAvgPrecipMm: number;
    yearsAnalyzed: number;
    startYear: number;
    endYear: number;
  };
  recent: {
    totalPrecipMm: number;
    maxTempC: number;
    minTempC: number;
    maxWindKmh: number;
    totalSnowCm: number;
    avgTempC: number;
    days: number;
  };
  risks: DisasterRisk[];
}

function safeMax(arr: (number | null)[]): number {
  const nums = arr.filter((v): v is number => v !== null && !isNaN(v));
  return nums.length ? Math.max(...nums) : 0;
}

function safeMin(arr: (number | null)[]): number {
  const nums = arr.filter((v): v is number => v !== null && !isNaN(v));
  return nums.length ? Math.min(...nums) : 0;
}

function safeSum(arr: (number | null)[]): number {
  return arr.reduce<number>((acc, v) => acc + (v !== null && !isNaN(v!) ? v! : 0), 0);
}

function safeMean(arr: (number | null)[]): number {
  const nums = arr.filter((v): v is number => v !== null && !isNaN(v));
  return nums.length ? safeSum(nums) / nums.length : 0;
}

function deriveRisks(
  hist: WeatherRiskPayload["historical"],
  recent: WeatherRiskPayload["recent"]
): DisasterRisk[] {
  const risks: DisasterRisk[] = [];

  // --- Flooding ---
  const historicalMonthlyAvgPrecip = hist.annualAvgPrecipMm / 12;
  const recentMonthlyPrecip = (recent.totalPrecipMm / recent.days) * 30;
  const floodingConfidence =
    hist.maxDailyPrecipMm > 100
      ? "high"
      : hist.maxDailyPrecipMm > 50
      ? "medium"
      : null;
  if (floodingConfidence) {
    risks.push({
      type: "Flooding",
      confidence: floodingConfidence,
      historicalBasis: `Peak single-day rainfall of ${hist.maxDailyPrecipMm.toFixed(0)}mm recorded in historical archive`,
      recentSignal:
        recentMonthlyPrecip > historicalMonthlyAvgPrecip * 1.4
          ? `Recent 30-day precipitation (${recent.totalPrecipMm.toFixed(0)}mm) is significantly above the historical monthly average (${historicalMonthlyAvgPrecip.toFixed(0)}mm)`
          : null,
    });
  }

  // --- Wildfire ---
  const isArid = hist.annualAvgPrecipMm < 600;
  const isHot = hist.maxTempC > 35;
  const recentDry = recent.totalPrecipMm < 20 && recent.maxTempC > 28;
  const wildfireConfidence =
    hist.maxTempC > 40 && isArid
      ? "high"
      : isHot && isArid
      ? "medium"
      : hist.maxTempC > 38
      ? "low"
      : null;
  if (wildfireConfidence) {
    risks.push({
      type: "Wildfire",
      confidence: wildfireConfidence,
      historicalBasis: `Historical peak temperature of ${hist.maxTempC.toFixed(1)}°C with annual average precipitation of ${hist.annualAvgPrecipMm.toFixed(0)}mm`,
      recentSignal: recentDry
        ? `Recent 30 days show high heat (${recent.maxTempC.toFixed(1)}°C) and near-zero rainfall (${recent.totalPrecipMm.toFixed(0)}mm) — elevated fire conditions`
        : null,
    });
  }

  // --- Blizzard / Extreme Snow ---
  const blizzardConfidence =
    hist.maxDailySnowCm > 30
      ? "high"
      : hist.maxDailySnowCm > 10
      ? "medium"
      : null;
  if (blizzardConfidence) {
    risks.push({
      type: "Blizzard",
      confidence: blizzardConfidence,
      historicalBasis: `Maximum single-day snowfall of ${hist.maxDailySnowCm.toFixed(0)}cm; historical minimum temperature ${hist.minTempC.toFixed(1)}°C`,
      recentSignal:
        recent.totalSnowCm > 5
          ? `${recent.totalSnowCm.toFixed(0)}cm of snowfall recorded in the last ${recent.days} days`
          : null,
    });
  }

  // --- Hurricane / Tropical Cyclone ---
  const cycloneConfidence =
    hist.maxWindKmh > 120
      ? "high"
      : hist.maxWindKmh > 90
      ? "medium"
      : null;
  if (cycloneConfidence) {
    risks.push({
      type: "Tropical Cyclone",
      confidence: cycloneConfidence,
      historicalBasis: `Historical maximum sustained wind speed of ${hist.maxWindKmh.toFixed(0)} km/h`,
      recentSignal:
        recent.maxWindKmh > 70
          ? `Recent wind gusts up to ${recent.maxWindKmh.toFixed(0)} km/h recorded in the last ${recent.days} days`
          : null,
    });
  }

  // --- Drought ---
  const droughtConfidence =
    hist.annualAvgPrecipMm < 250
      ? "high"
      : hist.annualAvgPrecipMm < 500
      ? "medium"
      : null;
  if (droughtConfidence && !risks.find((r) => r.type === "Wildfire")) {
    risks.push({
      type: "Drought",
      confidence: droughtConfidence,
      historicalBasis: `Annual average precipitation of only ${hist.annualAvgPrecipMm.toFixed(0)}mm — semi-arid to arid regime`,
      recentSignal:
        recent.totalPrecipMm < 10
          ? `Only ${recent.totalPrecipMm.toFixed(0)}mm of rainfall in the past ${recent.days} days`
          : null,
    });
  }

  // --- Extreme Cold ---
  if (hist.minTempC < -20 && !blizzardConfidence) {
    risks.push({
      type: "Extreme Cold",
      confidence: hist.minTempC < -30 ? "high" : "medium",
      historicalBasis: `Historical minimum temperature of ${hist.minTempC.toFixed(1)}°C`,
      recentSignal:
        recent.minTempC < -10
          ? `Recent low of ${recent.minTempC.toFixed(1)}°C recorded`
          : null,
    });
  }

  // Sort: high → medium → low, then recentSignal ones first
  const order = { high: 0, medium: 1, low: 2 };
  risks.sort((a, b) => {
    const confDiff = order[a.confidence] - order[b.confidence];
    if (confDiff !== 0) return confDiff;
    return (b.recentSignal ? 1 : 0) - (a.recentSignal ? 1 : 0);
  });

  return risks;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = parseFloat(searchParams.get("lat") || "");
  const lng = parseFloat(searchParams.get("lng") || "");
  const city = searchParams.get("city") || "Unknown";

  if (isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: "lat and lng are required" }, { status: 400 });
  }

  // Date range: 10 years of history, end 7 days before today to stay within archive window
  const today = new Date();
  const archiveEnd = new Date(today);
  archiveEnd.setDate(today.getDate() - 7);
  const archiveStart = new Date(archiveEnd);
  archiveStart.setFullYear(archiveEnd.getFullYear() - 10);

  const fmt = (d: Date) => d.toISOString().split("T")[0];
  const startDate = fmt(archiveStart);
  const endDate = fmt(archiveEnd);

  const dailyVars = "precipitation_sum,temperature_2m_max,temperature_2m_min,wind_speed_10m_max,snowfall_sum";

  const [histRes, recentRes] = await Promise.all([
    fetch(
      `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}&start_date=${startDate}&end_date=${endDate}&daily=${dailyVars}&timezone=auto&wind_speed_unit=kmh`,
      { next: { revalidate: 86400 } }
    ),
    fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&past_days=30&daily=${dailyVars}&timezone=auto&wind_speed_unit=kmh`,
      { next: { revalidate: 3600 } }
    ),
  ]);

  if (!histRes.ok || !recentRes.ok) {
    return NextResponse.json({ error: "Open-Meteo fetch failed" }, { status: 502 });
  }

  const [histData, recentData] = await Promise.all([histRes.json(), recentRes.json()]);

  const hd = histData.daily || {};
  const rd = recentData.daily || {};

  const totalDays = (hd.precipitation_sum || []).length;
  const totalYears = Math.round(totalDays / 365);
  const annualAvgPrecip = totalYears > 0 ? safeSum(hd.precipitation_sum) / totalYears : 0;

  const historical: WeatherRiskPayload["historical"] = {
    maxDailyPrecipMm: safeMax(hd.precipitation_sum || []),
    maxTempC: safeMax(hd.temperature_2m_max || []),
    minTempC: safeMin(hd.temperature_2m_min || []),
    maxWindKmh: safeMax(hd.wind_speed_10m_max || []),
    maxDailySnowCm: safeMax(hd.snowfall_sum || []),
    annualAvgPrecipMm: annualAvgPrecip,
    yearsAnalyzed: totalYears,
    startYear: archiveStart.getFullYear(),
    endYear: archiveEnd.getFullYear(),
  };

  const recentDays = (rd.precipitation_sum || []).length;
  const recent: WeatherRiskPayload["recent"] = {
    totalPrecipMm: safeSum(rd.precipitation_sum || []),
    maxTempC: safeMax(rd.temperature_2m_max || []),
    minTempC: safeMin(rd.temperature_2m_min || []),
    maxWindKmh: safeMax(rd.wind_speed_10m_max || []),
    totalSnowCm: safeSum(rd.snowfall_sum || []),
    avgTempC: safeMean(rd.temperature_2m_max || []),
    days: recentDays,
  };

  const risks = deriveRisks(historical, recent);

  const payload: WeatherRiskPayload = { city, historical, recent, risks };
  return NextResponse.json(payload);
}
