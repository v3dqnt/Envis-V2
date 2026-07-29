import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, SafeAreaView, Platform } from 'react-native';
import { SignOut } from 'phosphor-react-native';
import { supabase } from '../../lib/supabase';
import { colors } from '../../lib/theme';
import MapDashboard from '../../components/MapDashboard';
import RoutingBottomSheet from '../../components/RoutingBottomSheet';
import PreventionBottomSheet from '../../components/PreventionBottomSheet';
import GdacsLiveFeed from '../../components/GdacsLiveFeed';
import GlassPanel from '../../components/ui/GlassPanel';
import { getGdacsEvents } from '../../lib/api/gdacs';
import { getLiveFeed } from '../../lib/api/liveFeed';
import { getEvacuationPoints } from '../../lib/api/evacuationPoints';
import { getEmergencyServices } from '../../lib/api/emergencyServices';
import { getCityDensity } from '../../lib/api/cityDensity';
import { generateCycloneTrack, generateEarthquakeZones } from '../../lib/api/eventTrack';

const MAPTILER_KEY = process.env.EXPO_PUBLIC_MAPTILER_API_KEY || 'Ah2PdHlEzAfaeoQBZPzZ';

export default function MainDashboardScreen() {
  // Core States
  const [hazardCenter, setHazardCenter] = useState<[number, number] | null>(null);
  const [hazardRadius, setHazardRadius] = useState<number>(1000);
  const [startCoords, setStartCoords] = useState<[number, number] | null>(null);
  const [endCoords, setEndCoords] = useState<[number, number] | null>(null);
  const [routeGeoJSON, setRouteGeoJSON] = useState<any>(null);
  const [bypassRouteGeoJSON, setBypassRouteGeoJSON] = useState<any>(null);
  const [isPlacingHazard, setIsPlacingHazard] = useState<boolean>(false);
  
  // AI Recommendations
  const [aiRecommendation, setAiRecommendation] = useState<string>('');
  const [aiLoading, setAiLoading] = useState<boolean>(false);
  const [evacuationPoints, setEvacuationPoints] = useState<any>(null);
  const [mode, setMode] = useState<'routing' | 'prevention'>('routing');
  const [activeDefenses, setActiveDefenses] = useState<string[]>([]);
  
  // Geographic / Census States
  const [cityName, setCityName] = useState<string>('');
  const [densityPerKm2, setDensityPerKm2] = useState<number | null>(null);
  const [densityLoading, setDensityLoading] = useState<boolean>(false);
  
  // Live Feed Sources
  const [gdacsEvents, setGdacsEvents] = useState<any[]>([]);
  const [gdacsLoading, setGdacsLoading] = useState<boolean>(false);
  const [liveCyclones, setLiveCyclones] = useState<any[]>([]);
  const [liveEarthquakes, setLiveEarthquakes] = useState<any[]>([]);
  const [liveFeedLoading, setLiveFeedLoading] = useState<boolean>(false);
  
  // Custom Overlays
  const [vulnerabilityZones, setVulnerabilityZones] = useState<any>(null);
  const [eventOverlay, setEventOverlay] = useState<any>(null);
  const [incidentType, setIncidentType] = useState<string>('Wildfire');
  const [mapFlyToCoords, setMapFlyToCoords] = useState<[number, number] | null>(null);
  const [emergencyFacilities, setEmergencyFacilities] = useState<any[]>([]);

  // 1. Fetch GDACS and Live Feeds on Mount
  useEffect(() => {
    setGdacsLoading(true);
    getGdacsEvents()
      .then(res => setGdacsEvents(res.events))
      .catch(err => console.error('GDACS mount fetch failed:', err))
      .finally(() => setGdacsLoading(false));

    setLiveFeedLoading(true);
    getLiveFeed()
      .then(res => {
        setLiveCyclones(res.cyclones);
        setLiveEarthquakes(res.earthquakes);
      })
      .catch(err => console.error('Live feed mount fetch failed:', err))
      .finally(() => setLiveFeedLoading(false));
  }, []);

  // 2. Refresh local metrics when hazard center or radius is modified
  useEffect(() => {
    if (hazardCenter) {
      const [lng, lat] = hazardCenter;

      // Fetch shelters
      getEvacuationPoints(hazardCenter, hazardRadius)
        .then(res => setEvacuationPoints(res))
        .catch(err => console.error('Shelters query failed:', err));

      // Fetch emergency services
      getEmergencyServices(hazardCenter, hazardRadius)
        .then(res => setEmergencyFacilities(res.facilities))
        .catch(err => console.error('Emergency facilities query failed:', err));

      // Reverse geocode cityName via MapTiler
      setDensityLoading(true);
      const url = `https://api.maptiler.com/geocoding/${lng},${lat}.json?key=${MAPTILER_KEY}`;
      
      fetch(url)
        .then(r => r.json())
        .then(data => {
          const features = data.features || [];
          const match = features.find((f: any) => 
            f.place_type?.includes('municipality') || 
            f.place_type?.includes('place') || 
            f.place_type?.includes('city')
          );
          const name = match ? match.text : features[0]?.text || 'Simulated Epicentre';
          setCityName(name);

          // Get population density
          return getCityDensity(name);
        })
        .then(dens => {
          setDensityPerKm2(dens.densityPerKm2);
        })
        .catch(err => {
          console.warn('Geocoding/Density fetch failed:', err);
          setCityName('Tactical Zone');
          setDensityPerKm2(5000);
        })
        .finally(() => setDensityLoading(false));
    }
  }, [hazardCenter, hazardRadius]);

  const handleMapPress = (lng: number, lat: number) => {
    setHazardCenter([lng, lat]);
    setMapFlyToCoords([lng, lat]);
    setIsPlacingHazard(false); // Disable placement tool once coordinates locked
    
    // Clear old route assets when placing a new epicentre
    setRouteGeoJSON(null);
    setBypassRouteGeoJSON(null);
    setAiRecommendation('');
    setVulnerabilityZones(null);
    setEventOverlay(null);
  };

  const handleEventPress = (
    coordinates: [number, number],
    type: string,
    eventName: string,
    eventDetails: any
  ) => {
    setHazardCenter(coordinates);
    setMapFlyToCoords(coordinates);
    setIncidentType(type);

    // Reset older route paths
    setRouteGeoJSON(null);
    setBypassRouteGeoJSON(null);
    setAiRecommendation('');
    setVulnerabilityZones(null);

    // Compute synthetic track vectors/cones
    if (type === 'Tornado') {
      const cone = generateCycloneTrack(coordinates, eventName);
      setEventOverlay(cone);
    } else if (type === 'Earthquake') {
      const rings = generateEarthquakeZones(coordinates, eventDetails.magnitude || 6.5, eventDetails.depth || 10);
      setEventOverlay(rings);
    } else {
      setEventOverlay(null);
    }
  };

  const handleSelectDestination = (coords: [number, number]) => {
    setEndCoords(coords);
  };

  const handleSignOut = () => {
    supabase.auth.signOut();
  };

  return (
    <View style={styles.container}>
      {/* Background Interactive Map */}
      <MapDashboard
        hazardCenter={hazardCenter}
        hazardRadius={hazardRadius}
        routeGeoJSON={routeGeoJSON}
        bypassRouteGeoJSON={bypassRouteGeoJSON}
        isPlacingHazard={isPlacingHazard}
        onMapPress={handleMapPress}
        evacuationPoints={evacuationPoints}
        onSelectDestination={handleSelectDestination}
        activeDefenses={activeDefenses}
        vulnerabilityZones={vulnerabilityZones}
        eventOverlay={eventOverlay}
        mapFlyToCoords={mapFlyToCoords}
      />

      {/* Floating Header UI */}
      <SafeAreaView style={styles.headerArea}>
        <View style={styles.headerRow}>
          {/* Futuristic Mode Toggle Segment */}
          <GlassPanel style={styles.togglePill} noPadding>
            <TouchableOpacity
              onPress={() => setMode('routing')}
              style={[styles.toggleBtn, mode === 'routing' && styles.toggleBtnActive]}
            >
              <Text style={[styles.toggleText, mode === 'routing' && styles.toggleTextActive]}>Routing</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setMode('prevention')}
              style={[styles.toggleBtn, mode === 'prevention' && styles.toggleBtnActive]}
            >
              <Text style={[styles.toggleText, mode === 'prevention' && styles.toggleTextActive]}>Prevention</Text>
            </TouchableOpacity>
          </GlassPanel>

          {/* Sign Out circular trigger */}
          <TouchableOpacity onPress={handleSignOut} style={styles.signOutBtn} activeOpacity={0.8}>
            <SignOut size={18} color="#ffffff" weight="bold" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* Floating Live Feed panel for Prevention mode */}
      {mode === 'prevention' && (
        <View style={styles.floatingFeed}>
          <GdacsLiveFeed
            cyclones={liveCyclones}
            earthquakes={liveEarthquakes}
            feedLoading={liveFeedLoading}
            onEventPress={handleEventPress}
          />
        </View>
      )}

      {/* Bottom Command Sheets */}
      {mode === 'routing' ? (
        <RoutingBottomSheet
          hazardCenter={hazardCenter}
          hazardRadius={hazardRadius}
          setHazardRadius={setHazardRadius}
          isPlacingHazard={isPlacingHazard}
          setIsPlacingHazard={setIsPlacingHazard}
          startCoords={startCoords}
          setStartCoords={setStartCoords}
          endCoords={endCoords}
          setEndCoords={setEndCoords}
          routeGeoJSON={routeGeoJSON}
          setRouteGeoJSON={setRouteGeoJSON}
          bypassRouteGeoJSON={bypassRouteGeoJSON}
          setBypassRouteGeoJSON={setBypassRouteGeoJSON}
          aiRecommendation={aiRecommendation}
          setAiRecommendation={setAiRecommendation}
          aiLoading={aiLoading}
          setAiLoading={setAiLoading}
          evacuationPoints={evacuationPoints}
          incidentType={incidentType}
          setIncidentType={setIncidentType}
          cityName={cityName}
          densityPerKm2={densityPerKm2}
          emergencyFacilities={emergencyFacilities}
          setEmergencyFacilities={setEmergencyFacilities}
          onSelectShelter={handleSelectDestination}
        />
      ) : (
        <PreventionBottomSheet
          hazardCenter={hazardCenter}
          hazardRadius={hazardRadius}
          setHazardRadius={setHazardRadius}
          isPlacingHazard={isPlacingHazard}
          setIsPlacingHazard={setIsPlacingHazard}
          incidentType={incidentType}
          setIncidentType={setIncidentType}
          cityName={cityName}
          densityPerKm2={densityPerKm2}
          activeDefenses={activeDefenses}
          setActiveDefenses={setActiveDefenses}
          vulnerabilityZones={vulnerabilityZones}
          setVulnerabilityZones={setVulnerabilityZones}
          setMapFlyToCoords={setMapFlyToCoords}
          gdacsEvents={gdacsEvents}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 90,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 36 : 0, // safe space for Android status bar
  },
  togglePill: {
    flexDirection: 'row',
    borderRadius: 30,
    height: 40,
    padding: 2,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  toggleBtn: {
    paddingHorizontal: 18,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleBtnActive: {
    backgroundColor: colors.emerald[500],
  },
  toggleText: {
    color: colors.neutral[400],
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  toggleTextActive: {
    color: '#ffffff',
  },
  signOutBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(13, 13, 18, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    // shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  floatingFeed: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 110 : 130,
    left: 16,
    right: 16,
    zIndex: 80,
  }
});
