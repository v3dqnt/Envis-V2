/**
 * Standard meteorological formulas and detection criteria.
 *
 * Everything here follows a published operational method rather than an invented
 * threshold, so each hazard call can be traced back to how forecasters actually
 * make it. Sources are named per function.
 */

/**
 * Wind chill, JAG/TI formula — the standard jointly adopted by the US National
 * Weather Service and Environment Canada (2001).
 *
 *   WC = 13.12 + 0.6215·T − 11.37·V^0.16 + 0.3965·T·V^0.16
 *
 * Valid for air temperature <= 10 °C and wind speed > 4.8 km/h. Below that the
 * formula is not defined and plain air temperature is the honest answer.
 */
export function windChillC(tempC: number, windKmh: number): number {
  if (tempC > 10 || windKmh <= 4.8) return tempC;
  const v = Math.pow(windKmh, 0.16);
  return 13.12 + 0.6215 * tempC - 11.37 * v + 0.3965 * tempC * v;
}

/**
 * Approximate time to frostbite on exposed skin, from Environment Canada's
 * wind chill hazard table. Returns minutes, or null when there is no meaningful risk.
 */
export function frostbiteMinutes(windChill: number): number | null {
  if (windChill > -27) return null;
  if (windChill <= -55) return 2;
  if (windChill <= -48) return 5;
  if (windChill <= -40) return 10;
  return 30;
}

/**
 * Saffir–Simpson hurricane wind scale, expressed in km/h of sustained wind.
 * Below 63 km/h a system is a tropical depression rather than a named storm.
 */
export function saffirSimpson(windKmh: number): { category: string; level: number } {
  if (windKmh >= 252) return { category: "Category 5", level: 5 };
  if (windKmh >= 209) return { category: "Category 4", level: 4 };
  if (windKmh >= 178) return { category: "Category 3", level: 3 };
  if (windKmh >= 154) return { category: "Category 2", level: 2 };
  if (windKmh >= 119) return { category: "Category 1", level: 1 };
  if (windKmh >= 63) return { category: "Tropical Storm", level: 0.5 };
  return { category: "Tropical Depression", level: 0 };
}

/**
 * Antecedent Precipitation Index — a standard hydrological measure of how wet a
 * catchment already is before new rain arrives. Recent rainfall counts for more
 * than older rainfall, decaying geometrically.
 *
 *   API = Σ Pᵢ · k^i    (i = days before present, k ≈ 0.9)
 *
 * A high API means the ground has little capacity left to absorb more.
 */
export function antecedentPrecipitationIndex(dailyPrecipMm: number[], k = 0.9): number {
  let api = 0;
  // dailyPrecipMm is chronological, so walk backwards from the most recent day.
  for (let i = dailyPrecipMm.length - 1, age = 0; i >= 0; i--, age++) {
    const p = dailyPrecipMm[i];
    if (typeof p === "number" && !isNaN(p)) api += p * Math.pow(k, age);
  }
  return api;
}

/** Mean and standard deviation of a numeric sample. */
export function meanStd(values: number[]): { mean: number; std: number } {
  const clean = values.filter((v) => typeof v === "number" && !isNaN(v));
  if (clean.length === 0) return { mean: 0, std: 0 };
  const mean = clean.reduce((a, b) => a + b, 0) / clean.length;
  const variance = clean.reduce((a, b) => a + (b - mean) ** 2, 0) / clean.length;
  return { mean, std: Math.sqrt(variance) };
}

/**
 * Standardized anomaly (z-score) of an observation against a historical sample.
 * This is the principle behind the Standardized Precipitation Index: it asks how
 * unusual a value is *for this place at this time of year*, instead of comparing
 * every location on Earth to one fixed number.
 */
export function zScore(value: number, sample: number[]): number | null {
  const { mean, std } = meanStd(sample);
  if (std === 0) return null;
  return (value - mean) / std;
}

/** SPI-style drought severity classification from a standardized anomaly. */
export function spiCategory(z: number): { label: string; severity: number } {
  if (z <= -2.0) return { label: "Extreme drought", severity: 1.0 };
  if (z <= -1.5) return { label: "Severe drought", severity: 0.8 };
  if (z <= -1.0) return { label: "Moderate drought", severity: 0.6 };
  if (z <= -0.5) return { label: "Mild drought", severity: 0.35 };
  if (z >= 2.0) return { label: "Extremely wet", severity: 0 };
  if (z >= 1.0) return { label: "Wet", severity: 0 };
  return { label: "Near normal", severity: 0.1 };
}

/**
 * Blizzard criteria as defined by the US National Weather Service: sustained wind
 * or frequent gusts at or above 56 km/h (35 mph), combined with falling or blowing
 * snow reducing visibility below 400 m (¼ mile), sustained for at least 3 hours.
 *
 * All three conditions must hold together — heavy snow alone is a snowstorm, not
 * a blizzard. Returns the number of qualifying hours and the longest unbroken run.
 */
