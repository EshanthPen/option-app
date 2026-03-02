import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ScrollView, ActivityIndicator, Platform, Modal } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import * as AuthSession from 'expo-auth-session';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabaseClient';
import { syncStudentVueGrades } from '../utils/studentVueAPI';
import { theme as staticTheme } from '../utils/theme';
import DistrictPickerModal, { KNOWN_DISTRICTS } from '../components/DistrictPickerModal';
import { syncAssignmentsToCalendar } from '../utils/googleCalendarAPI';
import { ChevronDown, RefreshCw, Moon, Sun } from 'lucide-react-native';
import { loadMockGradebookData } from '../utils/mockStudentData';
import ICAL from 'ical.js';
import { useTheme } from '../context/ThemeContext';
import { useNavigation } from '@react-navigation/native';
import { parseStudentVueGradebook } from '../utils/studentVueParser';

WebBrowser.maybeCompleteAuthSession();

export default function SettingsScreen() {
    const { theme, toggleTheme, isDarkMode } = useTheme();
    const styles = getStyles(theme);
    const navigation = useNavigation();
    const [schoologyUrl, setSchoologyUrl] = useState('');
    const [googleUrl, setGoogleUrl] = useState('');

    // StudentVUE State
    const [svUser, setSvUser] = useState('');
    const [svPass, setSvPass] = useState('');
    const [selectedDistrict, setSelectedDistrict] = useState(null);
    const [customUrl, setCustomUrl] = useState('');
    const [isPickerVisible, setIsPickerVisible] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState(null);
    const [isMockLoading, setIsMockLoading] = useState(false);
    const [isSchoologySyncing, setIsSchoologySyncing] = useState(false);
    const [isHelpVisible, setIsHelpVisible] = useState(false);

    // Auth State
    const [accessToken, setAccessToken] = useState(null);

    const isWeb = typeof window !== 'undefined' && window.location;

    const redirectUri = isWeb
        ? window.location.origin
        : AuthSession.makeRedirectUri({ useProxy: true });

    const [request, response, promptAsync] = Google.useAuthRequest({
        expoClientId: '983893359997-769avb68kb7a0ieduackj8u393kp8c4k.apps.googleusercontent.com',
        iosClientId: '983893359997-769avb68kb7a0ieduackj8u393kp8c4k.apps.googleusercontent.com',
        androidClientId: '983893359997-769avb68kb7a0ieduackj8u393kp8c4k.apps.googleusercontent.com',
        webClientId: '983893359997-769avb68kb7a0ieduackj8u393kp8c4k.apps.googleusercontent.com',
        scopes: ['https://www.googleapis.com/auth/calendar.events'],
        redirectUri,
    });

    useEffect(() => {
        const loadToken = async () => {
            let storedToken = await AsyncStorage.getItem('googleAccessToken');
            if (!storedToken && typeof window !== 'undefined') {
                storedToken = window.localStorage.getItem('googleAccessToken');
            }
            if (storedToken) setAccessToken(storedToken);

            const savedSchoology = await AsyncStorage.getItem('schoologyUrl');
            if (savedSchoology) setSchoologyUrl(savedSchoology);
        };
        loadToken();
    }, []);

    useEffect(() => {
        if (typeof window !== 'undefined' && window.location.hash) {
            const hashParams = new URLSearchParams(window.location.hash.substring(1));
            const token = hashParams.get('access_token');
            if (token) {
                setAccessToken(token);
                window.localStorage.setItem('googleAccessToken', token);
                AsyncStorage.setItem('googleAccessToken', token);
                window.alert("Success! Successfully linked your Google Account.");
                window.history.replaceState(null, '', window.location.pathname);
            }
        }
    }, []);

    useEffect(() => {
        if (response?.type === 'success') {
            const token = response.authentication.accessToken;
            setAccessToken(token);
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

    useEffect(() => {
        const fetchSettings = async () => {
            const { data, error } = await supabase.from('settings').select('*').eq('user_id', 'default_user').single();
            if (data && data.schoology_url) setSchoologyUrl(data.schoology_url);
        };
        fetchSettings();
    }, []);

    const handleSaveSchoology = async () => {
        try {
            const { error } = await supabase.from('settings').upsert({ user_id: 'default_user', schoology_url: schoologyUrl }, { onConflict: 'user_id' });
            if (error) throw error;
            if (Platform.OS === 'web') window.alert('Saved: Your Schoology URL has been updated.');
            else Alert.alert('Saved!', 'Your Schoology URL has been updated.');
        } catch (error) {
            if (Platform.OS === 'web') window.alert('Error: Failed to save settings.');
            else Alert.alert('Error', 'Failed to save settings.');
        }
    };

    const handleSchoologySync = async () => {
        if (!schoologyUrl) {
            if (Platform.OS === 'web') window.alert('Please enter your Schoology calendar link first.');
            else Alert.alert('Missing URL', 'Please enter your Schoology calendar link first.');
            return;
        }
        setIsSchoologySyncing(true);

        // Robust URL Extraction: Find anything that looks like a calendar link
        // This regex looks for webcal or http(s) links that contain '.ics'
        const input = schoologyUrl.trim();
        const urlRegex = /(?:webcal|https?):\/\/[^\s"'<>]+\.ics[^\s"'<>]*|https?:\/\/[^\s"'<>]+\/calendar\/feed\/ical\/[^\s"'<>]+/gi;
        const matches = input.match(urlRegex);

        let cleanUrl = matches ? matches[matches.length - 1] : input;

        // If it looks like a relative or doubled up path, recover it
        if (!cleanUrl.includes('://') && cleanUrl.includes('.ics')) {
            cleanUrl = 'https://' + cleanUrl.split('http').pop().replace(/^\/+/, '');
        }

        let fetchUrl = cleanUrl.replace(/^webcal:\/\//, 'https://');

        // Use absolute URL for web environment to ensure proxy is reached correctly
        const baseUrl = Platform.OS === 'web' ? window.location.origin : 'http://localhost:8081';
        const proxyUrl = `${baseUrl}/api/schoology?url=${encodeURIComponent(fetchUrl)}`;

        try {
            let icsData = '';
            try {
                const response = await fetch(proxyUrl);
                if (!response.ok) throw new Error('Proxy failed');
                icsData = await response.text();
            } catch (proxyErr) {
                const directResponse = await fetch(fetchUrl);
                if (!directResponse.ok) throw new Error('Direct fetch failed');
                icsData = await directResponse.text();
            }

            if (!icsData || !icsData.includes('BEGIN:VCALENDAR')) {
                throw new Error('No valid calendar data (BEGIN:VCALENDAR missing). If this is a Schoology link, ensure it starts with https://schoology.your-school.org/calendar/feed/...');
            }

            const jcalData = ICAL.parse(icsData);
            const comp = new ICAL.Component(jcalData);
            const events = comp.getAllSubcomponents('vevent');

            const now = new Date();
            const imported = events.map((ve, idx) => {
                const ev = new ICAL.Event(ve);
                const tl = (ev.summary || '').toLowerCase();
                const desc = (ev.description || '').toLowerCase();
                const dueDate = ev.startDate ? ev.startDate.toJSDate() : new Date();

                if (desc.includes('completed') || desc.includes('submitted') || dueDate < new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)) return null;

                const diffDays = (dueDate - now) / (1000 * 60 * 60 * 24);
                const u = diffDays <= 7 ? 9 : 5;

                let points = 0;
                const ptsMatch = desc.match(/(\d+)\s*pts/) || tl.match(/(\d+)\s*pts/);
                if (ptsMatch) points = parseInt(ptsMatch[1]);

                let im = points > 50 ? 10 : points > 20 ? 8 : 5;
                if (tl.includes('test') || tl.includes('exam') || tl.includes('quiz')) im = Math.max(im, 9);
                if (tl.includes('project') || tl.includes('essay')) im = Math.max(im, 8);

                return {
                    title: ev.summary || 'Untitled Assignment',
                    urgency: u,
                    importance: im,
                    duration: 60,
                    date: dueDate.toISOString().split('T')[0],
                    source: 'schoology_import',
                    user_id: 'default_user'
                };
            }).filter(t => t !== null);

            if (imported.length > 0) {
                const { error } = await supabase.from('tasks').insert(imported);
                if (error) throw error;

                const msg = `Sync Complete: Imported ${imported.length} upcoming or recent assignments.`;
                if (Platform.OS === 'web') window.alert(msg);
                else Alert.alert('Sync Complete', msg);
            } else {
                const emptyMsg = `No recent or upcoming assignments were found in your Schoology calendar.`;
                if (Platform.OS === 'web') window.alert(emptyMsg);
                else Alert.alert('No Assignments', emptyMsg);
            }
        } catch (err) {
            console.error('Schoology Sync Error:', err);
            const errMsg = `Failed to sync: ${err.message}`;
            if (Platform.OS === 'web') window.alert(errMsg);
            else Alert.alert('Error', errMsg);
        } finally {
            setIsSchoologySyncing(false);
        }
    };

    const handleStudentVueLogin = async () => {
        let baseUrl = '';
        if (selectedDistrict) {
            baseUrl = selectedDistrict.id === 'custom' ? customUrl : selectedDistrict.url;
        }

        if (!baseUrl || !svUser || !svPass) {
            setSyncResult({ type: 'error', message: 'Please select your school district and enter your username and password.' });
            return;
        }

        setSyncResult(null);
        setIsSyncing(true);

        try {
            await AsyncStorage.setItem('svUsername', svUser);
            await AsyncStorage.setItem('svPassword', svPass);
            await AsyncStorage.setItem('svDistrictUrl', baseUrl);

            // Prioritize the logic from remote branch for 'auth' (Proxy + Parser)
            const finalTargetUrl = baseUrl.endsWith('Service/PXPCommunication.asmx')
                ? baseUrl
                : `${baseUrl}/Service/PXPCommunication.asmx`;

            const soapPayload = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ProcessWebServiceRequest xmlns="http://edupoint.com/webservices/">
      <userID>${svUser.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</userID>
      <password>${svPass.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</password>
      <skipLoginLog>1</skipLoginLog>
      <parent>0</parent>
      <webServiceHandleName>PXPWebServices</webServiceHandleName>
      <methodName>Gradebook</methodName>
      <paramStr>&lt;Parms&gt;&lt;ReportPeriod&gt;0&lt;/ReportPeriod&gt;&lt;/Parms&gt;</paramStr>
    </ProcessWebServiceRequest>
  </soap:Body>
</soap:Envelope>`;

            const proxyEndpoint = '/api/studentvue';

            const response = await fetch(proxyEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ targetUrl: finalTargetUrl, soapPayload: soapPayload })
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData?.cause || errData?.details || response.statusText);
            }

            const xmlText = await response.text();

            if (xmlText.includes('Gradebook') || xmlText.includes('RT_ERROR') === false) {
                const formattedClasses = parseStudentVueGradebook(xmlText);
                if (formattedClasses && formattedClasses.length > 0) {
                    await AsyncStorage.setItem('studentVueGrades', JSON.stringify(formattedClasses));

                    const totalAssignments = formattedClasses.reduce((sum, c) => sum + (c.assignments?.length || 0), 0);

                    setSyncResult({
                        type: 'success',
                        message: `✅ Imported ${formattedClasses.length} classes with ${totalAssignments} assignments.`
                    });
                } else {
                    throw new Error("Connected, but couldn't parse your class list.");
                }
            } else {
                setSyncResult({ type: 'error', message: 'Connected but no grade data was found. Your account may have no grades for this period.' });
            }
        } catch (error) {
            console.error(error);
            setSyncResult({ type: 'error', message: error.message });
        } finally {
            setIsSyncing(false);
        }
    };

    const syncGoogleCalendarManual = async () => {
        if (!accessToken) {
            Alert.alert('Not Linked', 'Please sign in with Google first.');
            return;
        }

        setIsSyncing(true);
        try {
            const savedGrades = await AsyncStorage.getItem('studentVueGrades');
            if (!savedGrades) {
                Alert.alert('No Grade Data', 'Please sync with StudentVUE first so we have assignments to share with Google.');
                return;
            }

            const formattedClasses = JSON.parse(savedGrades);
            let allAssignments = [];
            for (const course of formattedClasses) {
                if (course.assignments) {
                    allAssignments = allAssignments.concat(
                        course.assignments.map(a => ({ ...a, courseName: course.name }))
                    );
                }
            }

            if (allAssignments.length > 0) {
                const syncCount = await syncAssignmentsToCalendar(accessToken, allAssignments);
                Alert.alert('Success!', `Synchronized ${syncCount} assignments to your Google Calendar.`);
            } else {
                Alert.alert('No Assignments', 'No assignments found to sync.');
            }
        } catch (error) {
            console.error(error);
            Alert.alert('Error', 'Failed to manual sync: ' + error.message);
        } finally {
            setIsSyncing(false);
        }
    };

    const blockOutTimeOnGoogleCalendar = async () => {
        if (!accessToken) {
            Alert.alert('Not Linked', 'Please sign in with Google first.');
            return;
        }

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
                Alert.alert('Calendar Error', 'Failed to insert the event. Are scopes correct?');
            }
        } catch (error) {
            Alert.alert('Error', 'Network issue reaching Google.');
        }
    };

    return (
        <ScrollView style={styles.container}>
            <View style={styles.headerContainer}>
                <Text style={styles.header}>Integrations</Text>
                <Text style={styles.subtitle}>Connect outside apps to build your schedule.</Text>
            </View>

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Appearance</Text>
                <TouchableOpacity
                    style={styles.settingRow}
                    onPress={toggleTheme}
                    activeOpacity={0.7}
                >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        <View style={[styles.iconBox, { backgroundColor: theme.colors.surface2 }]}>
                            {isDarkMode ? <Moon size={20} color={theme.colors.purple} /> : <Sun size={20} color={theme.colors.orange} />}
                        </View>
                        <View>
                            <Text style={styles.settingLabel}>Dark Mode</Text>
                            <Text style={styles.settingSub}>{isDarkMode ? 'Enabled' : 'Disabled'}</Text>
                        </View>
                    </View>
                    <View style={[styles.toggleContainer, isDarkMode && { backgroundColor: theme.colors.accent }]}>
                        <View style={[styles.toggleCircle, isDarkMode && { transform: [{ translateX: 20 }] }]} />
                    </View>
                </TouchableOpacity>
            </View>

            <View style={[styles.card, { borderLeftColor: theme.colors.blue, borderLeftWidth: 4 }]}>
                <Text style={styles.cardTitle}>Google Calendar</Text>
                <Text style={styles.instructions}>
                    Sync your assignments directly to your Google Calendar.
                </Text>

                <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TouchableOpacity
                        style={[styles.actionBtn, { flex: 2 }]}
                        onPress={() => promptAsync()}
                        disabled={!request}
                    >
                        <RefreshCw size={18} color="#000" />
                        <Text style={styles.actionBtnText}>
                            {accessToken ? 'Re-link Account' : 'Link Google Account'}
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.actionBtnLight, { flex: 1 }]}
                        onPress={() => setIsHelpVisible(true)}
                    >
                        <Text style={styles.actionBtnLightText}>Help</Text>
                    </TouchableOpacity>
                </View>

                {accessToken && (
                    <TouchableOpacity
                        style={[styles.actionBtn, { marginTop: 15, width: '100%' }]}
                        onPress={async () => {
                            try {
                                setIsSyncing(true);
                                await syncAssignmentsToCalendar(accessToken);
                                if (Platform.OS === 'web') window.alert('Calendar sync complete!');
                                else Alert.alert('Success', 'Calendar sync complete!');
                            } catch (err) {
                                if (Platform.OS === 'web') window.alert('Sync failed: ' + err.message);
                                else Alert.alert('Error', 'Sync failed: ' + err.message);
                            } finally {
                                setIsSyncing(false);
                            }
                        }}
                        disabled={isSyncing}
                    >
                        {isSyncing ? <ActivityIndicator size="small" color="#000" /> : <Text style={styles.actionBtnText}>Sync Now</Text>}
                    </TouchableOpacity>
                )}
            </View>

            {/* Help Modal */}
            <Modal visible={isHelpVisible} transparent animationType="slide" onRequestClose={() => setIsHelpVisible(false)}>
                <View style={styles.modalOverlay}>
                    <View style={[styles.periodPickerContainer, { maxWidth: 500 }]}>
                        <Text style={styles.periodPickerTitle}>Google Calendar Setup</Text>
                        <ScrollView style={{ maxHeight: 400 }}>
                            <Text style={styles.helpStep}>1. Go to Google Cloud Console</Text>
                            <Text style={styles.helpDesc}>Create a project and enable the "Google Calendar API".</Text>

                            <Text style={styles.helpStep}>2. Create OAuth Credentials</Text>
                            <Text style={styles.helpDesc}>Create an "OAuth client ID" for a Web application.</Text>

                            <Text style={styles.helpStep}>3. Set Authorized Redirect URIs</Text>
                            <Text style={styles.helpDesc}>Add the following URI to your Authorized Redirect URIs in the Google Console:</Text>
                            <View style={styles.uriBox}>
                                <Text style={styles.uriText} selectable>{redirectUri}</Text>
                            </View>

                            <Text style={styles.helpStep}>4. Client ID</Text>
                            <Text style={styles.helpDesc}>Ensure your Client ID is correctly set in the app configuration.</Text>

                            <Text style={styles.helpStep}>5. Link & Sync</Text>
                            <Text style={styles.helpDesc}>Click "Link Google Account" and authorize the app to manage your calendar events.</Text>
                        </ScrollView>
                        <TouchableOpacity style={[styles.saveBtn, { marginTop: 20 }]} onPress={() => setIsHelpVisible(false)}>
                            <Text style={styles.saveBtnText}>Got it</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            <View style={[styles.card, { borderColor: theme.colors.blue, borderWidth: 2 }]}>
                <Text style={styles.cardTitle}>Google Accounts</Text>
                <Text style={styles.instructions}>
                    Sign in with Google to allow Option to automatically read your free time and insert task blocks into your calendar.
                </Text>

                {accessToken ? (
                    <View>
                        <Text style={{ fontFamily: theme.fonts.s, color: theme.colors.green, fontWeight: '600', marginBottom: 15 }}>✅ Account Linked</Text>
                        <View style={{ gap: 10 }}>
                            <TouchableOpacity style={styles.actionBtn} onPress={syncGoogleCalendarManual} disabled={isSyncing}>
                                {isSyncing ? <ActivityIndicator size="small" color="#000" /> : <Text style={styles.actionBtnText}>Sync Gradebook to Google</Text>}
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.actionBtnLight}
                                onPress={blockOutTimeOnGoogleCalendar}
                            >
                                <Text style={styles.actionBtnLightText}>Test: Block 1 Hour</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                ) : (
                    <View>
                        <TouchableOpacity
                            style={[styles.actionBtn, { width: '100%' }, !request && { opacity: 0.5 }]}
                            disabled={!request}
                            onPress={() => {
                                if (request) promptAsync();
                                else if (typeof window !== 'undefined') window.alert("Still loading authentication flow. Please wait a second and try again.");
                            }}
                        >
                            <Text style={styles.actionBtnText}>
                                {request ? "Sign In with Google" : "Loading Auth..."}
                            </Text>
                        </TouchableOpacity>
                        <View style={{ marginTop: 15, padding: 12, backgroundColor: theme.colors.red + '10', borderRadius: 8, borderWidth: 1, borderColor: theme.colors.red + '30' }}>
                            <Text style={{ fontFamily: theme.fonts.m, fontSize: 10, color: theme.colors.red, fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 }}>⚠️ Error 400: redirect_uri_mismatch?</Text>
                            <Text style={{ fontFamily: theme.fonts.m, fontSize: 11, color: theme.colors.ink2, lineHeight: 16 }}>
                                To fix this, you must add <Text style={{ fontWeight: 'bold', color: theme.colors.ink }}>http://localhost:8081</Text> to the "Authorized redirect URIs" list in your Google Cloud Console project.
                            </Text>
                        </View>
                    </View>
                )}
            </View>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Schoology Calendar</Text>
                <Text style={styles.instructions}>Paste your exported webcal/ics link here to auto-fetch assignments.</Text>
                <TextInput
                    style={styles.input}
                    placeholder="webcal://schoology.com/calendar..."
                    placeholderTextColor={theme.colors.ink3}
                    value={schoologyUrl}
                    onChangeText={setSchoologyUrl}
                    autoCapitalize="none"
                />
                <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TouchableOpacity style={styles.actionBtnLight} onPress={() => {
                        AsyncStorage.setItem('schoologyUrl', schoologyUrl);
                        if (Platform.OS === 'web') window.alert('Schoology URL saved.');
                        else Alert.alert('Saved', 'Schoology URL saved.');
                    }}>
                        <Text style={styles.actionBtnLightText}>Save URL</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.actionBtn, { flex: 1 }]} onPress={handleSchoologySync} disabled={isSchoologySyncing}>
                        {isSchoologySyncing ? <ActivityIndicator size="small" color="#000" /> : (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <RefreshCw size={16} color="#000" />
                                <Text style={styles.actionBtnText}>Sync Now</Text>
                            </View>
                        )}
                    </TouchableOpacity>
                </View>
            </View>

            <View style={[styles.card, { borderColor: theme.colors.border2 }]}>
                <Text style={styles.cardTitle}>StudentVUE</Text>
                <Text style={styles.instructions}>
                    Connect your school's portal to automatically fetch and calculate grades.
                </Text>

                <Text style={styles.label}>School District</Text>
                <TouchableOpacity
                    style={[styles.input, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}
                    onPress={() => setIsPickerVisible(true)}
                >
                    <Text style={{ fontFamily: theme.fonts.m, fontSize: 13, color: selectedDistrict ? theme.colors.ink : theme.colors.ink3 }}>
                        {selectedDistrict ? selectedDistrict.name : "Select your school district..."}
                    </Text>
                    <ChevronDown size={18} color={theme.colors.ink3} />
                </TouchableOpacity>

                {selectedDistrict && selectedDistrict.id === 'custom' && (
                    <>
                        <Text style={styles.label}>Custom Portal URL</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="e.g. https://rtmsd.usplk12.org"
                            placeholderTextColor={theme.colors.ink3}
                            value={customUrl}
                            onChangeText={setCustomUrl}
                            autoCapitalize="none"
                        />
                    </>
                )}

                <Text style={styles.label}>Username / Student ID</Text>
                <TextInput style={styles.input} placeholder="Student ID" placeholderTextColor={theme.colors.ink3} value={svUser} onChangeText={setSvUser} autoCapitalize="none" />

                <Text style={styles.label}>Password</Text>
                <TextInput style={styles.input} placeholder="Password" placeholderTextColor={theme.colors.ink3} value={svPass} onChangeText={setSvPass} secureTextEntry />

                <TouchableOpacity
                    style={[
                        styles.actionBtn,
                        { marginTop: 15 },
                        isSyncing && { opacity: 0.7 }
                    ]}
                    onPress={handleStudentVueLogin}
                    disabled={isSyncing}
                >
                    {isSyncing ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <ActivityIndicator size="small" color="#000" />
                            <Text style={styles.actionBtnText}>Importing grades…</Text>
                        </View>
                    ) : (
                        <Text style={styles.actionBtnText}>Sync Grades Now</Text>
                    )}
                </TouchableOpacity>

                {isSyncing && (
                    <View style={styles.progressBarTrack}>
                        <View style={styles.progressBarFill} />
                    </View>
                )}

                {syncResult && (
                    <View style={[
                        styles.syncBanner,
                        {
                            borderColor: syncResult.type === 'success' ? theme.colors.green : theme.colors.red,
                            backgroundColor: syncResult.type === 'success' ? '#f0fdf4' : '#fff5f5'
                        },
                    ]}>
                        <Text style={[styles.syncBannerText, { color: syncResult.type === 'success' ? '#166534' : '#991b1b' }]}>
                            {syncResult.message}
                        </Text>
                    </View>
                )}

                <View style={styles.demoRow}>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.demoLabel}>Beta Testing</Text>
                        <Text style={styles.demoSub}>Load fake student data to test the Gradebook &amp; Calendar without real credentials.</Text>
                    </View>
                </View>
                <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: theme.colors.purple, marginTop: 6 }]}
                    onPress={async () => {
                        setIsMockLoading(true);
                        setSyncResult(null);
                        try {
                            const { classCount, assignmentCount } = await loadMockGradebookData();
                            setSyncResult({
                                type: 'success',
                                message: `🎓 Demo data loaded! ${classCount} classes · ${assignmentCount} assignments`,
                            });
                        } catch (e) {
                            setSyncResult({ type: 'error', message: `Demo load failed: ${e.message}` });
                        } finally {
                            setIsMockLoading(false);
                        }
                    }}
                    disabled={isMockLoading}
                >
                    {isMockLoading ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <ActivityIndicator size="small" color="#000" />
                            <Text style={styles.actionBtnText}>Generating…</Text>
                        </View>
                    ) : (
                        <Text style={styles.actionBtnText}>🎓 Load Demo Data</Text>
                    )}
                </TouchableOpacity>
            </View>

            <DistrictPickerModal
                visible={isPickerVisible}
                onClose={() => setIsPickerVisible(false)}
                onSelect={(district) => setSelectedDistrict(district)}
                currentSelectionUrl={selectedDistrict?.url}
            />
        </ScrollView >
    );
}

const getStyles = (theme) => StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.bg, paddingTop: 40, paddingHorizontal: 20 },
    headerContainer: { marginBottom: 30 },
    header: { fontFamily: theme.fonts.d, fontSize: 36, fontWeight: '700', color: theme.colors.ink, letterSpacing: -0.5 },
    subtitle: { fontFamily: theme.fonts.m, fontSize: 13, color: theme.colors.ink3, marginTop: 5 },

    section: { marginBottom: 30 },
    sectionTitle: { fontFamily: theme.fonts.m, fontSize: 10, color: theme.colors.ink3, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 15 },
    settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: theme.colors.surface, padding: 16, borderRadius: theme.radii.lg, borderWidth: 1, borderColor: theme.colors.border },
    iconBox: { width: 40, height: 40, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
    settingLabel: { fontFamily: theme.fonts.s, fontSize: 16, fontWeight: '600', color: theme.colors.ink },
    settingSub: { fontFamily: theme.fonts.s, fontSize: 13, color: theme.colors.ink3, marginTop: 2 },
    toggleContainer: { width: 44, height: 24, borderRadius: 12, backgroundColor: theme.colors.surface2, padding: 2, justifyContent: 'center' },
    toggleCircle: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 2, elevation: 1 },

    card: {
        backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
        borderRadius: theme.radii.lg, padding: 24, marginBottom: 20
    },
    cardTitle: { fontFamily: theme.fonts.d, fontSize: 20, fontWeight: '600', color: theme.colors.ink, marginBottom: 10 },
    instructions: { fontFamily: theme.fonts.s, fontSize: 13, color: theme.colors.ink2, lineHeight: 20, marginBottom: 15 },

    uriText: { fontFamily: theme.fonts.m, fontSize: 11, color: theme.colors.accent },
    helpStep: { fontFamily: theme.fonts.d, fontSize: 16, fontWeight: '700', color: theme.colors.ink, marginTop: 15 },
    helpDesc: { fontFamily: theme.fonts.s, fontSize: 14, color: theme.colors.ink2, marginTop: 4, lineHeight: 20 },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
    periodPickerContainer: { backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg, padding: 24, width: '90%', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 10, elevation: 5 },
    periodPickerTitle: { fontFamily: theme.fonts.d, fontSize: 24, fontWeight: '700', color: theme.colors.ink, marginBottom: 20 },

    label: { fontFamily: theme.fonts.m, fontSize: 11, color: theme.colors.ink3, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8, marginTop: 16 },
    input: {
        backgroundColor: theme.colors.surface2, borderWidth: 1, borderColor: theme.colors.border,
        borderRadius: theme.radii.r, padding: 14, fontFamily: theme.fonts.m, fontSize: 13,
        color: theme.colors.ink, marginBottom: 12
    },

    saveBtn: {
        backgroundColor: '#FFFFFF', padding: 16, borderRadius: theme.radii.r,
        alignItems: 'center', marginTop: 20, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4,
        borderWidth: 1, borderColor: '#000000',
    },
    saveBtnText: { color: '#000000', fontFamily: theme.fonts.s, fontSize: 16, fontWeight: '700' },

    syncBtn: {
        backgroundColor: theme.colors.surface2, borderWidth: 1, borderColor: theme.colors.border,
        padding: 14, borderRadius: theme.radii.r, alignItems: 'center', marginTop: 12,
    },
    syncBtnText: { color: theme.colors.ink, fontFamily: theme.fonts.s, fontSize: 15, fontWeight: '600' },

    googleBtn: {
        backgroundColor: theme.colors.surface2, borderWidth: 1, borderColor: theme.colors.border,
        padding: 14, borderRadius: theme.radii.r, alignItems: 'center', marginTop: 12,
        flexDirection: 'row', justifyContent: 'center', gap: 10,
    },
    googleBtnText: { color: theme.colors.ink, fontFamily: theme.fonts.s, fontSize: 15, fontWeight: '600' },

    logoutBtn: {
        backgroundColor: theme.colors.red + '15', padding: 16, borderRadius: theme.radii.r,
        alignItems: 'center', marginTop: 40, borderWidth: 1, borderColor: theme.colors.red + '30',
    },
    logoutBtnText: { color: theme.colors.red, fontFamily: theme.fonts.s, fontSize: 16, fontWeight: '700' },

    actionBtn: {
        backgroundColor: '#FFFFFF', paddingVertical: 14, paddingHorizontal: 24,
        borderRadius: theme.radii.r, alignItems: 'center', justifyContent: 'center',
        flexDirection: 'row', gap: 10, borderWidth: 1, borderColor: '#000000',
        shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5,
    },
    actionBtnText: { color: '#000000', fontFamily: theme.fonts.s, fontSize: 16, fontWeight: '700' },

    actionBtnLight: {
        backgroundColor: theme.colors.surface2, borderWidth: 1, borderColor: theme.colors.border,
        paddingVertical: 14, paddingHorizontal: 24, borderRadius: theme.radii.r,
        alignItems: 'center', justifyContent: 'center',
    },
    actionBtnLightText: { fontFamily: theme.fonts.s, color: theme.colors.ink, fontSize: 16, fontWeight: '700' },

    progressBarTrack: { height: 4, backgroundColor: theme.colors.border, borderRadius: 2, marginTop: 12, overflow: 'hidden' },
    progressBarFill: { height: 4, width: '60%', backgroundColor: theme.colors.ink, borderRadius: 2 },

    syncBanner: { marginTop: 14, padding: 14, borderRadius: theme.radii.r, borderWidth: 1 },
    syncBannerText: { fontFamily: theme.fonts.s, fontSize: 13, fontWeight: '600', lineHeight: 20 },

    demoRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 20, paddingTop: 18, borderTopWidth: 1, borderTopColor: theme.colors.border },
    demoLabel: { fontFamily: theme.fonts.m, fontSize: 10, color: '#7c3aed', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 3 },
    demoSub: { fontFamily: theme.fonts.m, fontSize: 11, color: theme.colors.ink3, lineHeight: 16 },
});
