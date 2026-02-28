import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { colors, fonts, sizes } from '../theme';

export default function ComingSoonScreen() {
    const features = [
        { title: "AI Image Parsing", desc: "Take a photo of a whiteboard to auto-generate tasks." },
        { title: "Schoology Sync", desc: "Background fetching of assignments from your LMS URL." },
        { title: "Native Screen Blocking", desc: "A strict mode that actually locks apps on your iOS device via Apple's Screen Time API." },
        { title: "Scheduling Algorithm", desc: "Auto-insert Option tasks into the empty slots on your Google Calendar." }
    ];

    return (
        <ScrollView style={styles.container}>
            <Text style={styles.header}>Coming Soon 🚀</Text>
            <Text style={styles.subtitle}>These advanced features require a backend database or deep iOS native hooks which are currently in development.</Text>

            {features.map((f, i) => (
                <View key={i} style={styles.card}>
                    <Text style={styles.cardTitle}>{f.title}</Text>
                    <Text style={styles.cardDesc}>{f.desc}</Text>
                </View>
            ))}
            <View style={{ height: 100 }} />
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 20, backgroundColor: colors.bg, paddingTop: 50 },
    header: { fontFamily: fonts.displayBold, fontSize: 32, color: colors.ink, letterSpacing: -0.5 },
    subtitle: { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.ink2, marginTop: 10, marginBottom: 25, lineHeight: 20 },

    card: { backgroundColor: colors.surface, padding: 20, borderRadius: sizes.radius, marginBottom: 15, borderWidth: 1, borderColor: colors.border, borderLeftWidth: 4, borderLeftColor: colors.blue },
    cardTitle: { fontFamily: fonts.sansSemiBold, fontSize: 16, color: colors.ink, marginBottom: 6 },
    cardDesc: { fontFamily: fonts.sans, color: colors.ink2, lineHeight: 20, fontSize: 13 }
});
