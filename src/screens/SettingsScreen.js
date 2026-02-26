import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ScrollView } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';

WebBrowser.maybeCompleteAuthSession();

export default function SettingsScreen() {
    const [schoologyUrl, setSchoologyUrl] = useState('');
    const [googleUrl, setGoogleUrl] = useState('');

    // Auth State
    const [accessToken, setAccessToken] = useState(null);

    // Initialize Google Auth with placeholder Client IDs
    const [request, response, promptAsync] = Google.useAuthRequest({
        iosClientId: 'PLACEHOLDER_IOS_CLIENT_ID.apps.googleusercontent.com',
        androidClientId: 'PLACEHOLDER_ANDROID_CLIENT_ID.apps.googleusercontent.com',
        webClientId: 'PLACEHOLDER_WEB_CLIENT_ID.apps.googleusercontent.com',
        scopes: ['https://www.googleapis.com/auth/calendar.events'],
    });

    useEffect(() => {
        if (response?.type === 'success') {
            setAccessToken(response.authentication.accessToken);
            Alert.alert("Success", "Successfully linked your Google Account!");
        } else if (response?.type === 'error') {
            Alert.alert("Error", "Could not sign in right now. Note: Client IDs need to be configured.");
        }
    }, [response]);

    const handleSave = () => {
        Alert.alert('Saved!', 'Your manual calendar URLs have been saved.');
    };

    const blockOutTimeOnGoogleCalendar = async () => {
        if (!accessToken) {
            Alert.alert('Not Linked', 'Please sign in with Google first.');
            return;
        }

        // Create a dummy 1-hour event starting right now
        const startTime = new Date();
        const endTime = new Date(startTime.getTime() + 60 * 60 * 1000);

        const event = {
            summary: 'Option App: Study Block 📚',
            description: 'Automatically scheduled by Option.',
            start: { dateTime: startTime.toISOString(), timeZone: 'America/New_York' },
            end: { dateTime: endTime.toISOString(), timeZone: 'America/New_York' },
        };

        try {
            const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(event),
            });

            if (res.ok) {
                Alert.alert('Success!', 'Successfully scheduled a 1-hour block on your real Google Calendar!');
            } else {
                const errorData = await res.json();
                console.error(errorData);
                Alert.alert('Calendar Error', 'Failed to insert the event. Are scopes correct?');
            }
        } catch (error) {
            console.error(error);
            Alert.alert('Error', 'Network issue reaching Google.');
        }
    };

    return (
        <ScrollView style={styles.container}>
            <Text style={styles.header}>Integrations & Sync</Text>
            <Text style={styles.subtitle}>Connect outside apps to build your schedule.</Text>

            {/* --- GOOGLE LOGIN --- */}
            <View style={[styles.card, { borderColor: '#4285F4', borderWidth: 2 }]}>
                <Text style={styles.cardTitle}>Google Accounts</Text>
                <Text style={styles.instructions}>
                    Sign in with Google to allow Option to automatically read your free time and insert task blocks into your calendar.
                </Text>

                {accessToken ? (
                    <View>
                        <Text style={{ color: '#34C759', fontWeight: 'bold', marginBottom: 15 }}>✅ Account Linked and Authorized</Text>
                        <TouchableOpacity style={styles.actionBtn} onPress={blockOutTimeOnGoogleCalendar}>
                            <Text style={styles.actionBtnText}>Test: Block 1 Hour Now</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <TouchableOpacity
                        style={styles.googleBtn}
                        disabled={!request}
                        onPress={() => promptAsync()}
                    >
                        <Text style={styles.googleBtnText}>Sign In with Google</Text>
                    </TouchableOpacity>
                )}
            </View>

            {/* --- SCHOOLOGY --- */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>Schoology Calendar</Text>
                <Text style={styles.instructions}>Paste your exported webcal/ics link here to auto-fetch assignments.</Text>
                <TextInput
                    style={styles.input}
                    placeholder="webcal://schoology.com/calendar..."
                    value={schoologyUrl}
                    onChangeText={setSchoologyUrl}
                    autoCapitalize="none"
                />
            </View>

            <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
                <Text style={styles.saveButtonText}>Save Manual Settings</Text>
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
    saveButton: { backgroundColor: '#333', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 10, marginBottom: 40 },
    saveButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },

    googleBtn: { backgroundColor: '#4285F4', padding: 15, borderRadius: 10, alignItems: 'center' },
    googleBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },

    actionBtn: { backgroundColor: '#007AFF', padding: 12, borderRadius: 8, alignItems: 'center' },
    actionBtnText: { color: '#fff', fontSize: 14, fontWeight: 'bold' }
});
