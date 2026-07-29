/**
 * Shared shaping for evacuation routes and shelters.
 *
 * Lives here rather than in the route handler because Next.js only permits HTTP
 * method exports from a `route.ts`, and both /api/alerts/routes and
 * /api/alerts/feed need to return these in the same shape.
 */

export function formatRoute(r: any) {
  return {
    id: r.id,
    kind: r.kind,
    label: r.label,
    isRecommended: r.is_recommended,
    destinationName: r.destination_name,
    destination:
      r.destination_lat != null && r.destination_lng != null
        ? { lat: r.destination_lat, lng: r.destination_lng }
        : null,
    distanceKm: r.distance_km,
    durationMin: r.duration_min,
    trafficDelayMin: r.traffic_delay_min,
    pathPoints: r.path_points,
    // GeoJSON LineString, ready to hand straight to a map component.
    path: r.path_geojson ? JSON.parse(r.path_geojson) : null,
  };
}

export function formatShelter(s: any) {
  return {
    id: s.id,
    name: s.name,
    direction: s.direction,
    reason: s.reason,
    location: { lat: s.lat, lng: s.lng },
    distanceKm: s.distance_km,
  };
}
