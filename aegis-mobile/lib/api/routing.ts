const TOMTOM_KEY = process.env.EXPO_PUBLIC_TOMTOM_API_KEY || 'fqSazhj2APo816F2cBqqxI0e4GqatpEh';

export function downsampleCoords(coords: [number, number][], maxPoints = 50): [number, number][] {
  if (coords.length <= maxPoints) return coords;
  const step = (coords.length - 1) / (maxPoints - 1);
  const result: [number, number][] = [];
  for (let i = 0; i < maxPoints; i++) {
    result.push(coords[Math.round(i * step)]);
  }
  return result;
}

export async function getRouteData(locations: [number, number][]): Promise<{
  coordinates: [number, number][];
  distance: number;
  duration: number;
  source: 'tomtom' | 'osrm';
}> {
  try {
    // TomTom format: lat1,lng1:lat2,lng2:...
    const locationStr = locations.map(([lng, lat]) => `${lat},${lng}`).join(':');
    const url = `https://api.tomtom.com/routing/1/calculateRoute/${locationStr}/json?key=${TOMTOM_KEY}&routeType=fastest&traffic=true&travelMode=car`;

    const res = await fetch(url);
    if (!res.ok) throw new Error('TomTom route request failed');
    const data = await res.json();

    const points = data.routes?.[0]?.legs?.[0]?.points;
    if (!points || points.length === 0) throw new Error('No coordinates returned from TomTom');

    const coordinates: [number, number][] = points.map((p: { longitude: number; latitude: number }) => [p.longitude, p.latitude]);
    const summary = data.routes[0].summary;

    return {
      coordinates,
      distance: summary.lengthInMeters,
      duration: summary.travelTimeInSeconds,
      source: 'tomtom'
    };
  } catch (error) {
    console.warn('TomTom routing failed, trying OSRM fallback:', error);
    try {
      // OSRM format: lng1,lat1;lng2,lat2;...
      const coordStr = locations.map(([lng, lat]) => `${lng},${lat}`).join(';');
      const url = `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson&alternatives=true`;

      const res = await fetch(url);
      if (!res.ok) throw new Error('OSRM route request failed');
      const data = await res.json();

      const route = data.routes?.[0];
      if (!route?.geometry?.coordinates) throw new Error('No coordinates returned from OSRM');

      return {
        coordinates: route.geometry.coordinates,
        distance: route.distance,
        duration: route.duration,
        source: 'osrm'
      };
    } catch (osrmError) {
      console.error('OSRM fallback also failed:', osrmError);
      throw new Error('Routing is currently unavailable.');
    }
  }
}
