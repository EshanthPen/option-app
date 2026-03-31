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

    const theme = getTheme(isDarkMode, themePreset);

    return (
        <ThemeContext.Provider value={{ isDarkMode, toggleTheme, theme, themePreset, changePreset }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => useContext(ThemeContext);
