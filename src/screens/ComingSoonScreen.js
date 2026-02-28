import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useTheme } from '../context/ThemeContext';

export default function ComingSoonScreen() {
    const { theme, isDarkMode } = useTheme();
    const styles = getStyles(theme);
    const features = [
        { title: "AI Image Parsing", desc: "Take a photo of a whiteboard to auto-generate tasks.", color: theme.colors.purple },
        { title: "Schoology Sync", desc: "Background fetching of assignments from your LMS URL.", color: theme.colors.orange },
        { title: "Native Screen Blocking", desc: "A strict mode that actually locks apps on your iOS device via Apple's Screen Time API.", color: theme.colors.red },
        { title: "Scheduling Algorithm", desc: "Auto-insert Option tasks into the empty slots on your Google Calendar.", color: theme.colors.blue }
    ];

    return (
        <ScrollView style={styles.container}>
            <View style={styles.headerContainer}>
                <Text style={styles.header}>Coming Soon 🚀</Text>
                <Text style={styles.subtitle}>These advanced features require a backend database or deep iOS native hooks currently in development.</Text>
            </View>

            {features.map((f, i) => (
                <View key={i} style={[styles.card, { borderLeftColor: f.color }]}>
                    <Text style={styles.cardTitle}>{f.title}</Text>
                    <Text style={styles.cardDesc}>{f.desc}</Text>
                </View>
            ))}
            <View style={{ height: 100 }} />
        </ScrollView>
    );
}

const getStyles = (theme) => StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.bg, paddingHorizontal: 20, paddingTop: 40 },
    headerContainer: { marginBottom: 24 },
    header: { fontFamily: theme.fonts.d, fontSize: 32, fontWeight: '700', color: theme.colors.ink, letterSpacing: -0.5 },
    subtitle: { fontFamily: theme.fonts.m, fontSize: 10, color: theme.colors.ink3, textTransform: 'uppercase', letterSpacing: 1, marginTop: 4, lineHeight: 18 },
    card: { backgroundColor: theme.colors.surface, padding: 20, borderRadius: theme.radii.lg, marginBottom: 15, borderWidth: 1, borderColor: theme.colors.border, borderLeftWidth: 4, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 4, elevation: 1 },
    cardTitle: { fontFamily: theme.fonts.s, fontSize: 18, fontWeight: '700', color: theme.colors.ink, marginBottom: 5 },
    cardDesc: { fontFamily: theme.fonts.s, fontSize: 14, color: theme.colors.ink2, lineHeight: 20 }
});
