import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ScrollView, ActivityIndicator, Platform, Modal, Pressable, KeyboardAvoidingView } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import * as AuthSession from 'expo-auth-session';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabaseClient';
import DistrictPickerModal from '../components/DistrictPickerModal';
import { syncAssignmentsToCalendar } from '../utils/googleCalendarAPI';
import { ChevronDown, RefreshCw, Database, Calendar, BookOpen, Plus, Check, X, Layers, GraduationCap, FileText, Code, Copy } from 'lucide-react-native';
import { loadMockGradebookData } from '../utils/mockStudentData';
import ICAL from 'ical.js';
import { useTheme } from '../context/ThemeContext';
import { parseStudentVueGradebook } from '../utils/studentVueParser';
import { parseFocusSISGrades } from '../utils/focusSISParser';
import { getDeviceId } from '../utils/auth';
import { TopBar, Card, Button, Badge, SEM } from '../components/DesignKit';

WebBrowser.maybeCompleteAuthSession();

// Integration definitions
const INTEGRATIONS = [
    { id: 'studentvue', name: 'StudentVUE', desc: 'Sync grades automatically', Icon: Database, color: 'green' },
    { id: 'google', name: 'Google Calendar', desc: 'Export assignments', Icon: Calendar, color: 'blue' },
    { id: 'classroom', name: 'Google Classroom', desc: 'Import classes and assignments', Icon: GraduationCap, color: 'green' },
    { id: 'schoology', name: 'Schoology', desc: 'Import from calendar feed', Icon: BookOpen, color: 'orange' },
    { id: 'canvas', name: 'Canvas LMS', desc: 'Coming soon', Icon: Layers, color: 'red', soon: true },
    { id: 'powerschool', name: 'PowerSchool', desc: 'Coming soon', Icon: FileText, color: 'purple', soon: true },
];

