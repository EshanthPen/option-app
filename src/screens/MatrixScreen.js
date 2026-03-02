import React, { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, Modal, TextInput,
    ScrollView, Alert, Dimensions, Platform, ActivityIndicator, Switch
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ICAL from 'ical.js';
import { supabase } from '../supabaseClient';
import { theme as staticTheme } from '../utils/theme';
import { useTheme } from '../context/ThemeContext';
import { ChevronLeft, ChevronRight, Plus, Download, CalendarDays, Sparkles, Check, Clock } from 'lucide-react-native';

const { width: SCREEN_W, height: SCREEN_H_RAW } = Dimensions.get('window');
const IS_WIDE = SCREEN_W > 800;
const SIDEBAR_W = 320;

// On web the sidebar is 220px wide; on mobile it's 72px.
// The screen content area is already offset by the sidebar via sceneStyle paddingLeft.
// So available width for the calendar is just the screen content area.
const HPAD = 20;
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
    const [modalVisible, setModalVisible] = useState(false);
    const [importModalVisible, setImportModalVisible] = useState(false);
    const [schoologyUrl, setSchoologyUrl] = useState('');
    const [saving, setSaving] = useState(false);
    const [month, setMonth] = useState(new Date().getMonth());
    const [year, setYear] = useState(new Date().getFullYear());
    const [selectedDate, setSelectedDate] = useState(new Date().toLocaleDateString('en-CA'));
    const [selectedTaskIds, setSelectedTaskIds] = useState([]);
    const [scheduleModalVisible, setScheduleModalVisible] = useState(false);
    const [studyPlan, setStudyPlan] = useState([]);
    const [availabilityModalVisible, setAvailabilityModalVisible] = useState(false);
    const [generatingPlan, setGeneratingPlan] = useState(false);
    const DEFAULT_AVAILABILITY = {
        0: { enabled: false, start: '10:00', end: '18:00' },
        1: { enabled: true,  start: '15:30', end: '19:00' },
        2: { enabled: true,  start: '15:30', end: '19:00' },
        3: { enabled: true,  start: '15:30', end: '19:00' },
        4: { enabled: true,  start: '15:30', end: '19:00' },
        5: { enabled: true,  start: '15:30', end: '18:00' },
        6: { enabled: true,  start: '10:00', end: '20:00' },
    };
    const [availability, setAvailability] = useState(DEFAULT_AVAILABILITY);

    // Form state
    const [title, setTitle] = useState('');
    const [urgency, setUrgency] = useState('5');
    const [importance, setImportance] = useState('5');
    const [duration, setDuration] = useState('60');

    // Mini calendar picker state inside the modal
    const [pickerOpen, setPickerOpen] = useState(false);
    const [pickerMonth, setPickerMonth] = useState(new Date().getMonth());
    const [pickerYear, setPickerYear] = useState(new Date().getFullYear());
    const [taskDate, setTaskDate] = useState(new Date().toLocaleDateString('en-CA')); // YYYY-MM-DD local

    useEffect(() => {
        fetchTasks();
        AsyncStorage.getItem('studyAvailability').then(v => {
            if (v) setAvailability(JSON.parse(v));
        });
    }, []);

    const fetchTasks = async () => {
        const { data, error } = await supabase.from('tasks').select('*').order('created_at', { ascending: false });
        if (data) setTasks(data);
    };

    const handleAddTask = async () => {
        if (!title.trim()) return;
        setSaving(true);
        const newTask = {
            title,
            urgency: parseInt(urgency) || 5,
            importance: parseInt(importance) || 5,
            duration: parseInt(duration) || 60,
            date: taskDate,
            source: 'manual',
            user_id: 'default_user'
        };
        try {
            const { data, error } = await supabase.from('tasks').insert([newTask]).select();
            if (error) throw error;
            if (data?.length > 0) setTasks(prev => [data[0], ...prev]);
            setModalVisible(false);
            setTitle('');
        } catch (error) {
            console.error('Supabase Error:', error);
            // Local fallback for demo purposes
            const mockData = { ...newTask, id: Date.now() };
            setTasks(prev => [mockData, ...prev]);
            setModalVisible(false);
            setTitle('');
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
                    date: dueDate.toISOString().split('T')[0],
                    source: 'schoology_import',
                    user_id: 'default_user'
                };
            }).filter(t => t !== null);

            if (imported.length > 0) {
                const { data, error } = await supabase.from('tasks').insert(imported).select();
                if (error) throw error;
                if (data) setTasks(prev => [...data, ...prev]);
            }
            setImportModalVisible(false);
            setSchoologyUrl('');
            if (Platform.OS === 'web') window.alert(`Success: Imported ${imported.length} assignments!`);
            else Alert.alert('Success', `Imported ${imported.length} assignments!`);
        } catch (err) {
            console.error(err);
            const errMsg = err.message || 'Failed to fetch calendar.';
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
            const { error } = await supabase.from('tasks').delete().in('id', selectedTaskIds);
            if (error) throw error;
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

    const toggleTaskSelection = (id) => {
        setSelectedTaskIds(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    const toggleComplete = async (task) => {
        const newCompleted = !task.completed;
        setTasks(prev => prev.map(t => t.id === task.id ? { ...t, completed: newCompleted } : t));
        try {
            await supabase.from('tasks').update({ completed: newCompleted }).eq('id', task.id);
        } catch {
            // Revert optimistic update on failure
            setTasks(prev => prev.map(t => t.id === task.id ? { ...t, completed: !newCompleted } : t));
        }
    };

    const generateStudyPlan = async () => {
        setGeneratingPlan(true);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Fetch busy periods from Google Calendar if signed in
        let busyTimes = [];
        try {
            const token = await AsyncStorage.getItem('googleAccessToken');
            if (token) {
                const timeMin = today.toISOString();
                const timeMax = new Date(today.getTime() + 21 * 24 * 60 * 60 * 1000).toISOString();
                const res = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ timeMin, timeMax, items: [{ id: 'primary' }] }),
                });
                if (res.ok) {
                    const data = await res.json();
                    busyTimes = (data.calendars?.primary?.busy || []).map(b => ({
                        start: new Date(b.start), end: new Date(b.end),
                    }));
                }
            }
        } catch {}

        const upcoming = tasks
            .filter(t => !t.completed && t.date && new Date(t.date + 'T12:00:00') >= today)
            .sort((a, b) => {
                const dA = Math.max((new Date(a.date + 'T12:00:00') - today) / (1000 * 60 * 60 * 24), 0.5);
                const dB = Math.max((new Date(b.date + 'T12:00:00') - today) / (1000 * 60 * 60 * 24), 0.5);
                return ((b.urgency + b.importance) / dB) - ((a.urgency + a.importance) / dA);
            })
            .slice(0, 10);

        const scheduledSlots = [];
        const plan = [];

        for (const t of upcoming) {
            const due = new Date(t.date + 'T12:00:00');
            const daysUntil = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
            const dur = (t.duration || 60) * 60 * 1000;

            // Build candidate days from today up to (but not including) due date, closest first
            const candidates = [];
            for (let i = 0; i < Math.min(daysUntil, 14); i++) {
                candidates.push(new Date(today.getTime() + i * 24 * 60 * 60 * 1000));
            }
            candidates.reverse(); // prefer days closest to due date

            let placed = false;
            for (const candidateDate of candidates) {
                const dayOfWeek = candidateDate.getDay();
                const avDay = availability[dayOfWeek];
                if (!avDay?.enabled) continue;

                const dateStr = candidateDate.toLocaleDateString('en-CA');
                const windowEnd = new Date(`${dateStr}T${avDay.end}:00`);
                let tryStart = new Date(`${dateStr}T${avDay.start}:00`);

                // Slide a window every 30 min until the slot fits
                while (tryStart.getTime() + dur <= windowEnd.getTime()) {
                    const tryEnd = new Date(tryStart.getTime() + dur);
                    const hitBusy = busyTimes.some(b => b.start < tryEnd && b.end > tryStart);
                    const hitScheduled = scheduledSlots.some(s => s.start < tryEnd && s.end > tryStart);

                    if (!hitBusy && !hitScheduled) {
                        scheduledSlots.push({ start: tryStart, end: tryEnd });
                        plan.push({
                            task: t,
                            studyDate: dateStr,
                            studyDateDisplay: tryStart.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
                            startTime: tryStart.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
                            endTime: tryEnd.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
                            startISO: tryStart.toISOString(),
                            endISO: tryEnd.toISOString(),
                            duration: t.duration || 60,
                            daysUntilDue: daysUntil,
                        });
                        placed = true;
                        break;
                    }
                    tryStart = new Date(tryStart.getTime() + 30 * 60 * 1000);
                }
                if (placed) break;
            }

            if (!placed) {
                plan.push({
                    task: t, studyDate: null, studyDateDisplay: null,
                    startTime: null, endTime: null, startISO: null, endISO: null,
                    duration: t.duration || 60, daysUntilDue: daysUntil, unscheduled: true,
                });
            }
        }

        setStudyPlan(plan);
        setScheduleModalVisible(true);
        setGeneratingPlan(false);
    };

    const addPlanToCalendar = async () => {
        const token = await AsyncStorage.getItem('googleAccessToken');
        if (!token) {
            if (Platform.OS === 'web') window.alert('Not Signed In: Go to Settings and sign in with Google first.');
            else Alert.alert('Not Signed In', 'Go to Settings and sign in with Google first.');
            return;
        }
        let added = 0;
        for (const item of studyPlan) {
            if (item.unscheduled) continue;
            const event = {
                summary: `Study: ${item.task.title} 📚`,
                description: `Due: ${item.task.date} · Urgency ${item.task.urgency} · Importance ${item.task.importance}`,
                start: { dateTime: item.startISO, timeZone: 'America/New_York' },
                end: { dateTime: item.endISO, timeZone: 'America/New_York' },
            };
            const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(event),
            });
            if (res.ok) added++;
        }
        if (Platform.OS === 'web') window.alert(`Done! Added ${added} study blocks to Google Calendar.`);
        else Alert.alert('Done!', `Added ${added} study blocks to Google Calendar.`);
        setScheduleModalVisible(false);
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
            const start = task.date ? new Date(task.date + 'T12:00:00') : new Date();
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

    const selectedDayTasks = tasks.filter(t => t.date?.startsWith(selectedDate));

    return (
        <View style={styles.container}>
            <View style={[styles.mainLayout, IS_WIDE && styles.layoutWide]}>
                {/* Left: Calendar Grid */}
                <View style={IS_WIDE ? { flex: 1.5 } : { width: '100%' }}>
                    {/* Header */}
                    <View style={styles.headerRow}>
                        <View>
                            <Text style={styles.title}>Calendar</Text>
                            <Text style={styles.subtitle}>{MN[month]} {year} · {tasks.filter(t => !t.completed).length}/{tasks.length} pending</Text>
                        </View>
                        <View style={styles.btnRow}>
                            <TouchableOpacity style={styles.btnOut} onPress={() => setAvailabilityModalVisible(true)}>
                                <Clock color={theme.colors.ink2} size={18} />
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.btnOut} onPress={generateStudyPlan} disabled={generatingPlan}>
                                {generatingPlan
                                    ? <ActivityIndicator size="small" color={theme.colors.ink2} />
                                    : <Sparkles color={theme.colors.ink2} size={18} />}
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.btnOut} onPress={() => setImportModalVisible(true)}>
                                <Download color={theme.colors.ink2} size={18} />
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.btnDark} onPress={() => setModalVisible(true)}>
                                <Plus color="#fff" size={18} />
                                <Text style={styles.btnDarkText}>Add Event</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Legend */}
                    <View style={styles.legend}>
                        <Text style={styles.legendTitle}>KEY</Text>
                        {[{ l: 'Do First', c: theme.colors.red }, { l: 'Schedule', c: theme.colors.orange }, { l: 'Delegate', c: theme.colors.green }, { l: 'Eliminate', c: theme.colors.blue }].map((item, i) => (
                            <View key={i} style={styles.legendItem}>
                                <View style={[styles.swatch, { backgroundColor: item.c + '20', borderColor: item.c }]} />
                                <Text style={styles.legendText}>{item.l}</Text>
                            </View>
                        ))}
                    </View>

                    {/* Month nav */}
                    <View style={styles.controlsRow}>
                        <TouchableOpacity onPress={() => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); }} style={styles.ctrlBtn}>
                            <ChevronLeft color={theme.colors.ink2} size={16} />
                        </TouchableOpacity>
                        <Text style={styles.monthText}>{MN[month]} {year}</Text>
                        <TouchableOpacity onPress={() => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); }} style={styles.ctrlBtn}>
                            <ChevronRight color={theme.colors.ink2} size={16} />
                        </TouchableOpacity>
                    </View>

                    {/* Day headers */}
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

                    {/* Grid */}
                    <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                        <View style={styles.grid}>
                            {cells.map((d, i) => {
                                const dateStr = d ? `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null;
                                const dayTasks = d ? tasks.filter(t => t.date?.startsWith(dateStr)) : [];
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
                                                        isHigh && { fontSize: 11, fontWeight: '900' },
                                                        isMed && { fontWeight: '700' }
                                                    ]} numberOfLines={1}>{t.title}</Text>
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
                </View>

                {/* Right/Bottom Sidebar: Day Details */}
                <View style={[styles.sidebar, IS_WIDE ? styles.sidebarWide : styles.sidebarMobile]}>
                    <View style={styles.sidebarHeader}>
                        <Text style={styles.sidebarTitle}>
                            {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                        </Text>
                        {selectedTaskIds.length > 0 && (
                            <TouchableOpacity style={styles.removeBtn} onPress={handleRemoveSelected} disabled={saving}>
                                <Text style={styles.removeBtnText}>Remove ({selectedTaskIds.length})</Text>
                            </TouchableOpacity>
                        )}
                    </View>

                    <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                        {selectedDayTasks.length === 0 ? (
                            <View style={styles.emptySidebar}>
                                <Text style={styles.emptySidebarText}>No events for this day</Text>
                            </View>
                        ) : selectedDayTasks.map((t, idx) => {
                            const prio = getPrio(t.urgency, t.importance);
                            const isSelected = selectedTaskIds.includes(t.id);
                            const isDone = !!t.completed;
                            return (
                                <View
                                    key={idx}
                                    style={[styles.sidebarTask, isDone && styles.sidebarTaskDone]}
                                >
                                    <TouchableOpacity
                                        style={[styles.checkbox, isDone && styles.checkboxDone]}
                                        onPress={() => toggleComplete(t)}
                                    >
                                        {isDone && <Check size={11} color="#fff" strokeWidth={3} />}
                                    </TouchableOpacity>
                                    <TouchableOpacity style={{ flex: 1 }} onPress={() => toggleTaskSelection(t.id)}>
                                        <Text style={[styles.sidebarTaskTitle, isDone && styles.sidebarTaskTitleDone, isSelected && { color: theme.colors.ink3 }]} numberOfLines={1}>{t.title}</Text>
                                        <View style={styles.sidebarTaskMeta}>
                                            <View style={[styles.miniSwatch, { backgroundColor: prio.text }]} />
                                            <Text style={styles.sidebarTaskPrio}>{t.urgency}U · {t.importance}I · {t.duration}min</Text>
                                        </View>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={styles.sidebarBlockBtn} onPress={() => blockTask(t)}>
                                        <CalendarDays size={18} color={theme.colors.ink} />
                                    </TouchableOpacity>
                                </View>
                            );
                        })}
                    </ScrollView>
                </View>
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

            {/* Smart Study Schedule Modal */}
            <Modal visible={scheduleModalVisible} animationType="fade" transparent>
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalView, { maxHeight: '80%' }]}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                            <Text style={styles.modalTitle}>Smart Schedule</Text>
                            <TouchableOpacity
                                style={styles.avShortcut}
                                onPress={() => { setScheduleModalVisible(false); setAvailabilityModalVisible(true); }}
                            >
                                <Clock size={12} color={theme.colors.ink3} />
                                <Text style={styles.avShortcutText}>Availability</Text>
                            </TouchableOpacity>
                        </View>
                        <Text style={styles.instructions}>
                            Study blocks fit to your free windows, avoiding existing calendar events.
                        </Text>
                        {studyPlan.length === 0 ? (
                            <Text style={[styles.instructions, { color: theme.colors.ink3, textAlign: 'center', marginTop: 12 }]}>
                                No upcoming incomplete tasks found.
                            </Text>
                        ) : (
                            <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false}>
                                {studyPlan.map((item, i) => {
                                    const prio = getPrio(item.task.urgency, item.task.importance);
                                    return (
                                        <View key={i} style={styles.planItem}>
                                            <View style={[styles.planDot, { backgroundColor: item.unscheduled ? theme.colors.red : prio.text }]} />
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.planTitle} numberOfLines={1}>{item.task.title}</Text>
                                                {item.unscheduled ? (
                                                    <Text style={[styles.planMeta, { color: theme.colors.red }]}>No free slot — adjust availability</Text>
                                                ) : (
                                                    <>
                                                        <Text style={styles.planMeta}>{item.studyDateDisplay} · {item.startTime}–{item.endTime}</Text>
                                                        <Text style={styles.planDue}>Due in {item.daysUntilDue} day{item.daysUntilDue !== 1 ? 's' : ''}</Text>
                                                    </>
                                                )}
                                            </View>
                                        </View>
                                    );
                                })}
                                <View style={{ height: 8 }} />
                            </ScrollView>
                        )}
                        <View style={[styles.btnRow, { marginTop: 16 }]}>
                            <TouchableOpacity
                                style={[styles.btnOut, { flex: 1, justifyContent: 'center', paddingVertical: 12 }]}
                                onPress={() => setScheduleModalVisible(false)}
                            >
                                <Text style={{ fontFamily: theme.fonts.s, fontWeight: '500', color: theme.colors.ink2 }}>Close</Text>
                            </TouchableOpacity>
                            {studyPlan.some(i => !i.unscheduled) && (
                                <TouchableOpacity
                                    style={[styles.btnDark, { flex: 1, justifyContent: 'center', paddingVertical: 12 }]}
                                    onPress={addPlanToCalendar}
                                >
                                    <Text style={{ fontFamily: theme.fonts.s, fontWeight: '600', color: '#fff' }}>Add to Calendar</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>
                </View>
            </Modal>
            {/* Availability Modal */}
            <Modal visible={availabilityModalVisible} animationType="fade" transparent>
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalView, { maxHeight: '85%' }]}>
                        <Text style={styles.modalTitle}>Weekly Availability</Text>
                        <Text style={styles.instructions}>Set when you're free to study. The scheduler will only place blocks during these windows.</Text>
                        <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 380 }}>
                            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((dayName, i) => {
                                const avDay = availability[i] || { enabled: false, start: '15:30', end: '18:00' };
                                return (
                                    <View key={i} style={styles.avRow}>
                                        <View style={styles.avDayHeader}>
                                            <Text style={[styles.avDayName, avDay.enabled && styles.avDayNameActive]}>{dayName}</Text>
                                            <Switch
                                                value={avDay.enabled}
                                                onValueChange={val => setAvailability(prev => ({ ...prev, [i]: { ...prev[i], enabled: val } }))}
                                                trackColor={{ false: theme.colors.border2, true: theme.colors.accent + '55' }}
                                                thumbColor={avDay.enabled ? theme.colors.accent : theme.colors.ink3}
                                            />
                                        </View>
                                        {avDay.enabled && (
                                            <View style={styles.avTimeRow}>
                                                <View style={styles.avTimeGroup}>
                                                    <Text style={styles.avTimeLabel}>From</Text>
                                                    <TextInput
                                                        style={styles.avTimeInput}
                                                        value={avDay.start}
                                                        onChangeText={v => setAvailability(prev => ({ ...prev, [i]: { ...prev[i], start: v } }))}
                                                        placeholder="09:00"
                                                        placeholderTextColor={theme.colors.ink3}
                                                    />
                                                </View>
                                                <Text style={styles.avTimeSep}>—</Text>
                                                <View style={styles.avTimeGroup}>
                                                    <Text style={styles.avTimeLabel}>To</Text>
                                                    <TextInput
                                                        style={styles.avTimeInput}
                                                        value={avDay.end}
                                                        onChangeText={v => setAvailability(prev => ({ ...prev, [i]: { ...prev[i], end: v } }))}
                                                        placeholder="20:00"
                                                        placeholderTextColor={theme.colors.ink3}
                                                    />
                                                </View>
                                            </View>
                                        )}
                                    </View>
                                );
                            })}
                            <View style={{ height: 8 }} />
                        </ScrollView>
                        <View style={[styles.btnRow, { marginTop: 16 }]}>
                            <TouchableOpacity
                                style={[styles.btnOut, { flex: 1, justifyContent: 'center', paddingVertical: 12 }]}
                                onPress={() => setAvailabilityModalVisible(false)}
                            >
                                <Text style={{ fontFamily: theme.fonts.s, fontWeight: '500', color: theme.colors.ink2 }}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.btnDark, { flex: 1, justifyContent: 'center', paddingVertical: 12 }]}
                                onPress={() => {
                                    AsyncStorage.setItem('studyAvailability', JSON.stringify(availability));
                                    setAvailabilityModalVisible(false);
                                }}
                            >
                                <Text style={{ fontFamily: theme.fonts.s, fontWeight: '600', color: '#fff' }}>Save</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const getStyles = (theme) => StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.bg, paddingTop: 40 },
    mainLayout: { flex: 1, paddingHorizontal: HPAD },
    layoutWide: { flexDirection: 'row', gap: 30 },

    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 14 },
    title: { fontFamily: theme.fonts.d, fontSize: 32, fontWeight: '700', color: theme.colors.ink, letterSpacing: -0.5 },
    subtitle: { fontFamily: theme.fonts.m, fontSize: 10, color: theme.colors.ink3, textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 4 },
    btnRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
    btnDark: { backgroundColor: theme.colors.accent, flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 16, borderRadius: theme.radii.r, gap: 8 },
    btnDarkText: { color: '#fff', fontFamily: theme.fonts.s, fontSize: 14, fontWeight: '700' },
    saveButton: { backgroundColor: theme.colors.accent, padding: 16, borderRadius: theme.radii.lg, alignItems: 'center', marginTop: 20 },
    saveButtonText: { color: '#fff', fontFamily: theme.fonts.s, fontWeight: '700' },
    btnOut: { borderWidth: 1, borderColor: theme.colors.border2, padding: 10, borderRadius: theme.radii.r, alignItems: 'center', backgroundColor: theme.colors.surface },
    btnOutText: { color: theme.colors.ink, fontFamily: theme.fonts.s, fontSize: 14, fontWeight: '600' },

    legend: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radii.lg, padding: 16, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 20, marginBottom: 18 },
    legendTitle: { fontFamily: theme.fonts.m, fontSize: 10, color: theme.colors.ink3, letterSpacing: 2, textTransform: 'uppercase', marginRight: 4 },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    swatch: { width: 14, height: 14, borderRadius: 3, borderWidth: 1.5 },
    legendText: { fontFamily: theme.fonts.m, fontSize: 13, color: theme.colors.ink2, fontWeight: '500' },

    controlsRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 12 },
    ctrlBtn: { borderWidth: 1, borderColor: theme.colors.border2, padding: 5, borderRadius: theme.radii.r },
    monthText: { fontFamily: theme.fonts.d, fontSize: 18, fontWeight: '700', color: theme.colors.ink },

    daysRow: { flexDirection: 'row', marginBottom: 4 },
    dayText: { width: CELL_W, textAlign: 'center', fontFamily: theme.fonts.m, fontSize: 9, color: theme.colors.ink3, textTransform: 'uppercase', letterSpacing: 0.8 },

    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
    cell: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 5, padding: 4, overflow: 'hidden' },
    cellEmpty: { backgroundColor: theme.colors.surface2, opacity: 0.4 },
    cellToday: { borderColor: theme.colors.ink, borderWidth: 2 },
    cellNum: { fontFamily: theme.fonts.m, fontSize: 12, fontWeight: '700', color: theme.colors.ink2, marginBottom: 4 },
    numToday: { color: theme.colors.ink, fontWeight: '900' },
    cellSelected: { backgroundColor: theme.colors.surface2, borderColor: theme.colors.ink, borderWidth: 1.5 },
    event: { paddingVertical: 2, paddingHorizontal: 4, borderRadius: 4, marginBottom: 3 },
    eventText: { fontFamily: theme.fonts.s, fontSize: 10, fontWeight: '700' },
    moreText: { fontFamily: theme.fonts.m, fontSize: 9, color: theme.colors.ink3, fontWeight: '600', marginTop: 2 },

    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 24 },
    modalView: { width: '100%', maxWidth: 400, backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg, padding: 24, borderWidth: 1, borderColor: theme.colors.border },
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
    removeBtnText: { fontFamily: theme.fonts.s, fontSize: 11, fontWeight: '600', color: theme.colors.red },

    emptySidebar: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
    emptySidebarText: { fontFamily: theme.fonts.m, fontSize: 12, color: theme.colors.ink3 },

    sidebarTask: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
    sidebarTaskActive: { backgroundColor: theme.colors.surface2 },
    sidebarTaskDone: { opacity: 0.5 },
    checkbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 2, borderColor: theme.colors.border2, alignItems: 'center', justifyContent: 'center' },
    checkboxActive: { backgroundColor: theme.colors.ink, borderColor: theme.colors.ink },
    checkboxDone: { backgroundColor: theme.colors.green, borderColor: theme.colors.green },
    checkboxInner: { width: 8, height: 8, borderRadius: 1.5, backgroundColor: '#fff' },
    sidebarTaskTitle: { fontFamily: theme.fonts.s, fontSize: 16, fontWeight: '600', color: theme.colors.ink },
    sidebarTaskTitleDone: { textDecorationLine: 'line-through', color: theme.colors.ink3 },
    sidebarTaskMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
    miniSwatch: { width: 8, height: 8, borderRadius: 4 },
    sidebarTaskPrio: { fontFamily: theme.fonts.m, fontSize: 12, color: theme.colors.ink3, textTransform: 'uppercase', letterSpacing: 0.5 },
    sidebarBlockBtn: { padding: 10, borderRadius: 8, backgroundColor: theme.colors.surface2, borderWidth: 1, borderColor: theme.colors.border },

    // Study plan modal
    avShortcut: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6, backgroundColor: theme.colors.surface2, borderWidth: 1, borderColor: theme.colors.border },
    avShortcutText: { fontFamily: theme.fonts.m, fontSize: 10, color: theme.colors.ink3 },
    planItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
    planDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
    planTitle: { fontFamily: theme.fonts.s, fontSize: 14, fontWeight: '600', color: theme.colors.ink },
    planMeta: { fontFamily: theme.fonts.m, fontSize: 11, color: theme.colors.ink2, marginTop: 3 },
    planDue: { fontFamily: theme.fonts.m, fontSize: 10, color: theme.colors.ink3, marginTop: 2 },

    // Availability modal
    avRow: { borderBottomWidth: 1, borderBottomColor: theme.colors.border, paddingVertical: 12 },
    avDayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    avDayName: { fontFamily: theme.fonts.s, fontSize: 15, fontWeight: '600', color: theme.colors.ink3 },
    avDayNameActive: { color: theme.colors.ink },
    avTimeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
    avTimeGroup: { flex: 1 },
    avTimeLabel: { fontFamily: theme.fonts.m, fontSize: 9, color: theme.colors.ink3, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
    avTimeInput: { backgroundColor: theme.colors.surface2, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radii.r, paddingVertical: 8, paddingHorizontal: 10, fontFamily: theme.fonts.m, fontSize: 13, color: theme.colors.ink, textAlign: 'center' },
    avTimeSep: { fontFamily: theme.fonts.m, fontSize: 16, color: theme.colors.ink3, marginTop: 16 },
});
