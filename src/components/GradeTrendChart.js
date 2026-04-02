import React, { useState, useEffect, useMemo } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, Dimensions, ScrollView,
} from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../context/ThemeContext';

const screenWidth = Dimensions.get('window').width;

// ── Storage Key ──────────────────────────────────────────────
const GRADE_HISTORY_KEY = '@grade_history';

// ── Utility: save a grade snapshot ───────────────────────────
// Call this whenever grades are synced to persist a timestamped
// record of GPA and per-class grades.
export const saveGradeSnapshot = async (classes) => {
    try {
        if (!classes || classes.length === 0) return;

        // Build per-class summary
        const classSummary = classes.map(c => ({
            name: c.name,
            grade: typeof c.grade === 'number' ? c.grade : null,
        }));

        // Compute unweighted GPA from class percentages
        const validGrades = classSummary.filter(c => c.grade !== null);
        if (validGrades.length === 0) return;

        const gpa = pctToGpa(
            validGrades.reduce((sum, c) => sum + c.grade, 0) / validGrades.length
        );

        const snapshot = {
            date: new Date().toISOString(),
            gpa: +gpa.toFixed(2),
            classes: classSummary,
        };

        const raw = await AsyncStorage.getItem(GRADE_HISTORY_KEY);
        const history = raw ? JSON.parse(raw) : [];

        // Avoid duplicate entries within the same hour
        const lastEntry = history[history.length - 1];
        if (lastEntry) {
            const lastTime = new Date(lastEntry.date).getTime();
            const now = Date.now();
            if (now - lastTime < 60 * 60 * 1000) {
                // Replace the last entry instead of adding a new one
                history[history.length - 1] = snapshot;
            } else {
                history.push(snapshot);
            }
        } else {
            history.push(snapshot);
        }

        // Cap at 365 entries
        const trimmed = history.length > 365 ? history.slice(-365) : history;
        await AsyncStorage.setItem(GRADE_HISTORY_KEY, JSON.stringify(trimmed));
    } catch (err) {
        console.error('saveGradeSnapshot error:', err);
    }
};

