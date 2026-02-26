import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, TextInput, Alert, ScrollView, Dimensions } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';

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
            <Text style={styles.className}>{item.name}</Text>
            <Text style={[
                styles.classGrade,
                { color: item.grade >= 90 ? '#34C759' : item.grade >= 80 ? '#FF9500' : '#FF3B30' }
            ]}>
                {item.grade}%
            </Text>
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
                <Text style={styles.header}>Gradebook</Text>
                <View style={styles.gpaBadge}>
                    <Text style={styles.gpaText}>GPA: {calculateOverallGPA()}</Text>
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
    container: { flex: 1, padding: 20, backgroundColor: '#f9f9f9', paddingTop: 50 },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    header: { fontSize: 28, fontWeight: 'bold', color: '#333' },
    gpaBadge: { backgroundColor: '#333', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 15 },
    gpaText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
    sectionTitle: { fontSize: 18, fontWeight: '600', marginBottom: 10, color: '#444' },

    listContainer: { flex: 0.35, marginBottom: 15 },
    classCard: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#fff', padding: 15, borderRadius: 12, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, elevation: 2, borderWidth: 1, borderColor: 'transparent' },
    selectedCard: { borderColor: '#007AFF', backgroundColor: '#f0f8ff' },
    className: { fontSize: 16, fontWeight: '500', color: '#333' },
    classGrade: { fontSize: 16, fontWeight: 'bold' },

    detailsContainer: { flex: 0.65, backgroundColor: '#fff', padding: 15, borderRadius: 15, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 },
    placeholderText: { color: '#888', fontStyle: 'italic', textAlign: 'center', marginTop: 40 },
    selectedClassText: { fontSize: 20, fontWeight: 'bold', marginBottom: 15, color: '#333', textAlign: 'center' },

    tabRow: { flexDirection: 'row', backgroundColor: '#f0f0f0', borderRadius: 8, padding: 4, marginBottom: 10 },
    tabBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 6 },
    tabBtnActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 2, elevation: 1 },
    tabText: { fontSize: 14, color: '#666', fontWeight: '500' },
    tabTextActive: { color: '#007AFF', fontWeight: 'bold' },

    assignmentCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
    assignmentTitle: { fontSize: 15, fontWeight: '500', color: '#333' },
    assignmentWeight: { fontSize: 12, color: '#888', marginTop: 2 },
    assignmentScore: { fontSize: 16, fontWeight: '600', color: '#007AFF' },

    label: { fontSize: 14, color: '#555', marginBottom: 5, marginTop: 10 },
    input: { backgroundColor: '#f5f5f5', borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, fontSize: 16 },
    calcButton: { backgroundColor: '#007AFF', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 20 },
    calcButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
    resultBox: { marginTop: 20, padding: 15, backgroundColor: '#f0f8ff', borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#cce5ff' },
    resultLabel: { fontSize: 14, color: '#555', marginBottom: 5, textAlign: 'center' },
    resultValue: { fontSize: 32, fontWeight: 'bold', color: '#333' }
});
