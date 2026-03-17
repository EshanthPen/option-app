import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ScrollView, ActivityIndicator, Platform, Modal, Image } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import * as AuthSession from 'expo-auth-session';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabaseClient';
import { syncStudentVueGrades } from '../utils/studentVueAPI';
import { theme as staticTheme } from '../utils/theme';
import DistrictPickerModal, { KNOWN_DISTRICTS } from '../components/DistrictPickerModal';
import { syncAssignmentsToCalendar } from '../utils/googleCalendarAPI';
import { ChevronDown, RefreshCw, Moon, Sun, User, Copy, Camera, Bell, BellOff } from 'lucide-react-native';
import { loadMockGradebookData } from '../utils/mockStudentData';
import ICAL from 'ical.js';
import { useTheme } from '../context/ThemeContext';
import { useNavigation } from '@react-navigation/native';
import { parseStudentVueGradebook, parseStudentVuePeriods } from '../utils/studentVueParser';
import { getUserId } from '../utils/auth';
import WorkingHoursGraph from '../components/WorkingHoursGraph';
import { getOrCreateProfile, updateProfile, uploadAvatar, setPresetAvatar, PRESET_AVATARS } from '../utils/profileService';
import { isNotificationsEnabled, setNotificationsEnabled } from '../utils/gradeNotifications';

WebBrowser.maybeCompleteAuthSession();

