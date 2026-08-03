import React from 'react';
import { View, ViewStyle, StyleProp, StyleSheet } from 'react-native';
import { colors } from '../../lib/theme';

interface GlassPanelProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  noPadding?: boolean;
  active?: boolean;
}

export default function GlassPanel({ children, style, noPadding, active }: GlassPanelProps) {
  return (
    <View style={[
      styles.panel, 
      active && styles.activeBorder,
      !noPadding && styles.padding, 
      style
    ]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.surfaceGlass,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    // Shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 12,
  },
  activeBorder: {
    borderColor: colors.borderActive,
  },
  padding: {
    padding: 16,
  },
});
