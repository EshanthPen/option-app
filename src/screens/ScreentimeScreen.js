import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
    Play, Pause, RotateCcw, Coffee, BookOpen, Flame, Clock, TrendingUp,
    Download, X, Target, Smartphone, Shield, CheckCircle2, History,
    Camera, Globe, MessageCircle, Video,
} from 'lucide-react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTheme } from '../context/ThemeContext';
import {
    recordPomodoroSession, getWeeklyPomodoroData, computeFocusScore,
    getScoreLabel, getStreak,
} from '../utils/focusScoreEngine';
import BlacklistManager from '../components/BlacklistManager';
import { supabase } from '../utils/auth';
import { TopBar, Card, Button, Badge, SectionLabel, SEM, gradeColor } from '../components/DesignKit';

const PRESETS = [15, 25, 45, 60];
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function ScreentimeScreen() {
    const { theme } = useTheme();
    const [preset, setPreset] = useState(25);
    const [seconds, setSeconds] = useState(25 * 60);
    const [isActive, setIsActive] = useState(false);
    const [mode, setMode] = useState('Work');

    const [score, setScore] = useState(0);
    const [scoreLabel, setScoreLabel] = useState('');
    const [streak, setStreak] = useState(0);
    const [weeklyHours, setWeeklyHours] = useState([0, 0, 0, 0, 0, 0, 0]);
    const [weeklyTotalMin, setWeeklyTotalMin] = useState(0);
    const [todaySessions, setTodaySessions] = useState([]);

    const [blacklist, setBlacklist] = useState([]);
    const [showBanner, setShowBanner] = useState(Platform.OS === 'web');

    const intervalRef = useRef();

    const focusColor = score >= 70 ? SEM.green : score >= 50 ? SEM.orange : SEM.red;

    // ── Blacklist & block sync ──────────────────────────────────
    useEffect(() => {
        (async () => {
            try {
                const stored = await AsyncStorage.getItem('@focus_blacklist');
                if (stored) setBlacklist(JSON.parse(stored));
            } catch {}
        })();
        syncToDB(false);
        return () => syncToDB(false);
    }, []);

    const saveBlacklist = async (next) => {
        setBlacklist(next);
        await AsyncStorage.setItem('@focus_blacklist', JSON.stringify(next));
    };

    const syncToDB = async (focused) => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            await supabase.from('profiles').update({ is_focused: focused, blacklist }).eq('id', user.id);
            if (Platform.OS === 'web' && window) {
                window.postMessage({ type: 'SYNC_BLOCKER', payload: { isFocused: focused, blacklist } }, '*');
            }
        } catch {}
    };

    // ── Load focus data ─────────────────────────────────────────
    useFocusEffect(
        useCallback(() => {
            (async () => {
                try {
                    const pomData = await getWeeklyPomodoroData();
                    setWeeklyHours(pomData.dailyHours);
                    setWeeklyTotalMin(pomData.totalMinutes);

                    const { score: s } = await computeFocusScore();
                    setScore(s);
                    setScoreLabel(getScoreLabel(s));

                    const sd = await getStreak();
                    setStreak(sd.currentStreak || 0);

                    // Today's pomodoro sessions
                    const raw = await AsyncStorage.getItem('@pomodoro_sessions');
                    const all = raw ? JSON.parse(raw) : [];
                    const today = new Date().toISOString().slice(0, 10);
                    const ts = all
                        .filter(s => s.date === today)
                        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
                        .slice(0, 5);
                    setTodaySessions(ts);
                } catch (e) { console.error('Focus load:', e); }
            })();
        }, [])
    );

    // ── Timer ───────────────────────────────────────────────────
    useEffect(() => {
        if (isActive && seconds > 0) {
            intervalRef.current = setInterval(() => setSeconds(s => s > 0 ? s - 1 : 0), 1000);
        } else {
            clearInterval(intervalRef.current);
        }
        return () => clearInterval(intervalRef.current);
    }, [isActive, seconds]);

    useEffect(() => {
        if (seconds === 0 && isActive) {
            if (mode === 'Work') {
                recordPomodoroSession(preset).then(async () => {
                    const pomData = await getWeeklyPomodoroData();
                    setWeeklyHours(pomData.dailyHours);
                    setWeeklyTotalMin(pomData.totalMinutes);
                    const { score: ns } = await computeFocusScore(true);
                    setScore(ns);
                    setScoreLabel(getScoreLabel(ns));
                }).catch(console.error);
                setMode('Break');
                setSeconds(5 * 60);
            } else {
                setMode('Work');
                setSeconds(preset * 60);
            }
            setIsActive(false);
            syncToDB(false);
        }
    }, [seconds, isActive, mode, preset]);

    const toggle = () => {
        if (!isActive && mode === 'Work') syncToDB(true);
        else if (isActive) syncToDB(false);
        setIsActive(a => !a);
    };

    const reset = () => {
        setIsActive(false);
        syncToDB(false);
        setSeconds(mode === 'Work' ? preset * 60 : 5 * 60);
    };

    const setPresetAndReset = (p) => {
        setIsActive(false);
        setPreset(p);
        setSeconds(p * 60);
        setMode('Work');
    };

    const mins = String(Math.floor(seconds / 60)).padStart(2, '0');
    const secs = String(seconds % 60).padStart(2, '0');
    const totalSec = (mode === 'Work' ? preset * 60 : 5 * 60);
    const progress = 1 - seconds / totalSec;

    // ── Mock screen-time apps (would come from native screen-time API) ──
    const apps = [
        { name: 'Instagram', time: '2h 14m', color: SEM.red,    icon: Camera,         pct: 85 },
        { name: 'YouTube',   time: '1h 32m', color: SEM.orange, icon: Play,           pct: 65 },
        { name: 'Safari',    time: '48m',    color: SEM.blue,   icon: Globe,          pct: 35 },
        { name: 'Messages',  time: '24m',    color: SEM.green,  icon: MessageCircle,  pct: 18 },
        { name: 'TikTok',    time: '18m',    color: SEM.purple, icon: Video,          pct: 12 },
    ];

    return (
        <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
            <TopBar
                title="Focus"
                subtitle="Stay locked in · Today's sessions, screen time, and your focus score"
                actions={<Button variant="primary" icon={Play} onPress={toggle}>{isActive ? 'Pause' : 'Start session'}</Button>}
            />

            <ScrollView contentContainerStyle={{ padding: 28, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
                <View style={{ maxWidth: 1200, alignSelf: 'center', width: '100%' }}>

                    {/* ── Chrome extension banner (web only, dismissable) ── */}
                    {showBanner && (
                        <View style={{
                            flexDirection: 'row', alignItems: 'center', gap: 12,
                            padding: 14,
                            backgroundColor: theme.colors.surface,
                            borderRadius: theme.radii.lg,
                            borderWidth: 1, borderColor: theme.colors.border,
                            marginBottom: 20,
                        }}>
                            <View style={{
                                width: 36, height: 36, borderRadius: 9,
                                backgroundColor: SEM.blue + '18',
                                alignItems: 'center', justifyContent: 'center',
                            }}>
                                <Download size={18} color={SEM.blue} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={{ fontFamily: theme.fonts.s, fontSize: 13, fontWeight: '600', color: theme.colors.ink }}>
                                    Get the Chrome extension
                                </Text>
                                <Text style={{ fontFamily: theme.fonts.m, fontSize: 12, color: theme.colors.ink3, marginTop: 2 }}>
                                    The website blocker requires our official Chrome extension to safely lock your browser.
                                </Text>
                            </View>
                            <TouchableOpacity onPress={() => setShowBanner(false)}>
                                <X size={16} color={theme.colors.ink3} />
                            </TouchableOpacity>
                        </View>
                    )}

                    {/* ── Top row: Pomodoro + Score ── */}
                    <View style={{ flexDirection: 'row', gap: 24, marginBottom: 24 }}>

                        {/* Pomodoro Card */}
                        <Card padding={32} style={{ flex: 1.2, alignItems: 'center' }}>
                            <Text style={{
                                fontFamily: theme.fonts.s, fontSize: 11, fontWeight: '700',
                                color: theme.colors.ink3, textTransform: 'uppercase', letterSpacing: 1.5,
                                marginBottom: 20,
                            }}>
                                Pomodoro
                            </Text>

                            {/* Circular progress */}
                            <View style={{ position: 'relative', width: 240, height: 240 }}>
                                <Svg width="240" height="240" style={{ transform: [{ rotate: '-90deg' }] }}>
                                    <Circle cx="120" cy="120" r="100" fill="none" stroke={theme.colors.surface2} strokeWidth="10" />
                                    <Circle
                                        cx="120" cy="120" r="100" fill="none"
                                        stroke={mode === 'Work' ? SEM.green : SEM.orange}
                                        strokeWidth="10"
                                        strokeDasharray={2 * Math.PI * 100}
                                        strokeDashoffset={2 * Math.PI * 100 * (1 - progress)}
                                        strokeLinecap="round"
                                    />
                                </Svg>
                                <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' }}>
                                    <Text style={{
                                        fontFamily: theme.fonts.mono, fontSize: 56, fontWeight: '500',
                                        color: theme.colors.ink, letterSpacing: -2,
                                    }}>
                                        {mins}:{secs}
                                    </Text>
                                    <Text style={{ fontFamily: theme.fonts.m, fontSize: 12, color: theme.colors.ink3, marginTop: 4 }}>
                                        {isActive ? `${mode === 'Work' ? 'Focusing' : 'On break'}…` : mode === 'Work' ? 'Ready to focus' : 'Break paused'}
                                    </Text>
                                </View>
                            </View>

                            {/* Preset row */}
                            <View style={{ flexDirection: 'row', gap: 8, marginTop: 24 }}>
                                {PRESETS.map((p) => {
                                    const active = preset === p;
                                    return (
                                        <TouchableOpacity
                                            key={p}
                                            onPress={() => setPresetAndReset(p)}
                                            activeOpacity={0.85}
                                            style={{
                                                paddingHorizontal: 14, paddingVertical: 7,
                                                borderRadius: 8,
                                                backgroundColor: active ? theme.colors.ink : theme.colors.surface2,
                                            }}
                                        >
                                            <Text style={{
                                                fontFamily: theme.fonts.s, fontSize: 12, fontWeight: '600',
                                                color: active ? theme.colors.bg : theme.colors.ink2,
                                            }}>
                                                {p} min
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>

                            {/* Action buttons */}
                            <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'center', marginTop: 20 }}>
                                <Button
                                    variant={isActive ? 'danger' : 'primary'}
                                    size="lg"
                                    icon={isActive ? Pause : Play}
                                    onPress={toggle}
                                >
                                    {isActive ? 'Pause' : 'Start focus'}
                                </Button>
                                <Button variant="secondary" size="lg" icon={RotateCcw} onPress={reset}>
                                    Reset
                                </Button>
                            </View>

                            {/* Blocking apps indicator */}
                            {isActive && mode === 'Work' && (
                                <View style={{
                                    flexDirection: 'row', alignItems: 'center', gap: 8,
                                    padding: 10, paddingHorizontal: 14,
                                    backgroundColor: SEM.red + '12', borderRadius: 8,
                                    marginTop: 20,
                                }}>
                                    <Shield size={14} color={SEM.red} />
                                    <Text style={{ fontFamily: theme.fonts.s, fontSize: 12, color: SEM.red, fontWeight: '600' }}>
                                        Blocking distracting apps
                                    </Text>
                                </View>
                            )}
                        </Card>

                        {/* Focus Score breakdown */}
                        <Card padding={24} style={{ flex: 1 }}>
                            <Text style={{
                                fontFamily: theme.fonts.s, fontSize: 11, color: theme.colors.ink3,
                                textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: '700',
                            }}>
                                Focus Score · This Week
                            </Text>
                            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 10 }}>
                                <Text style={{ fontFamily: theme.fonts.d, fontSize: 56, fontWeight: '700', color: focusColor, letterSpacing: -2 }}>
                                    {score}
                                </Text>
                                <Text style={{ fontFamily: theme.fonts.m, fontSize: 15, color: theme.colors.ink3 }}>/ 100</Text>
                                <View style={{
                                    marginLeft: 'auto', paddingHorizontal: 10, paddingVertical: 4,
                                    backgroundColor: focusColor + '15', borderRadius: 6,
                                }}>
                                    <Text style={{ fontFamily: theme.fonts.s, fontSize: 12, color: focusColor, fontWeight: '600' }}>
                                        {scoreLabel || 'Keep going'}
                                    </Text>
                                </View>
                            </View>
                            <Text style={{ fontFamily: theme.fonts.m, fontSize: 13, color: theme.colors.ink3, marginTop: 6 }}>
                                Your focus score is computed from study time, streak, and consistency.
                            </Text>

                            {/* Sub-metrics */}
                            <View style={{ marginTop: 22, gap: 14 }}>
                                {[
                                    { label: 'Weekly study',   val: Math.min(100, Math.round(weeklyTotalMin / 6)), total: `${Math.floor(weeklyTotalMin / 60)}h ${weeklyTotalMin % 60}m`, icon: Clock,        color: SEM.blue,   desc: weeklyTotalMin > 300 ? 'Target met' : 'Target: 5h+/week' },
                                    { label: 'Daily streak',   val: Math.min(100, streak * 10),                    total: `${streak}d`,                                                  icon: Flame,        color: SEM.orange, desc: streak >= 7 ? 'Excellent consistency' : 'Keep going!' },
                                    { label: 'Sessions today', val: Math.min(100, todaySessions.length * 25),       total: String(todaySessions.length),                                  icon: CheckCircle2, color: SEM.green,  desc: todaySessions.length >= 3 ? 'Great progress' : 'Aim for 3+ sessions' },
                                    { label: 'Apps blocked',   val: Math.min(100, blacklist.length * 10),           total: String(blacklist.length),                                       icon: Shield,       color: SEM.purple, desc: 'Apps in your blocklist' },
                                ].map((m, i) => {
                                    const Icon = m.icon;
                                    return (
                                        <View key={i}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                                <View style={{
                                                    width: 24, height: 24, borderRadius: 6,
                                                    backgroundColor: m.color + '15',
                                                    alignItems: 'center', justifyContent: 'center',
                                                }}>
                                                    <Icon size={13} color={m.color} />
                                                </View>
                                                <Text style={{ fontFamily: theme.fonts.s, fontSize: 13, color: theme.colors.ink, fontWeight: '500' }}>
                                                    {m.label}
                                                </Text>
                                                <Text style={{ marginLeft: 'auto', fontFamily: theme.fonts.mono, fontSize: 12, color: theme.colors.ink }}>
                                                    {m.total}
                                                </Text>
                                            </View>
                                            <View style={{ height: 6, backgroundColor: theme.colors.surface2, borderRadius: 3, overflow: 'hidden' }}>
                                                <View style={{ width: `${m.val}%`, height: '100%', backgroundColor: m.color, borderRadius: 3 }} />
                                            </View>
                                            <Text style={{ fontFamily: theme.fonts.m, fontSize: 10, color: theme.colors.ink3, marginTop: 3 }}>
                                                {m.desc}
                                            </Text>
                                        </View>
                                    );
                                })}
                            </View>
                        </Card>
                    </View>

                    {/* ── Bottom row: Today's sessions + Screen time ── */}
                    <View style={{ flexDirection: 'row', gap: 24, marginBottom: 24 }}>

                        {/* Today's sessions */}
                        <Card padding={20} style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                                <History size={16} color={theme.colors.ink} strokeWidth={2.4} />
                                <Text style={{ fontFamily: theme.fonts.s, fontSize: 15, fontWeight: '600', color: theme.colors.ink, flex: 1 }}>
                                    Today's sessions
                                </Text>
                                <Text style={{ fontFamily: theme.fonts.m, fontSize: 11, color: theme.colors.ink3 }}>
                                    {todaySessions.length} · {todaySessions.reduce((sum, s) => sum + (s.minutes || 0), 0)} min total
                                </Text>
                            </View>
                            {todaySessions.length === 0 ? (
                                <Text style={{ fontFamily: theme.fonts.m, fontSize: 13, color: theme.colors.ink3, padding: 12, textAlign: 'center' }}>
                                    No sessions yet today. Hit Start to log your first one.
                                </Text>
                            ) : todaySessions.map((s, i, arr) => {
                                const t = new Date(s.timestamp || Date.now());
                                const when = t.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
                                return (
                                    <View key={i} style={{
                                        flexDirection: 'row', alignItems: 'center', gap: 12,
                                        paddingVertical: 10,
                                        borderBottomWidth: i < arr.length - 1 ? 1 : 0,
                                        borderBottomColor: theme.colors.border,
                                    }}>
                                        <View style={{
                                            width: 32, height: 32, borderRadius: 8,
                                            backgroundColor: SEM.green + '18',
                                            alignItems: 'center', justifyContent: 'center',
                                        }}>
                                            <CheckCircle2 size={16} color={SEM.green} />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={{ fontFamily: theme.fonts.s, fontSize: 13, fontWeight: '600', color: theme.colors.ink }}>
                                                {s.label || 'Pomodoro'}
                                            </Text>
                                            <Text style={{ fontFamily: theme.fonts.m, fontSize: 11, color: theme.colors.ink3, marginTop: 2 }}>
                                                {when} · Pomodoro
                                            </Text>
                                        </View>
                                        <Badge color={SEM.green}>{s.minutes}m</Badge>
                                    </View>
                                );
                            })}
                        </Card>

                        {/* Screen time */}
                        <Card padding={20} style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                                <Smartphone size={16} color={theme.colors.ink} strokeWidth={2.4} />
                                <Text style={{ fontFamily: theme.fonts.s, fontSize: 15, fontWeight: '600', color: theme.colors.ink, flex: 1 }}>
                                    Screen time · today
                                </Text>
                                <Text style={{ fontFamily: theme.fonts.m, fontSize: 10, color: theme.colors.ink4, fontStyle: 'italic' }}>
                                    Sample
                                </Text>
                            </View>
                            {apps.map((a, i) => {
                                const Icon = a.icon;
                                return (
                                    <View key={i} style={{ marginBottom: i < apps.length - 1 ? 12 : 0 }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                                            <View style={{
                                                width: 24, height: 24, borderRadius: 6,
                                                backgroundColor: a.color + '18',
                                                alignItems: 'center', justifyContent: 'center',
                                            }}>
                                                <Icon size={12} color={a.color} />
                                            </View>
                                            <Text style={{ fontFamily: theme.fonts.s, fontSize: 12, fontWeight: '500', color: theme.colors.ink, flex: 1 }}>
                                                {a.name}
                                            </Text>
                                            <Text style={{ fontFamily: theme.fonts.mono, fontSize: 11, color: theme.colors.ink3 }}>
                                                {a.time}
                                            </Text>
                                        </View>
                                        <View style={{ height: 4, backgroundColor: theme.colors.surface2, borderRadius: 2, overflow: 'hidden', marginLeft: 34 }}>
                                            <View style={{ width: `${a.pct}%`, height: '100%', backgroundColor: a.color, borderRadius: 2 }} />
                                        </View>
                                    </View>
                                );
                            })}
                        </Card>
                    </View>

                    {/* ── Weekly bar chart (simple SVG) ── */}
                    <Card padding={20} style={{ marginBottom: 24 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                            <TrendingUp size={16} color={theme.colors.ink} strokeWidth={2.4} />
                            <Text style={{ fontFamily: theme.fonts.s, fontSize: 15, fontWeight: '600', color: theme.colors.ink, flex: 1 }}>
                                This week
                            </Text>
                            <Text style={{ fontFamily: theme.fonts.m, fontSize: 11, color: theme.colors.ink3 }}>
                                {Math.floor(weeklyTotalMin / 60)}h {weeklyTotalMin % 60}m total
                            </Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 100 }}>
                            {weeklyHours.map((h, i) => {
                                const maxH = Math.max(...weeklyHours, 1);
                                const heightPct = h / maxH;
                                return (
                                    <View key={i} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
                                        <View style={{
                                            width: '100%', height: `${heightPct * 100}%`,
                                            backgroundColor: h > 0 ? SEM.green : theme.colors.surface2,
                                            borderRadius: 4,
                                            minHeight: 4,
                                        }} />
                                        <Text style={{ fontFamily: theme.fonts.mono, fontSize: 9, color: theme.colors.ink3 }}>
                                            {DAY_LABELS[i]}
                                        </Text>
                                    </View>
                                );
                            })}
                        </View>
                    </Card>

                    {/* ── Blocked sites manager ── */}
                    <Card padding={20}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                            <Shield size={16} color={theme.colors.ink} strokeWidth={2.4} />
                            <Text style={{ fontFamily: theme.fonts.s, fontSize: 15, fontWeight: '600', color: theme.colors.ink, flex: 1 }}>
                                Blocked sites
                            </Text>
                        </View>
                        <BlacklistManager
                            blacklist={blacklist}
                            onAdd={(d) => saveBlacklist([...blacklist, d])}
                            onRemove={(d) => saveBlacklist(blacklist.filter(x => x !== d))}
                            theme={theme}
                        />
                    </Card>
                </View>
            </ScrollView>
        </View>
    );
}
