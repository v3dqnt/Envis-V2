"use client";

import React, { useRef, useEffect } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

interface MapDashboardProps {
  hazardCenter: [number, number] | null;
  hazardRadius: number;
  routeGeoJSON: any;
  bypassRouteGeoJSON: any;
  isPlacingHazard: boolean;
  onMapClick: (lng: number, lat: number) => void;
  mapFlyToCoords: [number, number] | null;
  clearFlyTo: () => void;
  evacuationPoints: any;
  onSelectDestination: (coords: [number, number]) => void;
  activeDefenses?: string[];
  vulnerabilityZones?: any;
  hazardPolygons?: any;
  hazardOrigins?: any;
  hazardPaths?: any;
  groundReportZones?: any;
  temperatureGridData?: any;
  showTemperatureHeatmap?: boolean;
  /** Earthquake MMI band polygons from /api/earthquake-impact — FeatureCollection with an `mmi` (5-9) property per feature. */
  earthquakeBands?: any;
  /** Projected tornado from /api/tornado — { position, warningPolygon, corridor, centreline, leadTimeMarkers }. */
  tornado?: any;
}

// MMI-band colour scale — kept as real colour (not graphite) because it encodes
// shaking intensity, the same reasoning that kept hazard-type colours on the
// map through the rest of the app's retheme. Loosely follows the conventional
// ShakeMap palette: green (barely felt) through yellow/orange to red (severe).
const MMI_COLORS: [number, string][] = [
  [5, '#a3d977'],
  [6, '#e8e356'],
  [7, '#f5a83c'],
  [8, '#e8622c'],
  [9, '#c1121f'],
];
function mmiColor(mmi: number): string {
  let color = MMI_COLORS[0][1];
  for (const [threshold, c] of MMI_COLORS) {
    if (mmi >= threshold) color = c;
  }
  return color;
}

// Helper to generate circle coordinates for the GeoJSON polygon representing the dome
function getCirclePolygon(center: [number, number], radiusInMeters: number, points: number = 64) {
  const [lng, lat] = center;
  const coordinates = [];
  const radiusInKm = radiusInMeters / 1000;
  
  // Calculate degree steps based on latitude distortion
  const distanceX = radiusInKm / (111.32 * Math.cos((lat * Math.PI) / 180));
  const distanceY = radiusInKm / 110.574;

  for (let i = 0; i < points; i++) {
    const theta = (i / points) * (2 * Math.PI);
    const x = distanceX * Math.cos(theta);
    const y = distanceY * Math.sin(theta);
    coordinates.push([lng + x, lat + y]);
  }
  coordinates.push(coordinates[0]); // Close the polygon loop
  return [coordinates];
}

