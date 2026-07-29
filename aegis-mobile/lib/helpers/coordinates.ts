export function fixFlippedCoordinates(
  waypoints: [number, number][],
  reference: [number, number]
): [number, number][] {
  const [refLng, refLat] = reference;
  return waypoints.map(([c0, c1]) => {
    const dNormal = Math.pow(c0 - refLng, 2) + Math.pow(c1 - refLat, 2);
    const dFlipped = Math.pow(c1 - refLng, 2) + Math.pow(c0 - refLat, 2);
    if (dFlipped < dNormal) {
      return [c1, c0]; // Swap back to [lng, lat]
    }
    return [c0, c1];
  });
}

export function toLatLng(coord: [number, number]) {
  return { latitude: coord[1], longitude: coord[0] };
}

export function fromLatLng(coord: { latitude: number; longitude: number }): [number, number] {
  return [coord.longitude, coord.latitude];
}
