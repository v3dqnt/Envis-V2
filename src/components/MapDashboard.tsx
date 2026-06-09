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

    const mapTilerKey = process.env.NEXT_PUBLIC_MAPTILER_API_KEY || 'get_your_own_OpIi9ZULNHzrESv6T2vL';

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: `https://api.maptiler.com/maps/streets-v2/style.json?key=${mapTilerKey}`,
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
          'fill-extrusion-color': '#ef4444',
          'fill-extrusion-height': ['get', 'height'],
          'fill-extrusion-base': 0,
          'fill-extrusion-opacity': 0.4
        }
      });

      m.addLayer({
        id: 'hazard-dome-outline',
        type: 'line',
        source: 'hazard-dome-source',
        paint: {
          'line-color': '#ef4444',
          'line-width': 4,
          'line-opacity': 0.8
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
          'line-color': '#f59e0b',
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
          'line-color': '#3b82f6',
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
          'line-color': '#ea580c',
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
          'circle-color': '#eab308',
          'circle-stroke-color': '#ffffff',
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
          'circle-color': '#ef4444',
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
          'circle-color': '#ef4444',
          'circle-stroke-color': '#ffffff',
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
            'heavy', '#ef4444',
            'moderate', '#f59e0b',
            'clear', '#10b981',
            '#3b82f6' // fallback/default driving path color
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
            'heavy', '#ef4444',
            'moderate', '#f59e0b',
            'clear', '#10b981',
            '#10b981' // fallback/default bypass path color
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
          'circle-color': '#3b82f6',
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
          'circle-color': '#2563eb',
          'circle-stroke-color': '#ffffff',
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

      // High severity zones (red)
      m.addLayer({
        id: 'vulnerability-zones-high',
        type: 'circle',
        source: 'vulnerability-zones-source',
        filter: ['==', ['get', 'severity'], 'high'],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 30, 15, 100],
          'circle-color': '#dc2626',
          'circle-opacity': 0.25,
          'circle-stroke-color': '#dc2626',
          'circle-stroke-width': 3,
          'circle-stroke-opacity': 0.8
        }
      });

      // Medium severity zones (orange)
      m.addLayer({
        id: 'vulnerability-zones-medium',
        type: 'circle',
        source: 'vulnerability-zones-source',
        filter: ['==', ['get', 'severity'], 'medium'],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 25, 15, 80],
          'circle-color': '#ea580c',
          'circle-opacity': 0.2,
          'circle-stroke-color': '#ea580c',
          'circle-stroke-width': 2.5,
          'circle-stroke-opacity': 0.7
        }
      });

      // Low severity zones (yellow)
      m.addLayer({
        id: 'vulnerability-zones-low',
        type: 'circle',
        source: 'vulnerability-zones-source',
        filter: ['==', ['get', 'severity'], 'low'],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 20, 15, 60],
          'circle-color': '#eab308',
          'circle-opacity': 0.15,
          'circle-stroke-color': '#eab308',
          'circle-stroke-width': 2,
          'circle-stroke-opacity': 0.6
        }
      });

      // Add hover popup for vulnerability zones
      m.on('mousemove', 'vulnerability-zones-high', () => { m.getCanvas().style.cursor = 'pointer'; });
      m.on('mousemove', 'vulnerability-zones-medium', () => { m.getCanvas().style.cursor = 'pointer'; });
      m.on('mousemove', 'vulnerability-zones-low', () => { m.getCanvas().style.cursor = 'pointer'; });
      m.on('mouseleave', 'vulnerability-zones-high', () => { m.getCanvas().style.cursor = ''; });
      m.on('mouseleave', 'vulnerability-zones-medium', () => { m.getCanvas().style.cursor = ''; });
      m.on('mouseleave', 'vulnerability-zones-low', () => { m.getCanvas().style.cursor = ''; });

      // 6. Add 3D buildings layer if not present
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

         m.addLayer(
             {
                 'id': '3d-buildings',
                 'source': vectorSource,
                 'source-layer': 'building',
                 'filter': ['==', 'extrude', 'true'],
                 'type': 'fill-extrusion',
                 'minzoom': 15,
                 'paint': {
                     'fill-extrusion-color': '#aaa',
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
              bypassRouteGeoJSON ? '#ef4444' : '#3b82f6'
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
    };

    if (m.isStyleLoaded()) {
      updateLayers();
    } else {
      m.once('idle', updateLayers);
    }
  }, [hazardCenter, hazardRadius, routeGeoJSON, bypassRouteGeoJSON, evacuationPoints, activeDefenses, vulnerabilityZones]);

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
