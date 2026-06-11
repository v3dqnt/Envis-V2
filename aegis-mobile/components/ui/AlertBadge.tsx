import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { colors } from '../../lib/theme';

interface AlertBadgeProps {
  level: 'red' | 'orange' | 'green' | 'yellow';
  label?: string;
  size?: 'sm' | 'md';
  style?: ViewStyle;
}

export default function AlertBadge({ level, label, size = 'sm', style }: AlertBadgeProps) {
  const badgeColor = (() => {
    switch (level) {
      case 'red': return colors.red[500];
      case 'orange': return colors.amber[500];
      case 'yellow': return colors.amber[400];
      case 'green': return colors.emerald[500];
    }
  })();

  if (!label) {
    const dotSize = size === 'sm' ? 8 : 12;
    return (
      <View style={[
        styles.dot, 
        { width: dotSize, height: dotSize, borderRadius: dotSize / 2, backgroundColor: badgeColor },
        style
      ]} />
    );
  }

  return (
    <View style={[
      styles.badgeContainer,
      { backgroundColor: `${badgeColor}20`, borderColor: `${badgeColor}40` },
      style
    ]}>
      <View style={[styles.badgeDot, { backgroundColor: badgeColor }]} />
      <Text style={[styles.badgeText, { color: badgeColor }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  dot: {
    marginHorizontal: 4,
  },
  badgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  }
});
