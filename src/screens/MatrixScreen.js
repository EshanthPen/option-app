import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, FlatList, Alert } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import ICAL from 'ical.js';
import { supabase } from '../supabaseClient';

export default function MatrixScreen() {
    const [tasks, setTasks] = useState([]);
    const [modalVisible, setModalVisible] = useState(false);

    // Form state
    const [title, setTitle] = useState('');
    const [urgency, setUrgency] = useState('5');
    const [importance, setImportance] = useState('5');
    const [duration, setDuration] = useState('60');

    useEffect(() => {
        fetchTasks();
    }, []);

    const fetchTasks = async () => {
        const { data, error } = await supabase.from('tasks').select('*').order('created_at', { ascending: false });
        if (data) setTasks(data);
        if (error) console.error("Error fetching tasks:", error);
    };

    const handleAddTask = async () => {
        if (!title.trim()) return;

        const newTask = {
            title,
            urgency: parseInt(urgency) || 5,
            importance: parseInt(importance) || 5,
            duration: parseInt(duration) || 60,
            source: 'manual'
        };

        const { data, error } = await supabase.from('tasks').insert([newTask]).select();

        if (error) {
            Alert.alert("Error", "Could not save task to Supabase.");
            return;
        }

        if (data && data.length > 0) {
            setTasks([...tasks, data[0]]);
        }

        setModalVisible(false);
        setTitle('');
    };

    const importICSFromUrl = async () => {
        // In a real app we'd fetch the saved URL from Firebase/AsyncStorage.
        // For this prototype, we ask the user to paste it here to test.
        Alert.prompt('Import Schoology', 'Paste your Schoology webcal:// or https:// link here', async (url) => {
            if (!url) return;

            // Fix Apple webcal protocol to http for the fetch API
            let fetchUrl = url.trim();
            if (fetchUrl.startsWith('webcal://')) {
                fetchUrl = fetchUrl.replace('webcal://', 'https://');
            }

            try {
                const response = await fetch(fetchUrl);
                if (!response.ok) throw new Error('Network response was not ok');
                const icsData = await response.text();

                // Parse the ICS data
                const jcalData = ICAL.parse(icsData);
                const comp = new ICAL.Component(jcalData);
                const vevents = comp.getAllSubcomponents('vevent');

                const importedTasks = vevents.map((vevent, index) => {
                    const event = new ICAL.Event(vevent);
                    // Decide quadrant based on string matching (e.g. Test = high urgency/importance)
                    const titleLowerCase = event.summary.toLowerCase();
                    let urgencyVal = 5;
                    let importanceVal = 5;

                    if (titleLowerCase.includes('test') || titleLowerCase.includes('exam')) {
                        urgencyVal = 9; importanceVal = 10;
                    } else if (titleLowerCase.includes('project')) {
                        urgencyVal = 7; importanceVal = 9;
                    } else if (titleLowerCase.includes('hw') || titleLowerCase.includes('homework')) {
                        urgencyVal = 8; importanceVal = 4;
                    }

                    return {
                        id: `ics-${Date.now()}-${index}`,
                        title: event.summary,
                        urgency: urgencyVal,
                        importance: importanceVal,
                        duration: 60, // Default 1 hour
                        source: 'schoology_import'
                    };
                });

                if (importedTasks.length > 0) {
                    const { data, error } = await supabase.from('tasks').insert(importedTasks).select();
                    if (error) {
                        Alert.alert('Error', 'Failed to save imported tasks to Supabase.');
                        return;
                    }
                    if (data) {
                        setTasks([...tasks, ...data]);
                        Alert.alert('Success', `Imported ${data.length} Schoology assignments!`);
                    }
                } else {
                    Alert.alert('Empty', 'No events found in the Schoology calendar.');
                }
            } catch (error) {
                console.error("Error fetching Schoology URL:", error);
                Alert.alert('Error', 'Failed to fetch the Schoology calendar. Ensure the link is public and valid.');
            }
        });
    };

    // Helper to filter tasks by quadrant
    const getTasksForQuadrant = (minU, minI, maxU, maxI) => {
        return tasks.filter(t => t.urgency >= minU && t.urgency <= maxU && t.importance >= minI && t.importance <= maxI);
    };

    return (
        <View style={styles.container}>
            <Text style={styles.header}>Eisenhower Matrix</Text>

            <View style={styles.grid}>
                {/* Q1: Do First (Urgency: 6-10, Importance: 6-10) */}
                <View style={[styles.quadrant, { backgroundColor: '#ffecec' }]}>
                    <Text style={styles.quadrantTitle}>Do First</Text>
                    <Text style={styles.quadrantDesc}>Urgent & Important</Text>
                    <FlatList
                        data={getTasksForQuadrant(6, 6, 10, 10)}
                        keyExtractor={item => item.id}
                        renderItem={({ item }) => <Text style={styles.taskItem}>• {item.title}</Text>}
                    />
                </View>

                {/* Q2: Schedule (Urgency: 1-5, Importance: 6-10) */}
                <View style={[styles.quadrant, { backgroundColor: '#eef6fc' }]}>
                    <Text style={styles.quadrantTitle}>Schedule</Text>
                    <Text style={styles.quadrantDesc}>Not Urgent, Important</Text>
                    <FlatList
                        data={getTasksForQuadrant(6, 1, 10, 5)}
                        keyExtractor={item => item.id}
                        renderItem={({ item }) => <Text style={styles.taskItem}>• {item.title}</Text>}
                    />
                </View>
            </View>

            <View style={styles.grid}>
                {/* Q3: Delegate (Urgency: 6-10, Importance: 1-5) */}
                <View style={[styles.quadrant, { backgroundColor: '#fcf8ee' }]}>
                    <Text style={styles.quadrantTitle}>Delegate</Text>
                    <Text style={styles.quadrantDesc}>Urgent, Not Important</Text>
                    <FlatList
                        data={getTasksForQuadrant(1, 6, 5, 10)}
                        keyExtractor={item => item.id}
                        renderItem={({ item }) => <Text style={styles.taskItem}>• {item.title}</Text>}
                    />
                </View>

                {/* Q4: Eliminate (Urgency: 1-5, Importance: 1-5) */}
                <View style={[styles.quadrant, { backgroundColor: '#f2f2f2' }]}>
                    <Text style={styles.quadrantTitle}>Eliminate</Text>
                    <Text style={styles.quadrantDesc}>Not Urgent, Not Important</Text>
                    <FlatList
                        data={getTasksForQuadrant(1, 1, 5, 5)}
                        keyExtractor={item => item.id}
                        renderItem={({ item }) => <Text style={styles.taskItem}>• {item.title}</Text>}
                    />
                </View>
            </View>

            <View style={styles.buttonRow}>
                <TouchableOpacity style={styles.addButton} onPress={() => setModalVisible(true)}>
                    <Text style={styles.addButtonText}>+ Add Task manually</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[styles.addButton, { backgroundColor: '#34C759' }]} onPress={importICSFromUrl}>
                    <Text style={styles.addButtonText}>📥 Import Schoology</Text>
                </TouchableOpacity>
            </View>

            {/* Add Task Modal */}
            <Modal visible={modalVisible} animationType="slide" transparent={true}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalView}>
                        <Text style={styles.modalTitle}>New Task</Text>

                        <TextInput style={styles.input} placeholder="Task Title" value={title} onChangeText={setTitle} />
                        <Text>Urgency (1-10)</Text>
                        <TextInput style={styles.input} placeholder="5" keyboardType="numeric" value={urgency} onChangeText={setUrgency} />
                        <Text>Importance (1-10)</Text>
                        <TextInput style={styles.input} placeholder="5" keyboardType="numeric" value={importance} onChangeText={setImportance} />
                        <Text>Duration (minutes)</Text>
                        <TextInput style={styles.input} placeholder="60" keyboardType="numeric" value={duration} onChangeText={setDuration} />

                        <View style={styles.modalButtons}>
                            <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
                                <Text style={{ color: 'white' }}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.saveBtn} onPress={handleAddTask}>
                                <Text style={{ color: 'white' }}>Save Task</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 20, backgroundColor: '#fff' },
    header: { fontSize: 24, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
    grid: { flex: 0.4, flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
    quadrant: { flex: 0.48, padding: 10, borderRadius: 10, overflow: 'hidden' },
    quadrantTitle: { fontSize: 16, fontWeight: 'bold', color: '#333', textAlign: 'center' },
    quadrantDesc: { fontSize: 10, color: '#666', textAlign: 'center', marginBottom: 8 },
    taskItem: { fontSize: 12, color: '#444', marginBottom: 4 },
    buttonRow: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 10 },
    addButton: { backgroundColor: '#007AFF', padding: 15, borderRadius: 10, alignItems: 'center', flex: 0.45 },
    addButtonText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
    modalOverlay: { flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
    modalView: { margin: 20, backgroundColor: 'white', borderRadius: 20, padding: 35, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 4, elevation: 5 },
    modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 15, textAlign: 'center' },
    input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, marginBottom: 15 },
    modalButtons: { flexDirection: 'row', justifyContent: 'space-between' },
    cancelBtn: { backgroundColor: '#FF3B30', padding: 10, borderRadius: 8, flex: 0.45, alignItems: 'center' },
    saveBtn: { backgroundColor: '#34C759', padding: 10, borderRadius: 8, flex: 0.45, alignItems: 'center' }
});
