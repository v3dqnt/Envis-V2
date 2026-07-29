"use client";

import React, { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  AlertTriangle,
  Waves,
  Flame,
  Activity,
  Sparkles,
  Loader2,
  CheckCircle2,
  ShieldCheck,
  Wind,
  Mountain,
  Skull,
  Biohazard,
  Radiation,
  Snowflake,
  Thermometer,
  CloudRain,
  Zap,
  TrendingUp,
  Clock,
  ChevronDown,
  ChevronUp,
  Tornado,
  Sun,
  CloudLightning,
  ThermometerSnowflake,
  MountainSnow,
  MapPin,
  Navigation2,
  Download,
  Radio,
} from "lucide-react";
import type { WeatherRiskPayload } from "@/app/api/weather-risk/route";

interface SwitchProps {
  checked: boolean;
  onCheckedChange: () => void;
  disabled?: boolean;
}

function Switch({ checked, onCheckedChange, disabled }: SwitchProps) {
  return (
    <button
      type="button"
      onClick={onCheckedChange}
      disabled={disabled}
      className={`relative inline-flex h-5.5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-all duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-40 disabled:cursor-not-allowed ${
        checked ? "bg-emerald-600" : "bg-neutral-300/80"
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow-md ring-0 transition-all duration-300 ease-in-out ${
          checked ? "translate-x-4.5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

interface PreventionSidebarProps {
  hazardCenter: [number, number] | null;
  setHazardCenter: (c: [number, number] | null) => void;
  hazardRadius: number;
  setMapFlyToCoords: (c: [number, number] | null) => void;
  activeDefenses: string[];
  setActiveDefenses: (defenses: string[]) => void;
  densityPerKm2: number | null;
  cityName: string;
  gdacsEvents: any[];
  gdacsLoading: boolean;
  incidentType: string;
  setIncidentType: (type: string) => void;
  setVulnerabilityZones?: (zones: any) => void;
  setHazardPolygons?: (polys: any) => void;
  setHazardOrigins?: (origins: any) => void;
  setHazardPaths?: (paths: any) => void;
  showTemperatureHeatmap?: boolean;
  setShowTemperatureHeatmap?: (v: boolean) => void;
  temperatureHeatmapLoading?: boolean;
  onSendToEvacuation?: (hazardType: string, center: [number, number], radiusMeters: number) => void;
}

// Aegis Prevent only lists hazards that can actually be anticipated ahead of time,
// either from live numerical weather prediction or from climatological exposure.
// Industrial accidents (toxic plume, radiation leak, chemical spill) and geophysical
// events with no reliable forecast method (earthquake, volcanic eruption, tornado)
// are deliberately excluded — they are handled in Aegis Route, which is a response
// and evacuation tool rather than a prediction tool.
const HAZARD_TYPES = [
  "Wildfire", "Flooding", "Flash Flood", "Thunderstorm", "Tropical Cyclone",
  "Heatwave", "Drought", "Blizzard", "Ice Storm", "Extreme Cold", "Landslide",
];

const HAZARD_META: Record<string, { icon: React.ReactNode; color: string }> = {
  Wildfire: { icon: <Flame className="w-4 h-4" />, color: "text-orange-500" },
  Flooding: { icon: <Waves className="w-4 h-4" />, color: "text-blue-500" },
  "Flash Flood": { icon: <Waves className="w-4 h-4" />, color: "text-cyan-500" },
  "Ice Storm": { icon: <Snowflake className="w-4 h-4" />, color: "text-cyan-300" },
  "Toxic Plume": { icon: <Skull className="w-4 h-4" />, color: "text-green-500" },
  Earthquake: { icon: <Activity className="w-4 h-4" />, color: "text-amber-500" },
  Tornado: { icon: <Wind className="w-4 h-4" />, color: "text-teal-500" },
  "Radiation Leak": { icon: <Radiation className="w-4 h-4" />, color: "text-lime-500" },
  "Chemical Spill": { icon: <Biohazard className="w-4 h-4" />, color: "text-yellow-500" },
  Blizzard: { icon: <Snowflake className="w-4 h-4" />, color: "text-sky-400" },
  "Volcanic Eruption": { icon: <Mountain className="w-4 h-4" />, color: "text-rose-600" },
  "Tropical Cyclone": { icon: <Tornado className="w-4 h-4" />, color: "text-cyan-600" },
  Heatwave: { icon: <Thermometer className="w-4 h-4" />, color: "text-red-600" },
  Drought: { icon: <Sun className="w-4 h-4" />, color: "text-amber-500" },
  "Extreme Cold": { icon: <ThermometerSnowflake className="w-4 h-4" />, color: "text-blue-400" },
  Thunderstorm: { icon: <CloudLightning className="w-4 h-4" />, color: "text-indigo-500" },
  Landslide: { icon: <MountainSnow className="w-4 h-4" />, color: "text-stone-600" },
};

// Hazard types with a real climate-derived occurrence signal (deriveRisks() in
// weather-risk/route.ts scores these from 10 years of Open-Meteo data). Every other
// hazard type only gets a structural/terrain vulnerability audit — a "how bad would
// this be here" assessment, not an occurrence forecast. Earthquakes are the clearest
// example: they aren't weather-driven, so there is no predictive signal for them —
// "Analyze" runs OSM-based building/terrain vulnerability analysis only.
// Every hazard listed in Prevent is anticipatable, but by two different methods.
// FORECAST hazards come from live numerical weather prediction and carry an actual
// lead time in hours. The rest are climatological — they describe what this location
// is exposed to based on its history, without a specific onset time.
const FORECAST_HAZARDS: Record<string, string> = {
  Thunderstorm: "Thunderstorm",
  "Flash Flood": "Flash Flooding",
  "Ice Storm": "Ice Storm",
  Wildfire: "Fire Weather",
  Drought: "Drought Stress",
};

const CONFIDENCE_STYLES: Record<string, string> = {
  high: "bg-red-500/15 border-red-500/40 text-red-400",
  medium: "bg-orange-500/10 border-orange-500/30 text-orange-400",
  low: "bg-yellow-500/10 border-yellow-500/30 text-yellow-400",
};

// Maps weather risk types to hazard rows (all now 1:1 with dedicated hazard types)
const RISK_TO_INCIDENT: Record<string, string> = {
  Flooding: "Flooding",
  Wildfire: "Wildfire",
  Blizzard: "Blizzard",
  "Tropical Cyclone": "Tropical Cyclone",
  Drought: "Drought",
  "Extreme Cold": "Extreme Cold",
  Heatwave: "Heatwave",
  Thunderstorm: "Thunderstorm",
};

// Hazards with a real physical polygon model in /api/hazard-zones (OSM geometry +
// elevation + weather). Everything else falls back to AI-estimated circular zones.
const POLYGON_MODELLED = new Set(["Wildfire", "Flooding", "Landslide", "Thunderstorm", "Tropical Cyclone"]);

interface HazardAnalysis {
  loading: boolean;
  analyzed: boolean;
  error: string | null;
  zones: any[];
  polygons: any[];
  zoneSource: "polygon" | "ai" | null;
  origin: [number, number] | null;
  path: [number, number][] | null;
  strategyMarkdown: string;
  checklist: string[];
  metrics: { infrastructure: number; residential: number; evacuationReadiness: number } | null;
}

function getDistanceKm(a: [number, number], b: [number, number]): number {
  const [lon1, lat1] = a;
  const [lon2, lat2] = b;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

// Destination point given a start coordinate, bearing (deg) and distance (km) — used to draw
// the wildfire spread-direction line from real wind data.
function destinationPoint(start: [number, number], bearingDeg: number, distKm: number): [number, number] {
  const R = 6371;
  const bearing = (bearingDeg * Math.PI) / 180;
  const lat1 = (start[1] * Math.PI) / 180;
  const lng1 = (start[0] * Math.PI) / 180;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(distKm / R) + Math.cos(lat1) * Math.sin(distKm / R) * Math.cos(bearing));
  const lng2 = lng1 + Math.atan2(
    Math.sin(bearing) * Math.sin(distKm / R) * Math.cos(lat1),
    Math.cos(distKm / R) - Math.sin(lat1) * Math.sin(lat2)
  );
  return [(lng2 * 180) / Math.PI, (lat2 * 180) / Math.PI];
}

/** Centroid + bounding box of a GeoJSON polygon ring, for coordinate export. */
function ringGeometry(ring: number[][]) {
  let sx = 0;
  let sy = 0;
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  const n = ring.length - 1; // last point repeats the first
  for (let i = 0; i < n; i++) {
    const [lng, lat] = ring[i];
    sx += lng;
    sy += lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return {
    centroid: [sx / n, sy / n] as [number, number],
    bbox: [minLng, minLat, maxLng, maxLat] as [number, number, number, number],
    vertices: n,
  };
}

const fmt = (n: number, dp = 5) => n.toFixed(dp);

/** Furthest zone vertex from the target point, in metres — used as the impacted-area
 * radius when handing a hazard off to Aegis Route. Falls back to a sensible default
 * when a hazard has no polygon/AI zones (e.g. climatology-only hazards). */
function estimateImpactRadiusM(center: [number, number], analysis: HazardAnalysis | undefined): number {
  const DEFAULT_M = 2500;
  if (!analysis) return DEFAULT_M;
  const allFeatures = [...(analysis.polygons || []), ...(analysis.zones || [])];
  if (allFeatures.length === 0) return DEFAULT_M;

  let maxKm = 0;
  for (const f of allFeatures) {
    const ring = f?.geometry?.coordinates?.[0];
    if (!Array.isArray(ring)) continue;
    for (const pt of ring) {
      if (!Array.isArray(pt) || pt.length < 2) continue;
      const d = getDistanceKm(center, [pt[0], pt[1]]);
      if (d > maxKm) maxKm = d;
    }
  }
  if (maxKm === 0) return DEFAULT_M;
  return Math.min(Math.max(maxKm * 1000 * 1.15, 800), 15000);
}

/** Build a self-contained markdown report of every analyzed hazard and its coordinates. */
function buildMarkdownReport(
  cityName: string,
  hazardCenter: [number, number],
  analyses: Record<string, HazardAnalysis>,
  visible: Set<string>,
  weatherRisk: WeatherRiskPayload | null,
  satelliteFire: any,
  airQuality: any,
  forecast: any
): string {
  const now = new Date().toISOString();
  const lines: string[] = [];

  lines.push(`# Aegis Prevent — Hazard Analysis Report`);
  lines.push("");
  lines.push(`**Target location:** ${cityName || "Unnamed location"}`);
  lines.push(`**Coordinates:** \`${fmt(hazardCenter[1])}, ${fmt(hazardCenter[0])}\` (lat, lng)`);
  lines.push(`**Generated:** ${now}`);
  lines.push(`**Source:** Envis Aegis — OpenStreetMap geometry, Open-Meteo climate & elevation, GDACS/USGS live feeds`);
  lines.push("");

  // Climate context
  if (weatherRisk) {
    lines.push(`## Climate context`);
    lines.push("");
    lines.push(`Based on a ${weatherRisk.historical.yearsAnalyzed}-year archive (${weatherRisk.historical.startYear}–${weatherRisk.historical.endYear}).`);
    lines.push("");
    lines.push(`| Metric | Historical | Recent (${weatherRisk.recent.days}d) |`);
    lines.push(`|---|---|---|`);
    lines.push(`| Peak daily rainfall | ${weatherRisk.historical.maxDailyPrecipMm.toFixed(0)} mm | ${weatherRisk.recent.totalPrecipMm.toFixed(0)} mm total |`);
    lines.push(`| Max temperature | ${weatherRisk.historical.maxTempC.toFixed(1)} °C | ${weatherRisk.recent.maxTempC.toFixed(1)} °C |`);
    lines.push(`| Min temperature | ${weatherRisk.historical.minTempC.toFixed(1)} °C | ${weatherRisk.recent.minTempC.toFixed(1)} °C |`);
    lines.push(`| Max wind | ${weatherRisk.historical.maxWindKmh.toFixed(0)} km/h | ${weatherRisk.recent.maxWindKmh.toFixed(0)} km/h |`);
    lines.push(`| Annual avg precipitation | ${weatherRisk.historical.annualAvgPrecipMm.toFixed(0)} mm/yr | — |`);
    lines.push("");

    if (weatherRisk.risks.length > 0) {
      lines.push(`### Climate-derived risk signals`);
      lines.push("");
      for (const r of weatherRisk.risks) {
        lines.push(`- **${r.type}** (${r.confidence} confidence) — ${r.historicalBasis}${r.recentSignal ? `. Recent signal: ${r.recentSignal}` : ""}`);
      }
      lines.push("");
    }
  }

  // 72h numerical weather forecast
  if (forecast?.forecasts?.length) {
    lines.push(`## 72-hour forecast`);
    lines.push("");
    lines.push(`Model: ${forecast.model}. Horizon: ${forecast.window}.`);
    if (forecast.soilMoisture) {
      lines.push("");
      lines.push(`**Soil moisture:** surface ${forecast.soilMoisture.surface}, root zone ${forecast.soilMoisture.rootZone}, deep ${forecast.soilMoisture.deep} m³/m³ — ${forecast.soilMoisture.interpretation}`);
    }
    lines.push("");
    for (const f of forecast.forecasts) {
      lines.push(`### ${f.hazard}${f.compound ? " (compound risk)" : ""}`);
      lines.push("");
      lines.push(`- **Risk score:** ${(f.riskScore * 100).toFixed(0)}% (${f.confidence} confidence)`);
      if (f.leadTimeHours !== null) lines.push(`- **Onset:** ~${f.leadTimeHours} hours from now`);
      if (f.peakTimeIso) lines.push(`- **Peak:** ${f.peakTimeIso}`);
      lines.push(`- **Recommended action:** ${f.action}`);
      lines.push("");
      lines.push(`| Driver | Value | Interpretation |`);
      lines.push(`|---|---|---|`);
      for (const dr of f.drivers || []) {
        lines.push(`| ${dr.label} | ${dr.value} | ${dr.meaning} |`);
      }
      lines.push("");
    }
  }

  // Live sensor context
  const sensorLines: string[] = [];
  if (satelliteFire?.available) {
    sensorLines.push(
      satelliteFire.hotspotCount > 0
        ? `- **NASA FIRMS satellite:** ${satelliteFire.hotspotCount} active fire hotspot(s) within 50 km, nearest ${satelliteFire.nearestDistanceKm.toFixed(1)} km`
        : `- **NASA FIRMS satellite:** no active fire hotspots within 50 km (last 24h)`
    );
  }
  if (airQuality?.available) {
    sensorLines.push(
      `- **OpenAQ ground sensor** (${airQuality.stationName}, ${airQuality.distanceKm?.toFixed(1)} km): ${airQuality.parameter.toUpperCase()} ${airQuality.value} ${airQuality.units}${airQuality.category ? ` — ${airQuality.category}` : ""}`
    );
  }
  if (sensorLines.length) {
    lines.push(`## Live sensor readings`);
    lines.push("");
    lines.push(...sensorLines);
    lines.push("");
  }

  const analyzed = Object.entries(analyses).filter(([, a]) => a?.analyzed);
  if (analyzed.length === 0) {
    lines.push(`_No hazards analyzed yet._`);
    return lines.join("\n");
  }

  lines.push(`## Summary`);
  lines.push("");
  lines.push(`| Hazard | Zone type | Zones | Shown on map |`);
  lines.push(`|---|---|---|---|`);
  for (const [type, a] of analyzed) {
    const count = a.zoneSource === "polygon" ? a.polygons.length : a.zones.length;
    const kind = a.zoneSource === "polygon" ? "Real map polygons" : "AI-estimated";
    lines.push(`| ${type} | ${kind} | ${count} | ${visible.has(type) ? "yes" : "no"} |`);
  }
  lines.push("");

  // Per-hazard detail
  for (const [type, a] of analyzed) {
    lines.push(`---`);
    lines.push("");
    lines.push(`## ${type}`);
    lines.push("");

    if (FORECAST_HAZARDS[type]) {
      lines.push(`> **Method:** live numerical weather forecast — carries a specific onset lead time, see the 72-hour forecast section above.`);
    } else {
      lines.push(`> **Method:** climatological exposure — derived from this location's multi-year weather history and terrain. Indicates what the area is exposed to, not a specific onset time.`);
    }
    lines.push("");

    if (a.origin) {
      lines.push(`**Origin point:** \`${fmt(a.origin[1])}, ${fmt(a.origin[0])}\` (lat, lng)`);
      lines.push("");
    }
    if (a.path && a.path.length >= 2) {
      const [from, to] = [a.path[0], a.path[a.path.length - 1]];
      lines.push(`**Projected spread path** (from live wind direction): \`${fmt(from[1])}, ${fmt(from[0])}\` → \`${fmt(to[1])}, ${fmt(to[0])}\``);
      lines.push("");
    }
    if (a.metrics) {
      lines.push(`**Vulnerability scores:** infrastructure ${a.metrics.infrastructure}%, residential ${a.metrics.residential}%, evacuation bottleneck ${a.metrics.evacuationReadiness}%`);
      lines.push("");
    }

    // Zone coordinate tables
    if (a.zoneSource === "polygon" && a.polygons.length > 0) {
      lines.push(`### Identified areas — ${a.polygons.length} real map polygons`);
      lines.push("");
      lines.push(`Derived from OpenStreetMap geometry combined with elevation and weather data. Bounding box is \`minLng, minLat, maxLng, maxLat\`.`);
      lines.push("");
      lines.push(`| # | Severity | Name | Centroid (lat, lng) | Bounding box | Area km² | Basis |`);
      lines.push(`|---|---|---|---|---|---|---|`);
      a.polygons.forEach((f: any, i: number) => {
        const ring = f.geometry?.coordinates?.[0];
        if (!ring) return;
        const g = ringGeometry(ring);
        const p = f.properties || {};
        lines.push(
          `| ${i + 1} | ${p.severity ?? "—"} | ${p.name ?? "—"} | \`${fmt(g.centroid[1])}, ${fmt(g.centroid[0])}\` | \`${g.bbox.map((v) => fmt(v, 4)).join(", ")}\` | ${p.areaKm2 ?? "—"} | ${(p.reason ?? "").replace(/\|/g, "/")} |`
        );
      });
      lines.push("");
    } else if (a.zones.length > 0) {
      lines.push(`### Identified areas — ${a.zones.length} AI-estimated zones`);
      lines.push("");
      lines.push(`No physical polygon model exists for this hazard; these are AI-estimated circular zones (centre + radius).`);
      lines.push("");
      lines.push(`| # | Severity | Centre (lat, lng) | Radius km | Basis |`);
      lines.push(`|---|---|---|---|---|`);
      a.zones.forEach((f: any, i: number) => {
        const c = f.geometry?.coordinates;
        const p = f.properties || {};
        if (!c) return;
        lines.push(
          `| ${i + 1} | ${p.severity ?? "—"} | \`${fmt(c[1])}, ${fmt(c[0])}\` | ${p.radius_km ?? "—"} | ${(p.reason ?? "").replace(/\|/g, "/")} |`
        );
      });
      lines.push("");
    }

    if (a.checklist.length > 0) {
      lines.push(`### Recommended actions`);
      lines.push("");
      a.checklist.forEach((item) => lines.push(`- [ ] ${item}`));
      lines.push("");
    }
    if (a.strategyMarkdown) {
      lines.push(`### Mitigation strategy`);
      lines.push("");
      lines.push(a.strategyMarkdown.trim());
      lines.push("");
    }
  }

  lines.push(`---`);
  lines.push("");
  lines.push(`_Data: OpenStreetMap (ODbL) · Open-Meteo · GDACS · USGS · NASA FIRMS · OpenAQ. Generated by Envis Aegis Prevent._`);

  return lines.join("\n");
}

export default function PreventionSidebar({
  hazardCenter,
  setHazardCenter,
  setMapFlyToCoords,
  activeDefenses,
  densityPerKm2,
  cityName,
  gdacsEvents,
  incidentType,
  setVulnerabilityZones,
  setHazardPolygons,
  setHazardOrigins,
  setHazardPaths,
  showTemperatureHeatmap = false,
  setShowTemperatureHeatmap,
  temperatureHeatmapLoading = false,
  onSendToEvacuation,
}: PreventionSidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);

  // Weather risk state
  const [weatherRisk, setWeatherRisk] = useState<WeatherRiskPayload | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState(false);
  const [showHistorical, setShowHistorical] = useState(false);

  // Satellite fire (NASA FIRMS) + ground air-quality sensor state
  const [satelliteFire, setSatelliteFire] = useState<any>(null);
  const [airQuality, setAirQuality] = useState<any>(null);

  // 72h numerical-weather forecast (CAPE, soil moisture, VPD, freezing level)
  const [forecast, setForecast] = useState<any>(null);
  const [forecastLoading, setForecastLoading] = useState(false);

  // Multi-hazard toggle state — one analysis slot per hazard type, independently triggered
  const [hazardAnalyses, setHazardAnalyses] = useState<Record<string, HazardAnalysis>>({});
  // Per-hazard "Publish Alert" button state — tracks in-flight/success/error independently
  const [publishStatus, setPublishStatus] = useState<Record<string, "idle" | "loading" | "done" | "error">>({});
  const [visibleHazards, setVisibleHazards] = useState<Set<string>>(new Set());
  const [expandedHazard, setExpandedHazard] = useState<string | null>(null);

  // Fetch satellite fire hotspots + air-quality sensor data whenever hazardCenter changes
  useEffect(() => {
    if (!hazardCenter) {
      setSatelliteFire(null);
      setAirQuality(null);
      return;
    }
    const [lng, lat] = hazardCenter;

    fetch(`/api/satellite-fire?lat=${lat}&lng=${lng}&radiusKm=50`)
      .then((res) => (res.ok ? res.json() : null))
      .then(setSatelliteFire)
      .catch(() => setSatelliteFire(null));

    fetch(`/api/air-quality?lat=${lat}&lng=${lng}`)
      .then((res) => (res.ok ? res.json() : null))
      .then(setAirQuality)
      .catch(() => setAirQuality(null));

    setForecastLoading(true);
    setForecast(null);
    fetch(`/api/forecast-risk?lat=${lat}&lng=${lng}`)
      .then((res) => (res.ok ? res.json() : null))
      .then(setForecast)
      .catch(() => setForecast(null))
      .finally(() => setForecastLoading(false));
  }, [hazardCenter]);

  // Fetch weather risk whenever hazardCenter changes
  useEffect(() => {
    if (!hazardCenter) {
      setWeatherRisk(null);
      setWeatherError(false);
      return;
    }

    const [lng, lat] = hazardCenter;

    const fetchWeatherRisk = async () => {
      setWeatherLoading(true);
      setWeatherError(false);
      setWeatherRisk(null);
      try {
        const params = new URLSearchParams({
          lat: lat.toString(),
          lng: lng.toString(),
          city: cityName || "Unknown",
        });
        const res = await fetch(`/api/weather-risk?${params}`);
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data: WeatherRiskPayload = await res.json();
        setWeatherRisk(data);
      } catch {
        setWeatherError(true);
      } finally {
        setWeatherLoading(false);
      }
    };

    fetchWeatherRisk();
  }, [hazardCenter, cityName]);

  // New target location invalidates all prior per-hazard analyses
  useEffect(() => {
    setHazardAnalyses({});
    setVisibleHazards(new Set());
    setExpandedHazard(null);
  }, [hazardCenter]);

  // Resolve a hazard's real-world origin: nearest live GDACS/Tomorrow.io/XWeather event of
  // the same type within 500km, else fall back to the user-set target point.
  const resolveOrigin = (hazardType: string): [number, number] | null => {
    if (!hazardCenter) return null;
    const candidates = gdacsEvents.filter((e) => e.type === hazardType && Array.isArray(e.coordinates));
    if (candidates.length > 0) {
      let nearest = candidates[0];
      let nearestDist = getDistanceKm(hazardCenter, nearest.coordinates);
      for (const c of candidates.slice(1)) {
        const d = getDistanceKm(hazardCenter, c.coordinates);
        if (d < nearestDist) {
          nearest = c;
          nearestDist = d;
        }
      }
      if (nearestDist < 500) return nearest.coordinates;
    }
    return hazardCenter;
  };

  const analyzeHazard = async (hazardType: string) => {
    if (!hazardCenter) return;
    setHazardAnalyses((prev) => ({
      ...prev,
      [hazardType]: { ...(prev[hazardType] as HazardAnalysis), loading: true, error: null, analyzed: prev[hazardType]?.analyzed || false, zones: prev[hazardType]?.zones || [], polygons: prev[hazardType]?.polygons || [], zoneSource: prev[hazardType]?.zoneSource || null, origin: prev[hazardType]?.origin || null, path: prev[hazardType]?.path || null, strategyMarkdown: prev[hazardType]?.strategyMarkdown || "", checklist: prev[hazardType]?.checklist || [], metrics: prev[hazardType]?.metrics || null },
    }));

    const origin = resolveOrigin(hazardType);
    const usePolygons = POLYGON_MODELLED.has(hazardType);

    try {
      const [polyRes, vulnRes, prevRes] = await Promise.all([
        usePolygons
          ? fetch("/api/hazard-zones", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                lat: hazardCenter[1],
                lng: hazardCenter[0],
                hazardType,
                radiusKm: 12,
              }),
            })
          : Promise.resolve(null),
        fetch("/api/vulnerability-zones", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lat: hazardCenter[1],
            lng: hazardCenter[0],
            disasterType: hazardType,
            cityName: cityName || "Local Area",
            radiusKm: 5,
          }),
        }),
        fetch("/api/prevention", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            incidentType: hazardType,
            cityName: cityName || "Local Area",
            activeDefenses,
            densityPerKm2: densityPerKm2 || 5000,
            weatherRisk: weatherRisk || null,
            satelliteFire: satelliteFire || null,
            airQuality: airQuality || null,
          }),
        }),
      ]);

      const polyData = polyRes && polyRes.ok ? await polyRes.json() : null;
      const polygons = (polyData?.zones || []).map((z: any) => ({
        ...z,
        properties: { ...z.properties, hazardType },
      }));

      const vulnData = vulnRes.ok ? await vulnRes.json() : { zones: [] };
      // Real polygons win when we have them; AI circles are the fallback only.
      const zones = polygons.length > 0
        ? []
        : (vulnData.zones || []).map((z: any) => ({
            ...z,
            properties: { ...z.properties, hazardType },
          }));

      const prevData = prevRes.ok ? await prevRes.json() : {};

      let path: [number, number][] | null = null;
      if (hazardType === "Wildfire" && origin && weatherRisk?.currentWindDirectionDeg != null) {
        const spreadBearing = (weatherRisk.currentWindDirectionDeg + 180) % 360;
        path = [origin, destinationPoint(origin, spreadBearing, 8)];
      }

      setHazardAnalyses((prev) => ({
        ...prev,
        [hazardType]: {
          loading: false,
          analyzed: true,
          error: null,
          zones,
          polygons,
          zoneSource: polygons.length > 0 ? "polygon" : "ai",
          origin,
          path,
          strategyMarkdown: prevData.strategyMarkdown || "",
          checklist: prevData.checklist || [],
          metrics: prevData.vulnerabilityMetrics || null,
        },
      }));
      setVisibleHazards((prev) => new Set(prev).add(hazardType));
    } catch (err) {
      console.error(`Failed to analyze ${hazardType}:`, err);
      setHazardAnalyses((prev) => ({
        ...prev,
        [hazardType]: { ...(prev[hazardType] as HazardAnalysis), loading: false, error: "Analysis failed" },
      }));
    }
  };

  const toggleVisibility = (hazardType: string) => {
    setVisibleHazards((prev) => {
      const next = new Set(prev);
      if (next.has(hazardType)) next.delete(hazardType);
      else next.add(hazardType);
      return next;
    });
  };

  // Auto-analyze when an external source (e.g. clicking a live event in the right-hand feed)
  // changes the selected incident type at an already-set target location.
  const prevIncidentTypeRef = useRef(incidentType);
  useEffect(() => {
    if (incidentType !== prevIncidentTypeRef.current && hazardCenter && HAZARD_TYPES.includes(incidentType)) {
      analyzeHazard(incidentType);
    }
    prevIncidentTypeRef.current = incidentType;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incidentType, hazardCenter]);

  // Aggregate visible + analyzed hazards into the map's FeatureCollections
  useEffect(() => {
    const zoneFeatures: any[] = [];
    const polygonFeatures: any[] = [];
    const originFeatures: any[] = [];
    const pathFeatures: any[] = [];

    visibleHazards.forEach((type) => {
      const a = hazardAnalyses[type];
      if (!a || !a.analyzed) return;
      zoneFeatures.push(...a.zones);
      polygonFeatures.push(...(a.polygons || []));
      if (a.origin) {
        originFeatures.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: a.origin },
          properties: { hazardType: type },
        });
      }
      if (a.path) {
        pathFeatures.push({
          type: "Feature",
          geometry: { type: "LineString", coordinates: a.path },
          properties: { hazardType: type },
        });
      }
    });

    setVulnerabilityZones?.(zoneFeatures.length ? { type: "FeatureCollection", features: zoneFeatures } : null);
    setHazardPolygons?.(polygonFeatures.length ? { type: "FeatureCollection", features: polygonFeatures } : null);
    setHazardOrigins?.(originFeatures.length ? { type: "FeatureCollection", features: originFeatures } : null);
    setHazardPaths?.(pathFeatures.length ? { type: "FeatureCollection", features: pathFeatures } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hazardAnalyses, visibleHazards]);

  const analyzedCount = Object.values(hazardAnalyses).filter((a) => a?.analyzed).length;

  const handleExportMarkdown = () => {
    if (!hazardCenter) return;
    const md = buildMarkdownReport(
      cityName,
      hazardCenter,
      hazardAnalyses,
      visibleHazards,
      weatherRisk,
      satelliteFire,
      airQuality,
      forecast
    );
    const slug = (cityName || "location").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const date = new Date().toISOString().split("T")[0];
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aegis-hazard-report-${slug}-${date}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Push an analyzed hazard into the Supabase alerts table so registered mobile
  // devices near the impacted area (or near a saved commute point) pick it up
  // on their next /api/alerts/feed poll. Severity/method/lead-time come from
  // the 72h forecast when this hazard has one; otherwise from the analysis's
  // vulnerability metrics, since climatology-only hazards have no lead time.
  const handlePublishAlert = async (hazardType: string) => {
    if (!hazardCenter) return;
    const analysis = hazardAnalyses[hazardType];
    if (!analysis?.analyzed) return;

    setPublishStatus((prev) => ({ ...prev, [hazardType]: "loading" }));

    const forecastKey = FORECAST_HAZARDS[hazardType];
    const forecastEntry = forecastKey ? (forecast?.forecasts || []).find((f: any) => f.hazard === forecastKey) : null;

    const severity: "low" | "medium" | "high" = forecastEntry
      ? forecastEntry.confidence
      : (analysis.metrics?.infrastructure ?? 0) > 60
      ? "high"
      : (analysis.metrics?.infrastructure ?? 0) > 30
      ? "medium"
      : "low";

    const radiusM = estimateImpactRadiusM(hazardCenter, analysis);
    const topPolygon = analysis.polygons?.[0]?.geometry?.coordinates?.[0] ?? null;

    const title = `${hazardType} risk near ${cityName || "your area"}`;
    const message = forecastEntry
      ? forecastEntry.action
      : analysis.checklist?.[0] || `${hazardType} exposure identified for this location — see Aegis Prevent for details.`;

    try {
      const res = await fetch("/api/alerts/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hazardType,
          severity,
          source: forecastEntry ? "forecast" : analysis.zoneSource === "polygon" ? "polygon" : "manual",
          title,
          message,
          method: forecastEntry?.method || null,
          riskScore: forecastEntry?.riskScore ?? null,
          leadTimeHours: forecastEntry?.leadTimeHours ?? null,
          lat: hazardCenter[1],
          lng: hazardCenter[0],
          radiusM,
          impactAreaRing: topPolygon,
          cityName: cityName || null,
          rawPayload: { checklist: analysis.checklist, metrics: analysis.metrics },
        }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      setPublishStatus((prev) => ({ ...prev, [hazardType]: "done" }));
    } catch (err) {
      console.error(`Failed to publish alert for ${hazardType}:`, err);
      setPublishStatus((prev) => ({ ...prev, [hazardType]: "error" }));
    }
  };

  const handleGeocode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearchLoading(true);
    try {
      const mapTilerKey = process.env.NEXT_PUBLIC_MAPTILER_API_KEY || "get_your_own_OpIi9ZULNHzrESv6T2vL";
      const res = await fetch(
        `https://api.maptiler.com/geocoding/${encodeURIComponent(searchQuery)}.json?key=${mapTilerKey}`
      );
      if (res.ok) {
        const data = await res.json();
        if (data.features && data.features.length > 0) {
          const coords = data.features[0].center;
          setHazardCenter(coords);
          setMapFlyToCoords(coords);
        }
      }
    } catch (err) {
      console.error("Geocoding failed:", err);
    } finally {
      setSearchLoading(false);
    }
  };

  return (
    <div className="absolute top-4 left-4 z-10 w-[27rem] flex flex-col gap-4 max-h-[calc(100vh-2rem)] overflow-y-auto">
      <Card className="shadow-2xl border-0 bg-white/90 backdrop-blur-xl supports-[backdrop-filter]:bg-white/70 rounded-2xl overflow-hidden shrink-0">
        <CardHeader className="pb-4 border-b border-neutral-100 bg-neutral-50/50">
          <CardTitle className="text-2xl font-black tracking-tight flex items-center gap-2 text-neutral-800">
            <ShieldCheck className="w-7 h-7 text-emerald-500" />
            Aegis Prevent
          </CardTitle>
          <CardDescription className="text-neutral-500 font-semibold">
            Multi-hazard climate risk analysis — toggle any threat, analyze independently
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-4 space-y-4">
          {/* Geocoding */}
          <form onSubmit={handleGeocode} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="audit-loc" className="font-bold text-neutral-700">Target Location</Label>
              <div className="flex gap-2">
                <Input
                  id="audit-loc"
                  placeholder="e.g. San Francisco, CA"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-white border-neutral-200 focus-visible:ring-emerald-500 rounded-xl flex-grow font-semibold"
                />
                <Button
                  type="submit"
                  disabled={searchLoading}
                  className="bg-neutral-800 hover:bg-neutral-900 text-white font-bold rounded-xl px-4 shrink-0"
                >
                  {searchLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Set Target"}
                </Button>
              </div>
            </div>
          </form>

          {/* Weather Risk Analysis — shown once hazardCenter is set */}
          {(weatherLoading || weatherRisk || weatherError) && (
            <div className="rounded-xl border border-neutral-800 bg-neutral-900 text-white overflow-hidden">
              <div className="px-3.5 py-2.5 border-b border-neutral-800 flex items-center justify-between">
                <h4 className="text-[10px] font-black uppercase tracking-wider text-neutral-300 flex items-center gap-1.5">
                  <CloudRain className="w-3.5 h-3.5 text-sky-400" />
                  Climate Risk Analysis
                  {weatherRisk && (
                    <span className="text-[9px] font-semibold text-neutral-500 normal-case tracking-normal">
                      · {weatherRisk.historical.yearsAnalyzed}yr archive
                    </span>
                  )}
                </h4>
                {weatherLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-400" />}
              </div>

              {weatherLoading ? (
                <div className="px-3.5 py-5 flex flex-col items-center gap-2 text-neutral-400">
                  <Loader2 className="w-5 h-5 animate-spin text-sky-400" />
                  <span className="text-[11px] font-bold animate-pulse">
                    Fetching {cityName || "location"} climate archive…
                  </span>
                  <span className="text-[10px] text-neutral-500 text-center">
                    Pulling 10 years of Open-Meteo weather data
                  </span>
                </div>
              ) : weatherError ? (
                <div className="px-3.5 py-4 text-[11px] text-neutral-500 italic text-center">
                  Climate data unavailable for this location.
                </div>
              ) : weatherRisk ? (
                <div className="p-3.5 space-y-3">
                  {/* Detected risk cards — click to instantly toggle + analyze that hazard */}
                  {weatherRisk.risks.length === 0 ? (
                    <p className="text-[11px] text-neutral-400 italic">No statistically significant climate risks detected.</p>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-[9px] font-black text-neutral-500 uppercase tracking-wider">
                        Detected Disaster Risks · click to analyze
                      </p>
                      {weatherRisk.risks.map((risk, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => {
                            const mapped = RISK_TO_INCIDENT[risk.type];
                            if (mapped) analyzeHazard(mapped);
                          }}
                          className={`w-full p-2.5 rounded-xl border text-left transition-all hover:brightness-125 ${CONFIDENCE_STYLES[risk.confidence] || "border-neutral-700 text-neutral-400"}`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <div className="flex items-center gap-1.5 font-black text-[11px]">
                              {HAZARD_META[RISK_TO_INCIDENT[risk.type]]?.icon || <AlertTriangle className="w-3.5 h-3.5" />}
                              {risk.type}
                            </div>
                            <span className={`text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${CONFIDENCE_STYLES[risk.confidence]}`}>
                              {risk.confidence}
                            </span>
                          </div>
                          <p className="text-[10px] leading-snug opacity-80 font-medium">
                            {risk.historicalBasis}
                          </p>
                          {risk.recentSignal && (
                            <div className="mt-1.5 flex items-start gap-1 text-[9px] font-bold opacity-90">
                              <TrendingUp className="w-3 h-3 shrink-0 mt-0.5" />
                              <span>{risk.recentSignal}</span>
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Expandable historical vs recent comparison */}
                  <button
                    type="button"
                    onClick={() => setShowHistorical((v) => !v)}
                    className="w-full flex items-center justify-between text-[10px] font-bold text-neutral-400 hover:text-neutral-200 transition-colors pt-1 border-t border-neutral-800"
                  >
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3 h-3" />
                      Historical vs Recent Comparison
                    </span>
                    {showHistorical ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>

                  {showHistorical && (
                    <div className="space-y-2 pt-1">
                      <div className="grid grid-cols-2 gap-2 text-[10px]">
                        <div className="p-2 bg-neutral-950/50 rounded-lg border border-neutral-800 space-y-1.5">
                          <p className="font-black text-neutral-300 text-[9px] uppercase tracking-wider">
                            Historical ({weatherRisk.historical.startYear}–{weatherRisk.historical.endYear})
                          </p>
                          <div className="space-y-1 text-neutral-400 font-semibold">
                            <div className="flex justify-between">
                              <span className="flex items-center gap-1"><CloudRain className="w-2.5 h-2.5 text-blue-400" />Peak rain</span>
                              <span className="text-white font-bold">{weatherRisk.historical.maxDailyPrecipMm.toFixed(0)}mm</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="flex items-center gap-1"><Thermometer className="w-2.5 h-2.5 text-red-400" />Max temp</span>
                              <span className="text-white font-bold">{weatherRisk.historical.maxTempC.toFixed(1)}°C</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="flex items-center gap-1"><Thermometer className="w-2.5 h-2.5 text-sky-400" />Min temp</span>
                              <span className="text-white font-bold">{weatherRisk.historical.minTempC.toFixed(1)}°C</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="flex items-center gap-1"><Zap className="w-2.5 h-2.5 text-yellow-400" />Max wind</span>
                              <span className="text-white font-bold">{weatherRisk.historical.maxWindKmh.toFixed(0)} km/h</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="flex items-center gap-1"><Snowflake className="w-2.5 h-2.5 text-cyan-400" />Max snow</span>
                              <span className="text-white font-bold">{weatherRisk.historical.maxDailySnowCm.toFixed(0)}cm</span>
                            </div>
                            <div className="flex justify-between border-t border-neutral-800 pt-1 mt-1">
                              <span className="flex items-center gap-1"><CloudRain className="w-2.5 h-2.5 text-neutral-400" />Avg/year</span>
                              <span className="text-white font-bold">{weatherRisk.historical.annualAvgPrecipMm.toFixed(0)}mm</span>
                            </div>
                          </div>
                        </div>

                        <div className="p-2 bg-neutral-950/50 rounded-lg border border-emerald-900/40 space-y-1.5">
                          <p className="font-black text-emerald-300 text-[9px] uppercase tracking-wider">
                            Recent {weatherRisk.recent.days} Days
                          </p>
                          <div className="space-y-1 text-neutral-400 font-semibold">
                            <div className="flex justify-between">
                              <span className="flex items-center gap-1"><CloudRain className="w-2.5 h-2.5 text-blue-400" />Precip</span>
                              <span className="text-white font-bold">{weatherRisk.recent.totalPrecipMm.toFixed(0)}mm</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="flex items-center gap-1"><Thermometer className="w-2.5 h-2.5 text-red-400" />Max temp</span>
                              <span className="text-white font-bold">{weatherRisk.recent.maxTempC.toFixed(1)}°C</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="flex items-center gap-1"><Thermometer className="w-2.5 h-2.5 text-sky-400" />Min temp</span>
                              <span className="text-white font-bold">{weatherRisk.recent.minTempC.toFixed(1)}°C</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="flex items-center gap-1"><Zap className="w-2.5 h-2.5 text-yellow-400" />Max wind</span>
                              <span className="text-white font-bold">{weatherRisk.recent.maxWindKmh.toFixed(0)} km/h</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="flex items-center gap-1"><Snowflake className="w-2.5 h-2.5 text-cyan-400" />Snow</span>
                              <span className="text-white font-bold">{weatherRisk.recent.totalSnowCm.toFixed(0)}cm</span>
                            </div>
                            <div className="flex justify-between border-t border-neutral-800 pt-1 mt-1">
                              <span className="flex items-center gap-1"><Thermometer className="w-2.5 h-2.5 text-neutral-400" />Avg temp</span>
                              <span className="text-white font-bold">{weatherRisk.recent.avgTempC.toFixed(1)}°C</span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <p className="text-[9px] text-neutral-600 font-semibold">
                        Source: Open-Meteo Archive API · {weatherRisk.historical.yearsAnalyzed} year baseline
                      </p>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          )}

          {/* 72h forecast — live numerical weather prediction, with lead times */}
          {(forecastLoading || (forecast?.forecasts?.length ?? 0) > 0) && (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 overflow-hidden">
              <div className="px-3.5 py-2.5 border-b border-indigo-200 flex items-center justify-between">
                <h4 className="text-[10px] font-black uppercase tracking-wider text-indigo-800 flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5" />
                  72-Hour Forecast
                  <span className="text-[9px] font-semibold text-indigo-500 normal-case tracking-normal">
                    · live weather model
                  </span>
                </h4>
                {forecastLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500" />}
              </div>

              {forecastLoading ? (
                <div className="px-3.5 py-4 text-center text-[11px] font-bold text-indigo-500 animate-pulse">
                  Computing convective and hydrological outlook…
                </div>
              ) : (
                <div className="p-2.5 space-y-2">
                  {forecast?.soilMoisture && (
                    <div className="text-[9px] font-bold text-indigo-700 bg-white/70 rounded-lg px-2 py-1.5 border border-indigo-100">
                      Soil moisture {forecast.soilMoisture.surface} m³/m³ — {forecast.soilMoisture.interpretation}
                    </div>
                  )}
                  {(forecast?.forecasts || []).map((f: any, i: number) => (
                    <div key={i} className="bg-white rounded-lg border border-indigo-100 p-2.5">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-[11px] font-black text-neutral-800 flex items-center gap-1.5">
                          {f.hazard}
                          {f.compound && (
                            <span className="text-[7px] font-black uppercase bg-purple-100 text-purple-700 border border-purple-200 px-1 py-0.5 rounded-full">
                              Compound
                            </span>
                          )}
                        </span>
                        <span
                          className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full border ${
                            f.confidence === "high"
                              ? "bg-red-50 border-red-200 text-red-600"
                              : f.confidence === "medium"
                              ? "bg-orange-50 border-orange-200 text-orange-600"
                              : "bg-yellow-50 border-yellow-200 text-yellow-700"
                          }`}
                        >
                          {(f.riskScore * 100).toFixed(0)}% · {f.confidence}
                        </span>
                      </div>
                      {f.leadTimeHours !== null && (
                        <div className="text-[9px] font-bold text-indigo-600 mb-1">
                          Onset in ~{f.leadTimeHours}h
                          {f.peakTimeIso ? ` · peak ${new Date(f.peakTimeIso).toLocaleString([], { weekday: "short", hour: "2-digit" })}` : ""}
                        </div>
                      )}
                      <div className="space-y-0.5">
                        {(f.drivers || []).map((dr: any, di: number) => (
                          <div key={di} className="text-[9px] text-neutral-600 leading-snug">
                            <span className="font-bold text-neutral-700">{dr.label}:</span> {dr.value}
                            <span className="text-neutral-400"> — {dr.meaning}</span>
                          </div>
                        ))}
                      </div>
                      <div className="text-[9px] font-semibold text-emerald-700 mt-1.5 pt-1.5 border-t border-neutral-100">
                        → {f.action}
                      </div>
                    </div>
                  ))}
                  <p className="text-[8px] text-indigo-400 font-semibold px-1">
                    Source: {forecast?.model}. Forecast horizon {forecast?.window}.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Multi-hazard toggle + analyze list */}
          <div className="space-y-2">
            <Label className="font-bold text-neutral-700 flex items-center justify-between">
              <span>All Hazards — Toggle & Analyze</span>
              <span className="text-[9px] font-bold text-neutral-400 normal-case">{visibleHazards.size} active</span>
            </Label>
            <p className="text-[9px] text-neutral-400 font-medium leading-snug">
              Unpredictable events (spills, radiation, earthquakes) are handled in Aegis Route for response, not here.
            </p>
            <div className="space-y-1.5 max-h-[380px] overflow-y-auto pr-1">
              {HAZARD_TYPES.map((type) => {
                const analysis = hazardAnalyses[type];
                const isVisible = visibleHazards.has(type);
                const isExpanded = expandedHazard === type;
                const meta = HAZARD_META[type];
                return (
                  <div key={type} className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
                    <div className="flex items-center gap-2 p-2.5">
                      <Switch checked={isVisible} onCheckedChange={() => toggleVisibility(type)} disabled={!analysis?.analyzed} />
                      <span className={meta.color}>{meta.icon}</span>
                      <div className="flex-1 min-w-0 flex items-center gap-1.5">
                        <span className="text-xs font-bold text-neutral-700 truncate">{type}</span>
                      </div>

                      {analysis?.loading ? (
                        <Loader2 className="w-4 h-4 animate-spin text-emerald-500 shrink-0" />
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => analyzeHazard(type)}
                          disabled={!hazardCenter}
                          className="text-[10px] font-bold h-7 px-2.5 rounded-lg bg-neutral-100 hover:bg-emerald-100 text-neutral-700 hover:text-emerald-700 border border-neutral-200 shrink-0"
                        >
                          {analysis?.analyzed ? "Re-analyze" : "Analyze"}
                        </Button>
                      )}

                      {analysis?.analyzed && (
                        <button
                          type="button"
                          onClick={() => setExpandedHazard(isExpanded ? null : type)}
                          className="p-1 text-neutral-400 hover:text-neutral-700 shrink-0"
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      )}
                    </div>

                    {analysis?.error && (
                      <div className="px-2.5 pb-2 text-[10px] text-red-500 font-semibold">{analysis.error}</div>
                    )}

                    {isExpanded && analysis?.analyzed && (
                      <div className="p-3 border-t border-neutral-100 bg-neutral-50 space-y-3">
                        {analysis.zoneSource && (
                          <div className="text-[10px] font-bold flex items-center gap-1.5">
                            {analysis.zoneSource === "polygon" ? (
                              <span className="text-emerald-600">
                                ▨ {analysis.polygons.length} real map polygons (OSM geometry + elevation + weather)
                              </span>
                            ) : (
                              <span className="text-neutral-500">
                                ○ {analysis.zones.length} AI-estimated zones (no physical model for this hazard)
                              </span>
                            )}
                          </div>
                        )}

                        {analysis.origin && (
                          <div className="flex items-center gap-1.5 text-[10px] font-bold text-neutral-500">
                            <MapPin className="w-3 h-3" />
                            Origin: [{analysis.origin[0].toFixed(3)}, {analysis.origin[1].toFixed(3)}]
                            {analysis.path && (
                              <span className="flex items-center gap-1 text-indigo-600 ml-1">
                                <Navigation2 className="w-3 h-3" /> spread path shown on map
                              </span>
                            )}
                          </div>
                        )}

                        {analysis.metrics && (
                          <div className="grid grid-cols-3 gap-1.5">
                            <div className="p-1.5 bg-white rounded-lg border border-neutral-200 text-center">
                              <span className="text-[7px] font-bold text-neutral-400 uppercase block">Infra Risk</span>
                              <span className="text-sm font-black text-rose-500">{analysis.metrics.infrastructure}%</span>
                            </div>
                            <div className="p-1.5 bg-white rounded-lg border border-neutral-200 text-center">
                              <span className="text-[7px] font-bold text-neutral-400 uppercase block">Residential</span>
                              <span className="text-sm font-black text-amber-500">{analysis.metrics.residential}%</span>
                            </div>
                            <div className="p-1.5 bg-white rounded-lg border border-neutral-200 text-center">
                              <span className="text-[7px] font-bold text-neutral-400 uppercase block">Evac Risk</span>
                              <span className="text-sm font-black text-blue-500">{analysis.metrics.evacuationReadiness}%</span>
                            </div>
                          </div>
                        )}

                        {analysis.checklist.length > 0 && (
                          <div className="space-y-1">
                            {analysis.checklist.map((item, idx) => (
                              <div key={idx} className="text-[10px] leading-tight text-neutral-700 flex items-start gap-1.5 font-medium">
                                <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0 mt-0.5" />
                                <span>{item}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {analysis.strategyMarkdown && (
                          <div className="text-[10px] leading-relaxed text-neutral-600 font-medium border-t border-neutral-200 pt-2 max-h-[160px] overflow-y-auto whitespace-pre-line">
                            {analysis.strategyMarkdown.replace(/^#+\s*/gm, "").replace(/^[-*]\s*/gm, "• ")}
                          </div>
                        )}

                        <div className="flex gap-1.5 pt-1 border-t border-neutral-200 mt-1">
                          {onSendToEvacuation && hazardCenter && (
                            <Button
                              type="button"
                              onClick={() => {
                                const radiusM = estimateImpactRadiusM(hazardCenter, analysis);
                                onSendToEvacuation(type, hazardCenter, radiusM);
                              }}
                              className="flex-1 text-[11px] font-bold h-9 rounded-lg bg-red-600 hover:bg-red-700 text-white flex items-center justify-center gap-1.5"
                            >
                              <Navigation2 className="w-3.5 h-3.5" />
                              Route to Safety
                            </Button>
                          )}
                          <Button
                            type="button"
                            onClick={() => handlePublishAlert(type)}
                            disabled={publishStatus[type] === "loading"}
                            className={`flex-1 text-[11px] font-bold h-9 rounded-lg flex items-center justify-center gap-1.5 ${
                              publishStatus[type] === "done"
                                ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                                : publishStatus[type] === "error"
                                ? "bg-red-100 hover:bg-red-200 text-red-700 border border-red-200"
                                : "bg-neutral-800 hover:bg-neutral-900 text-white"
                            }`}
                          >
                            {publishStatus[type] === "loading" ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : publishStatus[type] === "done" ? (
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            ) : (
                              <Radio className="w-3.5 h-3.5" />
                            )}
                            {publishStatus[type] === "done"
                              ? "Published to mobile"
                              : publishStatus[type] === "error"
                              ? "Failed — retry"
                              : "Publish Alert"}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Export analysed zone coordinates as a markdown report */}
          {analyzedCount > 0 && (
            <Button
              type="button"
              onClick={handleExportMarkdown}
              className="w-full py-5 bg-neutral-800 hover:bg-neutral-900 text-white font-bold rounded-xl flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              Export Report (.md) — {analyzedCount} hazard{analyzedCount === 1 ? "" : "s"}
            </Button>
          )}

          {/* Temperature Heatmap Toggle */}
          {hazardCenter && setShowTemperatureHeatmap && (
            <div className="flex items-center justify-between p-3 bg-neutral-50 rounded-xl border border-neutral-100">
              <div className="flex items-center gap-2.5">
                <div className={`p-1.5 rounded-lg transition-colors ${showTemperatureHeatmap ? 'bg-orange-100 text-orange-600' : 'bg-neutral-200/60 text-neutral-400'}`}>
                  <Thermometer className="w-4 h-4" />
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-neutral-700 flex items-center gap-1.5">
                    Temperature Heatmap
                    {temperatureHeatmapLoading && (
                      <Loader2 className="w-3 h-3 animate-spin text-orange-500" />
                    )}
                  </span>
                  <span className="text-[10px] font-semibold text-neutral-400">
                    {temperatureHeatmapLoading
                      ? "Fetching temperature data..."
                      : showTemperatureHeatmap
                      ? "Live thermal overlay active"
                      : "Show thermal gradient on map"}
                  </span>
                </div>
              </div>
              <Switch
                checked={showTemperatureHeatmap}
                onCheckedChange={() => setShowTemperatureHeatmap(!showTemperatureHeatmap)}
              />
            </div>
          )}

          {!hazardCenter && (
            <p className="text-[11px] text-neutral-400 italic text-center py-2">
              Set a target location above to enable hazard analysis.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
