"use client";

import React, { useState, useEffect, useRef } from "react";
import { Card } from "@astryxdesign/core/Card";
import { Layout, LayoutHeader, LayoutContent, VStack, HStack } from "@astryxdesign/core/Layout";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { Button } from "@astryxdesign/core/Button";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Switch } from "@astryxdesign/core/Switch";
import { Badge } from "@astryxdesign/core/Badge";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { MetadataList, MetadataListItem } from "@astryxdesign/core/MetadataList";
import { Item } from "@astryxdesign/core/Item";
import { Divider } from "@astryxdesign/core/Divider";
import {
  AlertTriangle,
  Waves,
  Flame,
  Activity,
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
  setGroundReportZones?: (zones: any) => void;
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

// Astryx hue-token colour per hazard, used on icons only (Badge/Card variants
// carry the same semantics elsewhere so the two stay consistent).
const HAZARD_META: Record<string, { icon: React.ReactNode }> = {
  Wildfire: { icon: <Flame className="w-4 h-4 text-gray-vivid" /> },
  Flooding: { icon: <Waves className="w-4 h-4 text-gray-vivid" /> },
  "Flash Flood": { icon: <Waves className="w-4 h-4 text-gray-vivid" /> },
  "Ice Storm": { icon: <Snowflake className="w-4 h-4 text-gray-vivid" /> },
  "Toxic Plume": { icon: <Skull className="w-4 h-4 text-gray-vivid" /> },
  Earthquake: { icon: <Activity className="w-4 h-4 text-gray-vivid" /> },
  Tornado: { icon: <Wind className="w-4 h-4 text-gray-vivid" /> },
  "Radiation Leak": { icon: <Radiation className="w-4 h-4 text-gray-vivid" /> },
  "Chemical Spill": { icon: <Biohazard className="w-4 h-4 text-gray-vivid" /> },
  Blizzard: { icon: <Snowflake className="w-4 h-4 text-gray-vivid" /> },
  "Volcanic Eruption": { icon: <Mountain className="w-4 h-4 text-gray-vivid" /> },
  "Tropical Cyclone": { icon: <Wind className="w-4 h-4 text-gray-vivid" /> },
  Heatwave: { icon: <Thermometer className="w-4 h-4 text-gray-vivid" /> },
  Drought: { icon: <Sun className="w-4 h-4 text-gray-vivid" /> },
  "Extreme Cold": { icon: <ThermometerSnowflake className="w-4 h-4 text-gray-vivid" /> },
  Thunderstorm: { icon: <CloudLightning className="w-4 h-4 text-gray-vivid" /> },
  Landslide: { icon: <MountainSnow className="w-4 h-4 text-gray-vivid" /> },
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
  Landslide: "Landslide",
};

type ConfidenceLevel = "high" | "medium" | "low";
const CONFIDENCE_BADGE: Record<ConfidenceLevel, "error" | "warning" | "info"> = {
  high: "error",
  medium: "warning",
  low: "info",
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
// A polygon-modelled hazard NEVER falls back to an AI circle, even when its real
// query finds nothing — an honest empty result (with the API's own note on why) beats
// a fabricated circle for a hazard we actually have a physical model for.
const POLYGON_MODELLED = new Set(["Wildfire", "Flooding", "Landslide", "Thunderstorm", "Tropical Cyclone", "Flash Flood"]);

// Hazards with a Tavily-backed on-ground report (/api/hazard-research) — matches the
// hazard set that route understands search phrasing for.
const GROUND_REPORT_HAZARDS = new Set(["Wildfire", "Flooding", "Flash Flood", "Blizzard", "Landslide"]);

interface GroundReportItem {
  areaName: string;
  status: "current" | "historical";
  severity: "high" | "medium" | "low";
  summary: string;
  sourceUrl: string;
  sourceTitle: string;
  lat: number;
  lng: number;
}

interface GroundReport {
  loading: boolean;
  fetched: boolean;
  items: GroundReportItem[];
  zones: any[];
  error: string | null;
}

interface HazardAnalysis {
  loading: boolean;
  analyzed: boolean;
  error: string | null;
  zones: any[];
  polygons: any[];
  zoneSource: "polygon" | "ai" | "none" | null;
  /** Why a polygon-modelled hazard found nothing — surfaced instead of an AI circle. */
  note: string | null;
  origin: [number, number] | null;
  path: [number, number][] | null;
  strategyMarkdown: string;
  checklist: string[];
  metrics: { infrastructure: number; residential: number; evacuationReadiness: number } | null;
  groundReport: GroundReport | null;
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
    const count = a.zoneSource === "polygon" || a.zoneSource === "none" ? a.polygons.length : a.zones.length;
    const kind = a.zoneSource === "polygon" ? "Real map polygons" : a.zoneSource === "none" ? "Real map polygons (none found)" : "AI-estimated";
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
    } else if (a.zoneSource === "none") {
      lines.push(`### Identified areas — none found`);
      lines.push("");
      lines.push(a.note || "No real-world zones identified within the search radius for this hazard.");
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
  setGroundReportZones,
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
      [hazardType]: { ...(prev[hazardType] as HazardAnalysis), loading: true, error: null, analyzed: prev[hazardType]?.analyzed || false, zones: prev[hazardType]?.zones || [], polygons: prev[hazardType]?.polygons || [], zoneSource: prev[hazardType]?.zoneSource || null, note: prev[hazardType]?.note || null, origin: prev[hazardType]?.origin || null, path: prev[hazardType]?.path || null, strategyMarkdown: prev[hazardType]?.strategyMarkdown || "", checklist: prev[hazardType]?.checklist || [], metrics: prev[hazardType]?.metrics || null, groundReport: prev[hazardType]?.groundReport || null },
    }));

    const origin = resolveOrigin(hazardType);
    const usePolygons = POLYGON_MODELLED.has(hazardType);
    const useGroundReport = GROUND_REPORT_HAZARDS.has(hazardType);

    try {
      // AI-estimated circles are only ever a fallback for hazards with no physical
      // model at all — a polygon-modelled hazard skips this fetch entirely, so it
      // can never show a fabricated circle in place of a real (possibly empty) result.
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
        usePolygons
          ? Promise.resolve(null)
          : fetch("/api/vulnerability-zones", {
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

      const vulnData = vulnRes && vulnRes.ok ? await vulnRes.json() : { zones: [] };
      // Real polygons win when we have them. AI circles only ever apply to hazards
      // with no physical model (usePolygons false) — a polygon-modelled hazard that
      // found nothing stays empty rather than falling back to a fabricated zone.
      const zones = usePolygons
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
          zoneSource: usePolygons ? (polygons.length > 0 ? "polygon" : "none") : "ai",
          note: usePolygons ? (polyData?.note || null) : null,
          origin,
          path,
          strategyMarkdown: prevData.strategyMarkdown || "",
          checklist: prevData.checklist || [],
          metrics: prevData.vulnerabilityMetrics || null,
          groundReport: useGroundReport ? { loading: true, fetched: false, items: [], zones: [], error: null } : null,
        },
      }));
      setVisibleHazards((prev) => new Set(prev).add(hazardType));

      // Fires independently of the analysis above — it hits Tavily + an LLM +
      // geocoding, so it's the slowest call here and shouldn't hold up the rest
      // of the hazard card, which is why it's not in the Promise.all above.
      if (useGroundReport) {
        fetch("/api/hazard-research", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lat: hazardCenter[1],
            lng: hazardCenter[0],
            hazardType,
            cityName: cityName || "the target location",
          }),
        })
          .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
          .then((data) => {
            setHazardAnalyses((prev) => ({
              ...prev,
              [hazardType]: {
                ...(prev[hazardType] as HazardAnalysis),
                groundReport: { loading: false, fetched: true, items: data.items || [], zones: data.zones || [], error: null },
              },
            }));
          })
          .catch((err) => {
            console.error(`Ground report failed for ${hazardType}:`, err);
            setHazardAnalyses((prev) => ({
              ...prev,
              [hazardType]: {
                ...(prev[hazardType] as HazardAnalysis),
                groundReport: { loading: false, fetched: true, items: [], zones: [], error: "On-ground search failed" },
              },
            }));
          });
      }
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
    const groundReportFeatures: any[] = [];

    visibleHazards.forEach((type) => {
      const a = hazardAnalyses[type];
      if (!a || !a.analyzed) return;
      zoneFeatures.push(...a.zones);
      polygonFeatures.push(...(a.polygons || []));
      if (a.groundReport?.zones?.length) groundReportFeatures.push(...a.groundReport.zones);
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
    setGroundReportZones?.(groundReportFeatures.length ? { type: "FeatureCollection", features: groundReportFeatures } : null);
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

  const handleGeocode = async () => {
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
    /* The docked column in page.tsx IS the panel, so this fills it directly.
       No Card wrapper — that would draw a second border inside the sidebar. */
    <Layout
      header={
            <LayoutHeader hasDivider padding={6}>
              <VStack gap={0.5}>
                <HStack gap={2} vAlign="center">
                  <ShieldCheck className="w-7 h-7 text-accent" />
                  <Heading level={2}>Aegis Prevent</Heading>
                </HStack>
                <Text type="supporting" color="secondary">
                  Multi-hazard climate risk analysis — toggle any threat, analyze independently
                </Text>
              </VStack>
            </LayoutHeader>
          }
          content={
            <LayoutContent padding={6} isScrollable={false}>
              <VStack gap={4}>
                {/* Geocoding */}
                <HStack gap={2}>
                  <div className="flex-1">
                    <TextInput label="Target location" placeholder="e.g. San Francisco, CA" value={searchQuery} onChange={setSearchQuery} />
                  </div>
                  <Button label="Set target" variant="secondary" isLoading={searchLoading} clickAction={handleGeocode} />
                </HStack>

                {/* Weather Risk Analysis — shown once hazardCenter is set */}
                {(weatherLoading || weatherRisk || weatherError) && (
                  <div className="climate-card" style={{ background: "var(--color-background-body)", border: "1px solid rgba(163,163,163,0.20)", borderRadius: "0.625rem", padding: "1rem" }}>
                    <VStack gap={3}>
                      <HStack hAlign="between" vAlign="center">
                        <HStack gap={1.5} vAlign="center">
                          <CloudRain className="w-3.5 h-3.5" style={{ color: "var(--color-text-secondary)" }} />
                          <span style={{ color: "var(--color-text-secondary)", fontWeight: 600, fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                            Climate risk analysis{weatherRisk ? ` · ${weatherRisk.historical.yearsAnalyzed}yr archive` : ""}
                          </span>
                        </HStack>
                        {weatherLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: "var(--color-text-secondary)" }} />}
                      </HStack>

                      {weatherLoading ? (
                        <VStack gap={2} hAlign="center" style={{ padding: "1rem 0" }}>
                          <Loader2 className="w-5 h-5 animate-spin text-gray-vivid" />
                          <Text type="supporting" weight="bold">Fetching {cityName || "location"} climate archive…</Text>
                          <Text type="supporting" size="3xs" color="secondary">Pulling 10 years of Open-Meteo weather data</Text>
                        </VStack>
                      ) : weatherError ? (
                        <Text type="supporting" color="secondary" justify="center" display="block">
                          Climate data unavailable for this location.
                        </Text>
                      ) : weatherRisk ? (
                        <VStack gap={3}>
                          {weatherRisk.risks.length === 0 ? (
                            <Text type="supporting" color="secondary">No statistically significant climate risks detected.</Text>
                          ) : (
                            <VStack gap={2}>
                              <Text type="supporting" size="3xs" weight="bold">Detected disaster risks · click to analyze</Text>
                              {weatherRisk.risks.map((risk, i) => (
                                <div className="hazard-item" style={{ borderRadius: "0.5rem", padding: "0.5rem", borderLeft: `3px solid ${risk.confidence === 'high' ? '#c1121f' : risk.confidence === 'medium' ? '#780000' : 'var(--color-text-secondary)'}` }}>
                                  <Item
                                    key={i}
                                    label={risk.type}
                                    onClick={() => {
                                      const mapped = RISK_TO_INCIDENT[risk.type];
                                      if (mapped) analyzeHazard(mapped);
                                    }}
                                    startContent={HAZARD_META[RISK_TO_INCIDENT[risk.type]]?.icon || <AlertTriangle className="w-4 h-4" />}
                                    endContent={<Badge variant={CONFIDENCE_BADGE[risk.confidence as ConfidenceLevel] || "neutral"} label={risk.confidence} />}
                                    description={
                                      <VStack gap={0.5}>
                                        <Text type="supporting" size="3xs">{risk.historicalBasis}</Text>
                                        {risk.recentSignal && (
                                          <HStack gap={1} vAlign="center">
                                            <TrendingUp className="w-3 h-3" style={{ color: "var(--color-text-secondary)" }} />
                                            <Text type="supporting" size="3xs" weight="bold">{risk.recentSignal}</Text>
                                          </HStack>
                                        )}
                                      </VStack>
                                    }
                                  />
                                </div>
                              ))}
                            </VStack>
                          )}

                          <Collapsible
                            isOpen={showHistorical}
                            onOpenChange={setShowHistorical}
                            trigger={
                              <HStack hAlign="between" vAlign="center" style={{ width: "100%" }}>
                                <HStack gap={1.5} vAlign="center">
                                  <Clock className="w-3 h-3" style={{ color: "var(--color-text-secondary)" }} />
                                  <Text type="supporting" weight="bold" style={{ color: "var(--color-text-primary)" }}>Historical vs recent comparison</Text>
                                </HStack>
                                {showHistorical ? <ChevronUp className="w-3.5 h-3.5" style={{ color: "var(--color-text-secondary)" }} /> : <ChevronDown className="w-3.5 h-3.5" style={{ color: "var(--color-text-secondary)" }} />}
                              </HStack>
                            }
                          >
                            <VStack gap={2}>
                              <HStack gap={2}>
                                <div className="climate-card" style={{ background: "var(--color-background-surface)", border: "1px solid rgba(163,163,163,0.20)", borderRadius: "0.625rem", width: "100%", padding: "0.5rem" }}>
                                  <MetadataList columns="single">
                                    <MetadataListItem label={`Historical (${weatherRisk.historical.startYear}–${weatherRisk.historical.endYear})`} style={{ color: "var(--color-text-secondary)" }}>{""}</MetadataListItem>
                                    <MetadataListItem label="Peak rain" style={{ color: "var(--color-text-primary)" }}>{weatherRisk.historical.maxDailyPrecipMm.toFixed(0)}mm</MetadataListItem>
                                    <MetadataListItem label="Max temp" style={{ color: "var(--color-text-primary)" }}>{weatherRisk.historical.maxTempC.toFixed(1)}°C</MetadataListItem>
                                    <MetadataListItem label="Min temp" style={{ color: "var(--color-text-primary)" }}>{weatherRisk.historical.minTempC.toFixed(1)}°C</MetadataListItem>
                                    <MetadataListItem label="Max wind" style={{ color: "var(--color-text-primary)" }}>{weatherRisk.historical.maxWindKmh.toFixed(0)} km/h</MetadataListItem>
                                    <MetadataListItem label="Max snow" style={{ color: "var(--color-text-primary)" }}>{weatherRisk.historical.maxDailySnowCm.toFixed(0)}cm</MetadataListItem>
                                    <MetadataListItem label="Avg/year" style={{ color: "var(--color-text-primary)" }}>{weatherRisk.historical.annualAvgPrecipMm.toFixed(0)}mm</MetadataListItem>
                                  </MetadataList>
                                </div>
                                <div className="climate-card" style={{ background: "var(--color-background-body)", border: "1px solid #c1121f33", borderRadius: "0.625rem", width: "100%", padding: "0.5rem" }}>
                                  <MetadataList columns="single">
                                    <MetadataListItem label={`Recent ${weatherRisk.recent.days} days`} style={{ color: "#c1121f" }}>{""}</MetadataListItem>
                                    <MetadataListItem label="Precip" style={{ color: "var(--color-text-primary)" }}>{weatherRisk.recent.totalPrecipMm.toFixed(0)}mm</MetadataListItem>
                                    <MetadataListItem label="Max temp" style={{ color: "var(--color-text-primary)" }}>{weatherRisk.recent.maxTempC.toFixed(1)}°C</MetadataListItem>
                                    <MetadataListItem label="Min temp" style={{ color: "var(--color-text-primary)" }}>{weatherRisk.recent.minTempC.toFixed(1)}°C</MetadataListItem>
                                    <MetadataListItem label="Max wind" style={{ color: "var(--color-text-primary)" }}>{weatherRisk.recent.maxWindKmh.toFixed(0)} km/h</MetadataListItem>
                                    <MetadataListItem label="Snow" style={{ color: "var(--color-text-primary)" }}>{weatherRisk.recent.totalSnowCm.toFixed(0)}cm</MetadataListItem>
                                    <MetadataListItem label="Avg temp" style={{ color: "var(--color-text-primary)" }}>{weatherRisk.recent.avgTempC.toFixed(1)}°C</MetadataListItem>
                                  </MetadataList>
                                </div>
                              </HStack>
                              <Text type="supporting" size="3xs" style={{ color: "var(--color-text-secondary)" }}>
                                Source: Open-Meteo Archive API · {weatherRisk.historical.yearsAnalyzed} year baseline
                              </Text>
                            </VStack>
                          </Collapsible>
                        </VStack>
                      ) : null}
                    </VStack>
                  </div>
                )}

                {/* 72h forecast — live numerical weather prediction, with lead times */}
                {(forecastLoading || (forecast?.forecasts?.length ?? 0) > 0) && (
                  <div className="climate-card" style={{ background: "var(--color-background-body)", border: "1px solid rgba(163,163,163,0.30)", borderRadius: "0.625rem", padding: "1rem" }}>
                    <VStack gap={3}>
                      <HStack hAlign="between" vAlign="center">
                        <HStack gap={1.5} vAlign="center">
                          <TrendingUp className="w-3.5 h-3.5" style={{ color: "#c1121f" }} />
                          <span style={{ color: "var(--color-text-secondary)", fontWeight: 600, fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>72-hour forecast · live weather model</span>
                        </HStack>
                        {forecastLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: "var(--color-text-secondary)" }} />}
                      </HStack>

                      {forecastLoading ? (
                        <Text type="supporting" weight="bold" justify="center" display="block" style={{ color: "var(--color-text-primary)" }}>
                          Computing convective and hydrological outlook…
                        </Text>
                      ) : (
                        <VStack gap={2}>
                          {forecast?.soilMoisture && (
                            <Text type="supporting" size="3xs" weight="bold" style={{ color: "var(--color-text-secondary)" }}>
                              Soil moisture {forecast.soilMoisture.surface} m³/m³ — {forecast.soilMoisture.interpretation}
                            </Text>
                          )}
                          {(forecast?.forecasts || []).map((f: any, i: number) => (
                            <Card key={i} variant="default" padding={3} style={{ background: "var(--color-background-surface)", border: "1px solid rgba(163,163,163,0.20)" }}>
                              <VStack gap={1}>
                                <HStack hAlign="between" vAlign="center">
                                  <HStack gap={1.5} vAlign="center">
                                    <Text type="supporting" weight="bold" style={{ color: "var(--color-text-primary)" }}>{f.hazard}</Text>
                                    {f.compound && <Badge variant="purple" label="Compound" />}
                                  </HStack>
                                  <Badge variant={CONFIDENCE_BADGE[f.confidence as ConfidenceLevel] || "neutral"} label={`${(f.riskScore * 100).toFixed(0)}% · ${f.confidence}`} />
                                </HStack>
                                {f.leadTimeHours !== null && (
                                  <Text type="supporting" size="3xs" weight="bold" style={{ color: "#c1121f" }}>
                                    Onset in ~{f.leadTimeHours}h
                                    {f.peakTimeIso ? ` · peak ${new Date(f.peakTimeIso).toLocaleString([], { weekday: "short", hour: "2-digit" })}` : ""}
                                  </Text>
                                )}
                                <VStack gap={0.5}>
                                  {(f.drivers || []).map((dr: any, di: number) => (
                                    <Text key={di} type="supporting" size="3xs" style={{ color: "#aab9c7" }}>
                                      <Text type="inherit" weight="bold" style={{ color: "var(--color-text-primary)" }}>{dr.label}:</Text> {dr.value} — {dr.meaning}
                                    </Text>
                                  ))}
                                </VStack>
                                <div className="divider-palette" />
                                <Text type="supporting" size="3xs" weight="semibold" style={{ color: "#c1121f" }}>→ {f.action}</Text>
                              </VStack>
                            </Card>
                          ))}
                          <Text type="supporting" size="4xs" style={{ color: "var(--color-text-secondary)" }}>Source: {forecast?.model}. Forecast horizon {forecast?.window}.</Text>
                        </VStack>
                      )}
                    </VStack>
                  </div>
                )}

                {/* Multi-hazard toggle + analyze list */}
                <VStack gap={2}>
                  <HStack hAlign="between">
                    <div className="section-accent">
                      <Text type="body" weight="bold" style={{ color: "var(--color-text-primary)" }}>All hazards — toggle &amp; analyze</Text>
                    </div>
                    <Text type="supporting" size="3xs" style={{ color: "var(--color-text-secondary)" }}>{visibleHazards.size} active</Text>
                  </HStack>
                  <Text type="supporting" size="3xs" style={{ color: "var(--color-text-secondary)" }}>
                    Unpredictable events (spills, radiation, earthquakes) are handled in Aegis Route for response, not here.
                  </Text>
                  <div className="max-h-[380px] overflow-y-auto">
                    <VStack gap={1.5}>
                      {HAZARD_TYPES.map((type) => {
                        const analysis = hazardAnalyses[type];
                        const isVisible = visibleHazards.has(type);
                        const isExpanded = expandedHazard === type;
                        const meta = HAZARD_META[type];
                        return (
                          <Card key={type} variant="default" padding={0} style={{ background: "var(--color-background-surface)", border: `1px solid ${isVisible ? '#c1121f4D' : 'rgba(163,163,163,0.10)'}`, borderLeft: isVisible ? '3px solid #c1121f' : '3px solid transparent' }}>
                            <div className="p-2.5">
                              <HStack gap={2} vAlign="center">
                                <Switch label={`Show ${type} on map`} isLabelHidden value={isVisible} onChange={() => toggleVisibility(type)} isDisabled={!analysis?.analyzed} />
                                {meta.icon}
                                <div className="flex-1 min-w-0">
                                  <Text type="body" weight="bold" maxLines={1} style={{ color: "var(--color-text-primary)" }}>{type}</Text>
                                </div>

                                {analysis?.loading ? (
                                  <Loader2 className="w-4 h-4 animate-spin" style={{ color: "#c1121f" }} />
                                ) : (
                                  <Button label={analysis?.analyzed ? "Re-analyze" : "Analyze"} size="sm" variant="secondary" onClick={() => analyzeHazard(type)} isDisabled={!hazardCenter} />
                                )}

                                {analysis?.analyzed && (
                                  <Button
                                    label={isExpanded ? "Collapse" : "Expand"}
                                    isIconOnly
                                    icon={isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setExpandedHazard(isExpanded ? null : type)}
                                  />
                                )}
                              </HStack>
                            </div>

                            {analysis?.error && (
                              <div className="px-2.5 pb-2">
                                <Text type="supporting" size="3xs" color="accent">{analysis.error}</Text>
                              </div>
                            )}

                            {isExpanded && analysis?.analyzed && (
                              <div className="p-3 pt-0">
                                <Divider />
                                <VStack gap={3} style={{ paddingTop: "0.75rem" }}>
                                  {analysis.zoneSource && (
                                    <Badge
                                      variant={analysis.zoneSource === "polygon" ? "green" : "neutral"}
                                      label={
                                        analysis.zoneSource === "polygon"
                                          ? `${analysis.polygons.length} real map polygons (OSM geometry + elevation + weather)`
                                          : analysis.zoneSource === "none"
                                          ? "No real-world zones found — see note below"
                                          : `${analysis.zones.length} AI-estimated zones (no physical model for this hazard)`
                                      }
                                    />
                                  )}

                                  {analysis.zoneSource === "none" && analysis.note && (
                                    <Text type="supporting" size="3xs" color="secondary">
                                      {analysis.note}
                                    </Text>
                                  )}

                                  {analysis.origin && (
                                    <HStack gap={1.5} vAlign="center">
                                      <MapPin className="w-3 h-3" />
                                      <Text type="supporting" size="3xs" weight="bold">
                                        Origin: [{analysis.origin[0].toFixed(3)}, {analysis.origin[1].toFixed(3)}]
                                      </Text>
                                      {analysis.path && (
                                        <HStack gap={1} vAlign="center">
                                          <Navigation2 className="w-3 h-3 text-gray-vivid" />
                                          <Text type="supporting" size="3xs" color="accent">spread path shown on map</Text>
                                        </HStack>
                                      )}
                                    </HStack>
                                  )}

                                  {analysis.metrics && (
                                    <HStack gap={1.5}>
                                      <Card variant="red" padding={1.5} width="100%">
                                        <VStack gap={0} hAlign="center">
                                          <Text type="supporting" size="4xs" weight="bold">Infra risk</Text>
                                          <Text type="body" weight="bold">{analysis.metrics.infrastructure}%</Text>
                                        </VStack>
                                      </Card>
                                      <Card variant="orange" padding={1.5} width="100%">
                                        <VStack gap={0} hAlign="center">
                                          <Text type="supporting" size="4xs" weight="bold">Residential</Text>
                                          <Text type="body" weight="bold">{analysis.metrics.residential}%</Text>
                                        </VStack>
                                      </Card>
                                      <Card variant="blue" padding={1.5} width="100%">
                                        <VStack gap={0} hAlign="center">
                                          <Text type="supporting" size="4xs" weight="bold">Evac risk</Text>
                                          <Text type="body" weight="bold">{analysis.metrics.evacuationReadiness}%</Text>
                                        </VStack>
                                      </Card>
                                    </HStack>
                                  )}

                                  {analysis.checklist.length > 0 && (
                                    <VStack gap={1}>
                                      {analysis.checklist.map((item, idx) => (
                                        <HStack key={idx} gap={1.5}>
                                          <CheckCircle2 className="w-3 h-3 text-gray-vivid shrink-0 mt-0.5" />
                                          <Text type="supporting" size="3xs">{item}</Text>
                                        </HStack>
                                      ))}
                                    </VStack>
                                  )}

                                  {analysis.strategyMarkdown && (
                                    <div className="max-h-[160px] overflow-y-auto">
                                      <Text type="supporting" size="3xs" display="block">
                                        {analysis.strategyMarkdown.replace(/^#+\s*/gm, "").replace(/^[-*]\s*/gm, "• ")}
                                      </Text>
                                    </div>
                                  )}

                                  {analysis.groundReport && (
                                    <VStack gap={1.5}>
                                      <HStack gap={1.5} vAlign="center">
                                        <Radio className="w-3 h-3" style={{ color: "#669bbc" }} />
                                        <Text type="supporting" size="3xs" weight="bold" style={{ color: "#669bbc" }}>
                                          ON-GROUND REPORT
                                        </Text>
                                        {analysis.groundReport.loading && <Loader2 className="w-3 h-3 animate-spin" style={{ color: "#669bbc" }} />}
                                      </HStack>

                                      {analysis.groundReport.loading && (
                                        <Text type="supporting" size="3xs" style={{ color: "#4a6573" }}>
                                          Searching the web for affected areas...
                                        </Text>
                                      )}

                                      {analysis.groundReport.error && (
                                        <Text type="supporting" size="3xs" color="accent">{analysis.groundReport.error}</Text>
                                      )}

                                      {!analysis.groundReport.loading && !analysis.groundReport.error && analysis.groundReport.fetched && analysis.groundReport.items.length === 0 && (
                                        <Text type="supporting" size="3xs" style={{ color: "#4a6573" }}>
                                          No specific affected areas found in recent or historical reporting.
                                        </Text>
                                      )}

                                      {analysis.groundReport.items.length > 0 && (
                                        <div className="max-h-[220px] overflow-y-auto">
                                          <VStack gap={1.5}>
                                            {analysis.groundReport.items.map((item, idx) => (
                                              <div
                                                key={idx}
                                                style={{
                                                  background: "#001d2e",
                                                  border: `1px solid ${item.status === "current" ? "#c1121f4D" : "#669bbc26"}`,
                                                  borderRadius: "0.5rem",
                                                  padding: "0.5rem",
                                                  cursor: "pointer",
                                                }}
                                                onClick={() => setMapFlyToCoords([item.lng, item.lat])}
                                              >
                                                <HStack hAlign="between" vAlign="center">
                                                  <HStack gap={1.5} vAlign="center">
                                                    <span
                                                      style={{
                                                        width: 6,
                                                        height: 6,
                                                        borderRadius: "50%",
                                                        flexShrink: 0,
                                                        background: item.status === "current" ? "#c1121f" : "#669bbc",
                                                      }}
                                                    />
                                                    <Text type="supporting" size="3xs" weight="bold" style={{ color: "#fdf0d5" }}>
                                                      {item.areaName}
                                                    </Text>
                                                  </HStack>
                                                  <Badge
                                                    variant={item.status === "current" ? "red" : "neutral"}
                                                    label={item.status === "current" ? "current" : "historical"}
                                                  />
                                                </HStack>
                                                <Text type="supporting" size="3xs" style={{ color: "#669bbc", display: "block", marginTop: "0.2rem" }}>
                                                  {item.summary}
                                                </Text>
                                                {item.sourceUrl && (
                                                  <a
                                                    href={item.sourceUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    onClick={(e) => e.stopPropagation()}
                                                    style={{ fontSize: "9px", color: "#4a6573", textDecoration: "underline" }}
                                                  >
                                                    {item.sourceTitle || "source"}
                                                  </a>
                                                )}
                                              </div>
                                            ))}
                                          </VStack>
                                        </div>
                                      )}
                                    </VStack>
                                  )}

                                  <HStack gap={1.5}>
                                    {onSendToEvacuation && hazardCenter && (
                                      <Button
                                        label="Route to safety"
                                        variant="destructive"
                                        size="sm"
                                        icon={<Navigation2 className="w-3.5 h-3.5" />}
                                        onClick={() => {
                                          const radiusM = estimateImpactRadiusM(hazardCenter, analysis);
                                          onSendToEvacuation(type, hazardCenter, radiusM);
                                        }}
                                        width="100%"
                                      />
                                    )}
                                    <Button
                                      label={publishStatus[type] === "done" ? "Published to mobile" : publishStatus[type] === "error" ? "Failed — retry" : "Publish alert"}
                                      variant={publishStatus[type] === "error" ? "destructive" : "secondary"}
                                      size="sm"
                                      icon={publishStatus[type] === "done" ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Radio className="w-3.5 h-3.5" />}
                                      isLoading={publishStatus[type] === "loading"}
                                      onClick={() => handlePublishAlert(type)}
                                      width="100%"
                                    />
                                  </HStack>
                                </VStack>
                              </div>
                            )}
                          </Card>
                        );
                      })}
                    </VStack>
                  </div>
                </VStack>

                {/* Export analysed zone coordinates as a markdown report */}
                {analyzedCount > 0 && (
                  <Button
                    label={`Export report (.md) — ${analyzedCount} hazard${analyzedCount === 1 ? "" : "s"}`}
                    variant="secondary"
                    icon={<Download className="w-4 h-4" />}
                    onClick={handleExportMarkdown}
                    width="100%"
                  />
                )}

                {/* Temperature Heatmap Toggle */}
                {hazardCenter && setShowTemperatureHeatmap && (
                  <div className="climate-card" style={{ background: "var(--color-background-surface)", border: `1px solid ${showTemperatureHeatmap ? '#c1121f4D' : 'rgba(163,163,163,0.20)'}`, borderRadius: "0.625rem", padding: "1rem" }}>
                    <HStack hAlign="between" vAlign="center">
                      <HStack gap={2} vAlign="center">
                        <Thermometer className="w-4 h-4" style={{ color: showTemperatureHeatmap ? "#c1121f" : "var(--color-text-disabled)" }} />
                        <VStack gap={0}>
                          <HStack gap={1.5} vAlign="center">
                            <Text type="body" weight="bold" style={{ color: "var(--color-text-primary)" }}>Temperature heatmap</Text>
                            {temperatureHeatmapLoading && <Loader2 className="w-3 h-3 animate-spin" style={{ color: "#c1121f" }} />}
                          </HStack>
                          <Text type="supporting" size="3xs" style={{ color: "var(--color-text-secondary)" }}>
                            {temperatureHeatmapLoading
                              ? "Fetching temperature data..."
                              : showTemperatureHeatmap
                              ? "Live thermal overlay active"
                              : "Show thermal gradient on map"}
                          </Text>
                        </VStack>
                      </HStack>
                      <Switch
                        label="Temperature heatmap"
                        isLabelHidden
                        value={showTemperatureHeatmap}
                        onChange={() => setShowTemperatureHeatmap(!showTemperatureHeatmap)}
                      />
                    </HStack>
                  </div>
                )}

                {!hazardCenter && (
                  <Text type="supporting" color="secondary" justify="center" display="block">
                    Set a target location above to enable hazard analysis.
                  </Text>
                )}
              </VStack>
            </LayoutContent>
          }
        />
  );
}
