import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ScrollView, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Moon, Sun, Crown, ChevronRight } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { usePremium } from '../context/PremiumContext';
import WorkingHoursGraph from '../components/WorkingHoursGraph';

export default function SettingsScreen({ navigation }) {
    const { theme, toggleTheme, isDarkMode } = useTheme();
    const { isPro } = usePremium();
    const styles = getStyles(theme);
    const [userName, setUserName] = useState('');

    const [smartHours, setSmartHours] = useState({
        0: { start: 15, end: 22 },
        1: { start: 15, end: 22 },
        2: { start: 15, end: 22 },
        3: { start: 15, end: 22 },
        4: { start: 15, end: 22 },
        5: { start: 10, end: 23 },
        6: { start: 10, end: 22 },
    });

    useEffect(() => {
        const loadSettings = async () => {
            const savedName = await AsyncStorage.getItem('userName');
            if (savedName) setUserName(savedName);

            const savedHours = await AsyncStorage.getItem('smartScheduleHours');
            if (savedHours) {
                try { setSmartHours(JSON.parse(savedHours)); } catch (e) { console.error(e); }
            } else {
                const oldStart = await AsyncStorage.getItem('workingStartHour');
                const oldEnd = await AsyncStorage.getItem('workingEndHour');
                if (oldStart && oldEnd) {
                    const s = parseInt(oldStart) || 15;
                    const e = parseInt(oldEnd) || 22;
                    setSmartHours({ 0: { start: s, end: e }, 1: { start: s, end: e }, 2: { start: s, end: e }, 3: { start: s, end: e }, 4: { start: s, end: e }, 5: { start: s, end: e }, 6: { start: s, end: e } });
                }
            }
        };
        loadSettings();
    }, []);

    const handleSaveName = async (name) => {
        setUserName(name);
        await AsyncStorage.setItem('userName', name);
    };

    const handleSaveWorkingHours = async () => {
        try {
            await AsyncStorage.setItem('smartScheduleHours', JSON.stringify(smartHours));
            if (Platform.OS === 'web') window.alert('Smart Scheduling hours saved.');
            else Alert.alert('Saved!', 'Smart Scheduling hours updated.');
        } catch (error) { console.error(error); }
    };

    return (
        <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
            <View style={styles.headerContainer}>
                <Text style={styles.header}>Settings</Text>
                <Text style={styles.subtitle}>Preferences & configuration</Text>
            </View>

            {/* Premium Upgrade Card */}
            {!isPro && (
                <TouchableOpacity
                    style={{
                        backgroundColor: 'rgba(255, 184, 0, 0.08)',
                        borderRadius: 14,
                        padding: 16,
                        marginBottom: 20,
                        borderWidth: 1,
                        borderColor: 'rgba(255, 184, 0, 0.2)',
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                    }}
                    onPress={() => navigation?.navigate('Premium')}
                    activeOpacity={0.7}
                >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        <View style={{
                            width: 40, height: 40, borderRadius: 12,
                            backgroundColor: 'rgba(255, 184, 0, 0.15)',
                            justifyContent: 'center', alignItems: 'center',
                        }}>
                            <Crown size={20} color="#FFB800" />
                        </View>
                        <View>
                            <Text style={{ fontSize: 15, fontWeight: '700', color: theme.colors.ink, fontFamily: theme.fonts.s }}>
                                Upgrade to Pro
                            </Text>
                            <Text style={{ fontSize: 12, color: theme.colors.ink3, fontFamily: theme.fonts.m, marginTop: 2 }}>
                                Unlock all features · 7-day free trial
                            </Text>
                        </View>
                    </View>
                    <ChevronRight size={18} color="#FFB800" />
                </TouchableOpacity>
            )}

            {isPro && (
                <View style={{
                    flexDirection: 'row', alignItems: 'center', gap: 8,
                    marginBottom: 20, paddingHorizontal: 4,
                }}>
                    <Crown size={16} color="#FFB800" />
                    <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFB800', fontFamily: theme.fonts.s }}>
                        Option Pro Active
                    </Text>
                </View>
            )}

            {/* Profile */}
            <Text style={styles.sectionTitle}>Profile</Text>
            <View style={styles.card}>
                <Text style={styles.label}>Display Name</Text>
                <TextInput
                    style={styles.input}
                    placeholder="What should we call you?"
                    placeholderTextColor={theme.colors.ink3}
                    value={userName}
                    onChangeText={handleSaveName}
                />
            </View>

            {/* Appearance */}
            <Text style={styles.sectionTitle}>Appearance</Text>
            <TouchableOpacity style={styles.settingRow} onPress={toggleTheme} activeOpacity={0.7}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={[styles.iconBox, { backgroundColor: theme.colors.surface2 }]}>
                        {isDarkMode ? <Moon size={20} color={theme.colors.purple} /> : <Sun size={20} color={theme.colors.orange} />}
                    </View>
                    <View>
                        <Text style={styles.settingLabel}>Dark Mode</Text>
                        <Text style={styles.settingSub}>{isDarkMode ? 'Enabled' : 'Disabled'}</Text>
                    </View>
                </View>
                <View style={[styles.toggleContainer, isDarkMode && { backgroundColor: theme.colors.accent }]}>
                    <View style={[styles.toggleCircle, isDarkMode && { transform: [{ translateX: 20 }] }]} />
                </View>
            </TouchableOpacity>

            {/* Smart Scheduling */}
            <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Smart Scheduling</Text>
            <View style={styles.card}>
                <Text style={styles.cardDesc}>Drag the nodes to set your available hours per day. Tasks will only be scheduled between start and end times.</Text>
                <View style={{ marginTop: 16, marginBottom: 10 }}>
                    <WorkingHoursGraph data={smartHours} onChange={setSmartHours} theme={theme} />
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: theme.colors.green }} />
                        <Text style={styles.legendText}>Start</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: theme.colors.blue }} />
                        <Text style={styles.legendText}>End</Text>
                    </View>
                </View>
                <TouchableOpacity style={styles.primaryBtn} onPress={handleSaveWorkingHours}>
                    <Text style={styles.primaryBtnText}>Save Hours</Text>
                </TouchableOpacity>
            </View>

            <View style={{ height: 60 }} />
        </ScrollView>
    );
}

