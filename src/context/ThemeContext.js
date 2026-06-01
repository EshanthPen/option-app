import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getTheme } from '../utils/theme';

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
    const systemColorScheme = useColorScheme();
    const [isDarkMode, setIsDarkMode] = useState(systemColorScheme === 'dark');

    useEffect(() => {
        const loadTheme = async () => {
            const savedTheme = await AsyncStorage.getItem('userTheme');
            if (savedTheme) {
                setIsDarkMode(savedTheme === 'dark');
            }
        };
        loadTheme();
    }, []);

    useEffect(() => {
        if (Platform.OS === 'web' && typeof document !== 'undefined') {
            const root = document.documentElement;
            if (isDarkMode) {
                root.classList.add('dark');
            } else {
                root.classList.remove('dark');
            }
        }
    }, [isDarkMode]);

    const toggleTheme = async () => {
        const newMode = !isDarkMode;
        setIsDarkMode(newMode);
        await AsyncStorage.setItem('userTheme', newMode ? 'dark' : 'light');
    };

    const theme = getTheme(isDarkMode);

    return (
        <ThemeContext.Provider value={{ isDarkMode, toggleTheme, theme }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => useContext(ThemeContext);