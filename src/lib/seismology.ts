/**
 * Earthquake shaking-intensity and post-event road-capacity estimates.
 *
 * Envis prefers real USGS products where they exist — ShakeMap publishes actual
 * MMI contour polygons, and PAGER publishes actual population exposure per MMI
 * band, for every M5.5+ event worldwide (see /api/earthquake-impact). This
 * module is the *fallback* used only when no ShakeMap has been generated yet,
 * or for the smaller events ShakeMap and PAGER don't cover.
 *
 * That fallback status matters for which formula belongs here. The published,
 * region-specific intensity prediction equations (Atkinson & Wald 2007 for
 * California/CEUS; Worden et al. 2012's ground-motion-to-intensity relations)
 * are calibrated regressions whose exact coefficients need the source paper in
 * hand to reproduce correctly — not something to approximate from memory for a
 * life-safety output. Instead this uses the general functional form the whole
 * family of intensity-attenuation equations shares — magnitude increases
 * intensity linearly, distance attenuates it logarithmically — going back to
 * Kövesligethy (1906) and Blake (1937), with a published, exactly-quotable
 * calibration (Musson, for the UK) as the default coefficients. It is
 * explicitly a generalised, uncalibrated-for-most-regions estimate, and every
 * output using it is flagged accordingly rather than presented as ShakeMap.
 */

/** Modified Mercalli Intensity band thresholds and what they mean for structures/roads. */
export interface MmiBand {
  mmi: number;
  label: string;
  description: string;
}

export const MMI_BANDS: MmiBand[] = [
  { mmi: 9, label: "IX — Violent", description: "General panic; considerable damage to substantial buildings, roads cracked" },
  { mmi: 8, label: "VIII — Severe", description: "Considerable damage to ordinary buildings; bridges and roads damaged" },
  { mmi: 7, label: "VII — Very strong", description: "Damage to poorly built structures; felt by drivers" },
  { mmi: 6, label: "VI — Strong", description: "Slight structural damage; felt by all, furniture moved" },
  { mmi: 5, label: "V — Moderate", description: "Felt by nearly everyone; some breakage, unstable objects overturned" },
];

/**
 * Kövesligethy/Blake-form intensity attenuation:
 *
 *   I = a + b*M - c*ln(D),   D = sqrt(R_epi^2 + h^2)   (hypocentral distance, km)
 *
 * Default coefficients (a=3.31, b=1.28, c=1.22) are Musson's calibration for
 * the UK — quoted here because they are a real, exactly-citable published
 * calibration of this functional form, not because the UK is the right region
 * for a global default. Regional attenuation varies (California, being more
 * attenuating per km than stable continental interiors, would show a steeper
 * fall-off), which is exactly why this is the fallback and not the primary
 * path — see /api/earthquake-impact's ShakeMap-first design.
 */
export interface IpeCoefficients {
  a: number;
  b: number;
  c: number;
}
export const MUSSON_UK_IPE: IpeCoefficients = { a: 3.31, b: 1.28, c: 1.22 };

export function mmiAtDistance(magnitude: number, epicentralDistanceKm: number, depthKm: number, coeffs: IpeCoefficients = MUSSON_UK_IPE): number {
  const d = Math.max(1, Math.hypot(epicentralDistanceKm, depthKm));
  const i = coeffs.a + coeffs.b * magnitude - coeffs.c * Math.log(d);
  return Math.max(0, i);
}

/**
 * Inverse of mmiAtDistance: the epicentral distance (km) at which shaking
 * falls to a target MMI, for a given magnitude and depth. Used to draw MMI
 * band rings from the centre outward when no ShakeMap contour exists.
 *
 *   I = a + b*M - c*ln(sqrt(R^2 + h^2))
 *   =>  R = sqrt(exp(2*(a + b*M - I)/c) - h^2)
 */
export function distanceForMmi(magnitude: number, targetMmi: number, depthKm: number, coeffs: IpeCoefficients = MUSSON_UK_IPE): number | null {
  const lnD = (coeffs.a + coeffs.b * magnitude - targetMmi) / coeffs.c;
  const d = Math.exp(lnD);
  const rSq = d * d - depthKm * depthKm;
  if (rSq <= 0) return null; // target intensity never reached, or only directly beneath the hypocentre
  return Math.sqrt(rSq);
}

/**
 * MMI bands (radius rings) for a modelled (non-ShakeMap) event, highest
 * intensity first. Only bands the shaking actually reaches are returned.
 */
export function modelledMmiBands(magnitude: number, depthKm: number, coeffs: IpeCoefficients = MUSSON_UK_IPE): { mmi: number; label: string; description: string; radiusKm: number }[] {
  const out: { mmi: number; label: string; description: string; radiusKm: number }[] = [];
  for (const band of MMI_BANDS) {
    const r = distanceForMmi(magnitude, band.mmi, depthKm, coeffs);
    if (r != null) out.push({ ...band, radiusKm: Number(r.toFixed(1)) });
  }
  return out;
}

/**
 * Post-earthquake road-capacity retention factor by MMI, applied to the base
 * lane capacities in evacuationCapacity.ts.
 *
 * Bridges are consistently identified as the primary source of seismic
 * transportation loss, and vulnerability escalates non-linearly with shaking:
 * network studies report roughly three-quarters of bridges taking some damage
 * and about a quarter reaching collapse thresholds under the most severe
 * modelled scenarios. This curve is a monotonic approximation of that
 * escalation shape (near-full capacity below MMI VI, halving by MMI VIII,
 * a fifth remaining at MMI X) rather than a fitted fragility function — a
 * specific bridge inventory's fragility curves would replace it if available,
 * but assuming *no* degradation at high MMI is the wrong direction to be
 * wrong in for a road-clearance estimate.
 */
/**
 * Latitude-corrected circular ring polygon, in GeoJSON [lng, lat][] coordinate
 * order. Same construction as MapDashboard.tsx's getCirclePolygon, duplicated
 * here (rather than imported) because that one lives in a client component and
 * this needs to run server-side in /api/earthquake-impact.
 */
export function ringPolygonKm(center: [number, number], radiusKm: number, points = 64): number[][] {
  const [lng, lat] = center;
  const distanceX = radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180));
  const distanceY = radiusKm / 110.574;
  const coords: number[][] = [];
  for (let i = 0; i < points; i++) {
    const theta = (i / points) * 2 * Math.PI;
    coords.push([lng + distanceX * Math.cos(theta), lat + distanceY * Math.sin(theta)]);
  }
  coords.push(coords[0]);
  return coords;
}

export function roadCapacityRetention(mmi: number): number {
  if (mmi < 6) return 1.0;
  if (mmi < 7) return 0.9;
  if (mmi < 8) return 0.7;
  if (mmi < 9) return 0.45;
  if (mmi < 10) return 0.25;
  return 0.15;
}