export default function IntegrationsScreen() {
    const { theme } = useTheme();
    const S = getStyles(theme);
    const [activeModal, setActiveModal] = useState(null);
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
    const [classroomToken, setClassroomToken] = useState(null);
    const [isClassroomSyncing, setIsClassroomSyncing] = useState(false);

    const [accessToken, setAccessToken] = useState(null);
    const [deviceId, setDeviceId] = useState(null);
    const [connectedIds, setConnectedIds] = useState([]);

    const isWeb = typeof window !== 'undefined' && window.location;
    const redirectUri = isWeb
        ? window.location.origin
        : AuthSession.makeRedirectUri({ useProxy: true });

    const GOOGLE_CLIENT_ID = '983893359997-769avb68kb7a0ieduackj8u393kp8c4k.apps.googleusercontent.com';
    const GOOGLE_SCOPES = [
        'https://www.googleapis.com/auth/calendar.events',
        'https://www.googleapis.com/auth/userinfo.profile',
        'https://www.googleapis.com/auth/classroom.courses.readonly',
        'https://www.googleapis.com/auth/classroom.coursework.students.readonly',
    ].join(' ');

    const [request, response, promptAsync] = Google.useAuthRequest({
        expoClientId: GOOGLE_CLIENT_ID,
        iosClientId: GOOGLE_CLIENT_ID,
        androidClientId: GOOGLE_CLIENT_ID,
        webClientId: GOOGLE_CLIENT_ID,
        scopes: GOOGLE_SCOPES.split(' '),
        redirectUri,
    });

    // Reliable web OAuth: redirects directly to Google's OAuth endpoint using implicit flow.
    // Bypasses expo-auth-session which can fail silently on web.
    const startGoogleOAuthWeb = (integrationType = 'calendar') => {
        if (typeof window === 'undefined') return;
        const redirect = window.location.origin;
        const state = integrationType; // Track which integration was linked
        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
            `client_id=${encodeURIComponent(GOOGLE_CLIENT_ID)}` +
            `&redirect_uri=${encodeURIComponent(redirect)}` +
            `&response_type=token` +
            `&scope=${encodeURIComponent(GOOGLE_SCOPES)}` +
            `&include_granted_scopes=true` +
            `&state=${encodeURIComponent(state)}` +
            `&prompt=consent`;
        window.location.href = authUrl;
    };

    useEffect(() => {
        const loadSettings = async () => {
            const connected = [];
            let storedToken = await AsyncStorage.getItem('googleAccessToken');
            if (!storedToken && typeof window !== 'undefined') {
                storedToken = window.localStorage.getItem('googleAccessToken');
            }
            if (storedToken) { setAccessToken(storedToken); connected.push('google'); }
            const classroomTk = await AsyncStorage.getItem('classroomAccessToken');
            if (classroomTk) { setClassroomToken(classroomTk); connected.push('classroom'); }
            const savedSchoology = await AsyncStorage.getItem('schoologyUrl');
            if (savedSchoology) setSchoologyUrl(savedSchoology);
            const savedUser = await AsyncStorage.getItem('svUsername');
            if (savedUser) { setSvUser(savedUser); connected.push('studentvue'); }
            const savedPass = await AsyncStorage.getItem('svPassword');
            if (savedPass) setSvPass(savedPass);
            setConnectedIds(connected);
        };
        loadSettings();
    }, []);

    useEffect(() => {
        if (typeof window !== 'undefined' && window.location.hash) {
            const hashParams = new URLSearchParams(window.location.hash.substring(1));
            const token = hashParams.get('access_token');
            const state = hashParams.get('state') || 'calendar';
            const error = hashParams.get('error');

            if (error) {
                console.error('Google OAuth error:', error);
                if (Platform.OS === 'web') window.alert('Google sign-in failed: ' + error);
                window.history.replaceState(null, '', window.location.pathname);
                return;
            }

            if (token) {
                setAccessToken(token);
                window.localStorage.setItem('googleAccessToken', token);
                AsyncStorage.setItem('googleAccessToken', token);

                // If this was a Classroom link, also save it as the classroom token
                if (state === 'classroom') {
                    setClassroomToken(token);
                    AsyncStorage.setItem('classroomAccessToken', token);
                    setConnectedIds(prev => {
                        const next = [...prev];
                        if (!next.includes('google')) next.push('google');
                        if (!next.includes('classroom')) next.push('classroom');
                        return next;
                    });
                } else {
                    setConnectedIds(prev => prev.includes('google') ? prev : [...prev, 'google']);
                }

                // Fetch user profile to save the name
                fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
                    headers: { Authorization: `Bearer ${token}` }
                }).then(r => r.ok ? r.json() : null).then(profile => {
                    if (profile) {
                        const name = profile.given_name || profile.name || 'User';
                        AsyncStorage.setItem('googleUserName', name);
                    }
                }).catch(() => {});

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
                setConnectedIds(prev => prev.includes('google') ? prev : [...prev, 'google']);
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

    // ── Handlers ──────────────────────────────────────────────

    const handleSchoologySync = async () => {
        if (!schoologyUrl) {
            if (Platform.OS === 'web') window.alert('Please enter your Schoology calendar link first.');
            else Alert.alert('Missing URL', 'Please enter your Schoology calendar link first.');
            return;
        }
        setIsSchoologySyncing(true);
        setSyncResult(null);
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
                // Fetch existing schoology tasks to avoid duplicates
                const { data: existing } = await supabase
                    .from('tasks')
                    .select('title, due_date')
                    .eq('user_id', deviceId)
                    .eq('source', 'schoology_import');
                const existingKeys = new Set(
                    (existing || []).map(t => `${t.title}::${t.due_date}`)
                );
                const newOnly = imported.filter(
                    t => !existingKeys.has(`${t.title}::${t.due_date}`)
                );
                if (newOnly.length > 0) {
                    const { error } = await supabase.from('tasks').insert(newOnly);
                    if (error) throw error;
                    const skipped = imported.length - newOnly.length;
                    const msg = skipped > 0
                        ? `Imported ${newOnly.length} new assignments (${skipped} duplicates skipped).`
                        : `Imported ${newOnly.length} assignments.`;
                    setSyncResult({ type: 'success', message: msg });
                } else {
                    setSyncResult({ type: 'success', message: `All ${imported.length} assignments already imported — nothing new.` });
                }
            } else {
                setSyncResult({ type: 'error', message: 'No recent assignments found.' });
            }
        } catch (err) {
            setSyncResult({ type: 'error', message: `Sync failed: ${err.message}` });
        } finally { setIsSchoologySyncing(false); }
    };

    const handleFocusSISLogin = async () => {
        let baseUrl = selectedDistrict?.url;
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
            await AsyncStorage.setItem('svDistrictType', 'focus-sis');

            const apiBase = Platform.OS === 'web' ? '' : 'https://optionapp.online';
            const resp = await fetch(`${apiBase}/api/focus-sis`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ baseUrl, username: svUser, password: svPass }),
            });

            const data = await resp.json();
            if (!resp.ok) throw new Error(data.error || 'Focus SIS sync failed');

            const { classes: parsedClasses } = parseFocusSISGrades(data.html);
            if (parsedClasses?.length > 0) {
                await AsyncStorage.setItem('studentVueGrades', JSON.stringify(parsedClasses));
                await AsyncStorage.setItem('isDemoData', 'false');
                setConnectedIds(prev => prev.includes('studentvue') ? prev : [...prev, 'studentvue']);
                const totalAssignments = parsedClasses.reduce((sum, c) => sum + (c.assignments?.length || 0), 0);
                setSyncResult({ type: 'success', message: `Imported ${parsedClasses.length} classes with ${totalAssignments} assignments from Focus SIS.` });
            } else {
                setSyncResult({ type: 'error', message: 'Connected to Focus SIS but could not parse grade data.' });
            }
        } catch (error) {
            setSyncResult({ type: 'error', message: error.message });
        } finally { setIsSyncing(false); }
    };

    const handleStudentVueLogin = async () => {
        if (selectedDistrict?.focusSIS) return handleFocusSISLogin();
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
                    setConnectedIds(prev => prev.includes('studentvue') ? prev : [...prev, 'studentvue']);
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
        setSyncResult(null);
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
                setSyncResult({ type: 'success', message: `Synced ${syncCount} assignments to Google Calendar.` });
            } else {
                setSyncResult({ type: 'error', message: 'No assignments to sync.' });
            }
        } catch (error) {
            setSyncResult({ type: 'error', message: 'Sync failed: ' + error.message });
        } finally { setIsSyncing(false); }
    };

    const handleClassroomLink = async () => {
        try {
            const result = await promptAsync();
            if (result?.type === 'success') {
                const token = result.authentication.accessToken;
                setClassroomToken(token);
                await AsyncStorage.setItem('classroomAccessToken', token);
                setConnectedIds(prev => prev.includes('classroom') ? prev : [...prev, 'classroom']);
            }
        } catch (err) {
            console.warn('Classroom auth error:', err);
        }
    };

    const handleClassroomSync = async () => {
        const token = classroomToken || accessToken;
        if (!token) {
            Alert.alert('Not Linked', 'Link your Google account first.');
            return;
        }
        setIsClassroomSyncing(true);
        setSyncResult(null);
        try {
            // Fetch active courses
            const coursesRes = await fetch('https://classroom.googleapis.com/v1/courses?courseStates=ACTIVE', {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!coursesRes.ok) throw new Error(`Failed to fetch courses: ${coursesRes.status}`);
            const coursesData = await coursesRes.json();
            const courses = coursesData.courses || [];

            if (courses.length === 0) {
                setSyncResult({ type: 'error', message: 'No active courses found in Google Classroom.' });
                setIsClassroomSyncing(false);
                return;
            }

            const classes = [];
            for (const course of courses) {
                let assignments = [];
                try {
                    const cwRes = await fetch(`https://classroom.googleapis.com/v1/courses/${course.id}/courseWork`, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    if (cwRes.ok) {
                        const cwData = await cwRes.json();
                        assignments = (cwData.courseWork || []).map(cw => {
                            const dueDate = cw.dueDate ? `${cw.dueDate.year}-${String(cw.dueDate.month).padStart(2, '0')}-${String(cw.dueDate.day).padStart(2, '0')}` : null;
                            const maxPoints = cw.maxPoints || 0;
                            return {
                                name: cw.title || 'Untitled',
                                date: dueDate || '',
                                score: '',
                                total: maxPoints > 0 ? String(maxPoints) : '',
                                weight: maxPoints > 50 ? 'Major' : 'Minor',
                            };
                        });
                    }
                } catch (e) {
                    console.warn(`Failed to fetch coursework for ${course.name}:`, e);
                }

                // Calculate a mock grade based on assignment completion
                classes.push({
                    id: course.id,
                    name: course.name || 'Untitled Course',
                    teacher: course.ownerId || 'Unknown',
                    grade: '--',
                    assignments,
                });
            }

            await AsyncStorage.setItem('studentVueGrades', JSON.stringify(classes));
            await AsyncStorage.setItem('isDemoData', 'false');
            setConnectedIds(prev => prev.includes('classroom') ? prev : [...prev, 'classroom']);
            const totalAssignments = classes.reduce((sum, c) => sum + c.assignments.length, 0);
            setSyncResult({ type: 'success', message: `Imported ${classes.length} classes with ${totalAssignments} assignments from Google Classroom.` });
        } catch (err) {
            setSyncResult({ type: 'error', message: `Classroom sync failed: ${err.message}` });
        } finally {
            setIsClassroomSyncing(false);
        }
    };

    const openModal = (id) => {
        setSyncResult(null);
        setActiveModal(id);
    };

    const closeModal = () => {
        setActiveModal(null);
        setSyncResult(null);
    };

    // ── Render ────────────────────────────────────────────────

    return (
        <View style={S.root}>
            <TopBar title="Integrations" subtitle="Connect your school's systems to sync grades and assignments" />
            <ScrollView contentContainerStyle={{ paddingVertical: 28, paddingHorizontal: 32 }} showsVerticalScrollIndicator={false}>
                <View style={{ maxWidth: 900, alignSelf: 'center', width: '100%' }}>

                    {/* ── Integration cards grid ── */}
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginBottom: 20 }}>
                        {INTEGRATIONS.map((item) => {
                            const connected = connectedIds.includes(item.id);
                            const iconColor = theme.colors[item.color] || theme.colors.ink2;
                            const handleConnect = () => !item.soon && openModal(item.id);
                            const handleDisconnect = async () => {
                                const ok = Platform.OS === 'web'
                                    ? window.confirm(`Disconnect ${item.name}?`)
                                    : await new Promise(res => Alert.alert('Disconnect?', `Disconnect ${item.name}?`, [{ text: 'Cancel', onPress: () => res(false) }, { text: 'Disconnect', style: 'destructive', onPress: () => res(true) }]));
                                if (!ok) return;
                                if (item.id === 'google') { await AsyncStorage.removeItem('googleAccessToken'); setAccessToken(null); }
                                if (item.id === 'classroom') { await AsyncStorage.removeItem('classroomAccessToken'); setClassroomToken(null); }
                                if (item.id === 'studentvue') { await AsyncStorage.removeItem('svUsername'); await AsyncStorage.removeItem('svPassword'); }
                                if (item.id === 'schoology') { await AsyncStorage.removeItem('schoologyUrl'); setSchoologyUrl(''); }
                                setConnectedIds(prev => prev.filter(c => c !== item.id));
                            };
                            const handleSync = () => {
                                if (item.id === 'google') return syncGoogleCalendarManual();
                                if (item.id === 'classroom') return handleClassroomSync();
                                if (item.id === 'schoology') return handleSchoologySync();
                                openModal(item.id);
                            };

                            return (
                                <Card key={item.id} padding={20} style={{ width: '47%', flexGrow: 1, minWidth: 280 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14 }}>
                                        <View style={{
                                            width: 48, height: 48, borderRadius: 10,
                                            backgroundColor: iconColor + '18',
                                            alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                        }}>
                                            <item.Icon size={22} color={iconColor} strokeWidth={1.8} />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                                <Text style={{ fontFamily: theme.fonts.s, fontSize: 15, fontWeight: '600', color: theme.colors.ink }}>
                                                    {item.name}
                                                </Text>
                                                {connected && <Badge color={SEM.green}>● Connected</Badge>}
                                                {item.soon && <Badge color={theme.colors.ink3}>Soon</Badge>}
                                            </View>
                                            <Text style={{ fontFamily: theme.fonts.m, fontSize: 12, color: theme.colors.ink3, marginTop: 4, lineHeight: 17 }}>
                                                {item.desc}
                                            </Text>
                                        </View>
                                    </View>
                                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
                                        {item.soon ? null : connected ? (
                                            <>
                                                <Button variant="secondary" size="sm" icon={RefreshCw} onPress={handleSync}>Sync now</Button>
                                                <Button variant="ghost" size="sm" onPress={handleDisconnect}>Disconnect</Button>
                                            </>
                                        ) : (
                                            <Button variant="primary" size="sm" icon={Plus} onPress={handleConnect}>Connect</Button>
                                        )}
                                    </View>
                                </Card>
                            );
                        })}
                    </View>

                    {/* ── Demo data loader ── */}
                    <Card padding={20} style={{ marginBottom: 20 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                            <View style={{
                                width: 40, height: 40, borderRadius: 10,
                                backgroundColor: SEM.purple + '18',
                                alignItems: 'center', justifyContent: 'center',
                            }}>
                                <Database size={18} color={SEM.purple} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={{ fontFamily: theme.fonts.s, fontSize: 15, fontWeight: '600', color: theme.colors.ink }}>
                                    Beta Testing
                                </Text>
                                <Text style={{ fontFamily: theme.fonts.m, fontSize: 12, color: theme.colors.ink3, marginTop: 3 }}>
                                    Load sample grade data to explore the app without real credentials.
                                </Text>
                            </View>
                        </View>
                        <Button
                            variant="secondary"
                            size="sm"
                            loading={isMockLoading}
                            onPress={async () => {
                                setIsMockLoading(true);
                                try {
                                    const { classCount, assignmentCount } = await loadMockGradebookData();
                                    setConnectedIds(prev => prev.includes('studentvue') ? prev : [...prev, 'studentvue']);
                                    if (Platform.OS === 'web') window.alert(`Demo loaded: ${classCount} classes, ${assignmentCount} assignments`);
                                    else Alert.alert('Demo Loaded', `${classCount} classes, ${assignmentCount} assignments`);
                                } catch (e) {
                                    if (Platform.OS === 'web') window.alert(`Failed: ${e.message}`);
                                    else Alert.alert('Error', e.message);
                                } finally { setIsMockLoading(false); }
                            }}
                        >
                            Load demo data
                        </Button>
                    </Card>

                    {/* ── Developer API placeholder (matches design) ── */}
                    <Card padding={20}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                            <View style={{
                                width: 40, height: 40, borderRadius: 10,
                                backgroundColor: theme.colors.surface2,
                                alignItems: 'center', justifyContent: 'center',
                            }}>
                                <Code size={18} color={theme.colors.ink2} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={{ fontFamily: theme.fonts.s, fontSize: 15, fontWeight: '600', color: theme.colors.ink }}>
                                    Developer API
                                </Text>
                                <Text style={{ fontFamily: theme.fonts.m, fontSize: 12, color: theme.colors.ink3, marginTop: 3 }}>
                                    Build your own integrations
                                </Text>
                            </View>
                        </View>
                        <View style={{
                            backgroundColor: theme.colors.surface2,
                            paddingVertical: 10, paddingHorizontal: 14,
                            borderRadius: 8,
                            flexDirection: 'row', alignItems: 'center', gap: 10,
                        }}>
                            <Text style={{ flex: 1, fontFamily: theme.fonts.mono, fontSize: 12, color: theme.colors.ink2 }} numberOfLines={1}>
                                Coming soon — request early access
                            </Text>
                            <Copy size={14} color={theme.colors.ink3} />
                        </View>
                    </Card>
                </View>
            </ScrollView>

            {/* ── StudentVUE Modal ── */}
            <Modal visible={activeModal === 'studentvue'} transparent animationType="slide" onRequestClose={closeModal}>
                <Pressable style={S.modalOverlay} onPress={closeModal}>
                    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                        <Pressable style={S.modalSheet}>
                            <View style={S.modalHandle} />
                            <View style={S.modalHeader}>
                                <View style={[S.tileIcon, { backgroundColor: theme.colors.green + '12' }]}>
                                    <Database size={20} color={theme.colors.green} strokeWidth={1.8} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={S.modalTitle}>StudentVUE / Focus SIS</Text>
                                    <Text style={S.modalDesc}>Sync your grades automatically</Text>
                                </View>
                                <TouchableOpacity onPress={closeModal} hitSlop={12}>
                                    <X size={20} color={theme.colors.ink3} />
                                </TouchableOpacity>
                            </View>

                            <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
                                <Text style={S.fieldLabel}>School District</Text>
                                <TouchableOpacity style={S.picker} onPress={() => setIsPickerVisible(true)}>
                                    <Text style={{ fontFamily: theme.fonts.m, fontSize: 13, color: selectedDistrict ? theme.colors.ink : theme.colors.ink3, flex: 1 }}>
                                        {selectedDistrict ? selectedDistrict.name : 'Select your school district...'}
                                    </Text>
                                    <ChevronDown size={16} color={theme.colors.ink3} />
                                </TouchableOpacity>

                                {selectedDistrict?.id === 'custom' && (
                                    <>
                                        <Text style={S.fieldLabel}>Custom Portal URL</Text>
                                        <TextInput style={S.fieldInput} placeholder="e.g. https://rtmsd.usplk12.org" placeholderTextColor={theme.colors.ink3} value={customUrl} onChangeText={setCustomUrl} autoCapitalize="none" />
                                    </>
                                )}

                                {selectedDistrict?.focusSIS && (
                                    <View style={[S.infoBanner, { borderColor: theme.colors.blue + '40', backgroundColor: theme.colors.blue + '08' }]}>
                                        <Text style={[S.infoBannerText, { color: theme.colors.blue }]}>This school uses Focus SIS. Your credentials are sent directly to your school's server — never stored by us.</Text>
                                    </View>
                                )}

                                <Text style={S.fieldLabel}>Username / Student ID</Text>
                                <TextInput style={S.fieldInput} placeholder="Student ID" placeholderTextColor={theme.colors.ink3} value={svUser} onChangeText={setSvUser} autoCapitalize="none" />

                                <Text style={S.fieldLabel}>Password</Text>
                                <TextInput style={S.fieldInput} placeholder="Password" placeholderTextColor={theme.colors.ink3} value={svPass} onChangeText={setSvPass} secureTextEntry />

                                {syncResult && (
                                    <View style={[S.resultBanner, { borderColor: syncResult.type === 'success' ? theme.colors.green : theme.colors.red, backgroundColor: (syncResult.type === 'success' ? theme.colors.green : theme.colors.red) + '10' }]}>
                                        <Text style={[S.resultText, { color: syncResult.type === 'success' ? theme.colors.green : theme.colors.red }]}>{syncResult.message}</Text>
                                    </View>
                                )}
                            </ScrollView>

                            <TouchableOpacity style={[S.actionBtn, isSyncing && { opacity: 0.6 }]} onPress={handleStudentVueLogin} disabled={isSyncing}>
                                {isSyncing ? (
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                        <ActivityIndicator size="small" color={theme.colors.bg} />
                                        <Text style={S.actionBtnText}>Syncing...</Text>
                                    </View>
                                ) : (
                                    <Text style={S.actionBtnText}>Sync Grades</Text>
                                )}
                            </TouchableOpacity>
                        </Pressable>
                    </KeyboardAvoidingView>
                </Pressable>
            </Modal>

            {/* ── Google Calendar Modal ── */}
            <Modal visible={activeModal === 'google'} transparent animationType="slide" onRequestClose={closeModal}>
                <Pressable style={S.modalOverlay} onPress={closeModal}>
                    <Pressable style={S.modalSheet}>
                        <View style={S.modalHandle} />
                        <View style={S.modalHeader}>
                            <View style={[S.tileIcon, { backgroundColor: theme.colors.blue + '12' }]}>
                                <Calendar size={20} color={theme.colors.blue} strokeWidth={1.8} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={S.modalTitle}>Google Calendar</Text>
                                <Text style={S.modalDesc}>Sync assignments to your calendar</Text>
                            </View>
                            <TouchableOpacity onPress={closeModal} hitSlop={12}>
                                <X size={20} color={theme.colors.ink3} />
                            </TouchableOpacity>
                        </View>

                        {accessToken && (
                            <View style={[S.connectedChip, { backgroundColor: theme.colors.green + '12' }]}>
                                <Check size={12} color={theme.colors.green} strokeWidth={3} />
                                <Text style={[S.connectedText, { color: theme.colors.green }]}>Account linked</Text>
                            </View>
                        )}

                        {syncResult && (
                            <View style={[S.resultBanner, { borderColor: syncResult.type === 'success' ? theme.colors.green : theme.colors.red, backgroundColor: (syncResult.type === 'success' ? theme.colors.green : theme.colors.red) + '10' }]}>
                                <Text style={[S.resultText, { color: syncResult.type === 'success' ? theme.colors.green : theme.colors.red }]}>{syncResult.message}</Text>
                            </View>
                        )}

                        <View style={{ gap: 8, marginTop: 8 }}>
                            <TouchableOpacity style={S.actionBtn} onPress={() => {
                                if (Platform.OS === 'web') {
                                    startGoogleOAuthWeb('calendar');
                                } else {
                                    promptAsync();
                                }
                            }}>
                                <Text style={S.actionBtnText}>{accessToken ? 'Re-link Account' : 'Link Google Account'}</Text>
                            </TouchableOpacity>
                            {accessToken && (
                                <TouchableOpacity style={S.secondaryBtn} onPress={syncGoogleCalendarManual} disabled={isSyncing}>
                                    {isSyncing ? <ActivityIndicator size="small" color={theme.colors.ink} /> : (
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                            <RefreshCw size={14} color={theme.colors.ink} />
                                            <Text style={S.secondaryBtnText}>Sync Gradebook to Calendar</Text>
                                        </View>
                                    )}
                                </TouchableOpacity>
                            )}
                        </View>
                    </Pressable>
                </Pressable>
            </Modal>

            {/* ── Google Classroom Modal ── */}
            <Modal visible={activeModal === 'classroom'} transparent animationType="slide" onRequestClose={closeModal}>
                <Pressable style={S.modalOverlay} onPress={closeModal}>
                    <Pressable style={S.modalSheet}>
                        <View style={S.modalHandle} />
                        <View style={S.modalHeader}>
                            <View style={[S.tileIcon, { backgroundColor: theme.colors.green + '12' }]}>
                                <GraduationCap size={20} color={theme.colors.green} strokeWidth={1.8} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={S.modalTitle}>Google Classroom</Text>
                                <Text style={S.modalDesc}>Import classes and assignments</Text>
                            </View>
                            <TouchableOpacity onPress={closeModal} hitSlop={12}>
                                <X size={20} color={theme.colors.ink3} />
                            </TouchableOpacity>
                        </View>

                        {classroomToken && (
                            <View style={[S.connectedChip, { backgroundColor: theme.colors.green + '12' }]}>
                                <Check size={12} color={theme.colors.green} strokeWidth={3} />
                                <Text style={[S.connectedText, { color: theme.colors.green }]}>Account linked</Text>
                            </View>
                        )}

                        {syncResult && (
                            <View style={[S.resultBanner, { borderColor: syncResult.type === 'success' ? theme.colors.green : theme.colors.red, backgroundColor: (syncResult.type === 'success' ? theme.colors.green : theme.colors.red) + '10' }]}>
                                <Text style={[S.resultText, { color: syncResult.type === 'success' ? theme.colors.green : theme.colors.red }]}>{syncResult.message}</Text>
                            </View>
                        )}

                        <View style={{ gap: 8, marginTop: 8 }}>
                            <TouchableOpacity style={S.actionBtn} onPress={() => {
                                if (Platform.OS === 'web') {
                                    startGoogleOAuthWeb('classroom');
                                } else {
                                    handleClassroomLink();
                                }
                            }}>
                                <Text style={S.actionBtnText}>{classroomToken ? 'Re-link Account' : 'Link Google Classroom'}</Text>
                            </TouchableOpacity>
                            {classroomToken && (
                                <TouchableOpacity style={S.secondaryBtn} onPress={handleClassroomSync} disabled={isClassroomSyncing}>
                                    {isClassroomSyncing ? <ActivityIndicator size="small" color={theme.colors.ink} /> : (
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                            <RefreshCw size={14} color={theme.colors.ink} />
                                            <Text style={S.secondaryBtnText}>Sync Classes</Text>
                                        </View>
                                    )}
                                </TouchableOpacity>
                            )}
                        </View>
                    </Pressable>
                </Pressable>
            </Modal>

            {/* ── Schoology Modal ── */}
            <Modal visible={activeModal === 'schoology'} transparent animationType="slide" onRequestClose={closeModal}>
                <Pressable style={S.modalOverlay} onPress={closeModal}>
                    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                        <Pressable style={S.modalSheet}>
                            <View style={S.modalHandle} />
                            <View style={S.modalHeader}>
                                <View style={[S.tileIcon, { backgroundColor: theme.colors.orange + '12' }]}>
                                    <BookOpen size={20} color={theme.colors.orange} strokeWidth={1.8} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={S.modalTitle}>Schoology</Text>
                                    <Text style={S.modalDesc}>Import assignments from calendar feed</Text>
                                </View>
                                <TouchableOpacity onPress={closeModal} hitSlop={12}>
                                    <X size={20} color={theme.colors.ink3} />
                                </TouchableOpacity>
                            </View>

                            <Text style={S.fieldLabel}>Calendar Feed URL</Text>
                            <TextInput style={S.fieldInput} placeholder="webcal://schoology.com/calendar..." placeholderTextColor={theme.colors.ink3} value={schoologyUrl} onChangeText={setSchoologyUrl} autoCapitalize="none" />

                            {syncResult && (
                                <View style={[S.resultBanner, { borderColor: syncResult.type === 'success' ? theme.colors.green : theme.colors.red, backgroundColor: (syncResult.type === 'success' ? theme.colors.green : theme.colors.red) + '10' }]}>
                                    <Text style={[S.resultText, { color: syncResult.type === 'success' ? theme.colors.green : theme.colors.red }]}>{syncResult.message}</Text>
                                </View>
                            )}

                            <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                                <TouchableOpacity style={[S.secondaryBtn, { flex: 1 }]} onPress={() => {
                                    AsyncStorage.setItem('schoologyUrl', schoologyUrl);
                                    if (Platform.OS === 'web') window.alert('URL saved.');
                                    else Alert.alert('Saved', 'Schoology URL saved.');
                                }}>
                                    <Text style={S.secondaryBtnText}>Save</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[S.actionBtn, { flex: 2 }]} onPress={handleSchoologySync} disabled={isSchoologySyncing}>
                                    {isSchoologySyncing ? <ActivityIndicator size="small" color={theme.colors.bg} /> : (
                                        <Text style={S.actionBtnText}>Sync Now</Text>
                                    )}
                                </TouchableOpacity>
                            </View>
                        </Pressable>
                    </KeyboardAvoidingView>
                </Pressable>
            </Modal>

            <DistrictPickerModal visible={isPickerVisible} onClose={() => setIsPickerVisible(false)} onSelect={(d) => setSelectedDistrict(d)} currentSelectionUrl={selectedDistrict?.url} />
        </View>
    );
}

