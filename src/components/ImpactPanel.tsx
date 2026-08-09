"use client";

/**
 * Earthquake and tornado impact analysis, shown in GAIA Route once the
 * operator has classified the incident and placed an epicentre. Talks to
 * /api/earthquake-impact and /api/tornado, and lifts the resulting map
 * geometry up to page.tsx via setEarthquakeBands / setTornado so MapDashboard
 * (a sibling, not a child, of this panel) can render it.
 */

import React, { useState } from "react";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";
import { Button } from "@astryxdesign/core/Button";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Badge } from "@astryxdesign/core/Badge";
import { MetadataList, MetadataListItem } from "@astryxdesign/core/MetadataList";
import { Loader2, Activity, Tornado as TornadoIcon } from "lucide-react";
import type { EarthquakeEvent } from "@/app/api/live-feed/route";

interface EarthquakeBand {
  mmi: number;
  label: string;
  description: string;
  polygon: number[][];
  population: number;
  populationConfidence: "shakemap-pager" | "modelled-low";
  clearanceHours: number;
  unassignablePeople: number;
  roadCapacityRetention: number;
}

interface EarthquakeImpactResult {
  source: "shakemap" | "modelled";
  magnitude: number;
  depthKm: number;
  note: string;
  assumedOutboundLanes: number;
  bands: EarthquakeBand[];
}

interface ProjectedTornado {
  id: string;
  source: "nws" | "operator";
  position: [number, number];
  bearingDeg: number;
  speedKmh: number;
  efRating: string;
  warningPolygon: number[][] | null;
  centreline: number[][];
  corridor: number[][];
  leadTimeMarkers: { minutes: number; position: [number, number] }[];
  note: string;
}

interface ImpactPanelProps {
  incidentType: string;
  hazardCenter: [number, number] | null;
  selectedEarthquake: EarthquakeEvent | null;
  setEarthquakeBands: (fc: any) => void;
  setTornado: (t: ProjectedTornado | null) => void;
}

const EF_RATINGS = ["unknown", "EF0", "EF1", "EF2", "EF3", "EF4", "EF5"];

