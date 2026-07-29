import { getDistanceMeters } from '../helpers/distance';

const TOMTOM_KEY = process.env.EXPO_PUBLIC_TOMTOM_API_KEY || 'fqSazhj2APo816F2cBqqxI0e4GqatpEh';

export interface Facility {
  id: string;
  name: string;
  type: 'hospital' | 'clinic' | 'fire station' | 'police station';
  distance: number;
  coordinates: [number, number];
  address: string;
  status: 'Inside Dome' | 'Safe Zone';
}

export async function getEmergencyServices(
  hazardCenter: [number, number],
  hazardRadius: number
): Promise<{ facilities: Facility[] }> {
  const [lng, lat] = hazardCenter;
  const categories = ['hospital', 'clinic', 'fire station', 'police station'] as const;

  try {
    const promises = categories.map(async (category) => {
      // TomTom Search API
      const url = `https://api.tomtom.com/search/2/poiSearch/${category}.json?key=${TOMTOM_KEY}&lat=${lat}&lon=${lng}&radius=8000&limit=8`;
      const res = await fetch(url);
      if (!res.ok) return [];
      const data = await res.json();

      return (data.results || []).map((item: any) => {
        const itemLng = item.position.lon;
        const itemLat = item.position.lat;
        const dist = getDistanceMeters(lat, lng, itemLat, itemLng);

        return {
          id: item.id,
          name: item.poi.name,
          type: category,
          distance: Math.round(dist),
          coordinates: [itemLng, itemLat] as [number, number],
          address: item.address.freeformAddress || 'Unknown Address',
          status: dist <= hazardRadius ? 'Inside Dome' : 'Safe Zone'
        };
      });
    });

    const results = await Promise.all(promises);
    const flattened = results.flat();

    // Deduplicate by coordinates (rounded to 5 decimal places)
    const seen = new Set<string>();
    const unique: Facility[] = [];
    
    for (const f of flattened) {
      const key = `${f.coordinates[0].toFixed(5)},${f.coordinates[1].toFixed(5)}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(f);
      }
    }

    // Sort by proximity
    unique.sort((a, b) => a.distance - b.distance);

    return { facilities: unique };
  } catch (error) {
    console.error('Failed to query emergency services POIs:', error);
    return { facilities: [] };
  }
}