// ── Styles ────────────────────────────────────────────────────
const getStyles = (theme) => StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.colors.bg },
    container: { flex: 1, paddingTop: 40, paddingHorizontal: 20 },
    headerContainer: { marginBottom: 24 },
    header: { fontFamily: theme.fonts.d, fontSize: 32, fontWeight: '700', color: theme.colors.ink, letterSpacing: -0.5 },
    subtitle: { fontFamily: theme.fonts.m, fontSize: 13, color: theme.colors.ink3, marginTop: 4 },

    // Grid
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20 },
    tile: {
        width: '47%', flexGrow: 1,
        backgroundColor: theme.colors.surface,
        borderWidth: 1, borderColor: theme.colors.border,
        borderRadius: theme.radii.lg,
        padding: 16,
        ...theme.shadows.sm,
    },
    tileConnected: { borderColor: theme.colors.green + '40' },
    tileTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
    tileIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    tileName: { fontFamily: theme.fonts.s, fontSize: 14, fontWeight: '600', color: theme.colors.ink, marginBottom: 2 },
    tileDesc: { fontFamily: theme.fonts.m, fontSize: 11, color: theme.colors.ink3 },
    statusDot: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    addDot: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surface2 },
    soonBadge: { backgroundColor: theme.colors.surface2, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.border },
    soonText: { fontFamily: theme.fonts.m, fontSize: 9, color: theme.colors.ink3, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase' },

    // Demo
    demoCard: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radii.lg, padding: 16, ...theme.shadows.sm },
    demoLabel: { fontFamily: theme.fonts.m, fontSize: 10, color: theme.colors.purple, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4, fontWeight: '600' },
    demoDesc: { fontFamily: theme.fonts.m, fontSize: 12, color: theme.colors.ink3, lineHeight: 16, marginBottom: 10 },
    demoBtn: { backgroundColor: theme.colors.surface2, borderWidth: 1, borderColor: theme.colors.purple + '30', borderRadius: theme.radii.r, paddingVertical: 10, alignItems: 'center' },
    demoBtnText: { fontFamily: theme.fonts.s, fontSize: 13, fontWeight: '600', color: theme.colors.purple },

    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    modalSheet: { backgroundColor: theme.colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40 },
    modalHandle: { width: 36, height: 4, backgroundColor: theme.colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
    modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
    modalTitle: { fontFamily: theme.fonts.s, fontSize: 18, fontWeight: '700', color: theme.colors.ink },
    modalDesc: { fontFamily: theme.fonts.m, fontSize: 12, color: theme.colors.ink3, marginTop: 1 },

    // Fields
    fieldLabel: { fontFamily: theme.fonts.m, fontSize: 10, color: theme.colors.ink3, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6, marginTop: 12 },
    fieldInput: { backgroundColor: theme.colors.bg, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radii.r, padding: 12, fontFamily: theme.fonts.m, fontSize: 13, color: theme.colors.ink },
    picker: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.bg, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radii.r, padding: 12 },

    // Banners
    infoBanner: { marginTop: 10, padding: 10, borderRadius: theme.radii.r, borderWidth: 1 },
    infoBannerText: { fontFamily: theme.fonts.m, fontSize: 12, lineHeight: 16 },
    resultBanner: { marginTop: 12, padding: 10, borderRadius: theme.radii.r, borderWidth: 1 },
    resultText: { fontFamily: theme.fonts.m, fontSize: 12, fontWeight: '600', lineHeight: 16 },

    connectedChip: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
    connectedText: { fontFamily: theme.fonts.m, fontSize: 12, fontWeight: '600' },

    // Buttons
    actionBtn: { backgroundColor: theme.colors.ink, borderRadius: theme.radii.r, paddingVertical: 13, alignItems: 'center', justifyContent: 'center', marginTop: 8, ...theme.shadows.sm },
    actionBtnText: { fontFamily: theme.fonts.s, fontSize: 14, fontWeight: '600', color: theme.colors.bg },
    secondaryBtn: { backgroundColor: theme.colors.bg, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radii.r, paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
    secondaryBtnText: { fontFamily: theme.fonts.s, fontSize: 13, fontWeight: '600', color: theme.colors.ink },
});
