# Aegis Mobile Application

A native React Native & Expo mobile application for **Aegis Disaster Evacuation Control**.

## Features

- **Live Hazard Map & Tracking**: View real-time disaster alerts, hazard radii, and high-vulnerability zone overlays.
- **Smart Evacuation Routing**: Get turn-by-turn routing to nearest designated safe shelters avoiding danger zones.
- **Emergency SOS & Signals**: One-tap emergency request broadcast with offline coordinates.
- **AI-Powered Risk Analysis**: Integrated local climate risk assessment and safety recommendations.
- **Role-Based Views**: Dedicated interfaces for Evacuees, First Responders, and Admin Dispatchers.

---

## Tech Stack

- **Framework**: [Expo](https://expo.dev) (v54) & React Native (v0.81)
- **Routing**: Expo Router (File-based navigation)
- **UI Components**: React Native Paper, Lucide / Phosphor Icons, Expo Linear Gradient
- **Maps**: React Native Maps & Map directions
- **Backend / Database**: Supabase & OpenAI API

---

## Getting Started

### Prerequisites

- Node.js (v18+)
- npm or yarn
- [Expo Go](https://expo.dev/go) app on your mobile device (or iOS Simulator / Android Emulator)

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Create or update `.env` in the project root:

```env
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
EXPO_PUBLIC_OPENAI_API_KEY=your_openai_api_key
```

### 3. Start Development Server

```bash
# Start Expo dev server
npm start

# Run directly on Android
npm run android

# Run directly on iOS
npm run ios

# Run in web browser
npm run web
```

---

## Project Structure

```
.
├── app/                  # Expo Router file-based screens and navigation
│   ├── (auth)/           # Authentication flows (login, register)
│   ├── (app)/            # Main app tabs & screens (map, emergency, shelters, profile)
│   ├── _layout.tsx       # Root layout provider
│   └── index.tsx         # Entry screen
├── assets/               # Images, fonts, and static assets
├── components/           # Reusable UI components
├── lib/                  # Services, helpers, Supabase client, theme tokens
├── app.json              # Expo application configuration
├── package.json          # Dependencies and scripts
└── tsconfig.json         # TypeScript configuration
```

---

## Documentation

For full details on the mobile app architecture, feature specs, and implementation details, see [MOBILE_APP_GUIDE.md](./MOBILE_APP_GUIDE.md).
