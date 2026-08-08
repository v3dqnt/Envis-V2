"use client";

/**
 * Alerts half of the Auto Jobs tab: suggestions the monitor job raised and are
 * waiting on a human, followed by the global live feed.
 *
 * Headerless and props-driven on purpose — it composes inside AutoJobsSidebar's
 * LayoutContent, so it draws no header or Card chrome of its own, and the
 * suggestion list is owned by page.tsx (the tab strip needs the same data for
 * its pending-count badge).
 */

import React, { useState } from "react";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";
import GdacsRightFeed from "@/components/GdacsRightFeed";
import { Loader2, Check, X, Eye } from "lucide-react";
import type { CycloneEvent, EarthquakeEvent } from "@/app/api/live-feed/route";

export interface Suggestion {
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
  suggestions: Suggestion[];
  suggestionsAvailable: boolean;
  refreshSuggestions: () => void;
  cyclones: CycloneEvent[];
  earthquakes: EarthquakeEvent[];
  feedLoading: boolean;
  setHazardCenter: (coords: [number, number] | null) => void;
  setMapFlyToCoords: (coords: [number, number] | null) => void;
  setIncidentType: (type: string) => void;
  /** Switches to the Prevention tab once this component has set the location. */
  onReview: () => void;
}

export default function NotificationPanel({
  suggestions,
  suggestionsAvailable,
  refreshSuggestions,
  cyclones,
  earthquakes,
  feedLoading,
  setHazardCenter,
  setMapFlyToCoords,
  setIncidentType,
  onReview,
}: NotificationPanelProps) {
  const [busyId, setBusyId] = useState<string | null>(null);

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
      refreshSuggestions();
    } finally {
      setBusyId(null);
    }
  };

  const handlePublish = async (s: Suggestion) => {
    setBusyId(s.id);
    try {
      const confidence = s.risk_snapshot?.confidence ?? "medium";
      const severity = confidence === "high" ? "high" : confidence === "low" ? "low" : "medium";

      const publishRes = await fetch("/api/alerts/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hazardType: s.hazard_types[0],
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
      refreshSuggestions();
    } catch (err) {
      console.error("Failed to publish suggestion:", err);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <VStack gap={4}>
      <VStack gap={2}>
        <HStack hAlign="between" vAlign="center">
          <Text type="supporting" color="secondary" weight="bold">
            Pending review ({suggestions.length})
          </Text>
        </HStack>

        {!suggestionsAvailable ? (
          <Text type="supporting" color="secondary">
            Suggestions need Supabase configured.
          </Text>
        ) : suggestions.length === 0 ? (
          <Text type="supporting" color="secondary">
            Nothing flagged — target areas are within normal ranges.
          </Text>
        ) : (
          suggestions.map((s) => (
            <div
              key={s.id}
              style={{
                background: "var(--color-background-body)",
                border: "1px solid var(--color-border)",
                borderRadius: "0.625rem",
                padding: "1rem",
              }}
            >
              <VStack gap={2}>
                <HStack gap={1} vAlign="center" style={{ flexWrap: "wrap" }}>
                  {s.hazard_types.map((h) => (
                    <span
                      key={h}
                      style={{
                        fontSize: "0.625rem",
                        fontWeight: 700,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        padding: "0.125rem 0.5rem",
                        borderRadius: "999px",
                        border: "1px solid var(--color-border-emphasized)",
                        color: "var(--color-text-primary)",
                      }}
                    >
                      {h}
                    </span>
                  ))}
                </HStack>

                <VStack gap={0.5}>
                  <Text type="body" weight="bold">
                    {s.target_area_name}
                    {s.city_name ? ` · ${s.city_name}` : ""}
                  </Text>
                  <Text type="supporting" color="secondary">
                    {s.reason}
                  </Text>
                </VStack>

                <HStack gap={1.5} vAlign="center">
                  <button
                    onClick={() => handleReview(s)}
                    style={{
                      flex: 1,
                      padding: "0.375rem 0.5rem",
                      fontSize: "0.6875rem",
                      fontWeight: 700,
                      borderRadius: "0.5rem",
                      border: "1px solid var(--color-border-emphasized)",
                      background: "transparent",
                      color: "var(--color-text-primary)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "0.25rem",
                    }}
                  >
                    <Eye className="w-3 h-3" /> Review
                  </button>
                  <button
                    onClick={() => handlePublish(s)}
                    disabled={busyId === s.id}
                    style={{
                      flex: 1,
                      padding: "0.375rem 0.5rem",
                      fontSize: "0.6875rem",
                      fontWeight: 700,
                      borderRadius: "0.5rem",
                      border: "1px solid var(--color-accent)",
                      background: "var(--color-accent)",
                      color: "var(--color-on-accent)",
                      cursor: "pointer",
                      opacity: busyId === s.id ? 0.5 : 1,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "0.25rem",
                    }}
                  >
                    {busyId === s.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                    Publish
                  </button>
                  <button
                    onClick={() => handleDismiss(s)}
                    disabled={busyId === s.id}
                    aria-label={`Dismiss suggestion for ${s.target_area_name}`}
                    style={{
                      padding: "0.375rem 0.5rem",
                      borderRadius: "0.5rem",
                      border: "1px solid var(--color-border)",
                      background: "transparent",
                      color: "var(--color-text-disabled)",
                      cursor: "pointer",
                      opacity: busyId === s.id ? 0.5 : 1,
                    }}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </HStack>
              </VStack>
            </div>
          ))
        )}
      </VStack>

      <GdacsRightFeed
        cyclones={cyclones}
        earthquakes={earthquakes}
        feedLoading={feedLoading}
        setHazardCenter={setHazardCenter}
        setMapFlyToCoords={setMapFlyToCoords}
        setIncidentType={setIncidentType}
      />
    </VStack>
  );
}
