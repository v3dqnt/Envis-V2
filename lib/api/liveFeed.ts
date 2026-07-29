export interface CycloneEvent {
  id: string;
  name: string;
  source: string;
  alertLevel: 'green' | 'orange' | 'red';
  coordinates: [number, number];
  country: string;
  windSpeed?: number;
  date?: string;
}

export interface EarthquakeEvent {
  id: string;
  name: string;
  source: string;
  alertLevel: 'green' | 'orange' | 'red';
  coordinates: [number, number];
  magnitude: number;
  depth: number;
  tsunami: boolean;
  felt?: number;
  country?: string;
  date?: string;
}

const TOMORROW_KEY = process.env.EXPO_PUBLIC_TOMORROW_IO_API_KEY;
const XWEATHER_ID = process.env.EXPO_PUBLIC_XWEATHER_CLIENT_ID;
const XWEATHER_SECRET = process.env.EXPO_PUBLIC_XWEATHER_CLIENT_SECRET;

function deduplicateByProximity<T extends { coordinates: [number, number] }>(
  events: T[],
  thresholdDegrees: number
): T[] {
  const result: T[] = [];
  for (const e of events) {
    const isDup = result.some(existing => {
      const dx = Math.abs(e.coordinates[0] - existing.coordinates[0]);
      const dy = Math.abs(e.coordinates[1] - existing.coordinates[1]);
      return dx < thresholdDegrees && dy < thresholdDegrees;
    });
    if (!isDup) {
      result.push(e);
    }
  }
  return result;
}

export async function getLiveFeed(): Promise<{
  cyclones: CycloneEvent[];
  earthquakes: EarthquakeEvent[];
}> {
  const cyclones: CycloneEvent[] = [];
  const earthquakes: EarthquakeEvent[] = [];

  // GDACS Fetch (Cyclones + Earthquakes)
  const fetchGdacs = async () => {
    try {
      const url = 'https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?alertlevel=green;orange;red&pagesize=30';
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      
      for (const f of data.features || []) {
        const p = f.properties || {};
        const coords = f.geometry?.coordinates || [0, 0];
        const alertLevel = (p.alertlevel || 'green').toLowerCase() as 'green' | 'orange' | 'red';
        
        if (p.eventtype === 'TC') {
          cyclones.push({
            id: `gdacs-tc-${p.eventid || Math.random()}`,
            name: p.eventname || 'Unnamed Cyclone',
            source: 'GDACS',
            alertLevel,
            coordinates: [coords[0], coords[1]],
            country: p.country || 'International',
            windSpeed: p.severity?.value || undefined,
            date: p.fromdate || p.todate
          });
        } else if (p.eventtype === 'EQ') {
          earthquakes.push({
            id: `gdacs-eq-${p.eventid || Math.random()}`,
            name: p.eventname || `Earthquake in ${p.country || 'Unknown'}`,
            source: 'GDACS',
            alertLevel,
            coordinates: [coords[0], coords[1]],
            magnitude: p.severity?.value || 5.0,
            depth: p.severity?.depth || 10,
            tsunami: p.tsunami === '1',
            country: p.country,
            date: p.fromdate || p.todate
          });
        }
      }
    } catch (err) {
      console.warn('GDACS live feed query failed:', err);
    }
  };

  // USGS Fetch (Earthquakes M4.5+)
  const fetchUsgs = async () => {
    try {
      const url = 'https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&minmagnitude=4.5&limit=25&orderby=time';
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();

      for (const f of data.features || []) {
        const p = f.properties || {};
        const coords = f.geometry?.coordinates || [0, 0];
        const mag = p.mag || 4.5;
        
        let alertLevel: 'green' | 'orange' | 'red' = 'green';
        if (mag >= 7.0) alertLevel = 'red';
        else if (mag >= 5.5) alertLevel = 'orange';

        earthquakes.push({
          id: `usgs-${f.id || Math.random()}`,
          name: p.place || 'Earthquake Event',
          source: 'USGS',
          alertLevel,
          coordinates: [coords[0], coords[1]],
          magnitude: mag,
          depth: coords[2] || 10,
          tsunami: p.tsunami === 1,
          felt: p.felt || undefined,
          date: p.time ? new Date(p.time).toISOString() : undefined
        });
      }
    } catch (err) {
      console.warn('USGS live feed query failed:', err);
    }
  };

  // Tomorrow.io Fetch
  const fetchTomorrowIo = async () => {
    if (!TOMORROW_KEY) return;
    try {
      const url = `https://api.tomorrow.io/v4/storms?apikey=${TOMORROW_KEY}&units=metric`;
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      
      for (const storm of data.storms || []) {
        const coords = storm.position ? [storm.position.lon, storm.position.lat] : [0, 0];
        const windKmh = storm.windSpeed ? storm.windSpeed * 3.6 : 0;
        let alertLevel: 'green' | 'orange' | 'red' = 'green';
        if (windKmh >= 96) alertLevel = 'red';
        else if (windKmh >= 48) alertLevel = 'orange';

        cyclones.push({
          id: `tomorrow-${storm.id || Math.random()}`,
          name: storm.name || 'Unnamed Cyclone',
          source: 'Tomorrow.io',
          alertLevel,
          coordinates: [coords[0], coords[1]] as [number, number],
          country: storm.basin || 'Oceania',
          windSpeed: Math.round(windKmh),
          date: storm.time
        });
      }
    } catch (err) {
      console.warn('Tomorrow.io active storm query failed:', err);
    }
  };

  // XWeather Fetch
  const fetchXWeather = async () => {
    if (!XWEATHER_ID || !XWEATHER_SECRET) return;
    try {
      const url = `https://data.api.xweather.com/tropicalcyclones/active?client_id=${XWEATHER_ID}&client_secret=${XWEATHER_SECRET}&limit=20`;
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      
      for (const storm of data.response || []) {
        const profile = storm.profile || {};
        const coords = profile.position ? [profile.position.lon, profile.position.lat] : [0, 0];
        const windKmh = profile.windSpeedMaxKmh || 0;
        let alertLevel: 'green' | 'orange' | 'red' = 'green';
        if (windKmh >= 96) alertLevel = 'red';
        else if (windKmh >= 48) alertLevel = 'orange';

        cyclones.push({
          id: `xweather-${storm.id || Math.random()}`,
          name: storm.name || 'Unnamed Cyclone',
          source: 'XWeather',
          alertLevel,
          coordinates: [coords[0], coords[1]] as [number, number],
          country: profile.basin || 'Oceania',
          windSpeed: Math.round(windKmh),
          date: profile.dateTimeISO
        });
      }
    } catch (err) {
      console.warn('XWeather active storm query failed:', err);
    }
  };

  // Run all in parallel
  await Promise.allSettled([
    fetchGdacs(),
    fetchUsgs(),
    fetchTomorrowIo(),
    fetchXWeather()
  ]);

  // Deduplicate and sort
  const dedupCyclones = deduplicateByProximity(cyclones, 1.0);
  const dedupQuakes = deduplicateByProximity(earthquakes, 0.5);

  const alertWeights = { red: 3, orange: 2, green: 1 };
  
  dedupCyclones.sort((a, b) => alertWeights[b.alertLevel] - alertWeights[a.alertLevel]);
  dedupQuakes.sort((a, b) => {
    const wDiff = alertWeights[b.alertLevel] - alertWeights[a.alertLevel];
    if (wDiff !== 0) return wDiff;
    return b.magnitude - a.magnitude;
  });

  return {
    cyclones: dedupCyclones,
    earthquakes: dedupQuakes
  };
}
