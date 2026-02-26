import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ScrollView } from 'react-native';

export default function SettingsScreen() {
    const [schoologyUrl, setSchoologyUrl] = useState('');
    const [googleUrl, setGoogleUrl] = useState('');

    const handleSave = () => {
        // In the future this will save to Firebase
        Alert.alert('Saved!', 'Your calendar URLs have been saved. They will automatically sync on the Matrix tab.');
    };

    return (
        <ScrollView style={styles.container}>
            <Text style={styles.header}>Integrations</Text>
            <Text style={styles.subtitle}>Connect your outside applications to Option to automatically build your schedule.</Text>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Schoology Calendar</Text>
                <Text style={styles.instructions}>
                    1. Go to Schoology on your computer.
                    {'\n'}2. Click the Calendar icon at the top.
                    {'\n'}3. Scroll down and click 'Export'.
                    {'\n'}4. Copy the link they give you and paste it here.
                </Text>
                <TextInput
                    style={styles.input}
                    placeholder="webcal://schoology.com/calendar..."
                    value={schoologyUrl}
                    onChangeText={setSchoologyUrl}
                    autoCapitalize="none"
                />
            </View>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Google Calendar</Text>
                <Text style={styles.instructions}>
                    1. Go to Google Calendar on your computer.
                    {'\n'}2. Click the Settings gear ⚙️.
                    {'\n'}3. Click your specific calendar on the left.
                    {'\n'}4. Scroll down to 'Secret address in iCal format' and copy it here.
                </Text>
                <TextInput
                    style={styles.input}
                    placeholder="https://calendar.google.com/calendar/ical/..."
                    value={googleUrl}
                    onChangeText={setGoogleUrl}
                    autoCapitalize="none"
                />
            </View>

            <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
                <Text style={styles.saveButtonText}>Save Integrations</Text>
            </TouchableOpacity>

        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 20, backgroundColor: '#f9f9f9', paddingTop: 50 },
    header: { fontSize: 28, fontWeight: 'bold', color: '#333' },
    subtitle: { fontSize: 14, color: '#666', marginTop: 5, marginBottom: 25 },
    card: { backgroundColor: '#fff', padding: 20, borderRadius: 12, marginBottom: 20, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 5, elevation: 3 },
    cardTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 10 },
    instructions: { fontSize: 13, color: '#555', lineHeight: 20, marginBottom: 15 },
    input: { backgroundColor: '#f0f0f0', padding: 12, borderRadius: 8, fontSize: 14, borderWidth: 1, borderColor: '#ddd' },
    saveButton: { backgroundColor: '#007AFF', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 10, marginBottom: 40 },
    saveButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' }
});