export function blizzardHours(
  windKmh: (number | null)[],
  gustKmh: (number | null)[],
  visibilityM: (number | null)[],
  snowfallCm: (number | null)[],
  snowDepthM: (number | null)[]
): { qualifyingHours: number; longestRunHours: number; firstIndex: number | null } {
  let qualifying = 0;
  let longest = 0;
  let run = 0;
  let firstIndex: number | null = null;

  for (let i = 0; i < visibilityM.length; i++) {
    const w = windKmh[i] ?? 0;
    const g = gustKmh[i] ?? 0;
    const vis = visibilityM[i];
    const snow = snowfallCm[i] ?? 0;
    const depth = snowDepthM[i] ?? 0;

    const windOk = Math.max(w ?? 0, g ?? 0) >= 56;
    const visOk = vis !== null && vis < 400;
    // Falling snow, or loose lying snow available to be blown around.
    const snowOk = snow > 0.05 || depth > 0.02;

    if (windOk && visOk && snowOk) {
      qualifying++;
      run++;
      if (firstIndex === null) firstIndex = i;
      if (run > longest) longest = run;
    } else {
      run = 0;
    }
  }
  return { qualifyingHours: qualifying, longestRunHours: longest, firstIndex };
}

/**
 * Freezing-rain (ice storm) detection with an ice accretion estimate.
 *
 * Freezing rain forms when snow falls through a warm layer aloft, melts, then
 * refreezes on contact with a sub-freezing surface. Damage scales with radial ice
 * accretion: roughly 6 mm downs tree limbs, 12 mm threatens power lines.
 *
 * Accretion here is approximated as liquid depth collected while the signature
 * holds; real accretion depends on wind and surface geometry, so this is an
 * indicator of order of magnitude rather than an engineering figure.
 */
export function freezingRainAnalysis(
  surfaceTempC: (number | null)[],
  temp850C: (number | null)[],
  precipMm: (number | null)[],
  snowfallCm: (number | null)[]
): {
  hours: number;
  accretionMm: number;
  firstIndex: number | null;
  peakIndex: number | null;
  warmLayerC: number | null;
} {
  let hours = 0;
  let accretion = 0;
  let firstIndex: number | null = null;
  let peakIndex: number | null = null;
  let peakRate = 0;
  let warmLayerC: number | null = null;

  for (let i = 0; i < surfaceTempC.length; i++) {
    const ts = surfaceTempC[i];
    const ta = temp850C[i];
    const p = precipMm[i] ?? 0;
    const s = snowfallCm[i] ?? 0;
    if (ts === null || ta === null) continue;

    // Liquid precipitation: present, and not mostly falling as snow.
    const liquid = p > 0.05 && s < p * 0.3;
    if (ts <= 0.5 && ta > 0 && liquid) {
      hours++;
      accretion += p; // mm of liquid water freezing on contact
      if (firstIndex === null) firstIndex = i;
      if (p > peakRate) {
        peakRate = p;
        peakIndex = i;
        warmLayerC = ta;
      }
    }
  }
  return { hours, accretionMm: accretion, firstIndex, peakIndex, warmLayerC };
}

/** Damage interpretation for a given radial ice accretion, in mm. */
export function iceAccretionImpact(mm: number): string {
  if (mm >= 25) return "Catastrophic — widespread structural and grid collapse likely";
  if (mm >= 12) return "Severe — power lines and poles at risk of failure";
  if (mm >= 6) return "Significant — tree limbs down, scattered outages";
  if (mm >= 1) return "Nuisance — hazardous road and walkway glazing";
  return "Trace glazing";
}

/**
 * Rainfall intensity–duration (I–D) landslide threshold — Caine (1980).
 *
 *   I = 14.82 · D^-0.39
 *
 * I is rainfall intensity in mm/h, D is the storm duration in hours. This is the
 * global minimum envelope below which rainfall-triggered shallow landslides have
 * essentially never been documented; it is the baseline every regional threshold
 * (Italy's SIGMA, Hong Kong's Geotechnical Engineering Office, USGS's Seattle/Bay
 * Area systems) calibrates against. Valid for 0.1–500 h; shorter/longer durations
 * are clamped to that range since the power law is not meant to extrapolate past it.
 */
export function caineIdThresholdMmPerHr(durationHours: number): number {
  const d = Math.min(500, Math.max(0.1, durationHours));
  return 14.82 * Math.pow(d, -0.39);
}

/**
 * Rolling mean rainfall intensity (mm/h) over a trailing window of `windowHours`,
 * for every index in an hourly precipitation series. Used to test forecast rainfall
 * against the Caine I–D threshold at several durations simultaneously — a short,
 * intense burst and a long, moderate soak can both cross their respective curves.
 */