export default function MapDashboard({
  hazardCenter,
  hazardRadius,
  routeGeoJSON,
  bypassRouteGeoJSON,
  isPlacingHazard,
  onMapClick,
  mapFlyToCoords,
  clearFlyTo,
  evacuationPoints,
  onSelectDestination,
  activeDefenses = [],
  vulnerabilityZones,
  hazardPolygons,
  hazardOrigins,
  hazardPaths,
  groundReportZones,
  temperatureGridData,
  showTemperatureHeatmap = false,
  earthquakeBands,
  tornado,
}: MapDashboardProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);

  // Store click handler and active state in refs to avoid rebuilding the click listener
  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;
  
  const isPlacingHazardRef = useRef(isPlacingHazard);
  isPlacingHazardRef.current = isPlacingHazard;

  const onSelectDestinationRef = useRef(onSelectDestination);
  onSelectDestinationRef.current = onSelectDestination;

  // Initialize Map
  useEffect(() => {
    if (map.current) return;
    if (!mapContainer.current) return;

    const mapTilerKey = process.env.NEXT_PUBLIC_MAPTILER_API_KEY;
    const mapStyle = mapTilerKey
      ? `https://api.maptiler.com/maps/streets-v2/style.json?key=${mapTilerKey}`
      : 'https://demotiles.maplibre.org/style.json';

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: mapStyle,
      center: [-74.006, 40.7128], // starting position [lng, lat] (NYC)
      zoom: 13,
      pitch: 45,
      bearing: -17.6
    });

    // Force absolute positioning on the container to prevent collapse under Tailwind layout
    mapContainer.current.style.setProperty('position', 'absolute', 'important');

    map.current.addControl(new maplibregl.NavigationControl(), 'top-right');
    
    // Add layers when map style loads
    map.current.on('load', () => {
      const m = map.current!;

      // 1. Hazard Dome Source & Layer (3D Cylinder)
      m.addSource('hazard-dome-source', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: []
        }
      });

      m.addLayer({
        id: 'hazard-dome-layer',
        type: 'fill-extrusion',
        source: 'hazard-dome-source',
        paint: {
          'fill-extrusion-color': '#c1121f',
          'fill-extrusion-height': ['get', 'height'],
          'fill-extrusion-base': 0,
          'fill-extrusion-opacity': 0.35
        }
      });

      m.addLayer({
        id: 'hazard-dome-outline',
        type: 'line',
        source: 'hazard-dome-source',
        paint: {
          'line-color': '#c1121f',
          'line-width': 4,
          'line-opacity': 0.9
        }
      });

      // Defense Layers
      m.addSource('defense-seismic-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
      m.addLayer({
        id: 'defense-seismic-layer',
        type: 'line',
        source: 'defense-seismic-source',
        paint: {
          'line-color': '#669bbc',
          'line-width': 4,
          'line-dasharray': [2, 2],
          'line-opacity': 0.8
        }
      });

      m.addSource('defense-floodgate-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
      m.addLayer({
        id: 'defense-floodgate-layer',
        type: 'line',
        source: 'defense-floodgate-source',
        paint: {
          'line-color': '#669bbc',
          'line-width': 5,
          'line-opacity': 0.85
        }
      });

      m.addSource('defense-burn-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
      m.addLayer({
        id: 'defense-burn-layer',
        type: 'line',
        source: 'defense-burn-source',
        paint: {
          'line-color': '#c1121f',
          'line-width': 5,
          'line-opacity': 0.85
        }
      });

      m.addSource('defense-siren-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
      m.addLayer({
        id: 'defense-siren-layer',
        type: 'circle',
        source: 'defense-siren-source',
        paint: {
          'circle-radius': 8,
          'circle-color': '#c1121f',
          'circle-stroke-color': '#fdf0d5',
          'circle-stroke-width': 1.5,
          'circle-opacity': 0.8
        }
      });

      // Epicentre Source & Layers (pulsating visual center)
      m.addSource('epicentre-source', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: []
        }
      });

      m.addLayer({
        id: 'epicentre-glow',
        type: 'circle',
        source: 'epicentre-source',
        paint: {
          'circle-radius': 16,
          'circle-color': '#c1121f',
          'circle-opacity': 0.3,
          'circle-blur': 0.8
        }
      });

      m.addLayer({
        id: 'epicentre-core',
        type: 'circle',
        source: 'epicentre-source',
        paint: {
          'circle-radius': 7,
          'circle-color': '#c1121f',
          'circle-stroke-color': '#fdf0d5',
          'circle-stroke-width': 2
        }
      });

      // 2. Primary Route Source & Layer (compromised route)
      m.addSource('primary-route-source', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: []
        }
      });

      m.addLayer({
        id: 'primary-route-layer',
        type: 'line',
        source: 'primary-route-source',
        layout: {
          'line-cap': 'round',
          'line-join': 'round'
        },
        paint: {
          'line-color': [
            'match',
            ['get', 'congestion'],
            'heavy', '#c1121f',
            'moderate', '#780000',
            'clear', '#669bbc',
            '#669bbc' // fallback/default driving path color
          ],
          'line-width': 6,
          'line-opacity': 0.85
        }
      });

      // 3. Bypass Route Source & Layer (safe detour route)
      m.addSource('bypass-route-source', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: []
        }
      });

      m.addLayer({
        id: 'bypass-route-layer',
        type: 'line',
        source: 'bypass-route-source',
        layout: {
          'line-cap': 'round',
          'line-join': 'round'
        },
        paint: {
          'line-color': [
            'match',
            ['get', 'congestion'],
            'heavy', '#c1121f',
            'moderate', '#780000',
            'clear', '#669bbc',
            '#669bbc' // fallback/default bypass path color
          ],
          'line-width': 6,
          'line-opacity': 0.9
        }
      });

      // 4. Evacuation Points (Shelters) Source & Layers
      m.addSource('evacuation-points-source', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: []
        }
      });

      // Shelter outer glowing ring
      m.addLayer({
        id: 'evacuation-points-glow',
        type: 'circle',
        source: 'evacuation-points-source',
        paint: {
          'circle-radius': 14,
          'circle-color': '#669bbc',
          'circle-opacity': 0.4,
          'circle-blur': 0.6
        }
      });

      // Shelter solid core
      m.addLayer({
        id: 'evacuation-points-core',
        type: 'circle',
        source: 'evacuation-points-source',
        paint: {
          'circle-radius': 8,
          'circle-color': '#669bbc',
          'circle-stroke-color': '#fdf0d5',
          'circle-stroke-width': 2.5
        }
      });

      // 5. Vulnerability Zones Source & Layers
      m.addSource('vulnerability-zones-source', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: []
        }
      });

      // High severity zones (Flag Red)
      m.addLayer({
        id: 'vulnerability-zones-high',
        type: 'circle',
        source: 'vulnerability-zones-source',
        filter: ['==', ['get', 'severity'], 'high'],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 30, 15, 100],
          'circle-color': '#c1121f',
          'circle-opacity': 0.25,
          'circle-stroke-color': '#c1121f',
          'circle-stroke-width': 3,
          'circle-stroke-opacity': 0.8
        }
      });

      // Medium severity zones (Molten Lava)
      m.addLayer({
        id: 'vulnerability-zones-medium',
        type: 'circle',
        source: 'vulnerability-zones-source',
        filter: ['==', ['get', 'severity'], 'medium'],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 25, 15, 80],
          'circle-color': '#780000',
          'circle-opacity': 0.2,
          'circle-stroke-color': '#780000',
          'circle-stroke-width': 2.5,
          'circle-stroke-opacity': 0.7
        }
      });

      // Low severity zones (Steel Blue)
      m.addLayer({
        id: 'vulnerability-zones-low',
        type: 'circle',
        source: 'vulnerability-zones-source',
        filter: ['==', ['get', 'severity'], 'low'],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 20, 15, 60],
          'circle-color': '#669bbc',
          'circle-opacity': 0.15,
          'circle-stroke-color': '#669bbc',
          'circle-stroke-width': 2,
          'circle-stroke-opacity': 0.6
        }
      });

      // 5a. Real hazard POLYGONS — actual OSM geometry (forest blocks, water bodies,
      // river corridors) and elevation-derived terrain cells, not approximated circles.
      m.addSource('hazard-polygons-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      const severityColorExpr: any = [
        'match', ['get', 'severity'],
        'high', '#c1121f',
        'medium', '#780000',
        'low', '#669bbc',
        '#4a6573'
      ];

      m.addLayer({
        id: 'hazard-polygons-fill',
        type: 'fill',
        source: 'hazard-polygons-source',
        paint: {
          'fill-color': severityColorExpr,
          'fill-opacity': [
            'match', ['get', 'severity'],
            'high', 0.42,
            'medium', 0.3,
            'low', 0.18,
            0.2
          ]
        }
      });

      m.addLayer({
        id: 'hazard-polygons-outline',
        type: 'line',
        source: 'hazard-polygons-source',
        paint: {
          'line-color': severityColorExpr,
          'line-width': 1.5,
          'line-opacity': 0.9
        }
      });

      m.on('mousemove', 'hazard-polygons-fill', () => { m.getCanvas().style.cursor = 'pointer'; });
      m.on('mouseleave', 'hazard-polygons-fill', () => { m.getCanvas().style.cursor = ''; });
      m.on('click', 'hazard-polygons-fill', (e: any) => {
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties || {};
        new maplibregl.Popup({ closeButton: true, maxWidth: '280px' })
          .setLngLat(e.lngLat)
          .setHTML(
            `<div style="font-family:system-ui;font-size:11px;line-height:1.45">
               <div style="font-weight:800;margin-bottom:3px">${p.hazardType || 'Hazard'} · ${String(p.severity || '').toUpperCase()}</div>
               ${p.name ? `<div style="font-weight:600;margin-bottom:2px">${p.name}</div>` : ''}
               <div style="color:#669bbc">${p.reason || ''}</div>
             </div>`
          )
          .addTo(m);
      });

      // 5b. Hazard Origin Points & Spread Paths — multi-hazard toggle view (GAIA Prevent)
      const hazardColorExpr: any = [
        'match', ['get', 'hazardType'],
        'Wildfire', '#c1121f',
        'Flooding', '#669bbc',
        'Toxic Plume', '#6b9e6b',
        'Earthquake', '#780000',
        'Tornado', '#669bbc',
        'Radiation Leak', '#9e9e6b',
        'Chemical Spill', '#9e8e6b',
        'Blizzard', '#a8d4f0',
        'Volcanic Eruption', '#c1121f',
        'Tropical Cyclone', '#669bbc',
        'Heatwave', '#c1121f',
        'Drought', '#780000',
        'Extreme Cold', '#a8d4f0',
        'Thunderstorm', '#780000',
        'Landslide', '#4a6573',
        '#4a6573'
      ];

      m.addSource('hazard-paths-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
      m.addLayer({
        id: 'hazard-paths',
        type: 'line',
        source: 'hazard-paths-source',
        paint: {
          'line-color': hazardColorExpr,
          'line-width': 3,
          'line-dasharray': [2, 1.5],
          'line-opacity': 0.85
        }
      });

      m.addSource('hazard-origins-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
      m.addLayer({
        id: 'hazard-origins',
        type: 'circle',
        source: 'hazard-origins-source',
        paint: {
          'circle-radius': 8,
          'circle-color': hazardColorExpr,
          'circle-opacity': 0.95,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2
        }
      });
      m.addLayer({
        id: 'hazard-origins-label',
        type: 'symbol',
        source: 'hazard-origins-source',
        layout: {
          'text-field': ['get', 'hazardType'],
          'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
          'text-size': 11,
          'text-offset': [0, 1.4],
          'text-anchor': 'top'
        },
        paint: {
          'text-color': '#fdf0d5',
          'text-halo-color': '#003049',
          'text-halo-width': 1.5
        }
      });

      // 5c. On-ground report — Tavily-sourced areas reported as currently or
      // historically affected, geocoded and marked separately from the
      // predictive polygons above. Current = solid red, historical = dashed steel-blue.
      m.addSource('ground-report-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      m.addLayer({
        id: 'ground-report-fill',
        type: 'fill',
        source: 'ground-report-source',
        paint: {
          'fill-color': ['match', ['get', 'status'], 'current', '#c1121f', '#669bbc'],
          'fill-opacity': 0.22
        }
      });

      m.addLayer({
        id: 'ground-report-outline',
        type: 'line',
        source: 'ground-report-source',
        paint: {
          'line-color': ['match', ['get', 'status'], 'current', '#c1121f', '#669bbc'],
          'line-width': 2,
          'line-dasharray': ['match', ['get', 'status'], 'current', ['literal', [1, 0]], ['literal', [2, 1.5]]],
          'line-opacity': 0.95
        }
      });

      m.on('mousemove', 'ground-report-fill', () => { m.getCanvas().style.cursor = 'pointer'; });
      m.on('mouseleave', 'ground-report-fill', () => { m.getCanvas().style.cursor = ''; });
      m.on('click', 'ground-report-fill', (e: any) => {
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties || {};
        new maplibregl.Popup({ closeButton: true, maxWidth: '280px' })
          .setLngLat(e.lngLat)
          .setHTML(
            `<div style="font-family:system-ui;font-size:11px;line-height:1.45">
               <div style="font-weight:800;margin-bottom:3px">${p.hazardType || 'Hazard'} · ${String(p.status || '').toUpperCase()}</div>
               ${p.areaName ? `<div style="font-weight:600;margin-bottom:2px">${p.areaName}</div>` : ''}
               <div style="color:#669bbc">${p.summary || ''}</div>
               ${p.sourceUrl ? `<a href="${p.sourceUrl}" target="_blank" rel="noopener noreferrer" style="color:#4a6573;font-size:10px">${p.sourceTitle || 'source'}</a>` : ''}
             </div>`
          )
          .addTo(m);
      });

      // 5d. Earthquake MMI shaking-intensity bands (/api/earthquake-impact)
      m.addSource('earthquake-mmi-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
      m.addLayer({
        id: 'earthquake-mmi-fill',
        type: 'fill',
        source: 'earthquake-mmi-source',
        paint: {
          'fill-color': ['get', 'color'],
          // Higher MMI bands are drawn last (see setData ordering) and get
          // more opacity, so the most severe band reads as the "core".
          'fill-opacity': ['interpolate', ['linear'], ['get', 'mmi'], 5, 0.12, 9, 0.4]
        }
      });
      m.addLayer({
        id: 'earthquake-mmi-line',
        type: 'line',
        source: 'earthquake-mmi-source',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 1.5,
          'line-opacity': 0.8
        }
      });
      m.addLayer({
        id: 'earthquake-mmi-label',
        type: 'symbol',
        source: 'earthquake-mmi-source',
        layout: {
          'text-field': ['concat', 'MMI ', ['get', 'mmi']],
          'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
          'text-size': 10,
          'symbol-placement': 'line-center'
        },
        paint: {
          'text-color': '#fdf0d5',
          'text-halo-color': '#001d2e',
          'text-halo-width': 1.5
        }
      });

      // 5e. Tornado — real NWS warning polygon, projected corridor, centreline
      // with directional chevrons, and current position (/api/tornado).
      m.addSource('tornado-warning-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
      m.addLayer({
        id: 'tornado-warning-fill',
        type: 'fill',
        source: 'tornado-warning-source',
        paint: { 'fill-color': '#a855f7', 'fill-opacity': 0.15 }
      });
      m.addLayer({
        id: 'tornado-warning-line',
        type: 'line',
        source: 'tornado-warning-source',
        paint: { 'line-color': '#a855f7', 'line-width': 2, 'line-dasharray': [3, 1.5] }
      });

      m.addSource('tornado-corridor-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
      m.addLayer({
        id: 'tornado-corridor-fill',
        type: 'fill',
        source: 'tornado-corridor-source',
        paint: { 'fill-color': '#7c3aed', 'fill-opacity': 0.3 }
      });

      m.addSource('tornado-path-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
      m.addLayer({
        id: 'tornado-path-line',
        type: 'line',
        source: 'tornado-path-source',
        filter: ['==', ['get', 'kind'], 'centreline'],
        paint: { 'line-color': '#7c3aed', 'line-width': 3, 'line-opacity': 0.9 }
      });
      // Directional chevrons along the centreline, oriented to the tornado's
      // bearing — the "where it is moving" graphic, built from geometry rather
      // than a sprite image since the map has no icon-loading pipeline.
      m.addLayer({
        id: 'tornado-path-chevrons',
        type: 'symbol',
        source: 'tornado-path-source',
        filter: ['==', ['get', 'kind'], 'chevron'],
        layout: {
          'text-field': '▲',
          'text-size': 16,
          'text-rotate': ['get', 'bearingDeg'],
          'text-rotation-alignment': 'map',
          'text-allow-overlap': true
        },
        paint: { 'text-color': '#a855f7', 'text-halo-color': '#001d2e', 'text-halo-width': 1.5 }
      });
      // Lead-time markers (5/10/15/30 min)
      m.addLayer({
        id: 'tornado-lead-time-points',
        type: 'circle',
        source: 'tornado-path-source',
        filter: ['==', ['get', 'kind'], 'leadtime'],
        paint: { 'circle-radius': 4, 'circle-color': '#a855f7', 'circle-stroke-color': '#fdf0d5', 'circle-stroke-width': 1.5 }
      });
      m.addLayer({
        id: 'tornado-lead-time-label',
        type: 'symbol',
        source: 'tornado-path-source',
        filter: ['==', ['get', 'kind'], 'leadtime'],
        layout: {
          'text-field': ['concat', ['get', 'minutes'], ' min'],
          'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
          'text-size': 10,
          'text-offset': [0, 1.2],
          'text-anchor': 'top'
        },
        paint: { 'text-color': '#a855f7', 'text-halo-color': '#001d2e', 'text-halo-width': 1.5 }
      });

      m.addSource('tornado-position-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
      m.addLayer({
        id: 'tornado-position-glow',
        type: 'circle',
        source: 'tornado-position-source',
        paint: { 'circle-radius': 18, 'circle-color': '#a855f7', 'circle-opacity': 0.3, 'circle-blur': 0.8 }
      });
      m.addLayer({
        id: 'tornado-position-core',
        type: 'circle',
        source: 'tornado-position-source',
        paint: { 'circle-radius': 8, 'circle-color': '#a855f7', 'circle-stroke-color': '#fdf0d5', 'circle-stroke-width': 2 }
      });
      m.addLayer({
        id: 'tornado-position-label',
        type: 'symbol',
        source: 'tornado-position-source',
        layout: {
          'text-field': ['get', 'label'],
          'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
          'text-size': 11,
          'text-offset': [0, 1.6],
          'text-anchor': 'top'
        },
        paint: { 'text-color': '#fdf0d5', 'text-halo-color': '#001d2e', 'text-halo-width': 1.5 }
      });

      // Add hover popup for vulnerability zones
      m.on('mousemove', 'vulnerability-zones-high', () => { m.getCanvas().style.cursor = 'pointer'; });
      m.on('mousemove', 'vulnerability-zones-medium', () => { m.getCanvas().style.cursor = 'pointer'; });
      m.on('mousemove', 'vulnerability-zones-low', () => { m.getCanvas().style.cursor = 'pointer'; });
      m.on('mouseleave', 'vulnerability-zones-high', () => { m.getCanvas().style.cursor = ''; });
      m.on('mouseleave', 'vulnerability-zones-medium', () => { m.getCanvas().style.cursor = ''; });
      m.on('mouseleave', 'vulnerability-zones-low', () => { m.getCanvas().style.cursor = ''; });

      // 6. Temperature Heatmap Source & Layers
      m.addSource('temperature-heatmap-source', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: []
        }
      });

      // Heatmap layer — smooth temperature interpolation from grid points
      m.addLayer({
        id: 'temperature-heatmap',
        type: 'heatmap',
        source: 'temperature-heatmap-source',
        paint: {
          // Weight is scaled to a realistic ambient range (5-42C), not the full 0-50C span,
          // so normal hot-day readings actually reach high density instead of sitting mid-scale.
          'heatmap-weight': [
            'interpolate', ['linear'], ['get', 'temperature'],
            5, 0,
            42, 1
          ],
          'heatmap-intensity': 1.4,
          'heatmap-radius': [
            'interpolate', ['linear'], ['zoom'],
            5, 35,
            10, 55,
            15, 90
          ],
          'heatmap-color': [
            'interpolate', ['linear'], ['heatmap-density'],
            0, 'rgba(0,48,73,0)',
            0.1, 'rgb(102,155,188)',
            0.25, 'rgb(128,175,210)',
            0.4, 'rgb(253,219,199)',
            0.55, 'rgb(239,138,98)',
            0.7, 'rgb(193,18,31)',
            0.85, 'rgb(120,0,0)',
            1, 'rgb(60,0,0)'
          ],
          'heatmap-opacity': 0.55
        }
      });

      // Grid point circles — user-visible reference dots
      m.addLayer({
        id: 'temperature-points',
        type: 'circle',
        source: 'temperature-heatmap-source',
        paint: {
          'circle-radius': 7,
          'circle-color': [
            'interpolate', ['linear'], ['get', 'temperature'],
            5, '#003049',
            15, '#669bbc',
            22, '#a8d4f0',
            26, '#fdf0d5',
            30, '#f4a582',
            34, '#c1121f',
            38, '#780000',
            42, '#4a0000'
          ],
          'circle-opacity': 0.9,
          'circle-stroke-color': '#fdf0d5',
          'circle-stroke-width': 0.5
        }
      });

      // Temperature labels at each grid point
      m.addLayer({
        id: 'temperature-labels',
        type: 'symbol',
        source: 'temperature-heatmap-source',
        layout: {
          'text-field': ['get', 'temperatureLabel'],
          'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 5, 0, 10, 0, 12, 11],
          'text-offset': [0, -1.8]
        },
        paint: {
          'text-color': '#fdf0d5',
          'text-halo-color': '#003049',
          'text-halo-width': 1.5,
          'text-opacity': 0.85
        }
      });

      // Start hidden by default
      m.setLayoutProperty('temperature-heatmap', 'visibility', 'none');
      m.setLayoutProperty('temperature-points', 'visibility', 'none');
      m.setLayoutProperty('temperature-labels', 'visibility', 'none');

      // 7. Add 3D buildings layer if not present
      if (!m.getLayer('3d-buildings')) {
         const layers = m.getStyle().layers;
         let labelLayerId;
         if (layers) {
             for (let i = 0; i < layers.length; i++) {
                 const layer = layers[i] as any;
                 if (layer.type === 'symbol' && layer.layout && layer.layout['text-field']) {
                     labelLayerId = layer.id;
                     break;
                 }
             }
         }

         let vectorSource = 'v3';
         const sources = m.getStyle().sources;
         if (sources) {
             const sourceKeys = Object.keys(sources);
             for (const key of sourceKeys) {
                 if (sources[key].type === 'vector') {
                     vectorSource = key;
                     break;
                 }
             }
         }

         try {
           m.addLayer(
               {
                   'id': '3d-buildings',
                   'source': vectorSource,
                   'source-layer': 'building',
                   // MapTiler's building schema exposes render_height/hide_3d, not the
                   // Mapbox-style 'extrude' boolean field this filter used to check.
                   'filter': ['all', ['!=', ['get', 'hide_3d'], true], ['>', ['get', 'render_height'], 0]],
                   'type': 'fill-extrusion',
                   'minzoom': 15,
                   'paint': {
                       'fill-extrusion-color': '#4a6573',
                       'fill-extrusion-height': [
                           'interpolate', ['linear'], ['zoom'],
                           15, 0,
                           15.05, ['get', 'render_height']
                       ],
                       'fill-extrusion-base': [
                           'interpolate', ['linear'], ['zoom'],
                           15, 0,
                           15.05, ['get', 'render_min_height']
                       ],
                       'fill-extrusion-opacity': 0.6
                   }
               },
               labelLayerId
           );
         } catch (err) {
           console.warn('3D buildings layer unavailable for this style:', err);
         }
      }
    });

    // Register single click handler
    const handleMapClick = (e: maplibregl.MapMouseEvent) => {
      if (isPlacingHazardRef.current && onMapClickRef.current) {
        onMapClickRef.current(e.lngLat.lng, e.lngLat.lat);
      }
    };
    map.current.on('click', handleMapClick);

    // Click on evacuation shelter to set destination
    const handleShelterClick = (e: any) => {
      if (e.features && e.features[0] && onSelectDestinationRef.current) {
        const coords = e.features[0].geometry.coordinates;
        onSelectDestinationRef.current([coords[0], coords[1]]);
      }
    };
    map.current.on('click', 'evacuation-points-core', handleShelterClick);

    // Hover effect on shelters
    const handleMouseEnter = () => {
      if (map.current) map.current.getCanvas().style.cursor = 'pointer';
    };
    const handleMouseLeave = () => {
      if (map.current) map.current.getCanvas().style.cursor = isPlacingHazardRef.current ? 'crosshair' : '';
    };
    map.current.on('mouseenter', 'evacuation-points-core', handleMouseEnter);
    map.current.on('mouseleave', 'evacuation-points-core', handleMouseLeave);

    // Setup ResizeObserver for robust canvas fitting
    const resizeObserver = new ResizeObserver(() => {
      if (map.current) {
        map.current.resize();
      }
    });
    resizeObserver.observe(mapContainer.current);

    return () => {
      resizeObserver.disconnect();
      if (map.current) {
        map.current.off('click', handleMapClick);
        map.current.remove();
        map.current = null;
      }
    };
  }, []);

  // Update Hazard Dome & Route Layers on prop changes
  useEffect(() => {
    if (!map.current) return;

    const m = map.current;
    const updateLayers = () => {
      // 1. Update Dome
      const domeSource = m.getSource('hazard-dome-source') as maplibregl.GeoJSONSource;
      if (domeSource) {
        if (hazardCenter) {
          const circleCoords = getCirclePolygon(hazardCenter, hazardRadius);
          domeSource.setData({
            type: 'Feature',
            geometry: {
              type: 'Polygon',
              coordinates: circleCoords
            },
            properties: {
              height: 250 // height of dome in meters
            }
          });
          
          if (m.getLayer('hazard-dome-layer')) m.setLayoutProperty('hazard-dome-layer', 'visibility', 'visible');
          if (m.getLayer('hazard-dome-outline')) m.setLayoutProperty('hazard-dome-outline', 'visibility', 'visible');
        } else {
          if (m.getLayer('hazard-dome-layer')) m.setLayoutProperty('hazard-dome-layer', 'visibility', 'none');
          if (m.getLayer('hazard-dome-outline')) m.setLayoutProperty('hazard-dome-outline', 'visibility', 'none');
        }
      }

      // Update Epicentre Marker
      const epicentreSource = m.getSource('epicentre-source') as maplibregl.GeoJSONSource;
      if (epicentreSource) {
        if (hazardCenter) {
          epicentreSource.setData({
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: hazardCenter
            },
            properties: {}
          });
          if (m.getLayer('epicentre-core')) m.setLayoutProperty('epicentre-core', 'visibility', 'visible');
          if (m.getLayer('epicentre-glow')) m.setLayoutProperty('epicentre-glow', 'visibility', 'visible');
        } else {
          if (m.getLayer('epicentre-core')) m.setLayoutProperty('epicentre-core', 'visibility', 'none');
          if (m.getLayer('epicentre-glow')) m.setLayoutProperty('epicentre-glow', 'visibility', 'none');
        }
      }

      // Update Seismic Dampening Ring (at 0.8 * radius)
      const seismicSource = m.getSource('defense-seismic-source') as maplibregl.GeoJSONSource;
      if (seismicSource) {
        if (hazardCenter && activeDefenses.includes("Reinforced Foundations")) {
          seismicSource.setData({
            type: 'Feature',
            geometry: {
              type: 'Polygon',
              coordinates: getCirclePolygon(hazardCenter, hazardRadius * 0.8)
            },
            properties: {}
          });
          if (m.getLayer('defense-seismic-layer')) m.setLayoutProperty('defense-seismic-layer', 'visibility', 'visible');
        } else {
          if (m.getLayer('defense-seismic-layer')) m.setLayoutProperty('defense-seismic-layer', 'visibility', 'none');
        }
      }

      // Update Floodgate Barrier Ring (at 1.15 * radius)
      const floodgateSource = m.getSource('defense-floodgate-source') as maplibregl.GeoJSONSource;
      if (floodgateSource) {
        if (hazardCenter && activeDefenses.includes("Automated Floodgates")) {
          floodgateSource.setData({
            type: 'Feature',
            geometry: {
              type: 'Polygon',
              coordinates: getCirclePolygon(hazardCenter, hazardRadius * 1.15)
            },
            properties: {}
          });
          if (m.getLayer('defense-floodgate-layer')) m.setLayoutProperty('defense-floodgate-layer', 'visibility', 'visible');
        } else {
          if (m.getLayer('defense-floodgate-layer')) m.setLayoutProperty('defense-floodgate-layer', 'visibility', 'none');
        }
      }

      // Update Burn Barrier Ring (at 1.35 * radius)
      const burnSource = m.getSource('defense-burn-source') as maplibregl.GeoJSONSource;
      if (burnSource) {
        if (hazardCenter && activeDefenses.includes("Controlled Burn Barriers")) {
          burnSource.setData({
            type: 'Feature',
            geometry: {
              type: 'Polygon',
              coordinates: getCirclePolygon(hazardCenter, hazardRadius * 1.35)
            },
            properties: {}
          });
          if (m.getLayer('defense-burn-layer')) m.setLayoutProperty('defense-burn-layer', 'visibility', 'visible');
        } else {
          if (m.getLayer('defense-burn-layer')) m.setLayoutProperty('defense-burn-layer', 'visibility', 'none');
        }
      }

      // Update Sirens Sensor Grid (6 points surrounding epicentre at 1.5 * radius)
      const sirenSource = m.getSource('defense-siren-source') as maplibregl.GeoJSONSource;
      if (sirenSource) {
        if (hazardCenter && activeDefenses.includes("Siren Alert Network")) {
          const [lng, lat] = hazardCenter;
          const distMeters = hazardRadius * 1.5;
          const deltaLat = distMeters / 110574;
          const deltaLng = distMeters / (111320 * Math.cos((lat * Math.PI) / 180));
          
          const features = [];
          for (let i = 0; i < 6; i++) {
            const angle = (i / 6) * 2 * Math.PI;
            features.push({
              type: 'Feature',
              geometry: {
                type: 'Point',
                coordinates: [lng + deltaLng * Math.cos(angle), lat + deltaLat * Math.sin(angle)]
              },
              properties: {}
            });
          }

          sirenSource.setData({
            type: 'FeatureCollection',
            features: features as any
          });
          if (m.getLayer('defense-siren-layer')) m.setLayoutProperty('defense-siren-layer', 'visibility', 'visible');
        } else {
          if (m.getLayer('defense-siren-layer')) m.setLayoutProperty('defense-siren-layer', 'visibility', 'none');
        }
      }

      // 2. Update Primary Route
      const routeSource = m.getSource('primary-route-source') as maplibregl.GeoJSONSource;
      if (routeSource) {
        if (routeGeoJSON) {
          routeSource.setData(routeGeoJSON);
          if (m.getLayer('primary-route-layer')) m.setLayoutProperty('primary-route-layer', 'visibility', 'visible');
          
          if (m.getLayer('primary-route-layer')) {
            // Paint orange dashed line if compromised, solid blue if safe
            m.setPaintProperty(
              'primary-route-layer',
              'line-color',
              bypassRouteGeoJSON ? '#c1121f' : '#669bbc'
            );
            m.setPaintProperty(
              'primary-route-layer',
              'line-dasharray',
              bypassRouteGeoJSON ? [2, 2] : [1, 0]
            );
          }
        } else {
          if (m.getLayer('primary-route-layer')) m.setLayoutProperty('primary-route-layer', 'visibility', 'none');
        }
      }

      // 3. Update Bypass Route
      const bypassSource = m.getSource('bypass-route-source') as maplibregl.GeoJSONSource;
      if (bypassSource) {
        if (bypassRouteGeoJSON) {
          bypassSource.setData(bypassRouteGeoJSON);
          if (m.getLayer('bypass-route-layer')) m.setLayoutProperty('bypass-route-layer', 'visibility', 'visible');
        } else {
          if (m.getLayer('bypass-route-layer')) m.setLayoutProperty('bypass-route-layer', 'visibility', 'none');
        }
      }

      // 4. Update Evacuation Points
      const sheltersSource = m.getSource('evacuation-points-source') as maplibregl.GeoJSONSource;
      if (sheltersSource) {
        if (evacuationPoints) {
          sheltersSource.setData(evacuationPoints);
          if (m.getLayer('evacuation-points-core')) m.setLayoutProperty('evacuation-points-core', 'visibility', 'visible');
          if (m.getLayer('evacuation-points-glow')) m.setLayoutProperty('evacuation-points-glow', 'visibility', 'visible');
        } else {
          if (m.getLayer('evacuation-points-core')) m.setLayoutProperty('evacuation-points-core', 'visibility', 'none');
          if (m.getLayer('evacuation-points-glow')) m.setLayoutProperty('evacuation-points-glow', 'visibility', 'none');
        }
      }

      // 5. Update Vulnerability Zones
      const vulnSource = m.getSource('vulnerability-zones-source') as maplibregl.GeoJSONSource;
      if (vulnSource) {
        if (vulnerabilityZones && vulnerabilityZones.features && vulnerabilityZones.features.length > 0) {
          vulnSource.setData(vulnerabilityZones);
          if (m.getLayer('vulnerability-zones-high')) m.setLayoutProperty('vulnerability-zones-high', 'visibility', 'visible');
          if (m.getLayer('vulnerability-zones-medium')) m.setLayoutProperty('vulnerability-zones-medium', 'visibility', 'visible');
          if (m.getLayer('vulnerability-zones-low')) m.setLayoutProperty('vulnerability-zones-low', 'visibility', 'visible');
        } else {
          if (m.getLayer('vulnerability-zones-high')) m.setLayoutProperty('vulnerability-zones-high', 'visibility', 'none');
          if (m.getLayer('vulnerability-zones-medium')) m.setLayoutProperty('vulnerability-zones-medium', 'visibility', 'none');
          if (m.getLayer('vulnerability-zones-low')) m.setLayoutProperty('vulnerability-zones-low', 'visibility', 'none');
        }
      }

      // 5c. Update real hazard polygons
      const polySource = m.getSource('hazard-polygons-source') as maplibregl.GeoJSONSource;
      if (polySource) {
        const hasPolys = hazardPolygons && hazardPolygons.features && hazardPolygons.features.length > 0;
        polySource.setData(hasPolys ? hazardPolygons : { type: 'FeatureCollection', features: [] });
        if (m.getLayer('hazard-polygons-fill')) m.setLayoutProperty('hazard-polygons-fill', 'visibility', hasPolys ? 'visible' : 'none');
        if (m.getLayer('hazard-polygons-outline')) m.setLayoutProperty('hazard-polygons-outline', 'visibility', hasPolys ? 'visible' : 'none');
      }

      // 6. Update Hazard Origins & Paths (multi-hazard toggle view)
      const originsSource = m.getSource('hazard-origins-source') as maplibregl.GeoJSONSource;
      if (originsSource) {
        const hasOrigins = hazardOrigins && hazardOrigins.features && hazardOrigins.features.length > 0;
        originsSource.setData(hasOrigins ? hazardOrigins : { type: 'FeatureCollection', features: [] });
        if (m.getLayer('hazard-origins')) m.setLayoutProperty('hazard-origins', 'visibility', hasOrigins ? 'visible' : 'none');
        if (m.getLayer('hazard-origins-label')) m.setLayoutProperty('hazard-origins-label', 'visibility', hasOrigins ? 'visible' : 'none');
      }
      const pathsSource = m.getSource('hazard-paths-source') as maplibregl.GeoJSONSource;
      if (pathsSource) {
        const hasPaths = hazardPaths && hazardPaths.features && hazardPaths.features.length > 0;
        pathsSource.setData(hasPaths ? hazardPaths : { type: 'FeatureCollection', features: [] });
        if (m.getLayer('hazard-paths')) m.setLayoutProperty('hazard-paths', 'visibility', hasPaths ? 'visible' : 'none');
      }

      // 6b. Update on-ground report zones (Tavily-sourced current/historical areas)
      const groundReportSource = m.getSource('ground-report-source') as maplibregl.GeoJSONSource;
      if (groundReportSource) {
        const hasReport = groundReportZones && groundReportZones.features && groundReportZones.features.length > 0;
        groundReportSource.setData(hasReport ? groundReportZones : { type: 'FeatureCollection', features: [] });
        if (m.getLayer('ground-report-fill')) m.setLayoutProperty('ground-report-fill', 'visibility', hasReport ? 'visible' : 'none');
        if (m.getLayer('ground-report-outline')) m.setLayoutProperty('ground-report-outline', 'visibility', hasReport ? 'visible' : 'none');
      }

      // 7. Update earthquake MMI bands. Sorted ascending so the highest-intensity
      // (most opaque) band draws last, on top of the wider, fainter outer bands.
      const mmiSource = m.getSource('earthquake-mmi-source') as maplibregl.GeoJSONSource;
      if (mmiSource) {
        const hasBands = earthquakeBands?.features?.length > 0;
        if (hasBands) {
          const sorted = [...earthquakeBands.features].sort((a, b) => (a.properties?.mmi ?? 0) - (b.properties?.mmi ?? 0));
          mmiSource.setData({
            type: 'FeatureCollection',
            features: sorted.map((f: any) => ({
              ...f,
              properties: { ...f.properties, color: mmiColor(f.properties?.mmi ?? 5) }
            }))
          });
        } else {
          mmiSource.setData({ type: 'FeatureCollection', features: [] });
        }
        for (const id of ['earthquake-mmi-fill', 'earthquake-mmi-line', 'earthquake-mmi-label']) {
          if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', hasBands ? 'visible' : 'none');
        }
      }

      // 8. Update tornado — warning polygon (if real NWS data), projected
      // corridor, centreline + directional chevrons, lead-time markers, and
      // current position. `tornado` is the raw /api/tornado feature/response.
      const hasTornado = !!tornado;

      const warnSource = m.getSource('tornado-warning-source') as maplibregl.GeoJSONSource;
      if (warnSource) {
        const hasWarning = hasTornado && Array.isArray(tornado.warningPolygon);
        warnSource.setData(
          hasWarning
            ? { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [tornado.warningPolygon] }, properties: {} }] }
            : { type: 'FeatureCollection', features: [] }
        );
        for (const id of ['tornado-warning-fill', 'tornado-warning-line']) {
          if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', hasWarning ? 'visible' : 'none');
        }
      }

      const corridorSource = m.getSource('tornado-corridor-source') as maplibregl.GeoJSONSource;
      if (corridorSource) {
        const hasCorridor = hasTornado && Array.isArray(tornado.corridor);
        corridorSource.setData(
          hasCorridor
            ? { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [tornado.corridor] }, properties: {} }] }
            : { type: 'FeatureCollection', features: [] }
        );
        if (m.getLayer('tornado-corridor-fill')) m.setLayoutProperty('tornado-corridor-fill', 'visibility', hasCorridor ? 'visible' : 'none');
      }

      const pathSource = m.getSource('tornado-path-source') as maplibregl.GeoJSONSource;
      if (pathSource) {
        const pathVisible = hasTornado && Array.isArray(tornado.centreline);
        if (pathVisible) {
          const features: any[] = [
            { type: 'Feature', geometry: { type: 'LineString', coordinates: tornado.centreline }, properties: { kind: 'centreline' } }
          ];
          // A chevron at each lead-time marker, all pointing along the bearing —
          // this is the "where it is moving" graphic.
          for (const marker of tornado.leadTimeMarkers ?? []) {
            features.push({
              type: 'Feature',
              geometry: { type: 'Point', coordinates: marker.position },
              properties: { kind: 'chevron', bearingDeg: tornado.bearingDeg }
            });
            features.push({
              type: 'Feature',
              geometry: { type: 'Point', coordinates: marker.position },
              properties: { kind: 'leadtime', minutes: marker.minutes }
            });
          }
          pathSource.setData({ type: 'FeatureCollection', features });
        } else {
          pathSource.setData({ type: 'FeatureCollection', features: [] });
        }
        for (const id of ['tornado-path-line', 'tornado-path-chevrons', 'tornado-lead-time-points', 'tornado-lead-time-label']) {
          if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', pathVisible ? 'visible' : 'none');
        }
      }

      const positionSource = m.getSource('tornado-position-source') as maplibregl.GeoJSONSource;
      if (positionSource) {
        const hasPosition = hasTornado && Array.isArray(tornado.position);
        positionSource.setData(
          hasPosition
            ? {
                type: 'FeatureCollection',
                features: [{
                  type: 'Feature',
                  geometry: { type: 'Point', coordinates: tornado.position },
                  properties: { label: `${tornado.efRating === 'unknown' ? 'Tornado' : tornado.efRating} · ${Math.round(tornado.speedKmh)} km/h` }
                }]
              }
            : { type: 'FeatureCollection', features: [] }
        );
        for (const id of ['tornado-position-glow', 'tornado-position-core', 'tornado-position-label']) {
          if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', hasPosition ? 'visible' : 'none');
        }
      }
    };

    if (m.isStyleLoaded()) {
      updateLayers();
    } else {
      m.once('idle', updateLayers);
    }
  }, [hazardCenter, hazardRadius, routeGeoJSON, bypassRouteGeoJSON, evacuationPoints, activeDefenses, vulnerabilityZones, hazardPolygons, hazardOrigins, hazardPaths, earthquakeBands, tornado, groundReportZones]);

  // Temperature Heatmap update effect — separate from other layers for clarity
  useEffect(() => {
    if (!map.current) return;
    const m = map.current;

    const updateTempLayers = () => {
      const tempSource = m.getSource('temperature-heatmap-source') as maplibregl.GeoJSONSource;
      if (!tempSource) return;

      const isVisible = showTemperatureHeatmap && temperatureGridData && temperatureGridData.features && temperatureGridData.features.length > 0;

      if (isVisible) {
        tempSource.setData(temperatureGridData);
        m.setLayoutProperty('temperature-heatmap', 'visibility', 'visible');
        m.setLayoutProperty('temperature-points', 'visibility', 'visible');
        m.setLayoutProperty('temperature-labels', 'visibility', 'visible');
      } else {
        m.setLayoutProperty('temperature-heatmap', 'visibility', 'none');
        m.setLayoutProperty('temperature-points', 'visibility', 'none');
        m.setLayoutProperty('temperature-labels', 'visibility', 'none');
      }
    };

    if (m.isStyleLoaded()) {
      updateTempLayers();
    } else {
      m.once('idle', updateTempLayers);
    }
  }, [temperatureGridData, showTemperatureHeatmap]);

  // Handle crosshair cursor when placing hazard dome
  useEffect(() => {
    if (!map.current) return;
    const canvas = map.current.getCanvas();
    if (isPlacingHazard) {
      canvas.style.cursor = 'crosshair';
    } else {
      canvas.style.cursor = '';
    }
  }, [isPlacingHazard]);

  // Handle fly-to requests
  useEffect(() => {
    if (!map.current || !mapFlyToCoords) return;
    map.current.flyTo({
      center: mapFlyToCoords,
      zoom: 14,
      essential: true
    });
    clearFlyTo();
  }, [mapFlyToCoords, clearFlyTo]);

  return (
    <div className="w-full h-full relative flex-grow">
      <style>{`
        .w-full.h-full.relative.flex-grow > .maplibregl-map {
          position: absolute !important;
          width: 100% !important;
          height: 100% !important;
        }
      `}</style>
      <div id="map-dashboard-container" ref={mapContainer} className="absolute inset-0" />
    </div>
  );
}
