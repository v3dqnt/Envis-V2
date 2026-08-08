"use client";

import React, { useState } from "react";
import { Layout, LayoutHeader, LayoutContent, VStack, HStack } from "@astryxdesign/core/Layout";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { TabList, Tab } from "@astryxdesign/core/TabList";
import {
  Radio,
  Loader2,
  Waves,
  Activity,
  Wind,
  Globe,
  Zap,
  Database,
} from "lucide-react";
import type { CycloneEvent, EarthquakeEvent } from "@/app/api/live-feed/route";

interface LiveFeedProps {
  cyclones: CycloneEvent[];
  earthquakes: EarthquakeEvent[];
  feedLoading: boolean;
  setHazardCenter: (coords: [number, number] | null) => void;
  setMapFlyToCoords: (coords: [number, number] | null) => void;
  setIncidentType: (type: string) => void;
}

type FeedTab = "cyclones" | "earthquakes";

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

const SOURCE_COLORS: Record<string, string> = {
  GDACS: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
  USGS: "text-blue-400 border-blue-500/30 bg-blue-500/10",
  "Tomorrow.io": "text-violet-400 border-violet-500/30 bg-violet-500/10",
  XWeather: "text-sky-400 border-sky-500/30 bg-sky-500/10",
};

function magToColor(mag: number): string {
  if (mag >= 7.0) return "text-red-400 bg-red-500/15";
  if (mag >= 5.5) return "text-orange-400 bg-orange-500/10";
  if (mag >= 4.5) return "text-yellow-400 bg-yellow-500/10";
  return "text-emerald-400 bg-emerald-500/10";
}

const ALERT_RANK: Record<string, number> = { red: 0, orange: 1, yellow: 2, green: 3 };

