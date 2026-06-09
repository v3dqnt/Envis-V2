"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  AlertTriangle,
  Building,
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
} from "lucide-react";
import type { WeatherRiskPayload, DisasterRisk } from "@/app/api/weather-risk/route";

interface SwitchProps {
  checked: boolean;
  onCheckedChange: () => void;
}

function Switch({ checked, onCheckedChange }: SwitchProps) {
  return (
    <button
      type="button"
      onClick={onCheckedChange}
      className={`relative inline-flex h-6.5 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-all duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 ${
        checked ? "bg-emerald-600" : "bg-neutral-300/80"
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5.5 w-5.5 transform rounded-full bg-white shadow-md ring-0 transition-all duration-300 ease-in-out ${
          checked ? "translate-x-5.5" : "translate-x-0"
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
}

const CONFIDENCE_STYLES: Record<string, string> = {
  high: "bg-red-500/15 border-red-500/40 text-red-400",
  medium: "bg-orange-500/10 border-orange-500/30 text-orange-400",
  low: "bg-yellow-500/10 border-yellow-500/30 text-yellow-400",
};

const RISK_ICONS: Record<string, React.ReactNode> = {
  Flooding: <Waves className="w-3.5 h-3.5" />,
  Wildfire: <Flame className="w-3.5 h-3.5" />,
  Blizzard: <Snowflake className="w-3.5 h-3.5" />,
  "Tropical Cyclone": <Wind className="w-3.5 h-3.5" />,
  Drought: <Thermometer className="w-3.5 h-3.5" />,
  "Extreme Cold": <Snowflake className="w-3.5 h-3.5" />,
};

// Maps weather risk types to the threat simulation options in the sidebar
const RISK_TO_INCIDENT: Record<string, string> = {
  Flooding: "Flooding",
  Wildfire: "Wildfire",
  Blizzard: "Blizzard",
  "Tropical Cyclone": "Tornado",
  Drought: "Wildfire",
  "Extreme Cold": "Blizzard",
};

export default function PreventionSidebar({
  hazardCenter,
  setHazardCenter,
  hazardRadius,
  setMapFlyToCoords,
  activeDefenses,
  setActiveDefenses,
  densityPerKm2,
  cityName,
  gdacsEvents,
  gdacsLoading,
  incidentType,
  setIncidentType,
  setVulnerabilityZones,
}: PreventionSidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [strategyMarkdown, setStrategyMarkdown] = useState("");
  const [checklist, setChecklist] = useState<string[]>([]);
  const [metrics, setMetrics] = useState<{
    infrastructure: number;
    residential: number;
    evacuationReadiness: number;
  } | null>(null);

  // Weather risk state
  const [weatherRisk, setWeatherRisk] = useState<WeatherRiskPayload | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState(false);
  const [showHistorical, setShowHistorical] = useState(false);

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

        // Auto-select the highest-confidence detected risk as the threat profile
        if (data.risks.length > 0) {
          const topRisk = data.risks[0];
          const mapped = RISK_TO_INCIDENT[topRisk.type];
          if (mapped) setIncidentType(mapped);
        }
      } catch {
        setWeatherError(true);
      } finally {
        setWeatherLoading(false);
      }
    };

    fetchWeatherRisk();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hazardCenter]);

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

  const handleGenerateReport = async () => {
    setAiLoading(true);
    setStrategyMarkdown("");
    setChecklist([]);
    setMetrics(null);
    try {
      const res = await fetch("/api/prevention", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          incidentType,
          cityName: cityName || "Local Area",
          activeDefenses,
          densityPerKm2: densityPerKm2 || 5000,
          weatherRisk: weatherRisk || null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setStrategyMarkdown(data.strategyMarkdown || "");
        setChecklist(data.checklist || []);
        setMetrics(data.vulnerabilityMetrics || null);

        // After audit completes, fetch vulnerability zones for the map
        if (hazardCenter && setVulnerabilityZones) {
          try {
            const vulnRes = await fetch("/api/vulnerability-zones", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                lat: hazardCenter[1],
                lng: hazardCenter[0],
                disasterType: incidentType,
                cityName: cityName || "Local Area",
                radiusKm: 5,
              }),
            });
            if (vulnRes.ok) {
              const vulnData = await vulnRes.json();
              if (vulnData.zones) {
                setVulnerabilityZones({
                  type: "FeatureCollection",
                  features: vulnData.zones,
                });
              }
            }
          } catch (err) {
            console.error("Failed to fetch vulnerability zones:", err);
          }
        }
      }
    } catch (err) {
      console.error("Failed to generate AI prevention report:", err);
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="absolute top-4 left-4 z-10 w-[26rem] flex flex-col gap-4 max-h-[calc(100vh-2rem)] overflow-y-auto">
      <Card className="shadow-2xl border-0 bg-white/90 backdrop-blur-xl supports-[backdrop-filter]:bg-white/70 rounded-2xl overflow-hidden shrink-0">
        <CardHeader className="pb-4 border-b border-neutral-100 bg-neutral-50/50">
          <CardTitle className="text-2xl font-black tracking-tight flex items-center gap-2 text-neutral-800">
            <ShieldCheck className="w-7 h-7 text-emerald-500" />
            Aegis Prevent
          </CardTitle>
          <CardDescription className="text-neutral-500 font-semibold">
            AI-powered structural auditing and disaster mitigation
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-4 space-y-4">
          {/* Geocoding */}
          <form onSubmit={handleGeocode} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="audit-loc" className="font-bold text-neutral-700">Mitigation Audit Location</Label>
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
                  {/* Detected risk cards */}
                  {weatherRisk.risks.length === 0 ? (
                    <p className="text-[11px] text-neutral-400 italic">No statistically significant climate risks detected.</p>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-[9px] font-black text-neutral-500 uppercase tracking-wider">
                        Detected Disaster Risks · sorted by confidence
                      </p>
                      {weatherRisk.risks.map((risk, i) => (
                        <div
                          key={i}
                          className={`p-2.5 rounded-xl border text-left ${CONFIDENCE_STYLES[risk.confidence] || "border-neutral-700 text-neutral-400"}`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <div className="flex items-center gap-1.5 font-black text-[11px]">
                              {RISK_ICONS[risk.type] || <AlertTriangle className="w-3.5 h-3.5" />}
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
                        </div>
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
                      {/* 2-col grid: historical | recent */}
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

          {/* Disaster Target Selector */}
          <div className="space-y-3 p-3 bg-neutral-50 rounded-xl border border-neutral-100">
            <Label className="font-bold text-neutral-700">
              Threat Simulation Profile
              {weatherRisk && weatherRisk.risks.length > 0 && (
                <span className="ml-2 text-[9px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">
                  AUTO-SET BY CLIMATE DATA
                </span>
              )}
            </Label>
            <div className="grid grid-cols-3 gap-2">
              {["Wildfire", "Flooding", "Toxic Plume", "Earthquake", "Tornado", "Radiation Leak", "Chemical Spill", "Blizzard", "Volcanic Eruption"].map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setIncidentType(type)}
                  className={`py-2 px-1 rounded-lg border text-xs font-bold transition-all flex flex-col items-center gap-1.5 ${
                    incidentType === type
                      ? "bg-emerald-50 border-emerald-200 text-emerald-700 shadow-sm"
                      : "bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50"
                  }`}
                >
                  {type === "Wildfire" && <Flame className="w-4 h-4 text-orange-500" />}
                  {type === "Flooding" && <Waves className="w-4 h-4 text-blue-500" />}
                  {type === "Toxic Plume" && <Skull className="w-4 h-4 text-green-500" />}
                  {type === "Earthquake" && <Activity className="w-4 h-4 text-amber-500" />}
                  {type === "Tornado" && <Wind className="w-4 h-4 text-teal-500" />}
                  {type === "Radiation Leak" && <Radiation className="w-4 h-4 text-lime-500" />}
                  {type === "Chemical Spill" && <Biohazard className="w-4 h-4 text-yellow-500" />}
                  {type === "Blizzard" && <Snowflake className="w-4 h-4 text-sky-400" />}
                  {type === "Volcanic Eruption" && <Mountain className="w-4 h-4 text-rose-600" />}
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* AI Audit Button */}
          <Button
            onClick={handleGenerateReport}
            disabled={aiLoading}
            className="w-full py-6 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-base shadow-lg shadow-emerald-100 rounded-xl transition-all flex items-center justify-center gap-2"
          >
            {aiLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Auditing Vulnerabilities...
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                Audit Structural Vulnerability
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* AI Mitigation Directive panel */}
      {(aiLoading || strategyMarkdown || checklist.length > 0) && (
        <Card className="shadow-2xl border-0 bg-neutral-900 text-white rounded-2xl overflow-hidden border-t-2 border-emerald-500 shrink-0">
          <CardHeader className="pb-3 border-b border-neutral-800 bg-neutral-950/40">
            <CardTitle className="text-base font-black tracking-tight flex items-center gap-2 text-white">
              <Sparkles className="w-5 h-5 text-emerald-400" />
              AI Mitigation Directive
            </CardTitle>
            <CardDescription className="text-neutral-400 text-xs font-semibold">
              {weatherRisk
                ? `Climate-informed audit for ${cityName || "Target Location"} · ${weatherRisk.historical.yearsAnalyzed}yr data`
                : `Structural risk audit for ${cityName || "Target Location"}`}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4 space-y-4">
            {aiLoading ? (
              <div className="flex flex-col items-center justify-center py-6 gap-3 text-neutral-400">
                <Loader2 className="w-7 h-7 animate-spin text-emerald-400" />
                <span className="text-xs font-bold tracking-wide animate-pulse">GENERATING SAFETY DIRECTIVES...</span>
              </div>
            ) : (
              <>
                {metrics && (
                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-2 bg-neutral-950/50 rounded-xl border border-neutral-800 text-center flex flex-col">
                      <span className="text-[8px] font-bold text-neutral-400 uppercase tracking-wider">Infrastructure Risk</span>
                      <span className="text-lg font-black text-rose-400 mt-1">{metrics.infrastructure}%</span>
                    </div>
                    <div className="p-2 bg-neutral-950/50 rounded-xl border border-neutral-800 text-center flex flex-col">
                      <span className="text-[8px] font-bold text-neutral-400 uppercase tracking-wider">Residential Risk</span>
                      <span className="text-lg font-black text-amber-400 mt-1">{metrics.residential}%</span>
                    </div>
                    <div className="p-2 bg-neutral-950/50 rounded-xl border border-neutral-800 text-center flex flex-col">
                      <span className="text-[8px] font-bold text-neutral-400 uppercase tracking-wider">Evacuation Bottleneck</span>
                      <span className="text-lg font-black text-blue-400 mt-1">{metrics.evacuationReadiness}%</span>
                    </div>
                  </div>
                )}

                {checklist.length > 0 && (
                  <div className="p-3 bg-neutral-950/40 rounded-xl border border-neutral-800 space-y-2">
                    <h4 className="text-[9px] font-black text-neutral-400 uppercase tracking-wider">Prioritized Engineering Checklist</h4>
                    <div className="space-y-1.5">
                      {checklist.map((item, idx) => (
                        <div key={idx} className="text-[11px] leading-tight text-neutral-200 flex items-start gap-1.5 font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {strategyMarkdown && (
                  <div className="text-xs leading-relaxed space-y-3 prose prose-invert max-w-none text-neutral-300 font-semibold border-t border-neutral-800 pt-3">
                    {strategyMarkdown.split("\n").map((line, idx) => {
                      if (line.startsWith("###")) return <h3 key={idx} className="font-extrabold text-xs text-white mt-4 first:mt-0">{line.replace("###", "").trim()}</h3>;
                      if (line.startsWith("##")) return <h2 key={idx} className="font-black text-sm text-white mt-4 first:mt-0">{line.replace("##", "").trim()}</h2>;
                      if (/^\d+\./.test(line)) return <div key={idx} className="font-extrabold text-white mt-3">{line}</div>;
                      if (line.trim().startsWith("-") || line.trim().startsWith("*")) {
                        const clean = line.trim().replace(/^[-*]\s*/, "");
                        return (
                          <div key={idx} className="relative pl-4 my-1 text-neutral-300 font-medium">
                            <span className="absolute left-0 text-emerald-400 font-bold">•</span>
                            <span>{clean}</span>
                          </div>
                        );
                      }
                      return <p key={idx} className="my-1">{line}</p>;
                    })}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
