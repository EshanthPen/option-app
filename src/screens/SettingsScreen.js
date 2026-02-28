import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ScrollView, ActivityIndicator } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import * as AuthSession from 'expo-auth-session';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabaseClient';
import { syncStudentVueGrades } from '../utils/studentVueAPI';
import { theme } from '../utils/theme';
import DistrictPickerModal, { KNOWN_DISTRICTS } from '../components/DistrictPickerModal';
import { syncAssignmentsToCalendar } from '../utils/googleCalendarAPI';
import { ChevronDown, RefreshCw } from 'lucide-react-native';
import { loadMockGradebookData } from '../utils/mockStudentData';
import ICAL from 'ical.js';

WebBrowser.maybeCompleteAuthSession();

export default function SettingsScreen() {
    const [schoologyUrl, setSchoologyUrl] = useState('');
    const [googleUrl, setGoogleUrl] = useState('');

    // StudentVUE State
    const [svUser, setSvUser] = useState('');
    const [svPass, setSvPass] = useState('');
    const [selectedDistrict, setSelectedDistrict] = useState(null);
    const [customUrl, setCustomUrl] = useState('');
    const [isPickerVisible, setIsPickerVisible] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState(null); // { type: 'success'|'error', message: string }
    const [isMockLoading, setIsMockLoading] = useState(false);
    const [isSchoologySyncing, setIsSchoologySyncing] = useState(false);

    // Auth State
    const [accessToken, setAccessToken] = useState(null);

    const isWeb = typeof window !== 'undefined' && window.location;

    // For Web, we MUST use the exact window location origin without any proxies,
    // otherwise the OAuth return redirect drops the hook state.
    const redirectUri = isWeb
        ? window.location.origin
        : AuthSession.makeRedirectUri({ useProxy: true });

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

    // MANUAL WEB FALLBACK
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
            Alert.alert('Missing URL', 'Please enter your Schoology calendar link first.');
            return;
        }
        setIsSchoologySyncing(true);
        let fetchUrl = schoologyUrl.trim().replace(/^webcal:\/\//, 'https://');
        try {
            const response = await fetch(fetchUrl);
            if (!response.ok) throw new Error('Network response was not ok');
            const icsData = await response.text();
            const comp = new ICAL.Component(ICAL.parse(icsData));
            const events = comp.getAllSubcomponents('vevent');

            const now = new Date();
            const imported = events.map((ve, idx) => {
                const ev = new ICAL.Event(ve);
                const tl = ev.summary.toLowerCase();
                const desc = (ev.description || '').toLowerCase();
                const dueDate = ev.startDate ? ev.startDate.toJSDate() : new Date();

                if (desc.includes('completed') || desc.includes('submitted') || dueDate < now) return null;

                const diffDays = (dueDate - now) / (1000 * 60 * 60 * 24);
                const u = diffDays <= 7 ? 9 : 5;

                let points = 0;
                const ptsMatch = desc.match(/(\d+)\s*pts/) || tl.match(/(\d+)\s*pts/);
                if (ptsMatch) points = parseInt(ptsMatch[1]);

                let im = points > 50 ? 10 : points > 20 ? 8 : 5;
                if (tl.includes('test') || tl.includes('exam') || tl.includes('quiz')) im = Math.max(im, 9);
                if (tl.includes('project') || tl.includes('essay')) im = Math.max(im, 8);

                return {
                    title: ev.summary,
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
            }

            if (Platform.OS === 'web') window.alert(`Sync Complete: Imported ${imported.length} upcoming assignments.`);
            else Alert.alert('Sync Complete', `Imported ${imported.length} upcoming assignments.`);
        } catch (err) {
            console.error(err);
            if (Platform.OS === 'web') window.alert('Error: Failed to fetch Schoology calendar.');
            else Alert.alert('Error', 'Failed to fetch Schoology calendar.');
        } finally {
            setIsSchoologySyncing(false);
        }
    };

    const handleStudentVueLogin = async () => {
        let finalUrl = '';
        if (selectedDistrict) {
            finalUrl = selectedDistrict.id === 'custom' ? customUrl : selectedDistrict.url;
        }

        if (!finalUrl || !svUser || !svPass) {
            setSyncResult({ type: 'error', message: 'Please select your school district and enter your username and password.' });
            return;
        }

        setSyncResult(null);
        setIsSyncing(true);

        try {
            // Persist credentials so GradebookScreen can re-sync by quarter independently
            await AsyncStorage.setItem('svUsername', svUser);
            await AsyncStorage.setItem('svPassword', svPass);
            await AsyncStorage.setItem('svDistrictUrl', finalUrl);

            const result = await syncStudentVueGrades(svUser, svPass, finalUrl);

            // Handle both old (array) and new ({ grades, periods, period, periodIndex }) shapes
            const formattedClasses = Array.isArray(result) ? result : (result.grades || []);
            const periods = result.periods || [];
            const periodName = result.period || '';
            const periodIndex = result.periodIndex ?? 0;

            if (formattedClasses && formattedClasses.length > 0) {
                await AsyncStorage.setItem('studentVueGrades', JSON.stringify(formattedClasses));
                if (periods.length > 0) await AsyncStorage.setItem('studentVuePeriods', JSON.stringify(periods));
                if (periodName) await AsyncStorage.setItem('studentVuePeriodName', periodName);
                await AsyncStorage.setItem('studentVuePeriodIndex', String(periodIndex));

                // Count total assignments imported
                const totalAssignments = formattedClasses.reduce((sum, c) => sum + (c.assignments?.length || 0), 0);

                let calendarMsg = '';
                if (accessToken) {
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
                        if (syncCount > 0) calendarMsg = ` ${syncCount} synced to Google Calendar.`;
                    }
                }

                const periodMsg = periodName ? ` for ${periodName}` : '';
                setSyncResult({
                    type: 'success',
                    message: `✅ Imported ${formattedClasses.length} classes with ${totalAssignments} assignments${periodMsg}.${calendarMsg}`,
                    detail: periods.length > 1 ? `${periods.length} grading periods available — use the Gradebook tab to switch quarters.` : null,
                });
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

            {/* --- GOOGLE LOGIN --- */}
            <View style={[styles.card, { borderColor: theme.colors.blue, borderWidth: 2 }]}>
                <Text style={styles.cardTitle}>Google Accounts</Text>
                <Text style={styles.instructions}>
                    Sign in with Google to allow Option to automatically read your free time and insert task blocks into your calendar.
                </Text>

                {accessToken ? (
                    <View>
                        <Text style={{ fontFamily: theme.fonts.s, color: theme.colors.green, fontWeight: '600', marginBottom: 15 }}>✅ Account Linked</Text>
                        <TouchableOpacity style={styles.actionBtn} onPress={blockOutTimeOnGoogleCalendar}>
                            <Text style={styles.actionBtnText}>Test: Block 1 Hour Now</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <TouchableOpacity
                        style={[styles.googleBtn, !request && { opacity: 0.5 }]}
                        disabled={!request}
                        onPress={() => {
                            if (request) promptAsync();
                            else if (typeof window !== 'undefined') window.alert("Still loading authentication flow. Please wait a second and try again.");
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
                    placeholderTextColor={theme.colors.ink3}
                    value={schoologyUrl}
                    onChangeText={setSchoologyUrl}
                    autoCapitalize="none"
                />
                <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TouchableOpacity style={[styles.actionBtn, { flex: 1, backgroundColor: theme.colors.surface2, borderWidth: 1, borderColor: theme.colors.border2 }]} onPress={handleSaveSchoology}>
                        <Text style={[styles.actionBtnText, { color: theme.colors.ink2 }]}>Save URL</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.actionBtn, { flex: 1, backgroundColor: theme.colors.ink }]} onPress={handleSchoologySync} disabled={isSchoologySyncing}>
                        {isSchoologySyncing ? <ActivityIndicator size="small" color="#fff" /> : (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <RefreshCw size={14} color="#fff" />
                                <Text style={styles.actionBtnText}>Sync Now</Text>
                            </View>
                        )}
                    </TouchableOpacity>
                </View>
            </View>

            {/* --- STUDENTVUE / SYNERGY --- */}
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

                {/* Sync button with loading state */}
                <TouchableOpacity
                    style={[
                        styles.actionBtn,
                        { backgroundColor: isSyncing ? theme.colors.ink3 : theme.colors.ink, marginTop: 15 },
                    ]}
                    onPress={handleStudentVueLogin}
                    disabled={isSyncing}
                >
                    {isSyncing ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <ActivityIndicator size="small" color="#fff" />
                            <Text style={styles.actionBtnText}>Importing grades…</Text>
                        </View>
                    ) : (
                        <Text style={styles.actionBtnText}>Sync Grades Now</Text>
                    )}
                </TouchableOpacity>

                {/* Progress bar shown while syncing */}
                {isSyncing && (
                    <View style={styles.progressBarTrack}>
                        <View style={styles.progressBarFill} />
                    </View>
                )}

                {/* In-screen result banner */}
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
                        {syncResult.detail ? (
                            <Text style={[styles.syncBannerDetail, { color: syncResult.type === 'success' ? '#166534' : '#991b1b' }]}>
                                {syncResult.detail}
                            </Text>
                        ) : null}
                    </View>
                )}

                {/* Beta: Demo data loader */}
                <View style={styles.demoRow}>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.demoLabel}>Beta Testing</Text>
                        <Text style={styles.demoSub}>Load fake student data to test the Gradebook &amp; Calendar without real credentials.</Text>
                    </View>
                </View>
                <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: '#7c3aed', marginTop: 6 }]}
                    onPress={async () => {
                        setIsMockLoading(true);
                        setSyncResult(null);
                        try {
                            const { classCount, assignmentCount } = await loadMockGradebookData();
                            setSyncResult({
                                type: 'success',
                                message: `🎓 Demo data loaded! ${classCount} classes · ${assignmentCount} assignments`,
                                detail: 'Open the Gradebook tab to explore. Quarter picker will show Q1–Q4.',
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
                            <ActivityIndicator size="small" color="#fff" />
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

        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.bg, paddingTop: 40, paddingHorizontal: 20 },
    headerContainer: { marginBottom: 30 },
    header: { fontFamily: theme.fonts.d, fontSize: 36, fontWeight: '700', color: theme.colors.ink, letterSpacing: -0.5 },
    subtitle: { fontFamily: theme.fonts.m, fontSize: 13, color: theme.colors.ink3, marginTop: 5 },

    card: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radii.lg, padding: 24, marginBottom: 20 },
    cardTitle: { fontFamily: theme.fonts.d, fontSize: 20, fontWeight: '600', color: theme.colors.ink, marginBottom: 10 },
    instructions: { fontFamily: theme.fonts.s, fontSize: 13, color: theme.colors.ink2, lineHeight: 20, marginBottom: 15 },

    label: { fontFamily: theme.fonts.m, fontSize: 10, color: theme.colors.ink3, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 5 },
    input: { backgroundColor: theme.colors.surface2, borderWidth: 1, borderColor: theme.colors.border, padding: 12, borderRadius: theme.radii.r, fontFamily: theme.fonts.m, fontSize: 12, color: theme.colors.ink, marginBottom: 15 },

    saveButton: { backgroundColor: theme.colors.surface2, borderWidth: 1, borderColor: theme.colors.border2, padding: 15, borderRadius: theme.radii.lg, alignItems: 'center', marginTop: 10, marginBottom: 60 },
    saveButtonText: { fontFamily: theme.fonts.s, color: theme.colors.ink2, fontSize: 15, fontWeight: '600' },

    googleBtn: { backgroundColor: theme.colors.blue, padding: 14, borderRadius: theme.radii.r, alignItems: 'center' },
    googleBtnText: { fontFamily: theme.fonts.s, color: '#fff', fontSize: 15, fontWeight: '600' },

    actionBtn: { padding: 14, borderRadius: theme.radii.r, alignItems: 'center' },
    actionBtnText: { fontFamily: theme.fonts.s, color: '#fff', fontSize: 15, fontWeight: '600' },

    // Loading bar
    progressBarTrack: { height: 4, backgroundColor: theme.colors.border, borderRadius: 2, marginTop: 12, overflow: 'hidden' },
    progressBarFill: { height: 4, width: '60%', backgroundColor: theme.colors.ink, borderRadius: 2 },

    // Result banner
    syncBanner: { marginTop: 14, padding: 14, borderRadius: theme.radii.r, borderWidth: 1 },
    syncBannerText: { fontFamily: theme.fonts.s, fontSize: 13, fontWeight: '600', lineHeight: 20 },
    syncBannerDetail: { fontFamily: theme.fonts.m, fontSize: 11, marginTop: 4, opacity: 0.8 },

    // Demo / beta testing row
    demoRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 20, paddingTop: 18, borderTopWidth: 1, borderTopColor: theme.colors.border },
    demoLabel: { fontFamily: theme.fonts.m, fontSize: 10, color: '#7c3aed', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 3 },
    demoSub: { fontFamily: theme.fonts.m, fontSize: 11, color: theme.colors.ink3, lineHeight: 16 },
});
