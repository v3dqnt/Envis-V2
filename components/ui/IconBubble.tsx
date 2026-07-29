import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { sharedStyles } from '../../lib/styles';

interface IconBubbleProps {
  children: React.ReactNode;
  variant: 'emerald' | 'red' | 'amber' | 'blue';
  size?: number;
  style?: ViewStyle;
}

export default function IconBubble({ children, variant, size = 48, style }: IconBubbleProps) {
  const variantStyle = (() => {
    switch (variant) {
      case 'emerald': return sharedStyles.iconBubbleEmerald;
      case 'red': return sharedStyles.iconBubbleRed;
      case 'amber': return sharedStyles.iconBubbleAmber;
      case 'blue': return sharedStyles.iconBubbleBlue;
    }
  })();

  return (
    <View style={[
      sharedStyles.iconBubble,
      variantStyle,
      { width: size, height: size, borderRadius: size / 3 },
      style
    ]}>
      {children}
    </View>
  );
}
