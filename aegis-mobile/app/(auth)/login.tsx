import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Dimensions,
} from 'react-native';
import { ShieldChevron, GoogleLogo, EnvelopeSimple, LockKey } from 'phosphor-react-native';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { supabase } from '../../lib/supabase';
import { colors } from '../../lib/theme';
import GlassPanel from '../../components/ui/GlassPanel';
import GradientButton from '../../components/ui/GradientButton';

WebBrowser.maybeCompleteAuthSession();
const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleEmailAuth = async () => {
    if (!email || !password) {
      setError('Please provide both credentials.');
      return;
    }
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      if (isSignUp) {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: 'aegis://auth/callback' },
        });
        if (signUpError) throw signUpError;
        setMessage('Check your inbox to confirm your account.');
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;
      }
    } catch (err: any) {
      setError(err.message || 'Authentication error.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setError(null);
    try {
      const redirectTo = makeRedirectUri({ scheme: 'aegis' });
      const { data, error: authError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          skipBrowserRedirect: true,
        },
      });

      if (authError) throw authError;

      if (data?.url) {
        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

        if (result.type === 'success' && result.url) {
          const urlParams = new URL(result.url);
          // Split hash or search
          const hash = urlParams.hash || urlParams.search;
          const params = new URLSearchParams(hash.replace('#', '?'));
          const access_token = params.get('access_token');
          const refresh_token = params.get('refresh_token');

          if (access_token && refresh_token) {
            const { error: sessionError } = await supabase.auth.setSession({
              access_token,
              refresh_token,
            });
            if (sessionError) throw sessionError;
          }
        }
      }
    } catch (err: any) {
      setError(err.message || 'Google authentication failed.');
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Dynamic ambient mesh glows */}
      <View style={[styles.glowBlob, styles.glowBlobTopLeft]} />
      <View style={[styles.glowBlob, styles.glowBlobBottomRight]} />
      <View style={[styles.glowBlob, styles.glowBlobMiddle]} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          
          {/* Logo Frame */}
          <View style={styles.logoFrame}>
            <View style={styles.outerLogoGlow} />
            <View style={styles.logoBubble}>
              <ShieldChevron size={36} color={colors.emerald[400]} weight="duotone" />
            </View>
            <Text style={styles.title}>Aegis</Text>
            <Text style={styles.subtitle}>Disaster Evacuation Control</Text>
          </View>

          {/* Frosted command card */}
          <GlassPanel style={styles.authCard}>
            <Text style={styles.cardHeader}>
              {isSignUp ? 'Establish Security Access' : 'Secure Command Sign In'}
            </Text>
            <Text style={styles.cardSubtext}>
              {isSignUp ? 'Connect to the Aegis disaster prevention grid.' : 'Sign in to access evacuation routing modules.'}
            </Text>

            {/* Google OAuth */}
            <TouchableOpacity 
              onPress={handleGoogleSignIn} 
              style={styles.googleBtn}
              activeOpacity={0.8}
              disabled={googleLoading}
            >
              {googleLoading ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <>
                  <GoogleLogo size={18} color="#ffffff" weight="bold" />
                  <Text style={styles.googleBtnText}>Authorize via Google</Text>
                </>
              )}
            </TouchableOpacity>

            {/* Visual Divider */}
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or continue with email</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Email Form Field */}
            <View style={styles.fieldContainer}>
              <EnvelopeSimple size={16} color={colors.neutral[400]} />
              <TextInput
                style={styles.textInput}
                placeholder="Secure Email Address"
                placeholderTextColor={colors.neutral[500]}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {/* Password Form Field */}
            <View style={styles.fieldContainer}>
              <LockKey size={16} color={colors.neutral[400]} />
              <TextInput
                style={styles.textInput}
                placeholder="Access Password"
                placeholderTextColor={colors.neutral[500]}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {error && <Text style={styles.errorText}>⚠️ {error}</Text>}
            {message && <Text style={styles.successText}>✉️ {message}</Text>}

            {/* Submit */}
            <GradientButton
              title={loading ? 'Authenticating...' : isSignUp ? 'Create Command Profile' : 'Authorize Credentials'}
              onPress={handleEmailAuth}
              fullWidth
              style={styles.submitBtn}
            />

            {/* Toggle Row */}
            <View style={styles.toggleRow}>
              <Text style={styles.toggleText}>
                {isSignUp ? 'Already have credentials?' : 'Need command network credentials?'}
              </Text>
              <TouchableOpacity onPress={() => { setIsSignUp(!isSignUp); setError(null); setMessage(null); }}>
                <Text style={styles.toggleLink}>
                  {isSignUp ? 'Sign In' : 'Register Profile'}
                </Text>
              </TouchableOpacity>
            </View>

          </GlassPanel>

        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  glowBlob: {
    position: 'absolute',
    borderRadius: 999,
    width: 280,
    height: 280,
  },
  glowBlobTopLeft: {
    top: -50,
    left: -50,
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
  },
  glowBlobBottomRight: {
    bottom: -80,
    right: -80,
    backgroundColor: 'rgba(59, 130, 246, 0.08)',
  },
  glowBlobMiddle: {
    top: SCREEN_WIDTH,
    right: -100,
    backgroundColor: 'rgba(16, 185, 129, 0.04)',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
  },
  logoFrame: {
    alignItems: 'center',
    marginBottom: 32,
  },
  outerLogoGlow: {
    position: 'absolute',
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    top: -5,
  },
  logoBubble: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderColor: 'rgba(16, 185, 129, 0.25)',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.neutral[500],
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginTop: 4,
  },
  authCard: {
    padding: 24,
  },
  cardHeader: {
    fontSize: 15,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.5,
  },
  cardSubtext: {
    fontSize: 11,
    color: colors.neutral[400],
    fontWeight: '600',
    marginTop: 4,
    marginBottom: 20,
    lineHeight: 15,
  },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  googleBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  dividerText: {
    color: colors.neutral[500],
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  fieldContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    paddingHorizontal: 16,
    height: 48,
    marginBottom: 12,
    gap: 12,
  },
  textInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  submitBtn: {
    marginTop: 8,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 20,
  },
  toggleText: {
    color: colors.neutral[500],
    fontSize: 11,
    fontWeight: '600',
  },
  toggleLink: {
    color: colors.emerald[400],
    fontSize: 11,
    fontWeight: '800',
  },
  errorText: {
    color: colors.red[400],
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
  },
  successText: {
    color: colors.emerald[400],
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
  }
});
