export interface GdacsEvent {
  id: string;
  name: string;
  gdacsType: string;
  type: string;
  alertLevel: 'green' | 'orange' | 'red';
  date: string;
  country: string;
  coordinates: [number, number];
}

const TYPE_MAPPING: Record<string, string> = {
  TC: 'Tornado/Cyclone',
  EQ: 'Earthquake',
  FL: 'Flooding',
  WF: 'Wildfire',
  VO: 'Volcanic Eruption',
};

export async function getGdacsEvents(): Promise<{ events: GdacsEvent[] }> {
  try {
    const url = 'https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?alertlevel=green;orange;red&pagesize=30';
    const res = await fetch(url);
    if (!res.ok) throw new Error('GDACS request failed');
    const data = await res.json();

    const features = data.features || [];
    const events: GdacsEvent[] = features.map((f: any) => {
      const p = f.properties || {};
      const typeCode = p.eventtype;
      const type = TYPE_MAPPING[typeCode] || typeCode || 'Other Disaster';
      const coordinates = f.geometry?.coordinates || [0, 0];

      return {
        id: p.eventid || Math.random().toString(),
        name: p.eventname || 'Unnamed Event',
        gdacsType: typeCode || '',
        type,
        alertLevel: (p.alertlevel || 'green').toLowerCase() as 'green' | 'orange' | 'red',
        date: p.fromdate || p.todate || 'Recent',
        country: p.country || 'International',
        coordinates: [coordinates[0], coordinates[1]] as [number, number],
      };
    });

    return { events };
  } catch (error) {
    console.error('Failed to retrieve GDACS events:', error);
    return { events: [] };
  }
}
