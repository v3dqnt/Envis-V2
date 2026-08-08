"use client";

/**
 * Persistent right-hand workspace panel. Always mounted (unlike the old
 * Aegis-Prevent-only GdacsRightFeed) so live activity and Auto Jobs
 * suggestions awaiting review/publish stay visible regardless of which
 * left-column panel is expanded.
 */

import React, { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import GdacsRightFeed from "@/components/GdacsRightFeed";
import { Bell, Loader2, Check, X, Eye } from "lucide-react";
import type { CycloneEvent, EarthquakeEvent } from "@/app/api/live-feed/route";

interface Suggestion {
  id: string;
  target_area_id: string;
  target_area_name: string;
  city_name: string | null;
  hazard_types: string[];
  reason: string;
  risk_snapshot: { confidence?: "high" | "medium" | "low" };
  status: "pending" | "published" | "dismissed";
  lat: number;
  lng: number;
}

interface NotificationPanelProps {
  cyclones: CycloneEvent[];
  earthquakes: EarthquakeEvent[];
  feedLoading: boolean;
  setHazardCenter: (coords: [number, number] | null) => void;
  setMapFlyToCoords: (coords: [number, number] | null) => void;
  setIncidentType: (type: string) => void;
  /** Called when the operator wants to jump into a fuller review — expands the
   * Prevention panel; this component has already set the location/hazard. */
  onReview: () => void;
}

export default function NotificationPanel({
  cyclones,
  earthquakes,
  feedLoading,
  setHazardCenter,
  setMapFlyToCoords,
  setIncidentType,
  onReview,
}: NotificationPanelProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggestionsAvailable, setSuggestionsAvailable] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadSuggestions = useCallback(async () => {
    try {
      const res = await fetch("/api/target-areas/suggestions?status=pending");
      if (res.status === 503) {
        setSuggestionsAvailable(false);
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setSuggestions(data.suggestions ?? []);
        setSuggestionsAvailable(true);
      }
    } catch (err) {
      console.error("Failed to load target-area suggestions:", err);
    }
  }, []);

  useEffect(() => {
    loadSuggestions();
    // Auto Jobs suggestions can appear between manual "Run monitor now" clicks
    // or a scheduled run — poll while the workspace is open rather than
    // requiring a manual refresh.
    const interval = setInterval(loadSuggestions, 60_000);
    return () => clearInterval(interval);
  }, [loadSuggestions]);

  const handleReview = (s: Suggestion) => {
    setHazardCenter([s.lng, s.lat]);
    setMapFlyToCoords([s.lng, s.lat]);
    setIncidentType(s.hazard_types[0]);
    onReview();
  };

  const handleDismiss = async (s: Suggestion) => {
    setBusyId(s.id);
    try {
      await fetch("/api/target-areas/suggestions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: s.id, status: "dismissed" }),
      });
      setSuggestions((prev) => prev.filter((x) => x.id !== s.id));
    } finally {
      setBusyId(null);
    }
  };

  const handlePublish = async (s: Suggestion) => {
    setBusyId(s.id);
    try {
      const confidence = s.risk_snapshot?.confidence ?? "medium";
      const severity = confidence === "high" ? "high" : confidence === "low" ? "low" : "medium";
      const hazardType = s.hazard_types[0];

      const publishRes = await fetch("/api/alerts/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hazardType,
          severity,
          source: "manual",
          title: `${s.hazard_types.join(" + ")} risk near ${s.target_area_name}`,
          message: s.reason,
          lat: s.lat,
          lng: s.lng,
          cityName: s.city_name,
          rawPayload: { autoJobsSuggestionId: s.id, hazardTypes: s.hazard_types },
        }),
      });
      if (!publishRes.ok) return;
      const { alert } = await publishRes.json();

      await fetch("/api/target-areas/suggestions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: s.id, status: "published", publishedAlertId: alert?.id }),
      });
      setSuggestions((prev) => prev.filter((x) => x.id !== s.id));
    } catch (err) {
      console.error("Failed to publish suggestion:", err);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="w-full flex flex-col gap-3">
      {suggestionsAvailable && suggestions.length > 0 && (
        <Card className="shadow-2xl border-0 bg-neutral-900/92 backdrop-blur-xl border-t-2 border-neutral-500 rounded-2xl overflow-hidden text-white">
          <CardHeader className="pb-3 border-b border-neutral-800 bg-neutral-950/40">
            <CardTitle className="text-lg font-black tracking-tight flex items-center gap-2 text-white">
              <Bell className="w-5 h-5 text-neutral-300" />
              Auto Job Suggestions
            </CardTitle>
            <CardDescription className="text-neutral-400 font-semibold text-[11px] mt-0.5">
              Flagged automatically — nothing here has been published yet
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-3 space-y-2">
            {suggestions.map((s) => (
              <div key={s.id} className="p-2.5 bg-neutral-950/50 border border-neutral-800 rounded-xl">
                <div className="flex items-center gap-1.5 flex-wrap mb-1">
                  {s.hazard_types.map((h) => (
                    <span key={h} className="text-[8px] font-black px-1.5 py-0.5 rounded-full border border-neutral-600 text-neutral-200 bg-neutral-800/60 uppercase tracking-wide">
                      {h}
                    </span>
                  ))}
                </div>
                <p className="text-[11px] font-bold text-neutral-100">
                  {s.target_area_name}
                  {s.city_name ? ` · ${s.city_name}` : ""}
                </p>
                <p className="text-[10px] text-neutral-400 mt-0.5">{s.reason}</p>
                <div className="flex items-center gap-1.5 mt-2">
                  <button
                    onClick={() => handleReview(s)}
                    className="flex-1 py-1.5 text-[10px] font-bold rounded-lg border border-neutral-700 text-neutral-200 hover:bg-neutral-800 transition-colors flex items-center justify-center gap-1"
                  >
                    <Eye className="w-3 h-3" /> Review
                  </button>
                  <button
                    onClick={() => handlePublish(s)}
                    disabled={busyId === s.id}
                    className="flex-1 py-1.5 text-[10px] font-bold rounded-lg border border-neutral-500 bg-neutral-200 text-neutral-900 hover:bg-white transition-colors flex items-center justify-center gap-1 disabled:opacity-50"
                  >
                    {busyId === s.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Publish
                  </button>
                  <button
                    onClick={() => handleDismiss(s)}
                    disabled={busyId === s.id}
                    aria-label="Dismiss"
                    className="py-1.5 px-2 text-[10px] font-bold rounded-lg border border-neutral-800 text-neutral-500 hover:text-neutral-300 transition-colors disabled:opacity-50"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <GdacsRightFeed
        cyclones={cyclones}
        earthquakes={earthquakes}
        feedLoading={feedLoading}
        setHazardCenter={setHazardCenter}
        setMapFlyToCoords={setMapFlyToCoords}
        setIncidentType={setIncidentType}
      />
    </div>
  );
}
