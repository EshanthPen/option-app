import React, { useState, useCallback } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import {
    BookOpen, CalendarDays, TrendingUp, TrendingDown, AlertTriangle,
    Award, AlertCircle, Lightbulb, ChevronRight, Target, Flame,
    FileText, FlaskConical, HelpCircle, ClipboardCheck, Pencil,
    Gauge, Sparkles, Activity, Plus,
} from 'lucide-react-native';
import Svg, { Path, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { useTheme } from '../context/ThemeContext';
import { TopBar, Button } from '../components/DesignKit';
import { computeFocusScore, syncScoreToSupabase, getScoreLabel } from '../utils/focusScoreEngine';
import { generateNudges } from '../utils/studyNudges';
import { getUnlockedAchievements, ACHIEVEMENTS } from '../utils/achievements';
import { lightImpact } from '../utils/haptics';
import SyncStatusBar from '../components/SyncStatusBar';

const SEM = { red: '#E03E3E', orange: '#D97706', green: '#16A34A', blue: '#2563EB', purple: '#7C3AED', gold: '#FFB800' };

const gradeColor = (pct) => {
    if (pct >= 90) return SEM.green;
    if (pct >= 80) return SEM.blue;
    if (pct >= 70) return SEM.orange;
    return SEM.red;
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

const calcUGPA = (classes) => {
    if (!classes || classes.length === 0) return null;
    const pts = classes.reduce((sum, c) => {
        const base = c.grade >= 93 ? 4 : c.grade >= 90 ? 3.7 : c.grade >= 87 ? 3.3 : c.grade >= 83 ? 3 : c.grade >= 80 ? 2.7 : c.grade >= 77 ? 2.3 : c.grade >= 73 ? 2 : c.grade >= 70 ? 1.7 : 1;
        return sum + base;
    }, 0);
    return (pts / classes.length).toFixed(2);
};

const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
};

const TODAY = new Date();
const todayStr = TODAY.toISOString().slice(0, 10);
const fmt = (iso) => {
    const d = new Date(iso + 'T00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};
const daysUntil = (iso) => {
    if (!iso) return null;
    return Math.ceil((new Date(iso + 'T00:00') - new Date(todayStr + 'T00:00')) / 86400000);
};

function AssignmentIcon({ weight, color, size = 14 }) {
    const props = { size, color, strokeWidth: 2 };
    if (weight === 'Essay' || weight === 'essay') return <FileText {...props} />;
    if (weight === 'Lab' || weight === 'lab') return <FlaskConical {...props} />;
    if (weight === 'Quiz' || weight === 'quiz') return <HelpCircle {...props} />;
    if (weight === 'Test' || weight === 'test' || weight === 'Exam' || weight === 'exam') return <ClipboardCheck {...props} />;
    return <Pencil {...props} />;
}

function StatCard({ label, value, sub, color, icon: Icon, onPress, theme }) {
    return (
        <TouchableOpacity
            style={{
                flex: 1, padding: 16,
                backgroundColor: theme.colors.surface,
                borderRadius: theme.radii.lg,
                borderWidth: 1, borderColor: theme.colors.border,
                ...theme.shadows.sm,
            }}
            onPress={onPress}
            activeOpacity={onPress ? 0.75 : 1}
        >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <Text style={{ fontFamily: theme.fonts.m, fontSize: 10, color: theme.colors.ink3, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</Text>
                {Icon && <Icon size={14} color={theme.colors.ink4} strokeWidth={2} />}
            </View>
            <Text style={{ fontFamily: theme.fonts.s, fontSize: 26, fontWeight: '700', color: color || theme.colors.ink, letterSpacing: -0.5 }}>{value ?? '—'}</Text>
            {sub && <Text style={{ fontFamily: theme.fonts.m, fontSize: 11, color: theme.colors.ink3, marginTop: 4 }}>{sub}</Text>}
        </TouchableOpacity>
    );
}

export default function DashboardScreen() {
    const { theme } = useTheme();
    const navigation = useNavigation();

    const [classes, setClasses] = useState([]);
    const [periodName, setPeriodName] = useState('');
    const [greeting, setGreeting] = useState(getGreeting());
    const [userName, setUserName] = useState('Student');
    const [focusScoreNum, setFocusScoreNum] = useState(0);
    const [focusLabel, setFocusLabel] = useState('');
    const [streak, setStreak] = useState(0);
    const [nudges, setNudges] = useState([]);
    const [recentAchievements, setRecentAchievements] = useState([]);

    useFocusEffect(
        useCallback(() => {
            setGreeting(getGreeting());
            const load = async () => {
                try {
                    const raw = await AsyncStorage.getItem('studentVueGrades');
                    const pn = await AsyncStorage.getItem('studentVuePeriodName');
                    const savedName = await AsyncStorage.getItem('userName');
                    const streakRaw = await AsyncStorage.getItem('studyStreak');
                    if (raw) setClasses(JSON.parse(raw));
                    if (pn) setPeriodName(pn);
                    if (savedName) setUserName(savedName);
                    if (streakRaw) setStreak(JSON.parse(streakRaw)?.currentStreak || 0);

                    const { score } = await computeFocusScore();
                    setFocusScoreNum(score);
                    setFocusLabel(getScoreLabel(score));
                    syncScoreToSupabase(score, {}).catch(() => {});

                    try {
                        const n = await generateNudges();
                        setNudges(n.slice(0, 3));
                    } catch {}

                    try {
                        const unlocked = await getUnlockedAchievements();
                        const recent = unlocked.slice(-3).reverse();
                        setRecentAchievements(recent.map(id => ACHIEVEMENTS[id]).filter(Boolean));
                    } catch {}
                } catch (e) {
                    console.error(e);
                }
            };
            load();
        }, [])
    );

    const wgpa = calcWGPA(classes);
    const ugpa = calcUGPA(classes);
    const atRisk = [...classes].filter(c => c.grade < 83).sort((a, b) => a.grade - b.grade);
    const upcoming = classes.flatMap(c =>
        (c.assignments || [])
            .filter(a => !a.score && a.isoDate >= todayStr)
            .map(a => ({ ...a, courseName: c.name, courseColor: gradeColor(c.grade) }))
    ).sort((a, b) => a.isoDate.localeCompare(b.isoDate)).slice(0, 6);

    const recentScores = classes.flatMap(c =>
        (c.assignments || [])
            .filter(a => a.score != null)
            .map(a => ({ ...a, courseName: c.name, courseColor: gradeColor(c.grade), pct: a.total ? Math.round(a.score / a.total * 100) : null }))
    ).sort((a, b) => (b.isoDate || '').localeCompare(a.isoDate || '')).slice(0, 4);

    const urgentCount = upcoming.filter(a => (daysUntil(a.isoDate) || 0) <= 3).length;

    const focusScoreColor = focusScoreNum >= 70 ? SEM.green : focusScoreNum >= 50 ? SEM.orange : SEM.red;

    const todayStrFmt = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    return (
        <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
            <TopBar
                title={`${greeting}, ${userName}`}
                subtitle={`${todayStrFmt}${classes.length ? ` · ${classes.length} classes` : ''}${periodName ? ` · ${periodName}` : ''}`}
                actions={<Button variant="primary" icon={Plus}>Add assignment</Button>}
            />
            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingTop: 24, paddingHorizontal: 24, paddingBottom: 80 }}
                showsVerticalScrollIndicator={false}
            >
                <View style={{ maxWidth: 1200, width: '100%', alignSelf: 'center' }}>

                {/* ── Stat Row ── */}
                <View style={{ flexDirection: 'row', gap: 12, marginBottom: 22, flexWrap: 'wrap' }}>
                    <StatCard label="Weighted GPA" value={wgpa} sub="AP/HN weighted" color={wgpa && parseFloat(wgpa) >= 3.7 ? SEM.green : theme.colors.ink} icon={TrendingUp} theme={theme} />
                    <StatCard label="Unweighted GPA" value={ugpa} sub="4.0 scale" color={theme.colors.ink} icon={Gauge} theme={theme} />
                    <StatCard label="Classes" value={classes.length || '—'} sub={classes.filter(c => c.type === 'AP').length + ' AP · ' + classes.filter(c => c.type === 'HN').length + ' HN'} icon={BookOpen} theme={theme} />
                    <StatCard label="Focus Score" value={focusScoreNum || '—'} sub={focusLabel || 'Keep it up'} color={focusScoreColor} icon={Target} onPress={() => navigation.navigate('Focus')} theme={theme} />
                    <StatCard label="Study Streak" value={streak ? streak + 'd' : '0d'} sub="Keep going!" color={streak >= 3 ? SEM.orange : theme.colors.ink} icon={Flame} theme={theme} />
                </View>

                {/* ── Main Grid ── */}
                <View style={{ flexDirection: 'row', gap: 18 }}>

                    {/* Left: Up Next + Recent Scores */}
                    <View style={{ flex: 1.5, gap: 18 }}>

                        {/* Up Next */}
                        <View>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                    <CalendarDays size={18} color={theme.colors.ink} strokeWidth={2.4} />
                                    <Text style={{ fontFamily: theme.fonts.s, fontSize: 16, fontWeight: '600', color: theme.colors.ink }}>Up Next</Text>
                                    {urgentCount > 0 && (
                                        <View style={{ backgroundColor: SEM.red + '18', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99 }}>
                                            <Text style={{ fontFamily: theme.fonts.s, fontSize: 11, fontWeight: '700', color: SEM.red }}>{urgentCount} urgent</Text>
                                        </View>
                                    )}
                                </View>
                                <TouchableOpacity onPress={() => navigation.navigate('Calendar')}>
                                    <Text style={{ fontFamily: theme.fonts.m, fontSize: 12, color: theme.colors.ink3 }}>Full calendar →</Text>
                                </TouchableOpacity>
                            </View>

                            {upcoming.length > 0 ? upcoming.map((a, i) => {
                                const d = daysUntil(a.isoDate);
                                const urgent = d !== null && d <= 2;
                                return (
                                    <View key={i} style={{
                                        flexDirection: 'row',
                                        backgroundColor: theme.colors.surface,
                                        borderRadius: theme.radii.lg,
                                        borderWidth: 1, borderColor: theme.colors.border,
                                        marginBottom: 8, overflow: 'hidden',
                                        ...theme.shadows.sm,
                                    }}>
                                        <View style={{ width: 3, backgroundColor: a.courseColor }} />
                                        <View style={{ flex: 1, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                                            <View style={{
                                                width: 38, height: 38, borderRadius: 10,
                                                backgroundColor: a.courseColor + '18',
                                                alignItems: 'center', justifyContent: 'center', flexShrink: 0
                                            }}>
                                                <AssignmentIcon weight={a.category || a.weight} color={a.courseColor} size={16} />
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <Text style={{ fontFamily: theme.fonts.s, fontSize: 14, fontWeight: '600', color: theme.colors.ink }} numberOfLines={1}>{a.name}</Text>
                                                <Text style={{ fontFamily: theme.fonts.m, fontSize: 11, color: theme.colors.ink3, marginTop: 2 }}>
                                                    {a.courseName}{a.category || a.weight ? ' · ' + (a.category || a.weight) : ''}
                                                    {a.total ? ' · ' + a.total + ' pts' : ''}
                                                </Text>
                                            </View>
                                            <View style={{ alignItems: 'flex-end' }}>
                                                <Text style={{ fontFamily: theme.fonts.s, fontSize: 13, fontWeight: '600', color: theme.colors.ink }}>{fmt(a.isoDate)}</Text>
                                                <Text style={{ fontFamily: theme.fonts.s, fontSize: 11, fontWeight: '600', color: urgent ? SEM.red : theme.colors.ink3, marginTop: 2 }}>
                                                    {d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : d !== null ? `in ${d}d` : ''}
                                                </Text>
                                            </View>
                                        </View>
                                    </View>
                                );
                            }) : (
                                <View style={{
                                    padding: 32, alignItems: 'center',
                                    backgroundColor: theme.colors.surface,
                                    borderRadius: theme.radii.lg,
                                    borderWidth: 1, borderColor: theme.colors.border,
                                    ...theme.shadows.sm,
                                }}>
                                    <Text style={{ fontFamily: theme.fonts.m, fontSize: 14, color: theme.colors.ink3 }}>All caught up! No upcoming assignments.</Text>
                                </View>
                            )}
                        </View>

                        {/* Weekly Performance Chart */}
                        {classes.length > 0 && (
                            <WeeklyPerformanceChart classes={classes} theme={theme} />
                        )}

                        {/* Recent Scores */}
                        {recentScores.length > 0 && (
                            <View>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                                    <TrendingUp size={18} color={theme.colors.ink} strokeWidth={2.4} />
                                    <Text style={{ fontFamily: theme.fonts.s, fontSize: 16, fontWeight: '600', color: theme.colors.ink }}>Recent Scores</Text>
                                </View>
                                <View style={{
                                    backgroundColor: theme.colors.surface,
                                    borderRadius: theme.radii.lg,
                                    borderWidth: 1, borderColor: theme.colors.border,
                                    overflow: 'hidden',
                                    ...theme.shadows.sm,
                                }}>
                                    {recentScores.map((a, i) => (
                                        <View key={i} style={{
                                            flexDirection: 'row', alignItems: 'center',
                                            padding: 14, gap: 14,
                                            borderBottomWidth: i < recentScores.length - 1 ? 1 : 0,
                                            borderBottomColor: theme.colors.border,
                                        }}>
                                            <View style={{ width: 3, height: 32, backgroundColor: a.courseColor, borderRadius: 2, flexShrink: 0 }} />
                                            <View style={{ flex: 1 }}>
                                                <Text style={{ fontFamily: theme.fonts.s, fontSize: 13, fontWeight: '600', color: theme.colors.ink }} numberOfLines={1}>{a.name}</Text>
                                                <Text style={{ fontFamily: theme.fonts.m, fontSize: 11, color: theme.colors.ink3, marginTop: 2 }}>{a.courseName}{a.isoDate ? ' · ' + fmt(a.isoDate) : ''}</Text>
                                            </View>
                                            <Text style={{ fontFamily: theme.fonts.mono, fontSize: 11, color: theme.colors.ink3 }}>
                                                {a.score != null && a.total ? `${a.score}/${a.total}` : ''}
                                            </Text>
                                            {a.pct != null && (
                                                <View style={{ backgroundColor: gradeColor(a.pct) + '18', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 7 }}>
                                                    <Text style={{ fontFamily: theme.fonts.s, fontSize: 11, fontWeight: '700', color: gradeColor(a.pct) }}>{a.pct}%</Text>
                                                </View>
                                            )}
                                        </View>
                                    ))}
                                </View>
                            </View>
                        )}
                    </View>

                    {/* Right: Focus Widget + Classes + Needs Attention + Nudges */}
                    <View style={{ flex: 1, gap: 18 }}>

                        {/* Focus Score Widget (dark gradient) */}
                        <TouchableOpacity
                            onPress={() => navigation.navigate('Focus')}
                            activeOpacity={0.85}
                            style={{
                                padding: 20, borderRadius: theme.radii.lg,
                                backgroundColor: theme.colors.ink,
                                overflow: 'hidden',
                            }}
                        >
                            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18 }}>
                                <View>
                                    <Text style={{ fontFamily: theme.fonts.m, fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 1.2 }}>Today's Focus Score</Text>
                                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 8 }}>
                                        <Text style={{ fontFamily: theme.fonts.s, fontSize: 48, fontWeight: '700', color: '#fff', letterSpacing: -2 }}>{focusScoreNum}</Text>
                                        <Text style={{ fontFamily: theme.fonts.m, fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>/ 100</Text>
                                    </View>
                                    <Text style={{ fontFamily: theme.fonts.s, fontSize: 13, color: focusScoreColor, marginTop: 4, fontWeight: '600' }}>
                                        {focusScoreNum >= 70 ? '↑ ' : focusScoreNum >= 50 ? '→ ' : '↓ '}{focusLabel || 'Keep going'}
                                    </Text>
                                </View>
                                <View style={{
                                    width: 52, height: 52, borderRadius: 26,
                                    backgroundColor: focusScoreColor + '25',
                                    borderWidth: 2, borderColor: focusScoreColor,
                                    alignItems: 'center', justifyContent: 'center'
                                }}>
                                    <Target size={22} color={focusScoreColor} strokeWidth={2.4} />
                                </View>
                            </View>
                            <View style={{ flexDirection: 'row', gap: 10 }}>
                                {[
                                    { label: 'Focus', val: Math.min(focusScoreNum, 100), color: SEM.blue },
                                    { label: 'Streak', val: Math.min(streak * 10, 100), color: SEM.orange },
                                    { label: 'Score', val: focusScoreNum, color: focusScoreColor },
                                ].map((m, i) => (
                                    <View key={i} style={{ flex: 1 }}>
                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                                            <Text style={{ fontFamily: theme.fonts.m, fontSize: 10, color: 'rgba(255,255,255,0.6)' }}>{m.label}</Text>
                                            <Text style={{ fontFamily: theme.fonts.mono, fontSize: 10, color: '#fff', fontWeight: '600' }}>{m.val}</Text>
                                        </View>
                                        <View style={{ height: 4, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' }}>
                                            <View style={{ width: `${m.val}%`, height: '100%', backgroundColor: m.color, borderRadius: 2 }} />
                                        </View>
                                    </View>
                                ))}
                            </View>
                        </TouchableOpacity>

                        {/* Class Overview */}
                        <View>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                    <BookOpen size={18} color={theme.colors.ink} strokeWidth={2.4} />
                                    <Text style={{ fontFamily: theme.fonts.s, fontSize: 16, fontWeight: '600', color: theme.colors.ink }}>Class Overview</Text>
                                </View>
                                <TouchableOpacity onPress={() => navigation.navigate('Gradebook')}>
                                    <Text style={{ fontFamily: theme.fonts.m, fontSize: 12, color: theme.colors.ink3 }}>See all →</Text>
                                </TouchableOpacity>
                            </View>
                            <View style={{
                                backgroundColor: theme.colors.surface,
                                borderRadius: theme.radii.lg,
                                borderWidth: 1, borderColor: theme.colors.border,
                                padding: 16,
                                ...theme.shadows.sm,
                            }}>
                                {classes.slice(0, 6).map((c, i) => (
                                    <TouchableOpacity key={i} onPress={() => navigation.navigate('Gradebook')} style={{
                                        flexDirection: 'row', alignItems: 'center', gap: 12,
                                        paddingVertical: 10,
                                        borderTopWidth: i > 0 ? 1 : 0, borderTopColor: theme.colors.border,
                                    }}>
                                        <View style={{ width: 6, height: 28, backgroundColor: gradeColor(c.grade), borderRadius: 3, flexShrink: 0 }} />
                                        <View style={{ flex: 1, minWidth: 0 }}>
                                            <Text style={{ fontFamily: theme.fonts.s, fontSize: 13, fontWeight: '600', color: theme.colors.ink }} numberOfLines={1}>{c.name}</Text>
                                            <Text style={{ fontFamily: theme.fonts.m, fontSize: 10, color: theme.colors.ink3, marginTop: 1 }}>{c.type || 'REG'} · {c.teacher || ''}</Text>
                                        </View>
                                        <View style={{ flex: 1, height: 5, backgroundColor: theme.colors.surface2, borderRadius: 3, overflow: 'hidden', maxWidth: 70 }}>
                                            <View style={{ width: `${c.grade}%`, height: '100%', backgroundColor: gradeColor(c.grade), borderRadius: 3 }} />
                                        </View>
                                        <View style={{ alignItems: 'flex-end', minWidth: 44 }}>
                                            <Text style={{ fontFamily: theme.fonts.s, fontSize: 15, fontWeight: '700', color: gradeColor(c.grade) }}>{gradeLetter(c.grade)}</Text>
                                            <Text style={{ fontFamily: theme.fonts.mono, fontSize: 9, color: theme.colors.ink3 }}>{c.grade}%</Text>
                                        </View>
                                    </TouchableOpacity>
                                ))}
                                {classes.length === 0 && (
                                    <Text style={{ fontFamily: theme.fonts.m, fontSize: 13, color: theme.colors.ink3, textAlign: 'center', paddingVertical: 16 }}>
                                        No classes loaded yet.{'\n'}Connect StudentVUE in Integrations.
                                    </Text>
                                )}
                            </View>
                        </View>

                        {/* Needs Attention */}
                        {atRisk.length > 0 && (
                            <View>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                                    <TrendingDown size={18} color={SEM.red} strokeWidth={2.4} />
                                    <Text style={{ fontFamily: theme.fonts.s, fontSize: 16, fontWeight: '600', color: theme.colors.ink }}>Needs Attention</Text>
                                </View>
                                {atRisk.map((c, i) => {
                                    const col = gradeColor(c.grade);
                                    return (
                                        <View key={i} style={{
                                            flexDirection: 'row', alignItems: 'center', gap: 12,
                                            backgroundColor: theme.colors.surface,
                                            borderRadius: theme.radii.lg, padding: 14, marginBottom: 8,
                                            borderWidth: 1, borderColor: theme.colors.border,
                                            ...theme.shadows.sm,
                                        }}>
                                            <View style={{
                                                width: 36, height: 36, borderRadius: 10,
                                                backgroundColor: SEM.red + '15',
                                                alignItems: 'center', justifyContent: 'center', flexShrink: 0
                                            }}>
                                                <AlertTriangle size={18} color={SEM.red} strokeWidth={2} />
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <Text style={{ fontFamily: theme.fonts.s, fontSize: 13, fontWeight: '600', color: theme.colors.ink }} numberOfLines={1}>{c.name}</Text>
                                                <Text style={{ fontFamily: theme.fonts.m, fontSize: 11, color: theme.colors.ink3, marginTop: 2 }}>Needs {(83 - c.grade).toFixed(1)}% to reach B</Text>
                                            </View>
                                            <View style={{ backgroundColor: col + '18', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
                                                <Text style={{ fontFamily: theme.fonts.s, fontSize: 13, fontWeight: '700', color: col }}>{c.grade}%</Text>
                                            </View>
                                        </View>
                                    );
                                })}
                            </View>
                        )}

                        {/* Smart Nudges */}
                        {nudges.length > 0 && (
                            <View>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                                    <Lightbulb size={18} color={SEM.gold} strokeWidth={2.4} />
                                    <Text style={{ fontFamily: theme.fonts.s, fontSize: 16, fontWeight: '600', color: theme.colors.ink }}>Smart Nudges</Text>
                                </View>
                                {nudges.map((nudge, idx) => {
                                    const nColor = nudge.type === 'warning' ? SEM.red : nudge.type === 'motivation' ? SEM.green : SEM.blue;
                                    return (
                                        <TouchableOpacity
                                            key={nudge.id || idx}
                                            style={{
                                                backgroundColor: theme.colors.surface,
                                                borderRadius: theme.radii.lg, padding: 14, marginBottom: 8,
                                                flexDirection: 'row', alignItems: 'flex-start', gap: 12,
                                                borderWidth: 1, borderColor: theme.colors.border,
                                                ...theme.shadows.sm,
                                            }}
                                            onPress={() => {
                                                lightImpact();
                                                if (nudge.action === 'navigate_focus') navigation.navigate('Focus');
                                                else if (nudge.action === 'navigate_gradebook') navigation.navigate('Gradebook');
                                                else if (nudge.action === 'navigate_calendar') navigation.navigate('Calendar');
                                                else if (nudge.action === 'navigate_leaderboard') navigation.navigate('Leaderboard');
                                            }}
                                            activeOpacity={0.75}
                                        >
                                            <View style={{
                                                width: 32, height: 32, borderRadius: 8,
                                                backgroundColor: nColor + '15',
                                                alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2
                                            }}>
                                                {nudge.type === 'warning' ? <AlertCircle size={16} color={nColor} /> :
                                                 nudge.type === 'achievement' ? <Award size={16} color={nColor} /> :
                                                 <Sparkles size={16} color={nColor} />}
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <Text style={{ fontFamily: theme.fonts.s, fontSize: 13, fontWeight: '600', color: theme.colors.ink }}>{nudge.title}</Text>
                                                <Text style={{ fontFamily: theme.fonts.m, fontSize: 12, color: theme.colors.ink3, marginTop: 3, lineHeight: 17 }}>{nudge.message}</Text>
                                            </View>
                                            <ChevronRight size={16} color={theme.colors.ink3} style={{ marginTop: 2 }} />
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        )}

                        {/* Recent Achievements */}
                        {recentAchievements.length > 0 && (
                            <View>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                                    <Award size={18} color={theme.colors.ink} strokeWidth={2.4} />
                                    <Text style={{ fontFamily: theme.fonts.s, fontSize: 16, fontWeight: '600', color: theme.colors.ink }}>Achievements</Text>
                                </View>
                                <View style={{ flexDirection: 'row', gap: 10 }}>
                                    {recentAchievements.map((ach, idx) => (
                                        <View key={idx} style={{
                                            flex: 1,
                                            backgroundColor: theme.colors.surface,
                                            borderRadius: theme.radii.lg, padding: 14,
                                            alignItems: 'center',
                                            borderWidth: 1, borderColor: theme.colors.border,
                                            ...theme.shadows.sm,
                                        }}>
                                            <Text style={{ fontSize: 28, marginBottom: 6 }}>{ach.icon}</Text>
                                            <Text style={{ fontFamily: theme.fonts.s, fontSize: 11, fontWeight: '600', color: theme.colors.ink, textAlign: 'center' }}>{ach.title}</Text>
                                        </View>
                                    ))}
                                </View>
                            </View>
                        )}
                    </View>
                </View>
                </View>
            </ScrollView>
        </View>
    );
}

// ── Weekly Performance line chart (matches design SVG) ────────────
function WeeklyPerformanceChart({ classes, theme }) {
    // Compute average grade trend over the last 6-7 "snapshots" using class.gradeHistory if present,
    // else simulate by interpolating slightly toward current grade.
    const points = React.useMemo(() => {
        if (!classes.length) return [];
        // Use stored gradeHistory if available
        const histories = classes
            .map(c => Array.isArray(c.gradeHistory) ? c.gradeHistory : null)
            .filter(Boolean);

        const N = 7;
        if (histories.length > 0) {
            const length = Math.min(N, Math.max(...histories.map(h => h.length)));
            const out = [];
            for (let i = 0; i < length; i++) {
                const vals = histories.map(h => h[h.length - length + i]).filter(v => typeof v === 'number');
                out.push(vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null);
            }
            return out.filter(v => v !== null);
        }
        // Fallback: gentle ramp toward current overall average
        const cur = classes.reduce((s, c) => s + (c.grade || 0), 0) / classes.length;
        const start = Math.max(60, cur - 6);
        return Array.from({ length: N }, (_, i) => +(start + (cur - start) * (i / (N - 1))).toFixed(1));
    }, [classes]);

    const SEM_GREEN = '#16A34A';
    const SEM_RED = '#E03E3E';
    const SEM_BLUE = '#2563EB';

    if (points.length < 2) return null;

    const W = 500;
    const H = 140;
    const minVal = Math.min(...points, 70);
    const maxVal = Math.max(...points, 100);
    const range = maxVal - minVal || 1;
    const padX = 8;

    const xs = points.map((_, i) => padX + (i / (points.length - 1)) * (W - 2 * padX));
    const ys = points.map(v => H - ((v - minVal) / range) * (H - 12) - 6);

    // Build smooth path
    const pathD = xs.reduce((acc, x, i) => acc + `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${ys[i].toFixed(1)} `, '');
    const fillD = pathD + `L ${xs[xs.length - 1].toFixed(1)} ${H} L ${xs[0].toFixed(1)} ${H} Z`;

    const trend = points[points.length - 1] - points[0];
    const trendColor = trend >= 0 ? SEM_GREEN : SEM_RED;
    const stroke = trend >= 0 ? SEM_GREEN : trend < -2 ? SEM_RED : SEM_BLUE;

    const labels = ['W12', 'W13', 'W14', 'W15', 'W16', 'W17', 'Now'].slice(-points.length);
    const ySteps = [100, 90, 80, 70].filter(v => v >= minVal && v <= maxVal);

    return (
        <View style={{
            backgroundColor: theme.colors.surface,
            borderRadius: theme.radii.lg,
            borderWidth: 1, borderColor: theme.colors.border,
            padding: 20,
            ...theme.shadows.sm,
        }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Activity size={16} color={theme.colors.ink} strokeWidth={2.4} />
                        <Text style={{ fontFamily: theme.fonts.s, fontSize: 15, fontWeight: '600', color: theme.colors.ink }}>
                            Weekly Performance
                        </Text>
                    </View>
                    <Text style={{ fontFamily: theme.fonts.m, fontSize: 12, color: theme.colors.ink3, marginTop: 2 }}>
                        Last {points.length} weeks · all classes
                    </Text>
                </View>
                <View style={{
                    paddingHorizontal: 10, paddingVertical: 4,
                    backgroundColor: trendColor + '15',
                    borderRadius: 6,
                }}>
                    <Text style={{ fontFamily: theme.fonts.s, fontSize: 12, fontWeight: '700', color: trendColor }}>
                        {trend >= 0 ? '↑' : '↓'} {Math.abs(trend).toFixed(1)}%
                    </Text>
                </View>
            </View>

            {/* Chart */}
            <View style={{ height: H, paddingLeft: 24, paddingRight: 4, position: 'relative' }}>
                {/* Y-axis grid + labels */}
                {ySteps.map((v) => {
                    const y = H - ((v - minVal) / range) * (H - 12) - 6;
                    return (
                        <View key={v} style={{
                            position: 'absolute', left: 24, right: 0, top: y,
                            borderTopWidth: 1, borderTopColor: theme.colors.border,
                            borderStyle: 'dashed',
                        }}>
                            <Text style={{
                                position: 'absolute', left: -22, top: -7,
                                fontFamily: theme.fonts.mono, fontSize: 9, color: theme.colors.ink4,
                            }}>
                                {v}
                            </Text>
                        </View>
                    );
                })}

                <Svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" preserveAspectRatio="none">
                    <Defs>
                        <LinearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1">
                            <Stop offset="0" stopColor={stroke} stopOpacity="0.25" />
                            <Stop offset="1" stopColor={stroke} stopOpacity="0" />
                        </LinearGradient>
                    </Defs>
                    <Path d={fillD} fill="url(#chartFill)" />
                    <Path d={pathD} fill="none" stroke={stroke} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
                    {xs.map((x, i) => (
                        <Circle key={i} cx={x} cy={ys[i]} r="4" fill={theme.colors.surface} stroke={stroke} strokeWidth="2" />
                    ))}
                </Svg>
            </View>

            {/* X-axis labels */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, paddingLeft: 24, paddingRight: 4 }}>
                {labels.map((l, i) => (
                    <Text key={i} style={{ fontFamily: theme.fonts.mono, fontSize: 10, color: theme.colors.ink3 }}>
                        {l}
                    </Text>
                ))}
            </View>
        </View>
    );
}
