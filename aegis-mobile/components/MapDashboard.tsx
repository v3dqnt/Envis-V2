import React, { useRef, useEffect } from 'react';
import MapView, { Marker, Circle, Polyline, Polygon, Callout, PROVIDER_GOOGLE } from 'react-native-maps';
import { StyleSheet, View, Text } from 'react-native';
import { colors } from '../lib/theme';
import { toLatLng } from '../lib/helpers/coordinates';

interface MapDashboardProps {
  hazardCenter: [number, number] | null;
  hazardRadius: number;
  routeGeoJSON: any;
  bypassRouteGeoJSON: any;
  isPlacingHazard: boolean;
  onMapPress: (lng: number, lat: number) => void;
  evacuationPoints: any;
  onSelectDestination: (coords: [number, number]) => void;
  activeDefenses: string[];
  vulnerabilityZones: any;
  eventOverlay: any;
  mapFlyToCoords: [number, number] | null;
}

export default function MapDashboard({
  hazardCenter,
  hazardRadius,
  routeGeoJSON,
  bypassRouteGeoJSON,
  isPlacingHazard,
  onMapPress,
  evacuationPoints,
  onSelectDestination,
  activeDefenses,
  vulnerabilityZones,
  eventOverlay,
  mapFlyToCoords
}: MapDashboardProps) {
  const mapRef = useRef<MapView>(null);

  useEffect(() => {
    if (mapFlyToCoords && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: mapFlyToCoords[1],
        longitude: mapFlyToCoords[0],
        latitudeDelta: 0.1,
        longitudeDelta: 0.1,
      }, 1000);
    }
  }, [mapFlyToCoords]);

  // Render event overlay track elements (e.g. Cyclone uncertainty cones or Earthquake rings)
  const renderEventOverlay = () => {
    if (!eventOverlay?.features) return null;

    return eventOverlay.features.map((feature: any, idx: number) => {
      const type = feature.properties?.type;
      const geom = feature.geometry;

      if (!geom) return null;

      if (geom.type === 'Point') {
        const coords = toLatLng(geom.coordinates);
        return (
          <Marker
            key={`event-overlay-pt-${idx}`}
            coordinate={coords}
            title={feature.properties?.label || 'Alert point'}
            pinColor="#3b82f6"
          />
        );
      }

      if (geom.type === 'LineString') {
        const coords = geom.coordinates.map(toLatLng);
        return (
          <Polyline
            key={`event-overlay-line-${idx}`}
            coordinates={coords}
            strokeColor="#3b82f6"
            strokeWidth={3}
          />
        );
      }

      if (geom.type === 'Polygon') {
        // Multi-dimensional coordinates array
        const coords = geom.coordinates[0].map(toLatLng);
        const fColor = feature.properties?.fillColor || 'rgba(59, 130, 246, 0.1)';
        const sColor = feature.properties?.strokeColor || 'rgba(59, 130, 246, 0.4)';
        return (
          <Polygon
            key={`event-overlay-poly-${idx}`}
            coordinates={coords}
            fillColor={fColor}
            strokeColor={sColor}
            strokeWidth={1.5}
          />
        );
      }

      return null;
    });
  };

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFill}
        customMapStyle={DARK_MAP_STYLE}
        initialRegion={{
          latitude: 30.0,
          longitude: 0.0,
          latitudeDelta: 80,
          longitudeDelta: 80,
        }}
        onPress={(e) => {
          if (isPlacingHazard) {
            const { latitude, longitude } = e.nativeEvent.coordinate;
            onMapPress(longitude, latitude);
          }
        }}
      >
        {/* Active Hazard Dome */}
        {hazardCenter && (
          <Circle
            center={toLatLng(hazardCenter)}
            radius={hazardRadius}
            fillColor={colors.red.glow}
            strokeColor={colors.red[500]}
            strokeWidth={2}
          />
        )}

        {/* Tactical Countermeasure Overlays */}
        {hazardCenter && activeDefenses.includes('Flood Barriers') && (
          <Circle
            center={toLatLng(hazardCenter)}
            radius={hazardRadius * 1.15}
            fillColor="transparent"
            strokeColor={colors.blue[500]}
            strokeWidth={2}
            lineDashPattern={[6, 6]}
          />
        )}

        {hazardCenter && activeDefenses.includes('Fire Breaks') && (
          <Circle
            center={toLatLng(hazardCenter)}
            radius={hazardRadius * 1.35}
            fillColor="transparent"
            strokeColor={colors.amber[500]}
            strokeWidth={2}
            lineDashPattern={[10, 4]}
          />
        )}

        {hazardCenter && activeDefenses.includes('Seismic Dampeners') && (
          <Circle
            center={toLatLng(hazardCenter)}
            radius={hazardRadius * 0.8}
            fillColor="transparent"
            strokeColor={colors.amber[400]}
            strokeWidth={1.5}
            lineDashPattern={[2, 4]}
          />
        )}

        {/* Primary Route */}
        {routeGeoJSON?.coordinates && (
          <Polyline
            coordinates={routeGeoJSON.coordinates.map(toLatLng)}
            strokeColor={colors.blue[500]}
            strokeWidth={5}
          />
        )}

        {/* Bypass Detour Route */}
        {bypassRouteGeoJSON?.coordinates && (
          <Polyline
            coordinates={bypassRouteGeoJSON.coordinates.map(toLatLng)}
            strokeColor={colors.emerald[400]}
            strokeWidth={5}
            lineDashPattern={[10, 5]}
          />
        )}

        {/* Evacuation Shelters */}
        {evacuationPoints?.shelters?.map((shelter: any) => (
          <Marker
            key={shelter.id}
            coordinate={toLatLng(shelter.coordinates)}
            pinColor="#10b981"
            onPress={() => onSelectDestination(shelter.coordinates)}
          >
            <Callout tooltip>
              <View style={styles.callout}>
                <Text style={styles.calloutTitle}>{shelter.name}</Text>
                <Text style={styles.calloutText}>
                  Direction: {shelter.direction} • {Math.round(shelter.distance / 100) / 10}km
                </Text>
                <Text style={styles.calloutSubtext}>{shelter.reason}</Text>
              </View>
            </Callout>
          </Marker>
        ))}

        {/* Vulnerability Zones */}
        {vulnerabilityZones?.zones?.map((zone: any, idx: number) => {
          const coords = toLatLng(zone.geometry.coordinates);
          const severity = zone.properties?.severity || 'medium';
          const fill = severity === 'high' 
            ? 'rgba(239, 68, 68, 0.22)' 
            : severity === 'medium'
            ? 'rgba(245, 158, 11, 0.2)'
            : 'rgba(59, 130, 246, 0.15)';

          const stroke = severity === 'high' 
            ? colors.red[500] 
            : severity === 'medium'
            ? colors.amber[500]
            : colors.blue[500];

          return (
            <Circle
              key={`vuln-zone-${idx}`}
              center={coords}
              radius={(zone.properties?.radius_km || 0.5) * 1000}
              fillColor={fill}
              strokeColor={stroke}
              strokeWidth={1}
            />
          );
        })}

        {/* Earthquake / Cyclone forecast track models */}
        {renderEventOverlay()}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  callout: {
    backgroundColor: 'rgba(7, 7, 9, 0.95)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 10,
    maxWidth: 220,
  },
  calloutTitle: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 12,
    marginBottom: 2,
  },
  calloutText: {
    color: colors.neutral[300],
    fontSize: 10,
    fontWeight: '600',
    marginBottom: 4,
  },
  calloutSubtext: {
    color: colors.emerald[400],
    fontSize: 9,
    fontWeight: '700',
  }
});