export default function ImpactPanel({ incidentType, hazardCenter, selectedEarthquake, setEarthquakeBands, setTornado }: ImpactPanelProps) {
  // --- Earthquake state ---
  const [magnitude, setMagnitude] = useState(selectedEarthquake?.magnitude?.toString() ?? "");
  const [depth, setDepth] = useState(selectedEarthquake?.depth?.toString() ?? "10");
  const [eqLoading, setEqLoading] = useState(false);
  const [eqResult, setEqResult] = useState<EarthquakeImpactResult | null>(null);
  const [eqError, setEqError] = useState<string | null>(null);

  // --- Tornado state ---
  const [nwsLoading, setNwsLoading] = useState(false);
  const [nwsTornadoes, setNwsTornadoes] = useState<ProjectedTornado[]>([]);
  const [nwsChecked, setNwsChecked] = useState(false);
  const [bearingDeg, setBearingDeg] = useState("");
  const [speedKmh, setSpeedKmh] = useState("");
  const [efRating, setEfRating] = useState("unknown");
  const [tornadoLoading, setTornadoLoading] = useState(false);
  const [activeTornado, setActiveTornado] = useState<ProjectedTornado | null>(null);
  const [tornadoError, setTornadoError] = useState<string | null>(null);

  if (incidentType !== "Earthquake" && incidentType !== "Tornado") return null;
  if (!hazardCenter) return null;
  const [lng, lat] = hazardCenter;

  const runEarthquakeAnalysis = async () => {
    const mag = parseFloat(magnitude);
    if (isNaN(mag)) {
      setEqError("Magnitude is required.");
      return;
    }
    setEqLoading(true);
    setEqError(null);
    try {
      const params = new URLSearchParams({ lat: String(lat), lng: String(lng), magnitude: String(mag), depth: depth || "10" });
      if (selectedEarthquake?.usgsId) params.set("usgsId", selectedEarthquake.usgsId);
      const res = await fetch(`/api/earthquake-impact?${params}`);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data: EarthquakeImpactResult = await res.json();
      setEqResult(data);
      setEarthquakeBands({
        type: "FeatureCollection",
        features: data.bands.map((b) => ({
          type: "Feature",
          geometry: { type: "Polygon", coordinates: [b.polygon] },
          properties: { mmi: b.mmi, label: b.label },
        })),
      });
    } catch (err: any) {
      setEqError(err?.message ?? "Failed to analyze impact.");
    } finally {
      setEqLoading(false);
    }
  };

  const checkNwsWarnings = async () => {
    setNwsLoading(true);
    setTornadoError(null);
    try {
      const res = await fetch("/api/tornado");
      const data = await res.json();
      setNwsTornadoes(data.tornadoes ?? []);
      setNwsChecked(true);
    } catch {
      setTornadoError("Failed to reach NWS alerts.");
    } finally {
      setNwsLoading(false);
    }
  };

  const selectTornado = (t: ProjectedTornado) => {
    setActiveTornado(t);
    setTornado(t);
  };

  const projectManualTornado = async () => {
    const bearing = parseFloat(bearingDeg);
    const speed = parseFloat(speedKmh);
    if (isNaN(bearing) || isNaN(speed)) {
      setTornadoError("Bearing and speed are both required — a tornado can't be projected without them.");
      return;
    }
    setTornadoLoading(true);
    setTornadoError(null);
    try {
      const res = await fetch("/api/tornado", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat, lng, bearingDeg: bearing, speedKmh: speed, efRating }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? `Request failed (${res.status})`);
      }
      const { tornado } = await res.json();
      selectTornado(tornado);
    } catch (err: any) {
      setTornadoError(err?.message ?? "Failed to project path.");
    } finally {
      setTornadoLoading(false);
    }
  };

  const cardStyle: React.CSSProperties = {
    background: "var(--color-background-body)",
    border: "1px solid rgba(163,163,163,0.20)",
    borderRadius: "0.625rem",
    padding: "1rem",
  };

  return (
    <VStack gap={3}>
      <div className="section-accent">
        <Text type="body" weight="bold" style={{ color: "var(--color-text-primary)" }}>
          Impact analysis
        </Text>
      </div>

      {incidentType === "Earthquake" && (
        <VStack gap={3}>
          <div style={cardStyle}>
            <VStack gap={2}>
              <HStack gap={2}>
                <div style={{ flex: 1 }}>
                  <TextInput label="Magnitude" placeholder="e.g. 6.5" value={magnitude} onChange={setMagnitude} />
                </div>
                <div style={{ flex: 1 }}>
                  <TextInput label="Depth (km)" placeholder="10" value={depth} onChange={setDepth} />
                </div>
              </HStack>
              <Button
                label="Analyze impact"
                icon={eqLoading ? undefined : <Activity className="w-4 h-4" />}
                isLoading={eqLoading}
                clickAction={runEarthquakeAnalysis}
                width="100%"
              />
              {eqError && (
                <Text type="supporting" color="accent">
                  {eqError}
                </Text>
              )}
            </VStack>
          </div>

          {eqResult && (
            <VStack gap={2}>
              <HStack gap={2} vAlign="center">
                <Badge variant={eqResult.source === "shakemap" ? "success" : "warning"} label={eqResult.source === "shakemap" ? "USGS ShakeMap + PAGER" : "Modelled — indicative only"} />
              </HStack>
              <Text type="supporting" color="secondary">
                {eqResult.note}
              </Text>

              {eqResult.bands.map((b) => (
                <div key={b.mmi} style={cardStyle}>
                  <VStack gap={1.5}>
                    <HStack hAlign="between" vAlign="center">
                      <Text type="body" weight="bold">
                        {b.label}
                      </Text>
                      {b.populationConfidence === "modelled-low" && <Badge variant="warning" label="low confidence" />}
                    </HStack>
                    <Text type="supporting" color="secondary">
                      {b.description}
                    </Text>
                    <MetadataList columns="single">
                      <MetadataListItem label="Exposed population">{b.population.toLocaleString()}</MetadataListItem>
                      <MetadataListItem label="Road capacity retained">{Math.round(b.roadCapacityRetention * 100)}%</MetadataListItem>
                      <MetadataListItem label="Estimated egress time">{b.clearanceHours.toFixed(1)} hours</MetadataListItem>
                      {b.unassignablePeople > 0 && (
                        <MetadataListItem label="Cannot be routed in 6h — needs shelter">{b.unassignablePeople.toLocaleString()}</MetadataListItem>
                      )}
                    </MetadataList>
                  </VStack>
                </div>
              ))}
            </VStack>
          )}
        </VStack>
      )}

      {incidentType === "Tornado" && (
        <VStack gap={3}>
          <div style={cardStyle}>
            <VStack gap={2}>
              <Button label="Check active NWS tornado warnings" variant="secondary" isLoading={nwsLoading} clickAction={checkNwsWarnings} width="100%" />
              {nwsChecked && nwsTornadoes.length === 0 && (
                <Text type="supporting" color="secondary">
                  No active NWS tornado warnings right now (NWS only covers the US).
                </Text>
              )}
              {nwsTornadoes.map((t) => (
                <Button key={t.id} label={`Warned tornado — ${Math.round(t.speedKmh)} km/h @ ${t.bearingDeg}°`} variant="secondary" size="sm" clickAction={() => selectTornado(t)} width="100%" />
              ))}
            </VStack>
          </div>

          <Text type="supporting" color="secondary" justify="center" display="block">
            OR place one manually
          </Text>

          <div style={cardStyle}>
            <VStack gap={2}>
              <HStack gap={2}>
                <div style={{ flex: 1 }}>
                  <TextInput label="Bearing (°)" placeholder="e.g. 45" value={bearingDeg} onChange={setBearingDeg} />
                </div>
                <div style={{ flex: 1 }}>
                  <TextInput label="Speed (km/h)" placeholder="e.g. 50" value={speedKmh} onChange={setSpeedKmh} />
                </div>
              </HStack>
              <VStack gap={0.5}>
                <Text type="supporting" color="secondary">
                  EF rating (if known)
                </Text>
                <select
                  value={efRating}
                  onChange={(e) => setEfRating(e.target.value)}
                  style={{
                    background: "var(--color-background-surface)",
                    color: "var(--color-text-primary)",
                    border: "1px solid var(--color-border-emphasized)",
                    borderRadius: "0.5rem",
                    padding: "0.5rem",
                    fontSize: "0.8125rem",
                  }}
                >
                  {EF_RATINGS.map((r) => (
                    <option key={r} value={r}>
                      {r === "unknown" ? "Unknown / unconfirmed" : r}
                    </option>
                  ))}
                </select>
              </VStack>
              <Button
                label={`Project path from epicentre [${lat.toFixed(3)}, ${lng.toFixed(3)}]`}
                icon={tornadoLoading ? undefined : <TornadoIcon className="w-4 h-4" />}
                isLoading={tornadoLoading}
                clickAction={projectManualTornado}
                width="100%"
              />
              {tornadoError && (
                <Text type="supporting" color="accent">
                  {tornadoError}
                </Text>
              )}
            </VStack>
          </div>

          {activeTornado && (
            <div style={cardStyle}>
              <VStack gap={1.5}>
                <HStack hAlign="between" vAlign="center">
                  <Text type="body" weight="bold">
                    Active projection
                  </Text>
                  <Badge variant={activeTornado.source === "nws" ? "success" : "warning"} label={activeTornado.source === "nws" ? "NWS warned" : "operator-placed"} />
                </HStack>
                <MetadataList columns="single">
                  <MetadataListItem label="Bearing">{activeTornado.bearingDeg}°</MetadataListItem>
                  <MetadataListItem label="Speed">{Math.round(activeTornado.speedKmh)} km/h</MetadataListItem>
                  <MetadataListItem label="Rating">{activeTornado.efRating === "unknown" ? "Unconfirmed" : activeTornado.efRating}</MetadataListItem>
                </MetadataList>
                <Text type="supporting" color="secondary">
                  {activeTornado.note}
                </Text>
                <VStack gap={0.5}>
                  {activeTornado.leadTimeMarkers.map((m) => (
                    <Text key={m.minutes} type="supporting" color="secondary">
                      +{m.minutes} min → [{m.position[1].toFixed(3)}, {m.position[0].toFixed(3)}]
                    </Text>
                  ))}
                </VStack>
              </VStack>
            </div>
          )}
        </VStack>
      )}
    </VStack>
  );
}
