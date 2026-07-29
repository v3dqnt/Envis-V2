import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList } from 'react-native';
import { colors } from '../lib/theme';

export interface DisasterType {
  id: string;
  label: string;
  emoji: string;
}

const DISASTER_TYPES: DisasterType[] = [
  { id: 'Wildfire', label: 'Wildfire', emoji: '🔥' },
  { id: 'Flooding', label: 'Flooding', emoji: '🌊' },
  { id: 'Toxic Plume', label: 'Toxic Plume', emoji: '☠️' },
  { id: 'Earthquake', label: 'Earthquake', emoji: '🌍' },
  { id: 'Tornado', label: 'Tornado', emoji: '🌪' },
  { id: 'Radiation Leak', label: 'Radiation', emoji: '☢️' },
  { id: 'Chemical Spill', label: 'Chem Spill', emoji: '🧪' },
  { id: 'Blizzard', label: 'Blizzard', emoji: '❄️' },
  { id: 'Volcanic Eruption', label: 'Volcano', emoji: '🌋' },
];

interface DisasterTypeGridProps {
  selected: string;
  onSelect: (type: string) => void;
}

export default function DisasterTypeGrid({ selected, onSelect }: DisasterTypeGridProps) {
  const renderItem = ({ item }: { item: DisasterType }) => {
    const isSelected = selected === item.id;
    return (
      <TouchableOpacity
        onPress={() => onSelect(item.id)}
        activeOpacity={0.75}
        style={[
          styles.gridTile,
          isSelected ? styles.tileSelected : styles.tileUnselected
        ]}
      >
        <Text style={styles.emoji}>{item.emoji}</Text>
        <Text style={[
          styles.label,
          isSelected ? styles.labelSelected : styles.labelUnselected
        ]}>{item.label}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Threat Classification Profile</Text>
      <FlatList
        data={DISASTER_TYPES}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        numColumns={3}
        scrollEnabled={false}
        columnWrapperStyle={styles.row}
      />
    </View>
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
    marginBottom: 8,
  },
  row: {
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  gridTile: {
    flex: 1,
    marginHorizontal: 3,
    height: 70,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  tileUnselected: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  tileSelected: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderColor: colors.emerald[400],
  },
  emoji: {
    fontSize: 20,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
  },
  labelUnselected: {
    color: colors.neutral[400],
  },
  labelSelected: {
    color: '#ffffff',
  }
});
