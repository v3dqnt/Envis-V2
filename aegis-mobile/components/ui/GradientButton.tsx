import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../../lib/theme';

interface GradientButtonProps {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  fullWidth?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  variant?: 'emerald' | 'red' | 'blue';
}

const GRADIENTS: Record<'emerald' | 'red' | 'blue', readonly [string, string, ...string[]]> = {
  emerald: ['#059669', '#10b981', '#34d399', '#059669'],
  red: ['#dc2626', '#ef4444', '#f87171', '#dc2626'],
  blue: ['#1d4ed8', '#3b82f6', '#60a5fa', '#1d4ed8']
};

export default function GradientButton({
  title,
  onPress,
  loading = false,
  disabled = false,
  icon,
  fullWidth = false,
  style,
  textStyle,
  variant = 'emerald'
}: GradientButtonProps) {
  const isInteractionDisabled = disabled || loading;
  const colorsList = GRADIENTS[variant];

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isInteractionDisabled}
      style={[
        styles.buttonContainer,
        fullWidth && styles.fullWidth,
        isInteractionDisabled && styles.disabled,
        style
      ]}
      activeOpacity={0.8}
    >
      <LinearGradient
        colors={colorsList}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.gradient}
      >
        {loading ? (
          <ActivityIndicator size="small" color="#ffffff" />
        ) : (
          <>
            {icon && icon}
            <Text style={[styles.text, textStyle]}>{title}</Text>
          </>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  buttonContainer: {
    borderRadius: 14,
    overflow: 'hidden',
    height: 48,
  },
  fullWidth: {
    width: '100%',
  },
  gradient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    gap: 8,
  },
  text: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  disabled: {
    opacity: 0.5,
  }
});
