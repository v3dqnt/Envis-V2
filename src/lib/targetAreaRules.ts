/**
 * Auto Jobs trigger rules — deliberately a small code table, not a
 * user-editable setting. Reuses the risk signals `deriveRisks()` already
 * computes in /api/weather-risk rather than inventing new thresholds:
 *
 *   - "heat": Heatwave's existing temp-anomaly logic (recent 30-day average vs
 *     10-year mean, >=3C medium / >=5C high) IS "temperature is too much."
 *   - "precip": Flooding's existing recent-vs-historical precipitation anomaly
 *     (recent monthly rate > 1.4x the historical monthly average) IS
 *     "precipitation more than the past few years." (Drought's threshold is
 *     the opposite direction — chronically low annual average — so it's not
 *     the right signal here.)
 *
 * Adding another pair later is one more entry in this array; nothing else
 * needs to change.
 */
export interface TargetAreaRule {
  id: string;
  /** Matches the `type` field on an entry in weather-risk's risks[]. */
  watchRiskType: string;
  /** Hazard pair to flag for review when this rule's risk type is present. */
  hazards: string[];
}

export const TARGET_AREA_RULES: TargetAreaRule[] = [
  { id: "heat", watchRiskType: "Heatwave", hazards: ["Heatwave", "Wildfire"] },
  { id: "precip", watchRiskType: "Flooding", hazards: ["Landslide", "Flash Flood"] },
];

export function ruleById(id: string): TargetAreaRule | undefined {
  return TARGET_AREA_RULES.find((r) => r.id === id);
}
