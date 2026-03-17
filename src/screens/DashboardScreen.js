import React, { useState, useCallback } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { BookOpen, CalendarDays, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react-native';
import { theme as staticTheme } from '../utils/theme';
import { useTheme } from '../context/ThemeContext';
import { computeFocusScore, syncScoreToSupabase, getScoreLabel } from '../utils/focusScoreEngine';

const screenWidth = Dimensions.get('window').width;

const gradeColor = (pct, theme) => {
    if (pct >= 90) return theme.colors.green;
    if (pct >= 80) return theme.colors.blue;
    if (pct >= 70) return theme.colors.orange;
    return theme.colors.red;
};

const gradeLetter = (pct) => {
    if (pct >= 93) return 'A';
    if (pct >= 90) return 'A-';
    if (pct >= 87) return 'B+';
    if (pct >= 83) return 'B';
    if (pct >= 80) return 'B-';
    if (pct >= 77) return 'C+';
    if (pct >= 73) return 'C';
    if (pct >= 70) return 'C-';
    return 'D';
};

const calcWGPA = (classes) => {
    if (!classes || classes.length === 0) return null;
    const pts = classes.reduce((sum, c) => {
        const bonus = c.type === 'AP' ? 1 : c.type === 'HN' ? 0.5 : 0;
        const base = c.grade >= 93 ? 4 : c.grade >= 90 ? 3.7 : c.grade >= 87 ? 3.3 : c.grade >= 83 ? 3 : c.grade >= 80 ? 2.7 : c.grade >= 77 ? 2.3 : c.grade >= 73 ? 2 : c.grade >= 70 ? 1.7 : 1;
        return sum + base + bonus;
    }, 0);
    return (pts / classes.length).toFixed(2);
};

const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
};

const TODAY = new Date('2026-02-27');
const fmt = (iso) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};
const daysUntil = (iso) => {
    if (!iso) return null;
    const diff = new Date(iso) - TODAY;
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return days;
};

