import React, { useState, useCallback } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, FlatList,
    TextInput, Alert, ScrollView, Dimensions, Modal, ActivityIndicator
} from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { ChevronDown, ChevronLeft, RefreshCw, ChevronRight, LayoutGrid, Calendar, Filter, Clock } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { theme as staticTheme } from '../utils/theme';
import { syncStudentVueGrades } from '../utils/studentVueAPI';
import { useNavigation } from '@react-navigation/native';

const screenWidth = Dimensions.get('window').width;

// ── Color helpers ────────────────────────────────────────────
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

export default function GradebookScreen() {
    const { theme, isDarkMode } = useTheme();
    const styles = getStyles(theme);
    const navigation = useNavigation();
    const [classes, setClasses] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [selectedClass, setSelectedClass] = useState(null);
    const [viewMode, setViewMode] = useState('assignments'); // 'assignments' | 'whatIf' | 'target'
    const [interval, setInterval] = useState('3m'); // '1m', '3m', '6m', 'all'

    // ── Period / Quarter state ──────────────────────────────────
    const [availablePeriods, setAvailablePeriods] = useState([]);
    const [currentPeriodIndex, setCurrentPeriodIndex] = useState(null);
    const [currentPeriodName, setCurrentPeriodName] = useState('');
    const [isPeriodPickerOpen, setIsPeriodPickerOpen] = useState(false);

    // ── What If state ───────────────────────────────────────────
    const [newAsgnScore, setNewAsgnScore] = useState('');
    const [newAsgnTotal, setNewAsgnTotal] = useState('');
    const [newAsgnCat, setNewAsgnCat] = useState('Summative'); // Summative | Formative | Final
    const [hypotheticalResult, setHypotheticalResult] = useState(null);

    // ── Target state ────────────────────────────────────────────
    const [targetGrade, setTargetGrade] = useState('');
    const [targetCat, setTargetCat] = useState('Summative');
    const [targetPossible, setTargetPossible] = useState('');
    const [requiredScore, setRequiredScore] = useState(null);
    const [selectedGraphAsgn, setSelectedGraphAsgn] = useState(null);

    // ── Load grades from AsyncStorage (or trigger sync) ─────────
    useFocusEffect(
        useCallback(() => {
            const loadGrades = async () => {
                try {
                    const storedGrades = await AsyncStorage.getItem('studentVueGrades');
                    const storedPeriods = await AsyncStorage.getItem('studentVuePeriods');
                    const storedPeriodName = await AsyncStorage.getItem('studentVuePeriodName');
                    const storedPeriodIndex = await AsyncStorage.getItem('studentVuePeriodIndex');

                    if (storedGrades) setClasses(JSON.parse(storedGrades));
                    if (storedPeriods) setAvailablePeriods(JSON.parse(storedPeriods));
                    if (storedPeriodName) setCurrentPeriodName(storedPeriodName);
                    if (storedPeriodIndex !== null) setCurrentPeriodIndex(parseInt(storedPeriodIndex));
                } catch (e) {
                    console.error("Failed to load grades from storage:", e);
                } finally {
                    setIsLoading(false);
                }
            };
            loadGrades();
        }, [])
    );

    // ── Sync a specific quarter ─────────────────────────────────
    const syncPeriod = async (periodIndex) => {
        try {
            const isDemo = await AsyncStorage.getItem('isDemoData') === 'true';

            if (isDemo) {
                // In demo mode, load from the pre-generated quarter cache
                setIsSyncing(true);
                // Artificial delay for realism
                await new Promise(r => setTimeout(r, 600));

                const raw = await AsyncStorage.getItem(`studentVueGradesQ${periodIndex}`);
                const periodsRaw = await AsyncStorage.getItem('studentVuePeriods');
                const periods = JSON.parse(periodsRaw || '[]');
                const periodName = periods.find(p => p.index === periodIndex)?.name || `Quarter ${periodIndex + 1}`;

                if (raw) {
                    const grades = JSON.parse(raw);
                    setClasses(grades);
                    await AsyncStorage.setItem('studentVueGrades', raw);
                    setCurrentPeriodName(periodName);
                    await AsyncStorage.setItem('studentVuePeriodName', periodName);
                    setCurrentPeriodIndex(periodIndex);
                    await AsyncStorage.setItem('studentVuePeriodIndex', String(periodIndex));
                    setSelectedClass(null);
                }
                setIsSyncing(false);
                return;
            }

            const svUser = await AsyncStorage.getItem('svUsername');
            const svPass = await AsyncStorage.getItem('svPassword');
            const svUrl = await AsyncStorage.getItem('svDistrictUrl');

            if (!svUser || !svPass || !svUrl) {
                Alert.alert('Not configured', 'Please enter your StudentVUE credentials in Settings first.');
                return;
            }

            setIsSyncing(true);
            const result = await syncStudentVueGrades(svUser, svPass, svUrl, periodIndex);

            // result is now { grades, periods, period, periodIndex }
            const grades = result.grades || result; // backwards compat if it's just an array

            if (Array.isArray(grades) && grades.length > 0) {
                setClasses(grades);
                await AsyncStorage.setItem('studentVueGrades', JSON.stringify(grades));

                if (result.periods) {
                    setAvailablePeriods(result.periods);
                    await AsyncStorage.setItem('studentVuePeriods', JSON.stringify(result.periods));
                }
                if (result.period) {
                    setCurrentPeriodName(result.period);
                    await AsyncStorage.setItem('studentVuePeriodName', result.period);
                }
                if (result.periodIndex !== undefined) {
                    setCurrentPeriodIndex(result.periodIndex);
                    await AsyncStorage.setItem('studentVuePeriodIndex', String(result.periodIndex));
                }

                setSelectedClass(null);
            } else {
                Alert.alert('No Data', 'No grades found for this period.');
            }
        } catch (e) {
            Alert.alert('Sync Error', e.message);
        } finally {
            setIsSyncing(false);
        }
    };

    // ── GPA calculation ─────────────────────────────────────────
    const calculateOverallGPA = () => {
        if (classes.length === 0) return '—';
        const pts = classes.reduce((sum, c) => {
            const bonus = c.type === 'AP' ? 1 : c.type === 'HN' ? 0.5 : 0;
            const base = c.grade >= 93 ? 4 : c.grade >= 90 ? 3.7 : c.grade >= 87 ? 3.3 : c.grade >= 83 ? 3 : c.grade >= 80 ? 2.7 : c.grade >= 77 ? 2.3 : c.grade >= 73 ? 2 : c.grade >= 70 ? 1.7 : 1;
            return sum + base + bonus;
        }, 0);
        return (pts / classes.length).toFixed(2);
    };

    // ── What If / Target calculations ──────────────────────────
    const getCategoryTotals = (course) => {
        const cats = {
            Summative: { earned: 0, possible: 0 },
            Formative: { earned: 0, possible: 0 },
            Final: { earned: 0, possible: 0 }
        };

        (course.assignments || []).forEach(a => {
            const catStr = (a.category || a.type || '').toLowerCase();
            const nameStr = (a.name || a.title || '').toLowerCase();

            // Only strictly "Final Exam" or "Final" category counts as the 20% slot
            // "Final Project" or "Final Quiz" usually count as Summative
            let type = 'Formative';
            if (/summat|exam|test|quiz|assessment|frq|major/i.test(catStr) || /exam|test|major/i.test(nameStr)) {
                type = 'Summative';
            }
            if (catStr === 'final' || catStr === 'final exam' || nameStr === 'final exam') {
                type = 'Final';
            }
            if (/homework|classwork|daily|participation|bell|exit|formative/i.test(catStr)) {
                type = 'Formative';
            }

            cats[type].earned += a.score || 0;
            cats[type].possible += a.total || 0;
        });

        return cats;
    };

    const calculateHypothetical = () => {
        if (!selectedClass) return;
        const score = parseFloat(newAsgnScore);
        const total = parseFloat(newAsgnTotal);
        if (isNaN(score) || isNaN(total) || total <= 0) {
            if (Platform.OS === 'web') window.alert('Invalid Input: Enter score and total possible pts.');
            else Alert.alert('Invalid Input', 'Enter score and total possible pts.');
            return;
        }

        const cats = getCategoryTotals(selectedClass);
        // Add the hypothetical one
        cats[newAsgnCat].earned += score;
        cats[newAsgnCat].possible += total;

        // Formula: FinalGrade = ( (SummativePct*0.7 + FormativePct*0.3) * 0.8 ) + ( FinalExamPct * 0.2 )
        const sAvg = cats.Summative.possible > 0 ? (cats.Summative.earned / cats.Summative.possible) * 100 : null;
        const fAvg = cats.Formative.possible > 0 ? (cats.Formative.earned / cats.Formative.possible) * 100 : null;
        const feAvg = cats.Final.possible > 0 ? (cats.Final.earned / cats.Final.possible) * 100 : null;

        // 80% weight portion (Summative/Formative mix)
        let weight80 = 0;
        if (sAvg !== null && fAvg !== null) weight80 = (sAvg * 0.7) + (fAvg * 0.3);
        else if (sAvg !== null) weight80 = sAvg;
        else if (fAvg !== null) weight80 = fAvg;
        else weight80 = 100;

        let finalGrade = 0;
        if (feAvg !== null) {
            finalGrade = (weight80 * 0.8) + (feAvg * 0.2);
        } else {
            // If No final exam yet, the 80% part is effectively 100% of the CURRENT grade
            finalGrade = weight80;
        }

        setHypotheticalResult(finalGrade.toFixed(2));
    };

    const calculateRequiredScore = () => {
        if (!selectedClass) return;
        const target = parseFloat(targetGrade);
        const possible = parseFloat(targetPossible);
        if (isNaN(target) || isNaN(possible) || possible <= 0) {
            if (Platform.OS === 'web') window.alert('Invalid Input: Enter target % and points possible.');
            else Alert.alert('Invalid Input', 'Enter target % and points possible.');
            return;
        }

        const cats = getCategoryTotals(selectedClass);
        let low = 0, high = possible * 2;
        let bestX = 0;

        for (let i = 0; i < 30; i++) {
            let mid = (low + high) / 2;
            const testCats = JSON.parse(JSON.stringify(cats));
            testCats[targetCat].earned += mid;
            testCats[targetCat].possible += possible;

            const sAvg = testCats.Summative.possible > 0 ? (testCats.Summative.earned / testCats.Summative.possible) * 100 : null;
            const fAvg = testCats.Formative.possible > 0 ? (testCats.Formative.earned / testCats.Formative.possible) * 100 : null;
            const foAvg = testCats.Final.possible > 0 ? (testCats.Final.earned / testCats.Final.possible) * 100 : null;

            let w80 = (sAvg !== null && fAvg !== null) ? (sAvg * 0.7 + fAvg * 0.3) : (sAvg ?? fAvg ?? 100);
            let fG = (foAvg !== null) ? (w80 * 0.8 + foAvg * 0.2) : w80;

            if (fG < target) low = mid;
            else high = mid;
            bestX = mid;
        }
        setRequiredScore(bestX.toFixed(1));
    };

    // ── Grade trend chart data ──────────────────────────────────
    const getChartData = () => {
        if (!selectedClass || selectedClass.assignments.length === 0) return null;
        const scored = [...selectedClass.assignments]
            .filter(a => a.score !== undefined && a.total > 0)
            .reverse();

        const now = new Date();
        const intervalDays = interval === '1m' ? 30 : interval === '3m' ? 90 : interval === '6m' ? 180 : 9999;

        const filtered = scored.filter(a => {
            const dateStr = a.isoDate || a.date;
            if (!dateStr) return true; // Include if no date
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return true;
            const diff = (now - d) / (1000 * 60 * 60 * 24);
            return diff <= intervalDays;
        });

        if (filtered.length < 1) return null;

        // If only 1 point, duplicate it so LineChart has a segment to draw
        const displayAsgns = filtered.length === 1 ? [filtered[0], filtered[0]] : filtered.slice(-10);

        // Calculate running average for the entire history but only graph the relevant window
        let runningSum = 0;
        let runningTotal = 0;
        const allAvgs = scored.map(a => {
            runningSum += a.score;
            runningTotal += a.total;
            return Math.round((runningSum / runningTotal) * 100);
        });

        // Map the display assignments back to their running averages
        const displayData = displayAsgns.map(f => {
            const idx = scored.findIndex(s => s.id === f.id);
            return allAvgs[idx];
        });

        const finalDisplayAsgns = displayAsgns;

        return {
            labels: finalDisplayAsgns.map(() => ''),
            datasets: [{
                data: displayData,
                fullNames: finalDisplayAsgns.map(a => a.name || a.title || 'Assignment'),
                rawScores: finalDisplayAsgns.map(a => `${a.score}/${a.total}`),
                dates: finalDisplayAsgns.map(a => a.date)
            }],
        };
    };

    // ── Render: Period Picker Modal ─────────────────────────────
    const renderPeriodPicker = () => (
        <Modal
            visible={isPeriodPickerOpen}
            transparent
            animationType="fade"
            onRequestClose={() => setIsPeriodPickerOpen(false)}
        >
            <TouchableOpacity
                style={styles.modalOverlay}
                activeOpacity={1}
                onPress={() => setIsPeriodPickerOpen(false)}
            >
                <View style={styles.periodPickerContainer}>
                    <Text style={styles.periodPickerTitle}>Select Quarter</Text>
                    {availablePeriods.length === 0 ? (
                        <Text style={styles.periodPickerEmpty}>
                            Periods not yet loaded. Sync grades first.
                        </Text>
                    ) : (
                        availablePeriods.map((p) => {
                            const isSelected = p.index === currentPeriodIndex;
                            return (
                                <TouchableOpacity
                                    key={p.index}
                                    style={[styles.periodItem, isSelected && styles.periodItemSelected]}
                                    onPress={() => {
                                        setIsPeriodPickerOpen(false);
                                        syncPeriod(p.index);
                                    }}
                                >
                                    <Text style={[styles.periodItemText, isSelected && styles.periodItemTextSelected]}>
                                        {p.name}
                                    </Text>
                                    {isSelected && (
                                        <Text style={{ fontFamily: theme.fonts.m, fontSize: 10, color: theme.colors.green }}>
                                            ✓ Current
                                        </Text>
                                    )}
                                </TouchableOpacity>
                            );
                        })
                    )}
                </View>
            </TouchableOpacity>
        </Modal>
    );

    // ── Render: Main class card ─────────────────────────────────
    const renderClassItem = ({ item }) => {
        const color = gradeColor(item.grade, theme);
        const letter = item.letter && item.letter !== 'N/A' ? item.letter : gradeLetter(item.grade);
        const isSelected = selectedClass?.id === item.id;

        return (
            <TouchableOpacity
                style={[
                    styles.classCard,
                    isSelected && styles.classCardSelected,
                    { borderLeftColor: color, borderLeftWidth: 4 },
                ]}
                onPress={() => {
                    setSelectedClass(item);
                    setViewMode('assignments');
                    setHypotheticalResult(null);
                    setRequiredScore(null);
                }}
                activeOpacity={0.7}
            >
                {/* Left: course info */}
                <View style={{ flex: 1, paddingRight: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                        {item.period ? (
                            <Text style={styles.classCode}>Period {item.period}</Text>
                        ) : null}
                        <View style={[
                            styles.typeTag,
                            item.type === 'AP' && styles.typeTagAP,
                            item.type === 'HN' && styles.typeTagHN,
                        ]}>
                            <Text style={[
                                styles.typeTagText,
                                (item.type === 'AP' || item.type === 'HN') && { color: '#fff' },
                            ]}>{item.type}</Text>
                        </View>
                    </View>
                    <Text style={styles.className} numberOfLines={2}>{item.name}</Text>
                    {item.teacher ? (
                        <Text style={styles.classTeacher}>{item.teacher}</Text>
                    ) : null}
                    <View style={styles.gpRow}>
                        <Text style={styles.gpText}>W {item.wGP}</Text>
                        <Text style={[styles.gpText, { color: theme.colors.border2 }]}> · </Text>
                        <Text style={styles.gpText}>U {item.uGP}</Text>
                    </View>
                </View>

                {/* Right: grade */}
                <View style={styles.gradeBlock}>
                    <Text style={[styles.gradeLetter, { color }]}>{letter}</Text>
                    <Text style={[styles.gradePct, { color }]}>{item.grade}%</Text>
                </View>
            </TouchableOpacity>
        );
    };

    // ── Render: Assignment row (grouped by category) ────────────
    const renderAssignmentsGrouped = (cls) => {
        if (!cls.assignments || cls.assignments.length === 0) {
            return (
                <View style={styles.emptyAssignments}>
                    <Text style={styles.placeholderText}>No assignments recorded for this period.</Text>
                </View>
            );
        }

        // Group by category
        const groups = {};
        for (const a of cls.assignments) {
            const key = a.category || a.type || 'Other';
            if (!groups[key]) groups[key] = [];
            groups[key].push(a);
        }

        // Category average
        const catAvg = (items) => {
            const scored = items.filter(a => a.score !== undefined && a.total > 0);
            if (!scored.length) return null;
            return (scored.reduce((s, a) => s + a.score, 0) / scored.reduce((s, a) => s + a.total, 0)) * 100;
        };

        return Object.keys(groups).sort().map(cat => {
            const items = groups[cat];
            const avg = catAvg(items);
            const avgColor = avg !== null ? gradeColor(avg, theme) : theme.colors.ink3;

            return (
                <View key={cat} style={{ marginBottom: 16 }}>
                    {/* Category header */}
                    <View style={styles.categoryHeader}>
                        <Text style={styles.categoryLabel}>{cat}</Text>
                        {avg !== null && (
                            <Text style={[styles.categoryAvg, { color: avgColor }]}>
                                {avg.toFixed(1)}% avg
                            </Text>
                        )}
                    </View>

                    {/* Assignments */}
                    {items.map((a, i) => {
                        const hasPts = a.score !== undefined && a.total !== undefined && a.total > 0;
                        const apt = hasPts ? (a.score / a.total) * 100 : null;
                        const isMissing = a.rawScore && /miss|incomplete|ng/i.test(a.rawScore);
                        const isExcused = a.rawScore && /exc|excused/i.test(a.rawScore);
                        const accentColor = apt !== null ? gradeColor(apt, theme) : theme.colors.border;

                        return (
                            <View
                                key={`${cat}-${i}`}
                                style={[styles.assignmentRow, { borderLeftColor: accentColor, borderLeftWidth: 3 }]}
                            >
                                <View style={{ flex: 1, paddingRight: 8 }}>
                                    <Text style={styles.assignmentName} numberOfLines={2}>{a.name || a.title}</Text>
                                    {a.notes ? <Text style={styles.assignmentNotes}>{a.notes}</Text> : null}
                                    <Text style={styles.assignmentDate}>{a.date}</Text>
                                </View>
                                {hasPts ? (
                                    <View style={{ alignItems: 'flex-end' }}>
                                        <Text style={[styles.assignmentScore, { color: accentColor }]}>
                                            {Number.isInteger(a.score) ? a.score : a.score.toFixed(1)}/{Number.isInteger(a.total) ? a.total : a.total.toFixed(1)}
                                        </Text>
                                        <Text style={[styles.assignmentPct, { color: accentColor }]}>
                                            {Math.round(apt)}%
                                        </Text>
                                    </View>
                                ) : isMissing ? (
                                    <Text style={[styles.assignmentScore, { color: theme.colors.red }]}>Missing</Text>
                                ) : isExcused ? (
                                    <Text style={[styles.assignmentScore, { color: theme.colors.blue }]}>Exc</Text>
                                ) : (
                                    <Text style={[styles.assignmentScore, { color: theme.colors.ink4 }]}>—</Text>
                                )}
                            </View>
                        );
                    })}
                </View>
            );
        });
    };

    // ── Render: Detail view ─────────────────────────────────────
    const renderDetail = () => {
        if (!selectedClass) {
            return (
                <View style={styles.emptyDetail}>
                    <Text style={styles.emptyDetailIcon}>📋</Text>
                    <Text style={styles.placeholderText}>Select a class to view assignments</Text>
                </View>
            );
        }

        const cls = selectedClass;
        const letterColor = gradeColor(cls.grade, theme);
        const letter = cls.letter || gradeLetter(cls.grade);
        const chartData = getChartData();

        return (
            <View style={{ flex: 1 }}>
                {/* Back button + class header */}
                <TouchableOpacity
                    style={styles.backRow}
                    onPress={() => setSelectedClass(null)}
                >
                    <ChevronLeft size={13} color={theme.colors.ink3} />
                    <Text style={styles.backText}>All Classes</Text>
                </TouchableOpacity>

                <View style={[styles.detailHeader, { borderLeftColor: letterColor, borderLeftWidth: 4 }]}>
                    <View style={{ flex: 1, paddingRight: 12 }}>
                        <Text style={styles.detailClassName}>{cls.name}</Text>
                        <Text style={styles.detailMeta}>
                            {cls.teacher ? `${cls.teacher}` : ''}
                            {cls.room ? ` · Room ${cls.room}` : ''}
                            {cls.period ? ` · Period ${cls.period}` : ''}
                        </Text>
                        <View style={styles.detailTags}>
                            <View style={[styles.typeTag, cls.type === 'AP' && styles.typeTagAP, cls.type === 'HN' && styles.typeTagHN]}>
                                <Text style={[styles.typeTagText, (cls.type === 'AP' || cls.type === 'HN') && { color: '#fff' }]}>{cls.type}</Text>
                            </View>
                            <View style={styles.typeTag}>
                                <Text style={styles.typeTagText}>GP {cls.wGP}W / {cls.uGP}U</Text>
                            </View>
                        </View>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                        <Text style={[styles.detailLetter, { color: letterColor }]}>{letter}</Text>
                        <Text style={[styles.detailPct, { color: letterColor }]}>{cls.grade}%</Text>
                    </View>
                </View>

                {/* Tabs */}
                <View style={styles.tabRow}>
                    {['assignments', 'whatIf', 'target'].map((m, i) => (
                        <TouchableOpacity
                            key={m}
                            style={[styles.tabBtn, viewMode === m && styles.tabBtnActive]}
                            onPress={() => setViewMode(m)}
                        >
                            <Text style={[styles.tabText, viewMode === m && styles.tabTextActive]}>
                                {['Assignments', 'What If?', 'Target'][i]}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Assignments */}
                {viewMode === 'assignments' && (
                    <ScrollView showsVerticalScrollIndicator={false} style={{ marginTop: 4 }}>
                        {chartData && (
                            <View style={styles.chartContainer}>
                                <View style={styles.chartHeader}>
                                    <Text style={styles.chartTitle}>Grade Trend</Text>
                                    <View style={styles.intervalPicker}>
                                        {['1m', '3m', '6m', 'all'].map(i => (
                                            <TouchableOpacity
                                                key={i}
                                                onPress={() => setInterval(i)}
                                                style={[styles.intervalBtn, interval === i && styles.intervalBtnActive]}
                                            >
                                                <Text style={[styles.intervalText, interval === i && styles.intervalTextActive]}>{i.toUpperCase()}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                </View>

                                <View style={styles.chartWrapper}>
                                    <LineChart
                                        data={chartData}
                                        width={Dimensions.get('window').width > 1000 ? 920 : Dimensions.get('window').width - 80}
                                        height={200}
                                        chartConfig={{
                                            backgroundColor: theme.colors.surface,
                                            backgroundGradientFrom: theme.colors.surface,
                                            backgroundGradientTo: theme.colors.surface,
                                            decimalPlaces: 0,
                                            color: (opacity = 1) => theme.colors.accent,
                                            labelColor: (opacity = 1) => theme.colors.ink3,
                                            style: { borderRadius: 16 },
                                            propsForDots: { r: "4", strokeWidth: "2", stroke: theme.colors.surface },
                                            yAxisLabel: "",
                                            yAxisSuffix: "%",
                                        }}
                                        onDataPointClick={({ value, dataset, getColor, index }) => {
                                            setSelectedGraphAsgn({
                                                name: dataset.fullNames[index],
                                                score: dataset.rawScores[index],
                                                date: dataset.dates[index],
                                                finalGrade: value
                                            });
                                        }}
                                        bezier
                                        fromZero={false}
                                        segments={5}
                                        style={{ borderRadius: 8, paddingRight: 40 }}
                                    />
                                </View>

                                {selectedGraphAsgn && (
                                    <View style={styles.graphDetailBox}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.graphDetailName}>{selectedGraphAsgn.name}</Text>
                                            <Text style={styles.graphDetailDate}>{selectedGraphAsgn.date}</Text>
                                        </View>
                                        <View style={{ alignItems: 'flex-end' }}>
                                            <Text style={styles.graphDetailScore}>{selectedGraphAsgn.score}</Text>
                                            <Text style={[styles.graphDetailPct, { color: gradeColor(selectedGraphAsgn.finalGrade, theme) }]}>{selectedGraphAsgn.finalGrade}%</Text>
                                        </View>
                                        <TouchableOpacity onPress={() => setSelectedGraphAsgn(null)} style={{ marginLeft: 10 }}>
                                            <ChevronDown size={14} color={theme.colors.ink3} style={{ transform: [{ rotate: '90deg' }] }} />
                                        </TouchableOpacity>
                                    </View>
                                )}
                            </View>
                        )}
                        {renderAssignmentsGrouped(cls)}
                        <View style={{ height: 40 }} />
                    </ScrollView>
                )}

                {/* What If */}
                {viewMode === 'whatIf' && (
                    <ScrollView showsVerticalScrollIndicator={false} style={{ marginTop: 10 }}>
                        <Text style={styles.inputLabel}>New Assignment Score</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 15 }}>
                            <TextInput style={[styles.input, { flex: 1, marginBottom: 0 }]} placeholder="Points Earned" placeholderTextColor={theme.colors.ink3} keyboardType="numeric" value={newAsgnScore} onChangeText={setNewAsgnScore} />
                            <Text style={{ fontFamily: theme.fonts.m, color: theme.colors.ink3 }}>/</Text>
                            <TextInput style={[styles.input, { flex: 1, marginBottom: 0 }]} placeholder="Total Pts" placeholderTextColor={theme.colors.ink3} keyboardType="numeric" value={newAsgnTotal} onChangeText={setNewAsgnTotal} />
                        </View>

                        <Text style={styles.inputLabel}>Category</Text>
                        <View style={styles.catSelector}>
                            {['Summative', 'Formative', 'Final'].map(c => (
                                <TouchableOpacity
                                    key={c}
                                    style={[styles.catBtn, newAsgnCat === c && styles.catBtnActive]}
                                    onPress={() => setNewAsgnCat(c)}
                                >
                                    <Text style={[styles.catBtnText, newAsgnCat === c && styles.catBtnTextActive]}>{c}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <TouchableOpacity style={styles.calcButton} onPress={calculateHypothetical}>
                            <Text style={styles.calcButtonText}>Calculate New Grade</Text>
                        </TouchableOpacity>

                        {hypotheticalResult && (
                            <View style={styles.resultBox}>
                                <Text style={styles.resultLabel}>Your new average would be:</Text>
                                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                                    <Text style={[styles.resultValue, { color: gradeColor(parseFloat(hypotheticalResult), theme) }]}>{hypotheticalResult}%</Text>
                                    <Text style={styles.resultDiff}>
                                        ({(parseFloat(hypotheticalResult) - selectedClass.grade).toFixed(2).replace(/^([^+-])/, '+$1')}%)
                                    </Text>
                                </View>
                            </View>
                        )}
                    </ScrollView>
                )}

                {/* Target */}
                {viewMode === 'target' && (
                    <ScrollView showsVerticalScrollIndicator={false} style={{ marginTop: 10 }}>
                        <Text style={styles.inputLabel}>I want to reach this % average:</Text>
                        <TextInput style={styles.input} placeholder="e.g. 90" placeholderTextColor={theme.colors.ink3} keyboardType="numeric" value={targetGrade} onChangeText={setTargetGrade} />

                        <Text style={styles.inputLabel}>On an assignment worth this many points:</Text>
                        <TextInput style={styles.input} placeholder="e.g. 50" placeholderTextColor={theme.colors.ink3} keyboardType="numeric" value={targetPossible} onChangeText={setTargetPossible} />

                        <Text style={styles.inputLabel}>In this category:</Text>
                        <View style={styles.catSelector}>
                            {['Summative', 'Formative', 'Final'].map(c => (
                                <TouchableOpacity
                                    key={c}
                                    style={[styles.catBtn, targetCat === c && styles.catBtnActive]}
                                    onPress={() => setTargetCat(c)}
                                >
                                    <Text style={[styles.catBtnText, targetCat === c && styles.catBtnTextActive]}>{c}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <TouchableOpacity style={styles.calcButton} onPress={calculateRequiredScore}>
                            <Text style={styles.calcButtonText}>Find Needed Score</Text>
                        </TouchableOpacity>

                        {requiredScore && (
                            <View style={styles.resultBox}>
                                <Text style={styles.resultLabel}>To get a {targetGrade}%, you need:</Text>
                                <Text style={[styles.resultValue, { color: parseFloat(requiredScore) > targetPossible ? theme.colors.red : theme.colors.green }]}>
                                    {requiredScore} / {targetPossible}
                                </Text>
                                <Text style={styles.resultPct}>({((parseFloat(requiredScore) / parseFloat(targetPossible)) * 100).toFixed(1)}%)</Text>
                                {parseFloat(requiredScore) > parseFloat(targetPossible) && (
                                    <Text style={{ color: theme.colors.red, fontFamily: theme.fonts.m, fontSize: 10, marginTop: 6, textTransform: 'uppercase', letterSpacing: 1 }}>
                                        ⚠ Requires score higher than total possible
                                    </Text>
                                )}
                            </View>
                        )}
                    </ScrollView>
                )}
            </View>
        );
    };

    // ── Main render ─────────────────────────────────────────────
    return (
        <View style={styles.container}>
            <View style={styles.contentWrapper}>
                {/* Header */}
                <View style={styles.headerRow}>
                    {selectedClass ? (
                        /* When in detail view: show a big back button in place of title */
                        <TouchableOpacity
                            style={styles.headerBackBtn}
                            onPress={() => setSelectedClass(null)}
                            activeOpacity={0.6}
                        >
                            <ChevronLeft size={22} color={theme.colors.ink} />
                            <View>
                                <Text style={styles.header}>Gradebook</Text>
                                <Text style={styles.headerSub}>← Back to all classes</Text>
                            </View>
                        </TouchableOpacity>
                    ) : (
                        <View>
                            <Text style={styles.header}>Gradebook</Text>
                            <Text style={styles.headerSub}>
                                {currentPeriodName || 'No period loaded'}
                            </Text>
                        </View>
                    )}
                    <View style={styles.headerActions}>
                        {/* Quarter selector */}
                        <TouchableOpacity
                            style={styles.periodSelector}
                            onPress={() => setIsPeriodPickerOpen(true)}
                        >
                            <Text style={styles.periodSelectorText} numberOfLines={1}>
                                {currentPeriodName || 'Select Quarter'}
                            </Text>
                            <ChevronDown size={14} color={theme.colors.ink3} />
                        </TouchableOpacity>

                        {/* Refresh button */}
                        <TouchableOpacity
                            style={styles.syncBtn}
                            onPress={() => syncPeriod(currentPeriodIndex ?? 0)}
                            disabled={isSyncing}
                        >
                            {isSyncing
                                ? <ActivityIndicator size="small" color={theme.colors.ink} />
                                : <RefreshCw size={16} color={theme.colors.ink} />
                            }
                        </TouchableOpacity>
                    </View>
                </View>

                {/* GPA strip */}
                {classes.length > 0 && (
                    <View style={styles.gpaBanner}>
                        <Text style={styles.gpaBannerLabel}>Weighted GPA</Text>
                        <Text style={styles.gpaBannerValue}>{calculateOverallGPA()}</Text>
                    </View>
                )}

                {/* Content */}
                {isLoading ? (
                    <View style={styles.centeredState}>
                        <ActivityIndicator size="large" color={theme.colors.ink} />
                        <Text style={[styles.placeholderText, { marginTop: 12 }]}>Loading…</Text>
                    </View>
                ) : selectedClass ? (
                    /* Detail view */
                    <View style={styles.detailWrapper}>
                        {renderDetail()}
                    </View>
                ) : classes.length === 0 ? (
                    <View style={styles.centeredState}>
                        <Text style={{ fontSize: 32, marginBottom: 12 }}>📚</Text>
                        <Text style={styles.placeholderText}>No grades yet.</Text>
                        <Text style={styles.placeholderSub}>Go to Settings, enter your StudentVUE credentials, and sync.</Text>
                    </View>
                ) : (
                    /* Class list (Grid Layout) */
                    <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                        <View style={styles.gridContainer}>
                            {classes.map((item, index) => {
                                const gradeNum = parseFloat(item.grade);
                                const gradeColor = gradeNum >= 90 ? theme.colors.green : gradeNum >= 80 ? theme.colors.blue : gradeNum >= 70 ? theme.colors.orange : theme.colors.red;
                                return (
                                    <TouchableOpacity
                                        key={index}
                                        style={styles.gridItem}
                                        onPress={() => setSelectedClass(item)}
                                    >
                                        <View style={[styles.gridGradeBox, { borderLeftColor: gradeColor }]}>
                                            <Text style={[styles.gridGradeText, { color: gradeColor }]}>{item.grade}%</Text>
                                            <View style={styles.gridInfo}>
                                                <Text style={styles.gridClassName} numberOfLines={1}>{item.name}</Text>
                                                <Text style={styles.gridTeacher} numberOfLines={1}>{item.teacher}</Text>
                                            </View>
                                        </View>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </ScrollView>
                )}

            </View>
            {/* Period picker modal */}
            {renderPeriodPicker()}
        </View>
    );
}

const getStyles = (theme) => StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.bg, alignItems: 'center' },
    contentWrapper: { flex: 1, width: '100%', maxWidth: 1400, paddingHorizontal: 40, paddingTop: 60 },

    // Header
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
    header: { fontFamily: theme.fonts.d, fontSize: 42, fontWeight: '700', color: theme.colors.ink, letterSpacing: -1 },
    headerSub: { fontFamily: theme.fonts.m, fontSize: 13, color: theme.colors.ink3, letterSpacing: 1.5, textTransform: 'uppercase', marginTop: 3 },
    headerBackBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },

    // Quarter selector
    periodSelector: {
        flexDirection: 'row', alignItems: 'center', gap: 5,
        backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
        borderRadius: theme.radii.r, paddingHorizontal: 10, paddingVertical: 8, maxWidth: 160,
    },
    periodSelectorText: { fontFamily: theme.fonts.m, fontSize: 11, color: theme.colors.ink, flex: 1 },
    syncBtn: {
        backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
        borderRadius: theme.radii.r, padding: 8, alignItems: 'center', justifyContent: 'center',
    },

    // GPA Banner
    gpaBanner: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
        borderRadius: theme.radii.r, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 14,
    },
    gpaBannerLabel: { fontFamily: theme.fonts.m, fontSize: 12, color: theme.colors.ink3, letterSpacing: 2, textTransform: 'uppercase' },
    gpaBannerValue: { fontFamily: theme.fonts.d, fontSize: 28, fontWeight: '900', color: theme.colors.ink, letterSpacing: -1 },

    // Class card (old list item, kept for renderClassItem if still used elsewhere)
    classCard: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: theme.colors.surface, paddingVertical: 16, paddingRight: 16, paddingLeft: 14,
        borderRadius: theme.radii.lg, marginBottom: 10, borderWidth: 1, borderColor: theme.colors.border,
    },
    classCardSelected: { borderColor: theme.colors.ink, backgroundColor: theme.colors.surface2 },
    classCode: { fontFamily: theme.fonts.m, fontSize: 9, color: theme.colors.ink3, letterSpacing: 1 },
    // Allow full course name to wrap to 2 lines
    className: { fontFamily: theme.fonts.d, fontSize: 16, fontWeight: '600', color: theme.colors.ink, marginBottom: 3, lineHeight: 21, flexWrap: 'wrap' },
    classTeacher: { fontFamily: theme.fonts.m, fontSize: 10, color: theme.colors.ink3, marginBottom: 4 },
    gpRow: { flexDirection: 'row', alignItems: 'center' },
    gpText: { fontFamily: theme.fonts.m, fontSize: 9, color: theme.colors.ink3 },

    // Grade block — large letter + percentage
    gradeBlock: { alignItems: 'flex-end', minWidth: 64 },
    gradeLetter: { fontFamily: theme.fonts.d, fontSize: 48, fontWeight: '900', letterSpacing: -1.5, lineHeight: 52 },
    gradePct: { fontFamily: theme.fonts.m, fontSize: 11, fontWeight: '600', marginTop: -2 },

    // Graph Details
    graphDetailBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.surface2, borderRadius: theme.radii.r, padding: 12, marginTop: 12, borderWidth: 1, borderColor: theme.colors.border },
    graphDetailName: { fontFamily: theme.fonts.d, fontSize: 14, fontWeight: '600', color: theme.colors.ink },
    graphDetailDate: { fontFamily: theme.fonts.m, fontSize: 10, color: theme.colors.ink3, textTransform: 'uppercase' },
    graphDetailScore: { fontFamily: theme.fonts.d, fontSize: 16, fontWeight: '700', color: theme.colors.ink },
    graphDetailPct: { fontFamily: theme.fonts.m, fontSize: 11, fontWeight: '800' },

    // Grid Layout
    gridContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 20, paddingBottom: 60, marginTop: 20 },
    gridItem: { width: '31.5%', backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg, borderWidth: 1, borderColor: theme.colors.border, overflow: 'hidden' },
    gridGradeBox: { padding: 24, paddingVertical: 36, borderLeftWidth: 6 },
    gridGradeText: { fontFamily: theme.fonts.d, fontSize: 32, fontWeight: '800', marginBottom: 6 },
    gridInfo: { marginTop: 8 },
    gridClassName: { fontFamily: theme.fonts.s, fontSize: 16, fontWeight: '700', color: theme.colors.ink },
    gridTeacher: { fontFamily: theme.fonts.m, fontSize: 11, color: theme.colors.ink3, marginTop: 4 },

    // Chart improvements
    chartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
    chartTitle: { fontFamily: theme.fonts.d, fontSize: 18, fontWeight: '700', color: theme.colors.ink },
    intervalPicker: { flexDirection: 'row', gap: 6 },
    intervalBtn: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6, backgroundColor: theme.colors.surface2 },
    intervalBtnActive: { backgroundColor: theme.colors.accent },
    intervalText: { fontFamily: theme.fonts.m, fontSize: 9, color: theme.colors.ink2 },
    intervalTextActive: { color: '#fff', fontWeight: '700' },
    chartWrapper: { alignItems: 'center' },

    // Type tags
    typeTag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3, backgroundColor: theme.colors.surface2, borderWidth: 1, borderColor: theme.colors.border },
    typeTagAP: { backgroundColor: theme.colors.ink, borderColor: theme.colors.ink },
    typeTagHN: { backgroundColor: '#4e4c47', borderColor: '#4e4c47' },
    typeTagText: { fontFamily: theme.fonts.m, fontSize: 8, fontWeight: '600', color: theme.colors.ink2, letterSpacing: 0.5, textTransform: 'uppercase' },

    // Detail view
    detailWrapper: { flex: 1 },
    backRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12 },
    backText: { fontFamily: theme.fonts.m, fontSize: 11, color: theme.colors.ink3, letterSpacing: 0.5 },
    detailHeader: {
        backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
        borderRadius: theme.radii.lg, padding: 16, marginBottom: 12, flexDirection: 'row', alignItems: 'flex-start',
    },
    detailClassName: { fontFamily: theme.fonts.d, fontSize: 18, fontWeight: '700', color: theme.colors.ink, marginBottom: 3 },
    detailMeta: { fontFamily: theme.fonts.m, fontSize: 10, color: theme.colors.ink3, marginBottom: 8 },
    detailTags: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
    detailLetter: { fontFamily: theme.fonts.d, fontSize: 52, fontWeight: '900', letterSpacing: -1.5, lineHeight: 56 },
    detailPct: { fontFamily: theme.fonts.m, fontSize: 12, textAlign: 'right' },

    // Tabs
    tabRow: { flexDirection: 'row', backgroundColor: theme.colors.surface2, borderRadius: theme.radii.lg, padding: 3, marginBottom: 12, gap: 3 },
    tabBtn: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: theme.radii.r },
    tabBtnActive: { backgroundColor: theme.colors.surface, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 2, elevation: 1 },
    tabText: { fontFamily: theme.fonts.m, fontSize: 11, color: theme.colors.ink3 },
    tabTextActive: { color: theme.colors.ink, fontWeight: '700' },

    // Category grouping
    categoryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: theme.colors.border, marginBottom: 6 },
    categoryLabel: { fontFamily: theme.fonts.m, fontSize: 9, color: theme.colors.ink3, letterSpacing: 2, textTransform: 'uppercase' },
    categoryAvg: { fontFamily: theme.fonts.m, fontSize: 10, fontWeight: '600' },

    // Assignment row
    assignmentRow: {
        flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
        paddingVertical: 10, paddingHorizontal: 12,
        backgroundColor: theme.colors.surface, borderRadius: theme.radii.r,
        borderWidth: 1, borderColor: theme.colors.border, marginBottom: 3,
    },
    assignmentName: { fontFamily: theme.fonts.s, fontSize: 13, fontWeight: '500', color: theme.colors.ink, lineHeight: 18 },
    assignmentNotes: { fontFamily: theme.fonts.m, fontSize: 9, color: theme.colors.ink3, marginTop: 2 },
    assignmentDate: { fontFamily: theme.fonts.m, fontSize: 9, color: theme.colors.ink3, marginTop: 3 },
    assignmentScore: { fontFamily: theme.fonts.m, fontSize: 12, fontWeight: '600' },
    assignmentPct: { fontFamily: theme.fonts.m, fontSize: 10 },
    emptyAssignments: { alignItems: 'center', padding: 30 },

    // Chart
    chartContainer: {
        backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
        borderRadius: theme.radii.lg, padding: 12, marginBottom: 16, alignItems: 'center',
    },
    chartLabel: { fontFamily: theme.fonts.m, fontSize: 9, color: theme.colors.ink3, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8, alignSelf: 'flex-start' },

    // Calc
    inputLabel: { fontFamily: theme.fonts.m, fontSize: 10, color: theme.colors.ink3, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 5, marginTop: 14 },
    input: { backgroundColor: theme.colors.surface2, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radii.r, padding: 12, fontFamily: theme.fonts.m, fontSize: 14, color: theme.colors.ink },
    calcButton: { backgroundColor: theme.colors.accent, padding: 14, borderRadius: theme.radii.r, alignItems: 'center', marginTop: 10 },
    calcButtonText: { fontFamily: theme.fonts.s, color: '#fff', fontSize: 15, fontWeight: '700' },
    googleBtn: { backgroundColor: theme.colors.surface2, borderWidth: 1, borderColor: theme.colors.border, padding: 14, borderRadius: theme.radii.r, alignItems: 'center' },
    googleBtnText: { fontFamily: theme.fonts.s, color: theme.colors.ink, fontSize: 15, fontWeight: '600' },

    actionBtn: {
        backgroundColor: '#FFFFFF', paddingVertical: 14, paddingHorizontal: 24,
        borderRadius: theme.radii.r, alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, borderColor: '#000000',
    },
    actionBtnText: { color: '#000000', fontFamily: theme.fonts.s, fontSize: 16, fontWeight: '700' },

    actionBtnLight: {
        backgroundColor: theme.colors.surface2, borderWidth: 1, borderColor: theme.colors.border,
        paddingVertical: 14, paddingHorizontal: 24, borderRadius: theme.radii.r,
        alignItems: 'center', justifyContent: 'center',
    },
    actionBtnLightText: { fontFamily: theme.fonts.s, color: theme.colors.ink, fontSize: 16, fontWeight: '700' },
    resultBox: { marginTop: 16, padding: 20, backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg, alignItems: 'center', borderWidth: 1, borderColor: theme.colors.border },
    resultLabel: { fontFamily: theme.fonts.s, fontSize: 13, color: theme.colors.ink2, marginBottom: 6, textAlign: 'center' },
    resultValue: { fontFamily: theme.fonts.d, fontSize: 48, fontWeight: '300', letterSpacing: -1.5 },

    // Period picker modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
    periodPickerContainer: {
        backgroundColor: theme.colors.surface, borderRadius: 12, padding: 20,
        width: '100%', maxWidth: 360, borderWidth: 1, borderColor: theme.colors.border,
    },
    periodPickerTitle: { fontFamily: theme.fonts.d, fontSize: 20, fontWeight: '700', color: theme.colors.ink, marginBottom: 14, letterSpacing: -0.3 },
    periodPickerEmpty: { fontFamily: theme.fonts.m, fontSize: 12, color: theme.colors.ink3, textAlign: 'center', padding: 12 },
    periodItem: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingVertical: 13, paddingHorizontal: 14, borderRadius: theme.radii.r,
        borderWidth: 1, borderColor: theme.colors.border, marginBottom: 6,
    },
    periodItemSelected: { backgroundColor: theme.colors.surface2, borderColor: theme.colors.ink },
    periodItemText: { fontFamily: theme.fonts.s, fontSize: 14, fontWeight: '500', color: theme.colors.ink },
    periodItemTextSelected: { fontWeight: '700' },

    // States
    centeredState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
    placeholderText: { fontFamily: theme.fonts.s, color: theme.colors.ink3, fontSize: 14, textAlign: 'center' },
    placeholderSub: { fontFamily: theme.fonts.m, color: theme.colors.ink4, fontSize: 12, textAlign: 'center', marginTop: 6, lineHeight: 18 },
    emptyDetail: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    emptyDetailIcon: { fontSize: 36, marginBottom: 12 },

    // Category Selector (What If)
    catSelector: { flexDirection: 'row', gap: 6, marginBottom: 15 },
    catBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: theme.radii.r, backgroundColor: theme.colors.surface2, borderWidth: 1, borderColor: theme.colors.border },
    catBtnActive: { backgroundColor: theme.colors.ink, borderColor: theme.colors.ink },
    catBtnText: { fontFamily: theme.fonts.m, fontSize: 11, color: theme.colors.ink2 },
    catBtnTextActive: { color: '#fff', fontWeight: '700' },
    resultDiff: { fontFamily: theme.fonts.m, fontSize: 13, color: theme.colors.ink3 },
    resultPct: { fontFamily: theme.fonts.m, fontSize: 12, color: theme.colors.ink3, marginTop: 4 },
});
