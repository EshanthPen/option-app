import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ScrollView, Platform, Image } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
    User, Palette, Bell, Shield, CreditCard, Crown, Camera, Pencil,
    LogOut, Download, Eraser, Trash2, Check, Moon, Sun, Plus,
} from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { usePremium } from '../context/PremiumContext';
import { THEME_PRESETS } from '../utils/theme';
import WorkingHoursGraph from '../components/WorkingHoursGraph';
import { TopBar, Card, Button, Badge, Switch, SectionLabel, GradientCard, SEM } from '../components/DesignKit';

const TABS = [
    { id: 'account',       label: 'Account',       icon: User },
    { id: 'appearance',    label: 'Appearance',    icon: Palette },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'schedule',      label: 'Schedule',      icon: Camera }, // smart hours
    { id: 'privacy',       label: 'Privacy',       icon: Shield },
    { id: 'billing',       label: 'Billing',       icon: CreditCard },
];

export default function SettingsScreen({ navigation, isGuest, onSignOut }) {
    const { theme, toggleTheme, isDarkMode, themePreset, changePreset } = useTheme();
    const { isPro, subscription } = usePremium();
    const [tab, setTab] = useState('account');
    const [userName, setUserName] = useState('');
    const [userEmail, setUserEmail] = useState('');
    const [editingName, setEditingName] = useState(false);
    const [smartHours, setSmartHours] = useState({
        0: { start: 15, end: 22 }, 1: { start: 15, end: 22 },
        2: { start: 15, end: 22 }, 3: { start: 15, end: 22 },
        4: { start: 15, end: 22 }, 5: { start: 10, end: 23 },
        6: { start: 10, end: 22 },
    });

    const [notifs, setNotifs] = useState({
        grades: true, ai: true, focus: false, leaderboard: true, weekly: true,
    });

    const [privacyToggles, setPrivacyToggles] = useState({
        leaderboard: true, streak: true, aiHistory: false,
    });

    useEffect(() => {
        (async () => {
            const savedName = await AsyncStorage.getItem('userName');
            if (savedName) setUserName(savedName);
            const savedEmail = await AsyncStorage.getItem('userEmail');
            if (savedEmail) setUserEmail(savedEmail);

            const savedHours = await AsyncStorage.getItem('smartScheduleHours');
            if (savedHours) {
                try { setSmartHours(JSON.parse(savedHours)); } catch {}
            }

            const savedNotifs = await AsyncStorage.getItem('notifPrefs');
            if (savedNotifs) {
                try { setNotifs(JSON.parse(savedNotifs)); } catch {}
            }

            const savedPrivacy = await AsyncStorage.getItem('privacyPrefs');
            if (savedPrivacy) {
                try { setPrivacyToggles(JSON.parse(savedPrivacy)); } catch {}
            }
        })();
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

    const toggleNotif = async (key) => {
        const next = { ...notifs, [key]: !notifs[key] };
        setNotifs(next);
        await AsyncStorage.setItem('notifPrefs', JSON.stringify(next));
    };

    const togglePrivacy = async (key) => {
        const next = { ...privacyToggles, [key]: !privacyToggles[key] };
        setPrivacyToggles(next);
        await AsyncStorage.setItem('privacyPrefs', JSON.stringify(next));
    };

    const handleSignOut = () => {
        if (Platform.OS === 'web') {
            if (window.confirm('Sign out of all devices?')) onSignOut?.();
        } else {
            Alert.alert('Sign Out', 'Sign out of all devices?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Sign out', style: 'destructive', onPress: () => onSignOut?.() },
            ]);
        }
    };

    const initials = (userName || 'U').split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase();

    return (
        <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
            <TopBar title="Settings" subtitle={isPro ? 'Option Pro · all features unlocked' : 'Free plan'} />

            <ScrollView contentContainerStyle={{ paddingVertical: 28, paddingHorizontal: 32 }} showsVerticalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', gap: 28, maxWidth: 1200, alignSelf: 'center', width: '100%' }}>

                    {/* ── Tabs sidebar ── */}
                    <View style={{ width: 220, flexShrink: 0 }}>
                        {TABS.map((t) => {
                            const active = tab === t.id;
                            const Icon = t.icon;
                            return (
                                <TouchableOpacity
                                    key={t.id}
                                    onPress={() => setTab(t.id)}
                                    activeOpacity={0.7}
                                    style={{
                                        flexDirection: 'row', alignItems: 'center', gap: 10,
                                        padding: 12, marginBottom: 2,
                                        borderRadius: 10,
                                        backgroundColor: active ? theme.colors.surface : 'transparent',
                                        borderWidth: 1,
                                        borderColor: active ? theme.colors.border : 'transparent',
                                        ...(active ? theme.shadows.sm : {}),
                                    }}
                                >
                                    <Icon size={16} color={active ? theme.colors.ink : theme.colors.ink3} strokeWidth={active ? 2.4 : 2} />
                                    <Text style={{
                                        fontFamily: theme.fonts.s, fontSize: 13,
                                        fontWeight: active ? '600' : '500',
                                        color: active ? theme.colors.ink : theme.colors.ink2,
                                    }}>
                                        {t.label}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    {/* ── Content ── */}
                    <View style={{ flex: 1, minWidth: 0 }}>

                        {/* ── ACCOUNT (matches design exactly) ── */}
                        {tab === 'account' && (
                            <AccountTab
                                theme={theme}
                                userName={userName} setUserName={handleSaveName}
                                userEmail={userEmail}
                                initials={initials}
                                isPro={isPro} subscription={subscription}
                                isGuest={isGuest}
                                onSignOut={handleSignOut}
                            />
                        )}

                        {/* ── APPEARANCE ── */}
                        {tab === 'appearance' && (
                            <>
                                <Card padding={20} style={{ marginBottom: 16 }}>
                                    <Text style={{ fontFamily: theme.fonts.s, fontSize: 14, fontWeight: '600', color: theme.colors.ink, marginBottom: 4 }}>
                                        Color theme
                                    </Text>
                                    <Text style={{ fontFamily: theme.fonts.m, fontSize: 12, color: theme.colors.ink3, marginBottom: 14 }}>
                                        Changes the accent color and surface tones across the app.
                                    </Text>
                                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                                        {Object.entries(THEME_PRESETS).map(([key, preset]) => {
                                            const t = isDarkMode ? preset.dark : preset.light;
                                            const active = themePreset === key;
                                            return (
                                                <TouchableOpacity
                                                    key={key}
                                                    onPress={() => changePreset?.(key)}
                                                    activeOpacity={0.85}
                                                    style={{
                                                        width: '31%',
                                                        borderWidth: 2,
                                                        borderColor: active ? t.accent : theme.colors.border,
                                                        borderRadius: 12, overflow: 'hidden',
                                                        backgroundColor: t.bg,
                                                    }}
                                                >
                                                    <View style={{
                                                        padding: 12, paddingVertical: 10,
                                                        flexDirection: 'row', alignItems: 'center', gap: 8,
                                                        backgroundColor: t.surface,
                                                        borderBottomWidth: 1, borderBottomColor: t.border,
                                                    }}>
                                                        <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: t.accent }} />
                                                        <Text style={{ fontFamily: theme.fonts.s, fontSize: 12, fontWeight: '600', color: t.ink, flex: 1 }} numberOfLines={1}>
                                                            {preset.name}
                                                        </Text>
                                                        {active && <Check size={14} color={t.accent} strokeWidth={2.5} />}
                                                    </View>
                                                    <View style={{ padding: 10, flexDirection: 'row', gap: 4 }}>
                                                        {[t.surface, t.surface2, t.border, t.ink, t.accent].map((c, i) => (
                                                            <View key={i} style={{
                                                                width: 14, height: 14, borderRadius: 3,
                                                                backgroundColor: c,
                                                                borderWidth: 1, borderColor: t.border,
                                                            }} />
                                                        ))}
                                                    </View>
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </View>
                                </Card>

                                <Card padding={0} style={{ overflow: 'hidden' }}>
                                    <ToggleRow
                                        label="Dark mode"
                                        desc="Switch to dark surfaces and high-contrast text"
                                        on={isDarkMode}
                                        onToggle={toggleTheme}
                                    />
                                </Card>
                            </>
                        )}

                        {/* ── NOTIFICATIONS ── */}
                        {tab === 'notifications' && (
                            <Card padding={0} style={{ overflow: 'hidden' }}>
                                {[
                                    { key: 'grades',      label: 'Grade alerts',         desc: 'Notify when a new grade is posted or a class drops' },
                                    { key: 'ai',          label: 'AI suggestions',       desc: 'Smart nudges about what to study and when' },
                                    { key: 'focus',       label: 'Focus reminders',      desc: 'Remind you to start your daily focus session' },
                                    { key: 'leaderboard', label: 'Leaderboard updates',  desc: "Let me know when I'm passed or pass others" },
                                    { key: 'weekly',      label: 'Weekly summary',       desc: "Sunday email with the week's performance" },
                                ].map((r, i, arr) => (
                                    <ToggleRow
                                        key={r.key}
                                        label={r.label}
                                        desc={r.desc}
                                        on={notifs[r.key]}
                                        onToggle={() => toggleNotif(r.key)}
                                        isLast={i === arr.length - 1}
                                    />
                                ))}
                            </Card>
                        )}

                        {/* ── SCHEDULE (Smart Hours) ── */}
                        {tab === 'schedule' && (
                            <Card padding={20}>
                                <Text style={{ fontFamily: theme.fonts.s, fontSize: 14, fontWeight: '600', color: theme.colors.ink, marginBottom: 4 }}>
                                    Smart scheduling hours
                                </Text>
                                <Text style={{ fontFamily: theme.fonts.m, fontSize: 12, color: theme.colors.ink3, marginBottom: 16 }}>
                                    Drag the nodes to set your available hours per day. Tasks will only be scheduled between start and end times.
                                </Text>
                                <View style={{ marginBottom: 16 }}>
                                    <WorkingHoursGraph data={smartHours} onChange={setSmartHours} theme={theme} />
                                </View>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: SEM.green }} />
                                        <Text style={{ fontFamily: theme.fonts.m, fontSize: 12, color: theme.colors.ink3 }}>Start</Text>
                                    </View>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: SEM.blue }} />
                                        <Text style={{ fontFamily: theme.fonts.m, fontSize: 12, color: theme.colors.ink3 }}>End</Text>
                                    </View>
                                </View>
                                <Button variant="primary" onPress={handleSaveWorkingHours}>Save hours</Button>
                            </Card>
                        )}

                        {/* ── PRIVACY ── */}
                        {tab === 'privacy' && (
                            <>
                                <Card padding={0} style={{ overflow: 'hidden', marginBottom: 16 }}>
                                    {[
                                        { key: 'leaderboard', label: 'Show me on leaderboard', desc: 'Others see your name; hide to go anonymous' },
                                        { key: 'streak',      label: 'Share focus streak',     desc: 'Friends see your daily streak' },
                                        { key: 'aiHistory',   label: 'Allow AI to use chat history', desc: 'Improves tutor responses over time' },
                                    ].map((r, i, arr) => (
                                        <ToggleRow
                                            key={r.key}
                                            label={r.label}
                                            desc={r.desc}
                                            on={privacyToggles[r.key]}
                                            onToggle={() => togglePrivacy(r.key)}
                                            isLast={i === arr.length - 1}
                                        />
                                    ))}
                                </Card>

                                <Card padding={20}>
                                    <Text style={{ fontFamily: theme.fonts.s, fontSize: 14, fontWeight: '600', color: theme.colors.ink, marginBottom: 10 }}>
                                        Data controls
                                    </Text>
                                    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                                        <Button variant="secondary" size="sm" icon={Download}>Download my data</Button>
                                        <Button variant="secondary" size="sm" icon={Eraser} onPress={async () => {
                                            await AsyncStorage.removeItem('aiChatHistory');
                                            Alert.alert('Cleared', 'AI chat history cleared.');
                                        }}>Clear chat history</Button>
                                        <Button variant="danger" size="sm" icon={Trash2}>Delete account</Button>
                                    </View>
                                </Card>
                            </>
                        )}

                        {/* ── BILLING ── */}
                        {tab === 'billing' && (
                            <>
                                <GradientCard
                                    colors={[theme.colors.ink, SEM.purple]}
                                    angle={135}
                                    style={{
                                        padding: 24, marginBottom: 16,
                                        borderRadius: theme.radii.lg,
                                    }}
                                >
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                        <Crown size={20} color={SEM.gold} strokeWidth={2.5} />
                                        <Text style={{ fontFamily: theme.fonts.s, fontSize: 13, fontWeight: '700', color: SEM.gold, textTransform: 'uppercase', letterSpacing: 1 }}>
                                            {isPro ? 'Option Premium' : 'Free Plan'}
                                        </Text>
                                    </View>
                                    <Text style={{ fontFamily: theme.fonts.s, fontSize: 16, fontWeight: '600', color: '#fff', marginTop: 10, lineHeight: 22 }}>
                                        {isPro
                                            ? subscription?.isBeta
                                                ? "You're a beta tester — Pro access free until Sept 1, 2026."
                                                : "You're on Pro — thanks for supporting Option!"
                                            : "Upgrade to unlock the AI Tutor, unlimited tasks, and more."}
                                    </Text>
                                    {isPro ? (
                                        <View style={{
                                            flexDirection: 'row', gap: 24, marginTop: 18,
                                            padding: 14, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 10,
                                        }}>
                                            <View>
                                                <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: 1 }}>Plan</Text>
                                                <Text style={{ fontFamily: theme.fonts.s, fontSize: 14, fontWeight: '600', color: '#fff', marginTop: 4 }}>
                                                    {subscription?.plan_id === 'beta' ? 'Beta' : subscription?.plan_id || 'Annual'}
                                                </Text>
                                            </View>
                                            {subscription?.current_period_end && (
                                                <View>
                                                    <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: 1 }}>Renews</Text>
                                                    <Text style={{ fontFamily: theme.fonts.s, fontSize: 14, fontWeight: '600', color: '#fff', marginTop: 4 }}>
                                                        {new Date(subscription.current_period_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                                    </Text>
                                                </View>
                                            )}
                                        </View>
                                    ) : (
                                        <View style={{ marginTop: 16 }}>
                                            <Button variant="gold" onPress={() => navigation?.navigate('Premium')}>
                                                Upgrade to Pro
                                            </Button>
                                        </View>
                                    )}
                                </GradientCard>

                                {isPro && (
                                    <Card padding={0} style={{ overflow: 'hidden' }}>
                                        <View style={{
                                            padding: 14, paddingHorizontal: 20,
                                            borderBottomWidth: 1, borderBottomColor: theme.colors.border,
                                            backgroundColor: theme.colors.surface2 + '60',
                                        }}>
                                            <Text style={{ fontFamily: theme.fonts.s, fontSize: 13, fontWeight: '600', color: theme.colors.ink }}>
                                                Billing history
                                            </Text>
                                        </View>
                                        {subscription?.isBeta ? (
                                            <View style={{ padding: 20 }}>
                                                <Text style={{ fontFamily: theme.fonts.m, fontSize: 13, color: theme.colors.ink3, textAlign: 'center' }}>
                                                    No charges — beta tester access.
                                                </Text>
                                            </View>
                                        ) : (
                                            <View style={{ padding: 20 }}>
                                                <Text style={{ fontFamily: theme.fonts.m, fontSize: 13, color: theme.colors.ink3, textAlign: 'center' }}>
                                                    Manage billing in your Stripe portal.
                                                </Text>
                                                <View style={{ marginTop: 12, alignItems: 'center' }}>
                                                    <Button variant="secondary" size="sm">Open billing portal</Button>
                                                </View>
                                            </View>
                                        )}
                                    </Card>
                                )}
                            </>
                        )}
                    </View>
                </View>
            </ScrollView>
        </View>
    );
}