export default function GdacsRightFeed({
  cyclones,
  earthquakes,
  feedLoading,
  setHazardCenter,
  setMapFlyToCoords,
  setIncidentType,
}: LiveFeedProps) {
  const [tab, setTab] = useState<FeedTab>("cyclones");

  const redCyclones = cyclones.filter((c) => c.alertLevel === "red").length;
  const redEqs = earthquakes.filter((e) => e.alertLevel === "red").length;
  const tsunamiCount = earthquakes.filter((e) => e.tsunami).length;

  // Sorted defensively — the API already orders by severity, but the panel's
  // own "sorted by severity" label should stay true even if that changes.
  const sortedCyclones = [...cyclones].sort(
    (a, b) => (ALERT_RANK[a.alertLevel] ?? 9) - (ALERT_RANK[b.alertLevel] ?? 9)
  );
  const sortedEarthquakes = [...earthquakes].sort((a, b) => {
    const rankDiff = (ALERT_RANK[a.alertLevel] ?? 9) - (ALERT_RANK[b.alertLevel] ?? 9);
    return rankDiff !== 0 ? rankDiff : b.magnitude - a.magnitude;
  });

  return (
    /* The docked column in page.tsx IS the panel — same pattern as
       RoutingSidebar. No Card/absolute wrapper, so this fills the aside
       instead of floating over the map. */
    <Layout
      header={
        <LayoutHeader hasDivider padding={4}>
          <VStack gap={0.5}>
            <HStack gap={2} vAlign="center">
              <Radio className="w-6 h-6 text-accent shrink-0" />
              <Heading level={2}>Global Live Feed</Heading>
              {feedLoading && <Loader2 className="w-4 h-4 animate-spin text-neutral-400 ml-auto" />}
            </HStack>
            <Text type="supporting" color="secondary">
              GDACS &middot; USGS &middot; Tomorrow.io &middot; XWeather
            </Text>
          </VStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent padding={4}>
          <VStack gap={4}>
            {/* Summary stats */}
            <div className="grid grid-cols-3 gap-2">
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

            <TabList value={tab} onChange={(v) => setTab(v as FeedTab)} layout="fill" hasDivider>
              <Tab value="cyclones" label={`Cyclones (${cyclones.length})`} icon={<Wind className="w-3.5 h-3.5" />} />
              <Tab value="earthquakes" label={`Earthquakes (${earthquakes.length})`} icon={<Activity className="w-3.5 h-3.5" />} />
            </TabList>

            {/* Cyclones panel */}
            {tab === "cyclones" && (
              <VStack gap={2}>
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-black text-neutral-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Wind className="w-3 h-3" />
                    Active Tropical Systems
                  </p>
                  <span className="text-[9px] text-neutral-600 font-semibold">sorted by severity</span>
                </div>

                {feedLoading && sortedCyclones.length === 0 ? (
                  <div className="text-center py-8 text-xs text-neutral-400 font-semibold flex flex-col items-center gap-2">
                    <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
                    Querying cyclone feeds...
                  </div>
                ) : sortedCyclones.length === 0 ? (
                  <div className="text-center py-8 text-xs text-neutral-500 italic">
                    No active tropical systems detected.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {sortedCyclones.map((evt) => {
                      const colors = alertBg[evt.alertLevel] || alertBg.green;
                      const hover = alertHover[evt.alertLevel] || alertHover.green;
                      const dot = alertDot[evt.alertLevel] || alertDot.green;
                      const sourceColor = SOURCE_COLORS[evt.source] || "text-neutral-400 border-neutral-700 bg-neutral-800/30";
                      return (
                        <div
                          key={evt.id}
                          onClick={() => {
                            if (evt.coordinates) {
                              setHazardCenter(evt.coordinates);
                              setMapFlyToCoords(evt.coordinates);
                              setIncidentType("Tornado");
                            }
                          }}
                          className={`group p-2.5 bg-neutral-950/50 border border-neutral-800 ${hover} rounded-xl cursor-pointer transition-all`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
                              <h5 className="text-[11px] font-bold text-neutral-100 truncate group-hover:text-emerald-300 transition-colors">
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
                                {evt.country} &middot; {evt.category}
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
              </VStack>
            )}

            {/* Earthquakes panel */}
            {tab === "earthquakes" && (
              <VStack gap={2}>
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-black text-neutral-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Activity className="w-3 h-3" />
                    Seismic Activity
                  </p>
                  <span className="text-[9px] text-neutral-600 font-semibold">by alert &middot; then magnitude</span>
                </div>

                {feedLoading && sortedEarthquakes.length === 0 ? (
                  <div className="text-center py-8 text-xs text-neutral-400 font-semibold flex flex-col items-center gap-2">
                    <Loader2 className="w-6 h-6 animate-spin text-orange-400" />
                    Querying seismic feeds...
                  </div>
                ) : sortedEarthquakes.length === 0 ? (
                  <div className="text-center py-8 text-xs text-neutral-500 italic">
                    No significant seismic events detected.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {sortedEarthquakes.map((evt) => {
                      const colors = alertBg[evt.alertLevel] || alertBg.green;
                      const hover = alertHover[evt.alertLevel] || alertHover.green;
                      const magColor = magToColor(evt.magnitude);
                      const sourceColor = SOURCE_COLORS[evt.source] || "text-neutral-400 border-neutral-700 bg-neutral-800/30";
                      return (
                        <div
                          key={evt.id}
                          onClick={() => {
                            if (evt.coordinates) {
                              setHazardCenter(evt.coordinates);
                              setMapFlyToCoords(evt.coordinates);
                              setIncidentType("Earthquake");
                            }
                          }}
                          className={`group p-2.5 bg-neutral-950/50 border border-neutral-800 ${hover} rounded-xl cursor-pointer transition-all`}
                        >
                          <div className="flex items-center gap-2.5">
                            <div className={`shrink-0 w-10 h-10 rounded-xl flex flex-col items-center justify-center font-black ${magColor}`}>
                              <span className="text-sm leading-none">{evt.magnitude.toFixed(1)}</span>
                              <span className="text-[8px] font-bold opacity-70 leading-none mt-0.5">Mw</span>
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-1 mb-0.5">
                                <h5 className="text-[11px] font-bold text-neutral-100 truncate group-hover:text-orange-300 transition-colors">
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
                                  <p className="text-[9px] text-neutral-500 font-semibold">
                                    {evt.felt.toLocaleString()} felt
                                  </p>
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
              </VStack>
            )}

            {/* Data sources footer */}
            <div className="pt-1 border-t border-neutral-800 flex items-center gap-1.5 flex-wrap">
              <Database className="w-3 h-3 text-neutral-600 shrink-0" />
              {["GDACS", "USGS", "Tomorrow.io", "XWeather"].map((src) => (
                <span key={src} className={`text-[8px] font-bold px-1.5 py-0.5 rounded border ${SOURCE_COLORS[src] || "text-neutral-500 border-neutral-700"}`}>
                  {src}
                </span>
              ))}
            </div>
          </VStack>
        </LayoutContent>
      }
    />
  );
}
