import React from 'react';
import { View, ActivityIndicator, Platform, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import TabNavigator from './src/navigation/TabNavigator';
import { useFonts } from 'expo-font';
import {
  PlayfairDisplay_400Regular,
  PlayfairDisplay_600SemiBold,
  PlayfairDisplay_700Bold,
  PlayfairDisplay_900Black,
  PlayfairDisplay_400Regular_Italic,
  PlayfairDisplay_900Black_Italic,
} from '@expo-google-fonts/playfair-display';
import {
  DMMono_300Light,
  DMMono_400Regular,
  DMMono_500Medium,
} from '@expo-google-fonts/dm-mono';
import {
  InstrumentSans_400Regular,
  InstrumentSans_500Medium,
  InstrumentSans_600SemiBold,
  InstrumentSans_700Bold,
} from '@expo-google-fonts/instrument-sans';
import { Chewy_400Regular } from '@expo-google-fonts/chewy';
import {
  CormorantGaramond_400Regular,
  CormorantGaramond_500Medium,
  CormorantGaramond_600SemiBold,
  CormorantGaramond_700Bold,
} from '@expo-google-fonts/cormorant-garamond';
import {
  Geist_400Regular,
  Geist_500Medium,
  Geist_600SemiBold,
  Geist_700Bold,
} from '@expo-google-fonts/geist';
import { ThemeProvider } from './src/context/ThemeContext';
import { PremiumProvider } from './src/context/PremiumContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './src/supabaseClient';
import WelcomeScreen from './src/screens/WelcomeScreen';
import SetupSchoologyScreen from './src/screens/SetupSchoologyScreen';
import SetupSISScreen from './src/screens/SetupSISScreen';

export default function App() {
  const [session, setSession] = React.useState(null);
  const [guestMode, setGuestMode] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [isAuthenticating, setIsAuthenticating] = React.useState(false);
  const [showVerifiedModal, setShowVerifiedModal] = React.useState(false);

  // Post-login integration setup flow
  // 'schoology' → show Schoology setup
  // 'sis'       → show SIS setup
  // 'done'      → go to main app
  const [setupStep, setSetupStep] = React.useState('done'); // default: skip if flags already set

  // Check whether the user still needs to go through the setup flow.
  // Called whenever a session becomes active (initial load or new login).
  const checkSetupStep = React.useCallback(async (activeSession) => {
    if (!activeSession) return;
    // Check both the completion flags AND whether real credentials exist.
    // This ensures users who skipped/had stale flags still see setup if not configured.
    const [sisDone, schoologyDone, svUsername, svDistrictUrl, schoologyUrl] = await Promise.all([
      AsyncStorage.getItem('setup_sis_done'),
      AsyncStorage.getItem('setup_schoology_done'),
      AsyncStorage.getItem('svUsername'),
      AsyncStorage.getItem('svDistrictUrl'),
      AsyncStorage.getItem('schoologyUrl'),
    ]);

    const sisConfigured = !!(svUsername && svDistrictUrl);
    const schoologyConfigured = !!schoologyUrl;

    // Show setup if the flag is missing OR the real credential is not set
    if (!sisDone && !sisConfigured) {
      setSetupStep('sis');
    } else if (!schoologyDone && !schoologyConfigured) {
      setSetupStep('schoology');
    } else {
      setSetupStep('done');
    }
  }, []);

  React.useEffect(() => {
    // Initial session check + guest mode check
    Promise.all([
      supabase.auth.getSession(),
      AsyncStorage.getItem('@OptionApp_GuestMode'),
    ]).then(([{ data: { session } }, guestFlag]) => {
      setSession(session);
      if (!session && guestFlag === 'true') {
        setGuestMode(true);
      } else if (session) {
        checkSetupStep(session);
      }
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      if (session) {
        setIsAuthenticating(false);
        // Only trigger setup flow on fresh sign-in events, not on token refreshes
        if (_event === 'SIGNED_IN') {
          await checkSetupStep(session);
        }
      }
      
      if (session?.user?.user_metadata) {
          const { full_name, schoology_url } = session.user.user_metadata;
          
          if (full_name) {
              await AsyncStorage.setItem('userName', full_name);
          }
          if (schoology_url) {
              await AsyncStorage.setItem('schoologyUrl', schoology_url);
          }
      }

      // Detect if this is a fresh verification
      if (_event === 'USER_UPDATED' && session?.user?.email_confirmed_at) {
          setShowVerifiedModal(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Safeguard: Reset authentication state after 10s if it gets stuck
  React.useEffect(() => {
    let timeout;
    if (isAuthenticating && !session) {
      timeout = setTimeout(() => {
        console.log("Authentication timed out or failed to trigger session update.");
        setIsAuthenticating(false);
      }, 10000); // 10s timeout
    }
    return () => clearTimeout(timeout);
  }, [isAuthenticating, session]);

  // beforeunload handler removed — session and grade data should persist across tab closes

  const [fontsLoaded] = useFonts({
    'Playfair Display': PlayfairDisplay_400Regular,
    'PlayfairDisplay': PlayfairDisplay_400Regular,
    'PlayfairDisplay-SemiBold': PlayfairDisplay_600SemiBold,
    'PlayfairDisplay-Bold': PlayfairDisplay_700Bold,
    'PlayfairDisplay-Black': PlayfairDisplay_900Black,
    'PlayfairDisplay-Italic': PlayfairDisplay_400Regular_Italic,
    'PlayfairDisplay-BlackItalic': PlayfairDisplay_900Black_Italic,
    'DM Mono': DMMono_400Regular,
    'DMMono': DMMono_400Regular,
    'DMMono-Light': DMMono_300Light,
    'DMMono-Medium': DMMono_500Medium,
    'Instrument Sans': InstrumentSans_400Regular,
    'InstrumentSans': InstrumentSans_400Regular,
    'InstrumentSans-Medium': InstrumentSans_500Medium,
    'InstrumentSans-SemiBold': InstrumentSans_600SemiBold,
    'InstrumentSans-Bold': InstrumentSans_700Bold,
    'Chewy': Chewy_400Regular,
    'SourGummy': require('./assets/fonts/SourGummy.ttf'),
    'CormorantGaramond-Regular': CormorantGaramond_400Regular,
    'CormorantGaramond-Medium': CormorantGaramond_500Medium,
    'CormorantGaramond-SemiBold': CormorantGaramond_600SemiBold,
    'CormorantGaramond-Bold': CormorantGaramond_700Bold,
    // Geist — matches the Claude Design exactly
    'Geist': Geist_400Regular,
    'Geist-Medium': Geist_500Medium,
    'Geist-SemiBold': Geist_600SemiBold,
    'Geist-Bold': Geist_700Bold,
  });

  if (!fontsLoaded || loading || (isAuthenticating && !session)) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#121212' }}>
        <ActivityIndicator size="large" color="#F5F3E9" />
      </View>
    );
  }

  const linking = {
    config: {
      screens: {
        Home: '',
        AI: 'ai',
        Calendar: 'calendar',
        Gradebook: 'gradebook',
        Focus: 'focus',
        Leaderboard: 'leaderboard',
        Integrations: 'integrations',
        Premium: 'premium',
        Settings: 'settings',
      },
    },
  };

  const handleGuestMode = async () => {
    await AsyncStorage.setItem('@OptionApp_GuestMode', 'true');
    setGuestMode(true);
  };

  const handleSignOut = async () => {
    await AsyncStorage.removeItem('@OptionApp_GuestMode');
    setGuestMode(false);
    await supabase.auth.signOut();
  };

  return (
    <ThemeProvider>
      <PremiumProvider>
      <NavigationContainer linking={linking}>
        {(session || guestMode) ? (
          // Logged-in flow: route through setup screens if not completed yet
          setupStep === 'sis' ? (
            <SetupSISScreen
              onComplete={() => setSetupStep('schoology')}
            />
          ) : setupStep === 'schoology' ? (
            <SetupSchoologyScreen
              onComplete={() => setSetupStep('done')}
            />
          ) : (
            <TabNavigator isGuest={guestMode && !session} onSignOut={handleSignOut} />
          )
        ) : (
          <WelcomeScreen
            onAuthStart={() => setIsAuthenticating(true)}
            onAuthReset={() => setIsAuthenticating(false)}
            onGuestMode={handleGuestMode}
          />
        )}
      </NavigationContainer>

      {/* Email Verified Global Success Modal */}
      <Modal
          visible={showVerifiedModal}
          transparent
          animationType="slide"
      >
          <View style={styles.modalOverlay}>
              <View style={styles.successPopup}>
                  <Text style={styles.successTitle}>Email Verified! 🎉</Text>
                  <Text style={styles.successText}>
                      Your account is now fully active. Your profile information has been automatically synced.
                  </Text>
                  <TouchableOpacity 
                      style={styles.successBtn}
                      onPress={() => setShowVerifiedModal(false)}
                  >
                      <Text style={styles.successBtnText}>Amazing</Text>
                  </TouchableOpacity>
              </View>
          </View>
      </Modal>
    </PremiumProvider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.8)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    successPopup: {
        backgroundColor: '#1a1a1a',
        borderRadius: 20,
        padding: 28,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#2a2a2a',
        width: '100%',
        maxWidth: 400,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 16,
        elevation: 10,
    },
    successTitle: {
        fontSize: 24,
        fontWeight: '700',
        color: '#F5F3E9',
        marginBottom: 10,
        textAlign: 'center',
    },
    successText: {
        fontSize: 14,
        color: '#999',
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 24,
    },
    successBtn: {
        backgroundColor: '#F5F3E9',
        paddingVertical: 14,
        borderRadius: 12,
        width: '100%',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 4,
        elevation: 3,
    },
    successBtnText: {
        color: '#121212',
        fontSize: 16,
        fontWeight: '700',
    },
});
