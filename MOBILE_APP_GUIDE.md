# 🛡️ Aegis — Mobile App Build Guide (Expo Go / React Native)

> **Scope**: This document is the _complete_ technical blueprint for rebuilding the [Aegis Disaster Evacuation Control](https://envistwo.vercel.app) web application as a native Android app using **Expo Go** and **React Native**. Every screen, API integration, design token, and data flow documented below is an **exact mirror** of the production web app.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack & Dependencies](#2-tech-stack--dependencies)
3. [Project Initialization](#3-project-initialization)
4. [Environment Variables](#4-environment-variables)
5. [Design System & Theming](#5-design-system--theming)
6. [Authentication (Supabase)](#6-authentication-supabase)
7. [Navigation & Routing](#7-navigation--routing)
8. [Screen 1 — Login / Sign-Up](#8-screen-1--login--sign-up)
9. [Screen 2 — Main Dashboard (Map + Sidebars)](#9-screen-2--main-dashboard-map--sidebars)
10. [Component: Map Dashboard](#10-component-map-dashboard)
11. [Component: Routing Sidebar (Evacuation Mode)](#11-component-routing-sidebar-evacuation-mode)
12. [Component: Prevention Sidebar (Aegis Prevent)](#12-component-prevention-sidebar-aegis-prevent)
13. [Component: GDACS Right Feed](#13-component-gdacs-right-feed)
14. [Component: Report Incident Modal](#14-component-report-incident-modal)
15. [API Integrations — Complete Reference](#15-api-integrations--complete-reference)
16. [State Management Architecture](#16-state-management-architecture)
17. [Offline & PWA Considerations](#17-offline--pwa-considerations)
18. [Build, Test & Deploy](#18-build-test--deploy)
19. [File Structure](#19-file-structure)

---

## 1. Project Overview

**Aegis** is a real-time AI-powered disaster evacuation and prevention dashboard. It combines:

- **Interactive map** with hazard dome visualization, evacuation route overlays, shelter markers, bypass routing, and vulnerability zone heatmaps.
- **AI-powered evacuation engine** (OpenAI GPT-4o) that calculates detour waypoints around hazard zones and generates emergency safety guidelines.
- **AI-powered prevention engine** that performs structural vulnerability audits using real climate data.
- **Live global disaster feeds** from GDACS, USGS, Tomorrow.io, and XWeather showing real-time cyclones and earthquakes worldwide.
- **Emergency services locator** that finds nearby hospitals, clinics, fire stations, and police stations using TomTom POI search.
- **Reverse geocoding & population density** estimation for any coordinates using MapTiler and OpenAI.
- **Real-world shelter discovery** using TomTom Category Search to locate schools, stadiums, parks, and community centers.
- **Weather risk analysis** using 10-year historical climate data from Open-Meteo.
- **Supabase authentication** (email/password + Google OAuth).

### Web App Architecture

The web app is built with:
| Web Tech | Mobile Equivalent |
|---|---|
| Next.js 16 (App Router) | Expo Router (file-based routing) |
| React 19 | React Native 0.76+ |
| MapLibre GL JS | `react-native-maps` (Google Maps / MapBox) |
| Tailwind CSS v4 | `nativewind` v4 or `StyleSheet.create()` |
| shadcn/ui (base-ui) | `react-native-paper` or custom components |
| `lucide-react` + `@phosphor-icons/react` | `@expo/vector-icons` + `phosphor-react-native` |
| Next.js API Routes (`/api/*`) | Direct `fetch()` to external APIs (or Express backend) |
| Supabase SSR (`@supabase/ssr`) | `@supabase/supabase-js` + `@react-native-async-storage/async-storage` |

---

## 2. Tech Stack & Dependencies

### Core Dependencies

```json
{
  "dependencies": {
    "expo": "~52.0.0",
    "expo-router": "~4.0.0",
    "expo-status-bar": "~2.0.0",
    "expo-location": "~17.0.0",
    "expo-linking": "~7.0.0",
    "expo-secure-store": "~14.0.0",
    "expo-constants": "~17.0.0",
    "expo-web-browser": "~14.0.0",

    "react": "18.3.1",
    "react-native": "0.76.9",
    "react-native-maps": "1.18.0",
    "react-native-maps-directions": "^1.9.0",
    "react-native-paper": "^5.12.0",
    "react-native-safe-area-context": "^4.14.0",
    "react-native-screens": "^4.4.0",
    "react-native-gesture-handler": "~2.20.0",
    "react-native-reanimated": "~3.16.0",
    "react-native-svg": "^15.11.0",

    "@supabase/supabase-js": "^2.108.1",
    "@react-native-async-storage/async-storage": "^2.1.0",

    "phosphor-react-native": "^2.1.0",
    "@expo/vector-icons": "^14.0.0",

    "openai": "^6.42.0"
  }
}
```

### Dev Dependencies

```json
{
  "devDependencies": {
    "@types/react": "~18.3.0",
    "typescript": "~5.3.0"
  }
}
```

---

## 3. Project Initialization

```bash
# Create Expo project with TypeScript template
npx -y create-expo-app@latest aegis-mobile --template blank-typescript

cd aegis-mobile

# Install navigation
npx expo install expo-router expo-linking expo-constants expo-status-bar

# Install map
npx expo install react-native-maps

# Install auth dependencies
npx expo install @supabase/supabase-js @react-native-async-storage/async-storage expo-secure-store expo-web-browser

# Install location
npx expo install expo-location

# Install UI
npx expo install react-native-paper react-native-safe-area-context react-native-screens react-native-gesture-handler react-native-reanimated react-native-svg

# Install icons
npx expo install @expo/vector-icons
npm install phosphor-react-native

# Install AI
npm install openai

# Install directions (for route polylines on the map)
npm install react-native-maps-directions
```

### `app.json` Configuration

```json
{
  "expo": {
    "name": "Aegis",
    "slug": "aegis-mobile",
    "version": "1.0.0",
    "orientation": "portrait",
    "scheme": "aegis",
    "icon": "./assets/icon.png",
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#070709"
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#070709"
      },
      "package": "com.aegis.disasterapp",
      "config": {
        "googleMaps": {
          "apiKey": "YOUR_GOOGLE_MAPS_API_KEY"
        }
      },
      "permissions": [
        "ACCESS_FINE_LOCATION",
        "ACCESS_COARSE_LOCATION"
      ]
    },
    "plugins": [
      "expo-router",
      "expo-location",
      "expo-secure-store"
    ]
  }
}
```

---

## 4. Environment Variables

Create a `.env` file at the project root. Expo loads these via `expo-constants`.

```env
EXPO_PUBLIC_SUPABASE_URL=https://fnrjndpkaszgpnbykodm.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZucmpuZHBrYXN6Z3BuYnlrb2RtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4MTU2MjUsImV4cCI6MjA5NjM5MTYyNX0.ouUaUNUPtevm0qtZGNYG6XnK4NP-OO46y1IZJYda-Ts
EXPO_PUBLIC_MAPTILER_API_KEY=Ah2PdHlEzAfaeoQBZPzZ
EXPO_PUBLIC_TOMTOM_API_KEY=fqSazhj2APo816F2cBqqxI0e4GqatpEh
EXPO_PUBLIC_OPENAI_API_KEY=sk-proj-YOUR_KEY_HERE
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=YOUR_GOOGLE_MAPS_API_KEY
```

### Accessing in Code

```typescript
// In any component:
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
const TOMTOM_KEY = process.env.EXPO_PUBLIC_TOMTOM_API_KEY!;
const MAPTILER_KEY = process.env.EXPO_PUBLIC_MAPTILER_API_KEY!;
const OPENAI_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY!;
```

> ⚠️ **Security Note**: The web app uses Next.js API Routes to keep the `OPENAI_API_KEY` server-side. In the mobile app, you have two options:
> 1. **Quick (Expo Go)**: Call OpenAI directly from the client (key exposed but acceptable for hackathon).
> 2. **Production**: Set up a lightweight Express/Hono server and proxy all OpenAI calls through it.

---

## 5. Design System & Theming

The Aegis design system is a **dark-mode-only**, glassmorphism-heavy UI with emerald accent colors.

### Color Palette

```typescript
// lib/theme.ts
export const colors = {
  // Backgrounds
  background: '#070709',       // Main background (near-black)
  surface: '#0d0d10',          // Card/panel background
  surfaceGlass: 'rgba(13, 13, 16, 0.94)',  // Glass panel background

  // Emerald Accent (primary)
  emerald: {
    50: '#ecfdf5',
    100: '#d1fae5',
    200: '#a7f3d0',
    300: '#6ee7b7',
    400: '#34d399',  // Primary text accent
    500: '#10b981',  // Primary buttons
    600: '#059669',  // Gradient start
    700: '#047857',
    800: '#065f46',
    900: '#064e3b',
  },

  // Neutral (text hierarchy)
  neutral: {
    400: '#a3a3a3',
    500: '#737373',  // Secondary text
    600: '#525252',  // Disabled / dividers
    700: '#404040',
  },

  // Status colors
  red: { 400: '#f87171', 500: '#ef4444' },
  amber: { 400: '#fbbf24', 500: '#f59e0b' },
  blue: { 400: '#60a5fa', 500: '#3b82f6' },

  // Borders
  border: 'rgba(255, 255, 255, 0.08)',
  borderHover: 'rgba(255, 255, 255, 0.15)',

  // Text
  white: '#ffffff',
  textPrimary: '#ffffff',
  textSecondary: '#737373',
  textMuted: '#525252',
};

// Shadows
export const shadows = {
  glassPanel: '0 12px 48px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.4)',
  emeraldGlow: '0 0 20px rgba(16,185,129,0.4), 0 4px 15px rgba(0,0,0,0.3)',
  emeraldGlowHover: '0 0 35px rgba(16,185,129,0.6), 0 6px 20px rgba(0,0,0,0.4)',
};
```

### Typography

The web app uses `system-ui` (San Francisco on iOS, Roboto on Android). React Native uses the platform default, which matches perfectly.

```typescript
export const typography = {
  heading: { fontWeight: '900' as const, letterSpacing: 0.5 },
  label: { fontWeight: '800' as const, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase' as const },
  body: { fontWeight: '500' as const, fontSize: 13, color: colors.neutral[500] },
  mono: { fontFamily: 'monospace' },
};
```

### Shared Styles (Glass Panel, Gradient Button, Icon Bubbles)

```typescript
// lib/styles.ts
import { StyleSheet } from 'react-native';
import { colors } from './theme';

export const sharedStyles = StyleSheet.create({
  // Glass panel — the primary card container
  glassPanel: {
    backgroundColor: colors.surfaceGlass,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    // Shadow (Android + iOS)
    elevation: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.6,
    shadowRadius: 48,
  },

  // Gradient button (use LinearGradient from expo-linear-gradient)
  btnGradient: {
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
  },

  // Icon bubble base
  iconBubble: {
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },

  // Emerald icon bubble
  iconBubbleEmerald: {
    backgroundColor: 'rgba(16,185,129,0.15)',
    borderColor: 'rgba(16,185,129,0.3)',
  },

  // Red icon bubble
  iconBubbleRed: {
    backgroundColor: 'rgba(239,68,68,0.15)',
    borderColor: 'rgba(239,68,68,0.3)',
  },

  // Amber icon bubble
  iconBubbleAmber: {
    backgroundColor: 'rgba(245,158,11,0.15)',
    borderColor: 'rgba(245,158,11,0.3)',
  },

  // Blue icon bubble
  iconBubbleBlue: {
    backgroundColor: 'rgba(59,130,246,0.15)',
    borderColor: 'rgba(59,130,246,0.3)',
  },
});
```

---

## 6. Authentication (Supabase)

### Setting up the Supabase Client

```typescript
// lib/supabase.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
```

### Auth Methods Supported

The web app supports:

1. **Email + Password sign-in / sign-up**
2. **Google OAuth** (via Supabase OAuth redirect)

#### Email Auth

```typescript
// Sign Up
const { error } = await supabase.auth.signUp({
  email,
  password,
  options: { emailRedirectTo: 'aegis://auth/callback' },
});

// Sign In
const { error } = await supabase.auth.signInWithPassword({ email, password });

// Sign Out
await supabase.auth.signOut();
```

#### Google OAuth

For Google OAuth in React Native, use `expo-web-browser` and `expo-auth-session`:

```typescript
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';

WebBrowser.maybeCompleteAuthSession();

const redirectTo = makeRedirectUri();

const handleGoogleSignIn = async () => {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  });

  if (data?.url) {
    const result = await WebBrowser.openAuthSessionAsync(
      data.url,
      redirectTo
    );

    if (result.type === 'success') {
      const url = result.url;
      // Extract tokens from the URL hash
      const params = new URLSearchParams(url.split('#')[1]);
      const access_token = params.get('access_token');
      const refresh_token = params.get('refresh_token');

      if (access_token && refresh_token) {
        await supabase.auth.setSession({ access_token, refresh_token });
      }
    }
  }
};
```

### Session Listener

```typescript
// In your root layout or _layout.tsx:
useEffect(() => {
  supabase.auth.getSession().then(({ data: { session } }) => {
    setSession(session);
  });

  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    (_event, session) => {
      setSession(session);
    }
  );

  return () => subscription.unsubscribe();
}, []);
```

---

## 7. Navigation & Routing

The web app has these routes:

| Web Route | Mobile Route (Expo Router) |
|---|---|
| `/auth/login` | `app/(auth)/login.tsx` |
| `/auth/callback` | Handled by `expo-web-browser` |
| `/` (main dashboard) | `app/(app)/index.tsx` |

### File-Based Routing Setup

```
app/
├── _layout.tsx            # Root layout (auth guard)
├── (auth)/
│   ├── _layout.tsx        # Auth layout (no bottom nav)
│   └── login.tsx          # Login screen
└── (app)/
    ├── _layout.tsx        # App layout (with tab bar or no bar — fullscreen)
    └── index.tsx          # Main dashboard
```

### Root Layout with Auth Guard

```typescript
// app/_layout.tsx
import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (loading) return;
    const inAuthGroup = segments[0] === '(auth)';

    if (!session && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (session && inAuthGroup) {
      router.replace('/(app)');
    }
  }, [session, segments, loading]);

  if (loading) return null; // or a splash screen

  return <Stack screenOptions={{ headerShown: false }} />;
}
```

---

## 8. Screen 1 — Login / Sign-Up

### UI Specification (mirrors web exactly)

- **Background**: `#070709` (near-black) with 3 ambient emerald glow blobs
- **Subtle grid pattern**: semi-transparent white grid lines (`40px × 40px`)
- **Logo**: Centered shield icon (Phosphor `ShieldChevron` duotone, emerald-400) inside an `icon-bubble-emerald` container with outer blur glow
- **Title**: "Aegis" (white, `font-black`, `text-2xl`, `tracking-tight`)
- **Subtitle**: "Disaster Evacuation Control" (neutral-500, `text-xs`, `tracking-widest`, `uppercase`)
- **Card**: `glass-panel` with `glow-border` (emerald gradient border)
  - **Heading**: "Welcome back" / "Create account" (white, `font-bold`, `text-sm`)
  - **Subtext**: "Sign in to your command center" / "Join the Aegis network"
  - **Google button**: White/5 bg, border white/10, hover effects → "Continue with Google" with `GoogleLogo` icon
  - **Divider**: `— or —` in neutral-600
  - **Email input**: `EnvelopeSimple` icon, bg `white/5`, border `white/8`, focus border `emerald-500/50`, focus bg `emerald-500/5`
  - **Password input**: `LockKey` icon, same styling
  - **Submit button**: `btn-gradient` (emerald gradient), full width, "Sign in" / "Create account"
  - **Toggle**: "Don't have an account? Sign up" / "Already have an account? Sign in" (emerald-400 link)

### React Native Implementation

```typescript
// app/(auth)/login.tsx
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ActivityIndicator, StyleSheet, KeyboardAvoidingView,
  Platform, ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ShieldChevron, GoogleLogo, EnvelopeSimple, LockKey } from 'phosphor-react-native';
import { supabase } from '../../lib/supabase';
import { colors } from '../../lib/theme';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleEmailAuth = async () => {
    setLoading(true);
    setError(null);
    if (isSignUp) {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) setError(error.message);
      else setMessage('Check your email to confirm your account.');
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
    }
    setLoading(false);
  };

  return (
    <View style={styles.container}>
      {/* Ambient glow blobs */}
      <View style={styles.glowBlobTopLeft} />
      <View style={styles.glowBlobBottomRight} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.content}
      >
        {/* Logo */}
        <View style={styles.logoContainer}>
          <View style={styles.iconGlow} />
          <View style={[styles.iconBubble, styles.iconBubbleEmerald]}>
            <ShieldChevron size={32} color={colors.emerald[400]} weight="duotone" />
          </View>
          <Text style={styles.title}>Aegis</Text>
          <Text style={styles.subtitle}>DISASTER EVACUATION CONTROL</Text>
        </View>

        {/* Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            {isSignUp ? 'Create account' : 'Welcome back'}
          </Text>
          <Text style={styles.cardSubtext}>
            {isSignUp ? 'Join the Aegis network' : 'Sign in to your command center'}
          </Text>

          {/* Google OAuth Button */}
          <TouchableOpacity style={styles.googleButton}>
            <GoogleLogo size={16} color="#fff" weight="bold" />
            <Text style={styles.googleButtonText}>Continue with Google</Text>
          </TouchableOpacity>

          {/* Divider */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Email Input */}
          <View style={styles.inputContainer}>
            <EnvelopeSimple size={16} color={colors.neutral[500]} weight="duotone" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor={colors.neutral[600]}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </View>

          {/* Password Input */}
          <View style={styles.inputContainer}>
            <LockKey size={16} color={colors.neutral[500]} weight="duotone" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor={colors.neutral[600]}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>

          {error && <Text style={styles.errorText}>{error}</Text>}
          {message && <Text style={styles.successText}>{message}</Text>}

          {/* Submit */}
          <TouchableOpacity onPress={handleEmailAuth} disabled={loading}>
            <LinearGradient
              colors={['#059669', '#10b981', '#34d399', '#059669']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.submitButton}
            >
              {loading && <ActivityIndicator size="small" color="#fff" />}
              <Text style={styles.submitText}>
                {isSignUp ? 'Create account' : 'Sign in'}
              </Text>
            </LinearGradient>
          </TouchableOpacity>

          {/* Toggle */}
          <View style={styles.toggleRow}>
            <Text style={styles.toggleText}>
              {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
            </Text>
            <TouchableOpacity onPress={() => { setIsSignUp(!isSignUp); setError(null); }}>
              <Text style={styles.toggleLink}>
                {isSignUp ? 'Sign in' : 'Sign up'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
```

---

## 9. Screen 2 — Main Dashboard (Map + Sidebars)

The main screen is a **full-screen map** with overlay panels:

### Layout Architecture

```
┌───────────────────────────────────────────────────────┐
│                  [Tab Bar]                            │
│           [Evacuation] [Prevention]                   │
├──────────┬────────────────────────────┬───────────────┤
│          │                            │               │
│ LEFT     │       MAP                  │  RIGHT        │
│ SIDEBAR  │   (Full-screen)            │  FEED         │
│          │   MapView with overlays    │  (GDACS live) │
│          │                            │  (Prevention  │
│          │                            │   mode only)  │
│          │                            │               │
├──────────┴────────────────────────────┴───────────────┤
│ [Sign Out]                                            │
└───────────────────────────────────────────────────────┘
```

### Mobile Adaptation

On mobile, sidebars become **bottom sheets** (draggable panels):

- **Left sidebar** → Bottom sheet (draggable, collapsible)
- **Right feed** → Separate bottom sheet or separate tab
- **Tab bar** → Stays at top center as segmented control

### State Lifted to Root

All state is lifted to the main dashboard component, matching the web:

```typescript
// Core state (same as web page.tsx lines 21–66)
const [hazardCenter, setHazardCenter] = useState<[number, number] | null>(null);
const [hazardRadius, setHazardRadius] = useState<number>(1000);
const [startCoords, setStartCoords] = useState<[number, number] | null>(null);
const [endCoords, setEndCoords] = useState<[number, number] | null>(null);
const [routeGeoJSON, setRouteGeoJSON] = useState<any>(null);
const [bypassRouteGeoJSON, setBypassRouteGeoJSON] = useState<any>(null);
const [isPlacingHazard, setIsPlacingHazard] = useState<boolean>(false);
const [aiRecommendation, setAiRecommendation] = useState<string>('');
const [aiLoading, setAiLoading] = useState<boolean>(false);
const [evacuationPoints, setEvacuationPoints] = useState<any>(null);
const [mode, setMode] = useState<'routing' | 'prevention'>('routing');
const [activeDefenses, setActiveDefenses] = useState<string[]>([]);
const [cityName, setCityName] = useState<string>('');
const [densityPerKm2, setDensityPerKm2] = useState<number | null>(null);
const [gdacsEvents, setGdacsEvents] = useState<any[]>([]);
const [liveCyclones, setLiveCyclones] = useState<any[]>([]);
const [liveEarthquakes, setLiveEarthquakes] = useState<any[]>([]);
const [vulnerabilityZones, setVulnerabilityZones] = useState<any>(null);
const [eventOverlay, setEventOverlay] = useState<any>(null);
const [incidentType, setIncidentType] = useState<string>('Wildfire');
```

---

## 10. Component: Map Dashboard

### Web Implementation Reference

The web uses `maplibre-gl` with a MapTiler style. Key map layers include:

| Layer | Purpose | Mobile Equivalent |
|---|---|---|
| `hazard-dome` (Polygon) | Red-orange translucent circle around hazard center | `<Circle>` or `<Polygon>` from `react-native-maps` |
| `primary-route` (LineString) | Blue route polyline from TomTom routing API | `<Polyline>` |
| `bypass-route` (LineString) | Emerald green detour route | `<Polyline>` |
| `shelter-markers` (Points) | Evacuation shelter markers in 4 cardinal directions | `<Marker>` with custom callout |
| `vulnerability-zones` (Circles) | AI-identified vulnerable areas with severity colors | `<Circle>` components |
| `event-overlay` (Mixed) | Cyclone track/cone or earthquake zones from live feed | `<Polygon>` + `<Polyline>` |

### Mobile Map Component

```typescript
// components/MapDashboard.tsx
import React, { useRef, useEffect } from 'react';
import MapView, {
  Marker, Circle, Polyline, Polygon, Callout, PROVIDER_GOOGLE
} from 'react-native-maps';
import { StyleSheet, View, Text } from 'react-native';

interface MapDashboardProps {
  hazardCenter: [number, number] | null;       // [lng, lat]
  hazardRadius: number;                         // meters
  routeGeoJSON: any;                            // Primary TomTom route
  bypassRouteGeoJSON: any;                      // AI detour route
  isPlacingHazard: boolean;
  onMapPress: (lng: number, lat: number) => void;
  evacuationPoints: any;                        // GeoJSON FeatureCollection
  onSelectDestination: (coords: [number, number]) => void;
  activeDefenses: string[];
  vulnerabilityZones: any;
  eventOverlay: any;
}

export default function MapDashboard(props: MapDashboardProps) {
  const mapRef = useRef<MapView>(null);

  // Convert [lng, lat] to { latitude, longitude } for react-native-maps
  const toLatLng = (coord: [number, number]) => ({
    latitude: coord[1],
    longitude: coord[0],
  });

  return (
    <MapView
      ref={mapRef}
      provider={PROVIDER_GOOGLE}
      style={StyleSheet.absoluteFillObject}
      initialRegion={{
        latitude: 20,
        longitude: 0,
        latitudeDelta: 60,
        longitudeDelta: 60,
      }}
      mapType="standard"
      onPress={(e) => {
        if (props.isPlacingHazard) {
          const { latitude, longitude } = e.nativeEvent.coordinate;
          props.onMapPress(longitude, latitude);
        }
      }}
    >
      {/* Hazard Dome Circle */}
      {props.hazardCenter && (
        <Circle
          center={toLatLng(props.hazardCenter)}
          radius={props.hazardRadius}
          fillColor="rgba(239, 68, 68, 0.15)"
          strokeColor="rgba(239, 68, 68, 0.6)"
          strokeWidth={2}
        />
      )}

      {/* Primary Route Polyline */}
      {props.routeGeoJSON?.geometry?.coordinates && (
        <Polyline
          coordinates={props.routeGeoJSON.geometry.coordinates.map(
            (c: number[]) => ({ latitude: c[1], longitude: c[0] })
          )}
          strokeColor="#3b82f6"
          strokeWidth={4}
        />
      )}

      {/* Bypass/Detour Route Polyline */}
      {props.bypassRouteGeoJSON?.geometry?.coordinates && (
        <Polyline
          coordinates={props.bypassRouteGeoJSON.geometry.coordinates.map(
            (c: number[]) => ({ latitude: c[1], longitude: c[0] })
          )}
          strokeColor="#10b981"
          strokeWidth={4}
          lineDashPattern={[10, 5]}
        />
      )}

      {/* Evacuation Shelter Markers */}
      {props.evacuationPoints?.features?.map((feature: any) => (
        <Marker
          key={feature.properties.id}
          coordinate={{
            latitude: feature.geometry.coordinates[1],
            longitude: feature.geometry.coordinates[0],
          }}
          pinColor="#10b981"
          onPress={() => props.onSelectDestination(feature.geometry.coordinates)}
        >
          <Callout>
            <View style={{ padding: 8, maxWidth: 200 }}>
              <Text style={{ fontWeight: 'bold' }}>{feature.properties.name}</Text>
              <Text style={{ fontSize: 11, color: '#666' }}>
                {feature.properties.direction} — {feature.properties.reason}
              </Text>
            </View>
          </Callout>
        </Marker>
      ))}

      {/* Vulnerability Zones */}
      {props.vulnerabilityZones?.zones?.map((zone: any, idx: number) => {
        const coords = zone.geometry.coordinates;
        const severity = zone.properties.severity;
        const fillColor = severity === 'high'
          ? 'rgba(239,68,68,0.2)'
          : severity === 'medium'
          ? 'rgba(245,158,11,0.2)'
          : 'rgba(59,130,246,0.15)';

        return (
          <Circle
            key={`vuln-${idx}`}
            center={{ latitude: coords[1], longitude: coords[0] }}
            radius={(zone.properties.radius_km || 0.5) * 1000}
            fillColor={fillColor}
            strokeColor={fillColor.replace('0.2', '0.6')}
            strokeWidth={1}
          />
        );
      })}
    </MapView>
  );
}
```

### Key Map Interactions

1. **Tap to place hazard**: When `isPlacingHazard` is true, tapping the map sets the hazard center coordinates.
2. **Fly to coordinates**: Use `mapRef.current?.animateToRegion()` when `mapFlyToCoords` changes.
3. **Tap shelter marker → set as evacuation destination**: The `onSelectDestination` callback auto-fills the destination input.

---

## 11. Component: Routing Sidebar (Evacuation Mode)

The routing sidebar is the most complex component (~66KB in the web app). It contains:

### Sections (in order)

1. **Incident Type Grid** — 9 disaster types selectable as radio buttons:
   - Wildfire 🔥, Flooding 🌊, Toxic Plume ☠️, Earthquake 🌍, Tornado 🌪️, Radiation Leak ☢️, Chemical Spill 🧪, Blizzard ❄️, Volcanic Eruption 🌋

2. **Hazard Zone Controls**
   - "Place Hazard on Map" button (toggles `isPlacingHazard`)
   - Hazard radius slider (500m–10000m, step 100)
   - Display of hazard center coordinates (reverse geocoded to city name)

3. **Location Context Panel** (appears after hazard is placed)
   - City name (from MapTiler reverse geocoding)
   - Population density (from OpenAI via `/api/city-density`)

4. **Evacuation Route Controls**
   - Start Location input (address) with GPS auto-detect
   - Destination input (address) — auto-filled when clicking a shelter marker
   - "Calculate Route" button → calls TomTom Routing API directly
   - Route distance + ETA display

5. **AI Evacuation Advisor** (appears after route is calculated)
   - "Analyze Detour" button → POST to OpenAI for detour waypoints
   - Loading skeleton with shimmer animation
   - Markdown-formatted AI safety guidelines display
   - Detour route rendered on map

6. **Emergency Services Panel** (after hazard placement)
   - "Alert Emergency Services" button
   - Lists nearest: 1 Police Station, 1 Fire Station, 2 Healthcare places
   - Each entry shows: name, type icon, distance, address, status (Inside Dome / Safe Zone)

7. **Nearby Facilities Report** — All hospitals, clinics, fire stations, police stations
   - Grouped by type with emoji prefix
   - Distance in meters from epicenter
   - Status badge (red "Inside Dome" / green "Safe Zone")

### API Calls Made by This Component

| Action | API Call | Method |
|---|---|---|
| Geocode start/end address | `https://api.maptiler.com/geocoding/{query}.json?key={MAPTILER_KEY}` | GET |
| Calculate primary route | `https://api.tomtom.com/routing/1/calculateRoute/{start}:{end}/json?key={TOMTOM_KEY}&routeType=fastest&traffic=true&travelMode=car` | GET |
| AI detour analysis | OpenAI `gpt-4o` with evacuation prompt (web: `/api/evacuate`, mobile: direct OpenAI call) | POST |
| Evacuation shelters | `https://api.tomtom.com/search/2/categorySearch/{category}.json` (school, stadium, park, community center) | GET |
| Emergency services | `https://api.tomtom.com/search/2/poiSearch/{type}.json` (hospital, clinic, fire station, police station) | GET |
| Reverse geocode hazard | `https://api.maptiler.com/geocoding/{lng},{lat}.json?key={MAPTILER_KEY}` | GET |
| City density | OpenAI `gpt-4o` with demographic prompt | POST |

---

## 12. Component: Prevention Sidebar (Aegis Prevent)

### Sections

1. **Threat Classification Grid** — Same 9 disaster types as routing sidebar (shared `incidentType` state)

2. **Hazard Zone Controls** — Same as routing sidebar

3. **Active Countermeasures Toggles** — Checkboxes for:
   - Fire Breaks
   - Flood Barriers
   - Seismic Dampeners
   - Wind Shelters
   - Evacuation Routes
   - Emergency Generators
   - Water Pumps
   - Chemical Containment

4. **Vulnerability Analysis** (AI-generated)
   - "Run Vulnerability Scan" button → POST to OpenAI
   - 3 vulnerability metric bars (Infrastructure, Residential, Evacuation Readiness) — 0-100 scale with color gradient
   - 5-item emergency preparation checklist
   - Full AI-generated strategic mitigation directive in Markdown

5. **GDACS Global Alerts** — Live feed of global disaster events
   - Each event card shows: alert level badge (red/orange/green), event name, type icon, country, date
   - Tapping an event → flies map to that location

### API Calls Made

| Action | API Call |
|---|---|
| Weather risk intelligence | `https://archive-api.open-meteo.com/v1/archive` (10-year history) + `https://api.open-meteo.com/v1/forecast` (30-day recent) |
| AI mitigation analysis | OpenAI `gpt-4o` with prevention prompt |
| Vulnerability zones | OpenAI `gpt-4o` with OSM data from `https://overpass-api.de/api/interpreter` |
| GDACS events | `https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?alertlevel=green;orange;red&pagesize=30` |

---

## 13. Component: GDACS Right Feed

This component shows the aggregated multi-source live disaster feed (only in Prevention mode):

### Data Sources

1. **GDACS** — Tropical Cyclones + Earthquakes
2. **USGS** — Earthquakes (M4.5+, global)
3. **Tomorrow.io** — Active tropical cyclones (optional, requires API key)
4. **XWeather** — Active tropical cyclones (optional, requires API key)

### UI Structure

- **Two tabs**: "Cyclones" and "Earthquakes"
- **Cyclone card**: Alert level dot, name, source badge (GDACS/Tomorrow.io/XWeather), country, wind speed if available, "View Track" button
- **Earthquake card**: Alert level dot, magnitude badge, name, source badge (GDACS/USGS), depth, tsunami flag, felt count
- **Tapping "View Track"** or earthquake card → calls `/api/event-track` to render cyclone forecast cone or earthquake zone rings on the map

### Event Track API (implemented client-side for mobile)

For **cyclones**: Generates a synthetic 72-hour forecast track with NHC-style uncertainty cone
- 7 forecast points, 12h apart
- Basin-aware motion vectors (Atlantic NE, Pacific NW, etc.)
- Cone half-width widens 30km per step
- Wind radii circles (34kt and 64kt)

For **earthquakes**: Generates 3 concentric damage zones
- Severe (VIII+ MMI), Moderate (VI-VII MMI), Light (IV-V MMI)
- Radius scaled by magnitude using Wells & Coppersmith empirical formula
- Adjusted by focal depth

---

## 14. Component: Report Incident Modal

A bottom sheet modal with:

- **Incident type** dropdown: Roadblock/Debris, Flooding, Fire/Smoke, Structural Collapse, Chemical Spill, Blizzard, Volcanic Eruption, Other Hazard
- **Location**: Auto-filled with device GPS (use `expo-location`)
- **Details**: Multi-line text input for severity description
- **Submit**: Logs to console (future: save to Supabase database)

---

## 15. API Integrations — Complete Reference

### 15.1 TomTom APIs

**Base URL**: `https://api.tomtom.com`
**API Key**: `EXPO_PUBLIC_TOMTOM_API_KEY`

#### Route Calculation
```
GET /routing/1/calculateRoute/{startLat},{startLng}:{endLat},{endLng}/json
  ?key={KEY}
  &routeType=fastest
  &traffic=true
  &travelMode=car
```
Returns: GeoJSON LineString of route coordinates, summary with `lengthInMeters` and `travelTimeInSeconds`.

#### Category Search (Shelters)
```
GET /search/2/categorySearch/{category}.json
  ?key={KEY}
  &lat={lat}
  &lon={lng}
  &radius={meters}
  &limit=15
```
Categories: `school`, `stadium`, `park`, `community center`

#### POI Search (Emergency Services)
```
GET /search/2/poiSearch/{type}.json
  ?key={KEY}
  &lat={lat}
  &lon={lng}
  &radius=8000
  &limit=8
```
Types: `hospital`, `clinic`, `fire station`, `police station`

### 15.2 MapTiler APIs

**Base URL**: `https://api.maptiler.com`
**API Key**: `EXPO_PUBLIC_MAPTILER_API_KEY`

#### Forward Geocoding
```
GET /geocoding/{query}.json?key={KEY}&language=en
```
Returns: Array of features with coordinates and place types.

#### Reverse Geocoding
```
GET /geocoding/{lng},{lat}.json?key={KEY}
```
Returns: Features array — look for `place_type` containing `municipality`, `place`, or `city`.

### 15.3 OpenAI API

**Model**: `gpt-4o`
**API Key**: `EXPO_PUBLIC_OPENAI_API_KEY`

#### Direct Call (Mobile)

```typescript
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.EXPO_PUBLIC_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true, // Required for client-side usage
});

// Example: Evacuation advice
const response = await openai.chat.completions.create({
  model: 'gpt-4o',
  response_format: { type: 'json_object' },
  messages: [
    { role: 'system', content: 'You are Aegis Route AI...' },
    { role: 'user', content: evacuationPrompt },
  ],
  temperature: 0.2,
  max_tokens: 1500,
});
```

#### AI Endpoints (Port from web API routes)

| Web API Route | OpenAI Prompt Purpose | Response Schema |
|---|---|---|
| `POST /api/evacuate` | Analyze route vs hazard dome, calculate detour waypoints, safety guidelines | `{ detourWaypoints: [[lng,lat]], text: string }` |
| `POST /api/prevention` | Structural vulnerability audit using weather data + countermeasures | `{ vulnerabilityMetrics: {infrastructure, residential, evacuationReadiness}, checklist: string[], strategyMarkdown: string }` |
| `GET /api/city-density` | Population density lookup | `{ city: string, densityPerKm2: number }` |
| `POST /api/vulnerability-zones` | GIS risk analysis using OSM data | `[{ severity, center_lat, center_lng, radius_km, reason }]` |
| `POST /api/cyclone-cities` | Assess cities along cyclone forecast track | `{ cities: [{ name, impactLevel, risks, summary, coordinates }] }` |

### 15.4 GDACS API (Global Disaster Alert and Coordination System)

```
GET https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH
  ?alertlevel=green;orange;red
  &pagesize=30
```
Returns: GeoJSON `FeatureCollection` with events. Key properties:
- `eventtype`: `TC` (Tropical Cyclone), `EQ` (Earthquake), `FL` (Flood), `WF` (Wildfire), `VO` (Volcano)
- `alertlevel`: `green`, `orange`, `red`
- `eventname`, `country`, `fromdate`, `todate`
- `geometry.coordinates`: `[lng, lat]`

**Internal mapping**:
| GDACS Code | App Classification |
|---|---|
| `TC` | Tornado/Cyclone |
| `EQ` | Earthquake |
| `FL` | Flooding |
| `WF` | Wildfire |
| `VO` | Volcanic Eruption |

### 15.5 USGS Earthquake API

```
GET https://earthquake.usgs.gov/fdsnws/event/1/query
  ?format=geojson
  &minmagnitude=4.5
  &limit=25
  &orderby=time
```
Returns: GeoJSON with earthquake features. Key properties:
- `mag` (magnitude), `place`, `time`, `alert`, `tsunami`, `felt`
- `geometry.coordinates`: `[lng, lat, depth_km]`

### 15.6 Open-Meteo APIs (Weather Risk)

#### Historical Climate Archive (10 years)
```
GET https://archive-api.open-meteo.com/v1/archive
  ?latitude={lat}
  &longitude={lng}
  &start_date={10yr_ago}
  &end_date={7d_ago}
  &daily=precipitation_sum,temperature_2m_max,temperature_2m_min,wind_speed_10m_max,snowfall_sum
  &timezone=auto
  &wind_speed_unit=kmh
```

#### Recent Weather (30 days)
```
GET https://api.open-meteo.com/v1/forecast
  ?latitude={lat}
  &longitude={lng}
  &past_days=30
  &daily=precipitation_sum,temperature_2m_max,temperature_2m_min,wind_speed_10m_max,snowfall_sum
  &timezone=auto
  &wind_speed_unit=kmh
```

### 15.7 Overpass API (OpenStreetMap Data for Vulnerability Analysis)

```
POST https://overpass-api.de/api/interpreter
Content-Type: application/osm3s

[bbox:{south},{west},{north},{east}];
(
  way["building"]({south},{west},{north},{east});
  way["waterway"]({south},{west},{north},{east});
  way["landuse"~"^(grass|meadow|farmland|industrial|residential)$"]({south},{west},{north},{east});
  way["highway"]({south},{west},{north},{east});
);
out geom;
```

### 15.8 Tomorrow.io API (Optional — Cyclones)

```
GET https://api.tomorrow.io/v4/storms?apikey={KEY}&units=metric
```
Requires `TOMORROW_IO_API_KEY`. Returns active tropical cyclone data.

### 15.9 XWeather API (Optional — Cyclones)

```
GET https://data.api.xweather.com/tropicalcyclones/active
  ?client_id={ID}
  &client_secret={SECRET}
  &limit=20
```
Requires `XWEATHER_CLIENT_ID` and `XWEATHER_CLIENT_SECRET`.

---

## 16. State Management Architecture

The app uses **React state lifting** — all state lives in the root dashboard component and is passed as props to child components. This is the same architecture as the web app.

### State Dependency Graph

```mermaid
graph TD
  A[hazardCenter] --> B[Reverse Geocode → cityName]
  A --> C[TomTom Category Search → evacuationPoints]
  A --> D[TomTom POI Search → emergencyServices]
  B --> E[OpenAI → densityPerKm2]
  A --> F[Hazard Dome on Map]

  G[startCoords + endCoords] --> H[TomTom Route → routeGeoJSON]
  H --> I[OpenAI Evacuate → bypassRouteGeoJSON + aiRecommendation]

  J[incidentType + cityName + activeDefenses + densityPerKm2] --> K[OpenAI Prevention → vulnerabilityMetrics + checklist + strategyMarkdown]
  J --> L[OpenAI + OSM → vulnerabilityZones]

  M[GDACS API] --> N[gdacsEvents]
  O[Live Feed API] --> P[liveCyclones + liveEarthquakes]
  P --> Q[Event Track → eventOverlay on map]
```

### Data Flow for Key User Journeys

#### Journey 1: Place Hazard → Get Route → Get AI Advice

1. User taps "Place Hazard" → `isPlacingHazard = true`
2. User taps map → `hazardCenter = [lng, lat]`
3. Effect triggers: Reverse geocode → `cityName`; TomTom shelter search → `evacuationPoints`; TomTom emergency search → `emergencyFacilities`
4. User enters start + end address, or taps shelter marker
5. User taps "Calculate Route" → TomTom route → `routeGeoJSON`
6. User taps "Analyze Detour" → OpenAI → `bypassRouteGeoJSON` + `aiRecommendation`

#### Journey 2: Switch to Prevention → Run Analysis

1. User taps "Disaster Prevention" tab → `mode = 'prevention'`
2. Prevention sidebar loads; GDACS feed loads in right panel
3. User selects countermeasures → `activeDefenses`
4. User taps "Run Vulnerability Scan" → Weather risk API → OpenAI prevention → metrics + checklist + strategy
5. OpenAI vulnerability zones → map overlay

---

## 17. Offline & PWA Considerations

The web app has a basic PWA setup with a service worker (`/sw.js`). For mobile:

- Use `expo-updates` for OTA updates
- Cache API responses using `AsyncStorage` for offline viewing
- Use `NetInfo` from `@react-native-community/netinfo` to detect connectivity
- Show cached GDACS events when offline

---

## 18. Build, Test & Deploy

### Development

```bash
# Start Expo development server
npx expo start

# Run on Android emulator
npx expo run:android

# Run on physical device (Expo Go app)
# Scan the QR code from the terminal
```

### Build for Production

```bash
# Install EAS CLI
npm install -g eas-cli

# Configure
eas build:configure

# Build Android APK
eas build --platform android --profile preview

# Build Android AAB (for Play Store)
eas build --platform android --profile production
```

### Testing Checklist

- [ ] Login with email/password
- [ ] Login with Google OAuth
- [ ] Map loads and responds to touches
- [ ] Place hazard on map (tap)
- [ ] Evacuation shelters appear around hazard
- [ ] Emergency services list populates
- [ ] Route calculation works (start → end)
- [ ] AI detour analysis returns waypoints
- [ ] Bypass route renders on map
- [ ] GDACS feed loads events
- [ ] Tapping GDACS event flies map to location
- [ ] Prevention mode: vulnerability scan works
- [ ] Live feed: cyclones and earthquakes display
- [ ] Event track: cyclone cone renders on map
- [ ] Report incident modal opens and submits
- [ ] Sign out works

---

## 19. File Structure

```
aegis-mobile/
├── app/
│   ├── _layout.tsx                    # Root layout (auth guard)
│   ├── (auth)/
│   │   ├── _layout.tsx                # Auth stack layout
│   │   └── login.tsx                  # Login / Sign-up screen
│   └── (app)/
│       ├── _layout.tsx                # App layout
│       └── index.tsx                  # Main dashboard (map + panels)
│
├── components/
│   ├── MapDashboard.tsx               # Full-screen map with all overlays
│   ├── RoutingBottomSheet.tsx         # Evacuation controls (bottom sheet)
│   ├── PreventionBottomSheet.tsx      # Prevention controls (bottom sheet)
│   ├── GdacsLiveFeed.tsx             # Multi-source live feed panel
│   ├── EmergencyServicesList.tsx      # Nearby facilities list
│   ├── ReportIncidentModal.tsx        # Report modal
│   ├── DisasterTypeGrid.tsx           # 9-type selection grid (shared)
│   ├── VulnerabilityChart.tsx         # Bar chart for vuln metrics
│   └── ui/
│       ├── GlassPanel.tsx             # Glassmorphism card wrapper
│       ├── GradientButton.tsx         # Emerald gradient CTA button
│       ├── IconBubble.tsx             # 3D icon container
│       ├── AlertBadge.tsx             # Red/orange/green alert dot
│       └── ShimmerLoader.tsx          # Skeleton loading animation
│
├── lib/
│   ├── supabase.ts                    # Supabase client with AsyncStorage
│   ├── theme.ts                       # Color palette & design tokens
│   ├── styles.ts                      # Shared StyleSheet definitions
│   ├── api/
│   │   ├── evacuate.ts                # OpenAI evacuation advisor
│   │   ├── prevention.ts              # OpenAI prevention analyzer
│   │   ├── cityDensity.ts             # OpenAI population density
│   │   ├── emergencyServices.ts       # TomTom POI emergency search
│   │   ├── evacuationPoints.ts        # TomTom category shelter search
│   │   ├── gdacs.ts                   # GDACS event feed
│   │   ├── liveFeed.ts                # Multi-source live feed aggregator
│   │   ├── weatherRisk.ts             # Open-Meteo historical + recent
│   │   ├── vulnerabilityZones.ts      # Overpass + OpenAI GIS analysis
│   │   ├── eventTrack.ts              # Cyclone track / earthquake zones
│   │   ├── cycloneCities.ts           # Cities along cyclone path
│   │   └── routing.ts                 # TomTom route calculation
│   └── helpers/
│       ├── distance.ts                # Haversine distance calculator
│       ├── direction.ts               # Cardinal direction classifier
│       └── coordinates.ts             # Coordinate flip detection
│
├── assets/
│   ├── icon.png
│   ├── splash.png
│   └── adaptive-icon.png
│
├── .env                               # Environment variables
├── app.json                           # Expo configuration
├── package.json
├── tsconfig.json
└── babel.config.js
```

---

## Appendix A: Coordinate Convention

> ⚠️ **CRITICAL**: The Aegis web app uses **`[longitude, latitude]`** format throughout (GeoJSON standard). React Native Maps uses **`{ latitude, longitude }`** (Google Maps standard). Always convert:

```typescript
// Web → Mobile
const webCoord: [number, number] = [lng, lat];
const mobileCoord = { latitude: webCoord[1], longitude: webCoord[0] };

// Mobile → Web
const mobileCoord = { latitude: lat, longitude: lng };
const webCoord: [number, number] = [mobileCoord.longitude, mobileCoord.latitude];
```

## Appendix B: Haversine Distance Function

This utility is used by both the shelter engine and emergency services engine:

```typescript
// lib/helpers/distance.ts
export function getDistanceMeters(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371000; // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
```

## Appendix C: Coordinate Flip Detector

The OpenAI model sometimes returns `[latitude, longitude]` instead of `[longitude, latitude]`. This corrector is used in the evacuate API:

```typescript
// lib/helpers/coordinates.ts
export function fixFlippedCoordinates(
  waypoints: [number, number][],
  reference: [number, number]
): [number, number][] {
  const [refLng, refLat] = reference;
  return waypoints.map(([c0, c1]) => {
    const dNormal = Math.pow(c0 - refLng, 2) + Math.pow(c1 - refLat, 2);
    const dFlipped = Math.pow(c1 - refLng, 2) + Math.pow(c0 - refLat, 2);
    if (dFlipped < dNormal) {
      return [c1, c0]; // Swap back to [lng, lat]
    }
    return [c0, c1];
  });
}
```

## Appendix D: AI Prompt Templates

### Evacuation Prompt

```
You are an emergency navigation engine. An active hazard zone exists.
Details:
- Incident Type: {incidentType}
- Starting Location: {startAddr} [Coordinates: {startCoords}]
- Destination: {endAddr} [Coordinates: {endCoords}]
- Hazard Epicentre: [Coordinates: {hazardCenter}]
- Hazard Radius: {hazardRadius} meters

The direct driving route coordinates are: {sampledRoute (max 50 pts)}

Tasks:
1. Analyze the direct route and identify hazard intersections.
2. Calculate 1-3 detour waypoints as [longitude, latitude] outside hazard radius.
3. Waypoints must be realistic road intersections.
4. Generate emergency safety guidelines for {incidentType}.

Output: { "detourWaypoints": [[lng,lat]], "text": "markdown safety advice" }
```

### Prevention Prompt

```
You are Aegis Mitigation Engine, an AI disaster prevention auditor.
- Primary Disaster Threat: {incidentType}
- Target Region: {cityName}
- Active Countermeasures: {activeDefenses}
- Population Density: {densityPerKm2} ppl/km²
- Climate Data: {weatherRisk (10yr history + 30d recent)}

Tasks:
1. Identify top 1-3 most likely disasters for this location.
2. Estimate vulnerability scores (0-100) for infrastructure, residential, evacuation.
3. Create 5-item emergency preparation checklist.
4. Write strategic mitigation directive in Markdown.

Output: { "vulnerabilityMetrics": {...}, "checklist": [...], "strategyMarkdown": "..." }
```

### City Density Prompt

```
Identify the population density (people/km²) for: "{city}"
Output: { "city": string, "densityPerKm2": number }
```

---

## Appendix E: Alert Emergency Services Logic

When the user clicks "Alert Emergency Services", the app:

1. Queries TomTom POI Search for hospitals, clinics, fire stations, police stations within 8km
2. Calculates Haversine distance from each to the hazard center
3. Marks each as "Inside Dome" or "Safe Zone" based on whether distance < hazardRadius
4. Sorts by distance, then selects:
   - **1 nearest Police Station**
   - **1 nearest Fire Station**
   - **2 nearest Healthcare places** (hospitals + clinics)
5. Displays alert card for each with: name, type, distance, address, status badge

---

> **This document covers 100% of the Aegis web application's features, integrations, and design specifications. Build each section incrementally, test on Expo Go, and cross-reference this guide for every API endpoint, prompt template, and UI element.**
