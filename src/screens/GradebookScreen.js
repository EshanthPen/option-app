import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, TextInput, Alert, ScrollView } from 'react-native';

export default function GradebookScreen() {
    const [classes, setClasses] = useState([
        { id: '1', name: 'AP Computer Science', grade: 94.5 },
        { id: '2', name: 'Honors English', grade: 88.2 },
        { id: '3', name: 'Calculus BC', grade: 91.0 }
    ]);

    const [selectedClass, setSelectedClass] = useState(null);

    // Hypothetical Calculator State
    const [currentWeight, setCurrentWeight] = useState('100');
    const [newAssignmentScore, setNewAssignmentScore] = useState('');
    const [newAssignmentWeight, setNewAssignmentWeight] = useState('');
    const [hypotheticalResult, setHypotheticalResult] = useState(null);

    const calculateHypothetical = () => {
        if (!selectedClass) return;

        const currentGrade = selectedClass.grade;
        const score = parseFloat(newAssignmentScore);
        const weight = parseFloat(newAssignmentWeight);

        if (isNaN(score) || isNaN(weight)) {
            Alert.alert('Invalid Input', 'Please enter valid numbers for score and weight.');
            return;
        }

        // Extremely simplified points/weight calculation for demonstration
        // Assuming current grade represents (currentWeight)% of the class
        // and the new assignment represents (weight)% of the new total.
        const currentPoints = currentGrade * 1;
        const newPoints = score * (weight / 100);
        const newTotalWeight = 1 + (weight / 100);

        const newGrade = (currentPoints + newPoints) / newTotalWeight;

        setHypotheticalResult(newGrade.toFixed(2));
    };

    const renderClassItem = ({ item }) => (
        <TouchableOpacity
            style={[styles.classCard, selectedClass?.id === item.id && styles.selectedCard]}
            onPress={() => {
                setSelectedClass(item);
                setHypotheticalResult(null);
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

    return (
        <View style={styles.container}>
            <Text style={styles.header}>Gradebook</Text>

            <View style={styles.listContainer}>
                <Text style={styles.sectionTitle}>Your Classes</Text>
                <FlatList
                    data={classes}
                    keyExtractor={item => item.id}
                    renderItem={renderClassItem}
                    horizontal={false}
                    showsVerticalScrollIndicator={false}
                />
            </View>

            <View style={styles.calculatorContainer}>
                <Text style={styles.sectionTitle}>"What If" Calculator</Text>

                {!selectedClass ? (
                    <Text style={styles.placeholderText}>Select a class above to calculate hypothetical grades.</Text>
                ) : (
                    <ScrollView ScrollView showsVerticalScrollIndicator={false}>
                        <Text style={styles.selectedClassText}>
                            Calculating for: <Text style={{ fontWeight: 'bold' }}>{selectedClass.name}</Text>
                        </Text>
                        <Text style={styles.currentGradeText}>
                            Current Grade: {selectedClass.grade}%
                        </Text>

                        <Text style={styles.label}>Grade on new assignment (0-100%):</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="e.g. 95"
                            keyboardType="numeric"
                            value={newAssignmentScore}
                            onChangeText={setNewAssignmentScore}
                        />

                        <Text style={styles.label}>Weight of new assignment (approx % of total grade):</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="e.g. 10"
                            keyboardType="numeric"
                            value={newAssignmentWeight}
                            onChangeText={setNewAssignmentWeight}
                        />

                        <TouchableOpacity style={styles.calcButton} onPress={calculateHypothetical}>
                            <Text style={styles.calcButtonText}>Calculate New Grade</Text>
                        </TouchableOpacity>

                        {hypotheticalResult && (
                            <View style={styles.resultBox}>
                                <Text style={styles.resultLabel}>If you score {newAssignmentScore}%, your new grade will be:</Text>
                                <Text style={[
                                    styles.resultValue,
                                    { color: parseFloat(hypotheticalResult) >= selectedClass.grade ? '#34C759' : '#FF3B30' }
                                ]}>
                                    {hypotheticalResult}%
                                </Text>
                            </View>
                        )}
                    </ScrollView>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 20, backgroundColor: '#f9f9f9' },
    header: { fontSize: 28, fontWeight: 'bold', marginBottom: 20, textAlign: 'center', color: '#333' },
    sectionTitle: { fontSize: 18, fontWeight: '600', marginBottom: 10, color: '#444' },

    listContainer: { flex: 0.4, marginBottom: 20 },
    classCard: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#fff', padding: 15, borderRadius: 12, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, elevation: 2, borderWidth: 1, borderColor: 'transparent' },
    selectedCard: { borderColor: '#007AFF', backgroundColor: '#f0f8ff' },
    className: { fontSize: 16, fontWeight: '500', color: '#333' },
    classGrade: { fontSize: 16, fontWeight: 'bold' },

    calculatorContainer: { flex: 0.6, backgroundColor: '#fff', padding: 20, borderRadius: 15, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 },
    placeholderText: { color: '#888', fontStyle: 'italic', textAlign: 'center', marginTop: 20 },
    selectedClassText: { fontSize: 16, marginBottom: 5, color: '#333' },
    currentGradeText: { fontSize: 16, marginBottom: 20, color: '#666' },
    label: { fontSize: 14, color: '#555', marginBottom: 5 },
    input: { backgroundColor: '#f5f5f5', borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 15, fontSize: 16 },

    calcButton: { backgroundColor: '#007AFF', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 10 },
    calcButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },

    resultBox: { marginTop: 20, padding: 15, backgroundColor: '#f0f8ff', borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#cce5ff' },
    resultLabel: { fontSize: 14, color: '#555', marginBottom: 5, textAlign: 'center' },
    resultValue: { fontSize: 32, fontWeight: 'bold' }
});
