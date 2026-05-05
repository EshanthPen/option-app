import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getTheme, THEME_PRESETS } from '../utils/theme';

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
    const systemColorScheme = useColorScheme();
    const [isDarkMode, setIsDarkMode] = useState(systemColorScheme === 'dark');
    const [themePreset, setThemePreset] = useState('classic');

    useEffect(() => {
        const loadTheme = async () => {
            const savedTheme = await AsyncStorage.getItem('userTheme');
            if (savedTheme) {
                setIsDarkMode(savedTheme === 'dark');
            }
            const savedPreset = await AsyncStorage.getItem('userThemePreset');
            if (savedPreset && THEME_PRESETS[savedPreset]) {
                setThemePreset(savedPreset);
            }
        };
        loadTheme();
    }, []);

    const toggleTheme = async () => {
        const newMode = !isDarkMode;
        setIsDarkMode(newMode);
        await AsyncStorage.setItem('userTheme', newMode ? 'dark' : 'light');
    };

    const changePreset = async (presetKey) => {
        if (THEME_PRESETS[presetKey]) {
            setThemePreset(presetKey);
            await AsyncStorage.setItem('userThemePreset', presetKey);
        }
    };

    const baseTheme = getTheme(true, themePreset); // Force dark mode structure
    const customColors = require('../theme').colors;
    const customFonts = require('../theme').fonts;
    const customSizes = require('../theme').sizes;
    
    const theme = {
        ...baseTheme,
        colors: customColors,
        fonts: {
            ...baseTheme.fonts,
            ...customFonts,
            m: customFonts.sans,
            s: customFonts.sansSemiBold,
            b: customFonts.displayBold,
            mono: customFonts.mono,
        },
        radii: {
            ...baseTheme.radii,
            lg: customSizes.radius,
            r: customSizes.radius,
        },
        shadows: {
            none: baseTheme.shadows.none,
            sm: baseTheme.shadows.none,
            md: baseTheme.shadows.none,
            lg: baseTheme.shadows.none,
        }
    };

    return (
        <ThemeContext.Provider value={{ isDarkMode: true, toggleTheme, theme, themePreset, changePreset }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => useContext(ThemeContext);
