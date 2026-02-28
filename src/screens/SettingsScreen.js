import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ScrollView } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import * as AuthSession from 'expo-auth-session';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabaseClient';
import { parseStudentVueGradebook } from '../utils/studentVueParser';
import { colors, fonts, sizes } from '../theme';

WebBrowser.maybeCompleteAuthSession();

export default function SettingsScreen() {
    const [schoologyUrl, setSchoologyUrl] = useState('');
    const [googleUrl, setGoogleUrl] = useState('');

    // StudentVUE State
    const [svUrl, setSvUrl] = useState('');
    const [svUser, setSvUser] = useState('');
    const [svPass, setSvPass] = useState('');

    // Auth State
    const [accessToken, setAccessToken] = useState(null);

    const isWeb = typeof window !== 'undefined' && window.location;

    // For Web, we MUST use the exact window location origin without any proxies,
    // otherwise the OAuth return redirect drops the hook state.
    const redirectUri = isWeb
        ? window.location.origin
        : AuthSession.makeRedirectUri({ useProxy: true });

    console.log("Current built Redirect URI: ", redirectUri);

    // Initialize Google Auth with placeholder Client IDs
    const [request, response, promptAsync] = Google.useAuthRequest({
        expoClientId: '983893359997-769avb68kb7a0ieduackj8u393kp8c4k.apps.googleusercontent.com',
        iosClientId: '983893359997-769avb68kb7a0ieduackj8u393kp8c4k.apps.googleusercontent.com',
        androidClientId: '983893359997-769avb68kb7a0ieduackj8u393kp8c4k.apps.googleusercontent.com',
        webClientId: '983893359997-769avb68kb7a0ieduackj8u393kp8c4k.apps.googleusercontent.com',
        scopes: ['https://www.googleapis.com/auth/calendar.events'],
        redirectUri,
    });

    useEffect(() => {
        // Load the stored token if it exists
        const loadToken = async () => {
            let storedToken = await AsyncStorage.getItem('googleAccessToken');
            if (!storedToken && typeof window !== 'undefined') {
                storedToken = window.localStorage.getItem('googleAccessToken');
            }
            if (storedToken) setAccessToken(storedToken);
        };
        loadToken();
    }, []);

    // MANUAL WEB FALLBACK: If AuthSession drops state on the redirect back from Google, 
    // manually parse the URL hash to extract the access token.
    useEffect(() => {
        if (typeof window !== 'undefined' && window.location.hash) {
            const hashParams = new URLSearchParams(window.location.hash.substring(1));
            const token = hashParams.get('access_token');
            if (token) {
                console.log("MANUALLY INTERCEPTED GOOGLE TOKEN FROM URL!");
                setAccessToken(token);
                window.localStorage.setItem('googleAccessToken', token);
                AsyncStorage.setItem('googleAccessToken', token);
                window.alert("Success! Successfully linked your Google Account.");
                // Clear the hash from the URL so it doesn't linger
                window.history.replaceState(null, '', window.location.pathname);
            }
        }
    }, []);

    useEffect(() => {
        console.log("Google Auth Response:", response);
        if (response?.type === 'success') {
            const token = response.authentication.accessToken;
            setAccessToken(token);
            // Save token securely for use in other screens (both Native and Web Fallback)
            if (typeof window !== 'undefined') {
                window.localStorage.setItem('googleAccessToken', token);
            }
            AsyncStorage.setItem('googleAccessToken', token).then(() => {
                if (typeof window !== 'undefined') window.alert("Success! Successfully linked your Google Account.");
                else Alert.alert("Success", "Successfully linked your Google Account!");
            }).catch(() => {
                if (typeof window !== 'undefined') window.alert("Warning: Saved token to browser but native storage failed.");
            });
        } else if (response?.type === 'error') {
            if (typeof window !== 'undefined') window.alert("Could not sign in right now. Note: Client IDs need to be configured.");
            else Alert.alert("Error", "Could not sign in right now. Note: Client IDs need to be configured.");
        }
    }, [response]);

    // Fetch Settings from Supabase on load
    useEffect(() => {
        const fetchSettings = async () => {
            const { data, error } = await supabase
                .from('settings')
                .select('*')
                .eq('user_id', 'default_user')
                .single();

            if (data && data.schoology_url) {
                setSchoologyUrl(data.schoology_url);
            }
        };
        fetchSettings();
    }, []);

    const handleSave = async () => {
        try {
            const { error } = await supabase
                .from('settings')
                .upsert({ user_id: 'default_user', schoology_url: schoologyUrl }, { onConflict: 'user_id' });

            if (error) throw error;
            Alert.alert('Saved!', 'Your manual calendar URLs have been saved to Supabase.');
        } catch (error) {
            console.error(error);
            Alert.alert('Error', 'Failed to save settings to Supabase.');
        }
    };

    const handleStudentVueLogin = async () => {
        if (!svUrl || !svUser || !svPass) {
            if (typeof window !== 'undefined') window.alert("Missing Fields: Please enter your portal URL, Username, and Password.");
            else Alert.alert("Missing Fields", "Please enter your portal URL, Username, and Password.");
            return;
        }

        try {
            if (typeof window === 'undefined') {
                Alert.alert("Syncing...", "Attempting to securely log into StudentVUE...");
            } else {
                console.log("Syncing: Attempting to securely log into StudentVUE...");
            }

            // Format URL to strip trailing slashes and ensure https
            let baseUrl = svUrl.trim();
            if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
            if (!baseUrl.startsWith('http')) baseUrl = 'https://' + baseUrl;

            // Build the exact target URL
            const finalTargetUrl = baseUrl.endsWith('Service/PXPCommunication.asmx')
                ? baseUrl
                : `${baseUrl}/Service/PXPCommunication.asmx`;

            // Use our secure Vercel Serverless Function to proxy the request and avoid CORS errors
            const proxyEndpoint = '/api/studentvue';

            const response = await fetch(proxyEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    targetUrl: finalTargetUrl,
                    soapPayload: soapPayload
                })
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                console.error("PROXY ERROR RESPONSE:", errData);
                const cause = errData?.cause || errData?.details || response.statusText;
                if (typeof window !== 'undefined') window.alert(`Connection Error: ${cause}`);
                else Alert.alert("Connection Error", String(cause));
                return;
            }

            const xmlText = await response.text();

            if (xmlText.includes('Gradebook') || xmlText.includes('RT_ERROR') === false) {
                console.log("SUCCESSFULLY FETCHED GRADES!");

                // Parse the mess of XML into the clean JSON array GradebookScreen needs
                console.log("--- RAW XML DEBUG ---");
                console.log(xmlText.substring(0, 2000));

                const formattedClasses = parseStudentVueGradebook(xmlText);
                console.log("PARSER RESULT:", formattedClasses);

                if (formattedClasses && formattedClasses.length > 0) {
                    await AsyncStorage.setItem('studentVueGrades', JSON.stringify(formattedClasses));
                    console.log("Successfully saved " + formattedClasses.length + " classes to AsyncStorage.");
                    if (typeof window !== 'undefined') window.alert(`Success! Logged in and fetched ${formattedClasses.length} classes! They will appear in the Gradebook Tab.`);
                    else Alert.alert("Success!", `Logged in and fetched ${formattedClasses.length} classes! They will appear in the Gradebook Tab.`);
                } else {
                    if (typeof window !== 'undefined') window.alert("Partial Data: Logged in, but couldn't completely parse your class list.");
                    else Alert.alert("Partial Data", "Logged in, but couldn't completely parse your class list.");
                }
            } else {
                if (typeof window !== 'undefined') window.alert("Login Failed: Could not authenticate. Check your URL, ID, and Password.");
                else Alert.alert("Login Failed", "Could not authenticate. Check your URL, ID, and Password.");
            }
        } catch (error) {
            console.error(error);
            if (typeof window !== 'undefined') window.alert("Network Error: Could not reach the StudentVUE portal. Check the URL.");
            else Alert.alert("Network Error", "Could not reach the StudentVUE portal. Check the URL.");
        }
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
            <View style={styles.pageHeader}>
                <Text style={styles.header}>Integrations & Sync</Text>
                <Text style={styles.subtitle}>Connect outside apps to build your schedule.</Text>
            </View>

            {/* --- GOOGLE LOGIN --- */}
            <View style={[styles.card, { borderColor: colors.blue }]}>
                <Text style={styles.cardTitle}>Google Accounts</Text>
                <Text style={styles.instructions}>
                    Sign in with Google to allow Option to automatically read your free time and insert task blocks into your calendar.
                </Text>

                {accessToken ? (
                    <View>
                        <Text style={{ fontFamily: fonts.monoMedium, color: colors.green, fontSize: 13, marginBottom: 15 }}>✅ Account Linked</Text>
                        <TouchableOpacity style={styles.actionBtn} onPress={blockOutTimeOnGoogleCalendar}>
                            <Text style={styles.actionBtnText}>Test: Block 1 Hour</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <TouchableOpacity
                        style={[styles.btnOutline, !request && { opacity: 0.5 }]}
                        disabled={!request}
                        onPress={() => {
                            console.log("GOOGLE BUTTON CLICKED!");
                            console.log("EXACT REDIRECT URI:", redirectUri);
                            console.log("AUTH REQUEST STATE:", request);
                            if (request) {
                                promptAsync();
                            } else {
                                if (typeof window !== 'undefined') window.alert("Still loading authentication flow. Please wait a second and try again.");
                            }
                        }}
                    >
                        <Text style={styles.btnOutlineText}>
                            {request ? "Sign In with Google" : "Loading Auth..."}
                        </Text>
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

            {/* --- STUDENTVUE / SYNERGY --- */}
            <View style={[styles.card, { borderColor: colors.orange }]}>
                <Text style={styles.cardTitle}>StudentVUE Grades</Text>
                <Text style={styles.instructions}>
                    Connect your school's StudentVUE portal to automatically fetch and calculate your latest grades.
                </Text>

                <Text style={styles.label}>School Portal URL</Text>
                <TextInput
                    style={styles.input}
                    placeholder="e.g. https://rtmsd.usplk12.org"
                    value={svUrl}
                    onChangeText={setSvUrl}
                    autoCapitalize="none"
                />

                <Text style={styles.label}>Username / Student ID</Text>
                <TextInput
                    style={styles.input}
                    placeholder="Student ID"
                    value={svUser}
                    onChangeText={setSvUser}
                    autoCapitalize="none"
                />

                <Text style={styles.label}>Password</Text>
                <TextInput
                    style={styles.input}
                    placeholder="Password"
                    placeholderTextColor={colors.ink4}
                    value={svPass}
                    onChangeText={setSvPass}
                    secureTextEntry
                />

                <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.ink, marginTop: 15 }]} onPress={handleStudentVueLogin}>
                    <Text style={styles.actionBtnText}>Sync Grades Now</Text>
                </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
                <Text style={styles.saveButtonText}>Save Manual Settings</Text>
            </TouchableOpacity>

        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 20, backgroundColor: colors.bg, paddingTop: 50 },
    pageHeader: { marginBottom: 25 },
    header: { fontFamily: fonts.displayBold, fontSize: 26, color: colors.ink, letterSpacing: -0.5 },
    subtitle: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', color: colors.ink3, marginTop: 4 },

    card: { backgroundColor: colors.surface, padding: 20, borderRadius: sizes.radius, marginBottom: 20, borderWidth: 1, borderColor: colors.border },
    cardTitle: { fontFamily: fonts.sansSemiBold, fontSize: 16, color: colors.ink, marginBottom: 8 },
    instructions: { fontFamily: fonts.sans, fontSize: 13, color: colors.ink2, lineHeight: 20, marginBottom: 15 },

    label: { fontFamily: fonts.monoMedium, fontSize: 10, color: colors.ink3, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 5, marginTop: 10 },
    input: { fontFamily: fonts.sans, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: sizes.radius, padding: 12, fontSize: 14, color: colors.ink, marginBottom: 5 },

    saveButton: { backgroundColor: colors.ink, padding: 15, borderRadius: sizes.radius, alignItems: 'center', marginTop: 10, marginBottom: 40 },
    saveButtonText: { fontFamily: fonts.sansMedium, color: colors.surface, fontSize: 14 },

    btnOutline: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border2, padding: 12, borderRadius: sizes.radius, alignItems: 'center' },
    btnOutlineText: { fontFamily: fonts.sansMedium, color: colors.ink2, fontSize: 14 },

    actionBtn: { backgroundColor: colors.ink, padding: 12, borderRadius: sizes.radius, alignItems: 'center' },
    actionBtnText: { fontFamily: fonts.sansMedium, color: colors.surface, fontSize: 14 }
});
