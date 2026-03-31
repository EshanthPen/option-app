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
import { ThemeProvider } from './src/context/ThemeContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './src/supabaseClient';
import WelcomeScreen from './src/screens/WelcomeScreen';

export default function App() {
  const [session, setSession] = React.useState(null);
  const [guestMode, setGuestMode] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [isAuthenticating, setIsAuthenticating] = React.useState(false);
  const [showVerifiedModal, setShowVerifiedModal] = React.useState(false);

  React.useEffect(() => {
    // Initial session check + guest mode check
    Promise.all([
      supabase.auth.getSession(),
      AsyncStorage.getItem('@OptionApp_GuestMode'),
    ]).then(([{ data: { session } }, guestFlag]) => {
      setSession(session);
      if (!session && guestFlag === 'true') {
        setGuestMode(true);
      }
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      if (session) setIsAuthenticating(false); 
      
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

  React.useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const handleBeforeUnload = () => {
        // Clear sensitive data on tab close for privacy
        // We use synchronous localStorage for reliability during unload if possible,
        // but AsyncStorage is the standard here.
        const keysToClear = ['svUsername', 'svPassword', 'svDistrictUrl', 'studentVueGrades'];
        keysToClear.forEach(key => {
          localStorage.removeItem(key);
        });
      };
      window.addEventListener('beforeunload', handleBeforeUnload);
      return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }
  }, []);

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
        Calendar: 'calendar',
        Gradebook: 'gradebook',
        Focus: 'focus',
        Leaderboard: 'leaderboard',
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
      <NavigationContainer linking={linking}>
        {(session || guestMode) ? (
          <TabNavigator isGuest={guestMode && !session} onSignOut={handleSignOut} />
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
        backgroundColor: '#fff',
        borderRadius: 24,
        padding: 32,
        alignItems: 'center',
        borderWidth: 3,
        borderColor: '#0d0c0a',
        width: '100%',
        maxWidth: 400,
        // Neo-Brutalism Shadow
        shadowColor: '#000',
        shadowOffset: { width: 8, height: 8 },
        shadowOpacity: 1,
        shadowRadius: 0,
        elevation: 10,
    },
    successTitle: {
        fontSize: 28,
        fontWeight: '900',
        color: '#0d0c0a',
        marginBottom: 12,
        textAlign: 'center',
    },
    successText: {
        fontSize: 16,
        color: '#444',
        textAlign: 'center',
        lineHeight: 24,
        marginBottom: 28,
    },
    successBtn: {
        backgroundColor: '#0d0c0a',
        paddingVertical: 16,
        paddingHorizontal: 32,
        borderRadius: 12,
        width: '100%',
        alignItems: 'center',
    },
    successBtnText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '700',
    },
});
