import React from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { colors } from '../lib/theme';
import GlassPanel from './ui/GlassPanel';
import AlertBadge from './ui/AlertBadge';
import ShimmerLoader from './ui/ShimmerLoader';
import { Facility } from '../lib/api/emergencyServices';

interface EmergencyServicesListProps {
  facilities: Facility[];
  loading: boolean;
}

const TYPE_DETAILS = {
  hospital: { label: 'Hospital', emoji: '🏥', color: colors.red[500] },
  clinic: { label: 'Clinic', emoji: '🏥', color: colors.blue[400] },
  'fire station': { label: 'Fire Dept', emoji: '🚒', color: colors.amber[500] },
  'police station': { label: 'Police Dept', emoji: '🚔', color: colors.blue[500] },
};

export default function EmergencyServicesList({ facilities, loading }: EmergencyServicesListProps) {
  if (loading) {
    return (
      <GlassPanel style={styles.container}>
        <Text style={styles.header}>Querying Nearby Services...</Text>
        <ShimmerLoader count={3} height={50} style={styles.shimmer} />
      </GlassPanel>
    );
  }

  if (facilities.length === 0) {
    return (
      <GlassPanel style={styles.container}>
        <Text style={styles.header}>Emergency Responder Network</Text>
        <Text style={styles.emptyText}>No emergency response resources within 8km epicentral buffer zone.</Text>
      </GlassPanel>
    );
  }

  const renderItem = ({ item }: { item: Facility }) => {
    const details = TYPE_DETAILS[item.type];
    const isInside = item.status === 'Inside Dome';

    return (
      <View style={styles.row}>
        <View style={styles.iconCol}>
          <Text style={styles.emoji}>{details.emoji}</Text>
        </View>
        <View style={styles.textCol}>
          <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.address} numberOfLines={1}>{item.address}</Text>
        </View>
        <View style={styles.badgeCol}>
          <Text style={styles.distance}>{(item.distance / 1000).toFixed(1)} km</Text>
          <AlertBadge 
            level={isInside ? 'red' : 'green'} 
            label={isInside ? 'compromised' : 'safe zone'}
            style={styles.badge}
          />
        </View>
      </View>
    );
  };

  return (
    <GlassPanel style={styles.container}>
      <Text style={styles.header}>Nearby Response Facilities ({facilities.length})</Text>
      <FlatList
        data={facilities}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        scrollEnabled={false}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </GlassPanel>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 12,
  },
  header: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.neutral[400],
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  emptyText: {
    color: colors.neutral[500],
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: 12,
  },
  shimmer: {
    marginVertical: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  iconCol: {
    marginRight: 12,
  },
  emoji: {
    fontSize: 22,
  },
  textCol: {
    flex: 1,
    gap: 2,
  },
  name: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
  address: {
    color: colors.neutral[400],
    fontSize: 10,
    fontWeight: '500',
  },
  badgeCol: {
    alignItems: 'flex-end',
    gap: 4,
  },
  distance: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
  },
  badge: {
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
  separator: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  }
});
