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
import { BookOpen, Check, ChevronRight } from 'lucide-react-native';
import { supabase } from '../supabaseClient';
import { getDeviceId } from '../utils/auth';
import ICAL from 'ical.js';
import { useTheme } from '../context/ThemeContext';

export default function SetupSchoologyScreen({ onComplete }) {
    const { theme } = useTheme();
    const S = getStyles(theme);

    const [schoologyUrl, setSchoologyUrl] = useState('');
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState(null);
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
            const saved = await AsyncStorage.getItem('schoologyUrl');
            if (saved) setSchoologyUrl(saved);
        })();
    }, []);

    const handleSync = async () => {
        if (!schoologyUrl.trim()) {
            setSyncResult({ type: 'error', message: 'Please enter your Schoology calendar link first.' });
            return;
        }
        setIsSyncing(true);
        setSyncResult(null);

        const input = schoologyUrl.trim();
        const urlRegex = /(?:webcal|https?):\/\/[^\s"'<>]+(?:\.(?:ics|php)[^\s"'<>]*|\/calendar\/feed\/ical\/[^\s"'<>]*)/gi;
        const matches = input.match(urlRegex);
        let cleanUrl = matches ? matches[matches.length - 1] : input;
        // Handle malformed URLs missing the protocol
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
                setSyncResult({ type: 'error', message: 'Sync failed: Ensure the link is valid.' });
                setIsSyncing(false);
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

            // Save the URL
            await AsyncStorage.setItem('schoologyUrl', schoologyUrl.trim());
            if (deviceId) {
                await supabase
                    .from('settings')
                    .upsert({ user_id: deviceId, schoology_url: schoologyUrl.trim() }, { onConflict: 'user_id' });
            }

            // Parse & import assignments
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
                    setSyncResult({ type: 'success', message: msg });
                } else {
                    setSyncResult({ type: 'success', message: `✓ Connected! All ${imported.length} assignments already imported.` });
                }
            } else {
                setSyncResult({
                    type: 'success',
                    message: '✓ Connected! No upcoming assignments found yet.',
                });
            }
        } catch (err) {
            setSyncResult({ type: 'error', message: `Sync failed: ${err.message}` });
        } finally {
            setIsSyncing(false);
        }
    };

    const handleSkip = async () => {
        await AsyncStorage.setItem('setup_schoology_done', 'skipped');
        onComplete();
    };

    const handleContinue = async () => {
        await AsyncStorage.setItem('setup_schoology_done', 'true');
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
                        <View style={[S.stepDot, S.stepDotDone]} />
                        <View style={[S.stepLine, S.stepLineDone]} />
                        <View style={[S.stepDot, S.stepDotActive]} />
                    </View>
                    <Text style={S.stepLabel}>Step 2 of 2</Text>

                    {/* Icon */}
                    <View style={S.iconWrap}>
                        <View style={S.iconBox}>
                            <BookOpen size={32} color={theme.colors.orange} strokeWidth={1.8} />
                        </View>
                    </View>

                    {/* Headings */}
                    <Text style={S.heading}>Connect Schoology</Text>
                    <Text style={S.subheading}>
                        Paste your Schoology calendar feed URL so Option can automatically import your assignments.
                    </Text>

                    {/* How-to hint */}
                    <View style={S.hintBox}>
                        <Text style={S.hintTitle}>How to find your calendar link</Text>
                        <Text style={S.hintText}>
                            In Schoology → Calendar → Subscribe → Copy the "Private Link" (starts with webcal://)
                        </Text>
                    </View>

                    {/* Input */}
                    <Text style={S.label}>Calendar Feed URL</Text>
                    <TextInput
                        style={S.input}
                        placeholder="webcal://app.schoology.com/ical/..."
                        placeholderTextColor={theme.colors.ink3}
                        value={schoologyUrl}
                        onChangeText={text => { setSchoologyUrl(text); setSyncResult(null); }}
                        autoCapitalize="none"
                        autoCorrect={false}
                        keyboardType="url"
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
                            onPress={handleSync}
                            disabled={isSyncing}
                            activeOpacity={0.85}
                        >
                            {isSyncing ? (
                                <ActivityIndicator color={theme.colors.bg} size="small" />
                            ) : (
                                <Text style={S.primaryBtnText}>Connect Schoology</Text>
                            )}
                        </TouchableOpacity>
                    )}

                    {/* Continue after success */}
                    {canContinue && (
                        <TouchableOpacity style={S.continueBtn} onPress={handleContinue} activeOpacity={0.85}>
                            <Check size={18} color={theme.colors.bg} strokeWidth={2.5} />
                            <Text style={S.continueBtnText}>Go to Option</Text>
                            <ChevronRight size={18} color={theme.colors.bg} strokeWidth={2.5} />
                        </TouchableOpacity>
                    )}

                    {/* Skip */}
                    <TouchableOpacity style={S.skipBtn} onPress={handleSkip} activeOpacity={0.6}>
                        <Text style={S.skipText}>Skip for now</Text>
                    </TouchableOpacity>
                </Animated.View>
            </ScrollView>
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
    stepDotActive: { backgroundColor: theme.colors.orange, width: 28, borderRadius: 5 },
    stepDotDone: { backgroundColor: theme.colors.green, width: 10 },
    stepLine: { flex: 1, height: 2, backgroundColor: theme.colors.border, marginHorizontal: 6 },
    stepLineDone: { backgroundColor: theme.colors.green },
    stepLabel: { fontFamily: theme.fonts.m, fontSize: 11, color: theme.colors.ink3, letterSpacing: 0.5, marginBottom: 36 },

    // Icon
    iconWrap: { marginBottom: 24 },
    iconBox: {
        width: 64, height: 64, borderRadius: 18,
        backgroundColor: theme.colors.orange + '14',
        borderWidth: 1, borderColor: theme.colors.orange + '30',
        alignItems: 'center', justifyContent: 'center',
        ...theme.shadows?.sm,
    },

    // Headings
    heading: { fontFamily: theme.fonts.d, fontSize: 30, fontWeight: '700', color: theme.colors.ink, letterSpacing: -0.5, marginBottom: 10 },
    subheading: { fontFamily: theme.fonts.m, fontSize: 14, color: theme.colors.ink2, lineHeight: 22, marginBottom: 24 },

    // Hint box
    hintBox: {
        backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
        borderRadius: 12, padding: 14, marginBottom: 24,
    },
    hintTitle: { fontFamily: theme.fonts.s, fontSize: 12, fontWeight: '600', color: theme.colors.ink2, marginBottom: 4 },
    hintText: { fontFamily: theme.fonts.m, fontSize: 12, color: theme.colors.ink3, lineHeight: 18 },

    // Form
    label: { fontFamily: theme.fonts.m, fontSize: 10, color: theme.colors.ink3, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 },
    input: {
        backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
        borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14,
        fontFamily: theme.fonts.m, fontSize: 14, color: theme.colors.ink, marginBottom: 16,
    },

    // Banners
    resultBanner: { borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 16 },
    resultText: { fontFamily: theme.fonts.m, fontSize: 13, fontWeight: '600', lineHeight: 18 },

    // Buttons
    primaryBtn: {
        backgroundColor: theme.colors.ink, borderRadius: 12, height: 52,
        alignItems: 'center', justifyContent: 'center',
        marginBottom: 12, ...theme.shadows?.sm,
    },
    primaryBtnText: { fontFamily: theme.fonts.s, fontSize: 16, fontWeight: '700', color: theme.colors.bg },
    continueBtn: {
        backgroundColor: theme.colors.green, borderRadius: 12, height: 52,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        marginBottom: 12, ...theme.shadows?.sm,
    },
    continueBtnText: { fontFamily: theme.fonts.s, fontSize: 16, fontWeight: '700', color: theme.colors.bg },
    skipBtn: { alignItems: 'center', paddingVertical: 12 },
    skipText: { fontFamily: theme.fonts.m, fontSize: 13, color: theme.colors.ink3, textDecorationLine: 'underline', textDecorationColor: theme.colors.border },
});
