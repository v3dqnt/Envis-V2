// Design system tokens — dark-mode-only emerald glassmorphism
export const colors = {
  background: '#070709',
  surface: '#0d0d12',
  surfaceGlass: 'rgba(13, 13, 18, 0.85)',
  
  emerald: {
    50: '#ecfdf5',
    100: '#d1fae5',
    200: '#a7f3d0',
    300: '#6ee7b7',
    400: '#34d399',  // Accent text
    500: '#10b981',  // Primary color
    600: '#059669',  // Gradient start
    700: '#047857',
    800: '#065f46',
    900: '#064e3b',
    glow: 'rgba(16, 185, 129, 0.25)',
  },
  
  neutral: {
    100: '#f5f5f5',
    200: '#e5e5e5',
    300: '#d4d4d4',
    400: '#a3a3a3',
    500: '#737373',  // Secondary text
    600: '#404040',  // Dividers/borders
    700: '#262626',
    800: '#171717',
    900: '#0a0a0a',
  },
  
  red: { 400: '#f87171', 500: '#ef4444', glow: 'rgba(239, 68, 68, 0.25)' },
  amber: { 400: '#fbbf24', 500: '#f59e0b', glow: 'rgba(245, 158, 11, 0.25)' },
  blue: { 400: '#60a5fa', 500: '#3b82f6', glow: 'rgba(59, 130, 246, 0.25)' },
  
  border: 'rgba(255, 255, 255, 0.08)',
  borderActive: 'rgba(16, 185, 129, 0.35)',
  white: '#ffffff',
  textPrimary: '#ffffff',
  textSecondary: '#a3a3a3',
  textMuted: '#525252',
};

export const shadows = {
  glassPanel: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.6,
    shadowRadius: 32,
    elevation: 24,
  },
  emeraldGlow: {
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
    elevation: 10,
  },
};

export const typography = {
  heading: {
    fontWeight: '900' as const,
    letterSpacing: 0.5,
    color: '#ffffff',
  },
  label: {
    fontWeight: '800' as const,
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
    color: '#a3a3a3',
  },
  body: {
    fontWeight: '500' as const,
    fontSize: 13,
    color: '#a3a3a3',
  },
  mono: {
    fontFamily: 'Platform-Mono' as const, // will fall back to monospace
    fontSize: 12,
  },
};
