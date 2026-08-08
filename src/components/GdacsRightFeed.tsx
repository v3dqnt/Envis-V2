"use client";

import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Radio, Loader2, Waves, Activity, Wind, Globe, Zap, Database } from "lucide-react";
import type { CycloneEvent, EarthquakeEvent } from "@/app/api/live-feed/route";

interface LiveFeedProps {
  cyclones: CycloneEvent[];
  earthquakes: EarthquakeEvent[];
  feedLoading: boolean;
  setHazardCenter: (coords: [number, number] | null) => void;
  setMapFlyToCoords: (coords: [number, number] | null) => void;
  setIncidentType: (type: string) => void;
  /** Fires with the full event (magnitude, depth, USGS id) so the Impact panel
   * can call /api/earthquake-impact — the setters above only carry a point. */
  onSelectEarthquake?: (evt: EarthquakeEvent) => void;
}

type Tab = "cyclones" | "earthquakes";

const alertBg: Record<string, string> = {
  red: "border-red-500/40 text-red-400 bg-red-500/15",
  orange: "border-orange-500/30 text-orange-400 bg-orange-500/10",
  yellow: "border-yellow-500/30 text-yellow-400 bg-yellow-500/10",
  green: "border-emerald-500/30 text-emerald-400 bg-emerald-500/10",
};

const alertHover: Record<string, string> = {
  red: "hover:border-red-500/60",
  orange: "hover:border-orange-500/50",
  yellow: "hover:border-yellow-500/50",
  green: "hover:border-emerald-500/50",
};

const alertDot: Record<string, string> = {
  red: "bg-red-500 animate-pulse",
  orange: "bg-orange-500",
  yellow: "bg-yellow-500",
  green: "bg-emerald-500",
};

// Which feed a row came from is provenance, not risk — it gets neutral chrome
// so it doesn't compete with the alert-level colours below, which are the only
// thing in this panel that should read as urgency.
const SOURCE_BADGE = "text-neutral-400 border-neutral-700 bg-neutral-800/40";

function magToColor(mag: number): string {
  if (mag >= 7.0) return "text-red-400 bg-red-500/15";
  if (mag >= 5.5) return "text-orange-400 bg-orange-500/10";
  if (mag >= 4.5) return "text-yellow-400 bg-yellow-500/10";
  return "text-emerald-400 bg-emerald-500/10";
}

