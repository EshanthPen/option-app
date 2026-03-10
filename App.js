import React from 'react';
import { View, ActivityIndicator, Platform } from 'react-native';
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

export default function App() {
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

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f4f1' }}>
        <ActivityIndicator size="large" color="#0d0c0a" />
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
        Settings: 'settings',
      },
    },
  };

  return (
    <ThemeProvider>
      <NavigationContainer linking={linking}>
        <TabNavigator />
      </NavigationContainer>
    </ThemeProvider>
  );
}