export default function SettingsScreen() {
    const { theme, toggleTheme, isDarkMode } = useTheme();
    const styles = getStyles(theme);
    const navigation = useNavigation();
    const [schoologyUrl, setSchoologyUrl] = useState('');
    const [googleUrl, setGoogleUrl] = useState('');
    const [userName, setUserName] = useState('');

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

    // Profile & Leaderboard State
    const [profile, setProfile] = useState(null);
    const [schoolName, setSchoolName] = useState('');
    const [friendCode, setFriendCode] = useState('');
    const [showAvatarPicker, setShowAvatarPicker] = useState(false);
    const [gradeNotifs, setGradeNotifs] = useState(false);

    // Working Hours State (7 days. 0=Mon, ..., 6=Sun visually)
    const [smartHours, setSmartHours] = useState({
        0: { start: 15, end: 22 },
        1: { start: 15, end: 22 },
        2: { start: 15, end: 22 },
        3: { start: 15, end: 22 },
        4: { start: 15, end: 22 },
        5: { start: 10, end: 23 },
        6: { start: 10, end: 22 }
    });

    // Auth State
    const [accessToken, setAccessToken] = useState(null);
    const [userId, setUserId] = useState(null);

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
            const uid = await getUserId();
            setUserId(uid);
            
            let storedToken = await AsyncStorage.getItem('googleAccessToken');
            if (!storedToken && typeof window !== 'undefined') {
                storedToken = window.localStorage.getItem('googleAccessToken');
            }
            if (storedToken) setAccessToken(storedToken);

            const savedSchoology = await AsyncStorage.getItem('schoologyUrl');
            if (savedSchoology) setSchoologyUrl(savedSchoology);

            const savedName = await AsyncStorage.getItem('userName');
            if (savedName) setUserName(savedName);

            const savedUser = await AsyncStorage.getItem('svUsername');
            if (savedUser) setSvUser(savedUser);

            const savedPass = await AsyncStorage.getItem('svPassword');
            if (savedPass) setSvPass(savedPass);

            // Load profile data
            try {
                const p = await getOrCreateProfile();
                if (p) {
                    setProfile(p);
                    setSchoolName(p.school_name || '');
                    setFriendCode(p.friend_code || '');
                }
            } catch (err) {
                console.log('Profile load skipped (not authenticated):', err.message);
            }

            // Load notification preference
            const notifsOn = await isNotificationsEnabled();
            setGradeNotifs(notifsOn);

            const savedHours = await AsyncStorage.getItem('smartScheduleHours');
            if (savedHours) {
                try {
                    setSmartHours(JSON.parse(savedHours));
                } catch (e) { console.error("Error parsing smart hours", e); }
            } else {
                // Fallback to legacy single strings if graph data doesn't exist yet
                const oldStart = await AsyncStorage.getItem('workingStartHour');
                const oldEnd = await AsyncStorage.getItem('workingEndHour');
                if (oldStart && oldEnd) {
                    const s = parseInt(oldStart) || 15;
                    const e = parseInt(oldEnd) || 22;
                    setSmartHours({
                        0: { start: s, end: e }, 1: { start: s, end: e },
                        2: { start: s, end: e }, 3: { start: s, end: e },
                        4: { start: s, end: e }, 5: { start: s, end: e },
                        6: { start: s, end: e }
                    });
                }
            }
        };
        loadSettings();
    }, []);

    const handleSaveName = async (name) => {
        setUserName(name);
        await AsyncStorage.setItem('userName', name);
    };

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
        const handleAuthCallback = async (token) => {
            setAccessToken(token);
            if (typeof window !== 'undefined') {
                window.localStorage.setItem('googleAccessToken', token);
            }
            try {
                // Fetch User Profile Name
                const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (profileRes.ok) {
                    const profile = await profileRes.json();
                    const name = profile.given_name || profile.name || 'User';
                    await AsyncStorage.setItem('googleUserName', name);
                }

                await AsyncStorage.setItem('googleAccessToken', token);
                if (typeof window !== 'undefined') window.alert("Success! Successfully linked your Google Account.");
                else Alert.alert("Success", "Successfully linked your Google Account!");
            } catch (err) {
                console.warn('Failed to save Google Auth:', err);
                if (typeof window !== 'undefined') window.alert("Warning: Authentication succeeded but profile save failed.");
            }
        };

        if (response?.type === 'success') {
            handleAuthCallback(response.authentication.accessToken);
        } else if (response?.type === 'error') {
            if (typeof window !== 'undefined') window.alert("Could not sign in right now. Note: Client IDs need to be configured.");
            else Alert.alert("Error", "Could not sign in right now. Note: Client IDs need to be configured.");
        }
    }, [response]);

    useEffect(() => {
        const fetchSettings = async () => {
            const id = await getDeviceId();
            setDeviceId(id);
            const { data, error } = await supabase.from('settings').select('*').eq('user_id', id).single();
            if (data && data.schoology_url) setSchoologyUrl(data.schoology_url);
        };
        fetchSettings();
    }, []);

    const handleSaveSchoology = async () => {
        if (!deviceId) return;
        try {
            const { error } = await supabase.from('settings').upsert({ user_id: deviceId, schoology_url: schoologyUrl }, { onConflict: 'user_id' });
            if (error) throw error;
            if (Platform.OS === 'web') window.alert('Saved: Your Schoology URL has been updated.');
            else Alert.alert('Saved!', 'Your Schoology URL has been updated.');
        } catch (error) {
            if (Platform.OS === 'web') window.alert('Error: Failed to save settings.');
            else Alert.alert('Error', 'Failed to save settings.');
        }
    };

    const handleSaveWorkingHours = async () => {
        try {
            await AsyncStorage.setItem('smartScheduleHours', JSON.stringify(smartHours));
            if (Platform.OS === 'web') window.alert('Saved: Smart Scheduling hours updated.');
            else Alert.alert('Saved!', 'Smart Scheduling hours updated.');
        } catch (error) {
            console.error(error);
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
        // This regex looks for webcal or http(s) links that contain '.ics' OR the schoology /calendar/feed/ format
        const input = schoologyUrl.trim();
        const urlRegex = /(?:webcal|https?):\/\/[^\s"'<>]+(?:\.(?:ics|php)[^\s"'<>]*|\/calendar\/feed\/ical\/[^\s"'<>]*)/gi;
        const matches = input.match(urlRegex);

        let cleanUrl = matches ? matches[matches.length - 1] : input;

        // If it looks like a relative or doubled up path, recover it
        if (!cleanUrl.includes('://') && cleanUrl.includes('.ics')) {
            cleanUrl = 'https://' + cleanUrl.split('http').pop().replace(/^\/+/, '');
        }

        let fetchUrl = cleanUrl.replace(/^webcal:\/\//i, 'https://');

        // Use absolute URL for web environment to ensure proxy is reached correctly
        const baseUrl = Platform.OS === 'web' ? window.location.origin : 'http://localhost:8081';
        const proxyUrl = `${baseUrl}/api/schoology?url=${encodeURIComponent(fetchUrl)}`;

        try {
            let icsData = '';
            let response;
            try {
                response = await fetch(proxyUrl);
                if (!response.ok) {
                    const errorJson = await response.json().catch(() => ({}));
                    throw new Error(errorJson.details || `Proxy returned ${response.status}`);
                }
                icsData = await response.text();
            } catch (proxyErr) {
                console.warn('Proxy fetch failed, trying direct:', proxyErr);
                const directResponse = await fetch(fetchUrl);
                if (!directResponse.ok) throw new Error(`Direct fetch failed: ${directResponse.status}`);
                icsData = await directResponse.text();
            }

            if (!icsData) {
                throw new Error('Received empty response from Schoology.');
            }

            if (icsData.includes('<html') || icsData.includes('<!DOCTYPE html')) {
                let msg = 'Schoology is returning a login page or error page instead of calendar data.\n\n';
                msg += 'Please ensure you copied the "Private Link" URL from Schoology\'s "Calendar Export" settings.';
                throw new Error(msg);
            }

            if (!icsData.includes('BEGIN:VCALENDAR')) {
                throw new Error('The link did not contain valid calendar data (BEGIN:VCALENDAR missing). Ensure this is a Schoology /calendar/feed/... link.');
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
                    due_date: dueDate.toISOString().split('T')[0],
                    source: 'schoology_import',
                    user_id: userId
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
                const { classes: formattedClasses, periods } = parseStudentVueGradebook(xmlText);
                if (formattedClasses && formattedClasses.length > 0) {
                    await AsyncStorage.setItem('studentVueGrades', JSON.stringify(formattedClasses));
                    await AsyncStorage.setItem('isDemoData', 'false');
                    if (periods && periods.length > 0) {
                        await AsyncStorage.setItem('studentVuePeriods', JSON.stringify(periods));
                        // Set current period to index 0 (matching the fetch above)
                        const firstPeriod = periods.find(p => p.index === 0) || periods[0];
                        await AsyncStorage.setItem('studentVuePeriodName', firstPeriod.name);
                        await AsyncStorage.setItem('studentVuePeriodIndex', "0");
                    }

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

    const handleLogout = async () => {
        if (Platform.OS === 'web') {
            const confirmed = window.confirm('Are you sure you want to log out? This will clear all your StudentVUE and Schoology data from this device.');
            if (!confirmed) return;
            await logoutAction();
        } else {
            Alert.alert(
                'Logout',
                'Are you sure you want to log out? This will clear all your StudentVUE and Schoology data from this device.',
                [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Logout', style: 'destructive', onPress: logoutAction }
                ]
            );
        }
    };

    const logoutAction = async () => {
        try {
            await supabase.auth.signOut();
            
            const keysToClear = [
                'svUsername', 'svPassword', 'svDistrictUrl',
                'studentVueGrades', 'studentVuePeriods',
                'studentVuePeriodName', 'studentVuePeriodIndex',
                'isDemoData', 'schoologyUrl', 'userName'
            ];
            for (let i = 0; i < 10; i++) keysToClear.push(`studentVueGradesQ${i}`);
            
            await AsyncStorage.multiRemove(keysToClear);
            
            if (Platform.OS === 'web') window.alert('Logged out successfully.');
            else Alert.alert('Logged Out', 'Your data has been cleared.');
        } catch (e) {
            console.error('Logout error:', e);
        }
    };

    return (
        <ScrollView style={styles.container}>
            <View style={styles.headerContainer}>
                <Text style={styles.header}>Integrations</Text>
                <Text style={styles.subtitle}>Connect outside apps to build your schedule.</Text>
            </View>

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Account</Text>
                <View style={styles.profileCard}>
                    <View style={styles.profileInfo}>
                        <View style={styles.avatar}>
                            <User color="#fff" size={24} />
                        </View>
                        <View>
                            <Text style={styles.profileEmail}>
                                {supabase.auth.getUser()?.email || 'Logged In'}
                            </Text>
                            <Text style={styles.profileStatus}>Personal Account</Text>
                        </View>
                    </View>
                    <TouchableOpacity style={styles.logoutBtn} onPress={logoutAction}>
                        <RefreshCw size={16} color={theme.colors.red} />
                        <Text style={styles.logoutText}>Sign Out</Text>
                    </TouchableOpacity>
                </View>
            </View>

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Profile</Text>
                <View style={[styles.card, { paddingBottom: 16 }]}>
                    {/* Avatar Section */}
                    <View style={{ alignItems: 'center', marginBottom: 16 }}>
                        <TouchableOpacity onPress={() => setShowAvatarPicker(true)} style={{ alignItems: 'center' }}>
                            <View style={{
                                width: 80, height: 80, borderRadius: 40,
                                borderWidth: 3, borderColor: theme.colors.border,
                                backgroundColor: theme.colors.surface2,
                                alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                            }}>
                                {profile?.avatar_url ? (
                                    <Image source={{ uri: profile.avatar_url }} style={{ width: 80, height: 80 }} />
                                ) : profile?.avatar_preset && PRESET_AVATARS[profile.avatar_preset] ? (
                                    <Text style={{ fontSize: 40 }}>{PRESET_AVATARS[profile.avatar_preset].emoji}</Text>
                                ) : (
                                    <User color={theme.colors.ink3} size={32} />
                                )}
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
                                <Camera size={12} color={theme.colors.ink3} />
                                <Text style={{ fontFamily: theme.fonts.m, fontSize: 11, color: theme.colors.ink3 }}>Change Avatar</Text>
                            </View>
                        </TouchableOpacity>
                    </View>

                    <Text style={styles.label}>Display Name</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="What should we call you?"
                        placeholderTextColor={theme.colors.ink3}
                        value={userName}
                        onChangeText={handleSaveName}
                    />

                    <Text style={[styles.label, { marginTop: 12 }]}>School Name</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="e.g. Lincoln High School"
                        placeholderTextColor={theme.colors.ink3}
                        value={schoolName}
                        onChangeText={setSchoolName}
                        onBlur={() => {
                            if (schoolName.trim()) {
                                updateProfile({ school_name: schoolName.trim() });
                            }
                        }}
                    />
                    <Text style={{ fontFamily: theme.fonts.m, fontSize: 9, color: theme.colors.ink4, marginTop: 4 }}>
                        Used for the school leaderboard
                    </Text>

                    {friendCode ? (
                        <View style={{ marginTop: 14, alignItems: 'center' }}>
                            <Text style={{ fontFamily: theme.fonts.m, fontSize: 9, color: theme.colors.ink3, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
                                Your Friend Code
                            </Text>
                            <TouchableOpacity
                                style={{
                                    flexDirection: 'row', alignItems: 'center', gap: 8,
                                    backgroundColor: theme.colors.surface2, borderRadius: theme.radii.r,
                                    paddingVertical: 8, paddingHorizontal: 16,
                                }}
                                onPress={() => {
                                    if (Platform.OS === 'web') {
                                        try { navigator.clipboard.writeText(friendCode); } catch {}
                                        window.alert(`Copied: ${friendCode}`);
                                    } else {
                                        Alert.alert('Copied!', `Your friend code: ${friendCode}`);
                                    }
                                }}
                            >
                                <Text style={{ fontFamily: theme.fonts.d, fontSize: 20, fontWeight: '700', color: theme.colors.ink, letterSpacing: 3 }}>
                                    {friendCode}
                                </Text>
                                <Copy size={14} color={theme.colors.ink} />
                            </TouchableOpacity>
                        </View>
                    ) : null}
                </View>

                {/* Avatar Picker Modal */}
                <Modal visible={showAvatarPicker} transparent animationType="fade">
                    <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
                        <View style={{
                            backgroundColor: theme.colors.surface, borderWidth: 3, borderColor: theme.colors.border,
                            borderRadius: theme.radii.xl, padding: 24, width: '85%', maxWidth: 360,
                            shadowColor: theme.colors.border, shadowOffset: { width: 6, height: 6 }, shadowOpacity: 1, shadowRadius: 0,
                        }}>
                            <Text style={{ fontFamily: theme.fonts.d, fontSize: 22, fontWeight: '700', color: theme.colors.ink, marginBottom: 16 }}>
                                Choose Avatar
                            </Text>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
                                {Object.entries(PRESET_AVATARS).map(([key, { emoji, label }]) => (
                                    <TouchableOpacity
                                        key={key}
                                        style={{
                                            width: 60, height: 60, borderRadius: 30,
                                            borderWidth: 2,
                                            borderColor: profile?.avatar_preset === key ? theme.colors.ink : theme.colors.surface2,
                                            backgroundColor: profile?.avatar_preset === key ? theme.colors.surface2 : theme.colors.surface,
                                            alignItems: 'center', justifyContent: 'center',
                                        }}
                                        onPress={async () => {
                                            const updated = await setPresetAvatar(key);
                                            if (updated) setProfile(updated);
                                            setShowAvatarPicker(false);
                                        }}
                                    >
                                        <Text style={{ fontSize: 28 }}>{emoji}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                            <TouchableOpacity
                                style={{ marginTop: 16, alignItems: 'center', paddingVertical: 10, borderWidth: 2, borderColor: theme.colors.border, borderRadius: theme.radii.r }}
                                onPress={() => setShowAvatarPicker(false)}
                            >
                                <Text style={{ fontFamily: theme.fonts.b, fontSize: 14, color: theme.colors.ink }}>Cancel</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </Modal>

                {/* Grade Notifications Toggle */}
                <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Notifications</Text>
                <TouchableOpacity
                    style={styles.settingRow}
                    onPress={async () => {
                        const newVal = !gradeNotifs;
                        setGradeNotifs(newVal);
                        await setNotificationsEnabled(newVal);
                    }}
                    activeOpacity={0.7}
                >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        <View style={[styles.iconBox, { backgroundColor: theme.colors.surface2 }]}>
                            {gradeNotifs ? <Bell size={20} color={theme.colors.ink} /> : <BellOff size={20} color={theme.colors.ink3} />}
                        </View>
                        <View>
                            <Text style={styles.settingLabel}>Grade Notifications</Text>
                            <Text style={styles.settingSub}>{gradeNotifs ? 'Enabled' : 'Disabled'} - alerts for new grades</Text>
                        </View>
                    </View>
                    <View style={[styles.toggleContainer, gradeNotifs && { backgroundColor: theme.colors.accent }]}>
                        <View style={[styles.toggleCircle, gradeNotifs && { transform: [{ translateX: 20 }] }]} />
                    </View>
                </TouchableOpacity>

                <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Appearance</Text>
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

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Smart Scheduling</Text>
                <Text style={styles.instructions}>Drag the nodes to define your available working hours per day. The AI Scheduler will only place tasks between the green (Start) and blue (End) lines.</Text>

                <View style={{ marginTop: 20, marginBottom: 10 }}>
                    <WorkingHoursGraph
                        data={smartHours}
                        onChange={setSmartHours}
                        theme={theme}
                    />
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 20 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: theme.colors.green }} />
                        <Text style={{ fontFamily: theme.fonts.m, fontSize: 12, color: theme.colors.ink3 }}>Start Time</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: theme.colors.blue }} />
                        <Text style={{ fontFamily: theme.fonts.m, fontSize: 12, color: theme.colors.ink3 }}>End Time</Text>
                    </View>
                </View>

                <TouchableOpacity style={[styles.actionBtn, { marginTop: 15 }]} onPress={handleSaveWorkingHours}>
                    <Text style={styles.actionBtnText}>Save Hours</Text>
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
    settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: theme.colors.surface, padding: 16, borderRadius: theme.radii.lg, borderWidth: 2, borderColor: theme.colors.border, shadowColor: theme.colors.border, shadowOffset: { width: 4, height: 4 }, shadowOpacity: 1, shadowRadius: 0, elevation: 4 },
    iconBox: { width: 40, height: 40, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
    settingLabel: { fontFamily: theme.fonts.s, fontSize: 16, fontWeight: '600', color: theme.colors.ink },
    settingSub: { fontFamily: theme.fonts.s, fontSize: 13, color: theme.colors.ink3, marginTop: 2 },
    toggleContainer: { width: 44, height: 24, borderRadius: 12, backgroundColor: theme.colors.surface2, padding: 2, justifyContent: 'center' },
    toggleCircle: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 2, elevation: 1 },

    profileCard: {
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.lg,
        padding: 20,
        borderWidth: 2,
        borderColor: theme.colors.border,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        shadowColor: theme.colors.border,
        shadowOffset: { width: 4, height: 4 },
        shadowOpacity: 1,
        shadowRadius: 0,
        elevation: 4,
        marginBottom: 10,
    },
    profileInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    avatar: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: theme.colors.accent,
        justifyContent: 'center',
        alignItems: 'center',
    },
    profileEmail: {
        fontFamily: theme.fonts.s,
        fontSize: 16,
        fontWeight: '700',
        color: theme.colors.ink,
    },
    profileStatus: {
        fontFamily: theme.fonts.m,
        fontSize: 12,
        color: theme.colors.ink3,
        textTransform: 'uppercase',
    },
    logoutBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 8,
        backgroundColor: theme.colors.red + '15',
    },
    logoutText: {
        fontFamily: theme.fonts.b,
        fontSize: 14,
        color: theme.colors.red,
        fontWeight: '700',
    },
    card: {
        backgroundColor: theme.colors.surface, borderWidth: 2, borderColor: theme.colors.border,
        borderRadius: theme.radii.lg, padding: 24, marginBottom: 20, shadowColor: theme.colors.border, shadowOffset: { width: 4, height: 4 }, shadowOpacity: 1, shadowRadius: 0, elevation: 4
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
        backgroundColor: theme.colors.surface2, borderWidth: 2, borderColor: theme.colors.border,
        borderRadius: theme.radii.r, padding: 14, fontFamily: theme.fonts.m, fontSize: 13,
        color: theme.colors.ink, marginBottom: 12, shadowColor: theme.colors.border, shadowOffset: { width: 3, height: 3 }, shadowOpacity: 1, shadowRadius: 0, elevation: 3
    },

    saveBtn: {
        backgroundColor: theme.colors.accent, padding: 16, borderRadius: theme.radii.r,
        alignItems: 'center', marginTop: 20, shadowColor: theme.colors.border, shadowOpacity: 1, shadowOffset: { width: 4, height: 4 }, shadowRadius: 0, elevation: 4,
        borderWidth: 2, borderColor: theme.colors.border,
    },
    saveBtnText: { color: '#000000', fontFamily: theme.fonts.b, fontSize: 20, letterSpacing: 1 },

    syncBtn: {
        backgroundColor: theme.colors.surface2, borderWidth: 1, borderColor: theme.colors.border,
        padding: 14, borderRadius: theme.radii.r, alignItems: 'center', marginTop: 12,
    },
    syncBtnText: { color: theme.colors.ink, fontFamily: theme.fonts.b, fontSize: 18, letterSpacing: 1 },

    googleBtn: {
        backgroundColor: theme.colors.surface2, borderWidth: 1, borderColor: theme.colors.border,
        padding: 14, borderRadius: theme.radii.r, alignItems: 'center', marginTop: 12,
        flexDirection: 'row', justifyContent: 'center', gap: 10,
    },
    googleBtnText: { color: theme.colors.ink, fontFamily: theme.fonts.b, fontSize: 18, letterSpacing: 1 },

    logoutBtn: {
        backgroundColor: theme.colors.red + '15', padding: 16, borderRadius: theme.radii.r,
        alignItems: 'center', marginTop: 40, borderWidth: 1, borderColor: theme.colors.red + '30',
    },
    logoutBtnText: { color: theme.colors.red, fontFamily: theme.fonts.b, fontSize: 20, letterSpacing: 1 },

    actionBtn: {
        backgroundColor: theme.colors.ink, paddingVertical: 14, paddingHorizontal: 24,
        borderRadius: theme.radii.r, alignItems: 'center', justifyContent: 'center',
        flexDirection: 'row', gap: 10, borderWidth: 2, borderColor: theme.colors.border,
        shadowColor: theme.colors.border, shadowOpacity: 1, shadowOffset: { width: 4, height: 4 }, shadowRadius: 0, elevation: 4,
    },
    actionBtnText: { color: theme.colors.bg, fontFamily: theme.fonts.b, fontSize: 18, letterSpacing: 1 },

    actionBtnLight: {
        backgroundColor: theme.colors.surface2, borderWidth: 2, borderColor: theme.colors.border,
        paddingVertical: 14, paddingHorizontal: 24, borderRadius: theme.radii.r,
        alignItems: 'center', justifyContent: 'center', shadowColor: theme.colors.border, shadowOffset: { width: 4, height: 4 }, shadowOpacity: 1, shadowRadius: 0, elevation: 4
    },
    actionBtnLightText: { fontFamily: theme.fonts.b, color: theme.colors.ink, fontSize: 18, letterSpacing: 1 },

    progressBarTrack: { height: 4, backgroundColor: theme.colors.border, borderRadius: 2, marginTop: 12, overflow: 'hidden' },
    progressBarFill: { height: 4, width: '60%', backgroundColor: theme.colors.ink, borderRadius: 2 },

    syncBanner: { marginTop: 14, padding: 14, borderRadius: theme.radii.r, borderWidth: 1 },
    syncBannerText: { fontFamily: theme.fonts.s, fontSize: 13, fontWeight: '600', lineHeight: 20 },

    demoRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 20, paddingTop: 18, borderTopWidth: 1, borderTopColor: theme.colors.border },
    demoLabel: { fontFamily: theme.fonts.m, fontSize: 10, color: '#7c3aed', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 3 },
    demoSub: { fontFamily: theme.fonts.m, fontSize: 11, color: theme.colors.ink3, lineHeight: 16 },
});
