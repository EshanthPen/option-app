import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';

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
    container: { flex: 1, padding: 20, backgroundColor: '#f5f5f5', paddingTop: 50 },
    header: { fontSize: 32, fontWeight: 'bold', color: '#333' },
    subtitle: { fontSize: 14, color: '#666', marginTop: 10, marginBottom: 25, lineHeight: 20 },
    card: { backgroundColor: '#fff', padding: 20, borderRadius: 12, marginBottom: 15, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2, borderLeftWidth: 4, borderLeftColor: '#007AFF' },
    cardTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 5 },
    cardDesc: { color: '#555', lineHeight: 20 }
});
