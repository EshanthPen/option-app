import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ScrollView, ActivityIndicator, Platform, Modal } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import * as AuthSession from 'expo-auth-session';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabaseClient';
import DistrictPickerModal from '../components/DistrictPickerModal';
import { syncAssignmentsToCalendar } from '../utils/googleCalendarAPI';
import { ChevronDown, RefreshCw, Database, Calendar, BookOpen } from 'lucide-react-native';
import { loadMockGradebookData } from '../utils/mockStudentData';
import ICAL from 'ical.js';
import { useTheme } from '../context/ThemeContext';
import { parseStudentVueGradebook } from '../utils/studentVueParser';
import { getDeviceId } from '../utils/auth';

WebBrowser.maybeCompleteAuthSession();

export default function IntegrationsScreen() {
    const { theme } = useTheme();
    const styles = getStyles(theme);
    const [schoologyUrl, setSchoologyUrl] = useState('');

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

    const [accessToken, setAccessToken] = useState(null);
    const [deviceId, setDeviceId] = useState(null);

    const isWeb = typeof window !== 'undefined' && window.location;
    const redirectUri = isWeb
        ? window.location.origin
        : AuthSession.makeRedirectUri({ useProxy: true });

    const [request, response, promptAsync] = Google.useAuthRequest({
        expoClientId: '983893359997-769avb68kb7a0ieduackj8u393kp8c4k.apps.googleusercontent.com',
        iosClientId: '983893359997-769avb68kb7a0ieduackj8u393kp8c4k.apps.googleusercontent.com',
        androidClientId: '983893359997-769avb68kb7a0ieduackj8u393kp8c4k.apps.googleusercontent.com',
        webClientId: '983893359997-769avb68kb7a0ieduackj8u393kp8c4k.apps.googleusercontent.com',
        scopes: [
            'https://www.googleapis.com/auth/calendar.events',
            'https://www.googleapis.com/auth/userinfo.profile'
        ],
        redirectUri,
    });

    useEffect(() => {
        const loadSettings = async () => {
            let storedToken = await AsyncStorage.getItem('googleAccessToken');
            if (!storedToken && typeof window !== 'undefined') {
                storedToken = window.localStorage.getItem('googleAccessToken');
            }
            if (storedToken) setAccessToken(storedToken);
            const savedSchoology = await AsyncStorage.getItem('schoologyUrl');
            if (savedSchoology) setSchoologyUrl(savedSchoology);
            const savedUser = await AsyncStorage.getItem('svUsername');
            if (savedUser) setSvUser(savedUser);
            const savedPass = await AsyncStorage.getItem('svPassword');
            if (savedPass) setSvPass(savedPass);
        };
        loadSettings();
    }, []);

    useEffect(() => {
        if (typeof window !== 'undefined' && window.location.hash) {
            const hashParams = new URLSearchParams(window.location.hash.substring(1));
            const token = hashParams.get('access_token');
            if (token) {
                setAccessToken(token);
                window.localStorage.setItem('googleAccessToken', token);
                AsyncStorage.setItem('googleAccessToken', token);
                window.history.replaceState(null, '', window.location.pathname);
            }
        }
    }, []);

    useEffect(() => {
        const handleAuthCallback = async (token) => {
            setAccessToken(token);
            if (typeof window !== 'undefined') window.localStorage.setItem('googleAccessToken', token);
            try {
                const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (profileRes.ok) {
                    const profile = await profileRes.json();
                    const name = profile.given_name || profile.name || 'User';
                    await AsyncStorage.setItem('googleUserName', name);
                }
                await AsyncStorage.setItem('googleAccessToken', token);
            } catch (err) {
                console.warn('Failed to save Google Auth:', err);
            }
        };
        if (response?.type === 'success') handleAuthCallback(response.authentication.accessToken);
    }, [response]);

    useEffect(() => {
        const fetchSettings = async () => {
            const id = await getDeviceId();
            setDeviceId(id);
            const { data } = await supabase.from('settings').select('*').eq('user_id', id).single();
            if (data?.schoology_url) setSchoologyUrl(data.schoology_url);
        };
        fetchSettings();
    }, []);

    const handleSchoologySync = async () => {
        if (!schoologyUrl) {
            if (Platform.OS === 'web') window.alert('Please enter your Schoology calendar link first.');
            else Alert.alert('Missing URL', 'Please enter your Schoology calendar link first.');
            return;
        }
        setIsSchoologySyncing(true);
        const input = schoologyUrl.trim();
        const urlRegex = /(?:webcal|https?):\/\/[^\s"'<>]+(?:\.(?:ics|php)[^\s"'<>]*|\/calendar\/feed\/ical\/[^\s"'<>]*)/gi;
        const matches = input.match(urlRegex);
        let cleanUrl = matches ? matches[matches.length - 1] : input;
        if (!cleanUrl.includes('://') && cleanUrl.includes('.ics')) {
            cleanUrl = 'https://' + cleanUrl.split('http').pop().replace(/^\/+/, '');
        }
        let fetchUrl = cleanUrl.replace(/^webcal:\/\//i, 'https://');
        const baseUrl = Platform.OS === 'web' ? window.location.origin : 'http://localhost:8081';
        const proxyUrl = `${baseUrl}/api/schoology?url=${encodeURIComponent(fetchUrl)}`;
        try {
            let icsData = '';
            try {
                const resp = await fetch(proxyUrl);
                if (!resp.ok) { const ej = await resp.json().catch(() => ({})); throw new Error(ej.details || `Proxy returned ${resp.status}`); }
                icsData = await resp.text();
            } catch (proxyErr) {
                const directResponse = await fetch(fetchUrl);
                if (!directResponse.ok) throw new Error(`Direct fetch failed: ${directResponse.status}`);
                icsData = await directResponse.text();
            }
            if (!icsData) throw new Error('Empty response from Schoology.');
            if (icsData.includes('<html') || icsData.includes('<!DOCTYPE html')) throw new Error('Schoology returned a login page instead of calendar data.');
            if (!icsData.includes('BEGIN:VCALENDAR')) throw new Error('Invalid calendar data (missing VCALENDAR).');
            const jcalData = ICAL.parse(icsData);
            const comp = new ICAL.Component(jcalData);
            const events = comp.getAllSubcomponents('vevent');
            const now = new Date();
            const imported = events.map((ve) => {
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
                return { title: ev.summary || 'Untitled', urgency: u, importance: im, duration: 60, due_date: dueDate.toISOString().split('T')[0], source: 'schoology_import', user_id: deviceId };
            }).filter(Boolean);
            if (imported.length > 0) {
                const { error } = await supabase.from('tasks').insert(imported);
                if (error) throw error;
                if (Platform.OS === 'web') window.alert(`Imported ${imported.length} assignments.`);
                else Alert.alert('Sync Complete', `Imported ${imported.length} assignments.`);
            } else {
                if (Platform.OS === 'web') window.alert('No recent assignments found.');
                else Alert.alert('No Assignments', 'No recent assignments found.');
            }
        } catch (err) {
            if (Platform.OS === 'web') window.alert(`Sync failed: ${err.message}`);
            else Alert.alert('Error', `Sync failed: ${err.message}`);
        } finally { setIsSchoologySyncing(false); }
    };

    const handleStudentVueLogin = async () => {
        let baseUrl = '';
        if (selectedDistrict) baseUrl = selectedDistrict.id === 'custom' ? customUrl : selectedDistrict.url;
        if (!baseUrl || !svUser || !svPass) {
            setSyncResult({ type: 'error', message: 'Please select your district and enter credentials.' });
            return;
        }
        setSyncResult(null);
        setIsSyncing(true);
        try {
            await AsyncStorage.setItem('svUsername', svUser);
            await AsyncStorage.setItem('svPassword', svPass);
            await AsyncStorage.setItem('svDistrictUrl', baseUrl);
            const finalTargetUrl = baseUrl.endsWith('Service/PXPCommunication.asmx') ? baseUrl : `${baseUrl}/Service/PXPCommunication.asmx`;
            const soapPayload = `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><ProcessWebServiceRequest xmlns="http://edupoint.com/webservices/"><userID>${svUser.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</userID><password>${svPass.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</password><skipLoginLog>1</skipLoginLog><parent>0</parent><webServiceHandleName>PXPWebServices</webServiceHandleName><methodName>Gradebook</methodName><paramStr>&lt;Parms&gt;&lt;ReportPeriod&gt;0&lt;/ReportPeriod&gt;&lt;/Parms&gt;</paramStr></ProcessWebServiceRequest></soap:Body></soap:Envelope>`;
            const resp = await fetch('/api/studentvue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetUrl: finalTargetUrl, soapPayload }) });
            if (!resp.ok) { const errData = await resp.json().catch(() => ({})); throw new Error(errData?.cause || resp.statusText); }
            const xmlText = await resp.text();
            if (xmlText.includes('Gradebook') || !xmlText.includes('RT_ERROR')) {
                const { classes: formattedClasses, periods } = parseStudentVueGradebook(xmlText);
                if (formattedClasses?.length > 0) {
                    await AsyncStorage.setItem('studentVueGrades', JSON.stringify(formattedClasses));
                    await AsyncStorage.setItem('isDemoData', 'false');
                    if (periods?.length > 0) {
                        await AsyncStorage.setItem('studentVuePeriods', JSON.stringify(periods));
                        const lastPeriod = periods[periods.length - 1];
                        await AsyncStorage.setItem('studentVuePeriodName', lastPeriod.name);
                        await AsyncStorage.setItem('studentVuePeriodIndex', String(lastPeriod.index));
                    }
                    const totalAssignments = formattedClasses.reduce((sum, c) => sum + (c.assignments?.length || 0), 0);
                    setSyncResult({ type: 'success', message: `Imported ${formattedClasses.length} classes with ${totalAssignments} assignments.` });
                } else throw new Error("Connected but couldn't parse classes.");
            } else {
                setSyncResult({ type: 'error', message: 'No grade data found for this period.' });
            }
        } catch (error) {
            setSyncResult({ type: 'error', message: error.message });
        } finally { setIsSyncing(false); }
    };

    const syncGoogleCalendarManual = async () => {
        if (!accessToken) { Alert.alert('Not Linked', 'Sign in with Google first.'); return; }
        setIsSyncing(true);
        try {
            const savedGrades = await AsyncStorage.getItem('studentVueGrades');
            if (!savedGrades) { Alert.alert('No Grade Data', 'Sync with StudentVUE first.'); setIsSyncing(false); return; }
            const formattedClasses = JSON.parse(savedGrades);
            let allAssignments = [];
            for (const course of formattedClasses) {
                if (course.assignments) allAssignments = allAssignments.concat(course.assignments.map(a => ({ ...a, courseName: course.name })));
            }
            if (allAssignments.length > 0) {
                const syncCount = await syncAssignmentsToCalendar(accessToken, allAssignments);
                Alert.alert('Success', `Synced ${syncCount} assignments to Google Calendar.`);
            } else Alert.alert('No Assignments', 'Nothing to sync.');
        } catch (error) { Alert.alert('Error', 'Sync failed: ' + error.message); }
        finally { setIsSyncing(false); }
    };

    return (
        <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
            <View style={styles.headerContainer}>
                <Text style={styles.header}>Integrations</Text>
                <Text style={styles.subtitle}>Connect your school platforms</Text>
            </View>

            {/* StudentVUE */}
            <View style={styles.card}>
                <View style={styles.cardHeader}>
                    <View style={[styles.cardIcon, { backgroundColor: theme.colors.green + '15' }]}>
                        <Database size={18} color={theme.colors.green} strokeWidth={2} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.cardTitle}>StudentVUE</Text>
                        <Text style={styles.cardDesc}>Auto-fetch and calculate grades</Text>
                    </View>
                </View>

                <Text style={styles.label}>School District</Text>
                <TouchableOpacity style={[styles.input, styles.pickerBtn]} onPress={() => setIsPickerVisible(true)}>
                    <Text style={{ fontFamily: theme.fonts.m, fontSize: 13, color: selectedDistrict ? theme.colors.ink : theme.colors.ink3 }}>
                        {selectedDistrict ? selectedDistrict.name : 'Select your school district...'}
                    </Text>
                    <ChevronDown size={16} color={theme.colors.ink3} />
                </TouchableOpacity>

                {selectedDistrict?.id === 'custom' && (
                    <>
                        <Text style={styles.label}>Custom Portal URL</Text>
                        <TextInput style={styles.input} placeholder="e.g. https://rtmsd.usplk12.org" placeholderTextColor={theme.colors.ink3} value={customUrl} onChangeText={setCustomUrl} autoCapitalize="none" />
                    </>
                )}

                <Text style={styles.label}>Username / Student ID</Text>
                <TextInput style={styles.input} placeholder="Student ID" placeholderTextColor={theme.colors.ink3} value={svUser} onChangeText={setSvUser} autoCapitalize="none" />

                <Text style={styles.label}>Password</Text>
                <TextInput style={styles.input} placeholder="Password" placeholderTextColor={theme.colors.ink3} value={svPass} onChangeText={setSvPass} secureTextEntry />

                <TouchableOpacity style={[styles.primaryBtn, isSyncing && { opacity: 0.6 }]} onPress={handleStudentVueLogin} disabled={isSyncing}>
                    {isSyncing ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <ActivityIndicator size="small" color={theme.colors.bg} />
                            <Text style={styles.primaryBtnText}>Importing...</Text>
                        </View>
                    ) : (
                        <Text style={styles.primaryBtnText}>Sync Grades</Text>
                    )}
                </TouchableOpacity>

                {syncResult && (
                    <View style={[styles.banner, { borderColor: syncResult.type === 'success' ? theme.colors.green : theme.colors.red, backgroundColor: syncResult.type === 'success' ? theme.colors.green + '10' : theme.colors.red + '10' }]}>
                        <Text style={[styles.bannerText, { color: syncResult.type === 'success' ? theme.colors.green : theme.colors.red }]}>{syncResult.message}</Text>
                    </View>
                )}

                <View style={styles.divider} />
                <Text style={styles.demoLabel}>Beta Testing</Text>
                <Text style={styles.demoDesc}>Load sample data to test without real credentials.</Text>
                <TouchableOpacity style={[styles.secondaryBtn, { borderColor: theme.colors.purple }]} onPress={async () => {
                    setIsMockLoading(true); setSyncResult(null);
                    try {
                        const { classCount, assignmentCount } = await loadMockGradebookData();
                        setSyncResult({ type: 'success', message: `Demo loaded: ${classCount} classes, ${assignmentCount} assignments` });
                    } catch (e) { setSyncResult({ type: 'error', message: `Failed: ${e.message}` }); }
                    finally { setIsMockLoading(false); }
                }} disabled={isMockLoading}>
                    {isMockLoading ? <ActivityIndicator size="small" color={theme.colors.purple} /> : <Text style={[styles.secondaryBtnText, { color: theme.colors.purple }]}>Load Demo Data</Text>}
                </TouchableOpacity>
            </View>

            {/* Google Calendar */}
            <View style={styles.card}>
                <View style={styles.cardHeader}>
                    <View style={[styles.cardIcon, { backgroundColor: theme.colors.blue + '15' }]}>
                        <Calendar size={18} color={theme.colors.blue} strokeWidth={2} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.cardTitle}>Google Calendar</Text>
                        <Text style={styles.cardDesc}>Sync assignments to your calendar</Text>
                    </View>
                </View>

                <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TouchableOpacity style={[styles.primaryBtn, { flex: 1 }]} onPress={() => promptAsync()} disabled={!request}>
                        <Text style={styles.primaryBtnText}>{accessToken ? 'Re-link Account' : 'Link Google'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.secondaryBtn, { flex: 1 }]} onPress={() => setIsHelpVisible(true)}>
                        <Text style={styles.secondaryBtnText}>Setup Help</Text>
                    </TouchableOpacity>
                </View>

                {accessToken && (
                    <>
                        <View style={[styles.statusChip, { backgroundColor: theme.colors.green + '15' }]}>
                            <Text style={[styles.statusText, { color: theme.colors.green }]}>Account linked</Text>
                        </View>
                        <TouchableOpacity style={styles.secondaryBtn} onPress={syncGoogleCalendarManual} disabled={isSyncing}>
                            {isSyncing ? <ActivityIndicator size="small" color={theme.colors.ink} /> : (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                    <RefreshCw size={14} color={theme.colors.ink} />
                                    <Text style={styles.secondaryBtnText}>Sync Gradebook to Google</Text>
                                </View>
                            )}
                        </TouchableOpacity>
                    </>
                )}
            </View>

            {/* Schoology */}
            <View style={styles.card}>
                <View style={styles.cardHeader}>
                    <View style={[styles.cardIcon, { backgroundColor: theme.colors.orange + '15' }]}>
                        <BookOpen size={18} color={theme.colors.orange} strokeWidth={2} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.cardTitle}>Schoology</Text>
                        <Text style={styles.cardDesc}>Import assignments from calendar feed</Text>
                    </View>
                </View>

                <TextInput style={styles.input} placeholder="webcal://schoology.com/calendar..." placeholderTextColor={theme.colors.ink3} value={schoologyUrl} onChangeText={setSchoologyUrl} autoCapitalize="none" />

                <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TouchableOpacity style={styles.secondaryBtn} onPress={() => {
                        AsyncStorage.setItem('schoologyUrl', schoologyUrl);
                        if (Platform.OS === 'web') window.alert('URL saved.');
                        else Alert.alert('Saved', 'Schoology URL saved.');
                    }}>
                        <Text style={styles.secondaryBtnText}>Save URL</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.primaryBtn, { flex: 1 }]} onPress={handleSchoologySync} disabled={isSchoologySyncing}>
                        {isSchoologySyncing ? <ActivityIndicator size="small" color={theme.colors.bg} /> : (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <RefreshCw size={14} color={theme.colors.bg} />
                                <Text style={styles.primaryBtnText}>Sync Now</Text>
                            </View>
                        )}
                    </TouchableOpacity>
                </View>
            </View>

            {/* Help Modal */}
            <Modal visible={isHelpVisible} transparent animationType="fade" onRequestClose={() => setIsHelpVisible(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalCard}>
                        <Text style={styles.modalTitle}>Google Calendar Setup</Text>
                        <ScrollView style={{ maxHeight: 400 }}>
                            <Text style={styles.helpStep}>1. Google Cloud Console</Text>
                            <Text style={styles.helpDesc}>Create a project and enable "Google Calendar API".</Text>
                            <Text style={styles.helpStep}>2. OAuth Credentials</Text>
                            <Text style={styles.helpDesc}>Create an "OAuth client ID" for Web application.</Text>
                            <Text style={styles.helpStep}>3. Redirect URIs</Text>
                            <Text style={styles.helpDesc}>Add this to Authorized Redirect URIs:</Text>
                            <View style={styles.uriBox}>
                                <Text style={styles.uriText} selectable>{redirectUri}</Text>
                            </View>
                            <Text style={styles.helpStep}>4. Link & Sync</Text>
                            <Text style={styles.helpDesc}>Click "Link Google" and authorize the app.</Text>
                        </ScrollView>
                        <TouchableOpacity style={[styles.primaryBtn, { marginTop: 16 }]} onPress={() => setIsHelpVisible(false)}>
                            <Text style={styles.primaryBtnText}>Got it</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            <DistrictPickerModal visible={isPickerVisible} onClose={() => setIsPickerVisible(false)} onSelect={(d) => setSelectedDistrict(d)} currentSelectionUrl={selectedDistrict?.url} />

            <View style={{ height: 60 }} />
        </ScrollView>
    );
}

