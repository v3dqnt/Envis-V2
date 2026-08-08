"use client";

/**
 * Auto Jobs — manage the target-area watchlist that /api/target-areas/monitor
 * scans on a schedule. Suggestions the monitor raises don't live here; they
 * render in the persistent NotificationPanel (the "review and publish"
 * surface), so this panel stays focused on "what am I watching."
 */

import React, { useEffect, useState, useCallback } from "react";
import { Layout, LayoutHeader, LayoutContent, VStack, HStack } from "@astryxdesign/core/Layout";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { Button } from "@astryxdesign/core/Button";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Item } from "@astryxdesign/core/Item";
import { Divider } from "@astryxdesign/core/Divider";
import { Radar, MapPin, X, Loader2 } from "lucide-react";

interface TargetArea {
  id: string;
  name: string;
  city_name: string | null;
  active: boolean;
  lat: number;
  lng: number;
  created_at: string;
}

export default function AutoJobsSidebar() {
  const [targetAreas, setTargetAreas] = useState<TargetArea[]>([]);
  const [loading, setLoading] = useState(false);
  const [nameQuery, setNameQuery] = useState("");
  const [locationQuery, setLocationQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [runningMonitor, setRunningMonitor] = useState(false);
  const [monitorNote, setMonitorNote] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  const loadTargetAreas = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/target-areas");
      if (res.status === 503) {
        setUnavailable(true);
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setTargetAreas(data.targetAreas ?? []);
        setUnavailable(false);
      }
    } catch (err) {
      console.error("Failed to load target areas:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTargetAreas();
  }, [loadTargetAreas]);

  const handleAdd = async () => {
    if (!nameQuery.trim() || !locationQuery.trim()) return;
    setAdding(true);
    try {
      const mapTilerKey = process.env.NEXT_PUBLIC_MAPTILER_API_KEY || "get_your_own_OpIi9ZULNHzrESv6T2vL";
      const geoRes = await fetch(
        `https://api.maptiler.com/geocoding/${encodeURIComponent(locationQuery)}.json?key=${mapTilerKey}`
      );
      if (!geoRes.ok) return;
      const geoData = await geoRes.json();
      if (!geoData.features || geoData.features.length === 0) return;
      const [lng, lat] = geoData.features[0].center;
      const cityName = geoData.features[0].text ?? locationQuery;

      const res = await fetch("/api/target-areas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nameQuery, lat, lng, cityName }),
      });
      if (res.ok) {
        setNameQuery("");
        setLocationQuery("");
        await loadTargetAreas();
      }
    } catch (err) {
      console.error("Failed to add target area:", err);
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (id: string) => {
    try {
      await fetch(`/api/target-areas?id=${id}`, { method: "DELETE" });
      setTargetAreas((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      console.error("Failed to remove target area:", err);
    }
  };

  const handleRunMonitor = async () => {
    setRunningMonitor(true);
    setMonitorNote(null);
    try {
      const res = await fetch("/api/target-areas/monitor", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setMonitorNote(`Scanned ${data.areasScanned} area(s), ${data.suggestionsCreated} new suggestion(s).`);
      } else {
        setMonitorNote(data.error ?? "Monitor run failed.");
      }
    } catch (err) {
      setMonitorNote("Monitor run failed.");
      console.error("Failed to run monitor:", err);
    } finally {
      setRunningMonitor(false);
    }
  };

  return (
    /* The docked column in page.tsx IS the panel, so this fills it directly.
       No Card wrapper — that would draw a second border inside the sidebar. */
    <Layout
      header={
        <LayoutHeader hasDivider padding={4}>
          <VStack gap={0.5}>
            <HStack gap={2} vAlign="center">
              <Radar className="w-7 h-7 text-accent" />
              <Heading level={2}>Auto Jobs</Heading>
            </HStack>
            <Text type="supporting" color="secondary">
              Watch a location — get flagged automatically when conditions cross a threshold
            </Text>
          </VStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent padding={4}>
          <VStack gap={4}>
            {unavailable ? (
              <Text type="supporting" color="secondary">
                Target-area monitoring needs Supabase configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY) —
                see supabase/migrations/0004_target_areas.sql.
              </Text>
            ) : (
              <>
                <VStack gap={2}>
                  <TextInput
                    label="Target name"
                    placeholder="e.g. Wayanad hillside villages"
                    value={nameQuery}
                    onChange={(v: string) => setNameQuery(v)}
                  />
                  <TextInput
                    label="Location"
                    placeholder="Search a place"
                    value={locationQuery}
                    onChange={(v: string) => setLocationQuery(v)}
                  />
                  <Button label="Add target area" isLoading={adding} clickAction={handleAdd} />
                </VStack>

                <Divider />

                <VStack gap={2}>
                  <HStack hAlign="between" vAlign="center">
                    <Text type="supporting" color="secondary" weight="bold">
                      Watching ({targetAreas.length})
                    </Text>
                    {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: "var(--color-text-secondary)" }} />}
                  </HStack>

                  {targetAreas.length === 0 && !loading ? (
                    <Text type="supporting" color="secondary">
                      No target areas yet — add one above.
                    </Text>
                  ) : (
                    targetAreas.map((area) => (
                      <Item
                        key={area.id}
                        startContent={<MapPin className="w-4 h-4 text-gray-vivid" />}
                        label={area.name}
                        description={area.city_name ?? undefined}
                        endContent={
                          <button
                            onClick={() => handleRemove(area.id)}
                            aria-label={`Remove ${area.name}`}
                            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-disabled)" }}
                          >
                            <X className="w-4 h-4" />
                          </button>
                        }
                      />
                    ))
                  )}
                </VStack>

                <Divider />

                <VStack gap={2}>
                  <Button
                    label="Run monitor now"
                    variant="secondary"
                    isLoading={runningMonitor}
                    clickAction={handleRunMonitor}
                  />
                  <Text type="supporting" color="secondary">
                    {monitorNote ??
                      "Normally runs on a schedule (see README) — this triggers one scan immediately for testing."}
                  </Text>
                </VStack>
              </>
            )}
          </VStack>
        </LayoutContent>
      }
    />
  );
}
