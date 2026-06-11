import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { CycloneEvent, EarthquakeEvent } from '../lib/api/liveFeed';
import { colors } from '../lib/theme';
import GlassPanel from './ui/GlassPanel';
import AlertBadge from './ui/AlertBadge';
import ShimmerLoader from './ui/ShimmerLoader';
import { Globe, TrendUp, WarningOctagon } from 'phosphor-react-native';

interface GdacsLiveFeedProps {
  cyclones: CycloneEvent[];
  earthquakes: EarthquakeEvent[];
  feedLoading: boolean;
  onEventPress: (coordinates: [number, number], incidentType: string, eventName: string, eventDetails: any) => void;
}

export default function GdacsLiveFeed({
  cyclones,
  earthquakes,
  feedLoading,
  onEventPress
}: GdacsLiveFeedProps) {
  const [activeTab, setActiveTab] = useState<'cyclones' | 'earthquakes'>('cyclones');

  // Stats derivation
  const redCyclones = cyclones.filter(c => c.alertLevel === 'red').length;
  const redEarthquakes = earthquakes.filter(e => e.alertLevel === 'red').length;
  const tsunamiRisk = earthquakes.filter(e => e.tsunami).length;

  const renderCycloneCard = (c: CycloneEvent) => {
    return (
      <TouchableOpacity
        key={c.id}
        onPress={() => onEventPress(c.coordinates, 'Tornado', c.name, c)}
        style={styles.card}
      >
        <View style={styles.cardHeader}>
          <AlertBadge level={c.alertLevel} />
          <Text style={styles.eventName} numberOfLines={1}>{c.name}</Text>
          <View style={[styles.sourceBadge, { backgroundColor: c.source === 'GDACS' ? 'rgba(16,185,129,0.12)' : 'rgba(139,92,246,0.12)' }]}>
            <Text style={[styles.sourceText, { color: c.source === 'GDACS' ? colors.emerald[400] : '#a78bfa' }]}>{c.source}</Text>
          </View>
        </View>

        <View style={styles.cardBody}>
          <Text style={styles.metaText}>Region: {c.country}</Text>
          {c.windSpeed && (
            <Text style={styles.metaText}>Max Velocity: {c.windSpeed} km/h</Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderEarthquakeCard = (e: EarthquakeEvent) => {
    return (
      <TouchableOpacity
        key={e.id}
        onPress={() => onEventPress(e.coordinates, 'Earthquake', e.name, e)}
        style={styles.card}
      >
        <View style={styles.cardHeader}>
          <AlertBadge level={e.alertLevel} />
          <Text style={styles.eventName} numberOfLines={1}>{e.name}</Text>
          <View style={[styles.sourceBadge, { backgroundColor: e.source === 'GDACS' ? 'rgba(16,185,129,0.12)' : 'rgba(59,130,246,0.12)' }]}>
            <Text style={[styles.sourceText, { color: e.source === 'GDACS' ? colors.emerald[400] : colors.blue[400] }]}>{e.source}</Text>
          </View>
        </View>

        <View style={styles.cardBody}>
          <Text style={styles.metaText}>Magnitude: M{e.magnitude.toFixed(1)} • Depth: {e.depth}km</Text>
          {e.tsunami && (
            <View style={styles.tsunamiContainer}>
              <Text style={styles.tsunamiText}>🌊 TSUNAMI SIGNAL ACTIVE</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <GlassPanel style={styles.container} noPadding>
      {/* Tactical Stats Header */}
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statVal}>{redCyclones}</Text>
          <Text style={styles.statLabel}>Red Storms</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statVal}>{redEarthquakes}</Text>
          <Text style={styles.statLabel}>Red Quakes</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={[styles.statVal, tsunamiRisk > 0 && { color: colors.blue[400] }]}>{tsunamiRisk}</Text>
          <Text style={styles.statLabel}>Tsunami Risks</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabsRow}>
        <TouchableOpacity
          onPress={() => setActiveTab('cyclones')}
          style={[styles.tabButton, activeTab === 'cyclones' && styles.tabActive]}
        >
          <Text style={[styles.tabText, activeTab === 'cyclones' && styles.tabTextActive]}>Cyclones ({cyclones.length})</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setActiveTab('earthquakes')}
          style={[styles.tabButton, activeTab === 'earthquakes' && styles.tabActive]}
        >
          <Text style={[styles.tabText, activeTab === 'earthquakes' && styles.tabTextActive]}>Earthquakes ({earthquakes.length})</Text>
        </TouchableOpacity>
      </View>

      {/* Feed list */}
      <ScrollView contentContainerStyle={styles.listContainer}>
        {feedLoading ? (
          <ShimmerLoader count={3} height={60} />
        ) : activeTab === 'cyclones' ? (
          cyclones.length === 0 ? (
            <Text style={styles.emptyText}>No active tropical storm tracking profiles found.</Text>
          ) : (
            cyclones.map(renderCycloneCard)
          )
        ) : (
          earthquakes.length === 0 ? (
            <Text style={styles.emptyText}>No active seismic triggers detected.</Text>
          ) : (
            earthquakes.map(renderEarthquakeCard)
          )
        )}
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <Globe size={12} color={colors.neutral[500]} />
        <Text style={styles.footerText}>GDACS / USGS Live Aggregator Node</Text>
      </View>
    </GlassPanel>
  );
}

const styles = StyleSheet.create({
  container: {
    maxHeight: 320,
    width: '100%',
  },
  statsRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    paddingVertical: 10,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
  },
  statVal: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
  },
  statLabel: {
    color: colors.neutral[500],
    fontSize: 8,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tabsRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderBottomWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: colors.emerald[500],
  },
  tabText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.neutral[500],
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tabTextActive: {
    color: '#ffffff',
  },
  listContainer: {
    padding: 12,
    gap: 8,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    padding: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  eventName: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
    flex: 1,
  },
  sourceBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  sourceText: {
    fontSize: 8,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  cardBody: {
    paddingLeft: 14,
    gap: 2,
  },
  metaText: {
    color: colors.neutral[400],
    fontSize: 9,
    fontWeight: '600',
  },
  tsunamiContainer: {
    marginTop: 4,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  tsunamiText: {
    color: colors.blue[400],
    fontSize: 8,
    fontWeight: '900',
  },
  emptyText: {
    color: colors.neutral[500],
    fontSize: 10,
    textAlign: 'center',
    paddingVertical: 24,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  footerText: {
    color: colors.neutral[500],
    fontSize: 8,
    fontWeight: '800',
    textTransform: 'uppercase',
  }
});