export default function DashboardScreen() {
    const { theme, isDarkMode } = useTheme();
    const styles = getStyles(theme);
    const navigation = useNavigation();
    const [classes, setClasses] = useState([]);
    const [periodName, setPeriodName] = useState('');
    const [greeting, setGreeting] = useState(getGreeting());
    const [userName, setUserName] = useState('Student');
    const [loaded, setLoaded] = useState(false);
    const [focusScoreNum, setFocusScoreNum] = useState(0);
    const [focusLabel, setFocusLabel] = useState('');

    useFocusEffect(
        useCallback(() => {
            const load = async () => {
                try {
                    const raw = await AsyncStorage.getItem('studentVueGrades');
                    const pn = await AsyncStorage.getItem('studentVuePeriodName');
                    const savedName = await AsyncStorage.getItem('userName');
                    if (raw) setClasses(JSON.parse(raw));
                    if (pn) setPeriodName(pn);
                    if (savedName) setUserName(savedName);

                    // Compute real focus score
                    const { score, breakdown } = await computeFocusScore();
                    setFocusScoreNum(score);
                    setFocusLabel(getScoreLabel(score));
                    // Sync to Supabase in background (non-blocking)
                    syncScoreToSupabase(score, breakdown).catch(() => {});
                } catch (e) {
                    console.error(e);
                }
            };
            load();
        }, [])
    );

    const wgpa = calcWGPA(classes);
    const ugpa = classes.length > 0 ? (classes.reduce((s, c) => {
        const base = c.grade >= 93 ? 4 : c.grade >= 90 ? 3.7 : c.grade >= 87 ? 3.3 : c.grade >= 83 ? 3 : c.grade >= 80 ? 2.7 : c.grade >= 77 ? 2.3 : c.grade >= 73 ? 2 : c.grade >= 70 ? 1.7 : 1;
        return s + base;
    }, 0) / classes.length).toFixed(2) : null;

    // At-risk: below 83 (B), sorted by grade ascending
    const atRisk = [...classes].filter(c => c.grade < 83).sort((a, b) => a.grade - b.grade);

    // Upcoming assignments: collect all, sort by isoDate, take next 7
    const upcoming = classes.flatMap(c =>
        (c.assignments || []).map(a => ({ ...a, courseName: c.name, courseColor: gradeColor(c.grade, theme) }))
    )
        .filter(a => a.isoDate && a.isoDate >= TODAY.toISOString().slice(0, 10))
        .sort((a, b) => a.isoDate.localeCompare(b.isoDate))
        .slice(0, 7);

    const gpaColor = wgpa ? (parseFloat(wgpa) >= 3.7 ? theme.colors.green : parseFloat(wgpa) >= 3.0 ? theme.colors.blue : parseFloat(wgpa) >= 2.0 ? theme.colors.orange : theme.colors.red) : theme.colors.ink2;

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <View style={styles.contentWrapper}>
                {/* Modern Greeting Header */}
                <View style={styles.heroSection}>
                    <View>
                        <Text style={styles.greetingText}>{greeting},</Text>
                        <Text style={styles.userNameText}>{userName}</Text>
                    </View>
                    <TouchableOpacity
                        style={styles.focusWidget}
                        onPress={() => navigation.navigate('Focus')}
                    >
                        <View style={styles.focusRing}>
                            <View style={[styles.focusFill, { height: `${focusScoreNum}%` }]} />
                            <Text style={styles.focusNumText}>{focusScoreNum}</Text>
                        </View>
                        <View>
                            <Text style={styles.focusLabel}>Focus Score</Text>
                            <Text style={styles.focusSub}>Excellent</Text>
                        </View>
                    </TouchableOpacity>
                </View>

                {/* GPA Stats Row */}
                <View style={styles.statsRow}>
                    <View style={styles.statCard}>
                        <Text style={styles.statLabel}>Weighted GPA</Text>
                        <Text style={[styles.statValue, { color: gpaColor }]}>{wgpa || '—'}</Text>
                        <View style={[styles.statIndicator, { backgroundColor: gpaColor }]} />
                    </View>
                    <View style={styles.statCard}>
                        <Text style={styles.statLabel}>Unweighted</Text>
                        <Text style={styles.statValue}>{ugpa || '—'}</Text>
                        <View style={[styles.statIndicator, { backgroundColor: theme.colors.ink3 }]} />
                    </View>
                    <View style={styles.statCard}>
                        <Text style={styles.statLabel}>Period</Text>
                        <Text style={styles.statValue}>{periodName || 'Q3'}</Text>
                    </View>
                </View>

                <View style={styles.layoutMain}>
                    {/* Left Column: Assignments */}
                    <View style={styles.columnLeft}>
                        <View style={styles.sectionHeader}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <CalendarDays size={18} color={theme.colors.ink} strokeWidth={2.5} />
                                <Text style={styles.sectionTitle}>Up Next</Text>
                            </View>
                            <TouchableOpacity>
                                <Text style={styles.seeAllText}>See Calendar</Text>
                            </TouchableOpacity>
                        </View>

                        {upcoming.length > 0 ? (
                            upcoming.map((asgn, i) => (
                                <View key={i} style={styles.assignmentCard}>
                                    <View style={[styles.asgnColorBar, { backgroundColor: asgn.courseColor }]} />
                                    <View style={styles.asgnContent}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.asgnTitle} numberOfLines={1}>{asgn.name}</Text>
                                            <Text style={styles.asgnCourse}>{asgn.courseName}</Text>
                                        </View>
                                        <View style={{ alignItems: 'flex-end' }}>
                                            <Text style={styles.asgnDate}>{fmt(asgn.isoDate)}</Text>
                                            <Text style={[styles.asgnDays, { color: daysUntil(asgn.isoDate) <= 2 ? theme.colors.red : theme.colors.ink3 }]}>
                                                in {daysUntil(asgn.isoDate)} days
                                            </Text>
                                        </View>
                                    </View>
                                </View>
                            ))
                        ) : (
                            <View style={styles.emptyCard}>
                                <Text style={styles.emptyText}>All caught up!</Text>
                            </View>
                        )}
                    </View>

                    {/* Right Column: Grades & Insights */}
                    <View style={styles.columnRight}>
                        <View style={styles.sectionHeader}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <TrendingDown size={18} color={theme.colors.red} strokeWidth={2.5} />
                                <Text style={styles.sectionTitle}>Attention</Text>
                            </View>
                        </View>

                        {atRisk.length > 0 ? (
                            atRisk.map((c, i) => {
                                const color = gradeColor(c.grade, theme);
                                return (
                                    <View key={i} style={styles.atRiskCard}>
                                        <View style={styles.atRiskHeader}>
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.atRiskName} numberOfLines={1}>{c.name}</Text>
                                                <Text style={styles.atRiskSub}>Needs {(83 - c.grade).toFixed(1)}% to reach B</Text>
                                            </View>
                                            <View style={[styles.atRiskGradeBox, { backgroundColor: color + '15' }]}>
                                                <Text style={[styles.atRiskGradeText, { color }]}>{c.grade}%</Text>
                                            </View>
                                        </View>
                                    </View>
                                );
                            })
                        ) : (
                            <View style={styles.successCard}>
                                <TrendingUp size={24} color={theme.colors.green} />
                                <Text style={styles.successText}>All your classes are in great shape.</Text>
                            </View>
                        )}

                        <View style={[styles.sectionHeader, { marginTop: 24 }]}>
                            <Text style={styles.sectionTitle}>Overview</Text>
                        </View>
                        <View style={styles.overviewContainer}>
                            {classes.slice(0, 5).map((c, i) => (
                                <View key={i} style={styles.overviewRow}>
                                    <Text style={styles.overviewLabel} numberOfLines={1}>{c.name}</Text>
                                    <View style={styles.progressBarBg}>
                                        <View style={[styles.progressBarFill, { width: `${c.grade}%`, backgroundColor: gradeColor(c.grade, theme) }]} />
                                    </View>
                                    <Text style={styles.overviewValue}>{c.grade}%</Text>
                                </View>
                            ))}
                        </View>
                    </View>
                </View>
            </View>
            <View style={{ height: 100 }} />
        </ScrollView>
    );
}

