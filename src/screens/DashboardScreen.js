import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions } from 'react-native';
import { LineChart, ProgressChart } from 'react-native-chart-kit';

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
            <Text style={styles.header}>Welcome Back!</Text>

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
                    <TouchableOpacity style={[styles.timerBtn, { backgroundColor: isActive ? '#FF9500' : '#34C759' }]} onPress={toggleTimer}>
                        <Text style={styles.timerBtnText}>{isActive ? 'Pause' : 'Start'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.timerBtn, { backgroundColor: '#FF3B30' }]} onPress={resetTimer}>
                        <Text style={styles.timerBtnText}>Reset</Text>
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
                    backgroundColor: "#007AFF",
                    backgroundGradientFrom: "#007AFF",
                    backgroundGradientTo: "#00c6ff",
                    decimalPlaces: 1, // optional, defaults to 2dp
                    color: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
                    labelColor: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
                    style: { borderRadius: 16 },
                    propsForDots: { r: "6", strokeWidth: "2", stroke: "#ffa726" }
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
                    backgroundColor: "#fff",
                    backgroundGradientFrom: "#fff",
                    backgroundGradientTo: "#fff",
                    color: (opacity = 1) => `rgba(52, 199, 89, ${opacity})`,
                    labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
                }}
                hideLegend={false}
                style={styles.chart}
            />

            <View style={{ height: 100 }} />
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 20, backgroundColor: '#f9f9f9', paddingTop: 50 },
    header: { fontSize: 32, fontWeight: 'bold', color: '#333', marginBottom: 20 },
    sectionTitle: { fontSize: 18, fontWeight: '600', color: '#444', marginBottom: 10, marginTop: 10 },

    timerCard: { backgroundColor: '#fff', padding: 20, borderRadius: 15, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, elevation: 4, marginBottom: 25, alignItems: 'center' },
    timerHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginBottom: 15 },
    timerTitle: { fontSize: 18, fontWeight: 'bold', color: '#333' },
    switchModeText: { color: '#007AFF', fontWeight: '600' },
    timeDisplay: { fontSize: 64, fontWeight: 'bold', color: '#222', letterSpacing: 2 },

    timerButtonRow: { flexDirection: 'row', gap: 15, marginTop: 20 },
    timerBtn: { paddingVertical: 12, paddingHorizontal: 30, borderRadius: 25 },
    timerBtnText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
    blockerAlert: { marginTop: 15, color: '#FF3B30', fontWeight: 'bold', fontSize: 14 },

    chart: { marginVertical: 8, borderRadius: 16, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 5, elevation: 3 }
});
