import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://fnrjndpkaszgpnbykodm.supabase.co';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZucmpuZHBrYXN6Z3BuYnlrb2RtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4MTU2MjUsImV4cCI6MjA5NjM5MTYyNX0.ouUaUNUPtevm0qtZGNYG6XnK4NP-OO46y1IZJYda-Ts';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
