import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions, Animated
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LineChart, BarChart } from 'react-native-chart-kit';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { theme as staticTheme } from '../utils/theme';
import { useTheme } from '../context/ThemeContext';
import { Play, Pause, RotateCcw, Coffee, BookOpen, Flame, Clock, TrendingUp } from 'lucide-react-native';
import { recordPomodoroSession, getWeeklyPomodoroData, computeFocusScore, getScoreLabel, getStreak } from '../utils/focusScoreEngine';
import BlacklistManager from '../components/BlacklistManager';

const screenWidth = Dimensions.get('window').width;

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const scoreColor = (s, theme) => s >= 80 ? theme.colors.green : s >= 60 ? theme.colors.blue : s >= 40 ? theme.colors.orange : theme.colors.red;

export default function ScreentimeScreen() {
    const { theme, isDarkMode } = useTheme();
    const styles = getStyles(theme);
    const [timeLeft, setTimeLeft] = useState(25 * 60);
    const [isActive, setIsActive] = useState(false);
    const [mode, setMode] = useState('Work');
    const [sessionsCompleted, setSessionsCompleted] = useState(0);
    const [weeklyHours, setWeeklyHours] = useState([0, 0, 0, 0, 0, 0, 0]);
    const [score, setScore] = useState(0);
    const [scoreText, setScoreText] = useState('');
    const [blacklist, setBlacklist] = useState([]);
    const [streak, setStreak] = useState(0);
    const [weeklyTotalMin, setWeeklyTotalMin] = useState(0);
    const [monthlyMinutes, setMonthlyMinutes] = useState(0);
    const [lastMonthMinutes, setLastMonthMinutes] = useState(0);
    
    // Load Blacklist
    useEffect(() => {
        const loadBlacklist = async () => {
            try {
                const stored = await AsyncStorage.getItem('@focus_blacklist');
                if (stored) setBlacklist(JSON.parse(stored));
            } catch (e) { console.error('Error loading blacklist', e); }
        };
        loadBlacklist();
        // Ensure unblocked on mount
        unblockWebsites();
        
        return () => { unblockWebsites(); }; // cleanup
    }, []);

    const saveBlacklist = async (newList) => {
        try {
            setBlacklist(newList);
            await AsyncStorage.setItem('@focus_blacklist', JSON.stringify(newList));
        } catch (e) { console.error('Error saving blacklist', e); }
    };

    const handleAddDomain = (domain) => saveBlacklist([...blacklist, domain]);
    const handleRemoveDomain = (domain) => saveBlacklist(blacklist.filter(d => d !== domain));

    const blockWebsites = async () => {
        if (blacklist.length === 0) return;
        try {
            await fetch('http://localhost:3000/block', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ domains: blacklist })
            });
        } catch (e) { console.error('Failed to trigger blocker api:', e); }
    };

    const unblockWebsites = async () => {
        try {
            await fetch('http://localhost:3000/unblock', { method: 'POST' });
        } catch (e) { console.error('Failed to trigger unblocker api:', e); }
    };

    const ringAnim = useRef(new Animated.Value(0)).current;

    // Load real pomodoro data on screen focus
    useFocusEffect(
        useCallback(() => {
            const loadData = async () => {
                try {
                    const pomData = await getWeeklyPomodoroData();
                    setWeeklyHours(pomData.dailyHours);
                    setWeeklyTotalMin(pomData.totalMinutes);

                    const { score: focusScore } = await computeFocusScore();
                    setScore(focusScore);
                    setScoreText(getScoreLabel(focusScore));

                    // Load streak
                    const streakData = await getStreak();
                    setStreak(streakData.currentStreak || 0);

                    // Load monthly pomodoro data
                    const raw = await AsyncStorage.getItem('@pomodoro_sessions');
                    const sessions = raw ? JSON.parse(raw) : [];
                    const now = new Date();
                    const thisMonthStr = now.toISOString().slice(0, 7); // "YYYY-MM"
                    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                    const lastMonthStr = lastMonth.toISOString().slice(0, 7);

                    const thisMonthMin = sessions
                        .filter(s => s.date.startsWith(thisMonthStr))
                        .reduce((sum, s) => sum + s.minutes, 0);
                    const lastMonthMin = sessions
                        .filter(s => s.date.startsWith(lastMonthStr))
                        .reduce((sum, s) => sum + s.minutes, 0);

                    setMonthlyMinutes(thisMonthMin);
                    setLastMonthMinutes(lastMonthMin);
                } catch (err) {
                    console.error('ScreentimeScreen load error:', err);
                }
            };
            loadData();
        }, [])
    );

    useEffect(() => {
        Animated.timing(ringAnim, {
            toValue: score / 100,
            duration: 1200,
            useNativeDriver: false,
        }).start();
    }, [score]);

    useEffect(() => {
        let interval = null;
        if (isActive && timeLeft > 0) {
            interval = setInterval(() => setTimeLeft(t => t - 1), 1000);
        } else if (timeLeft === 0) {
            clearInterval(interval);
            if (mode === 'Work') {
                setSessionsCompleted(s => s + 1);
                // Persist completed pomodoro session
                recordPomodoroSession(25).then(async () => {
                    const pomData = await getWeeklyPomodoroData();
                    setWeeklyHours(pomData.dailyHours);
                    const { score: newScore } = await computeFocusScore(true);
                    setScore(newScore);
                    setScoreText(getScoreLabel(newScore));
                }).catch(err => console.error('Failed to record session:', err));
                setMode('Break');
                setTimeLeft(5 * 60);
            } else {
                setMode('Work');
                setTimeLeft(25 * 60);
            }
            setIsActive(false);
        }
        return () => clearInterval(interval);
    }, [isActive, timeLeft, mode]);

    const toggleTimer = () => {
        if (!isActive && mode === 'Work') {
            blockWebsites();
        } else if (isActive) {
            unblockWebsites();
        }
        setIsActive(a => !a);
    };

    const resetTimer = () => {
        setIsActive(false);
        unblockWebsites();
        setTimeLeft(mode === 'Work' ? 25 * 60 : 5 * 60);
    };

    const switchMode = () => {
        setIsActive(false);
        unblockWebsites();
        const next = mode === 'Work' ? 'Break' : 'Work';
        setMode(next);
        setTimeLeft(next === 'Work' ? 25 * 60 : 5 * 60);
    };

    const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    const progress = timeLeft / (mode === 'Work' ? 25 * 60 : 5 * 60);

    const chartData = {
        labels: DAY_LABELS,
        datasets: [{ data: weeklyHours.some(h => h > 0) ? weeklyHours : [0, 0, 0, 0, 0, 0, 0.1] }],
    };

    return (
        <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
            <View style={styles.headerContainer}>
                <Text style={styles.header}>Focus</Text>
                <Text style={styles.subtitle}>Study time & productivity tracking</Text>
            </View>

            {/* Focus Score Ring */}
            <View style={styles.scoreCard}>
                <View style={styles.scoreLeft}>
                    <Text style={styles.scoreNum} adjustsFontSizeToFit numberOfLines={1}>
                        {score}
                    </Text>
                    <Text style={[styles.scoreLabel, { color: scoreColor(score, theme) }]}>
                        {scoreText || getScoreLabel(score)}
                    </Text>
                    <Text style={styles.scoreDesc}>Focus Score this week</Text>
                </View>
                <View style={styles.scoreRight}>
                    {/* Simple ring-like progress bar */}
                    <View style={styles.ringWrap}>
                        <View style={[styles.ringTrack, { borderColor: theme.colors.border }]}>
                            <View style={[styles.ringFill, {
                                borderColor: scoreColor(score, theme),
                                // approximate arc using borderRadius trick
                                opacity: score / 100,
                            }]} />
                        </View>
                        <Text style={[styles.ringPct, { color: scoreColor(score, theme) }]}>{score}%</Text>
                    </View>
                    <View style={styles.sessionRow}>
                        {[...Array(4)].map((_, i) => (
                            <View key={i} style={[styles.sessionDot, i < sessionsCompleted && { backgroundColor: theme.colors.ink }]} />
                        ))}
                    </View>
                    <Text style={styles.sessionLabel}>{sessionsCompleted}/4 sessions today</Text>
                </View>
            </View>

            {/* Pomodoro Timer */}
            <View style={styles.card}>
                <View style={styles.timerHeaderRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        {mode === 'Work'
                            ? <BookOpen size={16} color={theme.colors.ink} />
                            : <Coffee size={16} color={theme.colors.orange} />}
                        <Text style={styles.cardTitle}>{mode === 'Work' ? 'Work Session' : 'Break Time'}</Text>
                    </View>
                    <TouchableOpacity onPress={switchMode} style={styles.switchBtn}>
                        <Text style={styles.switchBtnText}>{mode === 'Work' ? '→ Break' : '→ Work'}</Text>
                    </TouchableOpacity>
                </View>

                {/* Progress arc (simplified as a horizontal bar) */}
                <View style={styles.timerProgressTrack}>
                    <View style={[styles.timerProgressFill, {
                        width: `${progress * 100}%`,
                        backgroundColor: mode === 'Work' ? theme.colors.ink : theme.colors.orange,
                    }]} />
                </View>

                <Text style={styles.timeDisplay}>{fmt(timeLeft)}</Text>

                <View style={styles.timerButtonRow}>
                    <TouchableOpacity
                        style={[styles.timerBtn, { backgroundColor: isActive ? theme.colors.orange : theme.colors.green }]}
                        onPress={toggleTimer}
                    >
                        {isActive ? <Pause size={18} color="#fff" /> : <Play size={18} color="#fff" />}
                        <Text style={styles.timerBtnText}>{isActive ? 'Pause' : 'Start'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.timerBtnOut} onPress={resetTimer}>
                        <RotateCcw size={16} color={theme.colors.ink2} />
                        <Text style={styles.timerBtnOutText}>Reset</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* Weekly Stats Card */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>Weekly Stats</Text>
                <View style={styles.statsRow}>
                    <View style={styles.statItem}>
                        <Clock size={16} color={theme.colors.blue} />
                        <Text style={styles.statValue}>
                            {Math.floor(weeklyTotalMin / 60)}h {weeklyTotalMin % 60}m
                        </Text>
                        <Text style={styles.statLabel}>Total Focus</Text>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.statItem}>
                        <TrendingUp size={16} color={theme.colors.green} />
                        <Text style={styles.statValue}>
                            {(weeklyTotalMin / 7 / 60).toFixed(1)}h
                        </Text>
                        <Text style={styles.statLabel}>Daily Avg</Text>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.statItem}>
                        <Flame size={16} color={theme.colors.orange} />
                        <Text style={styles.statValue}>{streak}</Text>
                        <Text style={styles.statLabel}>{streak === 1 ? 'Day Streak' : 'Day Streak'}</Text>
                    </View>
                </View>
                <BarChart
                    data={{
                        labels: DAY_LABELS,
                        datasets: [{ data: weeklyHours.some(h => h > 0) ? weeklyHours : [0, 0, 0, 0, 0, 0, 0.1] }],
                    }}
                    width={screenWidth - 100}
                    height={160}
                    yAxisSuffix="h"
                    withInnerLines={false}
                    showValuesOnTopOfBars={false}
                    fromZero
                    chartConfig={{
                        backgroundColor: theme.colors.surface,
                        backgroundGradientFrom: theme.colors.surface,
                        backgroundGradientTo: theme.colors.surface,
                        decimalPlaces: 1,
                        color: (o = 1) => theme.colors.accent,
                        labelColor: () => theme.colors.ink3,
                        barPercentage: 0.5,
                        propsForBackgroundLines: { stroke: theme.colors.border },
                    }}
                    style={{ borderRadius: 8, marginTop: 12 }}
                />
            </View>

            {/* Monthly Overview */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>Monthly Overview</Text>
                <Text style={styles.monthlyValue}>
                    {(monthlyMinutes / 60).toFixed(1)} hours
                </Text>
                <Text style={styles.monthlyLabel}>this month</Text>
                {lastMonthMinutes > 0 ? (
                    <Text style={[styles.monthlyCompare, {
                        color: monthlyMinutes >= lastMonthMinutes ? theme.colors.green : theme.colors.orange,
                    }]}>
                        {monthlyMinutes >= lastMonthMinutes
                            ? `+${((monthlyMinutes - lastMonthMinutes) / 60).toFixed(1)}h from last month`
                            : `${((monthlyMinutes - lastMonthMinutes) / 60).toFixed(1)}h from last month`}
                    </Text>
                ) : (
                    <Text style={styles.monthlyCompare}>No data from last month</Text>
                )}
            </View>

            {/* Website Blocker Manager */}
            <BlacklistManager
                blacklist={blacklist}
                onAdd={handleAddDomain}
                onRemove={handleRemoveDomain}
            />

            {/* Weekly chart */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>Study Hours This Week</Text>
                <Text style={styles.cardSub}>
                    {weeklyHours.reduce((a, b) => a + b, 0).toFixed(1)} hrs total ·{' '}
                    {(weeklyHours.reduce((a, b) => a + b, 0) / 7).toFixed(1)} avg / day
                </Text>
                <LineChart
                    data={chartData}
                    width={screenWidth - 100}
                    height={150}
                    yAxisSuffix="h"
                    withDots
                    withInnerLines={false}
                    chartConfig={{
                        backgroundColor: theme.colors.surface,
                        backgroundGradientFrom: theme.colors.surface,
                        backgroundGradientTo: theme.colors.surface,
                        decimalPlaces: 1,
                        color: (o = 1) => `rgba(13,12,10,${o})`,
                        labelColor: (o = 1) => theme.colors.ink3,
                        propsForDots: { r: '4', strokeWidth: '2', stroke: theme.colors.blue },
                    }}
                    bezier
                    style={{ borderRadius: 8, marginTop: 10 }}
                />
            </View>

            <View style={{ height: 60 }} />
        </ScrollView>
    );
}

