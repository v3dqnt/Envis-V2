import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, ViewStyle, DimensionValue } from 'react-native';

interface ShimmerLoaderProps {
  width?: DimensionValue;
  height?: number;
  borderRadius?: number;
  count?: number;
  style?: ViewStyle;
}

export default function ShimmerLoader({
  width = '100%',
  height = 16,
  borderRadius = 6,
  count = 1,
  style
}: ShimmerLoaderProps) {
  const animatedValue = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(animatedValue, {
          toValue: 0.7,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(animatedValue, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        })
      ])
    ).start();
  }, [animatedValue]);

  const items = Array.from({ length: count });

  return (
    <View style={styles.container}>
      {items.map((_, idx) => (
        <Animated.View
          key={idx}
          style={[
            styles.shimmer,
            {
              width,
              height,
              borderRadius,
              opacity: animatedValue
            },
            style
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
    width: '100%',
  },
  shimmer: {
    backgroundColor: '#1c1c24',
  }
});