const getStyles = (theme) => StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.bg, paddingTop: 40, paddingHorizontal: 20 },
    headerContainer: { marginBottom: 24 },
    header: { fontFamily: theme.fonts.d, fontSize: 32, fontWeight: '700', color: theme.colors.ink, letterSpacing: -0.5 },
    subtitle: { fontFamily: theme.fonts.m, fontSize: 13, color: theme.colors.ink3, marginTop: 4 },

    card: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radii.lg, padding: 20, marginBottom: 16, ...theme.shadows.sm },
    cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
    cardIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    cardTitle: { fontFamily: theme.fonts.s, fontSize: 16, fontWeight: '600', color: theme.colors.ink },
    cardDesc: { fontFamily: theme.fonts.m, fontSize: 12, color: theme.colors.ink3, marginTop: 2 },

    label: { fontFamily: theme.fonts.m, fontSize: 11, color: theme.colors.ink3, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6, marginTop: 12 },
    input: { backgroundColor: theme.colors.surface2, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radii.r, padding: 12, fontFamily: theme.fonts.m, fontSize: 13, color: theme.colors.ink, marginBottom: 10 },
    pickerBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },

    primaryBtn: { backgroundColor: theme.colors.ink, borderRadius: theme.radii.r, paddingVertical: 12, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', marginTop: 8, ...theme.shadows.sm },
    primaryBtnText: { fontFamily: theme.fonts.s, fontSize: 14, fontWeight: '600', color: theme.colors.bg },
    secondaryBtn: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radii.r, paddingVertical: 12, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
    secondaryBtnText: { fontFamily: theme.fonts.s, fontSize: 14, fontWeight: '600', color: theme.colors.ink },

    statusChip: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: theme.radii.round, marginTop: 10, marginBottom: 4 },
    statusText: { fontFamily: theme.fonts.m, fontSize: 12, fontWeight: '600' },

    banner: { marginTop: 12, padding: 12, borderRadius: theme.radii.r, borderWidth: 1 },
    bannerText: { fontFamily: theme.fonts.m, fontSize: 13, fontWeight: '600', lineHeight: 18 },

    divider: { height: 1, backgroundColor: theme.colors.border, marginVertical: 16 },
    demoLabel: { fontFamily: theme.fonts.m, fontSize: 10, color: theme.colors.purple, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 },
    demoDesc: { fontFamily: theme.fonts.m, fontSize: 12, color: theme.colors.ink3, lineHeight: 16, marginBottom: 4 },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
    modalCard: { backgroundColor: theme.colors.surface, borderRadius: theme.radii.xl, padding: 24, width: '90%', maxWidth: 420, ...theme.shadows.lg },
    modalTitle: { fontFamily: theme.fonts.d, fontSize: 22, fontWeight: '700', color: theme.colors.ink, marginBottom: 16 },
    helpStep: { fontFamily: theme.fonts.s, fontSize: 14, fontWeight: '600', color: theme.colors.ink, marginTop: 14 },
    helpDesc: { fontFamily: theme.fonts.m, fontSize: 13, color: theme.colors.ink3, marginTop: 4, lineHeight: 18 },
    uriBox: { backgroundColor: theme.colors.surface2, borderRadius: theme.radii.r, padding: 10, marginTop: 8 },
    uriText: { fontFamily: theme.fonts.mono, fontSize: 11, color: theme.colors.accent },
});