export default function GdacsRightFeed({
  cyclones,
  earthquakes,
  feedLoading,
  setHazardCenter,
  setMapFlyToCoords,
  setIncidentType,
  onSelectEarthquake,
}: LiveFeedProps) {
  const [tab, setTab] = useState<Tab>("cyclones");

  const redCyclones = cyclones.filter((c) => c.alertLevel === "red").length;
  const redEqs = earthquakes.filter((e) => e.alertLevel === "red").length;
  const tsunamiCount = earthquakes.filter((e) => e.tsunami).length;

  return (
    <div className="w-full flex flex-col gap-3">
      {/* Was `absolute top-4 right-4`, a leftover from before panels were docked into
          a real flex layout — that let this card escape its column and pin to the
          viewport corner instead of sitting inside the reserved right-hand aside.
          Now a normal flow child; the parent aside owns width and scrolling. */}
      <Card className="shadow-2xl border-0 bg-neutral-900/92 backdrop-blur-xl supports-[backdrop-filter]:bg-neutral-900/80 border-t-2 border-neutral-600 rounded-2xl overflow-hidden text-white flex flex-col">
        <CardHeader className="pb-3 border-b border-neutral-800 bg-neutral-950/40 shrink-0">
          <CardTitle className="text-lg font-black tracking-tight flex items-center gap-2 text-white">
            <Radio className="w-5 h-5 text-neutral-300 animate-pulse shrink-0" />
            Global Live Feed
            {feedLoading && <Loader2 className="w-4 h-4 animate-spin text-neutral-400 ml-auto" />}
          </CardTitle>
          <CardDescription className="text-neutral-400 font-semibold text-[11px] mt-0.5">
            GDACS · USGS · Tomorrow.io · XWeather
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-3 space-y-3 overflow-y-auto flex-grow">
          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-2 shrink-0">
            <div className="py-2 px-1 bg-neutral-950/50 rounded-xl border border-neutral-800 text-center flex flex-col items-center gap-0.5">
              <Wind className="w-3.5 h-3.5 text-red-400" />
              <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-wider">Red Cyclones</span>
              <span className="text-sm font-black text-red-400">{redCyclones}</span>
            </div>
            <div className="py-2 px-1 bg-neutral-950/50 rounded-xl border border-neutral-800 text-center flex flex-col items-center gap-0.5">
              <Activity className="w-3.5 h-3.5 text-orange-400" />
              <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-wider">Red Quakes</span>
              <span className="text-sm font-black text-orange-400">{redEqs}</span>
            </div>
            <div className="py-2 px-1 bg-neutral-950/50 rounded-xl border border-neutral-800 text-center flex flex-col items-center gap-0.5">
              <Waves className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-wider">Tsunami Risk</span>
              <span className="text-sm font-black text-blue-400">{tsunamiCount}</span>
            </div>
          </div>

          {/* Tab selector */}
          <div className="flex rounded-xl overflow-hidden border border-neutral-800 shrink-0">
            <button
              onClick={() => setTab("cyclones")}
              className={`flex-1 py-2 text-[11px] font-black tracking-wide transition-all flex items-center justify-center gap-1.5 ${
                tab === "cyclones"
                  ? "bg-neutral-700/50 text-neutral-100 border-r border-neutral-800"
                  : "text-neutral-500 hover:text-neutral-300 border-r border-neutral-800"
              }`}
            >
              <Wind className="w-3.5 h-3.5" />
              Cyclones ({cyclones.length})
            </button>
            <button
              onClick={() => setTab("earthquakes")}
              className={`flex-1 py-2 text-[11px] font-black tracking-wide transition-all flex items-center justify-center gap-1.5 ${
                tab === "earthquakes"
                  ? "bg-neutral-700/50 text-neutral-100"
                  : "text-neutral-500 hover:text-neutral-300"
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              Earthquakes ({earthquakes.length})
            </button>
          </div>

          {/* Cyclones panel */}
          {tab === "cyclones" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-black text-neutral-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Wind className="w-3 h-3" />
                  Active Tropical Systems
                </p>
                <span className="text-[9px] text-neutral-600 font-semibold">sorted by severity</span>
              </div>

              {feedLoading && cyclones.length === 0 ? (
                <div className="text-center py-8 text-xs text-neutral-400 font-semibold flex flex-col items-center gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-neutral-300" />
                  Querying cyclone feeds...
                </div>
              ) : cyclones.length === 0 ? (
                <div className="text-center py-8 text-xs text-neutral-500 italic">
                  No active tropical systems detected.
                </div>
              ) : (
                <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                  {cyclones.map((evt) => {
                    const colors = alertBg[evt.alertLevel] || alertBg.green;
                    const hover = alertHover[evt.alertLevel] || alertHover.green;
                    const dot = alertDot[evt.alertLevel] || alertDot.green;
                    const sourceColor = SOURCE_BADGE;
                    return (
                      <div
                        key={evt.id}
                        onClick={() => {
                          if (evt.coordinates) {
                            setHazardCenter(evt.coordinates);
                            setMapFlyToCoords(evt.coordinates);
                            setIncidentType("Tropical Cyclone");
                          }
                        }}
                        className={`group p-2.5 bg-neutral-950/50 border border-neutral-800 ${hover} rounded-xl cursor-pointer transition-all`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
                            <h5 className="text-[11px] font-bold text-neutral-100 truncate group-hover:text-white transition-colors">
                              {evt.name}
                            </h5>
                          </div>
                          <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-full border shrink-0 uppercase tracking-wide ${colors}`}>
                            {evt.alertLevel}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2 pl-4">
                          <div className="flex flex-col gap-0.5 min-w-0">
                            <p className="text-[9px] text-neutral-500 font-semibold truncate flex items-center gap-1">
                              <Globe className="w-2.5 h-2.5 shrink-0" />
                              {evt.country} · {evt.category}
                            </p>
                            {evt.windSpeed != null && (
                              <p className="text-[9px] text-neutral-400 font-bold">
                                <Zap className="w-2.5 h-2.5 inline mr-0.5 text-yellow-400" />
                                {Math.round(evt.windSpeed)} km/h winds
                              </p>
                            )}
                          </div>
                          <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${sourceColor}`}>
                            {evt.source}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Earthquakes panel */}
          {tab === "earthquakes" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-black text-neutral-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Activity className="w-3 h-3" />
                  Seismic Activity
                </p>
                <span className="text-[9px] text-neutral-600 font-semibold">by alert · then magnitude</span>
              </div>

              {feedLoading && earthquakes.length === 0 ? (
                <div className="text-center py-8 text-xs text-neutral-400 font-semibold flex flex-col items-center gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-orange-400" />
                  Querying seismic feeds...
                </div>
              ) : earthquakes.length === 0 ? (
                <div className="text-center py-8 text-xs text-neutral-500 italic">
                  No significant seismic events detected.
                </div>
              ) : (
                <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                  {earthquakes.map((evt) => {
                    const colors = alertBg[evt.alertLevel] || alertBg.green;
                    const hover = alertHover[evt.alertLevel] || alertHover.green;
                    const magColor = magToColor(evt.magnitude);
                    const sourceColor = SOURCE_BADGE;
                    return (
                      <div
                        key={evt.id}
                        onClick={() => {
                          if (evt.coordinates) {
                            setHazardCenter(evt.coordinates);
                            setMapFlyToCoords(evt.coordinates);
                            setIncidentType("Earthquake");
                            onSelectEarthquake?.(evt);
                          }
                        }}
                        className={`group p-2.5 bg-neutral-950/50 border border-neutral-800 ${hover} rounded-xl cursor-pointer transition-all`}
                      >
                        <div className="flex items-center gap-2.5">
                          {/* Magnitude badge */}
                          <div className={`shrink-0 w-10 h-10 rounded-xl flex flex-col items-center justify-center font-black ${magColor}`}>
                            <span className="text-sm leading-none">{evt.magnitude.toFixed(1)}</span>
                            <span className="text-[8px] font-bold opacity-70 leading-none mt-0.5">Mw</span>
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1 mb-0.5">
                              <h5 className="text-[11px] font-bold text-neutral-100 truncate group-hover:text-white transition-colors">
                                {evt.name}
                              </h5>
                              <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-full border shrink-0 uppercase ${colors}`}>
                                {evt.alertLevel}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-[9px] text-neutral-500 font-semibold flex items-center gap-1">
                                <Globe className="w-2.5 h-2.5" />
                                {evt.country}
                              </p>
                              {evt.depth != null && (
                                <p className="text-[9px] text-neutral-500 font-semibold">
                                  {Math.round(evt.depth)}km deep
                                </p>
                              )}
                              {evt.tsunami && (
                                <span className="text-[8px] font-black px-1 py-0.5 rounded border border-blue-500/40 text-blue-400 bg-blue-500/15 flex items-center gap-0.5">
                                  <Waves className="w-2.5 h-2.5" />
                                  TSUNAMI
                                </span>
                              )}
                              {evt.felt != null && evt.felt > 0 && (
                                <span className="text-[9px] text-neutral-500 font-semibold">
                                  {evt.felt.toLocaleString()} felt
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex justify-end mt-1.5">
                          <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border ${sourceColor}`}>
                            {evt.source}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Data sources footer */}
          <div className="pt-1 border-t border-neutral-800 flex items-center gap-1.5 flex-wrap shrink-0">
            <Database className="w-3 h-3 text-neutral-600 shrink-0" />
            {["GDACS", "USGS", "Tomorrow.io", "XWeather"].map((src) => (
              <span key={src} className={`text-[8px] font-bold px-1.5 py-0.5 rounded border ${SOURCE_BADGE}`}>
                {src}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
