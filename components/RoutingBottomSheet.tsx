import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions, TouchableOpacity, ScrollView, TextInput, ActivityIndicator } from 'react-native';
import { CaretUp, CaretDown, NavigationArrow, ShieldWarning, Sparkle, Plus } from 'phosphor-react-native';
import * as Location from 'expo-location';
import { colors } from '../lib/theme';
import GlassPanel from './ui/GlassPanel';
import GradientButton from './ui/GradientButton';
import DisasterTypeGrid from './DisasterTypeGrid';
import EmergencyServicesList from './EmergencyServicesList';
import ReportIncidentModal from './ReportIncidentModal';
import { getRouteData } from '../lib/api/routing';
import { analyzeEvacuation } from '../lib/api/evacuate';
import { Shelter } from '../lib/api/evacuationPoints';

interface RoutingBottomSheetProps {
  hazardCenter: [number, number] | null;
  hazardRadius: number;
  setHazardRadius: (val: number) => void;
  isPlacingHazard: boolean;
  setIsPlacingHazard: (val: boolean) => void;
  startCoords: [number, number] | null;
  setStartCoords: (coords: [number, number] | null) => void;
  endCoords: [number, number] | null;
  setEndCoords: (coords: [number, number] | null) => void;
  routeGeoJSON: any;
  setRouteGeoJSON: (route: any) => void;
  bypassRouteGeoJSON: any;
  setBypassRouteGeoJSON: (route: any) => void;
  aiRecommendation: string;
  setAiRecommendation: (text: string) => void;
  aiLoading: boolean;
  setAiLoading: (loading: boolean) => void;
  evacuationPoints: any;
  incidentType: string;
  setIncidentType: (type: string) => void;
  cityName: string;
  densityPerKm2: number | null;
  emergencyFacilities: any[];
  setEmergencyFacilities: (facilities: any[]) => void;
  onSelectShelter: (coords: [number, number]) => void;
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const COLLAPSED_HEIGHT = 70;
const EXPANDED_HEIGHT = SCREEN_HEIGHT * 0.7;

export default function RoutingBottomSheet(props: RoutingBottomSheetProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'affected' | 'navigate' | 'report'>('affected');
  const [startAddress, setStartAddress] = useState('');
  const [endAddress, setEndAddress] = useState('');
  const [routingLoading, setRoutingLoading] = useState(false);
  const [routeSummary, setRouteSummary] = useState<{ distance: string; duration: string } | null>(null);
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [facilitiesLoading, setFacilitiesLoading] = useState(false);

  const slideAnim = useRef(new Animated.Value(COLLAPSED_HEIGHT)).current;

  const toggleExpand = () => {
    setIsExpanded(!isExpanded);
  };

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: isExpanded ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT,
      useNativeDriver: false,
      friction: 8,
      tension: 50,
    }).start();
  }, [isExpanded, slideAnim]);

  // Sync inputs with state coordinate locks
  const handleGpsDetect = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        alert('Permission to access location was denied');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      props.setStartCoords([loc.coords.longitude, loc.coords.latitude]);
      setStartAddress(`GPS Lock: [${loc.coords.longitude.toFixed(4)}, ${loc.coords.latitude.toFixed(4)}]`);
    } catch (err) {
      alert('Unable to lock current location coordinates.');
    }
  };

  const handleCalculateRoute = async () => {
    if (!props.startCoords || !props.endCoords) {
      alert('Please define both source and destination target points.');
      return;
    }
    setRoutingLoading(true);
    try {
      const direct = await getRouteData([props.startCoords, props.endCoords]);
      props.setRouteGeoJSON(direct);
      setRouteSummary({
        distance: `${(direct.distance / 1000).toFixed(1)} km`,
        duration: `${Math.round(direct.duration / 60)} min`
      });
      // Clear any older bypass
      props.setBypassRouteGeoJSON(null);
      props.setAiRecommendation('');
    } catch (err: any) {
      alert(err.message || 'Routing server is offline.');
    } finally {
      setRoutingLoading(false);
    }
  };

  const handleAnalyzeDetour = async () => {
    if (!props.routeGeoJSON) return;
    props.setAiLoading(true);
    try {
      const res = await analyzeEvacuation({
        incidentType: props.incidentType,
        startAddr: startAddress,
        endAddr: endAddress,
        startCoords: props.startCoords,
        endCoords: props.endCoords,
        hazardCenter: props.hazardCenter,
        hazardRadius: props.hazardRadius,
        primaryRouteCoords: props.routeGeoJSON.coordinates
      });

      props.setAiRecommendation(res.text);

      if (res.detourWaypoints.length > 0 && props.startCoords && props.endCoords) {
        const bypass = await getRouteData([
          props.startCoords,
          ...res.detourWaypoints,
          props.endCoords
        ]);
        props.setBypassRouteGeoJSON(bypass);
      } else {
        // Safe (doesn't intersect)
        props.setBypassRouteGeoJSON(props.routeGeoJSON);
      }
    } catch (err) {
      alert('AI evacuation engine failed.');
    } finally {
      props.setAiLoading(false);
    }
  };

  // Quick geocode for custom destination
  const handleGeocodeDestination = async () => {
    if (!endAddress) return;
    try {
      const url = `https://api.maptiler.com/geocoding/${encodeURIComponent(endAddress)}.json?key=${process.env.EXPO_PUBLIC_MAPTILER_API_KEY}`;
      const res = await fetch(url);
      const data = await res.json();
      const feature = data.features?.[0];
      if (feature) {
        props.setEndCoords(feature.geometry.coordinates);
        alert(`Destination locked: ${feature.place_name}`);
      } else {
        alert('Address not found.');
      }
    } catch (e) {
      alert('Geocoding offline.');
    }
  };

  return (
    <Animated.View style={[styles.bottomSheet, { height: slideAnim }]}>
      <GlassPanel style={styles.sheetContent} noPadding>
        {/* Drag Handle Row */}
        <TouchableOpacity onPress={toggleExpand} style={styles.dragHandle} activeOpacity={0.8}>
          <View style={styles.handleBar} />
          <View style={styles.handleHeader}>
            <ShieldWarning size={18} color={colors.emerald[400]} weight="fill" />
            <Text style={styles.handleTitle}>Evacuation Command Panel</Text>
            {isExpanded ? <CaretDown size={14} color="#fff" /> : <CaretUp size={14} color="#fff" />}
          </View>
        </TouchableOpacity>

        {isExpanded && (
          <View style={styles.expandedContainer}>
            {/* Navigation Tabs */}
            <View style={styles.tabsRow}>
              <TouchableOpacity
                onPress={() => setActiveTab('affected')}
                style={[styles.tab, activeTab === 'affected' && styles.tabActive]}
              >
                <Text style={[styles.tabText, activeTab === 'affected' && styles.tabTextActive]}>Affected Area</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setActiveTab('navigate')}
                style={[styles.tab, activeTab === 'navigate' && styles.tabActive]}
              >
                <Text style={[styles.tabText, activeTab === 'navigate' && styles.tabTextActive]}>Muster Routes</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setActiveTab('report')}
                style={[styles.tab, activeTab === 'report' && styles.tabActive]}
              >
                <Text style={[styles.tabText, activeTab === 'report' && styles.tabTextActive]}>Response Unit</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.scrollArea}>
              {/* TAB 1: Affected Zone controls */}
              {activeTab === 'affected' && (
                <View style={styles.section}>
                  <DisasterTypeGrid
                    selected={props.incidentType}
                    onSelect={props.setIncidentType}
                  />

                  <View style={styles.actionRow}>
                    <GradientButton
                      title={props.isPlacingHazard ? 'Awaiting Map Press...' : 'Place Epicentre on Map'}
                      variant={props.isPlacingHazard ? 'red' : 'emerald'}
                      onPress={() => props.setIsPlacingHazard(!props.isPlacingHazard)}
                      fullWidth
                    />
                  </View>

                  {/* Radius Controls */}
                  {props.hazardCenter && (
                    <View style={styles.radiusBlock}>
                      <Text style={styles.subHeader}>EPICENTRE RADIAL RANGE</Text>
                      <View style={styles.radiusRow}>
                        <TouchableOpacity 
                          onPress={() => props.setHazardRadius(Math.max(props.hazardRadius - 200, 300))}
                          style={styles.radiusBtn}
                        >
                          <Text style={styles.radiusBtnText}>-</Text>
                        </TouchableOpacity>
                        <Text style={styles.radiusValue}>{props.hazardRadius} meters</Text>
                        <TouchableOpacity 
                          onPress={() => props.setHazardRadius(props.hazardRadius + 200)}
                          style={styles.radiusBtn}
                        >
                          <Text style={styles.radiusBtnText}>+</Text>
                        </TouchableOpacity>
                      </View>

                      {/* Info Panel */}
                      <View style={styles.infoCard}>
                        <Text style={styles.infoTitle}>Tactical Context:</Text>
                        <Text style={styles.infoBody}>City: {props.cityName || 'Determining location...'}</Text>
                        <Text style={styles.infoBody}>Estimated Density: {props.densityPerKm2 ? `${props.densityPerKm2.toLocaleString()} ppl/km²` : 'Retrieving population metrics...'}</Text>
                      </View>
                    </View>
                  )}
                </View>
              )}

              {/* TAB 2: Navigation controls */}
              {activeTab === 'navigate' && (
                <View style={styles.section}>
                  <Text style={styles.subHeader}>Navigation Source Coordinates</Text>
                  <View style={styles.inputContainer}>
                    <TextInput
                      style={styles.textInput}
                      placeholder="Start point (Address or location)"
                      placeholderTextColor={colors.neutral[500]}
                      value={startAddress}
                      onChangeText={setStartAddress}
                    />
                    <TouchableOpacity onPress={handleGpsDetect} style={styles.gpsLockBtn}>
                      <NavigationArrow size={16} color={colors.emerald[400]} />
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.subHeader}>Destination Assembly Point</Text>
                  <View style={styles.inputContainer}>
                    <TextInput
                      style={styles.textInput}
                      placeholder="Muster point address (or tap a shelter pin)"
                      placeholderTextColor={colors.neutral[500]}
                      value={endAddress}
                      onChangeText={setEndAddress}
                    />
                    <TouchableOpacity onPress={handleGeocodeDestination} style={styles.gpsLockBtn}>
                      <Plus size={16} color={colors.emerald[400]} />
                    </TouchableOpacity>
                  </View>

                  <GradientButton
                    title={routingLoading ? 'Plotting Corridor...' : 'Calculate Evacuation Path'}
                    onPress={handleCalculateRoute}
                    fullWidth
                    style={styles.actionBtn}
                  />

                  {/* Route details display */}
                  {routeSummary && (
                    <View style={styles.routeDetails}>
                      <Text style={styles.routeText}>Transit Scope: {routeSummary.distance} • Est. Time: {routeSummary.duration}</Text>
                      
                      <GradientButton
                        title={props.aiLoading ? 'Synthesizing Bypass...' : 'Scan For AI Detours'}
                        icon={<Sparkle size={14} color="#fff" weight="fill" />}
                        onPress={handleAnalyzeDetour}
                        fullWidth
                        style={styles.actionBtn}
                      />

                      {props.aiRecommendation ? (
                        <View style={styles.recommendationCard}>
                          <Text style={styles.recommendationHeader}>Tactical AI Guide</Text>
                          <Text style={styles.recommendationBody}>{props.aiRecommendation}</Text>
                        </View>
                      ) : null}
                    </View>
                  )}

                  {/* Shelters nearby list */}
                  {props.evacuationPoints?.shelters?.length > 0 && (
                    <View style={styles.shelterContainer}>
                      <Text style={styles.subHeader}>Identified Muster Facilities</Text>
                      {props.evacuationPoints.shelters.map((sh: Shelter) => (
                        <TouchableOpacity
                          key={sh.id}
                          onPress={() => {
                            props.onSelectShelter(sh.coordinates);
                            setEndAddress(sh.name);
                          }}
                          style={styles.shelterCard}
                        >
                          <View style={styles.shelterLeft}>
                            <Text style={styles.shelterName}>{sh.name}</Text>
                            <Text style={styles.shelterReason} numberOfLines={1}>{sh.reason}</Text>
                          </View>
                          <View style={styles.shelterRight}>
                            <Text style={styles.shelterDir}>Sector {sh.direction}</Text>
                            <Text style={styles.shelterDist}>{(sh.distance / 1000).toFixed(1)} km</Text>
                          </View>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              )}

              {/* TAB 3: Incident Report & Responder Services */}
              {activeTab === 'report' && (
                <View style={styles.section}>
                  <GradientButton
                    title="Declare Tactical Alert"
                    variant="red"
                    onPress={() => setReportModalVisible(true)}
                    fullWidth
                    style={styles.actionBtn}
                  />

                  <EmergencyServicesList
                    facilities={props.emergencyFacilities}
                    loading={facilitiesLoading}
                  />
                </View>
              )}
            </ScrollView>
          </View>
        )}
      </GlassPanel>

      <ReportIncidentModal
        visible={reportModalVisible}
        onClose={() => setReportModalVisible(false)}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bottomSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  sheetContent: {
    flex: 1,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  dragHandle: {
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  handleBar: {
    width: 36,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    marginBottom: 6,
  },
  handleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  handleTitle: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
    flex: 1,
  },
  expandedContainer: {
    flex: 1,
  },
  tabsRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: colors.emerald[500],
  },
  tabText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.neutral[500],
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tabTextActive: {
    color: '#ffffff',
  },
  scrollArea: {
    padding: 16,
    paddingBottom: 40,
  },
  section: {
    gap: 12,
  },
  subHeader: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.neutral[400],
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: 8,
  },
  actionRow: {
    marginVertical: 4,
  },
  radiusBlock: {
    gap: 8,
  },
  radiusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 8,
    gap: 16,
  },
  radiusBtn: {
    width: 32,
    height: 32,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: 'rgba(16, 185, 129, 0.3)',
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radiusBtnText: {
    color: colors.emerald[400],
    fontSize: 16,
    fontWeight: 'bold',
  },
  radiusValue: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
  },
  infoCard: {
    backgroundColor: 'rgba(255,255,255,0.01)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  infoTitle: {
    color: colors.emerald[400],
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  infoBody: {
    color: colors.neutral[300],
    fontSize: 11,
    fontWeight: '600',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
  },
  textInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 12,
  },
  gpsLockBtn: {
    padding: 6,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 8,
  },
  actionBtn: {
    marginTop: 8,
  },
  routeDetails: {
    gap: 8,
    marginTop: 8,
  },
  routeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderColor: 'rgba(59, 130, 246, 0.2)',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 6,
  },
  recommendationCard: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.2)',
    borderRadius: 12,
    padding: 12,
    gap: 6,
  },
  recommendationHeader: {
    color: colors.emerald[400],
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  recommendationBody: {
    color: colors.neutral[200],
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '500',
  },
  shelterContainer: {
    marginTop: 16,
    gap: 8,
  },
  shelterCard: {
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    padding: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  shelterLeft: {
    flex: 1,
    gap: 2,
  },
  shelterName: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
  shelterReason: {
    color: colors.neutral[400],
    fontSize: 10,
    fontWeight: '600',
  },
  shelterRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  shelterDir: {
    color: colors.emerald[400],
    fontSize: 10,
    fontWeight: '800',
  },
  shelterDist: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  }
});
