import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import TabNavigator from './src/navigation/TabNavigator';
import * as Font from 'expo-font';
import { PlayfairDisplay_400Regular, PlayfairDisplay_600SemiBold, PlayfairDisplay_700Bold, PlayfairDisplay_900Black, PlayfairDisplay_400Regular_Italic } from '@expo-google-fonts/playfair-display';
import { DMMono_300Light, DMMono_400Regular, DMMono_500Medium } from '@expo-google-fonts/dm-mono';
import { InstrumentSans_400Regular, InstrumentSans_500Medium, InstrumentSans_600SemiBold } from '@expo-google-fonts/instrument-sans';

export default function App() {
  const [fontsLoaded, setFontsLoaded] = useState(false);

  useEffect(() => {
    async function loadFonts() {
      await Font.loadAsync({
        'Playfair Display': PlayfairDisplay_400Regular,
        'Playfair Display_600SemiBold': PlayfairDisplay_600SemiBold,
        'Playfair Display_700Bold': PlayfairDisplay_700Bold,
        'Playfair Display_900Black': PlayfairDisplay_900Black,
        'Playfair Display_Italic': PlayfairDisplay_400Regular_Italic,
        'DM Mono': DMMono_400Regular,
        'DM Mono_300Light': DMMono_300Light,
        'DM Mono_500Medium': DMMono_500Medium,
        'Instrument Sans': InstrumentSans_400Regular,
        'Instrument Sans_500Medium': InstrumentSans_500Medium,
        'Instrument Sans_600SemiBold': InstrumentSans_600SemiBold,
      });
      setFontsLoaded(true);
    }
    loadFonts();
  }, []);

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f4f1' }}>
        <ActivityIndicator size="large" color="#0d0c0a" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <TabNavigator />
    </NavigationContainer>
  );
}
