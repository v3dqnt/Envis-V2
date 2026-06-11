import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions, TouchableOpacity, ScrollView } from 'react-native';
import { CaretUp, CaretDown, ShieldWarning, Sparkle, ShieldCheck } from 'phosphor-react-native';
import { colors } from '../lib/theme';
import GlassPanel from './ui/GlassPanel';
import GradientButton from './ui/GradientButton';
import DisasterTypeGrid from './DisasterTypeGrid';
import VulnerabilityChart from './VulnerabilityChart';
import ShimmerLoader from './ui/ShimmerLoader';
import { analyzePrevention } from '../lib/api/prevention';
import { getVulnerabilityZones } from '../lib/api/vulnerabilityZones';
import { getWeatherRisk } from '../lib/api/weatherRisk';

interface PreventionBottomSheetProps {
  hazardCenter: [number, number] | null;
  hazardRadius: number;
  setHazardRadius: (val: number) => void;
  isPlacingHazard: boolean;
  setIsPlacingHazard: (val: boolean) => void;
  incidentType: string;
  setIncidentType: (type: string) => void;
  cityName: string;
  densityPerKm2: number | null;
  activeDefenses: string[];
  setActiveDefenses: (defenses: string[]) => void;
  vulnerabilityZones: any;
  setVulnerabilityZones: (zones: any) => void;
  setMapFlyToCoords: (coords: [number, number]) => void;
  gdacsEvents: any[];
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const COLLAPSED_HEIGHT = 70;
const EXPANDED_HEIGHT = SCREEN_HEIGHT * 0.7;

const DEFENSES_LIST = [
  'Fire Breaks',
  'Flood Barriers',
  'Seismic Dampeners',
  'Wind Shelters',
  'Evacuation Routes',
  'Emergency Generators',
  'Water Pumps',
  'Chemical Containment'
];

export default function PreventionBottomSheet(props: PreventionBottomSheetProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [weatherRisk, setWeatherRisk] = useState<any>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [strategyMarkdown, setStrategyMarkdown] = useState('');
  const [checklist, setChecklist] = useState<string[]>([]);
  const [vulnMetrics, setVulnMetrics] = useState<any>(null);

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

  // Load weather when epicentre changes
  useEffect(() => {
    if (props.hazardCenter) {
      setWeatherLoading(true);
      getWeatherRisk(props.hazardCenter[1], props.hazardCenter[0], props.cityName || 'Target Area')
        .then(risk => {
          setWeatherRisk(risk);
          // Suggest disaster type based on weather risks
          if (risk.risks?.length > 0) {
            const topRisk = risk.risks[0].type;
            if (['Wildfire', 'Flooding', 'Blizzard', 'Drought', 'Tropical Cyclone'].includes(topRisk)) {
              props.setIncidentType(topRisk === 'Tropical Cyclone' ? 'Tornado' : topRisk);
            }
          }
        })
        .catch(err => console.warn('Could not grab weather profiles:', err))
        .finally(() => setWeatherLoading(false));
    }
  }, [props.hazardCenter]);

  const toggleDefense = (def: string) => {
    if (props.activeDefenses.includes(def)) {
      props.setActiveDefenses(props.activeDefenses.filter(d => d !== def));
    } else {
      props.setActiveDefenses([...props.activeDefenses, def]);
    }
  };

  const handleRunAudit = async () => {
    if (!props.hazardCenter) {
      alert('Please place a simulator zone on the map first.');
      return;
    }
    setLoading(true);
    try {
      // 1. Audit Prevention
      const prev = await analyzePrevention({
        incidentType: props.incidentType,
        cityName: props.cityName || 'Simulator Area',
        activeDefenses: props.activeDefenses,
        densityPerKm2: props.densityPerKm2,
        weatherRisk
      });

      setVulnMetrics(prev.vulnerabilityMetrics);
      setChecklist(prev.checklist);
      setStrategyMarkdown(prev.strategyMarkdown);

      // 2. Generate GIS zones
      const zones = await getVulnerabilityZones({
        lat: props.hazardCenter[1],
        lng: props.hazardCenter[0],
        disasterType: props.incidentType,
        cityName: props.cityName || 'Simulator Area',
        radiusKm: 5
      });
      props.setVulnerabilityZones(zones);

    } catch (e) {
      alert('MITIGATION AUDIT OFFLINE');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Animated.View style={[styles.bottomSheet, { height: slideAnim }]}>
      <GlassPanel style={styles.sheetContent} noPadding>
        {/* Drag Handle Row */}
        <TouchableOpacity onPress={toggleExpand} style={styles.dragHandle} activeOpacity={0.8}>
          <View style={styles.handleBar} />
          <View style={styles.handleHeader}>
            <ShieldWarning size={18} color={colors.red[400]} weight="fill" />
            <Text style={styles.handleTitle}>Structural Mitigation Panel</Text>
            {isExpanded ? <CaretDown size={14} color="#fff" /> : <CaretUp size={14} color="#fff" />}
          </View>
        </TouchableOpacity>

        {isExpanded && (
          <ScrollView contentContainerStyle={styles.scrollArea}>
            <DisasterTypeGrid
              selected={props.incidentType}
              onSelect={props.setIncidentType}
            />

            {/* Epicentre Lock Button */}
            <GradientButton
              title={props.isPlacingHazard ? 'Awaiting Map Press...' : 'Define Audit Simulation Center'}
              variant={props.isPlacingHazard ? 'red' : 'emerald'}
              onPress={() => props.setIsPlacingHazard(!props.isPlacingHazard)}
              fullWidth
              style={styles.actionBtn}
            />

            {/* Radius Range */}
            {props.hazardCenter && (
              <View style={styles.radiusBlock}>
                <Text style={styles.subHeader}>Simulation Scope Range</Text>
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
              </View>
            )}

            {/* Climate risk details */}
            {weatherRisk && (
              <View style={styles.weatherCard}>
                <Text style={styles.weatherHeader}>Local Climate Risk Feed</Text>
                {weatherLoading ? (
                  <ShimmerLoader count={2} height={30} />
                ) : (
                  weatherRisk.risks?.map((r: any, idx: number) => (
                    <View key={idx} style={styles.riskRow}>
                      <View style={styles.riskBadge}>
                        <Text style={styles.riskBadgeText}>{r.level.toUpperCase()}</Text>
                      </View>
                      <Text style={styles.riskText}>
                        <Text style={styles.boldText}>{r.type}: </Text>
                        {r.details}
                      </Text>
                    </View>
                  ))
                )}
              </View>
            )}

            {/* active Defenses */}
            <Text style={styles.subHeader}>Active Defense Countermeasures</Text>
            <View style={styles.defensesGrid}>
              {DEFENSES_LIST.map((def) => {
                const isActive = props.activeDefenses.includes(def);
                return (
                  <TouchableOpacity
                    key={def}
                    onPress={() => toggleDefense(def)}
                    style={[
                      styles.defenseBadge,
                      isActive ? styles.defenseActive : styles.defenseInactive
                    ]}
                  >
                    <Text style={[
                      styles.defenseText,
                      isActive ? styles.defenseTextActive : styles.defenseTextInactive
                    ]}>
                      {def}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <GradientButton
              title={loading ? 'Running Structural Scans...' : 'Initiate Vulnerability Scan'}
              icon={<Sparkle size={14} color="#fff" weight="fill" />}
              onPress={handleRunAudit}
              fullWidth
              style={styles.runBtn}
            />

            {/* Audit Details */}
            {vulnMetrics && (
              <View style={styles.auditResults}>
                <VulnerabilityChart metrics={vulnMetrics} />

                {/* Checklist */}
                {checklist.length > 0 && (
                  <View style={styles.checklistSection}>
                    <Text style={styles.subHeader}>Prioritized Preparation Guide</Text>
                    {checklist.map((item, idx) => (
                      <View key={idx} style={styles.checkRow}>
                        <ShieldCheck size={16} color={colors.emerald[400]} weight="fill" />
                        <Text style={styles.checkText}>{item}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Strategy Directive Markdown */}
                {strategyMarkdown ? (
                  <View style={styles.strategyCard}>
                    <Text style={styles.strategyHeader}>Mitigation Directive</Text>
                    <Text style={styles.strategyText}>{strategyMarkdown}</Text>
                  </View>
                ) : null}
              </View>
            )}

            {/* GDACS warnings feeds inside sheet */}
            {props.gdacsEvents?.length > 0 && (
              <View style={styles.gdacsSection}>
                <Text style={styles.subHeader}>Active Global GDACS Alerts</Text>
                {props.gdacsEvents.slice(0, 5).map((e) => (
                  <TouchableOpacity
                    key={e.id}
                    onPress={() => {
                      props.setMapFlyToCoords(e.coordinates);
                      props.setIncidentType(e.type === 'Tornado/Cyclone' ? 'Tornado' : e.type);
                    }}
                    style={styles.gdacsCard}
                  >
                    <View style={styles.gdacsRow}>
                      <View style={[styles.gdacsIndicator, { backgroundColor: e.alertLevel === 'red' ? colors.red[500] : colors.amber[500] }]} />
                      <Text style={styles.gdacsTitle}>{e.name}</Text>
                    </View>
                    <Text style={styles.gdacsMeta}>{e.country} • {e.date}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </ScrollView>
        )}
      </GlassPanel>
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
  scrollArea: {
    padding: 16,
    paddingBottom: 40,
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
  actionBtn: {
    marginTop: 4,
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
  weatherCard: {
    backgroundColor: 'rgba(255,255,255,0.01)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    padding: 12,
    gap: 6,
  },
  weatherHeader: {
    color: colors.emerald[400],
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  riskRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 4,
  },
  riskBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  riskBadgeText: {
    color: colors.red[400],
    fontSize: 7,
    fontWeight: '900',
  },
  riskText: {
    color: colors.neutral[300],
    fontSize: 10,
    fontWeight: '500',
    flex: 1,
  },
  boldText: {
    fontWeight: '800',
    color: '#ffffff',
  },
  defensesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  defenseBadge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  defenseInactive: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  defenseActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: colors.emerald[400],
  },
  defenseText: {
    fontSize: 10,
    fontWeight: '700',
  },
  defenseTextInactive: {
    color: colors.neutral[400],
  },
  defenseTextActive: {
    color: '#ffffff',
  },
  runBtn: {
    marginTop: 12,
  },
  auditResults: {
    gap: 12,
  },
  checklistSection: {
    gap: 8,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.01)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
    borderRadius: 10,
    padding: 10,
  },
  checkText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
  },
  strategyCard: {
    backgroundColor: 'rgba(16, 185, 129, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.15)',
    borderRadius: 14,
    padding: 12,
    gap: 6,
  },
  strategyHeader: {
    color: colors.emerald[400],
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  strategyText: {
    color: colors.neutral[200],
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '500',
  },
  gdacsSection: {
    marginTop: 16,
    gap: 8,
  },
  gdacsCard: {
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    padding: 10,
  },
  gdacsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  gdacsIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  gdacsTitle: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
  },
  gdacsMeta: {
    color: colors.neutral[500],
    fontSize: 9,
    fontWeight: '600',
    marginLeft: 14,
  }
});
