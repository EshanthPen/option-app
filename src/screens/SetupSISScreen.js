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
import { Database, Check, ChevronDown } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import DistrictPickerModal from '../components/DistrictPickerModal';
import { parseStudentVueGradebook, parseStudentVuePeriods } from '../utils/studentVueParser';
import { parseFocusSISGrades } from '../utils/focusSISParser';

export default function SetupSISScreen({ onComplete }) {
    const { theme } = useTheme();
    const S = getStyles(theme);

    const [selectedDistrict, setSelectedDistrict] = useState(null);
    const [customUrl, setCustomUrl] = useState('');
    const [svUser, setSvUser] = useState('');
    const [svPass, setSvPass] = useState('');
    const [isPickerVisible, setIsPickerVisible] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState(null);

    const fadeAnim = React.useRef(new Animated.Value(0)).current;
    const slideAnim = React.useRef(new Animated.Value(24)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
            Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
        ]).start();

        (async () => {
            const savedUser = await AsyncStorage.getItem('svUsername');
            if (savedUser) setSvUser(savedUser);
            const savedPass = await AsyncStorage.getItem('svPassword');
            if (savedPass) setSvPass(savedPass);
        })();
    }, []);

    // ── Focus SIS ──────────────────────────────────────────────
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

    // ── StudentVUE (updated 2-step fetch matching latest IntegrationsScreen) ──
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

            const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

            // Step 1 — fetch period list (period index 0 = default / get all)
            const periodsSoap = `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><ProcessWebServiceRequest xmlns="http://edupoint.com/webservices/"><userID>${esc(svUser)}</userID><password>${esc(svPass)}</password><skipLoginLog>1</skipLoginLog><parent>0</parent><webServiceHandleName>PXPWebServices</webServiceHandleName><methodName>Gradebook</methodName><paramStr>&lt;Parms&gt;&lt;ReportPeriod&gt;0&lt;/ReportPeriod&gt;&lt;/Parms&gt;</paramStr></ProcessWebServiceRequest></soap:Body></soap:Envelope>`;

            const periodsResp = await fetch('/api/studentvue', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ targetUrl: finalTargetUrl, soapPayload: periodsSoap }),
            });
            if (!periodsResp.ok) {
                const errData = await periodsResp.json().catch(() => ({}));
                throw new Error(errData?.cause || periodsResp.statusText);
            }
            const periodsXml = await periodsResp.text();
            if (!periodsXml.includes('Gradebook') && periodsXml.includes('RT_ERROR')) throw new Error('API error');

            const { currentPeriodIndex, currentPeriodName } = parseStudentVuePeriods(periodsXml);
            let finalXml = periodsXml;

            // Step 2 — if the active period isn't 0, fetch it specifically
            if (currentPeriodIndex !== 0) {
                const gradesSoap = `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><ProcessWebServiceRequest xmlns="http://edupoint.com/webservices/"><userID>${esc(svUser)}</userID><password>${esc(svPass)}</password><skipLoginLog>1</skipLoginLog><parent>0</parent><webServiceHandleName>PXPWebServices</webServiceHandleName><methodName>Gradebook</methodName><paramStr>&lt;Parms&gt;&lt;ReportPeriod&gt;${currentPeriodIndex}&lt;/ReportPeriod&gt;&lt;/Parms&gt;</paramStr></ProcessWebServiceRequest></soap:Body></soap:Envelope>`;
                const gradesResp = await fetch('/api/studentvue', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ targetUrl: finalTargetUrl, soapPayload: gradesSoap }),
                });
                if (gradesResp.ok) finalXml = await gradesResp.text();
            }

            if (finalXml.includes('Gradebook') || !finalXml.includes('RT_ERROR')) {
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
                    throw new Error("Connected but couldn't parse classes.");
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

    const handleSkip = async () => {
        await AsyncStorage.setItem('setup_sis_done', 'skipped');
        onComplete();
    };

    const handleContinue = async () => {
        await AsyncStorage.setItem('setup_sis_done', 'true');
        onComplete();
    };

    const canContinue = syncResult?.type === 'success';

    return (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <ScrollView
                contentContainerStyle={S.scroll}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                <Animated.View style={[S.container, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>

                    {/* Step indicator */}
                    <View style={S.stepRow}>
                        <View style={[S.stepDot, S.stepDotActive]} />
                        <View style={S.stepLine} />
                        <View style={S.stepDot} />
                    </View>
                    <Text style={S.stepLabel}>Step 1 of 2</Text>

                    {/* Icon */}
                    <View style={S.iconWrap}>
                        <View style={S.iconBox}>
                            <Database size={32} color={theme.colors.green} strokeWidth={1.8} />
                        </View>
                    </View>

                    {/* Headings */}
                    <Text style={S.heading}>Connect your SIS</Text>
                    <Text style={S.subheading}>
                        Link StudentVUE or Focus SIS to automatically sync your grades and assignments into Option.
                    </Text>

                    {/* District picker */}
                    <Text style={S.label}>School District</Text>
                    <TouchableOpacity style={S.picker} onPress={() => setIsPickerVisible(true)}>
                        <Text style={[S.pickerText, !selectedDistrict && S.pickerPlaceholder]}>
                            {selectedDistrict ? selectedDistrict.name : 'Select your school district...'}
                        </Text>
                        <ChevronDown size={16} color={theme.colors.ink3} />
                    </TouchableOpacity>

                    {/* Custom URL */}
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

                    {/* Focus SIS info */}
                    {selectedDistrict?.focusSIS && (
                        <View style={S.infoBanner}>
                            <Text style={S.infoBannerText}>
                                This school uses Focus SIS. Your credentials are sent directly to your school's server — never stored by Option.
                            </Text>
                        </View>
                    )}

                    {/* Credentials */}
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

                    {/* Result banner */}
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

                    {/* Sync button */}
                    {!canContinue && (
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

                    {/* Continue after success */}
                    {canContinue && (
                        <TouchableOpacity style={S.continueBtn} onPress={handleContinue} activeOpacity={0.85}>
                            <Check size={18} color={theme.colors.bg} strokeWidth={2.5} />
                            <Text style={S.continueBtnText}>Continue</Text>
                        </TouchableOpacity>
                    )}

                    {/* Skip */}
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
        width: 64, height: 64, borderRadius: 18,
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
        borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14,
        fontFamily: theme.fonts.m, fontSize: 14, color: theme.colors.ink,
    },
    picker: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
        borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14,
    },
    pickerText: { flex: 1, fontFamily: theme.fonts.m, fontSize: 14, color: theme.colors.ink },
    pickerPlaceholder: { color: theme.colors.ink3 },

    // Banners
    infoBanner: { backgroundColor: theme.colors.blue + '08', borderWidth: 1, borderColor: theme.colors.blue + '40', borderRadius: 10, padding: 12, marginTop: 12 },
    infoBannerText: { fontFamily: theme.fonts.m, fontSize: 12, color: theme.colors.blue, lineHeight: 16 },
    resultBanner: { borderWidth: 1, borderRadius: 10, padding: 12, marginTop: 16, marginBottom: 4 },
    resultText: { fontFamily: theme.fonts.m, fontSize: 13, fontWeight: '600', lineHeight: 18 },

    // Buttons
    primaryBtn: {
        backgroundColor: theme.colors.ink, borderRadius: 12, height: 52,
        alignItems: 'center', justifyContent: 'center',
        marginTop: 16, marginBottom: 12, ...theme.shadows?.sm,
    },
    primaryBtnText: { fontFamily: theme.fonts.s, fontSize: 16, fontWeight: '700', color: theme.colors.bg },
    continueBtn: {
        backgroundColor: theme.colors.green, borderRadius: 12, height: 52,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        marginTop: 16, marginBottom: 12, ...theme.shadows?.sm,
    },
    continueBtnText: { fontFamily: theme.fonts.s, fontSize: 16, fontWeight: '700', color: theme.colors.bg },
    skipBtn: { alignItems: 'center', paddingVertical: 12 },
    skipText: { fontFamily: theme.fonts.m, fontSize: 13, color: theme.colors.ink3, textDecorationLine: 'underline', textDecorationColor: theme.colors.border },
});
