import React, { useState, useCallback } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { BookOpen, CalendarDays, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react-native';
import { theme } from '../utils/theme';

const screenWidth = Dimensions.get('window').width;

const gradeColor = (pct) => {
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
    const navigation = useNavigation();
    const [classes, setClasses] = useState([]);
    const [periodName, setPeriodName] = useState('');
    const [loaded, setLoaded] = useState(false);

    useFocusEffect(
        useCallback(() => {
            const load = async () => {
                try {
                    const raw = await AsyncStorage.getItem('studentVueGrades');
                    const pn = await AsyncStorage.getItem('studentVuePeriodName');
                    if (raw) setClasses(JSON.parse(raw));
                    if (pn) setPeriodName(pn);
                } catch (e) {
                    console.error(e);
                } finally {
                    setLoaded(true);
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
        (c.assignments || []).map(a => ({ ...a, courseName: c.name, courseColor: gradeColor(c.grade) }))
    )
        .filter(a => a.isoDate && a.isoDate >= TODAY.toISOString().slice(0, 10))
        .sort((a, b) => a.isoDate.localeCompare(b.isoDate))
        .slice(0, 7);

    const gpaColor = wgpa ? (parseFloat(wgpa) >= 3.7 ? theme.colors.green : parseFloat(wgpa) >= 3.0 ? theme.colors.blue : parseFloat(wgpa) >= 2.0 ? theme.colors.orange : theme.colors.red) : theme.colors.ink3;

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <View style={styles.contentWrapper}>
                {/* Header */}
                <View style={styles.headerContainer}>
                    <Text style={styles.greeting}>{getGreeting()}</Text>
                    <Text style={styles.header}>Dashboard</Text>
                    <Text style={styles.subtitle}>
                        {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                        {periodName ? ` · ${periodName}` : ''}
                    </Text>
                </View>

                {/* GPA Card */}
                {loaded && (
                    <View style={[styles.gpaCard, { borderLeftColor: gpaColor, borderLeftWidth: 5 }]}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.gpaCardLabel}>Weighted GPA</Text>
                            <Text style={[styles.gpaCardValue, { color: gpaColor }]}>{wgpa ?? '—'}</Text>
                            <Text style={styles.gpaCardSub}>Unweighted: {ugpa ?? '—'} · {classes.length} classes</Text>
                        </View>
                        <View style={styles.gpaBarWrap}>
                            {classes.map((c, i) => (
                                <View
                                    key={i}
                                    style={[styles.gpaBar, { backgroundColor: gradeColor(c.grade), flex: 1 }]}
                                    title={c.name}
                                />
                            ))}
                        </View>
                    </View>
                )}

                {/* Quick actions */}
                <View style={styles.quickRow}>
                    <TouchableOpacity style={styles.quickBtn} onPress={() => navigation.navigate('Gradebook')}>
                        <BookOpen size={18} color={theme.colors.ink} />
                        <Text style={styles.quickLabel}>Gradebook</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.quickBtn} onPress={() => navigation.navigate('Calendar')}>
                        <CalendarDays size={18} color={theme.colors.ink} />
                        <Text style={styles.quickLabel}>Calendar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.quickBtn} onPress={() => navigation.navigate('Focus')}>
                        <TrendingUp size={18} color={theme.colors.ink} />
                        <Text style={styles.quickLabel}>Focus</Text>
                    </TouchableOpacity>
                </View>

                {/* Upcoming assignments */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Upcoming Assignments</Text>
                    {upcoming.length === 0 ? (
                        <View style={styles.emptyBox}>
                            <Text style={styles.emptyText}>{loaded ? 'No upcoming assignments. Sync grades in Settings.' : 'Loading…'}</Text>
                        </View>
                    ) : upcoming.map((a, i) => {
                        const days = daysUntil(a.isoDate);
                        const urgentColor = days !== null && days <= 2 ? theme.colors.red : days !== null && days <= 5 ? theme.colors.orange : theme.colors.ink3;
                        return (
                            <View key={i} style={[styles.assignmentRow, { borderLeftColor: a.courseColor, borderLeftWidth: 3 }]}>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.assignmentName} numberOfLines={1}>{a.name}</Text>
                                    <Text style={styles.assignmentCourse} numberOfLines={1}>{a.courseName}</Text>
                                </View>
                                <View style={{ alignItems: 'flex-end' }}>
                                    <Text style={styles.assignmentDate}>{fmt(a.isoDate)}</Text>
                                    {days !== null && (
                                        <Text style={[styles.assignmentDays, { color: urgentColor }]}>
                                            {days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `${days}d`}
                                        </Text>
                                    )}
                                </View>
                            </View>
                        );
                    })}
                </View>

                {/* At-Risk classes */}
                {atRisk.length > 0 && (
                    <View style={styles.section}>
                        <View style={styles.sectionTitleRow}>
                            <AlertTriangle size={14} color={theme.colors.orange} />
                            <Text style={[styles.sectionTitle, { color: theme.colors.orange }]}>Classes to Watch</Text>
                        </View>
                        <Text style={styles.sectionSub}>These classes are below a B and may impact your GPA.</Text>
                        {atRisk.map((c, i) => {
                            const color = gradeColor(c.grade);
                            const letter = c.letter && c.letter !== 'N/A' ? c.letter : gradeLetter(c.grade);
                            const pointsNeeded = (83 - c.grade).toFixed(1);
                            return (
                                <View key={i} style={[styles.atRiskRow, { borderLeftColor: color, borderLeftWidth: 3 }]}>
                                    <View style={{ flex: 1 }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                            <Text style={styles.atRiskName} numberOfLines={1}>{c.name}</Text>
                                            <View style={[styles.typeChip, c.type === 'AP' && { backgroundColor: theme.colors.ink }, c.type === 'HN' && { backgroundColor: '#4e4c47' }]}>
                                                <Text style={[styles.typeChipText, (c.type === 'AP' || c.type === 'HN') && { color: '#fff' }]}>{c.type}</Text>
                                            </View>
                                        </View>
                                        <Text style={styles.atRiskSub}>Needs +{pointsNeeded}% to reach a B</Text>
                                    </View>
                                    <View style={{ alignItems: 'flex-end' }}>
                                        <Text style={[styles.atRiskLetter, { color }]}>{letter}</Text>
                                        <Text style={[styles.atRiskPct, { color }]}>{c.grade}%</Text>
                                    </View>
                                </View>
                            );
                        })}
                    </View>
                )}

                {/* All-class overview bar */}
                {classes.length > 0 && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Class Overview</Text>
                        {[...classes].sort((a, b) => b.grade - a.grade).map((c, i) => (
                            <View key={i} style={styles.overviewRow}>
                                <Text style={styles.overviewName} numberOfLines={1}>{c.name}</Text>
                                <View style={styles.overviewBarWrap}>
                                    <View style={[styles.overviewBar, {
                                        width: `${c.grade}%`,
                                        backgroundColor: gradeColor(c.grade),
                                    }]} />
                                </View>
                                <Text style={[styles.overviewPct, { color: gradeColor(c.grade) }]}>{c.grade}%</Text>
                            </View>
                        ))}
                    </View>
                )}

                <View style={{ height: 60 }} />
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.bg },
    scrollContent: { paddingTop: 40, paddingHorizontal: 20, alignItems: 'center' },
    contentWrapper: { width: '100%', maxWidth: 1000 },
    headerContainer: { marginBottom: 20 },
    greeting: { fontFamily: theme.fonts.m, fontSize: 10, color: theme.colors.ink3, textTransform: 'uppercase', letterSpacing: 1.5 },
    header: { fontFamily: theme.fonts.d, fontSize: 32, fontWeight: '700', color: theme.colors.ink, letterSpacing: -0.5, marginTop: 2 },
    subtitle: { fontFamily: theme.fonts.m, fontSize: 10, color: theme.colors.ink3, marginTop: 4, textTransform: 'uppercase', letterSpacing: 1 },

    // GPA Card
    gpaCard: {
        backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
        borderRadius: theme.radii.lg, padding: 20, marginBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 16,
    },
    gpaCardLabel: { fontFamily: theme.fonts.m, fontSize: 10, color: theme.colors.ink3, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 4 },
    gpaCardValue: { fontFamily: theme.fonts.d, fontSize: 52, fontWeight: '900', letterSpacing: -2, lineHeight: 58 },
    gpaCardSub: { fontFamily: theme.fonts.m, fontSize: 10, color: theme.colors.ink3, marginTop: 4 },
    gpaBarWrap: { flexDirection: 'column', width: 8, height: 70, gap: 2, borderRadius: 4, overflow: 'hidden' },
    gpaBar: { borderRadius: 2 },

    // Quick actions
    quickRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
    quickBtn: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
        borderRadius: theme.radii.lg, paddingVertical: 14,
    },
    quickLabel: { fontFamily: theme.fonts.s, fontSize: 12, fontWeight: '600', color: theme.colors.ink },

    // Sections
    section: { marginBottom: 20 },
    sectionTitle: { fontFamily: theme.fonts.m, fontSize: 10, color: theme.colors.ink3, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 10 },
    sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
    sectionSub: { fontFamily: theme.fonts.m, fontSize: 11, color: theme.colors.ink3, marginBottom: 10 },

    // Upcoming
    assignmentRow: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
        borderRadius: theme.radii.r, paddingVertical: 10, paddingHorizontal: 12,
        marginBottom: 6,
    },
    assignmentName: { fontFamily: theme.fonts.s, fontSize: 13, fontWeight: '500', color: theme.colors.ink },
    assignmentCourse: { fontFamily: theme.fonts.m, fontSize: 10, color: theme.colors.ink3, marginTop: 2 },
    assignmentDate: { fontFamily: theme.fonts.m, fontSize: 10, color: theme.colors.ink3 },
    assignmentDays: { fontFamily: theme.fonts.m, fontSize: 11, fontWeight: '600', marginTop: 2 },

    // At-risk
    atRiskRow: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
        borderRadius: theme.radii.r, paddingVertical: 12, paddingHorizontal: 12, marginBottom: 6,
    },
    atRiskName: { fontFamily: theme.fonts.s, fontSize: 14, fontWeight: '600', color: theme.colors.ink, flex: 1 },
    atRiskSub: { fontFamily: theme.fonts.m, fontSize: 10, color: theme.colors.ink3, marginTop: 3 },
    atRiskLetter: { fontFamily: theme.fonts.d, fontSize: 32, fontWeight: '900', letterSpacing: -1, lineHeight: 36 },
    atRiskPct: { fontFamily: theme.fonts.m, fontSize: 10, fontWeight: '600' },
    typeChip: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3, backgroundColor: theme.colors.surface2, borderWidth: 1, borderColor: theme.colors.border },
    typeChipText: { fontFamily: theme.fonts.m, fontSize: 8, fontWeight: '700', color: theme.colors.ink2, textTransform: 'uppercase' },

    // Overview bars
    overviewRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 7 },
    overviewName: { fontFamily: theme.fonts.m, fontSize: 10, color: theme.colors.ink2, width: 120 },
    overviewBarWrap: { flex: 1, height: 8, backgroundColor: theme.colors.surface2, borderRadius: 4, overflow: 'hidden' },
    overviewBar: { height: 8, borderRadius: 4 },
    overviewPct: { fontFamily: theme.fonts.m, fontSize: 10, fontWeight: '700', width: 38, textAlign: 'right' },

    emptyBox: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radii.r, padding: 16 },
    emptyText: { fontFamily: theme.fonts.m, fontSize: 12, color: theme.colors.ink3, textAlign: 'center' },
});