// ── Utility: load grade history ──────────────────────────────
export const loadGradeHistory = async () => {
    try {
        const raw = await AsyncStorage.getItem(GRADE_HISTORY_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch (err) {
        console.error('loadGradeHistory error:', err);
        return [];
    }
};

// ── Helpers ──────────────────────────────────────────────────
const pctToGpa = (pct) => {
    if (pct >= 93) return 4.0;
    if (pct >= 90) return 3.7;
    if (pct >= 87) return 3.3;
    if (pct >= 83) return 3.0;
    if (pct >= 80) return 2.7;
    if (pct >= 77) return 2.3;
    if (pct >= 73) return 2.0;
    if (pct >= 70) return 1.7;
    if (pct >= 67) return 1.3;
    if (pct >= 60) return 1.0;
    return 0.0;
};

const TIME_RANGES = ['1W', '1M', '3M', 'All'];

const filterByRange = (history, range) => {
    if (!history || history.length === 0) return [];
    const now = Date.now();
    const msMap = {
        '1W': 7 * 24 * 60 * 60 * 1000,
        '1M': 30 * 24 * 60 * 60 * 1000,
        '3M': 90 * 24 * 60 * 60 * 1000,
    };
    if (range === 'All') return history;
    const cutoff = now - msMap[range];
    return history.filter(h => new Date(h.date).getTime() >= cutoff);
};

const formatDateLabel = (isoStr) => {
    const d = new Date(isoStr);
    return `${d.getMonth() + 1}/${d.getDate()}`;
};

// ── Component ────────────────────────────────────────────────
export default function GradeTrendChart({ gradeHistory: externalHistory }) {
    const { theme } = useTheme();
    const styles = getStyles(theme);

    const [history, setHistory] = useState(externalHistory || []);
    const [range, setRange] = useState('1M');

    // Load from storage if no external prop provided
    useEffect(() => {
        if (externalHistory && externalHistory.length > 0) {
            setHistory(externalHistory);
        } else {
            loadGradeHistory().then(h => {
                if (h.length > 0) setHistory(h);
            });
        }
    }, [externalHistory]);

    const filtered = useMemo(() => filterByRange(history, range), [history, range]);

    // Current and previous GPA for trend arrow
    const currentGpa = filtered.length > 0 ? filtered[filtered.length - 1].gpa : null;
    const prevGpa = filtered.length > 1 ? filtered[filtered.length - 2].gpa : null;
    const gpaDelta = currentGpa !== null && prevGpa !== null ? currentGpa - prevGpa : 0;

    // Build chart data, sampling if there are too many points
    const chartPoints = useMemo(() => {
        if (filtered.length === 0) return null;

        const maxLabels = 7;
        let sampled = filtered;
        if (filtered.length > maxLabels) {
            const step = Math.ceil(filtered.length / maxLabels);
            sampled = filtered.filter((_, i) => i % step === 0);
            // Always include the last entry
            if (sampled[sampled.length - 1] !== filtered[filtered.length - 1]) {
                sampled.push(filtered[filtered.length - 1]);
            }
        }

        return {
            labels: sampled.map(h => formatDateLabel(h.date)),
            datasets: [{ data: sampled.map(h => h.gpa) }],
        };
    }, [filtered]);

    // Per-class grade trends for sparkline bars
    const classNames = useMemo(() => {
        if (filtered.length === 0) return [];
        const names = new Set();
        filtered.forEach(h => {
            (h.classes || []).forEach(c => names.add(c.name));
        });
        return Array.from(names);
    }, [filtered]);

    const classTrends = useMemo(() => {
        return classNames.map(name => {
            const grades = filtered
                .map(h => {
                    const cls = (h.classes || []).find(c => c.name === name);
                    return cls ? cls.grade : null;
                })
                .filter(g => g !== null);
            const current = grades.length > 0 ? grades[grades.length - 1] : null;
            const prev = grades.length > 1 ? grades[grades.length - 2] : null;
            return { name, grades, current, prev };
        });
    }, [classNames, filtered]);

    if (history.length === 0) {
        return (
            <View style={styles.card}>
                <Text style={styles.emptyTitle}>Grade Trends</Text>
                <Text style={styles.emptyText}>
                    No grade history yet. Sync your grades to start tracking trends.
                </Text>
            </View>
        );
    }

    return (
        <View style={styles.card}>
            {/* ── Current GPA Header ────────────────────── */}
            <View style={styles.gpaHeader}>
                <View>
                    <Text style={styles.gpaLabel}>Current GPA</Text>
                    <View style={styles.gpaRow}>
                        <Text style={styles.gpaValue}>
                            {currentGpa !== null ? currentGpa.toFixed(2) : '--'}
                        </Text>
                        {gpaDelta !== 0 && (
                            <View style={[
                                styles.trendBadge,
                                { backgroundColor: gpaDelta > 0 ? theme.colors.ink : theme.colors.surface },
                            ]}>
                                <Text style={[
                                    styles.trendArrow,
                                    { color: gpaDelta > 0 ? theme.colors.surface : theme.colors.ink },
                                ]}>
                                    {gpaDelta > 0 ? '\u2191' : '\u2193'} {Math.abs(gpaDelta).toFixed(2)}
                                </Text>
                            </View>
                        )}
                    </View>
                </View>
            </View>

            {/* ── Time Range Selector ───────────────────── */}
            <View style={styles.rangeRow}>
                {TIME_RANGES.map(r => (
                    <TouchableOpacity
                        key={r}
                        style={[styles.rangeBtn, range === r && styles.rangeBtnActive]}
                        onPress={() => setRange(r)}
                    >
                        <Text style={[styles.rangeTxt, range === r && styles.rangeTxtActive]}>
                            {r}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {/* ── GPA Line Chart ────────────────────────── */}
            {chartPoints && chartPoints.datasets[0].data.length >= 2 ? (
                <View style={styles.chartWrap}>
                    <LineChart
                        data={chartPoints}
                        width={screenWidth - 80}
                        height={180}
                        yAxisSuffix=""
                        withDots
                        withInnerLines={false}
                        withOuterLines={false}
                        fromZero={false}
                        segments={4}
                        chartConfig={{
                            backgroundColor: theme.colors.surface,
                            backgroundGradientFrom: theme.colors.surface,
                            backgroundGradientTo: theme.colors.surface,
                            decimalPlaces: 2,
                            color: () => theme.colors.ink,
                            labelColor: () => theme.colors.ink3,
                            propsForDots: {
                                r: '5',
                                strokeWidth: '3',
                                stroke: theme.colors.ink,
                            },
                            propsForBackgroundLines: {
                                stroke: theme.colors.border,
                                strokeWidth: 1,
                                strokeDasharray: '4,4',
                            },
                            strokeWidth: 3,
                        }}
                        bezier
                        style={styles.chart}
                    />
                </View>
            ) : (
                <View style={styles.chartPlaceholder}>
                    <Text style={styles.placeholderText}>
                        Need at least 2 data points to show trend
                    </Text>
                </View>
            )}

            {/* ── Per-Class Trends ──────────────────────── */}
            {classTrends.length > 0 && (
                <View style={styles.classSection}>
                    <Text style={styles.classSectionTitle}>Class Trends</Text>
                    <ScrollView
                        showsVerticalScrollIndicator={false}
                        style={{ maxHeight: 300 }}
                    >
                        {classTrends.map(ct => (
                            <View key={ct.name} style={styles.classRow}>
                                <View style={styles.classInfo}>
                                    <Text style={styles.className} numberOfLines={1}>
                                        {ct.name}
                                    </Text>
                                    <View style={styles.classGradeRow}>
                                        <Text style={styles.classGrade}>
                                            {ct.current !== null ? `${ct.current.toFixed(1)}%` : '--'}
                                        </Text>
                                        {ct.current !== null && ct.prev !== null && ct.current !== ct.prev && (
                                            <Text style={[
                                                styles.classDelta,
                                                { color: ct.current >= ct.prev ? theme.colors.ink : theme.colors.ink2 },
                                            ]}>
                                                {ct.current > ct.prev ? '\u2191' : '\u2193'}
                                                {Math.abs(ct.current - ct.prev).toFixed(1)}
                                            </Text>
                                        )}
                                    </View>
                                </View>
                                {/* Mini sparkline bar */}
                                <View style={styles.sparkWrap}>
                                    {ct.grades.length > 0 && renderSparkBars(ct.grades, theme)}
                                </View>
                            </View>
                        ))}
                    </ScrollView>
                </View>
            )}
        </View>
    );
}

// ── Spark Bars ───────────────────────────────────────────────
const renderSparkBars = (grades, theme) => {
    const min = Math.min(...grades);
    const max = Math.max(...grades);
    const range = max - min || 1;

    // Show last 10 entries max
    const recent = grades.slice(-10);

    return (
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 28 }}>
            {recent.map((g, i) => {
                const ratio = (g - min) / range;
                const height = 6 + ratio * 22; // min 6px, max 28px
                const isLast = i === recent.length - 1;
                return (
                    <View
                        key={i}
                        style={{
                            width: 6,
                            height,
                            backgroundColor: isLast ? theme.colors.ink : theme.colors.ink3,
                            borderRadius: 2,
                            borderWidth: isLast ? 2 : 1,
                            borderColor: theme.colors.ink,
                        }}
                    />
                );
            })}
        </View>
    );
};

// ── Styles ───────────────────────────────────────────────────
const getStyles = (theme) => StyleSheet.create({
    card: {
        backgroundColor: theme.colors.surface,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: theme.radii?.lg || 14,
        padding: 20,
        marginBottom: 16,
        ...(theme.shadows?.sm || {}),
    },
    // Empty state
    emptyTitle: {
        fontFamily: theme.fonts.d,
        fontSize: 20,
        color: theme.colors.ink,
        marginBottom: 8,
    },
    emptyText: {
        fontFamily: theme.fonts.m,
        fontSize: 14,
        color: theme.colors.ink3,
        lineHeight: 20,
    },
    // GPA Header
    gpaHeader: {
        marginBottom: 16,
    },
    gpaLabel: {
        fontFamily: theme.fonts.m,
        fontSize: 13,
        color: theme.colors.ink3,
        textTransform: 'uppercase',
        letterSpacing: 1.2,
        marginBottom: 4,
    },
    gpaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    gpaValue: {
        fontFamily: theme.fonts.d,
        fontSize: 32,
        color: theme.colors.ink,
        lineHeight: 38,
    },
    trendBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.border,
    },
    trendArrow: {
        fontFamily: theme.fonts.s,
        fontSize: 14,
    },
    // Range selector
    rangeRow: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 16,
    },
    rangeBtn: {
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
    },
    rangeBtnActive: {
        backgroundColor: theme.colors.ink,
    },
    rangeTxt: {
        fontFamily: theme.fonts.s,
        fontSize: 13,
        color: theme.colors.ink,
    },
    rangeTxtActive: {
        color: theme.colors.surface,
    },
    // Chart
    chartWrap: {
        alignItems: 'center',
        marginBottom: 16,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 10,
        overflow: 'hidden',
    },
    chart: {
        borderRadius: 8,
    },
    chartPlaceholder: {
        height: 100,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 10,
        borderStyle: 'dashed',
        marginBottom: 16,
    },
    placeholderText: {
        fontFamily: theme.fonts.m,
        fontSize: 13,
        color: theme.colors.ink3,
    },
    // Class trends
    classSection: {
        borderTopWidth: 2,
        borderTopColor: theme.colors.border,
        paddingTop: 16,
    },
    classSectionTitle: {
        fontFamily: theme.fonts.s,
        fontSize: 15,
        color: theme.colors.ink,
        marginBottom: 12,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    classRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
    },
    classInfo: {
        flex: 1,
        marginRight: 12,
    },
    className: {
        fontFamily: theme.fonts.m,
        fontSize: 14,
        color: theme.colors.ink,
        marginBottom: 2,
    },
    classGradeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    classGrade: {
        fontFamily: theme.fonts.s,
        fontSize: 16,
        color: theme.colors.ink,
    },
    classDelta: {
        fontFamily: theme.fonts.s,
        fontSize: 12,
    },
    sparkWrap: {
        width: 80,
        alignItems: 'flex-end',
    },
});
