import { getDistanceMeters } from '../helpers/distance';
import { getSimpleDirection } from '../helpers/direction';

const TOMTOM_KEY = process.env.EXPO_PUBLIC_TOMTOM_API_KEY || 'fqSazhj2APo816F2cBqqxI0e4GqatpEh';

export interface Shelter {
  id: string;
  name: string;
  coordinates: [number, number];
  direction: 'N' | 'S' | 'E' | 'W';
  reason: string;
  distance: number;
}

export async function getEvacuationPoints(
  hazardCenter: [number, number],
  hazardRadius: number
): Promise<{
  shelters: Shelter[];
  allAvailableShelters: Shelter[];
}> {
  const [lng, lat] = hazardCenter;
  const categories = ['school', 'stadium', 'park', 'community center'];
  // radius capped between 10km and 20km
  const searchRadius = Math.min(Math.max(hazardRadius + 5000, 10000), 20000);

  try {
    const promises = categories.map(async (category) => {
      const url = `https://api.tomtom.com/search/2/categorySearch/${category}.json?key=${TOMTOM_KEY}&lat=${lat}&lon=${lng}&radius=${searchRadius}&limit=15`;
      const res = await fetch(url);
      if (!res.ok) return [];
      const data = await res.json();
      return data.results || [];
    });

    const results = await Promise.all(promises);
    const resultsFlat = results.flat();

    const allShelters: Shelter[] = [];
    const seen = new Set<string>();

    for (const item of resultsFlat) {
      const shLng = item.position.lon;
      const shLat = item.position.lat;
      const key = `${shLng.toFixed(5)},${shLat.toFixed(5)}`;
      
      if (seen.has(key)) continue;
      seen.add(key);

      const dist = getDistanceMeters(lat, lng, shLat, shLng);
      // Filter out POIs inside the hazard dome
      if (dist <= hazardRadius) continue;

      const direction = getSimpleDirection(lat, lng, shLat, shLng);
      const categoryLabel = item.poi.categories?.[0] || 'Assembly Point';

      allShelters.push({
        id: item.id || Math.random().toString(),
        name: item.poi.name,
        coordinates: [shLng, shLat],
        direction,
        distance: Math.round(dist),
        reason: `Safe zone assembly point (${categoryLabel.replace('_', ' ')})`
      });
    }

    // Pick the closest shelter in each cardinal direction
    const bestDirections: Record<'N' | 'S' | 'E' | 'W', Shelter | null> = {
      N: null, S: null, E: null, W: null
    };

    for (const sh of allShelters) {
      const dir = sh.direction;
      const currentBest = bestDirections[dir];
      if (!currentBest || sh.distance < currentBest.distance) {
        bestDirections[dir] = sh;
      }
    }

    // Mathematical fallback for any missing direction
    // Placed at hazardRadius + 1500m
    const directionsInfo: Array<{ dir: 'N' | 'S' | 'E' | 'W'; angle: number }> = [
      { dir: 'N', angle: 0 },
      { dir: 'E', angle: Math.PI / 2 },
      { dir: 'S', angle: Math.PI },
      { dir: 'W', angle: -Math.PI / 2 }
    ];

    const finalShelters: Shelter[] = [];

    for (const { dir, angle } of directionsInfo) {
      const existing = bestDirections[dir];
      if (existing) {
        finalShelters.push(existing);
      } else {
        // Fallback offset calculations (1 degree lat = 111000m, 1 degree lng = 111000m * cos(lat))
        const distOffset = hazardRadius + 1500;
        const latOffset = (distOffset * Math.cos(angle)) / 111000;
        const lngOffset = (distOffset * Math.sin(angle)) / (111000 * Math.cos(lat * Math.PI / 180));
        
        finalShelters.push({
          id: `fallback-${dir}`,
          name: `Sector ${dir} Shelter Fallback`,
          coordinates: [lng + lngOffset, lat + latOffset],
          direction: dir,
          distance: distOffset,
          reason: 'Emergency secondary muster point (system backup)'
        });
      }
    }

    return {
      shelters: finalShelters,
      allAvailableShelters: allShelters
    };
  } catch (error) {
    console.error('Failed to query shelters:', error);
    // If TomTom is offline, build 4 fallback coordinates mathematically
    const finalShelters: Shelter[] = [];
    const directionsInfo: Array<{ dir: 'N' | 'S' | 'E' | 'W'; angle: number }> = [
      { dir: 'N', angle: 0 },
      { dir: 'E', angle: Math.PI / 2 },
      { dir: 'S', angle: Math.PI },
      { dir: 'W', angle: -Math.PI / 2 }
    ];
    for (const { dir, angle } of directionsInfo) {
      const distOffset = hazardRadius + 1500;
      const latOffset = (distOffset * Math.cos(angle)) / 111000;
      const lngOffset = (distOffset * Math.sin(angle)) / (111000 * Math.cos(lat * Math.PI / 180));
      finalShelters.push({
        id: `fallback-${dir}`,
        name: `Sector ${dir} Shelter Backup`,
        coordinates: [lng + lngOffset, lat + latOffset],
        direction: dir,
        distance: distOffset,
        reason: 'Emergency backup muster location'
      });
    }
    return { shelters: finalShelters, allAvailableShelters: [] };
  }
}
