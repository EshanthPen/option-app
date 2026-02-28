import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, FlatList, Alert } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ICAL from 'ical.js';
import { supabase } from '../supabaseClient';
import { colors, fonts, sizes } from '../theme';

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

    const blockTaskOnCalendar = async (task) => {
        try {
            let token = await AsyncStorage.getItem('googleAccessToken');
            if (!token && typeof window !== 'undefined') {
                token = window.localStorage.getItem('googleAccessToken');
            }

            if (!token) {
                if (typeof window !== 'undefined') window.alert('Please go to the Settings tab and sign in with Google first.');
                else Alert.alert('Not Signed In', 'Please go to the Settings tab and sign in with Google first.');
                return;
            }

            if (typeof window !== 'undefined') window.alert(`Blocking ${task.duration} minutes for "${task.title}"...`);
            else Alert.alert("Scheduling...", `Blocking ${task.duration} minutes for "${task.title}"...`);

            const startTime = new Date();
            const endTime = new Date(startTime.getTime() + task.duration * 60 * 1000);

            const event = {
                summary: `Option App: ${task.title} 📚`,
                description: 'Automatically scheduled task block by Option.',
                start: { dateTime: startTime.toISOString(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York' },
                end: { dateTime: endTime.toISOString(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York' },
            };

            const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(event),
            });

            if (res.ok) {
                if (typeof window !== 'undefined') window.alert(`Successfully scheduled "${task.title}" on your Google Calendar!`);
                else Alert.alert('Success!', `Successfully scheduled "${task.title}" on your Google Calendar!`);
            } else {
                const errorData = await res.json();
                console.error("Google Calendar Error:", errorData);
                if (errorData.error && errorData.error.code === 401) {
                    if (typeof window !== 'undefined') window.alert('Your Google session expired. Please re-authenticate in Settings.');
                    else Alert.alert('Session Expired', 'Your Google session expired. Please re-authenticate in Settings.');
                    AsyncStorage.removeItem('googleAccessToken');
                } else {
                    if (typeof window !== 'undefined') window.alert('Failed to insert the event.');
                    else Alert.alert('Calendar Error', 'Failed to insert the event.');
                }
            }
        } catch (error) {
            console.error(error);
            Alert.alert('Error', 'Network issue reaching Google.');
        }
    };

    // Helper to filter tasks by quadrant
    const getTasksForQuadrant = (minU, minI, maxU, maxI) => {
        return tasks.filter(t => t.urgency >= minU && t.urgency <= maxU && t.importance >= minI && t.importance <= maxI);
    };

    return (
        <View style={styles.container}>
            <View style={styles.pageHeader}>
                <Text style={styles.header}>Eisenhower Matrix</Text>
                <Text style={styles.subHeader}>Priority Task Management</Text>
            </View>

            <View style={styles.grid}>
                {/* Q1: Do First (Urgency: 6-10, Importance: 6-10) */}
                <View style={[styles.quadrant, styles.quadrantHigh]}>
                    <Text style={styles.quadrantTitle}>Do First</Text>
                    <Text style={[styles.quadrantDesc, { color: colors.red }]}>Urgent & Important</Text>
                    <FlatList
                        data={getTasksForQuadrant(6, 6, 10, 10)}
                        keyExtractor={item => item.id}
                        renderItem={({ item }) => (
                            <View style={styles.taskItemContainer}>
                                <Text style={styles.taskItem} numberOfLines={2}>• {item.title}</Text>
                                <TouchableOpacity style={styles.blockTimeBtn} onPress={() => blockTaskOnCalendar(item)}>
                                    <Text style={styles.blockTimeText}>📅 Block</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    />
                </View>

                {/* Q2: Schedule (Urgency: 1-5, Importance: 6-10) */}
                <View style={[styles.quadrant, styles.quadrantTest]}>
                    <Text style={styles.quadrantTitle}>Schedule</Text>
                    <Text style={[styles.quadrantDesc, { color: colors.blue }]}>Not Urgent, Important</Text>
                    <FlatList
                        data={getTasksForQuadrant(6, 1, 10, 5)}
                        keyExtractor={item => item.id}
                        renderItem={({ item }) => (
                            <View style={styles.taskItemContainer}>
                                <Text style={styles.taskItem} numberOfLines={2}>• {item.title}</Text>
                                <TouchableOpacity style={styles.blockTimeBtn} onPress={() => blockTaskOnCalendar(item)}>
                                    <Text style={styles.blockTimeText}>📅 Block</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    />
                </View>
            </View>

            <View style={styles.grid}>
                {/* Q3: Delegate (Urgency: 6-10, Importance: 1-5) */}
                <View style={[styles.quadrant, styles.quadrantMed]}>
                    <Text style={styles.quadrantTitle}>Delegate</Text>
                    <Text style={[styles.quadrantDesc, { color: colors.orange }]}>Urgent, Not Important</Text>
                    <FlatList
                        data={getTasksForQuadrant(1, 6, 5, 10)}
                        keyExtractor={item => item.id}
                        renderItem={({ item }) => (
                            <View style={styles.taskItemContainer}>
                                <Text style={styles.taskItem} numberOfLines={2}>• {item.title}</Text>
                                <TouchableOpacity style={styles.blockTimeBtn} onPress={() => blockTaskOnCalendar(item)}>
                                    <Text style={styles.blockTimeText}>📅 Block</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    />
                </View>

                {/* Q4: Eliminate (Urgency: 1-5, Importance: 1-5) */}
                <View style={[styles.quadrant, styles.quadrantLow]}>
                    <Text style={styles.quadrantTitle}>Eliminate</Text>
                    <Text style={[styles.quadrantDesc, { color: colors.green }]}>Not Urgent, Not Important</Text>
                    <FlatList
                        data={getTasksForQuadrant(1, 1, 5, 5)}
                        keyExtractor={item => item.id}
                        renderItem={({ item }) => (
                            <View style={styles.taskItemContainer}>
                                <Text style={styles.taskItem} numberOfLines={2}>• {item.title}</Text>
                                <TouchableOpacity style={styles.blockTimeBtn} onPress={() => blockTaskOnCalendar(item)}>
                                    <Text style={styles.blockTimeText}>📅 Block</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    />
                </View>
            </View>

            <View style={styles.buttonRow}>
                <TouchableOpacity style={styles.btnDark} onPress={() => setModalVisible(true)}>
                    <Text style={styles.btnDarkText}>+ Add Task manually</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.btnOut} onPress={importICSFromUrl}>
                    <Text style={styles.btnOutText}>📥 Import Schoology</Text>
                </TouchableOpacity>
            </View>

            {/* Add Task Modal */}
            <Modal visible={modalVisible} animationType="slide" transparent={true}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalView}>
                        <Text style={styles.modalTitle}>New Task</Text>

                        <TextInput style={styles.input} placeholder="Task Title" value={title} onChangeText={setTitle} />
                        <Text style={styles.modalLabel}>Urgency (1-10)</Text>
                        <TextInput style={styles.input} placeholder="5" keyboardType="numeric" value={urgency} onChangeText={setUrgency} />
                        <Text style={styles.modalLabel}>Importance (1-10)</Text>
                        <TextInput style={styles.input} placeholder="5" keyboardType="numeric" value={importance} onChangeText={setImportance} />
                        <Text style={styles.modalLabel}>Duration (minutes)</Text>
                        <TextInput style={styles.input} placeholder="60" keyboardType="numeric" value={duration} onChangeText={setDuration} />

                        <View style={styles.modalButtons}>
                            <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
                                <Text style={styles.cancelBtnText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.saveBtn} onPress={handleAddTask}>
                                <Text style={styles.saveBtnText}>Save Task</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 20, backgroundColor: colors.bg },
    pageHeader: { marginBottom: 20 },
    header: { fontFamily: fonts.displayBold, fontSize: 26, color: colors.ink, letterSpacing: -0.5 },
    subHeader: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', color: colors.ink3, marginTop: 4 },

    grid: { flex: 0.45, flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
    quadrant: { flex: 0.48, padding: 12, borderRadius: sizes.radius, borderLeftWidth: 3 },
    quadrantTitle: { fontFamily: fonts.sansSemiBold, fontSize: 14, color: colors.ink, marginBottom: 2 },
    quadrantDesc: { fontFamily: fonts.monoMedium, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },

    quadrantHigh: { backgroundColor: '#fdf0f0', borderLeftColor: colors.red },
    quadrantTest: { backgroundColor: '#eef2fb', borderLeftColor: colors.blue },
    quadrantMed: { backgroundColor: '#fdf4ee', borderLeftColor: colors.orange },
    quadrantLow: { backgroundColor: '#eef7f2', borderLeftColor: colors.green },

    taskItemContainer: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 },
    taskItem: { fontFamily: fonts.sans, fontSize: 12, color: colors.ink2, flex: 1, marginRight: 5, lineHeight: 16 },
    blockTimeBtn: { backgroundColor: colors.ink, paddingVertical: 4, paddingHorizontal: 6, borderRadius: 4 },
    blockTimeText: { fontFamily: fonts.sansMedium, color: colors.surface, fontSize: 9 },

    buttonRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },

    btnDark: { backgroundColor: colors.ink, paddingVertical: 12, paddingHorizontal: 15, borderRadius: sizes.radius, alignItems: 'center', flex: 0.48 },
    btnDarkText: { fontFamily: fonts.sansMedium, color: colors.surface, fontSize: 13 },

    btnOut: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border2, paddingVertical: 12, paddingHorizontal: 15, borderRadius: sizes.radius, alignItems: 'center', flex: 0.48 },
    btnOutText: { fontFamily: fonts.sansMedium, color: colors.ink2, fontSize: 13 },

    modalOverlay: { flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
    modalView: { margin: 20, backgroundColor: colors.surface, borderRadius: 10, padding: 25, borderWidth: 1, borderColor: colors.border },
    modalTitle: { fontFamily: fonts.displayBold, fontSize: 20, marginBottom: 15, letterSpacing: -0.3, color: colors.ink },

    input: { fontFamily: fonts.sans, borderWidth: 1, borderColor: colors.border, borderRadius: sizes.radius, padding: 10, marginBottom: 15, backgroundColor: colors.surface2, fontSize: 13 },
    modalLabel: { fontFamily: fonts.monoMedium, fontSize: 10, color: colors.ink3, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 5 },

    modalButtons: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
    cancelBtn: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border2, padding: 12, borderRadius: sizes.radius, flex: 0.48, alignItems: 'center' },
    cancelBtnText: { fontFamily: fonts.sansMedium, color: colors.ink2, fontSize: 13 },
    saveBtn: { backgroundColor: colors.ink, padding: 12, borderRadius: sizes.radius, flex: 0.48, alignItems: 'center' },
    saveBtnText: { fontFamily: fonts.sansMedium, color: colors.surface, fontSize: 13 }
});
