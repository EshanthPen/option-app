import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    ActivityIndicator,
    Platform,
    KeyboardAvoidingView,
    ScrollView,
    Animated,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Database, BookOpen, Check, ChevronRight, Shield } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import DistrictPickerModal from '../components/DistrictPickerModal';
import { parseStudentVueGradebook, parseStudentVuePeriods } from '../utils/studentVueParser';
import { parseFocusSISGrades } from '../utils/focusSISParser';
import { supabase } from '../supabaseClient';
import { getDeviceId } from '../utils/auth';
import ICAL from 'ical.js';

export default function SetupWizard({ onComplete }) {
    const { theme } = useTheme();
    const S = getStyles(theme);

    const [step, setStep] = useState(1); // 1: StudentVUE, 2: Schoology, 3: Done

    // StudentVUE State
    const [selectedDistrict, setSelectedDistrict] = useState(null);
    const [customUrl, setCustomUrl] = useState('');
    const [svUser, setSvUser] = useState('');
    const [svPass, setSvPass] = useState('');
    const [isPickerVisible, setIsPickerVisible] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState(null);

    // Schoology State
    const [schoologyUrl, setSchoologyUrl] = useState('');
    const [schoologySyncing, setSchoologySyncing] = useState(false);
    const [schoologyResult, setSchoologyResult] = useState(null);
    const [deviceId, setDeviceId] = useState(null);

    const fadeAnim = React.useRef(new Animated.Value(0)).current;
    const slideAnim = React.useRef(new Animated.Value(24)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
            Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
        ]).start();

        (async () => {
            const id = await getDeviceId();
            setDeviceId(id);
        })();
    }, [step]);

    // ── StudentVUE Handlers ───────────────────────────────────
    const handleFocusSISLogin = async () => {
        const baseUrl = selectedDistrict?.url;
        if (!baseUrl || !svUser || !svPass) {
            setSyncResult({ type: 'error', message: 'Please select your district and enter your credentials.' });
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
                const totalAssignments = parsedClasses.reduce((sum, c) => sum + (c.assignments?.length || 0), 0);
                setSyncResult({
                    type: 'success',
                    message: `✓ Synced! ${parsedClasses.length} classes and ${totalAssignments} assignments imported.`,
                });
            } else {
                setSyncResult({ type: 'error', message: 'Connected but could not parse grade data. You can still continue.' });
            }
        } catch (error) {
            setSyncResult({ type: 'error', message: error.message });
        } finally {
            setIsSyncing(false);
        }
    };

    const handleStudentVueLogin = async () => {
        if (selectedDistrict?.focusSIS) return handleFocusSISLogin();

        let baseUrl = '';
        if (selectedDistrict) {
            baseUrl = selectedDistrict.id === 'custom' ? customUrl : selectedDistrict.url;
        }

        if (!baseUrl || !svUser || !svPass) {
            setSyncResult({ type: 'error', message: 'Please select your district and enter your credentials.' });
            return;
        }

        setSyncResult(null);
        setIsSyncing(true);

        try {
            await AsyncStorage.setItem('svUsername', svUser);
            await AsyncStorage.setItem('svPassword', svPass);
            await AsyncStorage.setItem('svDistrictUrl', baseUrl);

            const finalTargetUrl = baseUrl.endsWith('Service/PXPCommunication.asmx')
                ? baseUrl
                : `${baseUrl}/Service/PXPCommunication.asmx`;

            const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const apiBase = Platform.OS === 'web' ? '' : 'https://optionapp.online';

            const periodsSoap = `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><ProcessWebServiceRequest xmlns="http://edupoint.com/webservices/"><userID>${esc(svUser)}</userID><password>${esc(svPass)}</password><skipLoginLog>1</skipLoginLog><parent>0</parent><webServiceHandleName>PXPWebServices</webServiceHandleName><methodName>Gradebook</methodName><paramStr>&lt;Parms&gt;&lt;ReportPeriod&gt;0&lt;/ReportPeriod&gt;&lt;/Parms&gt;</paramStr></ProcessWebServiceRequest></soap:Body></soap:Envelope>`;

            const periodsResp = await fetch(`${apiBase}/api/studentvue`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ targetUrl: finalTargetUrl, soapPayload: periodsSoap }),
            });
            if (!periodsResp.ok) {
                const errData = await periodsResp.json().catch(() => ({}));
                throw new Error(errData?.cause || periodsResp.statusText);
            }
            const periodsXml = await periodsResp.text();
            if (periodsXml.includes('RT_ERROR') || !periodsXml.includes('Gradebook')) throw new Error('Invalid credentials or district URL.');

            const { currentPeriodIndex, currentPeriodName } = parseStudentVuePeriods(periodsXml);
            let finalXml = periodsXml;

            if (currentPeriodIndex !== 0) {
                const gradesSoap = `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><ProcessWebServiceRequest xmlns="http://edupoint.com/webservices/"><userID>${esc(svUser)}</userID><password>${esc(svPass)}</password><skipLoginLog>1</skipLoginLog><parent>0</parent><webServiceHandleName>PXPWebServices</webServiceHandleName><methodName>Gradebook</methodName><paramStr>&lt;Parms&gt;&lt;ReportPeriod&gt;${currentPeriodIndex}&lt;/ReportPeriod&gt;&lt;/Parms&gt;</paramStr></ProcessWebServiceRequest></soap:Body></soap:Envelope>`;
                const gradesResp = await fetch(`${apiBase}/api/studentvue`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ targetUrl: finalTargetUrl, soapPayload: gradesSoap }),
                });
                if (gradesResp.ok) finalXml = await gradesResp.text();
            }

            if (finalXml.includes('Gradebook') && !finalXml.includes('RT_ERROR')) {
                const { classes: formattedClasses } = parseStudentVueGradebook(finalXml, currentPeriodName);
                if (formattedClasses?.length > 0) {
                    await AsyncStorage.setItem('studentVueGrades', JSON.stringify(formattedClasses));
                    await AsyncStorage.setItem('isDemoData', 'false');
                    const totalAssignments = formattedClasses.reduce((sum, c) => sum + (c.assignments?.length || 0), 0);
                    setSyncResult({
                        type: 'success',
                        message: `✓ Synced! ${formattedClasses.length} classes and ${totalAssignments} assignments imported.`,
                    });
                } else {
                    throw new Error('Connected but no classes found for this period.');
                }
            } else {
                setSyncResult({ type: 'error', message: 'No grade data found for this period.' });
            }
        } catch (error) {
            setSyncResult({ type: 'error', message: error.message });
        } finally {
            setIsSyncing(false);
        }
    };

    // ── Schoology Handlers ──────────────────────────────────────
    const handleSchoologySync = async () => {
        if (!schoologyUrl.trim()) {
            setSchoologyResult({ type: 'error', message: 'Please enter your Schoology calendar link first.' });
            return;
        }
        setSchoologySyncing(true);
        setSchoologyResult(null);

        const input = schoologyUrl.trim();
        const urlRegex = /(?:webcal|https?):\/\/[^\s"'<>]+(?:\.(?:ics|php)[^\s"'<>]*|\/calendar\/feed\/ical\/[^\s"'<>]*)/gi;
        const matches = input.match(urlRegex);
        let cleanUrl = matches ? matches[matches.length - 1] : input;
        if (!cleanUrl.includes('://') && cleanUrl.includes('.ics')) {
            cleanUrl = 'https://' + cleanUrl.split('http').pop().replace(/^\/+/, '');
        }
        let fetchUrl = cleanUrl.replace(/^webcal:\/\//i, 'https://');

        let icsData = '';
        let usingProxy = false;

        try {
            const directResponse = await fetch(fetchUrl);
            if (!directResponse.ok) throw new Error('Direct fetch failed');
            icsData = await directResponse.text();
            if (icsData.includes('<html')) throw new Error('HTML returned');
        } catch {
            usingProxy = true;
        }

        if (usingProxy) {
            try {
                let proxyUrl = '';
                if (Platform.OS === 'web' && window.location.origin.includes('localhost')) {
                    proxyUrl = `http://localhost:3001/?url=${encodeURIComponent(fetchUrl)}`;
                } else {
                    const baseUrl = Platform.OS === 'web' ? window.location.origin : 'https://optionapp.online';
                    proxyUrl = `${baseUrl}/api/schoology?url=${encodeURIComponent(fetchUrl)}`;
                }
                const proxyResp = await fetch(proxyUrl);
                if (!proxyResp.ok) throw new Error(`Proxy HTTP ${proxyResp.status}`);
                icsData = await proxyResp.text();
            } catch {
                setSchoologyResult({ type: 'error', message: 'Sync failed: Ensure the link is valid.' });
                setSchoologySyncing(false);
                return;
            }
        }

        try {
            if (!icsData) throw new Error('Empty response from Schoology.');
            if (icsData.includes('<html') || icsData.includes('<!DOCTYPE html')) {
                throw new Error("Schoology returned a login page. Make sure to copy the 'Private Link'.");
            }
            if (!icsData.includes('BEGIN:VCALENDAR')) {
                throw new Error('Invalid calendar data format.');
            }

            await AsyncStorage.setItem('schoologyUrl', schoologyUrl.trim());
            if (deviceId) {
                await supabase
                    .from('settings')
                    .upsert({ user_id: deviceId, schoology_url: schoologyUrl.trim() }, { onConflict: 'user_id' });
            }

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

            if (imported.length > 0 && deviceId) {
                const { data: existing } = await supabase
                    .from('tasks')
                    .select('title, due_date')
                    .eq('user_id', deviceId)
                    .eq('source', 'schoology_import');
                const existingKeys = new Set((existing || []).map(t => `${t.title}::${t.due_date}`));
                const newOnly = imported.filter(t => !existingKeys.has(`${t.title}::${t.due_date}`));
                if (newOnly.length > 0) {
                    const { error } = await supabase.from('tasks').insert(newOnly);
                    if (error) throw error;
                    const skipped = imported.length - newOnly.length;
                    const msg = skipped > 0
                        ? `✓ Imported ${newOnly.length} new assignments (${skipped} duplicates skipped).`
                        : `✓ Imported ${newOnly.length} assignments.`;
                    setSchoologyResult({ type: 'success', message: msg });
                } else {
                    setSchoologyResult({ type: 'success', message: `✓ Connected! All ${imported.length} assignments already imported.` });
                }
            } else {
                setSchoologyResult({
                    type: 'success',
                    message: '✓ Connected! No upcoming assignments found yet.',
                });
            }
        } catch (err) {
            setSchoologyResult({ type: 'error', message: `Sync failed: ${err.message}` });
        } finally {
            setSchoologySyncing(false);
        }
    };

    const handleSkip = async () => {
        if (step === 1) {
            await AsyncStorage.setItem('setup_sis_done', 'skipped');
            setStep(2);
        } else if (step === 2) {
            await AsyncStorage.setItem('setup_schoology_done', 'skipped');
            setStep(3);
        }
    };

    const handleContinue = async () => {
        if (step === 1) {
            await AsyncStorage.setItem('setup_sis_done', 'true');
            setStep(2);
            setSyncResult(null);
        } else if (step === 2) {
            await AsyncStorage.setItem('setup_schoology_done', 'true');
            setStep(3);
        }
    };

    const handleFinish = async () => {
        if (onComplete) onComplete();
    };

    // Render Step 1: StudentVUE
    const renderStudentVUEStep = () => (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <ScrollView
                contentContainerStyle={S.scroll}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                <Animated.View style={[S.container, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
                    <View style={S.stepRow}>
                        <View style={[S.stepDot, S.stepDotActive]} />
                        <View style={S.stepLine} />
                        <View style={S.stepDot} />
                    </View>
                    <Text style={S.stepLabel}>Step 1 of 2</Text>

                    <View style={S.iconWrap}>
                        <View style={S.iconBox}>
                            <Database size={32} color={theme.colors.green} strokeWidth={1.8} />
                        </View>
                    </View>

                    <Text style={S.heading}>Connect your SIS</Text>
                    <Text style={S.subheading}>
                        Link StudentVUE or Focus SIS to automatically sync your grades and assignments into Option.
                    </Text>

                    <Text style={S.label}>School District</Text>
                    <TouchableOpacity style={S.picker} onPress={() => setIsPickerVisible(true)}>
                        <Text style={[S.pickerText, !selectedDistrict && S.pickerPlaceholder]}>
                            {selectedDistrict ? selectedDistrict.name : 'Select your school district...'}
                        </Text>
                        <ChevronRight size={16} color={theme.colors.ink3} style={{ transform: [{ rotate: '90deg' }] }} />
                    </TouchableOpacity>

                    {selectedDistrict?.id === 'custom' && (
                        <>
                            <Text style={S.label}>Portal URL</Text>
                            <TextInput
                                style={S.input}
                                placeholder="https://sis.yourdistrict.org"
                                placeholderTextColor={theme.colors.ink3}
                                value={customUrl}
                                onChangeText={setCustomUrl}
                                autoCapitalize="none"
                                autoCorrect={false}
                                keyboardType="url"
                            />
                        </>
                    )}

                    {selectedDistrict?.focusSIS && (
                        <View style={S.infoBanner}>
                            <Text style={S.infoBannerText}>
                                This school uses Focus SIS. Your credentials are sent directly to your school's server — never stored by Option.
                            </Text>
                        </View>
                    )}

                    <Text style={S.label}>Username / Student ID</Text>
                    <TextInput
                        style={S.input}
                        placeholder="Student ID or username"
                        placeholderTextColor={theme.colors.ink3}
                        value={svUser}
                        onChangeText={text => { setSvUser(text); setSyncResult(null); }}
                        autoCapitalize="none"
                        autoCorrect={false}
                    />

                    <Text style={S.label}>Password</Text>
                    <TextInput
                        style={S.input}
                        placeholder="Password"
                        placeholderTextColor={theme.colors.ink3}
                        value={svPass}
                        onChangeText={text => { setSvPass(text); setSyncResult(null); }}
                        secureTextEntry
                    />

                    {syncResult && (
                        <View style={[S.resultBanner, {
                            borderColor: syncResult.type === 'success' ? theme.colors.green : theme.colors.red,
                            backgroundColor: (syncResult.type === 'success' ? theme.colors.green : theme.colors.red) + '14',
                        }]}>
                            <Text style={[S.resultText, { color: syncResult.type === 'success' ? theme.colors.green : theme.colors.red }]}>
                                {syncResult.message}
                            </Text>
                        </View>
                    )}

                    {!syncResult?.type === 'success' && (
                        <TouchableOpacity
                            style={[S.primaryBtn, isSyncing && { opacity: 0.6 }]}
                            onPress={handleStudentVueLogin}
                            disabled={isSyncing}
                            activeOpacity={0.85}
                        >
                            {isSyncing ? (
                                <ActivityIndicator color={theme.colors.bg} size="small" />
                            ) : (
                        <Text style={S.primaryBtnText}>Sync Grades</Text>
                            )}
                        </TouchableOpacity>
                    )}

                    {syncResult?.type === 'success' && (
                        <TouchableOpacity style={S.continueBtn} onPress={handleContinue} activeOpacity={0.85}>
                            <Check size={18} color={theme.colors.bg} strokeWidth={2.5} />
                            <Text style={S.continueBtnText}>Continue</Text>
                        </TouchableOpacity>
                    )}

                    <TouchableOpacity style={S.skipBtn} onPress={handleSkip} activeOpacity={0.6}>
                        <Text style={S.skipText}>Skip for now</Text>
                    </TouchableOpacity>
                </Animated.View>
            </ScrollView>

            <DistrictPickerModal
                visible={isPickerVisible}
                onClose={() => setIsPickerVisible(false)}
                onSelect={(d) => { setSelectedDistrict(d); setSyncResult(null); }}
                currentSelectionUrl={selectedDistrict?.url}
            />
        </KeyboardAvoidingView>
    );

    // Render Step 2: Schoology
    const renderSchoologyStep = () => (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <ScrollView
                contentContainerStyle={S.scroll}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                <Animated.View style={[S.container, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
                    <View style={S.stepRow}>
                        <View style={[S.stepDot, S.stepDotDone]} />
                        <View style={[S.stepLine, S.stepLineDone]} />
                        <View style={[S.stepDot, S.stepDotActive]} />
                    </View>
                    <Text style={S.stepLabel}>Step 2 of 2</Text>

                    <View style={S.iconWrap}>
                        <View style={[S.iconBox, { backgroundColor: theme.colors.orange + '14', borderColor: theme.colors.orange + '30' }]}>
                            <BookOpen size={32} color={theme.colors.orange} strokeWidth={1.8} />
                        </View>
                    </View>

                    <Text style={S.heading}>Connect Schoology</Text>
                    <Text style={S.subheading}>
                        Paste your Schoology calendar feed URL so Option can automatically import your assignments.
                    </Text>

                    <View style={S.hintBox}>
                        <Text style={S.hintTitle}>How to find your calendar link</Text>
                        <Text style={S.hintText}>
                            In Schoology → Calendar → Subscribe → Copy the "Private Link" (starts with webcal://)
                        </Text>
                    </View>

                    <Text style={S.label}>Calendar Feed URL</Text>
                    <TextInput
                        style={S.input}
                        placeholder="webcal://app.schoology.com/ical/..."
                        placeholderTextColor={theme.colors.ink3}
                        value={schoologyUrl}
                        onChangeText={text => { setSchoologyUrl(text); setSchoologyResult(null); }}
                        autoCapitalize="none"
                        autoCorrect={false}
                        keyboardType="url"
                    />

                    {schoologyResult && (
                        <View style={[S.resultBanner, {
                            borderColor: schoologyResult.type === 'success' ? theme.colors.green : theme.colors.red,
                            backgroundColor: (schoologyResult.type === 'success' ? theme.colors.green : theme.colors.red) + '14',
                        }]}>
                            <Text style={[S.resultText, { color: schoologyResult.type === 'success' ? theme.colors.green : theme.colors.red }]}>
                                {schoologyResult.message}
                            </Text>
                        </View>
                    )}

                    {!schoologyResult?.type === 'success' && (
                        <TouchableOpacity
                            style={[S.primaryBtn, schoologySyncing && { opacity: 0.6 }]}
                            onPress={handleSchoologySync}
                            disabled={schoologySyncing}
                            activeOpacity={0.85}
                        >
                            {schoologySyncing ? (
                                <ActivityIndicator color={theme.colors.bg} size="small" />
                            ) : (
                                <Text style={S.primaryBtnText}>Connect Schoology</Text>
                            )}
                        </TouchableOpacity>
                    )}

                    {schoologyResult?.type === 'success' && (
                        <TouchableOpacity style={S.continueBtn} onPress={handleContinue} activeOpacity={0.85}>
                            <Check size={18} color={theme.colors.bg} strokeWidth={2.5} />
                            <Text style={S.continueBtnText}>Go to Option</Text>
                        </TouchableOpacity>
                    )}

                    <TouchableOpacity style={S.skipBtn} onPress={handleSkip} activeOpacity={0.6}>
                        <Text style={S.skipText}>Skip for now</Text>
                    </TouchableOpacity>
                </Animated.View>
            </ScrollView>
        </KeyboardAvoidingView>
    );

    // Render Step 3: Done
    const renderDoneStep = () => (
        <View style={[S.container, { justifyContent: 'center', alignItems: 'center', paddingTop: 0 }]}>
            <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }], alignItems: 'center' }}>
                <View style={[S.iconBox, { backgroundColor: theme.colors.green + '14', borderColor: theme.colors.green + '30', marginBottom: 24 }]}>
                    <Check size={48} color={theme.colors.green} strokeWidth={1.8} />
                </View>
                <Text style={[S.heading, { textAlign: 'center' }]}>You're all set!</Text>
                <Text style={[S.subheading, { textAlign: 'center', marginBottom: 32 }]}>
                    Option is now connected to your school accounts. You can always update these settings later.
                </Text>
                <TouchableOpacity style={S.primaryBtn} onPress={handleFinish} activeOpacity={0.85}>
                    <Text style={S.primaryBtnText}>Get Started</Text>
                </TouchableOpacity>
            </Animated.View>
        </View>
    );

    return (
        <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
            {step === 1 && renderStudentVUEStep()}
            {step === 2 && renderSchoologyStep()}
            {step === 3 && renderDoneStep()}
        </View>
    );
}