const getStyles = (theme) => StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.bg, paddingTop: 40, paddingHorizontal: 20 },
    headerContainer: { marginBottom: 24 },
    header: { fontFamily: theme.fonts.d, fontSize: 32, fontWeight: '700', color: theme.colors.ink, letterSpacing: -0.5 },
    subtitle: { fontFamily: theme.fonts.m, fontSize: 13, color: theme.colors.ink3, marginTop: 4 },

    sectionTitle: { fontFamily: theme.fonts.m, fontSize: 10, color: theme.colors.ink3, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10 },

    card: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radii.lg, padding: 20, marginBottom: 16, ...theme.shadows.sm },
    cardTitle: { fontFamily: theme.fonts.s, fontSize: 16, fontWeight: '600', color: theme.colors.ink },
    cardDesc: { fontFamily: theme.fonts.m, fontSize: 13, color: theme.colors.ink3, lineHeight: 18 },

    label: { fontFamily: theme.fonts.m, fontSize: 11, color: theme.colors.ink3, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 },
    input: { backgroundColor: theme.colors.surface2, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radii.r, padding: 12, fontFamily: theme.fonts.m, fontSize: 13, color: theme.colors.ink },

    settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: theme.colors.surface, padding: 16, borderRadius: theme.radii.lg, borderWidth: 1, borderColor: theme.colors.border, marginBottom: 12, ...theme.shadows.sm },
    iconBox: { width: 40, height: 40, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
    settingLabel: { fontFamily: theme.fonts.s, fontSize: 16, fontWeight: '600', color: theme.colors.ink },
    settingSub: { fontFamily: theme.fonts.m, fontSize: 13, color: theme.colors.ink3, marginTop: 2 },
    toggleContainer: { width: 44, height: 24, borderRadius: 12, backgroundColor: theme.colors.surface2, padding: 2, justifyContent: 'center' },
    toggleCircle: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 2, elevation: 1 },

    legendText: { fontFamily: theme.fonts.m, fontSize: 12, color: theme.colors.ink3 },

    primaryBtn: { backgroundColor: theme.colors.ink, borderRadius: theme.radii.r, paddingVertical: 12, paddingHorizontal: 20, alignItems: 'center', ...theme.shadows.sm },
    primaryBtnText: { fontFamily: theme.fonts.s, fontSize: 14, fontWeight: '600', color: theme.colors.bg },
});
