import React, { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, Modal, TextInput,
    ScrollView, Alert, Dimensions, Platform, ActivityIndicator
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ICAL from 'ical.js';
import { supabase } from '../supabaseClient';
import { theme as staticTheme } from '../utils/theme';
import { useTheme } from '../context/ThemeContext';
import { ChevronLeft, ChevronRight, Plus, Download, CalendarDays, Zap, Sparkles } from 'lucide-react-native';
import { fetchFreeBusy, createGoogleCalendarEvent } from '../utils/googleCalendarAPI';
import { performSmartScheduling } from '../utils/schedulerAssistant';
import { getUserId } from '../utils/auth';
import { TopBar, Card } from '../components/DesignKit';

const { width: SCREEN_W, height: SCREEN_H_RAW } = Dimensions.get('window');
const IS_WIDE = SCREEN_W > 800;
const SIDEBAR_W = 320;

// On web the sidebar is 220px wide; on mobile it's 72px.
// The screen content area is already offset by the sidebar via sceneStyle paddingLeft.
// So available width for the calendar is just the screen content area.
const HPAD = 32; // matches design content padding (28×32)
const GAP = 2;
// Use shorter height for cells to fit on standard screens
const CELL_W = (SCREEN_W - HPAD * 2 - GAP * 6) / 7;
const CELL_H = Math.min(CELL_W, 85);

const MN = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function MatrixScreen() {
    const { theme, isDarkMode } = useTheme();
    const styles = getStyles(theme);
    const [tasks, setTasks] = useState([]);
    const [view, setView] = useState('week'); // 'day' | 'week' | 'month' — design default is week
    const [modalVisible, setModalVisible] = useState(false);
    const [importModalVisible, setImportModalVisible] = useState(false);
    const [schoologyUrl, setSchoologyUrl] = useState('');
    const [saving, setSaving] = useState(false);
    const [pendingImports, setPendingImports] = useState([]);
    const [reviewModalVisible, setReviewModalVisible] = useState(false);
    const [month, setMonth] = useState(new Date().getMonth());
    const [year, setYear] = useState(new Date().getFullYear());
    const [selectedDate, setSelectedDate] = useState(new Date().toLocaleDateString('en-CA'));
    const [selectedTaskIds, setSelectedTaskIds] = useState([]);
    const [userId, setUserId] = useState(null);

    // Form state
    const [title, setTitle] = useState('');
    const [urgency, setUrgency] = useState('5');
    const [importance, setImportance] = useState('5');
    const [duration, setDuration] = useState('60');
    const [difficulty, setDifficulty] = useState('3');
    const [taskType, setTaskType] = useState('homework');

    // Pre-schedule review state
    const [scheduleReviewVisible, setScheduleReviewVisible] = useState(false);
    const [scheduleReviewTasks, setScheduleReviewTasks] = useState([]);
    const [scheduleWorkingHours, setScheduleWorkingHours] = useState(null);
    const [scheduleBusyPeriods, setScheduleBusyPeriods] = useState([]);

    // Mini calendar picker state inside the modal
    const [pickerOpen, setPickerOpen] = useState(false);
    const [pickerMonth, setPickerMonth] = useState(new Date().getMonth());
    const [pickerYear, setPickerYear] = useState(new Date().getFullYear());
    const [taskDate, setTaskDate] = useState(new Date().toLocaleDateString('en-CA')); // YYYY-MM-DD local

    useEffect(() => {
        const init = async () => {
            const id = await getUserId();
            setUserId(id);
            fetchTasks(id);
        };
        init();
    }, []);

    const fetchTasks = async (idToUse = userId) => {
        if (!idToUse) return;
        const { data, error } = await supabase.from('tasks').select('*').eq('user_id', idToUse).order('created_at', { ascending: false });

        // Local state augmentation for columns missing in Supabase schema
        let worktimes = [];
        let plannedIds = [];
        try {
            const wtStr = await AsyncStorage.getItem('@option_app_worktimes');
            const plStr = await AsyncStorage.getItem('@option_app_planned_assignments');
            if (wtStr) worktimes = JSON.parse(wtStr);
            if (plStr) plannedIds = JSON.parse(plStr);
        } catch (e) { console.error('Error loading local data', e); }

        if (data) {
            const augmentedData = data.map(t => ({
                ...t,
                type: 'assignment',
                is_planned: plannedIds.includes(t.id)
            }));
            setTasks([...worktimes, ...augmentedData]);
        }
    };

    const handleAddTask = async () => {
        if (!title.trim()) return;
        setSaving(true);
        const newTask = {
            title,
            urgency: parseInt(urgency) || 5,
            importance: parseInt(importance) || 5,
            duration: parseInt(duration) || 60,
            difficulty: parseInt(difficulty) || 3,
            task_type: taskType || 'homework',
            due_date: taskDate,
            source: 'manual',
            user_id: userId
        };
        try {
            const { data, error } = await supabase.from('tasks').insert([newTask]).select();
            if (error) throw error;
            if (data?.length > 0) setTasks(prev => [data[0], ...prev]);
            setModalVisible(false);
            setTitle(''); setDifficulty('3'); setTaskType('homework');
        } catch (error) {
            console.error('Supabase Error:', error);
            // Local fallback for demo purposes
            const mockData = { ...newTask, id: Date.now() };
            setTasks(prev => [mockData, ...prev]);
            setModalVisible(false);
            setTitle(''); setDifficulty('3'); setTaskType('homework');
        } finally {
            setSaving(false);
        }
    };

    const importICSFromUrl = async () => {
        if (!schoologyUrl) return;
        setSaving(true);
        let fetchUrl = schoologyUrl.trim().replace(/^webcal:\/\//, 'https://');
        const baseUrl = Platform.OS === 'web' ? window.location.origin : 'http://localhost:8081';
        const proxyUrl = `${baseUrl}/api/schoology?url=${encodeURIComponent(fetchUrl)}`;
        try {
            let icsData = '';
            try {
                const response = await fetch(proxyUrl);
                if (!response.ok) throw new Error('Proxy failed');
                icsData = await response.text();
            } catch (proxyErr) {
                const directResponse = await fetch(fetchUrl);
                if (!directResponse.ok) throw new Error('Direct fetch failed');
                icsData = await directResponse.text();
            }

            if (!icsData || !icsData.includes('BEGIN:VCALENDAR')) {
                throw new Error('No valid calendar data received. Ensure your link is a valid Schoology ICS URL.');
            }

            const comp = new ICAL.Component(ICAL.parse(icsData));
            const events = comp.getAllSubcomponents('vevent');

            const now = new Date();
            const imported = events.map((ve) => {
                const ev = new ICAL.Event(ve);
                const tl = (ev.summary || '').toLowerCase();
                const desc = (ev.description || '').toLowerCase();
                const dueDate = ev.startDate ? ev.startDate.toJSDate() : new Date();

                if (desc.includes('completed') || desc.includes('submitted') || dueDate < new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)) return null;

                const diffDays = (dueDate - now) / (1000 * 60 * 60 * 24);
                const u = diffDays <= 7 ? 9 : 5;

                let points = 0;
                const ptsMatch = desc.match(/(\d+)\s*pts/) || tl.match(/(\d+)\s*pts/);
                if (ptsMatch) points = parseInt(ptsMatch[1]);

                let im = points > 50 ? 10 : points > 20 ? 8 : 5;
                if (tl.includes('test') || tl.includes('exam') || tl.includes('quiz')) im = Math.max(im, 9);
                if (tl.includes('project') || tl.includes('essay')) im = Math.max(im, 8);

                return {
                    title: ev.summary || 'Untitled Assignment',
                    urgency: u,
                    importance: im,
                    duration: 60,
                    due_date: dueDate.toISOString().split('T')[0],
                    source: 'schoology_import',
                    user_id: userId
                };
            }).filter(t => t !== null);

            if (imported.length > 0) {
                setPendingImports(imported);
                setImportModalVisible(false);
                setReviewModalVisible(true);
                setSchoologyUrl('');
            } else {
                setImportModalVisible(false);
                setSchoologyUrl('');
                if (Platform.OS === 'web') window.alert('No assignments found to import.');
                else Alert.alert('Notice', 'No assignments found to import.');
            }
        } catch (err) {
            console.error(err);
            const errMsg = err.message || 'Failed to fetch calendar.';
            if (Platform.OS === 'web') window.alert(`Error: ${errMsg}`);
            else Alert.alert('Error', errMsg);
        } finally {
            setSaving(false);
        }
    };
    const updatePendingImport = (index, field, value) => {
        const newImports = [...pendingImports];
        newImports[index][field] = value;
        setPendingImports(newImports);
    };

    const saveReviewedImports = async () => {
        setSaving(true);
        try {
            const { data, error } = await supabase.from('tasks').insert(pendingImports).select();
            if (error) throw error;
            if (data) setTasks(prev => [...data, ...prev]);

            setReviewModalVisible(false);
            setPendingImports([]);
            if (Platform.OS === 'web') window.alert(`Success: Saved ${pendingImports.length} assignments!`);
            else Alert.alert('Success', `Saved ${pendingImports.length} assignments!`);
        } catch (err) {
            console.error('Save imports error:', err);
            const errMsg = err.message || 'Failed to save imported tasks.';
            if (Platform.OS === 'web') window.alert(`Error: ${errMsg}`);
            else Alert.alert('Error', errMsg);
        } finally {
            setSaving(false);
        }
    };

    const handleRemoveSelected = async () => {
        if (selectedTaskIds.length === 0) return;
        setSaving(true);
        try {
            const supabaseIds = selectedTaskIds.filter(id => !String(id).startsWith('wt_'));
            const localIds = selectedTaskIds.filter(id => String(id).startsWith('wt_'));

            if (supabaseIds.length > 0) {
                const { error } = await supabase.from('tasks').delete().in('id', supabaseIds);
                if (error) throw error;
            }
            if (localIds.length > 0) {
                const wtStr = await AsyncStorage.getItem('@option_app_worktimes');
                let existingWt = wtStr ? JSON.parse(wtStr) : [];
                existingWt = existingWt.filter(t => !localIds.includes(t.id));
                await AsyncStorage.setItem('@option_app_worktimes', JSON.stringify(existingWt));
            }

            setTasks(prev => prev.filter(t => !selectedTaskIds.includes(t.id)));
            setSelectedTaskIds([]);
        } catch (error) {
            console.error('Delete Error:', error);
            // Local fallback
            setTasks(prev => prev.filter(t => !selectedTaskIds.includes(t.id)));
            setSelectedTaskIds([]);
        } finally {
            setSaving(false);
        }
    };

    // Step 1: Clicking Auto-Schedule gathers data and opens the review modal
    const handleSmartSchedule = async () => {
        setSaving(true);
        try {
            // 1. Auth check
            const token = await AsyncStorage.getItem('googleAccessToken');
            if (!token) {
                if (Platform.OS === 'web') window.alert('Not Signed In: Go to Settings and sign in with Google to use Smart Scheduling.');
                else Alert.alert('Not Signed In', 'Go to Settings and sign in with Google to use Smart Scheduling.');
                setSaving(false);
                return;
            }

            // 2. Load Working Hours
            const savedHours = await AsyncStorage.getItem('smartScheduleHours');
            let workingHours;
            if (savedHours) {
                try { workingHours = JSON.parse(savedHours); } catch (e) { console.error("Error parsing smart hours", e); }
            }
            if (!workingHours) {
                const startStr = await AsyncStorage.getItem('workingStartHour');
                const endStr = await AsyncStorage.getItem('workingEndHour');
                const s = startStr ? parseInt(startStr) : 15;
                const e = endStr ? parseInt(endStr) : 22;
                workingHours = { 0: { start: s, end: e }, 1: { start: s, end: e }, 2: { start: s, end: e }, 3: { start: s, end: e }, 4: { start: s, end: e }, 5: { start: s, end: e }, 6: { start: s, end: e } };
            }

            // 3. Fetch busy periods
            const now = new Date();
            const twoWeeksOut = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
            const busyPeriods = await fetchFreeBusy(token, now, twoWeeksOut);

            // 4. Find unscheduled tasks to present for review (only today or future)
            const plannedStr = await AsyncStorage.getItem('@option_app_planned_assignments');
            const plannedIds = plannedStr ? JSON.parse(plannedStr) : [];
            const todayStr = new Date().toISOString().slice(0, 10);
            const unscheduled = tasks.filter(
                t => !plannedIds.includes(t.id) && !t.completed && (t.type === 'assignment' || !t.type) && !t.isFixedTime && !String(t.id).startsWith('wt_')
                     && (!t.due_date || t.due_date >= todayStr)
            );

            if (unscheduled.length === 0) {
                if (Platform.OS === 'web') window.alert('No tasks need scheduling! Everything is already planned or completed.');
                else Alert.alert('All Caught Up', 'No tasks need scheduling! Everything is already planned or completed.');
                setSaving(false);
                return;
            }

            // Prepare review list with editable totalTime and sessionLength
            const reviewTasks = unscheduled.map(t => ({
                ...t,
                totalTime: String(t.duration || 60),
                sessionLength: String(Math.min(t.duration || 60, 50)),
            }));

            setScheduleWorkingHours(workingHours);
            setScheduleBusyPeriods(busyPeriods);
            setScheduleReviewTasks(reviewTasks);
            setScheduleReviewVisible(true);
        } catch (error) {
            console.error("Smart Schedule Error:", error);
            if (Platform.OS === 'web') window.alert("Failed to prepare scheduling. Check console.");
            else Alert.alert("Error", "Failed to prepare scheduling.");
        } finally {
            setSaving(false);
        }
    };

    const updateScheduleReviewTask = (index, field, value) => {
        const updated = [...scheduleReviewTasks];
        updated[index] = { ...updated[index], [field]: value };
        setScheduleReviewTasks(updated);
    };

    // Step 2: After user sets times and confirms, actually run the scheduler
    const confirmSmartSchedule = async () => {
        setSaving(true);
        try {
            const token = await AsyncStorage.getItem('googleAccessToken');
            if (!token) {
                if (Platform.OS === 'web') window.alert("Session expired. Please sign in again.");
                else Alert.alert("Error", "Session expired. Please sign in again.");
                setSaving(false);
                return;
            }

            // Apply user-specified totalTime and sessionLength to each task
            const tasksForScheduler = scheduleReviewTasks.map(t => ({
                ...t,
                duration: parseInt(t.totalTime) || 60,
                sessionLength: parseInt(t.sessionLength) || 50,
                is_planned: false, // ensure they get picked up
            }));

            // Run the scheduling algorithm
            const optimizedTasks = performSmartScheduling(
                tasksForScheduler, scheduleBusyPeriods, scheduleWorkingHours
            );

            if (optimizedTasks.length === 0) {
                if (Platform.OS === 'web') window.alert('Could not place any blocks. Try adjusting session lengths or due dates.');
                else Alert.alert('No Slots', 'Could not place any blocks. Try adjusting session lengths or due dates.');
                setSaving(false);
                return;
            }

            let successCount = 0;
            const originalIdsToUpdate = [];
            const newWorktimes = [];

            for (const worktimeTask of optimizedTasks) {
                const event = {
                    summary: `${worktimeTask.title} \u{1F916}`,
                    description: `Priority: ${worktimeTask.urgency}U/${worktimeTask.importance}I\n\nAutomatically scheduled by Option Smart AI.`,
                    start: { dateTime: worktimeTask.scheduled_start, timeZone: 'America/New_York' },
                    end: { dateTime: worktimeTask.scheduled_end, timeZone: 'America/New_York' }
                };

                const calSuccess = await createGoogleCalendarEvent(token, event);

                if (calSuccess) {
                    worktimeTask.id = 'wt_' + Date.now() + Math.random().toString(36).substr(2, 9);
                    newWorktimes.push(worktimeTask);
                    successCount++;

                    if (worktimeTask.parent_task_id && !originalIdsToUpdate.includes(worktimeTask.parent_task_id)) {
                        originalIdsToUpdate.push(worktimeTask.parent_task_id);
                    }
                } else {
                    if (Platform.OS === 'web') window.alert("Failed to sync to Google Calendar. Your session may have expired.");
                    else Alert.alert("Sync Error", "Failed to sync to Google Calendar. Your session may have expired.");
                    setSaving(false);
                    return;
                }
            }

            if (newWorktimes.length > 0) {
                try {
                    const wtStr = await AsyncStorage.getItem('@option_app_worktimes');
                    const existingWt = wtStr ? JSON.parse(wtStr) : [];
                    await AsyncStorage.setItem('@option_app_worktimes', JSON.stringify([...existingWt, ...newWorktimes]));
                } catch (e) { console.error('Local save error', e); }
            }

            if (originalIdsToUpdate.length > 0) {
                try {
                    const plStr = await AsyncStorage.getItem('@option_app_planned_assignments');
                    const existingPl = plStr ? JSON.parse(plStr) : [];
                    await AsyncStorage.setItem('@option_app_planned_assignments', JSON.stringify([...new Set([...existingPl, ...originalIdsToUpdate])]));
                } catch (e) { console.error('Local save error', e); }
            }

            await fetchTasks();
            setScheduleReviewVisible(false);
            setScheduleReviewTasks([]);

            if (Platform.OS === 'web') window.alert(`Smart Scheduling Complete: AI placed ${successCount} blocks on your calendar!`);
            else Alert.alert('Smart Scheduling Complete', `AI placed ${successCount} blocks on your calendar!`);

        } catch (error) {
            console.error("Smart Schedule Error:", error);
            if (Platform.OS === 'web') window.alert("Failed to auto-schedule tasks. Check console.");
            else Alert.alert("Error", "Failed to auto-schedule tasks.");
        } finally {
            setSaving(false);
        }
    };

    const handleAutoPrioritize = () => {
        const confirmMsg = 'Auto-sort will recalculate urgency based on due dates and boost importance for exams/projects. Continue?';
        const runAutoPrioritize = async () => {
            setSaving(true);
            try {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const updates = [];

                for (const task of tasks) {
                    if (task.type === 'worktime' || String(task.id).startsWith('wt_')) continue;
                    let newUrgency = task.urgency;
                    let newImportance = task.importance;
                    let changed = false;

                    // Recalculate urgency based on due_date
                    if (task.due_date) {
                        const due = new Date(task.due_date + 'T23:59:59');
                        const diffMs = due - today;
                        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

                        if (diffDays <= 0) newUrgency = 10;
                        else if (diffDays === 1) newUrgency = 9;
                        else if (diffDays <= 3) newUrgency = 8;
                        else if (diffDays <= 7) newUrgency = 6;
                        else if (diffDays <= 14) newUrgency = 4;
                        else newUrgency = 2;

                        if (newUrgency !== task.urgency) changed = true;
                    }

                    // Boost importance based on task_type
                    const tt = (task.task_type || '').toLowerCase();
                    if (tt === 'exam' || tt === 'test' || tt === 'exam study') {
                        if (newImportance < 9) { newImportance = 9; changed = true; }
                    } else if (tt === 'project' || tt === 'essay') {
                        if (newImportance < 8) { newImportance = 8; changed = true; }
                    }

                    if (changed) {
                        updates.push({ id: task.id, urgency: newUrgency, importance: newImportance });
                    }
                }

                if (updates.length === 0) {
                    if (Platform.OS === 'web') window.alert('All tasks are already optimally prioritized.');
                    else Alert.alert('Up to Date', 'All tasks are already optimally prioritized.');
                    setSaving(false);
                    return;
                }

                // Update each modified task in Supabase
                for (const u of updates) {
                    await supabase.from('tasks').update({ urgency: u.urgency, importance: u.importance }).eq('id', u.id);
                }

                // Reload tasks
                await fetchTasks();

                if (Platform.OS === 'web') window.alert(`Auto-sorted ${updates.length} tasks based on due dates and types.`);
                else Alert.alert('Auto-Sort Complete', `Updated priorities for ${updates.length} tasks.`);
            } catch (err) {
                console.error('Auto-prioritize error:', err);
                if (Platform.OS === 'web') window.alert('Failed to auto-sort tasks.');
                else Alert.alert('Error', 'Failed to auto-sort tasks.');
            } finally {
                setSaving(false);
            }
        };

        if (Platform.OS === 'web') {
            if (window.confirm(confirmMsg)) runAutoPrioritize();
        } else {
            Alert.alert('Auto-Sort Tasks', confirmMsg, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Auto-Sort', onPress: runAutoPrioritize },
            ]);
        }
    };

    const toggleTaskSelection = (id) => {
        setSelectedTaskIds(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    // Calendar grid
    const dim = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    const cells = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let i = 1; i <= dim; i++) cells.push(i);
    // Pad to complete last row (always fill 7 columns)
    while (cells.length % 7 !== 0) cells.push(null);

    const getPrio = (u, i) => {
        if (u > 5 && i > 5) return { bg: theme.colors.red + '20', text: theme.colors.red };
        if (u <= 5 && i > 5) return { bg: theme.colors.orange + '20', text: theme.colors.orange };
        if (u > 5 && i <= 5) return { bg: theme.colors.green + '20', text: theme.colors.green };
        return { bg: theme.colors.blue + '20', text: theme.colors.blue };
    };

    const blockTask = async (task) => {
        try {
            const token = await AsyncStorage.getItem('googleAccessToken');
            if (!token) { Alert.alert('Not Signed In', 'Go to Settings and sign in with Google.'); return; }
            const start = (task.due_date || task.date) ? new Date((task.due_date || task.date) + 'T12:00:00') : new Date();
            const end = new Date(start.getTime() + task.duration * 60 * 1000);
            const event = { summary: `Option: ${task.title} 📚`, start: { dateTime: start.toISOString(), timeZone: 'America/New_York' }, end: { dateTime: end.toISOString(), timeZone: 'America/New_York' } };
            const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(event) });
            if (res.ok) Alert.alert('Scheduled!', `"${task.title}" added to Google Calendar.`);
            else Alert.alert('Error', 'Failed to insert event.');
        } catch { Alert.alert('Error', 'Network error.'); }
    };

    // Mini calendar date picker helpers
    const pickerDim = new Date(pickerYear, pickerMonth + 1, 0).getDate();
    const pickerFirst = new Date(pickerYear, pickerMonth, 1).getDay();
    const pickerCells = [];
    for (let i = 0; i < pickerFirst; i++) pickerCells.push(null);
    for (let i = 1; i <= pickerDim; i++) pickerCells.push(i);
    while (pickerCells.length % 7 !== 0) pickerCells.push(null);

    const selectDate = (d) => {
        if (!d) return;
        const dateStr = `${pickerYear}-${String(pickerMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        setTaskDate(dateStr);
        setPickerOpen(false);
    };

    const taskDateDisplay = taskDate
        ? new Date(taskDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : 'Select a date';

    const selectedDayTasks = tasks.filter(t => {
        if (t.type === 'worktime') return t.date?.startsWith(selectedDate);
        return t.due_date?.startsWith(selectedDate) || t.date?.startsWith(selectedDate);
    });

    // Subtitle reflects current view + week/day context
    const sel = new Date(selectedDate + 'T12:00:00');
    const weekStart = new Date(sel); weekStart.setDate(sel.getDate() - sel.getDay());
    const subtitleStr = view === 'week'
        ? `${MN[weekStart.getMonth()]} ${weekStart.getFullYear()} · Week of the ${weekStart.getDate()}${weekStart.getDate() === 1 ? 'st' : weekStart.getDate() === 2 ? 'nd' : weekStart.getDate() === 3 ? 'rd' : 'th'}`
        : view === 'day'
        ? sel.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
        : `${MN[month]} ${year} · ${tasks.length} tasks`;

    return (
        <View style={styles.container}>
            <TopBar
                title="Calendar"
                subtitle={subtitleStr}
                actions={
                    <>
                        {/* Day/Week/Month toggle */}
                        <View style={{
                            flexDirection: 'row', gap: 3,
                            backgroundColor: theme.colors.surface2,
                            padding: 3, borderRadius: 8,
                        }}>
                            {['day', 'week', 'month'].map((v) => {
                                const active = view === v;
                                return (
                                    <TouchableOpacity
                                        key={v}
                                        onPress={() => setView(v)}
                                        activeOpacity={0.85}
                                        style={{
                                            paddingHorizontal: 12, paddingVertical: 6,
                                            borderRadius: 6,
                                            backgroundColor: active ? theme.colors.surface : 'transparent',
                                            ...(active ? theme.shadows.sm : {}),
                                        }}
                                    >
                                        <Text style={{
                                            fontFamily: theme.fonts.s, fontSize: 12, fontWeight: active ? '600' : '500',
                                            color: active ? theme.colors.ink : theme.colors.ink3,
                                            textTransform: 'capitalize',
                                        }}>
                                            {v}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                        <TouchableOpacity
                            onPress={handleSmartSchedule}
                            disabled={saving}
                            style={{
                                width: 36, height: 36, borderRadius: 10,
                                backgroundColor: theme.colors.surface,
                                borderWidth: 1, borderColor: theme.colors.border,
                                alignItems: 'center', justifyContent: 'center',
                            }}
                            title="Auto-schedule with AI"
                        >
                            {saving ? <ActivityIndicator size="small" color={theme.colors.purple} /> : <Zap color={theme.colors.purple} size={16} />}
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => setImportModalVisible(true)}
                            style={{
                                width: 36, height: 36, borderRadius: 10,
                                backgroundColor: theme.colors.surface,
                                borderWidth: 1, borderColor: theme.colors.border,
                                alignItems: 'center', justifyContent: 'center',
                            }}
                            title="Import from Schoology"
                        >
                            <Download color={theme.colors.ink2} size={16} />
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => setModalVisible(true)}
                            style={{
                                flexDirection: 'row', alignItems: 'center', gap: 6,
                                paddingHorizontal: 14, paddingVertical: 9,
                                backgroundColor: theme.colors.ink,
                                borderRadius: 10,
                            }}
                        >
                            <Plus color={theme.colors.bg} size={14} strokeWidth={2.5} />
                            <Text style={{ fontFamily: theme.fonts.s, fontSize: 13, fontWeight: '600', color: theme.colors.bg }}>
                                Add event
                            </Text>
                        </TouchableOpacity>
                    </>
                }
            />

            <View style={[styles.mainLayout, IS_WIDE && styles.layoutWide]}>
                {/* Left: Calendar Grid */}
                <View style={IS_WIDE ? { flex: 1.5 } : { width: '100%' }}>
                    {/* (Old header removed — now in TopBar above) */}

                    {/* WEEK VIEW (matches design) */}
                    {view === 'week' && (
                        <WeekViewContent
                            theme={theme}
                            tasks={tasks}
                            selectedDate={selectedDate}
                            setSelectedDate={setSelectedDate}
                            getPrio={getPrio}
                            month={month}
                            setMonth={setMonth}
                            year={year}
                            setYear={setYear}
                        />
                    )}

                    {/* DAY VIEW (single day timeline) */}
                    {view === 'day' && (
                        <DayViewContent
                            theme={theme}
                            tasks={tasks}
                            selectedDate={selectedDate}
                            setSelectedDate={setSelectedDate}
                            getPrio={getPrio}
                        />
                    )}

                    {/* MONTH VIEW: Legend + nav + grid (existing) */}
                    {view === 'month' && (
                        <>
                            <View style={styles.legend}>
                                <Text style={styles.legendTitle}>KEY</Text>
                                {[{ l: 'Do First', c: theme.colors.red }, { l: 'Schedule', c: theme.colors.orange }, { l: 'Delegate', c: theme.colors.green }, { l: 'Eliminate', c: theme.colors.blue }].map((item, i) => (
                                    <View key={i} style={styles.legendItem}>
                                        <View style={[styles.swatch, { backgroundColor: item.c + '20', borderColor: item.c }]} />
                                        <Text style={styles.legendText}>{item.l}</Text>
                                    </View>
                                ))}
                            </View>

                            <View style={styles.controlsRow}>
                                <TouchableOpacity onPress={() => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); }} style={styles.ctrlBtn}>
                                    <ChevronLeft color={theme.colors.ink2} size={16} />
                                </TouchableOpacity>
                                <Text style={styles.monthText}>{MN[month]} {year}</Text>
                                <TouchableOpacity onPress={() => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); }} style={styles.ctrlBtn}>
                                    <ChevronRight color={theme.colors.ink2} size={16} />
                                </TouchableOpacity>
                            </View>

                            <View style={styles.daysRow}>
                                {DAYS.map(d => (
                                    <Text
                                        key={d}
                                        style={[
                                            styles.dayText,
                                            { width: '14.28%' }
                                        ]}
                                    >
                                        {d}
                                    </Text>
                                ))}
                            </View>
                        </>
                    )}

                    {/* MONTH grid */}
                    {view === 'month' && (
                    <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                        <View style={styles.grid}>
                            {cells.map((d, i) => {
                                const dateStr = d ? `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null;
                                const dayTasks = d ? tasks.filter(t => {
                                    if (t.type === 'worktime') return t.date?.startsWith(dateStr);
                                    return t.due_date?.startsWith(dateStr) || t.date?.startsWith(dateStr);
                                }) : [];
                                const isToday = d && d === new Date().getDate() && month === new Date().getMonth() && year === new Date().getFullYear();

                                return (
                                    <TouchableOpacity
                                        key={i}
                                        style={[
                                            styles.cell,
                                            { width: '13.8%', height: CELL_H + 30 },
                                            !d && styles.cellEmpty,
                                            isToday && styles.cellToday,
                                            selectedDate === dateStr && styles.cellSelected,
                                        ]}
                                        onPress={() => d && setSelectedDate(dateStr)}
                                    >
                                        {d && <Text style={[styles.cellNum, isToday && styles.numToday]}>{d}</Text>}
                                        {dayTasks.slice(0, 3).map((t, idx) => {
                                            const c = getPrio(t.urgency, t.importance);
                                            const isHigh = (t.urgency + t.importance) >= 15;
                                            const isMed = (t.urgency + t.importance) >= 10 && !isHigh;
                                            return (
                                                <View
                                                    key={idx}
                                                    style={[
                                                        styles.event,
                                                        { backgroundColor: c.bg },
                                                        isHigh && { paddingVertical: 6, marginVertical: 2 },
                                                        isMed && { paddingVertical: 4 }
                                                    ]}
                                                >
                                                    <Text style={[
                                                        styles.eventText,
                                                        { color: c.text },
                                                        isHigh && { fontSize: 11, fontWeight: '700' },
                                                        isMed && { fontWeight: '700' }
                                                    ]} numberOfLines={1}>
                                                        {t.type === 'worktime' ? '🎯 ' : ''}{t.title}
                                                    </Text>
                                                </View>
                                            );
                                        })}
                                        {dayTasks.length > 3 && <Text style={styles.moreText}>+{dayTasks.length - 3} more</Text>}
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                        <View style={{ height: 80 }} />
                    </ScrollView>
                    )}
                </View>

                {/* Right Sidebar (matches design): Mini month + Upcoming + Categories */}
                {IS_WIDE && (
                    <CalendarSidebar
                        theme={theme}
                        tasks={tasks}
                        month={month} setMonth={setMonth}
                        year={year} setYear={setYear}
                        selectedDate={selectedDate} setSelectedDate={setSelectedDate}
                        getPrio={getPrio}
                        MN={MN}
                        blockTask={blockTask}
                    />
                )}
            </View>

            {/* Add Event Modal */}
            <Modal visible={modalVisible} animationType="fade" transparent>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalView}>
                        <Text style={styles.modalTitle}>Add Event</Text>

                        <Text style={styles.label}>Name</Text>
                        <TextInput style={styles.input} placeholder="e.g. Physics Test" value={title} onChangeText={setTitle} placeholderTextColor={theme.colors.ink3} />

                        <View style={{ flexDirection: 'row', gap: 10 }}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.label}>Urgency (1–10)</Text>
                                <TextInput style={styles.input} keyboardType="numeric" value={urgency} onChangeText={setUrgency} placeholderTextColor={theme.colors.ink3} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.label}>Importance (1–10)</Text>
                                <TextInput style={styles.input} keyboardType="numeric" value={importance} onChangeText={setImportance} placeholderTextColor={theme.colors.ink3} />
                            </View>
                        </View>

                        <View style={{ flexDirection: 'row', gap: 10 }}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.label}>Difficulty (1–5)</Text>
                                <TextInput style={styles.input} keyboardType="numeric" value={difficulty} onChangeText={setDifficulty} placeholderTextColor={theme.colors.ink3} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.label}>Duration (min)</Text>
                                <TextInput style={styles.input} keyboardType="numeric" value={duration} onChangeText={setDuration} placeholderTextColor={theme.colors.ink3} />
                            </View>
                        </View>

                        <Text style={styles.label}>Type</Text>
                        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                            {['homework', 'exam study', 'project', 'meeting', 'habit'].map(t => (
                                <TouchableOpacity
                                    key={t}
                                    style={[styles.ctrlBtn, taskType === t && { backgroundColor: theme.colors.ink, borderColor: theme.colors.ink }]}
                                    onPress={() => setTaskType(t)}
                                >
                                    <Text style={{ fontFamily: theme.fonts.s, fontSize: 11, color: taskType === t ? '#fff' : theme.colors.ink2, textTransform: 'capitalize' }}>{t}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        {/* Mini calendar date picker */}
                        <Text style={styles.label}>Date</Text>
                        <TouchableOpacity
                            style={[styles.input, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}
                            onPress={() => setPickerOpen(p => !p)}
                        >
                            <Text style={{ fontFamily: theme.fonts.m, fontSize: 13, color: taskDate ? theme.colors.ink : theme.colors.ink3 }}>
                                {taskDateDisplay}
                            </Text>
                            <ChevronRight size={14} color={theme.colors.ink3} style={{ transform: [{ rotate: pickerOpen ? '-90deg' : '90deg' }] }} />
                        </TouchableOpacity>

                        {pickerOpen && (
                            <View style={styles.miniCalWrap}>
                                {/* Picker nav */}
                                <View style={styles.miniCalNav}>
                                    <TouchableOpacity onPress={() => { if (pickerMonth === 0) { setPickerMonth(11); setPickerYear(y => y - 1); } else setPickerMonth(m => m - 1); }}>
                                        <ChevronLeft size={14} color={theme.colors.ink2} />
                                    </TouchableOpacity>
                                    <Text style={styles.miniCalMonth}>{MN[pickerMonth].slice(0, 3)} {pickerYear}</Text>
                                    <TouchableOpacity onPress={() => { if (pickerMonth === 11) { setPickerMonth(0); setPickerYear(y => y + 1); } else setPickerMonth(m => m + 1); }}>
                                        <ChevronRight size={14} color={theme.colors.ink2} />
                                    </TouchableOpacity>
                                </View>
                                {/* Day headers */}
                                <View style={styles.miniDaysRow}>
                                    {DAYS.map(d => <Text key={d} style={styles.miniDayText}>{d[0]}</Text>)}
                                </View>
                                {/* Cells */}
                                <View style={styles.miniGrid}>
                                    {pickerCells.map((d, i) => {
                                        const iso = d ? `${pickerYear}-${String(pickerMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null;
                                        const isSelected = iso === taskDate;
                                        return (
                                            <TouchableOpacity
                                                key={i}
                                                onPress={() => selectDate(d)}
                                                style={[styles.miniCell, isSelected && styles.miniCellSelected, !d && { opacity: 0 }]}
                                                disabled={!d}
                                            >
                                                <Text style={[styles.miniCellNum, isSelected && styles.miniCellNumSelected]}>{d ?? ''}</Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            </View>
                        )}

                        <View style={[styles.btnRow, { marginTop: 16 }]}>
                            <TouchableOpacity disabled={saving} style={[styles.btnOut, { flex: 1, justifyContent: 'center', paddingVertical: 12 }]} onPress={() => { setModalVisible(false); setPickerOpen(false); }}>
                                <Text style={{ fontFamily: theme.fonts.s, fontWeight: '500', color: theme.colors.ink2 }}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity disabled={saving} style={[styles.btnDark, { flex: 1, justifyContent: 'center', paddingVertical: 12 }]} onPress={handleAddTask}>
                                {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ fontFamily: theme.fonts.s, fontWeight: '600', color: '#fff' }}>Save</Text>}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Import Modal */}
            <Modal visible={importModalVisible} animationType="fade" transparent>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalView}>
                        <Text style={styles.modalTitle}>Import Schoology</Text>
                        <Text style={styles.instructions}>Paste your exported webcal/ics link here.</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="webcal://schoology.com/calendar..."
                            placeholderTextColor={theme.colors.ink3}
                            value={schoologyUrl}
                            onChangeText={setSchoologyUrl}
                            autoCapitalize="none"
                        />
                        <View style={[styles.btnRow, { marginTop: 10 }]}>
                            <TouchableOpacity disabled={saving} style={[styles.btnOut, { flex: 1, justifyContent: 'center', paddingVertical: 12 }]} onPress={() => setImportModalVisible(false)}>
                                <Text style={{ fontFamily: theme.fonts.s, fontWeight: '500', color: theme.colors.ink2 }}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity disabled={saving || !schoologyUrl} style={[styles.btnDark, { flex: 1, justifyContent: 'center', paddingVertical: 12 }]} onPress={importICSFromUrl}>
                                {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ fontFamily: theme.fonts.s, fontWeight: '600', color: '#fff' }}>Import</Text>}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Review Imports Modal */}
            <Modal visible={reviewModalVisible} animationType="fade" transparent>
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalView, { width: '95%', maxWidth: 600, maxHeight: '80%', padding: 0, overflow: 'hidden' }]}>
                        <View style={{ padding: 24, paddingBottom: 16 }}>
                            <Text style={styles.modalTitle}>Review Imports ({pendingImports.length})</Text>
                            <Text style={styles.instructions}>Adjust the time needed, urgency, and importance for each assignment before saving.</Text>
                        </View>

                        <ScrollView style={{ flex: 1, paddingHorizontal: 24 }} contentContainerStyle={{ gap: 16 }}>
                            {pendingImports.map((item, idx) => (
                                <View key={idx} style={{ backgroundColor: theme.colors.surface2, padding: 16, borderRadius: theme.radii.lg, borderWidth: 1, borderColor: theme.colors.border }}>
                                    <Text style={[styles.eventText, { fontSize: 15, color: theme.colors.ink, marginBottom: 4 }]} numberOfLines={2}>{item.title}</Text>
                                    <Text style={{ fontFamily: theme.fonts.m, fontSize: 12, color: theme.colors.ink3, marginBottom: 12 }}>Due: {item.due_date}</Text>

                                    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.label}>Duration (min)</Text>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                {[30, 60, 120].map(v => (
                                                    <TouchableOpacity key={v} style={[styles.ctrlBtn, item.duration === v && { backgroundColor: theme.colors.ink, borderColor: theme.colors.ink }]} onPress={() => updatePendingImport(idx, 'duration', v)}>
                                                        <Text style={{ fontFamily: theme.fonts.s, fontSize: 11, color: item.duration === v ? '#fff' : theme.colors.ink2 }}>{v}m</Text>
                                                    </TouchableOpacity>
                                                ))}
                                                <TextInput
                                                    style={[styles.input, { flex: 1, marginBottom: 0, paddingVertical: 8 }]}
                                                    keyboardType="numeric"
                                                    value={String(item.duration)}
                                                    onChangeText={v => updatePendingImport(idx, 'duration', parseInt(v) || 0)}
                                                />
                                            </View>
                                        </View>
                                    </View>

                                    <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.label}>Urgency (1-10)</Text>
                                            <TextInput style={[styles.input, { marginBottom: 0 }]} keyboardType="numeric" value={String(item.urgency)} onChangeText={v => updatePendingImport(idx, 'urgency', parseInt(v) || 1)} />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.label}>Importance (1-10)</Text>
                                            <TextInput style={[styles.input, { marginBottom: 0 }]} keyboardType="numeric" value={String(item.importance)} onChangeText={v => updatePendingImport(idx, 'importance', parseInt(v) || 1)} />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.label}>Action</Text>
                                            <TouchableOpacity
                                                style={[styles.btnOut, { paddingVertical: 10, borderColor: theme.colors.red }]}
                                                onPress={() => {
                                                    const filtered = pendingImports.filter((_, i) => i !== idx);
                                                    setPendingImports(filtered);
                                                    if (filtered.length === 0) setReviewModalVisible(false);
                                                }}
                                            >
                                                <Text style={[styles.btnOutText, { fontSize: 12, color: theme.colors.red }]}>Remove</Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                </View>
                            ))}
                        </ScrollView>

                        <View style={{ padding: 24, paddingTop: 16, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
                            <View style={styles.btnRow}>
                                <TouchableOpacity disabled={saving} style={[styles.btnOut, { flex: 1, justifyContent: 'center', paddingVertical: 12 }]} onPress={() => { setReviewModalVisible(false); setPendingImports([]); }}>
                                    <Text style={{ fontFamily: theme.fonts.s, fontWeight: '500', color: theme.colors.ink2 }}>Discard</Text>
                                </TouchableOpacity>
                                <TouchableOpacity disabled={saving || pendingImports.length === 0} style={[styles.btnDark, { flex: 2, justifyContent: 'center', paddingVertical: 12 }]} onPress={saveReviewedImports}>
                                    {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ fontFamily: theme.fonts.s, fontWeight: '600', color: '#fff' }}>Save {pendingImports.length} Tasks</Text>}
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Schedule Review Modal */}
            <Modal visible={scheduleReviewVisible} animationType="fade" transparent>
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalView, { width: '95%', maxWidth: 600, maxHeight: '85%', padding: 0, overflow: 'hidden' }]}>
                        <View style={{ padding: 24, paddingBottom: 16 }}>
                            <Text style={styles.modalTitle}>Review Before Scheduling</Text>
                            <Text style={styles.instructions}>Set how long each task takes total and how long each study session should be. Blocks will be spread out evenly until the due date.</Text>
                        </View>

                        <ScrollView style={{ flex: 1, paddingHorizontal: 24 }} contentContainerStyle={{ gap: 16, paddingBottom: 16 }}>
                            {scheduleReviewTasks.map((item, idx) => {
                                const totalMin = parseInt(item.totalTime) || 0;
                                const sessionMin = parseInt(item.sessionLength) || 50;
                                const numSessions = sessionMin > 0 ? Math.ceil(totalMin / sessionMin) : 0;
                                return (
                                    <View key={item.id || idx} style={{ backgroundColor: theme.colors.surface2, padding: 16, borderRadius: theme.radii.lg, borderWidth: 1, borderColor: theme.colors.border }}>
                                        <Text style={[styles.eventText, { fontSize: 15, color: theme.colors.ink, marginBottom: 4 }]} numberOfLines={2}>{item.title}</Text>
                                        <Text style={{ fontFamily: theme.fonts.m, fontSize: 12, color: theme.colors.ink3, marginBottom: 12 }}>
                                            Due: {item.due_date || 'No due date'}
                                        </Text>

                                        <View style={{ flexDirection: 'row', gap: 12 }}>
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.label}>Total time needed (min)</Text>
                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                    {[30, 60, 120, 180].map(v => (
                                                        <TouchableOpacity key={v} style={[styles.ctrlBtn, parseInt(item.totalTime) === v && { backgroundColor: theme.colors.ink, borderColor: theme.colors.ink }]} onPress={() => updateScheduleReviewTask(idx, 'totalTime', String(v))}>
                                                            <Text style={{ fontFamily: theme.fonts.s, fontSize: 11, color: parseInt(item.totalTime) === v ? '#fff' : theme.colors.ink2 }}>{v >= 60 ? `${v / 60}h` : `${v}m`}</Text>
                                                        </TouchableOpacity>
                                                    ))}
                                                    <TextInput
                                                        style={[styles.input, { flex: 1, marginBottom: 0, paddingVertical: 8 }]}
                                                        keyboardType="numeric"
                                                        value={item.totalTime}
                                                        onChangeText={v => updateScheduleReviewTask(idx, 'totalTime', v)}
                                                    />
                                                </View>
                                            </View>
                                        </View>

                                        <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.label}>Session length (min)</Text>
                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                    {[25, 45, 60, 90].map(v => (
                                                        <TouchableOpacity key={v} style={[styles.ctrlBtn, parseInt(item.sessionLength) === v && { backgroundColor: theme.colors.ink, borderColor: theme.colors.ink }]} onPress={() => updateScheduleReviewTask(idx, 'sessionLength', String(v))}>
                                                            <Text style={{ fontFamily: theme.fonts.s, fontSize: 11, color: parseInt(item.sessionLength) === v ? '#fff' : theme.colors.ink2 }}>{v}m</Text>
                                                        </TouchableOpacity>
                                                    ))}
                                                    <TextInput
                                                        style={[styles.input, { flex: 1, marginBottom: 0, paddingVertical: 8 }]}
                                                        keyboardType="numeric"
                                                        value={item.sessionLength}
                                                        onChangeText={v => updateScheduleReviewTask(idx, 'sessionLength', v)}
                                                    />
                                                </View>
                                            </View>
                                        </View>

                                        <Text style={{ fontFamily: theme.fonts.m, fontSize: 11, color: theme.colors.ink3, marginTop: 10 }}>
                                            {numSessions} session{numSessions !== 1 ? 's' : ''} of {sessionMin}min = {totalMin}min total
                                        </Text>
                                    </View>
                                );
                            })}
                        </ScrollView>

                        <View style={{ padding: 24, paddingTop: 16, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
                            <View style={styles.btnRow}>
                                <TouchableOpacity disabled={saving} style={[styles.btnOut, { flex: 1, justifyContent: 'center', paddingVertical: 12 }]} onPress={() => { setScheduleReviewVisible(false); setScheduleReviewTasks([]); }}>
                                    <Text style={{ fontFamily: theme.fonts.s, fontWeight: '500', color: theme.colors.ink2 }}>Cancel</Text>
                                </TouchableOpacity>
                                <TouchableOpacity disabled={saving || scheduleReviewTasks.length === 0} style={[styles.btnDark, { flex: 2, justifyContent: 'center', paddingVertical: 12 }]} onPress={confirmSmartSchedule}>
                                    {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ fontFamily: theme.fonts.s, fontWeight: '600', color: '#fff' }}>Schedule {scheduleReviewTasks.length} Tasks</Text>}
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const getStyles = (theme) => StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.bg },
    mainLayout: { flex: 1, paddingTop: 28, paddingHorizontal: HPAD, maxWidth: 1400, width: '100%', alignSelf: 'center' },
    layoutWide: { flexDirection: 'row', gap: 24 },

    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 14 },
    title: { fontFamily: theme.fonts.d, fontSize: 32, fontWeight: '700', color: theme.colors.ink, letterSpacing: -0.5 },
    subtitle: { fontFamily: theme.fonts.m, fontSize: 10, color: theme.colors.ink3, textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 4 },
    btnRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
    btnDark: { backgroundColor: theme.colors.accent, flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 16, borderRadius: theme.radii.r, gap: 8, ...theme.shadows.sm },
    btnDarkText: { color: '#fff', fontFamily: theme.fonts.s, fontSize: 14 },
    saveButton: { backgroundColor: theme.colors.accent, padding: 14, borderRadius: theme.radii.lg, alignItems: 'center', marginTop: 20, ...theme.shadows.sm },
    saveButtonText: { color: '#fff', fontFamily: theme.fonts.s, fontSize: 15 },
    btnOut: { borderWidth: 1, borderColor: theme.colors.border, padding: 10, borderRadius: theme.radii.r, alignItems: 'center', backgroundColor: theme.colors.surface },
    btnOutText: { color: theme.colors.ink, fontFamily: theme.fonts.s, fontSize: 14 },

    legend: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radii.lg, padding: 16, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 20, marginBottom: 18, ...theme.shadows.sm },
    legendTitle: { fontFamily: theme.fonts.m, fontSize: 10, color: theme.colors.ink3, letterSpacing: 2, textTransform: 'uppercase', marginRight: 4 },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    swatch: { width: 14, height: 14, borderRadius: 3, borderWidth: 1.5 },
    legendText: { fontFamily: theme.fonts.m, fontSize: 13, color: theme.colors.ink2, fontWeight: '500' },

    controlsRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 12 },
    ctrlBtn: { borderWidth: 1, borderColor: theme.colors.border, padding: 5, borderRadius: theme.radii.r },
    monthText: { fontFamily: theme.fonts.d, fontSize: 18, fontWeight: '700', color: theme.colors.ink },

    daysRow: { flexDirection: 'row', marginBottom: 4 },
    dayText: { width: CELL_W, textAlign: 'center', fontFamily: theme.fonts.m, fontSize: 9, color: theme.colors.ink3, textTransform: 'uppercase', letterSpacing: 0.8 },

    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
    cell: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 5, padding: 4, overflow: 'hidden' },
    cellEmpty: { backgroundColor: theme.colors.surface2, opacity: 0.4 },
    cellToday: { borderColor: theme.colors.ink, borderWidth: 1.5 },
    cellNum: { fontFamily: theme.fonts.m, fontSize: 12, fontWeight: '700', color: theme.colors.ink2, marginBottom: 4 },
    numToday: { color: theme.colors.ink, fontWeight: '700' },
    cellSelected: { backgroundColor: theme.colors.surface2, borderColor: theme.colors.ink, borderWidth: 1.5 },
    event: { paddingVertical: 2, paddingHorizontal: 4, borderRadius: 4, marginBottom: 3 },
    eventText: { fontFamily: theme.fonts.s, fontSize: 10, fontWeight: '700' },
    moreText: { fontFamily: theme.fonts.m, fontSize: 9, color: theme.colors.ink3, fontWeight: '600', marginTop: 2 },

    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 24 },
    modalView: { width: '100%', maxWidth: 400, backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg, padding: 24, borderWidth: 1, borderColor: theme.colors.border, ...theme.shadows.lg },
    modalTitle: { fontFamily: theme.fonts.d, fontSize: 22, fontWeight: '700', color: theme.colors.ink, marginBottom: 12, letterSpacing: -0.5 },
    instructions: { fontFamily: theme.fonts.s, fontSize: 13, color: theme.colors.ink2, lineHeight: 20, marginBottom: 15 },
    label: { fontFamily: theme.fonts.m, fontSize: 9, color: theme.colors.ink3, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 5 },
    input: { backgroundColor: theme.colors.surface2, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radii.r, paddingVertical: 10, paddingHorizontal: 12, fontFamily: theme.fonts.s, fontSize: 13, color: theme.colors.ink, marginBottom: 14 },

    // Mini calendar
    miniCalWrap: { backgroundColor: theme.colors.surface2, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radii.r, padding: 12, marginBottom: 14, marginTop: -8 },
    miniCalNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    miniCalMonth: { fontFamily: theme.fonts.m, fontSize: 12, fontWeight: '700', color: theme.colors.ink },
    miniDaysRow: { flexDirection: 'row', marginBottom: 4 },
    miniDayText: { flex: 1, textAlign: 'center', fontFamily: theme.fonts.m, fontSize: 9, color: theme.colors.ink3 },
    miniGrid: { flexDirection: 'row', flexWrap: 'wrap' },
    miniCell: { width: '14.28%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 4 },
    miniCellSelected: { backgroundColor: theme.colors.ink },
    miniCellNum: { fontFamily: theme.fonts.m, fontSize: 11, color: theme.colors.ink2 },
    miniCellNumSelected: { color: '#fff', fontWeight: '700' },

    // Sidebar
    sidebar: { backgroundColor: theme.colors.surface, borderLeftWidth: 1, borderTopWidth: 1, borderColor: theme.colors.border },
    sidebarWide: { width: SIDEBAR_W, borderTopWidth: 0 },
    sidebarMobile: { height: 280, borderLeftWidth: 0 },
    sidebarHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
    sidebarTitle: { fontFamily: theme.fonts.d, fontSize: 18, fontWeight: '700', color: theme.colors.ink },
    removeBtn: { backgroundColor: theme.colors.red + '15', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 6 },
    removeBtnText: { fontFamily: theme.fonts.b, fontSize: 16, color: theme.colors.red, letterSpacing: 1 },

    emptySidebar: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
    emptySidebarText: { fontFamily: theme.fonts.m, fontSize: 12, color: theme.colors.ink3 },

    sidebarTask: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
    sidebarTaskActive: { backgroundColor: theme.colors.surface2 },
    checkbox: { width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, borderColor: theme.colors.border2, alignItems: 'center', justifyContent: 'center' },
    checkboxActive: { backgroundColor: theme.colors.ink, borderColor: theme.colors.ink },
    checkboxInner: { width: 8, height: 8, borderRadius: 1.5, backgroundColor: '#fff' },
    sidebarTaskTitle: { fontFamily: theme.fonts.s, fontSize: 16, fontWeight: '600', color: theme.colors.ink },
    sidebarTaskMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
    miniSwatch: { width: 8, height: 8, borderRadius: 4 },
    sidebarTaskPrio: { fontFamily: theme.fonts.m, fontSize: 12, color: theme.colors.ink3, textTransform: 'uppercase', letterSpacing: 0.5 },
    sidebarBlockBtn: { padding: 10, borderRadius: 8, backgroundColor: theme.colors.surface2, borderWidth: 1, borderColor: theme.colors.border },
});

// ── Calendar Sidebar (mini month + upcoming + categories) ─────────
function CalendarSidebar({ theme, tasks, month, setMonth, year, setYear, selectedDate, setSelectedDate, getPrio, MN, blockTask }) {
    const dim = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    const cells = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let i = 1; i <= dim; i++) cells.push(i);
    while (cells.length % 7 !== 0) cells.push(null);

    const today = new Date();
    const isCurrentMonth = today.getMonth() === month && today.getFullYear() === year;

    // Upcoming: next 5 events sorted by date
    const todayStr = today.toLocaleDateString('en-CA');
    const upcoming = tasks
        .filter(t => {
            const d = (t.due_date || t.date || '').slice(0, 10);
            return d && d >= todayStr;
        })
        .sort((a, b) => {
            const da = (a.due_date || a.date || '').slice(0, 10);
            const db = (b.due_date || b.date || '').slice(0, 10);
            return da.localeCompare(db);
        })
        .slice(0, 5);

    // Days that have events (for dot indicators)
    const eventDates = new Set(tasks.map(t => (t.due_date || t.date || '').slice(0, 10)).filter(Boolean));

    const [categories, setCategories] = React.useState({
        Assignments: true, 'Tests & Quizzes': true, Labs: true, 'Study plan (AI)': true,
    });
    const toggleCategory = (k) => setCategories(prev => ({ ...prev, [k]: !prev[k] }));

    const SEM_BLUE = '#2563EB', SEM_RED = '#E03E3E', SEM_GREEN = '#16A34A', SEM_PURPLE = '#7C3AED';

    return (
        <View style={{
            width: 280, flexShrink: 0,
            gap: 16,
        }}>
            {/* Mini month calendar */}
            <View style={{
                backgroundColor: theme.colors.surface,
                borderRadius: 12,
                borderWidth: 1, borderColor: theme.colors.border,
                padding: 14,
            }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <Text style={{ fontFamily: theme.fonts.s, fontSize: 14, fontWeight: '600', color: theme.colors.ink }}>
                        {MN[month]} {year}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 4 }}>
                        <TouchableOpacity
                            onPress={() => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); }}
                            style={{ padding: 4 }}
                        >
                            <ChevronLeft size={14} color={theme.colors.ink3} />
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); }}
                            style={{ padding: 4 }}
                        >
                            <ChevronRight size={14} color={theme.colors.ink3} />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Day headers */}
                <View style={{ flexDirection: 'row', marginBottom: 4 }}>
                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                        <Text key={i} style={{
                            flex: 1, textAlign: 'center',
                            fontFamily: theme.fonts.m, fontSize: 10, color: theme.colors.ink3,
                            paddingVertical: 4,
                        }}>
                            {d}
                        </Text>
                    ))}
                </View>

                {/* Date grid */}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                    {cells.map((d, i) => {
                        if (d === null) return <View key={i} style={{ width: '14.285%', height: 30 }} />;
                        const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                        const isToday = isCurrentMonth && d === today.getDate();
                        const isSelected = iso === selectedDate;
                        const hasEvent = eventDates.has(iso);
                        return (
                            <TouchableOpacity
                                key={i}
                                onPress={() => setSelectedDate(iso)}
                                style={{
                                    width: '14.285%', height: 30,
                                    alignItems: 'center', justifyContent: 'center',
                                    position: 'relative',
                                }}
                            >
                                <View style={{
                                    width: 26, height: 26, borderRadius: 13,
                                    alignItems: 'center', justifyContent: 'center',
                                    backgroundColor: isToday ? theme.colors.ink : isSelected ? theme.colors.surface2 : 'transparent',
                                }}>
                                    <Text style={{
                                        fontFamily: theme.fonts.s, fontSize: 11,
                                        color: isToday ? theme.colors.bg : theme.colors.ink,
                                        fontWeight: isToday || hasEvent ? '600' : '400',
                                    }}>
                                        {d}
                                    </Text>
                                </View>
                                {hasEvent && !isToday && (
                                    <View style={{
                                        position: 'absolute', bottom: 1,
                                        width: 3, height: 3, borderRadius: 2,
                                        backgroundColor: SEM_BLUE,
                                    }} />
                                )}
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </View>

            {/* Upcoming */}
            <View style={{
                backgroundColor: theme.colors.surface,
                borderRadius: 12,
                borderWidth: 1, borderColor: theme.colors.border,
                padding: 14,
            }}>
                <Text style={{ fontFamily: theme.fonts.s, fontSize: 13, fontWeight: '600', color: theme.colors.ink, marginBottom: 10 }}>
                    Upcoming
                </Text>
                {upcoming.length === 0 ? (
                    <Text style={{ fontFamily: theme.fonts.m, fontSize: 12, color: theme.colors.ink3 }}>
                        Nothing scheduled
                    </Text>
                ) : upcoming.map((t, i) => {
                    const dateStr = (t.due_date || t.date || '').slice(0, 10);
                    const dateFmt = new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                    const lower = (t.title || '').toLowerCase();
                    const c = lower.includes('test') || lower.includes('quiz') || lower.includes('exam') ? SEM_RED
                        : lower.includes('lab') ? SEM_GREEN
                        : t.type === 'worktime' ? SEM_PURPLE
                        : SEM_BLUE;
                    return (
                        <View key={i} style={{
                            flexDirection: 'row', alignItems: 'center', gap: 10,
                            paddingVertical: 6,
                        }}>
                            <View style={{ width: 3, height: 26, backgroundColor: c, borderRadius: 2 }} />
                            <View style={{ flex: 1, minWidth: 0 }}>
                                <Text style={{ fontFamily: theme.fonts.s, fontSize: 12, fontWeight: '500', color: theme.colors.ink }} numberOfLines={1}>
                                    {t.title}
                                </Text>
                                <Text style={{ fontFamily: theme.fonts.m, fontSize: 10, color: theme.colors.ink3, marginTop: 1 }}>
                                    {dateFmt}
                                </Text>
                            </View>
                            <TouchableOpacity onPress={() => blockTask(t)} style={{ padding: 4 }} title="Add to Google Calendar">
                                <CalendarDays size={14} color={theme.colors.ink3} />
                            </TouchableOpacity>
                        </View>
                    );
                })}
            </View>

            {/* Categories */}
            <View style={{
                backgroundColor: theme.colors.surface,
                borderRadius: 12,
                borderWidth: 1, borderColor: theme.colors.border,
                padding: 14,
            }}>
                <Text style={{ fontFamily: theme.fonts.s, fontSize: 13, fontWeight: '600', color: theme.colors.ink, marginBottom: 10 }}>
                    Categories
                </Text>
                {[
                    { label: 'Assignments', color: SEM_BLUE },
                    { label: 'Tests & Quizzes', color: SEM_RED },
                    { label: 'Labs', color: SEM_GREEN },
                    { label: 'Study plan (AI)', color: SEM_PURPLE },
                ].map((c, i) => {
                    const active = categories[c.label];
                    return (
                        <TouchableOpacity
                            key={i}
                            onPress={() => toggleCategory(c.label)}
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }}
                            activeOpacity={0.7}
                        >
                            <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: c.color, opacity: active ? 1 : 0.3 }} />
                            <Text style={{
                                flex: 1, fontFamily: theme.fonts.s, fontSize: 12,
                                color: active ? theme.colors.ink : theme.colors.ink3,
                            }}>
                                {c.label}
                            </Text>
                            {active && (
                                <Text style={{ color: theme.colors.ink3, fontSize: 12, fontWeight: '600' }}>✓</Text>
                            )}
                        </TouchableOpacity>
                    );
                })}
            </View>
        </View>
    );
}

// ── Week View Content (matches design's calendar week grid) ──────
function WeekViewContent({ theme, tasks, selectedDate, setSelectedDate, getPrio, month, setMonth, year, setYear }) {
    // Compute the week containing selectedDate (Sun→Sat)
    const sel = new Date(selectedDate + 'T12:00:00');
    const weekStart = new Date(sel);
    weekStart.setDate(sel.getDate() - sel.getDay()); // back to Sunday

    const weekDays = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart);
        d.setDate(weekStart.getDate() + i);
        return {
            iso: d.toLocaleDateString('en-CA'),
            d: d.getDate(),
            w: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][i],
            isToday: d.toDateString() === new Date().toDateString(),
        };
    });

    // Hours shown 8am - 6pm (10 rows)
    const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
    const ROW_H = 56;

    // Map a task to its time placement on the week grid
    const getTaskPlacement = (t) => {
        let dateStr = '';
        let startHour = null;
        let durationMin = t.duration || 60;

        if (t.type === 'worktime' && t.scheduled_start) {
            const s = new Date(t.scheduled_start);
            dateStr = s.toLocaleDateString('en-CA');
            startHour = s.getHours() + s.getMinutes() / 60;
            if (t.scheduled_end) {
                const e = new Date(t.scheduled_end);
                durationMin = (e - s) / 60000;
            }
        } else {
            dateStr = (t.due_date || t.date || '').slice(0, 10);
            startHour = 12; // default mid-day for due-date items
            durationMin = 30; // small bar
        }
        return { dateStr, startHour, durationMin };
    };

    // Now line — only when current week
    const now = new Date();
    const isCurrentWeek = weekDays.some(d => d.isToday);
    const nowHour = now.getHours() + now.getMinutes() / 60;
    const nowOffset = ((nowHour - HOURS[0]) / (HOURS.length)) * 100;

    return (
        <View style={{ paddingTop: 0, flex: 1 }}>
            {/* Week nav header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <TouchableOpacity
                    onPress={() => {
                        const d = new Date(selectedDate + 'T12:00:00');
                        d.setDate(d.getDate() - 7);
                        setSelectedDate(d.toLocaleDateString('en-CA'));
                        setMonth(d.getMonth());
                        setYear(d.getFullYear());
                    }}
                    style={{ padding: 6 }}
                >
                    <ChevronLeft size={16} color={theme.colors.ink2} />
                </TouchableOpacity>
                <Text style={{ fontFamily: theme.fonts.s, fontSize: 14, fontWeight: '600', color: theme.colors.ink }}>
                    Week of {weekDays[0].w} {weekDays[0].d} – {weekDays[6].w} {weekDays[6].d}
                </Text>
                <TouchableOpacity
                    onPress={() => {
                        const d = new Date(selectedDate + 'T12:00:00');
                        d.setDate(d.getDate() + 7);
                        setSelectedDate(d.toLocaleDateString('en-CA'));
                        setMonth(d.getMonth());
                        setYear(d.getFullYear());
                    }}
                    style={{ padding: 6 }}
                >
                    <ChevronRight size={16} color={theme.colors.ink2} />
                </TouchableOpacity>
            </View>

            {/* Week grid card */}
            <View style={{
                flex: 1,
                backgroundColor: theme.colors.surface,
                borderRadius: 14,
                borderWidth: 1, borderColor: theme.colors.border,
                overflow: 'hidden',
            }}>
                {/* Day headers row */}
                <View style={{
                    flexDirection: 'row',
                    borderBottomWidth: 1, borderBottomColor: theme.colors.border,
                    backgroundColor: theme.colors.surface2 + '80',
                }}>
                    <View style={{ width: 50 }} />
                    {weekDays.map((d) => (
                        <TouchableOpacity
                            key={d.iso}
                            onPress={() => setSelectedDate(d.iso)}
                            style={{
                                flex: 1,
                                paddingVertical: 10,
                                alignItems: 'center',
                                borderLeftWidth: 1, borderLeftColor: theme.colors.border,
                            }}
                        >
                            <Text style={{
                                fontFamily: theme.fonts.m, fontSize: 9, color: theme.colors.ink3,
                                textTransform: 'uppercase', letterSpacing: 1,
                            }}>
                                {d.w}
                            </Text>
                            <View style={{
                                width: 26, height: 26, borderRadius: 13,
                                marginTop: 4,
                                alignItems: 'center', justifyContent: 'center',
                                backgroundColor: d.isToday ? theme.colors.ink : 'transparent',
                            }}>
                                <Text style={{
                                    fontFamily: theme.fonts.s, fontSize: 14, fontWeight: '600',
                                    color: d.isToday ? theme.colors.bg : theme.colors.ink,
                                }}>
                                    {d.d}
                                </Text>
                            </View>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Time grid — time column on left, then 7 day columns; events live INSIDE each day column */}
                <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                    <View style={{ flexDirection: 'row' }}>
                        {/* Time labels column */}
                        <View style={{ width: 50, flexShrink: 0 }}>
                            {HOURS.map((h) => (
                                <View key={h} style={{
                                    height: ROW_H,
                                    padding: 4, alignItems: 'flex-end',
                                    borderBottomWidth: 1, borderBottomColor: theme.colors.border,
                                }}>
                                    <Text style={{ fontFamily: theme.fonts.mono, fontSize: 10, color: theme.colors.ink3 }}>
                                        {h > 12 ? h - 12 : h}{h >= 12 ? 'p' : 'a'}
                                    </Text>
                                </View>
                            ))}
                        </View>
                        {/* Day columns */}
                        {weekDays.map((day) => {
                            const dayTasks = tasks.filter(t => {
                                const p = getTaskPlacement(t);
                                return p.dateStr === day.iso && p.startHour !== null && p.startHour >= HOURS[0] && p.startHour < HOURS[HOURS.length - 1] + 1;
                            });
                            return (
                                <View key={day.iso} style={{
                                    flex: 1,
                                    position: 'relative',
                                    borderLeftWidth: 1, borderLeftColor: theme.colors.border,
                                }}>
                                    {/* Hour grid lines for this column */}
                                    {HOURS.map((h) => (
                                        <View key={h} style={{
                                            height: ROW_H,
                                            borderBottomWidth: 1, borderBottomColor: theme.colors.border,
                                        }} />
                                    ))}
                                    {/* Events absolutely positioned within this day column */}
                                    {dayTasks.map((t, ti) => {
                                        const p = getTaskPlacement(t);
                                        const top = (p.startHour - HOURS[0]) * ROW_H;
                                        const height = Math.max(20, (p.durationMin / 60) * ROW_H - 2);
                                        const c = getPrio(t.urgency, t.importance);
                                        const isWorktime = t.type === 'worktime';
                                        return (
                                            <View
                                                key={ti}
                                                style={{
                                                    position: 'absolute',
                                                    top: top + 1, left: 3, right: 3,
                                                    height,
                                                    backgroundColor: c.bg,
                                                    borderLeftWidth: 3, borderLeftColor: c.text,
                                                    borderRadius: 4,
                                                    padding: 4, paddingLeft: 6,
                                                    overflow: 'hidden',
                                                }}
                                            >
                                                <Text style={{
                                                    fontFamily: theme.fonts.s, fontSize: 10, fontWeight: '600',
                                                    color: c.text,
                                                }} numberOfLines={2}>
                                                    {isWorktime ? '🎯 ' : ''}{t.title}
                                                </Text>
                                            </View>
                                        );
                                    })}
                                    {/* "Now" line on today's column */}
                                    {day.isToday && nowHour >= HOURS[0] && nowHour < HOURS[HOURS.length - 1] + 1 && (
                                        <View style={{
                                            position: 'absolute',
                                            left: 0, right: 0,
                                            top: (nowHour - HOURS[0]) * ROW_H,
                                            borderTopWidth: 2,
                                            borderTopColor: '#E03E3E',
                                            zIndex: 5,
                                        }}>
                                            <View style={{
                                                position: 'absolute',
                                                left: -5, top: -5,
                                                width: 10, height: 10, borderRadius: 5,
                                                backgroundColor: '#E03E3E',
                                            }} />
                                        </View>
                                    )}
                                </View>
                            );
                        })}
                    </View>
                </ScrollView>
            </View>
        </View>
    );
}

// ── Day View Content (single-day vertical timeline) ──────────────
function DayViewContent({ theme, tasks, selectedDate, setSelectedDate, getPrio }) {
    const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
    const ROW_H = 64;

    const dayTasks = tasks.filter(t => {
        if (t.type === 'worktime') return t.scheduled_start && new Date(t.scheduled_start).toLocaleDateString('en-CA') === selectedDate;
        return (t.due_date || t.date || '').slice(0, 10) === selectedDate;
    });

    const sel = new Date(selectedDate + 'T12:00:00');
    const isToday = sel.toDateString() === new Date().toDateString();

    return (
        <View style={{ paddingTop: 0, flex: 1 }}>
            {/* Date nav */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <TouchableOpacity onPress={() => {
                    const d = new Date(selectedDate + 'T12:00:00');
                    d.setDate(d.getDate() - 1);
                    setSelectedDate(d.toLocaleDateString('en-CA'));
                }} style={{ padding: 6 }}>
                    <ChevronLeft size={16} color={theme.colors.ink2} />
                </TouchableOpacity>
                <Text style={{ fontFamily: theme.fonts.s, fontSize: 15, fontWeight: '700', color: theme.colors.ink }}>
                    {sel.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                    {isToday && <Text style={{ color: '#E03E3E', fontSize: 12, fontWeight: '600' }}>  · Today</Text>}
                </Text>
                <TouchableOpacity onPress={() => {
                    const d = new Date(selectedDate + 'T12:00:00');
                    d.setDate(d.getDate() + 1);
                    setSelectedDate(d.toLocaleDateString('en-CA'));
                }} style={{ padding: 6 }}>
                    <ChevronRight size={16} color={theme.colors.ink2} />
                </TouchableOpacity>
            </View>

            <View style={{
                flex: 1,
                backgroundColor: theme.colors.surface,
                borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border,
                overflow: 'hidden',
            }}>
                <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                    <View style={{ position: 'relative' }}>
                        {HOURS.map((h) => (
                            <View key={h} style={{
                                flexDirection: 'row',
                                minHeight: ROW_H,
                                borderBottomWidth: 1, borderBottomColor: theme.colors.border,
                            }}>
                                <View style={{ width: 60, padding: 6, alignItems: 'flex-end' }}>
                                    <Text style={{ fontFamily: theme.fonts.mono, fontSize: 11, color: theme.colors.ink3 }}>
                                        {h > 12 ? h - 12 : h}{h >= 12 ? 'p' : 'a'}
                                    </Text>
                                </View>
                                <View style={{ flex: 1 }} />
                            </View>
                        ))}
                        {dayTasks.map((t, i) => {
                            let startHour = 12;
                            let durationMin = t.duration || 60;
                            if (t.type === 'worktime' && t.scheduled_start) {
                                const s = new Date(t.scheduled_start);
                                startHour = s.getHours() + s.getMinutes() / 60;
                                if (t.scheduled_end) {
                                    durationMin = (new Date(t.scheduled_end) - s) / 60000;
                                }
                            }
                            if (startHour < HOURS[0] || startHour >= HOURS[HOURS.length - 1] + 1) return null;
                            const c = getPrio(t.urgency, t.importance);
                            const top = (startHour - HOURS[0]) * ROW_H;
                            const height = Math.max(28, (durationMin / 60) * ROW_H - 4);
                            return (
                                <View key={i} style={{
                                    position: 'absolute',
                                    top: top + 2, left: 64, right: 8,
                                    backgroundColor: c.bg,
                                    borderLeftWidth: 4, borderLeftColor: c.text,
                                    borderRadius: 6,
                                    padding: 8, paddingLeft: 12,
                                    height: height,
                                    overflow: 'hidden',
                                }}>
                                    <Text style={{ fontFamily: theme.fonts.s, fontSize: 13, fontWeight: '600', color: c.text }} numberOfLines={2}>
                                        {t.type === 'worktime' ? '🎯 ' : ''}{t.title}
                                    </Text>
                                    {t.duration && (
                                        <Text style={{ fontFamily: theme.fonts.m, fontSize: 11, color: c.text, opacity: 0.7, marginTop: 2 }}>
                                            {Math.round(durationMin)} min
                                        </Text>
                                    )}
                                </View>
                            );
                        })}
                    </View>
                </ScrollView>
            </View>
        </View>
    );
}
