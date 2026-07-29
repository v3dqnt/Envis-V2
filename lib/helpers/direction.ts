export type CardinalDirection = 'N' | 'S' | 'E' | 'W' | 'NE' | 'NW' | 'SE' | 'SW';

export function getCardinalDirection(
  fromLat: number, fromLng: number,
  toLat: number, toLng: number
): CardinalDirection {
  const dLat = toLat - fromLat;
  const dLng = toLng - fromLng;
  const angle = Math.atan2(dLng, dLat) * (180 / Math.PI);
  
  if (angle >= -22.5 && angle < 22.5) return 'N';
  if (angle >= 22.5 && angle < 67.5) return 'NE';
  if (angle >= 67.5 && angle < 112.5) return 'E';
  if (angle >= 112.5 && angle < 157.5) return 'SE';
  if (angle >= 157.5 || angle < -157.5) return 'S';
  if (angle >= -157.5 && angle < -112.5) return 'SW';
  if (angle >= -112.5 && angle < -67.5) return 'W';
  return 'NW';
}

export function getSimpleDirection(
  fromLat: number, fromLng: number,
  toLat: number, toLng: number
): 'N' | 'S' | 'E' | 'W' {
  const dLat = toLat - fromLat;
  const dLng = toLng - fromLng;
  const angle = Math.atan2(dLng, dLat) * (180 / Math.PI);
  
  if (angle >= -45 && angle < 45) return 'N';
  if (angle >= 45 && angle < 135) return 'E';
  if (angle >= -135 && angle < -45) return 'W';
  return 'S';
}
