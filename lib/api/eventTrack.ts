export interface EventTrackGeoJSON {
  type: 'FeatureCollection';
  features: any[];
}

export function generateCycloneTrack(
  coordinates: [number, number],
  name: string
): EventTrackGeoJSON {
  const [lng, lat] = coordinates;
  const features: any[] = [];
  
  // 1. Forecast track points: 7 points, 12h intervals, moving along a vector
  // Determine vector depending on basin (e.g. Atlantic moves West-NorthWest)
  const isWestBasin = lng < -20;
  const dx = isWestBasin ? -0.4 : 0.4; // Lng vector
  const dy = 0.2;                      // Lat vector
  
  const trackCoords: [number, number][] = [];
  for (let i = 0; i < 7; i++) {
    trackCoords.push([
      lng + i * dx,
      lat + i * dy
    ]);
  }

  // Add points as markers
  trackCoords.forEach((coord, idx) => {
    features.push({
      type: 'Feature',
      properties: {
        type: 'track-point',
        label: `T+${idx * 12}h`,
        time: `${idx * 12} hrs`
      },
      geometry: {
        type: 'Point',
        coordinates: coord
      }
    });
  });

  // 2. Add track line polyline
  features.push({
    type: 'Feature',
    properties: {
      type: 'track-line',
      name: `${name} Forecast Track`
    },
    geometry: {
      type: 'LineString',
      coordinates: trackCoords
    }
  });

  // 3. Generate NHC-style uncertainty cone polygon
  // Cone width starts at 30km and expands by 30km each step (approx: 111km = 1 degree)
  const leftBound: [number, number][] = [];
  const rightBound: [number, number][] = [];

  trackCoords.forEach((coord, idx) => {
    const [cLng, cLat] = coord;
    const rKm = 30 + idx * 30; // cone radius at step
    const offsetLng = rKm / (111 * Math.cos(cLat * Math.PI / 180));
    
    // Perpendicular angle offsets
    leftBound.push([cLng - offsetLng, cLat]);
    rightBound.unshift([cLng + offsetLng, cLat]); // Unshift to merge sequentially
  });

  const coneCoords = [...leftBound, ...rightBound, leftBound[0]];

  features.push({
    type: 'Feature',
    properties: {
      type: 'uncertainty-cone',
      fillColor: 'rgba(59, 130, 246, 0.12)',
      strokeColor: 'rgba(59, 130, 246, 0.4)'
    },
    geometry: {
      type: 'Polygon',
      coordinates: [coneCoords]
    }
  });

  return {
    type: 'FeatureCollection',
    features
  };
}

export function generateEarthquakeZones(
  coordinates: [number, number],
  magnitude: number,
  depth: number
): EventTrackGeoJSON {
  const [lng, lat] = coordinates;
  const features: any[] = [];

  // Wells & Coppersmith empirical scaling approximation for seismic rupture radius
  // Scale factor: Base radius ~ 10km at M5.0, scales exponentially
  const baseRadiusMeters = Math.pow(10, (magnitude - 5.0) * 0.8) * 10000;
  
  // Concentric intensity levels: VIII+ (Severe), VI-VII (Moderate), IV-V (Light)
  // Depth attenuation factor: deep quakes scatter more energy, decrease epicentral severity but widen area
  const depthFactor = Math.max(1 - depth / 150, 0.4);
  const severeRadius = Math.max(baseRadiusMeters * 0.2 * depthFactor, 1000);
  const moderateRadius = Math.max(baseRadiusMeters * 0.6 * depthFactor, 5000);
  const lightRadius = Math.max(baseRadiusMeters * 1.5 * depthFactor, 15000);

  const zones = [
    { severity: 'Severe Damage (MMI VIII+)', radius: severeRadius, fillColor: 'rgba(239, 68, 68, 0.2)', strokeColor: 'rgba(239, 68, 68, 0.6)' },
    { severity: 'Moderate Damage (MMI VI-VII)', radius: moderateRadius, fillColor: 'rgba(245, 158, 11, 0.15)', strokeColor: 'rgba(245, 158, 11, 0.5)' },
    { severity: 'Light Damage (MMI IV-V)', radius: lightRadius, fillColor: 'rgba(59, 130, 246, 0.1)', strokeColor: 'rgba(59, 130, 246, 0.3)' }
  ];

  zones.forEach((zone, idx) => {
    // Generate approximation of circle coords (32 vertices)
    const vertices: [number, number][] = [];
    const radiusDegLat = zone.radius / 111000;
    const radiusDegLng = zone.radius / (111000 * Math.cos(lat * Math.PI / 180));
    
    for (let i = 0; i <= 32; i++) {
      const theta = (i / 32) * Math.PI * 2;
      vertices.push([
        lng + radiusDegLng * Math.sin(theta),
        lat + radiusDegLat * Math.cos(theta)
      ]);
    }

    features.push({
      type: 'Feature',
      properties: {
        type: 'seismic-zone',
        severity: zone.severity,
        fillColor: zone.fillColor,
        strokeColor: zone.strokeColor,
        radiusMeters: zone.radius
      },
      geometry: {
        type: 'Polygon',
        coordinates: [vertices]
      }
    });
  });

  return {
    type: 'FeatureCollection',
    features
  };
}