const getStyles = (theme) => StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.bg, paddingTop: 40, paddingHorizontal: 20 },
    headerContainer: { marginBottom: 20 },
    header: { fontFamily: theme.fonts.d, fontSize: 32, fontWeight: '700', color: theme.colors.ink, letterSpacing: -0.5 },
    subtitle: { fontFamily: theme.fonts.m, fontSize: 10, color: theme.colors.ink3, textTransform: 'uppercase', letterSpacing: 1, marginTop: 3 },

    scoreCard: {
        backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
        borderRadius: theme.radii.lg, padding: 20, flexDirection: 'row', alignItems: 'center',
        marginBottom: 16, gap: 20, ...theme.shadows.sm
    },
    scoreLeft: { flex: 1 },
    scoreNum: { fontFamily: theme.fonts.d, fontSize: 42, fontWeight: '700', color: theme.colors.ink, letterSpacing: -2, lineHeight: 50 },
    scoreLabel: { fontFamily: theme.fonts.s, fontSize: 15, fontWeight: '700', marginTop: 2 },
    scoreDesc: { fontFamily: theme.fonts.m, fontSize: 10, color: theme.colors.ink3, marginTop: 4, textTransform: 'uppercase', letterSpacing: 1 },
    scoreRight: { alignItems: 'center', gap: 10 },
    ringWrap: { width: 80, height: 80, alignItems: 'center', justifyContent: 'center' },
    ringTrack: { width: 70, height: 70, borderRadius: 35, borderWidth: 6, alignItems: 'center', justifyContent: 'center' },
    ringFill: { position: 'absolute', width: 70, height: 70, borderRadius: 35, borderWidth: 6, borderTopColor: 'transparent', borderBottomColor: 'transparent' },
    ringPct: { fontFamily: theme.fonts.m, fontSize: 13, fontWeight: '700' },
    sessionRow: { flexDirection: 'row', gap: 6 },
    sessionDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1, borderColor: theme.colors.ink, backgroundColor: theme.colors.surface2 },
    sessionLabel: { fontFamily: theme.fonts.m, fontSize: 9, color: theme.colors.ink3, textTransform: 'uppercase', letterSpacing: 0.8 },

    card: {
        backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
        borderRadius: theme.radii.lg, padding: 20, marginBottom: 16, ...theme.shadows.sm
    },
    cardTitle: { fontFamily: theme.fonts.d, fontSize: 18, fontWeight: '700', color: theme.colors.ink, marginBottom: 4 },
    cardSub: { fontFamily: theme.fonts.m, fontSize: 10, color: theme.colors.ink3, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },

    timerHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
    switchBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: theme.radii.r, borderWidth: 1, borderColor: theme.colors.border },
    switchBtnText: { fontFamily: theme.fonts.m, fontSize: 10, color: theme.colors.ink3 },
    timerProgressTrack: { height: 4, backgroundColor: theme.colors.surface2, borderRadius: 2, marginBottom: 16, overflow: 'hidden' },
    timerProgressFill: { height: 4, borderRadius: 2 },
    timeDisplay: { fontFamily: theme.fonts.d, fontSize: 64, fontWeight: '300', color: theme.colors.ink, textAlign: 'center', letterSpacing: -2, marginBottom: 20 },
    timerButtonRow: { flexDirection: 'row', gap: 12, justifyContent: 'center' },
    timerBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 24, borderRadius: theme.radii.lg, gap: 8, ...theme.shadows.sm },
    timerBtnText: { fontFamily: theme.fonts.s, color: '#fff', fontSize: 15 },
    timerBtnOut: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 20, borderRadius: theme.radii.lg, gap: 8, borderWidth: 1, borderColor: theme.colors.border },
    timerBtnOutText: { fontFamily: theme.fonts.s, color: theme.colors.ink2, fontSize: 14 },

    tipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 10 },
    tipEmoji: { fontSize: 16, width: 22 },
    tipText: { fontFamily: theme.fonts.s, fontSize: 13, color: theme.colors.ink2, flex: 1, lineHeight: 20 },

    // Weekly Stats
    statsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
    statItem: { flex: 1, alignItems: 'center', gap: 4 },
    statValue: { fontFamily: theme.fonts.d, fontSize: 20, fontWeight: '700', color: theme.colors.ink },
    statLabel: { fontFamily: theme.fonts.m, fontSize: 10, color: theme.colors.ink3, textTransform: 'uppercase', letterSpacing: 0.8 },
    statDivider: { width: 1, height: 36, backgroundColor: theme.colors.border },

    // Monthly Overview
    monthlyValue: { fontFamily: theme.fonts.d, fontSize: 32, fontWeight: '700', color: theme.colors.ink, marginTop: 8 },
    monthlyLabel: { fontFamily: theme.fonts.m, fontSize: 10, color: theme.colors.ink3, textTransform: 'uppercase', letterSpacing: 1, marginTop: 2 },
    monthlyCompare: { fontFamily: theme.fonts.s, fontSize: 13, fontWeight: '600', color: theme.colors.ink3, marginTop: 8 },
});
