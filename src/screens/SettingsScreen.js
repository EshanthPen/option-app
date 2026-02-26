import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ScrollView } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import * as AuthSession from 'expo-auth-session';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabaseClient';
import { parseStudentVueGradebook } from '../utils/studentVueParser';

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
            Alert.alert("Missing Fields", "Please enter your portal URL, Username, and Password.");
            return;
        }

        try {
            Alert.alert("Syncing...", "Attempting to securely log into StudentVUE...");

            // Format URL to strip trailing slashes and ensure https
            let baseUrl = svUrl.trim();
            if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
            if (!baseUrl.startsWith('http')) baseUrl = 'https://' + baseUrl;

            const endpoint = `https://cors-anywhere.herokuapp.com/${baseUrl}/Service/PXPCommunication.asmx`;

            const soapPayload = `<?xml version="1.0" encoding="utf-8"?>
            <soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
            <soap:Body>
                <ProcessWebServiceRequest xmlns="http://edupoint.com/webservices/">
                <userID>${svUser}</userID>
                <password>${svPass}</password>
                <skipLoginLog>true</skipLoginLog>
                <parent>false</parent>
                <webServiceHandleName>PXPWebServices</webServiceHandleName>
                <methodName>Gradebook</methodName>
                <paramStr>&lt;Parms&gt;&lt;ChildIntID&gt;0&lt;/ChildIntID&gt;&lt;/Parms&gt;</paramStr>
                </ProcessWebServiceRequest>
            </soap:Body>
            </soap:Envelope>`;

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'text/xml; charset=utf-8',
                    'SOAPAction': 'http://edupoint.com/webservices/ProcessWebServiceRequest'
                },
                body: soapPayload
            });

            const xmlText = await response.text();

            if (xmlText.includes('Gradebook') || xmlText.includes('RT_ERROR') === false) {
                console.log("SUCCESSFULLY FETCHED GRADES!");

                // Parse the mess of XML into the clean JSON array GradebookScreen needs
                const formattedClasses = parseStudentVueGradebook(xmlText);

                if (formattedClasses && formattedClasses.length > 0) {
                    await AsyncStorage.setItem('studentVueGrades', JSON.stringify(formattedClasses));
                    console.log("Successfully saved " + formattedClasses.length + " classes to AsyncStorage.");
                    Alert.alert("Success!", `Logged in and fetched ${formattedClasses.length} classes! They will appear in the Gradebook Tab.`);
                } else {
                    Alert.alert("Partial Data", "Logged in, but couldn't completely parse your class list.");
                }
            } else {
                Alert.alert("Login Failed", "Could not authenticate. Check your URL, ID, and Password.");
            }
        } catch (error) {
            console.error(error);
            Alert.alert("Network Error", "Could not reach the StudentVUE portal. Check the URL.");
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
                        style={[styles.googleBtn, !request && { opacity: 0.5 }]}
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
                        <Text style={styles.googleBtnText}>
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
            <View style={[styles.card, { borderColor: '#8E24AA', borderWidth: 2 }]}>
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
                    value={svPass}
                    onChangeText={setSvPass}
                    secureTextEntry
                />

                <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#8E24AA', marginTop: 15 }]} onPress={handleStudentVueLogin}>
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
