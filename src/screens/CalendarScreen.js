import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';
export default function CalendarScreen() {
    const { theme } = useTheme();
    const styles = getStyles(theme);
    return (
        <View style={styles.container}>
            <Text style={styles.title}>Auto-Scheduler</Text>
            <Text style={styles.subtitle}>Your scheduled time blocks will appear here.</Text>
        </View>
    );
}

const getStyles = (theme) => StyleSheet.create({
    container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.bg },
    title: { fontFamily: theme.fonts.d, fontSize: 36, fontWeight: '700', marginBottom: 10, color: theme.colors.ink, letterSpacing: -1 },
    subtitle: { fontFamily: theme.fonts.m, fontSize: 12, color: theme.colors.ink3, letterSpacing: 1.5, textTransform: 'uppercase' }
});
