import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, TextInput, Alert, ScrollView, Dimensions } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { colors, fonts, sizes } from '../theme';

const screenWidth = Dimensions.get('window').width;

export default function GradebookScreen() {
    // Classes state now starts empty and loads from real synced data
    const [classes, setClasses] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    useFocusEffect(
        useCallback(() => {
            const loadGrades = async () => {
                try {
                    const storedGrades = await AsyncStorage.getItem('studentVueGrades');
                    if (storedGrades) {
                        setClasses(JSON.parse(storedGrades));
                    } else {
                        setClasses([]);
                    }
                } catch (e) {
                    console.error("Failed to load grades from storage:", e);
                } finally {
                    setIsLoading(false);
                }
            };
            loadGrades();
        }, [])
    );

    const [selectedClass, setSelectedClass] = useState(null);
    const [viewMode, setViewMode] = useState('assignments'); // 'assignments', 'whatIf', 'target'

    // Hypothetical Calculator State (What If)
    const [newAssignmentScore, setNewAssignmentScore] = useState('');
    const [newAssignmentWeight, setNewAssignmentWeight] = useState('');
    const [hypotheticalResult, setHypotheticalResult] = useState(null);

    // Reverse Calculator State (Target)
    const [targetGrade, setTargetGrade] = useState('');
    const [targetWeight, setTargetWeight] = useState('');
    const [requiredScore, setRequiredScore] = useState(null);

    // --- LOGIC: What If ---
    const calculateHypothetical = () => {
        if (!selectedClass) return;
        const currentGrade = selectedClass.grade;
        const score = parseFloat(newAssignmentScore);
        const weight = parseFloat(newAssignmentWeight);

        if (isNaN(score) || isNaN(weight)) {
            Alert.alert('Invalid Input', 'Please enter valid numbers.'); return;
        }

        const currentPoints = currentGrade * 1;
        const newPoints = score * (weight / 100);
        const newTotalWeight = 1 + (weight / 100);
        const newGrade = (currentPoints + newPoints) / newTotalWeight;

        setHypotheticalResult(newGrade.toFixed(2));
    };

    // --- LOGIC: Target Score (Reverse Math) ---
    const calculateRequiredScore = () => {
        if (!selectedClass) return;
        const current = selectedClass.grade;
        const target = parseFloat(targetGrade);
        const weight = parseFloat(targetWeight) / 100;

        if (isNaN(target) || isNaN(weight) || weight <= 0) {
            Alert.alert('Invalid Input', 'Please enter valid target numbers.'); return;
        }

        const needed = (target * (1 + weight) - current) / weight;
        setRequiredScore(needed.toFixed(1));
    };

    // --- LOGIC: Overall GPA ---
    const calculateOverallGPA = () => {
        if (classes.length === 0) return "0.00";
        let totalPoints = 0;
        let totalCredits = 0;

        classes.forEach(c => {
            let pts = 0;
            if (c.grade >= 90) pts = 4.0;
            else if (c.grade >= 80) pts = 3.0;
            else if (c.grade >= 70) pts = 2.0;
            else if (c.grade >= 60) pts = 1.0;

            if (c.isAP && pts > 0) pts += 1.0;

            totalPoints += (pts * c.credits);
            totalCredits += c.credits;
        });

        return (totalPoints / totalCredits).toFixed(2);
    };

    // --- UI: Formatter for Charts ---
    const getChartData = () => {
        if (!selectedClass || selectedClass.assignments.length === 0) return null;

        let cumulativeGrade = selectedClass.assignments[0].score;
        let runningData = [cumulativeGrade];
        let labels = [selectedClass.assignments[0].title.substring(0, 5) + '...'];

        for (let i = 1; i < selectedClass.assignments.length; i++) {
            const asm = selectedClass.assignments[i];
            // Simulate a highly simplified cumulative grade change over time
            cumulativeGrade = ((cumulativeGrade * i) + asm.score) / (i + 1);
            runningData.push(cumulativeGrade);
            labels.push(asm.title.substring(0, 5) + '...');
        }

        if (hypotheticalResult && viewMode === 'whatIf') {
            runningData.push(parseFloat(hypotheticalResult));
            labels.push('NEW');
        }

        return {
            labels: labels,
            datasets: [{ data: runningData }]
        };
    };

    // --- UI: Render Items ---
    const getGradeColor = (grade) => {
        if (grade >= 90) return colors.green;
        if (grade >= 80) return colors.blue;
        if (grade >= 70) return colors.orange;
        return colors.red;
    };

    const renderClassItem = ({ item }) => (
        <TouchableOpacity
            style={[styles.classCard, selectedClass?.id === item.id && styles.selectedCard]}
            onPress={() => {
                setSelectedClass(item);
                setViewMode('assignments');
                setHypotheticalResult(null);
                setRequiredScore(null);
            }}
        >
            <View style={styles.classCardHeader}>
                <Text style={styles.className} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.classGrade}>{item.grade}%</Text>
            </View>
            <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { width: `${Math.min(item.grade, 100)}%`, backgroundColor: getGradeColor(item.grade) }]} />
            </View>
        </TouchableOpacity>
    );

    const renderAssignmentItem = ({ item }) => (
        <View style={styles.assignmentCard}>
            <View>
                <Text style={styles.assignmentTitle}>{item.title}</Text>
                <Text style={styles.assignmentWeight}>Weight: {item.weight}%</Text>
            </View>
            <Text style={styles.assignmentScore}>{item.score}%</Text>
        </View>
    );

    return (
        <View style={styles.container}>
            <View style={styles.headerRow}>
                <View>
                    <Text style={styles.header}>Gradebook</Text>
                    <Text style={styles.subHeader}>StudentVUE Sync</Text>
                </View>
                <View style={styles.gpaBadge}>
                    <Text style={styles.gpaText}>{calculateOverallGPA()} GPA</Text>
                </View>
            </View>

            <View style={styles.listContainer}>
                <Text style={styles.sectionTitle}>Your Classes</Text>
                {isLoading ? (
                    <Text style={styles.placeholderText}>Loading grades...</Text>
                ) : classes.length === 0 ? (
                    <Text style={styles.placeholderText}>No grades found. Go to the Settings tab and click "Sync Grades Now" to import from StudentVUE.</Text>
                ) : (
                    <FlatList
                        data={classes}
                        keyExtractor={item => item.id.toString()}
                        renderItem={renderClassItem}
                        horizontal={false}
                        showsVerticalScrollIndicator={false}
                    />
                )}
            </View>

            <View style={styles.detailsContainer}>
                {!selectedClass ? (
                    <Text style={styles.placeholderText}>Select a class above to view assignments or calculate hypotheticals.</Text>
                ) : (
                    <View style={{ flex: 1 }}>
                        <Text style={styles.selectedClassText}>{selectedClass.name} - {selectedClass.grade}%</Text>

                        {/* Tab Buttons */}
                        <View style={styles.tabRow}>
                            <TouchableOpacity style={[styles.tabBtn, viewMode === 'assignments' && styles.tabBtnActive]} onPress={() => setViewMode('assignments')}>
                                <Text style={[styles.tabText, viewMode === 'assignments' && styles.tabTextActive]}>Assignments</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.tabBtn, viewMode === 'whatIf' && styles.tabBtnActive]} onPress={() => setViewMode('whatIf')}>
                                <Text style={[styles.tabText, viewMode === 'whatIf' && styles.tabTextActive]}>What If?</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.tabBtn, viewMode === 'target' && styles.tabBtnActive]} onPress={() => setViewMode('target')}>
                                <Text style={[styles.tabText, viewMode === 'target' && styles.tabTextActive]}>Target</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Assignments View with Chart */}
                        {viewMode === 'assignments' && (
                            <ScrollView showsVerticalScrollIndicator={false} style={{ marginTop: 10 }}>
                                {getChartData() && (
                                    <View style={{ alignItems: 'center', marginBottom: 15, marginTop: 5 }}>
                                        <LineChart
                                            data={getChartData()}
                                            width={screenWidth - 70}
                                            height={180}
                                            yAxisSuffix="%"
                                            withDots={true}
                                            withInnerLines={false}
                                            chartConfig={{
                                                backgroundColor: "#fff",
                                                backgroundGradientFrom: "#fff",
                                                backgroundGradientTo: "#fff",
                                                decimalPlaces: 1,
                                                color: (opacity = 1) => `rgba(0, 122, 255, ${opacity})`,
                                                labelColor: (opacity = 1) => `rgba(100, 100, 100, ${opacity})`,
                                                style: { borderRadius: 16 }
                                            }}
                                            bezier
                                            style={{ borderRadius: 16 }}
                                        />
                                    </View>
                                )}
                                <Text style={styles.sectionTitle}>Assignments Log</Text>
                                <FlatList
                                    data={selectedClass.assignments}
                                    keyExtractor={item => item.id}
                                    renderItem={renderAssignmentItem}
                                    scrollEnabled={false}
                                />
                            </ScrollView>
                        )}

                        {/* What If Calculator View */}
                        {viewMode === 'whatIf' && (
                            <ScrollView showsVerticalScrollIndicator={false} style={{ marginTop: 10 }}>
                                <Text style={styles.label}>Grade on new assignment (0-100%):</Text>
                                <TextInput style={styles.input} placeholder="e.g. 95" keyboardType="numeric" value={newAssignmentScore} onChangeText={setNewAssignmentScore} />

                                <Text style={styles.label}>Weight of new assignment (%):</Text>
                                <TextInput style={styles.input} placeholder="e.g. 10" keyboardType="numeric" value={newAssignmentWeight} onChangeText={setNewAssignmentWeight} />

                                <TouchableOpacity style={styles.calcButton} onPress={calculateHypothetical}>
                                    <Text style={styles.calcButtonText}>Calculate</Text>
                                </TouchableOpacity>

                                {hypotheticalResult && (
                                    <View style={styles.resultBox}>
                                        <Text style={styles.resultLabel}>If you score {newAssignmentScore}%, your new grade is:</Text>
                                        <Text style={styles.resultValue}>{hypotheticalResult}%</Text>
                                    </View>
                                )}
                            </ScrollView>
                        )}

                        {/* Target Calculator View */}
                        {viewMode === 'target' && (
                            <ScrollView showsVerticalScrollIndicator={false} style={{ marginTop: 10 }}>
                                <Text style={styles.label}>What overall grade do you want? (%)</Text>
                                <TextInput style={styles.input} placeholder="e.g. 90" keyboardType="numeric" value={targetGrade} onChangeText={setTargetGrade} />

                                <Text style={styles.label}>How much is this next test worth? (%):</Text>
                                <TextInput style={styles.input} placeholder="e.g. 20" keyboardType="numeric" value={targetWeight} onChangeText={setTargetWeight} />

                                <TouchableOpacity style={styles.calcButton} onPress={calculateRequiredScore}>
                                    <Text style={styles.calcButtonText}>Find Needed Score</Text>
                                </TouchableOpacity>

                                {requiredScore && (
                                    <View style={styles.resultBox}>
                                        <Text style={styles.resultLabel}>To end up with a {targetGrade}%, you need at least:</Text>
                                        <Text style={[styles.resultValue, { color: parseFloat(requiredScore) > 100 ? '#FF3B30' : '#34C759' }]}>
                                            {requiredScore}%
                                        </Text>
                                        {parseFloat(requiredScore) > 100 && <Text style={{ color: '#FF3B30', fontSize: 12, marginTop: 5 }}>Warning: This requires extra credit!</Text>}
                                    </View>
                                )}
                            </ScrollView>
                        )}
                    </View>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 20, backgroundColor: colors.bg, paddingTop: 50 },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    header: { fontFamily: fonts.displayBold, fontSize: 26, color: colors.ink, letterSpacing: -0.5 },
    subHeader: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', color: colors.ink3, marginTop: 4 },
    gpaBadge: { backgroundColor: colors.ink, paddingHorizontal: 12, paddingVertical: 6, borderRadius: sizes.radius },
    gpaText: { color: colors.surface, fontFamily: fonts.monoMedium, fontSize: 12, letterSpacing: 1 },
    sectionTitle: { fontFamily: fonts.sansSemiBold, fontSize: 16, marginBottom: 10, color: colors.ink2, textTransform: 'uppercase', letterSpacing: 1 },

    listContainer: { flex: 0.35, marginBottom: 15 },
    classCard: { backgroundColor: colors.surface, padding: 15, borderRadius: sizes.radius, marginBottom: 10, borderWidth: 1, borderColor: colors.border },
    selectedCard: { borderColor: colors.ink2, backgroundColor: colors.surface2 },
    classCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    className: { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.ink, flex: 1, paddingRight: 10 },
    classGrade: { fontFamily: fonts.monoMedium, fontSize: 14, color: colors.ink },
    progressBarBg: { height: 4, backgroundColor: colors.border2, borderRadius: 2, overflow: 'hidden' },
    progressBarFill: { height: '100%', borderRadius: 2 },

    detailsContainer: { flex: 0.65, backgroundColor: colors.surface, padding: 15, borderRadius: sizes.radius, borderWidth: 1, borderColor: colors.border },
    placeholderText: { fontFamily: fonts.sans, color: colors.ink3, fontStyle: 'italic', textAlign: 'center', marginTop: 40, lineHeight: 20 },
    selectedClassText: { fontFamily: fonts.displayBold, fontSize: 18, marginBottom: 15, color: colors.ink, textAlign: 'center' },

    tabRow: { flexDirection: 'row', backgroundColor: colors.surface2, borderRadius: sizes.radius, padding: 4, marginBottom: 10 },
    tabBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 4 },
    tabBtnActive: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border2 },
    tabText: { fontFamily: fonts.sansMedium, fontSize: 12, color: colors.ink3 },
    tabTextActive: { color: colors.ink },

    assignmentCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
    assignmentTitle: { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.ink },
    assignmentWeight: { fontFamily: fonts.mono, fontSize: 10, color: colors.ink3, marginTop: 4 },
    assignmentScore: { fontFamily: fonts.monoMedium, fontSize: 14, color: colors.blue },

    label: { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.ink2, marginBottom: 5, marginTop: 10 },
    input: { fontFamily: fonts.sans, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: sizes.radius, padding: 12, fontSize: 14, color: colors.ink },
    calcButton: { backgroundColor: colors.ink, padding: 15, borderRadius: sizes.radius, alignItems: 'center', marginTop: 20 },
    calcButtonText: { fontFamily: fonts.sansMedium, color: colors.surface, fontSize: 14 },
    resultBox: { marginTop: 20, padding: 15, backgroundColor: colors.surface2, borderRadius: sizes.radius, alignItems: 'center', borderWidth: 1, borderColor: colors.border2 },
    resultLabel: { fontFamily: fonts.sans, fontSize: 13, color: colors.ink2, marginBottom: 5, textAlign: 'center' },
    resultValue: { fontFamily: fonts.displayBold, fontSize: 28, color: colors.ink }
});
