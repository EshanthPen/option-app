import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Dimensions } from 'react-native';
import { supabase } from '../supabaseClient';
import { colors, fonts, sizes } from '../theme';

const { width } = Dimensions.get('window');

export default function CalendarScreen() {
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);

    const today = new Date();
    const [currentMonth, setCurrentMonth] = useState(today.getMonth());
    const [currentYear, setCurrentYear] = useState(today.getFullYear());
    const [selectedDate, setSelectedDate] = useState(today.getDate());

    useEffect(() => {
        fetchTasks();
    }, []);

    const fetchTasks = async () => {
        setLoading(true);
        const { data, error } = await supabase.from('tasks').select('*').order('created_at', { ascending: false });
        if (data) setTasks(data);
        if (error) console.error("Error fetching tasks:", error);
        setLoading(false);
    };

    // Calendar Math
    const getDaysInMonth = (month, year) => new Date(year, month + 1, 0).getDate();
    const getFirstDayOfMonth = (month, year) => new Date(year, month, 1).getDay(); // 0-6

    const daysInMonth = getDaysInMonth(currentMonth, currentYear);
    const firstDay = getFirstDayOfMonth(currentMonth, currentYear);

    const padDays = Array.from({ length: firstDay }, () => null);
    const monthDays = Array.from({ length: daysInMonth }, (_, i) => i + 1);
    const calendarGrid = [...padDays, ...monthDays];
    const weekLabels = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

    const timeBlocks = [
        { time: '09:00 AM', slot: 0 },
        { time: '11:00 AM', slot: 1 },
        { time: '01:00 PM', slot: 2 },
        { time: '03:00 PM', slot: 3 },
        { time: '05:00 PM', slot: 4 },
        { time: '07:00 PM', slot: 5 }
    ];

    // Distribute Supabase tasks deterministically across the month timeline
    const getTaskForSlot = (date, slotIndex) => {
        if (!tasks || tasks.length === 0) return null;
        const seed = date * 7 + slotIndex;
        // About a 30% chance for a slot to have a task
        if (seed % 3 !== 0) return null;
        return tasks[seed % tasks.length];
    };

    // Calculate Eisenhower Matrix Urgency Colors & Labels
    const getUrgencyMeta = (task) => {
        const u = task.urgency || 5;
        const i = task.importance || 5;
        if (u > 5 && i > 5) return { color: colors.red, label: "Urgent Priority (Do First)" };
        if (u <= 5 && i > 5) return { color: colors.blue, label: "Scheduled Priority (Important)" };
        if (u > 5 && i <= 5) return { color: colors.orange, label: "Medium Priority (Delegate)" };
        return { color: colors.green, label: "Low Priority (Eliminate)" };
    };

    const hasTasksOnDate = (date) => {
        if (!tasks || tasks.length === 0) return false;
        // Check all time slots for this date to see if there's any task assigned
        for (let s = 0; s < timeBlocks.length; s++) {
            if ((date * 7 + s) % 3 === 0) return true;
        }
        return false;
    };

    return (
        <View style={styles.container}>
            <View style={styles.pageHeader}>
                <Text style={styles.header}>Calendar</Text>
                <Text style={styles.subtitle}>Monthly Overview & Daily Agenda</Text>
            </View>

            {/* MONTH CALENDAR GRID */}
            <View style={styles.calendarContainer}>
                <View style={styles.monthHeaderRow}>
                    <Text style={styles.monthTitle}>{monthNames[currentMonth]} {currentYear}</Text>
                </View>

                <View style={styles.weekLabelRow}>
                    {weekLabels.map((lbl, i) => (
                        <View key={i} style={styles.weekLabelCell}>
                            <Text style={styles.weekLabelText}>{lbl}</Text>
                        </View>
                    ))}
                </View>

                <View style={styles.daysGrid}>
                    {calendarGrid.map((day, ix) => {
                        if (day === null) {
                            return <View key={`pad-${ix}`} style={styles.dayCell} />;
                        }
                        const isSelected = selectedDate === day;
                        const isToday = day === today.getDate() && currentMonth === today.getMonth() && currentYear === today.getFullYear();
                        const hasEvents = hasTasksOnDate(day);

                        return (
                            <TouchableOpacity
                                key={`day-${day}`}
                                style={[styles.dayCell, isSelected && styles.dayCellSelected, isToday && !isSelected && styles.dayCellToday]}
                                onPress={() => setSelectedDate(day)}
                            >
                                <Text style={[styles.dayText, isSelected && styles.textInverse, isToday && !isSelected && styles.textToday]}>{day}</Text>
                                <View style={[styles.eventDot, hasEvents && { backgroundColor: isSelected ? colors.surface : colors.ink }]} />
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </View>

            {/* DAILY AGENDA VIEW */}
            <View style={styles.agendaHeader}>
                <Text style={styles.agendaTitle}>{monthNames[currentMonth]} {selectedDate} Agenda</Text>
            </View>

            <ScrollView style={styles.agendaContainer} showsVerticalScrollIndicator={false}>
                {loading ? (
                    <ActivityIndicator size="large" color={colors.ink} style={{ marginTop: 50 }} />
                ) : (
                    timeBlocks.map((block, i) => {
                        const task = getTaskForSlot(selectedDate, block.slot);
                        return (
                            <View key={i} style={styles.timeBlock}>
                                <View style={styles.timeLine}>
                                    <Text style={styles.timeText}>{block.time}</Text>
                                    <View style={styles.timeDot} />
                                </View>

                                <View style={styles.eventSlot}>
                                    {task ? (
                                        <View style={[styles.eventCard, { borderLeftColor: getUrgencyMeta(task).color }]}>
                                            <View style={styles.eventHeader}>
                                                <Text style={styles.eventTitle} numberOfLines={1}>{task.title}</Text>
                                                <View style={[styles.urgencyBadge, { backgroundColor: getUrgencyMeta(task).color + '15' }]}>
                                                    <Text style={[styles.urgencyLabel, { color: getUrgencyMeta(task).color }]}>{getUrgencyMeta(task).label}</Text>
                                                </View>
                                            </View>
                                            <Text style={styles.eventDuration}>
                                                {task.duration || 60} mins • Urgency: {task.urgency || 5} • Imp: {task.importance || 5}
                                            </Text>
                                        </View>
                                    ) : (
                                        <View style={styles.emptySlot}>
                                            <Text style={styles.emptySlotText}>No event scheduled</Text>
                                        </View>
                                    )}
                                </View>
                            </View>
                        );
                    })
                )}
                <View style={{ height: 100 }} />
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg, paddingTop: 50 },
    pageHeader: { paddingHorizontal: 20, marginBottom: 15 },
    header: { fontFamily: fonts.displayBold, fontSize: 32, marginBottom: 4, color: colors.ink, letterSpacing: -0.5 },
    subtitle: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', color: colors.ink3 },

    // Calendar Grid Styles
    calendarContainer: { paddingHorizontal: 20, marginBottom: 15, backgroundColor: colors.surface, paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: colors.border },
    monthHeaderRow: { alignItems: 'center', marginVertical: 10 },
    monthTitle: { fontFamily: fonts.sansSemiBold, fontSize: 16, color: colors.ink, textTransform: 'uppercase', letterSpacing: 1 },

    weekLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
    weekLabelCell: { width: (width - 40) / 7, alignItems: 'center' },
    weekLabelText: { fontFamily: fonts.monoMedium, fontSize: 10, color: colors.ink3 },

    daysGrid: { flexDirection: 'row', flexWrap: 'wrap' },
    dayCell: { width: (width - 40) / 7, height: 45, justifyContent: 'center', alignItems: 'center', borderRadius: sizes.radius, marginVertical: 2 },
    dayCellSelected: { backgroundColor: colors.ink },
    dayCellToday: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },

    dayText: { fontFamily: fonts.sansMedium, fontSize: 14, color: colors.ink },
    textInverse: { color: colors.surface },
    textToday: { color: colors.blue },

    eventDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: 'transparent', marginTop: 3 }, // Invisible placeholder

    // Agenda Styles
    agendaHeader: { paddingHorizontal: 20, paddingBottom: 10 },
    agendaTitle: { fontFamily: fonts.sansSemiBold, fontSize: 14, color: colors.ink2, textTransform: 'uppercase', letterSpacing: 1 },

    agendaContainer: { flex: 1, paddingHorizontal: 20 },
    timeBlock: { flexDirection: 'row', minHeight: 90 }, // slightly taller for extra urgency text

    timeLine: { width: 70, alignItems: 'flex-end', paddingRight: 15, borderRightWidth: 1, borderRightColor: colors.border, position: 'relative' },
    timeText: { fontFamily: fonts.monoMedium, fontSize: 11, color: colors.ink3, marginTop: 15 },
    timeDot: { position: 'absolute', right: -4, top: 19, width: 7, height: 7, borderRadius: 4, backgroundColor: colors.border2 },

    eventSlot: { flex: 1, paddingLeft: 15, paddingBottom: 20 },
    eventCard: { backgroundColor: colors.surface, padding: 15, borderRadius: sizes.radius, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, elevation: 2, borderLeftWidth: 4, borderWidth: 1, borderColor: colors.border },

    eventHeader: { marginBottom: 6 },
    eventTitle: { fontFamily: fonts.sansSemiBold, fontSize: 15, color: colors.ink, marginBottom: 4 },
    urgencyBadge: { alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
    urgencyLabel: { fontFamily: fonts.monoMedium, fontSize: 9, textTransform: 'uppercase' },

    eventDuration: { fontFamily: fonts.sans, fontSize: 12, color: colors.ink2 },

    emptySlot: { flex: 1, marginTop: 15, padding: 10 },
    emptySlotText: { fontFamily: fonts.sans, fontSize: 13, color: colors.ink4, fontStyle: 'italic' }
});