// Sci-Fi Premium Dark Map Style configuration for Google Maps SDK
const DARK_MAP_STYLE = [
  { "elementType": "geometry", "stylers": [{ "color": "#0a0a0f" }] },
  { "elementType": "labels.text.stroke", "stylers": [{ "color": "#0a0a0f" }] },
  { "elementType": "labels.text.fill", "stylers": [{ "color": "#525266" }] },
  { "featureType": "administrative", "elementType": "geometry", "stylers": [{ "visibility": "off" }] },
  { "featureType": "administrative.country", "elementType": "geometry.stroke", "stylers": [{ "color": "#181824" }, { "visibility": "on" }] },
  { "featureType": "administrative.province", "elementType": "geometry.stroke", "stylers": [{ "color": "#14141d" }, { "visibility": "on" }] },
  { "featureType": "landscape", "elementType": "geometry", "stylers": [{ "color": "#0d0d14" }] },
  { "featureType": "poi", "stylers": [{ "visibility": "off" }] },
  { "featureType": "road", "elementType": "geometry", "stylers": [{ "color": "#171724" }] },
  { "featureType": "road", "elementType": "geometry.stroke", "stylers": [{ "color": "#0d0d14" }] },
  { "featureType": "road.highway", "elementType": "geometry", "stylers": [{ "color": "#202030" }] },
  { "featureType": "road.highway.controlled_access", "elementType": "geometry", "stylers": [{ "color": "#28283d" }] },
  { "featureType": "transit", "stylers": [{ "visibility": "off" }] },
  { "featureType": "water", "elementType": "geometry", "stylers": [{ "color": "#040408" }] },
  { "featureType": "water", "elementType": "labels.text.fill", "stylers": [{ "color": "#1f1f33" }] }
];