const getStyles = (theme) => StyleSheet.create({
    scroll: { flexGrow: 1, backgroundColor: theme.colors.bg },
    container: {
        flex: 1,
        paddingHorizontal: 28,
        paddingTop: Platform.OS === 'ios' ? 80 : 60,
        paddingBottom: 48,
        backgroundColor: theme.colors.bg,
    },

    // Step indicator
    stepRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
    stepDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: theme.colors.border },
    stepDotActive: { backgroundColor: theme.colors.green, width: 28, borderRadius: 5 },
    stepDotDone: { backgroundColor: theme.colors.green, width: 10 },
    stepLine: { flex: 1, height: 2, backgroundColor: theme.colors.border, marginHorizontal: 6 },
    stepLineDone: { backgroundColor: theme.colors.green },
    stepLabel: { fontFamily: theme.fonts.m, fontSize: 11, color: theme.colors.ink3, letterSpacing: 0.5, marginBottom: 36 },

    // Icon
    iconWrap: { marginBottom: 24 },
    iconBox: {
        width: 64, height: 64, borderRadius: theme.radii.lg,
        backgroundColor: theme.colors.green + '14',
        borderWidth: 1, borderColor: theme.colors.green + '30',
        alignItems: 'center', justifyContent: 'center',
        ...theme.shadows?.sm,
    },

    // Headings
    heading: { fontFamily: theme.fonts.d, fontSize: 30, fontWeight: '700', color: theme.colors.ink, letterSpacing: -0.5, marginBottom: 10 },
    subheading: { fontFamily: theme.fonts.m, fontSize: 14, color: theme.colors.ink2, lineHeight: 22, marginBottom: 24 },

    // Form
    label: { fontFamily: theme.fonts.m, fontSize: 10, color: theme.colors.ink3, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8, marginTop: 12 },
    input: {
        backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
        borderRadius: theme.radii.lg, paddingHorizontal: 14, paddingVertical: 14,
        fontFamily: theme.fonts.m, fontSize: 14, color: theme.colors.ink,
    },
    picker: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
        borderRadius: theme.radii.lg, paddingHorizontal: 14, paddingVertical: 14,
    },
    pickerText: { flex: 1, fontFamily: theme.fonts.m, fontSize: 14, color: theme.colors.ink },
    pickerPlaceholder: { color: theme.colors.ink3 },

    // Hint box
    hintBox: {
        backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
        borderRadius: theme.radii.lg, padding: 14, marginBottom: 24,
    },
    hintTitle: { fontFamily: theme.fonts.s, fontSize: 12, fontWeight: '600', color: theme.colors.ink2, marginBottom: 4 },
    hintText: { fontFamily: theme.fonts.m, fontSize: 12, color: theme.colors.ink3, lineHeight: 18 },

    // Banners
    infoBanner: { backgroundColor: theme.colors.blue + '08', borderWidth: 1, borderColor: theme.colors.blue + '40', borderRadius: theme.radii.lg, padding: 12, marginTop: 12 },
    infoBannerText: { fontFamily: theme.fonts.m, fontSize: 12, color: theme.colors.blue, lineHeight: 16 },
    resultBanner: { borderWidth: 1, borderRadius: theme.radii.lg, padding: 12, marginTop: 16, marginBottom: 4 },
    resultText: { fontFamily: theme.fonts.m, fontSize: 13, fontWeight: '600', lineHeight: 18 },

    // Buttons
    primaryBtn: {
        backgroundColor: theme.colors.ink, borderRadius: theme.radii.lg, height: 52,
        alignItems: 'center', justifyContent: 'center',
        marginTop: 16, marginBottom: 12, ...theme.shadows?.sm,
    },
    primaryBtnText: { fontFamily: theme.fonts.s, fontSize: 16, fontWeight: '700', color: theme.colors.bg },
    continueBtn: {
        backgroundColor: theme.colors.green, borderRadius: theme.radii.lg, height: 52,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        marginTop: 16, marginBottom: 12, ...theme.shadows?.sm,
    },
    continueBtnText: { fontFamily: theme.fonts.s, fontSize: 16, fontWeight: '700', color: theme.colors.bg },
    skipBtn: { alignItems: 'center', paddingVertical: 12 },
    skipText: { fontFamily: theme.fonts.m, fontSize: 13, color: theme.colors.ink3, textDecorationLine: 'underline', textDecorationColor: theme.colors.border },
});