const getStyles = (theme) => StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.bg },
    scrollContent: { paddingTop: 60, paddingHorizontal: 40, alignItems: 'center' },
    contentWrapper: { width: '100%', maxWidth: 1400 },

    // Hero Section
    heroSection: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 48 },
    greetingText: { fontFamily: theme.fonts.m, fontSize: 14, color: theme.colors.ink, textTransform: 'uppercase', letterSpacing: 3 },
    userNameText: { fontFamily: theme.fonts.d, fontSize: 64, fontWeight: '900', color: theme.colors.ink, letterSpacing: -2, marginTop: -4 },

    focusWidget: {
        flexDirection: 'row', alignItems: 'center', gap: 14,
        padding: 12, paddingRight: 20,
        backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg,
        borderWidth: 2, borderColor: theme.colors.border,
        shadowColor: theme.colors.border, shadowOffset: { width: 4, height: 4 }, shadowOpacity: 1, shadowRadius: 0, elevation: 4
    },
    focusRing: {
        width: 48, height: 48, borderRadius: 24,
        backgroundColor: theme.colors.surface2, overflow: 'hidden',
        justifyContent: 'center', alignItems: 'center',
        borderWidth: 1, borderColor: theme.colors.border
    },
    focusFill: {
        position: 'absolute', bottom: 0, width: '100%',
        backgroundColor: theme.colors.green, opacity: 0.15
    },
    focusNumText: { fontFamily: theme.fonts.m, fontSize: 16, fontWeight: '700', color: theme.colors.ink },
    focusLabel: { fontFamily: theme.fonts.m, fontSize: 9, color: theme.colors.ink3, textTransform: 'uppercase', letterSpacing: 1 },
    focusSub: { fontFamily: theme.fonts.s, fontSize: 13, fontWeight: '600', color: theme.colors.green },

    // Stats Row
    statsRow: { flexDirection: 'row', gap: 16, marginBottom: 32 },
    statCard: {
        flex: 1, padding: 16,
        backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg,
        borderWidth: 2, borderColor: theme.colors.border,
        shadowColor: theme.colors.border, shadowOffset: { width: 4, height: 4 }, shadowOpacity: 1, shadowRadius: 0, elevation: 4
    },
    statLabel: { fontFamily: theme.fonts.m, fontSize: 11, color: theme.colors.ink3, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 6 },
    statValue: { fontFamily: theme.fonts.d, fontSize: 36, fontWeight: '700', color: theme.colors.ink },
    statIndicator: { height: 4, width: 32, borderRadius: 2, marginTop: 12 },

    // Main Layout
    layoutMain: { flexDirection: 'row', gap: 32 },
    columnLeft: { flex: 1.4 },
    columnRight: { flex: 1 },

    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    sectionTitle: { fontFamily: theme.fonts.d, fontSize: 28, fontWeight: '700', color: theme.colors.ink },
    seeAllText: { fontFamily: theme.fonts.m, fontSize: 13, color: theme.colors.ink3 },

    // Assignments
    assignmentCard: {
        flexDirection: 'row', backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.lg, marginBottom: 12, overflow: 'hidden',
        borderWidth: 2, borderColor: theme.colors.border,
        shadowColor: theme.colors.border, shadowOffset: { width: 4, height: 4 }, shadowOpacity: 1, shadowRadius: 0, elevation: 4
    },
    asgnColorBar: { width: 4 },
    asgnContent: { flex: 1, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 16 },
    asgnTitle: { fontFamily: theme.fonts.s, fontSize: 18, fontWeight: '600', color: theme.colors.ink },
    asgnCourse: { fontFamily: theme.fonts.m, fontSize: 12, color: theme.colors.ink3, marginTop: 4 },
    asgnDate: { fontFamily: theme.fonts.m, fontSize: 14, fontWeight: '700', color: theme.colors.ink },
    asgnDays: { fontFamily: theme.fonts.m, fontSize: 11, marginTop: 4 },

    // At Risk
    atRiskCard: {
        backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg,
        padding: 16, marginBottom: 12, borderWidth: 2, borderColor: theme.colors.border,
        shadowColor: theme.colors.border, shadowOffset: { width: 4, height: 4 }, shadowOpacity: 1, shadowRadius: 0, elevation: 4
    },
    atRiskHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    atRiskName: { fontFamily: theme.fonts.s, fontSize: 15, fontWeight: '600', color: theme.colors.ink },
    atRiskSub: { fontFamily: theme.fonts.m, fontSize: 10, color: theme.colors.ink3, marginTop: 2 },
    atRiskGradeBox: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, alignItems: 'center' },
    atRiskGradeText: { fontFamily: theme.fonts.m, fontSize: 15, fontWeight: '700' },

    successCard: {
        padding: 24, alignItems: 'center', gap: 12,
        backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg,
        borderWidth: 2, borderColor: theme.colors.border,
        shadowColor: theme.colors.border, shadowOffset: { width: 4, height: 4 }, shadowOpacity: 1, shadowRadius: 0, elevation: 4
    },
    successText: { fontFamily: theme.fonts.s, fontSize: 13, color: theme.colors.ink3, textAlign: 'center' },

    // Overview
    overviewContainer: {
        backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg,
        padding: 20, borderWidth: 2, borderColor: theme.colors.border,
        shadowColor: theme.colors.border, shadowOffset: { width: 4, height: 4 }, shadowOpacity: 1, shadowRadius: 0, elevation: 4
    },
    overviewRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
    overviewLabel: { flex: 1, fontFamily: theme.fonts.m, fontSize: 10, color: theme.colors.ink2 },
    progressBarBg: { flex: 2, height: 6, backgroundColor: theme.colors.surface2, borderRadius: 3, overflow: 'hidden' },
    progressBarFill: { height: '100%', borderRadius: 3 },
    overviewValue: { width: 32, fontFamily: theme.fonts.m, fontSize: 10, fontWeight: '700', textAlign: 'right', color: theme.colors.ink },

    emptyCard: { padding: 32, alignItems: 'center', backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg, borderWidth: 2, borderColor: theme.colors.border, shadowColor: theme.colors.border, shadowOffset: { width: 4, height: 4 }, shadowOpacity: 1, shadowRadius: 0, elevation: 4 },
    emptyText: { fontFamily: theme.fonts.s, fontSize: 14, color: theme.colors.ink3 }
});
