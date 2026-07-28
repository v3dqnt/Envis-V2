import { NextResponse } from "next/server";

/**
 * High-resolution terrain from the Copernicus DEM (30 m) via OpenTopography.
 *
 * Open-Meteo's elevation endpoint is convenient but coarse, which is why the
 * flash-flood module cannot measure how far an underpass sits below grade. The
 * Copernicus GLO-30 model resolves features an order of magnitude smaller, so
 * slope, local depressions and small scarps become measurable.
 *
 * Requires OPENTOPOGRAPHY_API_KEY (free: https://portal.opentopography.org/newUser).
 * Without it this route reports unavailable and callers keep using Open-Meteo.
 */

interface TerrainStats {
  minElevationM: number;
  maxElevationM: number;
  meanElevationM: number;
  reliefM: number;
  maxSlopePct: number;
  meanSlopePct: number;
  cellSizeM: number;
  gridWidth: number;
  gridHeight: number;
}

/** Parse an ESRI ASCII grid into a header plus a row-major elevation array. */
function parseAaiGrid(text: string): { header: Record<string, number>; values: number[][] } | null {
  const lines = text.trim().split("\n");
  const header: Record<string, number> = {};
  let row = 0;
  for (; row < lines.length; row++) {
    const parts = lines[row].trim().split(/\s+/);
    if (parts.length !== 2 || isNaN(Number(parts[1]))) break;
    header[parts[0].toLowerCase()] = Number(parts[1]);
  }
  if (!header.ncols || !header.nrows) return null;

  const values: number[][] = [];
  for (; row < lines.length; row++) {
    const nums = lines[row].trim().split(/\s+/).map(Number).filter((n) => !isNaN(n));
    if (nums.length > 0) values.push(nums);
  }
  return values.length > 0 ? { header, values } : null;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = parseFloat(searchParams.get("lat") || "");
  const lng = parseFloat(searchParams.get("lng") || "");
  const radiusKm = Math.min(Math.max(parseFloat(searchParams.get("radiusKm") || "3"), 0.5), 15);

  if (isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: "lat and lng are required" }, { status: 400 });
  }

  const key = process.env.OPENTOPOGRAPHY_API_KEY;
  if (!key) {
    return NextResponse.json({
      available: false,
      note: "OPENTOPOGRAPHY_API_KEY not configured. Falling back to Open-Meteo elevation, which is coarser.",
    });
  }

  const dLat = radiusKm / 111.32;
  const dLng = radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180));

  try {
    const url =
      `https://portal.opentopography.org/API/globaldem?demtype=COP30` +
      `&south=${(lat - dLat).toFixed(6)}&north=${(lat + dLat).toFixed(6)}` +
      `&west=${(lng - dLng).toFixed(6)}&east=${(lng + dLng).toFixed(6)}` +
      `&outputFormat=AAIGrid&API_Key=${key}`;

    const res = await fetch(url, { next: { revalidate: 604800 } });
    if (!res.ok) {
      return NextResponse.json({ available: false, note: `OpenTopography returned ${res.status}` });
    }
    const text = await res.text();
    if (text.trim().startsWith("<")) {
      return NextResponse.json({ available: false, note: "OpenTopography returned an error document" });
    }

    const parsed = parseAaiGrid(text);
    if (!parsed) {
      return NextResponse.json({ available: false, note: "Could not parse elevation grid" });
    }

    const { header, values } = parsed;
    const nodata = header.nodata_value ?? -9999;
    const cellDeg = header.cellsize ?? 0.000277778;
    const cellSizeM = cellDeg * 111320;

    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    let count = 0;
    for (const row of values) {
      for (const v of row) {
        if (v === nodata) continue;
        if (v < min) min = v;
        if (v > max) max = v;
        sum += v;
        count++;
      }
    }
    if (count === 0) {
      return NextResponse.json({ available: false, note: "Grid contained no valid elevation data" });
    }

    // Slope from the steepest of the four cardinal neighbours of each cell.
    let maxSlope = 0;
    let slopeSum = 0;
    let slopeCount = 0;
    for (let r = 1; r < values.length - 1; r++) {
      const row = values[r];
      for (let c = 1; c < row.length - 1; c++) {
        const centre = row[c];
        if (centre === nodata) continue;
        const neighbours = [values[r - 1]?.[c], values[r + 1]?.[c], row[c - 1], row[c + 1]];
        let drop = 0;
        for (const nb of neighbours) {
          if (typeof nb === "number" && nb !== nodata) drop = Math.max(drop, Math.abs(centre - nb));
        }
        const slopePct = (drop / cellSizeM) * 100;
        if (slopePct > maxSlope) maxSlope = slopePct;
        slopeSum += slopePct;
        slopeCount++;
      }
    }

    const stats: TerrainStats = {
      minElevationM: Number(min.toFixed(1)),
      maxElevationM: Number(max.toFixed(1)),
      meanElevationM: Number((sum / count).toFixed(1)),
      reliefM: Number((max - min).toFixed(1)),
      maxSlopePct: Number(maxSlope.toFixed(1)),
      meanSlopePct: Number((slopeCount ? slopeSum / slopeCount : 0).toFixed(1)),
      cellSizeM: Number(cellSizeM.toFixed(1)),
      gridWidth: header.ncols,
      gridHeight: header.nrows,
    };

    return NextResponse.json({
      available: true,
      ...stats,
      source: "Copernicus DEM GLO-30 via OpenTopography",
    });
  } catch (error: any) {
    return NextResponse.json({ available: false, note: error.message });
  }
}
