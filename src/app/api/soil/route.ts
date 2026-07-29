import { NextResponse } from "next/server";

/**
 * Soil properties from ISRIC SoilGrids (free, no API key).
 *
 * Soil composition governs slope stability in a way terrain alone cannot express.
 * Clay-rich soil retains water and loses shear strength when saturated, which is
 * why two hillsides at identical gradient and rainfall can behave completely
 * differently. Bulk density indicates compaction, and sand content indicates
 * drainage. These are the variables missing from a purely topographic model.
 *
 * Values are returned by SoilGrids in mapped units that need conversion:
 *   clay/sand/silt  g/kg   -> divide by 10 for percent
 *   bdod            cg/cm3 -> divide by 100 for g/cm3
 *   soc             dg/kg  -> divide by 100 for percent
 */

const PROPERTIES = ["clay", "sand", "silt", "bdod", "soc"] as const;
const DEPTHS = ["0-5cm", "15-30cm", "60-100cm"] as const;

export interface SoilProfile {
  clayPct: number | null;
  sandPct: number | null;
  siltPct: number | null;
  bulkDensityGCm3: number | null;
  organicCarbonPct: number | null;
}

export interface SoilPayload {
  available: boolean;
  note?: string;
  surface?: SoilProfile;
  subsoil?: SoilProfile;
  deep?: SoilProfile;
  texture?: string;
  landslideRelevance?: string;
  source?: string;
}

/** USDA-style texture class from sand/silt/clay percentages. */
function textureClass(sand: number, silt: number, clay: number): string {
  if (clay >= 40) return "Clay";
  if (clay >= 27 && sand <= 45) return "Clay loam";
  if (sand >= 85) return "Sand";
  if (sand >= 70) return "Loamy sand";
  if (silt >= 80) return "Silt";
  if (silt >= 50) return "Silt loam";
  if (clay >= 20 && sand >= 45) return "Sandy clay loam";
  return "Loam";
}

/**
 * How the soil profile affects slope failure risk. High clay with high bulk
 * density is the classic setup for a rainfall-triggered slip: water cannot drain
 * through, pore pressure rises, and the slope fails along a saturated plane.
 */
function landslideRelevance(clayPct: number | null, sandPct: number | null): string {
  if (clayPct === null) return "Soil composition unavailable";
  if (clayPct >= 35) return "High clay content — retains water, prone to losing shear strength when saturated";
  if (clayPct >= 25) return "Moderate clay content — reduced drainage, elevated slip risk on steep ground";
  if (sandPct !== null && sandPct >= 60) return "Sandy, free-draining — lower rainfall-triggered slip risk";
  return "Mixed texture — moderate drainage";
}

function extract(layers: any[], name: string, depthLabel: string): number | null {
  const layer = layers.find((l) => l.name === name);
  if (!layer) return null;
  const depth = (layer.depths || []).find((d: any) => d.label === depthLabel);
  const v = depth?.values?.mean;
  return typeof v === "number" ? v : null;
}

function buildProfile(layers: any[], depthLabel: string): SoilProfile {
  const clay = extract(layers, "clay", depthLabel);
  const sand = extract(layers, "sand", depthLabel);
  const silt = extract(layers, "silt", depthLabel);
  const bdod = extract(layers, "bdod", depthLabel);
  const soc = extract(layers, "soc", depthLabel);
  return {
    clayPct: clay !== null ? clay / 10 : null,
    sandPct: sand !== null ? sand / 10 : null,
    siltPct: silt !== null ? silt / 10 : null,
    bulkDensityGCm3: bdod !== null ? bdod / 100 : null,
    organicCarbonPct: soc !== null ? soc / 100 : null,
  };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = parseFloat(searchParams.get("lat") || "");
  const lng = parseFloat(searchParams.get("lng") || "");

  if (isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: "lat and lng are required" }, { status: 400 });
  }

  const params = new URLSearchParams();
  params.set("lon", lng.toString());
  params.set("lat", lat.toString());
  PROPERTIES.forEach((p) => params.append("property", p));
  DEPTHS.forEach((d) => params.append("depth", d));
  params.set("value", "mean");

  try {
    const res = await fetch(`https://rest.isric.org/soilgrids/v2.0/properties/query?${params}`, {
      next: { revalidate: 604800 }, // soil does not change week to week
    });
    if (!res.ok) {
      return NextResponse.json({ available: false, note: `SoilGrids returned ${res.status}` } satisfies SoilPayload);
    }
    const data = await res.json();
    const layers = data?.properties?.layers || [];
    if (layers.length === 0) {
      return NextResponse.json({ available: false, note: "No soil data at this location (likely ocean or ice)" } satisfies SoilPayload);
    }

    const surface = buildProfile(layers, "0-5cm");
    const subsoil = buildProfile(layers, "15-30cm");
    const deep = buildProfile(layers, "60-100cm");

    const texture =
      subsoil.sandPct !== null && subsoil.siltPct !== null && subsoil.clayPct !== null
        ? textureClass(subsoil.sandPct, subsoil.siltPct, subsoil.clayPct)
        : undefined;

    return NextResponse.json({
      available: true,
      surface,
      subsoil,
      deep,
      texture,
      landslideRelevance: landslideRelevance(subsoil.clayPct, subsoil.sandPct),
      source: "ISRIC SoilGrids v2.0",
    } satisfies SoilPayload);
  } catch (error: any) {
    return NextResponse.json({ available: false, note: error.message } satisfies SoilPayload);
  }
}