export function rollingIntensityMmPerHr(hourlyPrecipMm: (number | null)[], windowHours: number): (number | null)[] {
  const n = hourlyPrecipMm.length;
  const out: (number | null)[] = new Array(n).fill(null);
  const w = Math.max(1, Math.round(windowHours));
  let sum = 0;
  let count = 0;
  for (let i = 0; i < n; i++) {
    const v = hourlyPrecipMm[i];
    if (typeof v === "number" && !isNaN(v)) {
      sum += v;
      count++;
    }
    const dropIdx = i - w;
    if (dropIdx >= 0) {
      const dv = hourlyPrecipMm[dropIdx];
      if (typeof dv === "number" && !isNaN(dv)) {
        sum -= dv;
        count--;
      }
    }
    const windowSoFar = Math.min(w, i + 1);
    out[i] = count > 0 ? sum / windowSoFar : 0;
  }
  return out;
}

/**
 * Typical effective-stress strength parameters for shallow colluvium/regolith by
 * USDA texture class — the same classification `/api/soil` derives from ISRIC
 * SoilGrids. Values are representative midpoints from standard geotechnical
 * correlation tables (comparable to NAVFAC DM-7.01 / USDA-NRCS soil mechanics
 * references) for near-surface, loose-to-firm material — not a site investigation,
 * but far more grounded than an arbitrary weight.
 */
export function soilMechanicalParams(texture: string | undefined | null): {
  cohesionKPa: number;
  frictionAngleDeg: number;
  unitWeightKNm3: number;
} {
  const table: Record<string, { cohesionKPa: number; frictionAngleDeg: number; unitWeightKNm3: number }> = {
    Clay: { cohesionKPa: 10, frictionAngleDeg: 20, unitWeightKNm3: 19 },
    "Clay loam": { cohesionKPa: 8, frictionAngleDeg: 24, unitWeightKNm3: 18.5 },
    "Sandy clay loam": { cohesionKPa: 5, frictionAngleDeg: 27, unitWeightKNm3: 18 },
    Loam: { cohesionKPa: 4, frictionAngleDeg: 28, unitWeightKNm3: 18 },
    "Silt loam": { cohesionKPa: 3, frictionAngleDeg: 27, unitWeightKNm3: 17.5 },
    Silt: { cohesionKPa: 2, frictionAngleDeg: 26, unitWeightKNm3: 17 },
    "Loamy sand": { cohesionKPa: 1, frictionAngleDeg: 32, unitWeightKNm3: 17.5 },
    Sand: { cohesionKPa: 0.5, frictionAngleDeg: 33, unitWeightKNm3: 17 },
  };
  return (texture && table[texture]) || { cohesionKPa: 4, frictionAngleDeg: 27, unitWeightKNm3: 18 }; // loam-like default
}

/**
 * Infinite-slope factor of safety with parallel seepage — the physically-based
 * model underlying USGS's TRIGRS and SHALSTAB shallow-landslide susceptibility
 * systems (Montgomery & Dietrich 1994; Selby 1993).
 *
 *   FS = [c' + (γ·z − γw·m·z)·cos²β·tanφ'] / (γ·z·sinβ·cosβ)
 *
 * c' = effective cohesion (kPa), φ' = effective friction angle, γ = soil unit
 * weight (kN/m³), z = soil depth (m), β = slope angle, m = fraction of the soil
 * column that is saturated (0 = dry, 1 = fully saturated — this is where rainfall
 * infiltration enters the model as reduced effective stress / pore pressure).
 * FS > 1.5 is conventionally stable, FS < 1.0 means the driving stress already
 * exceeds resisting strength under the assumed conditions.
 */
export function infiniteSlopeFactorOfSafety(params: {
  slopeDeg: number;
  cohesionKPa: number;
  frictionAngleDeg: number;
  unitWeightKNm3: number;
  soilDepthM: number;
  saturationFraction: number;
}): number {
  const GAMMA_WATER = 9.81; // kN/m^3
  const beta = (Math.max(0.5, params.slopeDeg) * Math.PI) / 180;
  const phi = (params.frictionAngleDeg * Math.PI) / 180;
  const z = Math.max(0.1, params.soilDepthM);
  const m = Math.max(0, Math.min(1, params.saturationFraction));
  const gamma = params.unitWeightKNm3;

  const driving = gamma * z * Math.sin(beta) * Math.cos(beta);
  if (driving <= 0) return 10; // essentially flat ground — not meaningfully assessable, report as stable
  const resisting = params.cohesionKPa + (gamma * z - GAMMA_WATER * m * z) * Math.cos(beta) ** 2 * Math.tan(phi);
  return Math.max(0, resisting / driving);
}

/** Longest consecutive run where a predicate holds. */
export function longestRun(values: (number | null)[], pred: (v: number) => boolean): number {
  let longest = 0;
  let run = 0;
  for (const v of values) {
    if (v !== null && !isNaN(v) && pred(v)) {
      run++;
      if (run > longest) longest = run;
    } else {
      run = 0;
    }
  }
  return longest;
}

export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