function ToggleRow({ label, desc, on, onToggle, isLast }) {
    const { theme } = useTheme();
    return (
        <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 14,
            paddingHorizontal: 20, paddingVertical: 14,
            borderBottomWidth: isLast ? 0 : 1,
            borderBottomColor: theme.colors.border,
        }}>
            <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: theme.fonts.s, fontSize: 13, fontWeight: '500', color: theme.colors.ink }}>
                    {label}
                </Text>
                <Text style={{ fontFamily: theme.fonts.m, fontSize: 11, color: theme.colors.ink3, marginTop: 2 }}>
                    {desc}
                </Text>
            </View>
            <Switch on={on} onToggle={onToggle} />
        </View>
    );
}

// ── Account Tab (matches design exactly) ───────────────────────
function AccountTab({ theme, userName, setUserName, userEmail, initials, isPro, subscription, isGuest, onSignOut }) {
    const [editingField, setEditingField] = React.useState(null);
    const [draftValue, setDraftValue] = React.useState('');
    const [profileFields, setProfileFields] = React.useState({
        fullName: '',
        email: '',
        phone: '',
        school: '',
        gradeLevel: '',
        graduation: '',
    });

    React.useEffect(() => {
        (async () => {
            const stored = await AsyncStorage.getItem('@profile_extended');
            const next = stored ? JSON.parse(stored) : {};
            setProfileFields({
                fullName: next.fullName || userName || '',
                email: next.email || userEmail || '',
                phone: next.phone || '',
                school: next.school || '',
                gradeLevel: next.gradeLevel || '',
                graduation: next.graduation || '',
            });
        })();
    }, [userName, userEmail]);

    const startEdit = (key) => {
        setEditingField(key);
        setDraftValue(profileFields[key] || '');
    };

    const commitEdit = async () => {
        const next = { ...profileFields, [editingField]: draftValue };
        setProfileFields(next);
        await AsyncStorage.setItem('@profile_extended', JSON.stringify(next));
        // Mirror name → top-level userName
        if (editingField === 'fullName') {
            setUserName(draftValue);
        }
        setEditingField(null);
    };

    const ROWS = [
        { key: 'fullName',   label: 'Full name',   placeholder: 'Your full name' },
        { key: 'email',      label: 'Email',       placeholder: 'name@school.edu' },
        { key: 'phone',      label: 'Phone',       placeholder: '(555) 123-4567' },
        { key: 'school',     label: 'School',      placeholder: 'Your high school' },
        { key: 'gradeLevel', label: 'Grade level', placeholder: 'e.g. 11th · Junior' },
        { key: 'graduation', label: 'Graduation',  placeholder: 'e.g. Class of 2027' },
    ];

    return (
        <>
            {/* Profile header card */}
            <Card padding={20} style={{ marginBottom: 14 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                    <View style={{
                        width: 64, height: 64, borderRadius: 32,
                        backgroundColor: theme.colors.ink,
                        alignItems: 'center', justifyContent: 'center',
                    }}>
                        <Text style={{ fontFamily: theme.fonts.d, fontSize: 22, fontWeight: '700', color: theme.colors.bg }}>
                            {initials}
                        </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={{ fontFamily: theme.fonts.d, fontSize: 18, fontWeight: '700', color: theme.colors.ink }}>
                            {profileFields.fullName || userName || 'Set your name'}
                        </Text>
                        <Text style={{ fontFamily: theme.fonts.m, fontSize: 13, color: theme.colors.ink3, marginTop: 2 }} numberOfLines={1}>
                            {[profileFields.email || userEmail, profileFields.gradeLevel, profileFields.school]
                                .filter(Boolean).join(' · ') || 'Add your details below'}
                        </Text>
                        <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
                            {isPro
                                ? <Badge color={SEM.purple}>{subscription?.isBeta ? 'Beta Tester' : 'Premium'}</Badge>
                                : <Badge color={theme.colors.ink3}>Free</Badge>
                            }
                            {!isGuest && <Badge color={SEM.green}>Verified student</Badge>}
                        </View>
                    </View>
                    <Button variant="secondary" size="sm" icon={Camera}>Change photo</Button>
                </View>
            </Card>

            {/* Detail rows card */}
            <Card padding={0} style={{ marginBottom: 14, overflow: 'hidden' }}>
                {ROWS.map((r, i, arr) => {
                    const isEditing = editingField === r.key;
                    const value = profileFields[r.key];
                    return (
                        <View key={r.key} style={{
                            flexDirection: 'row', alignItems: 'center',
                            paddingHorizontal: 20, paddingVertical: 14,
                            borderBottomWidth: i < arr.length - 1 ? 1 : 0,
                            borderBottomColor: theme.colors.border,
                        }}>
                            <Text style={{ fontFamily: theme.fonts.m, fontSize: 13, color: theme.colors.ink3, width: 140 }}>
                                {r.label}
                            </Text>
                            {isEditing ? (
                                <TextInput
                                    autoFocus
                                    value={draftValue}
                                    onChangeText={setDraftValue}
                                    onBlur={commitEdit}
                                    onSubmitEditing={commitEdit}
                                    placeholder={r.placeholder}
                                    placeholderTextColor={theme.colors.ink4}
                                    style={{
                                        flex: 1, fontFamily: theme.fonts.s, fontSize: 13,
                                        color: theme.colors.ink, paddingVertical: 0,
                                        ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
                                    }}
                                />
                            ) : (
                                <Text style={{
                                    flex: 1, fontFamily: theme.fonts.s, fontSize: 13,
                                    color: value ? theme.colors.ink : theme.colors.ink4,
                                }}>
                                    {value || r.placeholder}
                                </Text>
                            )}
                            <TouchableOpacity onPress={() => isEditing ? commitEdit() : startEdit(r.key)} style={{ padding: 4 }}>
                                <Pencil size={13} color={theme.colors.ink3} />
                            </TouchableOpacity>
                        </View>
                    );
                })}
            </Card>

            {!isGuest && (
                <Button variant="danger" icon={LogOut} onPress={onSignOut}>Sign out of all devices</Button>
            )}
        </>
    );
}
