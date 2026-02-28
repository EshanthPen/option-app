import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions } from 'react-native';
import { LineChart, ProgressChart } from 'react-native-chart-kit';
import { colors, fonts, sizes } from '../theme';

const screenWidth = Dimensions.get('window').width;

export default function DashboardScreen() {
    const [timeLeft, setTimeLeft] = useState(25 * 60); // 25 mins in seconds
    const [isActive, setIsActive] = useState(false);
    const [mode, setMode] = useState('Work'); // 'Work' or 'Break'

    useEffect(() => {
        let interval = null;
        if (isActive && timeLeft > 0) {
            interval = setInterval(() => {
                setTimeLeft(timeLeft => timeLeft - 1);
            }, 1000);
        } else if (timeLeft === 0) {
            clearInterval(interval);
            // Switch modes automatically
            if (mode === 'Work') {
                setMode('Break');
                setTimeLeft(5 * 60); // 5 min break
            } else {
                setMode('Work');
                setTimeLeft(25 * 60);
            }
        }
        return () => clearInterval(interval);
    }, [isActive, timeLeft, mode]);

    const toggleTimer = () => setIsActive(!isActive);
    const resetTimer = () => {
        setIsActive(false);
        setTimeLeft(mode === 'Work' ? 25 * 60 : 5 * 60);
    };

    const formatTime = (seconds) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    // Dummy data for analytics
    const productivityData = {
        labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
        datasets: [{ data: [2, 3.5, 1, 4, 5, 2, 0] }] // Hours studied
    };

    const progressData = {
        labels: ["AP Comp Sci", "Honors English", "Calculus BC"], // optional
        data: [0.94, 0.88, 0.91]
    };

    return (
        <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
            <View style={styles.pageHeader}>
                <Text style={styles.header}>Welcome Back!</Text>
                <Text style={styles.subtitle}>Let's get some work done.</Text>
            </View>

            {/* --- POMODORO WIDGET --- */}
            <View style={styles.timerCard}>
                <View style={styles.timerHeaderRow}>
                    <Text style={styles.timerTitle}>Study Timer ({mode})</Text>
                    <TouchableOpacity onPress={() => {
                        setMode(mode === 'Work' ? 'Break' : 'Work');
                        setTimeLeft(mode === 'Work' ? 5 * 60 : 25 * 60);
                        setIsActive(false);
                    }}>
                        <Text style={styles.switchModeText}>Switch to {mode === 'Work' ? 'Break' : 'Work'}</Text>
                    </TouchableOpacity>
                </View>

                <Text style={styles.timeDisplay}>{formatTime(timeLeft)}</Text>

                <View style={styles.timerButtonRow}>
                    <TouchableOpacity style={[styles.timerBtn, { backgroundColor: isActive ? colors.orange : colors.ink }]} onPress={toggleTimer}>
                        <Text style={styles.timerBtnText}>{isActive ? 'Pause' : 'Start'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.timerBtnOut} onPress={resetTimer}>
                        <Text style={styles.timerBtnOutText}>Reset</Text>
                    </TouchableOpacity>
                </View>

                {isActive && mode === 'Work' && (
                    <Text style={styles.blockerAlert}>🚫 Screen Time Blocker Active!</Text>
                )}
            </View>

            {/* --- ANALYTICS WIDGETS --- */}
            <Text style={styles.sectionTitle}>Weekly Productivity (Hours)</Text>
            <LineChart
                data={productivityData}
                width={screenWidth - 40} // from react-native
                height={220}
                yAxisSuffix="h"
                chartConfig={{
                    backgroundColor: colors.surface,
                    backgroundGradientFrom: colors.surface,
                    backgroundGradientTo: colors.surface,
                    decimalPlaces: 1,
                    color: (opacity = 1) => `rgba(13, 12, 10, ${opacity})`, // colors.ink rgb
                    labelColor: (opacity = 1) => `rgba(13, 12, 10, ${opacity})`,
                    style: { borderRadius: sizes.radius },
                    propsForDots: { r: "5", strokeWidth: "2", stroke: colors.ink }
                }}
                bezier
                style={styles.chart}
            />

            <Text style={styles.sectionTitle}>Current Grade Readiness</Text>
            <ProgressChart
                data={progressData}
                width={screenWidth - 40}
                height={220}
                strokeWidth={16}
                radius={32}
                chartConfig={{
                    backgroundColor: colors.surface,
                    backgroundGradientFrom: colors.surface,
                    backgroundGradientTo: colors.surface,
                    color: (opacity = 1) => `rgba(13, 12, 10, ${opacity})`, // colors.ink rgb
                    labelColor: (opacity = 1) => `rgba(13, 12, 10, ${opacity})`,
                }}
                hideLegend={false}
                style={styles.chart}
            />

            <View style={{ height: 100 }} />
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 20, backgroundColor: colors.bg, paddingTop: 50 },
    pageHeader: { marginBottom: 25 },
    header: { fontFamily: fonts.displayBold, fontSize: 32, color: colors.ink, letterSpacing: -0.5 },
    subtitle: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', color: colors.ink3, marginTop: 4 },

    sectionTitle: { fontFamily: fonts.sansSemiBold, fontSize: 16, color: colors.ink2, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10, marginTop: 10 },

    timerCard: { backgroundColor: colors.surface, padding: 25, borderRadius: sizes.radius, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 4, marginBottom: 25, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
    timerHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginBottom: 15 },
    timerTitle: { fontFamily: fonts.sansSemiBold, fontSize: 16, color: colors.ink },
    switchModeText: { fontFamily: fonts.sansMedium, color: colors.blue, fontSize: 13 },
    timeDisplay: { fontFamily: fonts.displayBold, fontSize: 64, color: colors.ink, letterSpacing: -2 },

    timerButtonRow: { flexDirection: 'row', gap: 15, marginTop: 20 },
    timerBtn: { paddingVertical: 12, paddingHorizontal: 30, borderRadius: sizes.radius, minWidth: 100, alignItems: 'center' },
    timerBtnText: { fontFamily: fonts.sansMedium, color: colors.surface, fontSize: 14 },

    timerBtnOut: { paddingVertical: 12, paddingHorizontal: 30, borderRadius: sizes.radius, minWidth: 100, alignItems: 'center', backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border2 },
    timerBtnOutText: { fontFamily: fonts.sansMedium, color: colors.ink2, fontSize: 14 },

    blockerAlert: { fontFamily: fonts.sansMedium, marginTop: 15, color: colors.red, fontSize: 13 },

    chart: { marginVertical: 8, borderRadius: sizes.radius, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, elevation: 3, borderWidth: 1, borderColor: colors.border }
});
