import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Home, CalendarDays, BookOpen, Settings, Timer, Trophy, Plug, Crown, Sparkles, ChevronLeft, ChevronRight } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DashboardScreen from '../screens/DashboardScreen';
import MatrixScreen from '../screens/MatrixScreen';
import GradebookScreen from '../screens/GradebookScreen';
import SettingsScreen from '../screens/SettingsScreen';
import ScreentimeScreen from '../screens/ScreentimeScreen';
import LeaderboardScreen from '../screens/LeaderboardScreen';
import IntegrationsScreen from '../screens/IntegrationsScreen';
import PremiumScreen from '../screens/PremiumScreen';
import AIAssistantScreen from '../screens/AIAssistantScreen';
import { useTheme } from '../context/ThemeContext';
import { usePremium } from '../context/PremiumContext';
import { supabase } from '../supabaseClient';

const Tab = createBottomTabNavigator();

const isWeb = typeof window !== 'undefined' && Dimensions.get('window').width > 768;

// Design order: Dashboard / AI Tutor / Gradebook / Calendar / Focus / Leaderboard
const WORKSPACE_ITEMS = [
    { name: 'Home',         label: 'Dashboard',  icon: Home },
    { name: 'AI',           label: 'AI Tutor',   icon: Sparkles, highlight: true },
    { name: 'Gradebook',    label: 'Gradebook',  icon: BookOpen },
    { name: 'Calendar',     label: 'Calendar',   icon: CalendarDays },
    { name: 'Focus',        label: 'Focus',      icon: Timer },
    { name: 'Leaderboard',  label: 'Leaderboard',icon: Trophy },
];

const ACCOUNT_ITEMS = [
    { name: 'Integrations', label: 'Integrations',icon: Plug },
    { name: 'Premium',      label: 'Upgrade',     icon: Crown, highlight: true },
    { name: 'Settings',     label: 'Settings',    icon: Settings },
];

const COLLAPSE_KEY = '@sidebarCollapsed';

function CustomSidebar({ state, navigation, collapsed, setCollapsed, userName, userEmail }) {
    const { theme } = useTheme();
    const { isPro, subscription } = usePremium();

    const initials = (userName || 'U')
        .split(' ').filter(Boolean).map(s => s[0]).join('').slice(0, 2).toUpperCase() || 'U';

    const proLabel = subscription?.isBeta ? 'Beta' : isPro ? 'Premium' : 'Free';
    const proColor = isPro ? '#7C3AED' : theme.colors.ink3;

    const renderItem = (n) => {
        const routeIndex = state.routes.findIndex(r => r.name === n.name);
        if (routeIndex === -1) return null;
        const isFocused = state.index === routeIndex;
        const route = state.routes[routeIndex];

        const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name);
        };

        const iconColor = n.highlight && !isFocused
            ? '#FFB800'
            : isFocused
            ? theme.colors.ink
            : theme.colors.ink3;

        return (
            <TouchableOpacity
                key={route.key}
                onPress={onPress}
                style={[
                    styles.navItem(theme),
                    isFocused && styles.navItemFocused(theme),
                    !isWeb && { justifyContent: 'center' },
                    collapsed && { justifyContent: 'center', paddingHorizontal: 8 },
                ]}
                activeOpacity={0.7}
                title={collapsed ? n.label : undefined}
            >
                {/* Active indicator bar */}
                {isFocused && (
                    <View style={{
                        position: 'absolute', left: -12, top: 8, bottom: 8,
                        width: 3, backgroundColor: theme.colors.ink, borderRadius: 2,
                    }} />
                )}
                <n.icon
                    size={20}
                    color={iconColor}
                    strokeWidth={isFocused ? 2.5 : 2}
                />
                {isWeb && !collapsed && (
                    <Text style={[
                        styles.navLabel(theme),
                        isFocused && styles.navLabelFocused(theme),
                        n.highlight && !isFocused && { color: '#FFB800' },
                    ]}>
                        {n.label}
                    </Text>
                )}
                {/* AI pill badge */}
                {isWeb && !collapsed && n.highlight && !isFocused && n.name === 'AI' && (
                    <View style={{
                        backgroundColor: '#FFB800' + '1A',
                        paddingHorizontal: 6, paddingVertical: 2, borderRadius: 99, marginLeft: 'auto',
                    }}>
                        <Text style={{ fontSize: 9, fontWeight: '700', color: '#FFB800', letterSpacing: 0.5 }}>AI</Text>
                    </View>
                )}
            </TouchableOpacity>
        );
    };

    const W = isWeb ? (collapsed ? 76 : 280) : 76;

    return (
        <View style={[styles.sidebar(theme, W)]}>

            {/* Logo */}
            <View style={[styles.logoRow, collapsed && { justifyContent: 'center', paddingLeft: 0 }]}>
                <View style={styles.logoMark(theme)} />
                {isWeb && !collapsed && (
                    <Text style={styles.logoText(theme)}>Option</Text>
                )}
            </View>

            {/* WORKSPACE section */}
            <View style={styles.navSection}>
                {isWeb && !collapsed && (
                    <Text style={styles.sectionLabel(theme)}>Workspace</Text>
                )}
                {WORKSPACE_ITEMS.map(renderItem)}
            </View>

            <View style={{ flex: 1 }} />

            {/* ACCOUNT section */}
            <View style={styles.navSection}>
                {isWeb && !collapsed && (
                    <Text style={styles.sectionLabel(theme)}>Account</Text>
                )}
                {ACCOUNT_ITEMS.map(renderItem)}
            </View>

            {/* Collapse toggle (web only) */}
            {isWeb && (
                <TouchableOpacity
                    onPress={() => setCollapsed(c => !c)}
                    style={styles.collapseBtn(theme)}
                    activeOpacity={0.7}
                >
                    {collapsed
                        ? <ChevronRight size={14} color={theme.colors.ink3} />
                        : <ChevronLeft size={14} color={theme.colors.ink3} />
                    }
                    {!collapsed && (
                        <Text style={{ fontFamily: theme.fonts.m, fontSize: 11, color: theme.colors.ink3 }}>Collapse</Text>
                    )}
                </TouchableOpacity>
            )}

            {/* User pill (web only, expanded) — wired to real session */}
            {isWeb && !collapsed && (
                <TouchableOpacity
                    onPress={() => {
                        const route = state.routes.find(r => r.name === 'Settings');
                        if (route) navigation.navigate('Settings');
                    }}
                    activeOpacity={0.7}
                    style={styles.userPill(theme)}
                >
                    <View style={styles.userAvatar(theme)}>
                        <Text style={{ fontFamily: theme.fonts.s, fontSize: 12, fontWeight: '700', color: theme.colors.bg }}>
                            {initials}
                        </Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ fontFamily: theme.fonts.s, fontSize: 12, fontWeight: '600', color: theme.colors.ink }} numberOfLines={1}>
                            {userName || 'My Account'}
                        </Text>
                        <Text style={{ fontFamily: theme.fonts.m, fontSize: 10, color: proColor, fontWeight: '600' }}>
                            {proLabel}
                        </Text>
                    </View>
                </TouchableOpacity>
            )}

            {/* Collapsed mode: just the avatar */}
            {isWeb && collapsed && (
                <TouchableOpacity
                    onPress={() => navigation.navigate('Settings')}
                    activeOpacity={0.7}
                    style={[styles.userAvatar(theme), { marginTop: 8 }]}
                >
                    <Text style={{ fontFamily: theme.fonts.s, fontSize: 12, fontWeight: '700', color: theme.colors.bg }}>
                        {initials}
                    </Text>
                </TouchableOpacity>
            )}
        </View>
    );
}

export default function TabNavigator({ isGuest, onSignOut }) {
    const { theme } = useTheme();
    const [collapsed, setCollapsed] = useState(false);
    const [userName, setUserName] = useState('');
    const [userEmail, setUserEmail] = useState('');

    // Load saved collapse preference + user info
    useEffect(() => {
        (async () => {
            try {
                const saved = await AsyncStorage.getItem(COLLAPSE_KEY);
                if (saved === 'true') setCollapsed(true);

                const name = await AsyncStorage.getItem('userName');
                if (name) setUserName(name);

                const email = await AsyncStorage.getItem('userEmail');
                if (email) setUserEmail(email);

                // Fall back to Supabase session for email/display name
                const { data: { session } } = await supabase.auth.getSession();
                if (session?.user) {
                    if (!name && session.user.user_metadata?.full_name) {
                        const n = session.user.user_metadata.full_name;
                        setUserName(n);
                        await AsyncStorage.setItem('userName', n);
                    }
                    if (!email && session.user.email) {
                        setUserEmail(session.user.email);
                        await AsyncStorage.setItem('userEmail', session.user.email);
                    }
                }
            } catch {}
        })();
    }, []);

    // Persist collapse preference
    const toggleCollapsed = (next) => {
        const v = typeof next === 'function' ? next(collapsed) : next;
        setCollapsed(v);
        AsyncStorage.setItem(COLLAPSE_KEY, v ? 'true' : 'false').catch(() => {});
    };

    const SIDEBAR_WIDTH = isWeb ? (collapsed ? 76 : 280) : 76;

    return (
        <Tab.Navigator
            initialRouteName="Home"
            tabBar={(props) => (
                <CustomSidebar
                    {...props}
                    collapsed={collapsed}
                    setCollapsed={toggleCollapsed}
                    userName={userName}
                    userEmail={userEmail}
                />
            )}
            screenOptions={{
                headerShown: false,
                sceneStyle: { backgroundColor: theme.colors.bg, paddingLeft: SIDEBAR_WIDTH },
            }}
        >
            <Tab.Screen name="Home"        component={DashboardScreen}    options={{ tabBarLabel: 'Dashboard' }} />
            <Tab.Screen name="AI"          component={AIAssistantScreen}  options={{ tabBarLabel: 'AI Tutor' }} />
            <Tab.Screen name="Calendar"    component={MatrixScreen}       options={{ tabBarLabel: 'Calendar' }} />
            <Tab.Screen name="Gradebook"   component={GradebookScreen}    options={{ tabBarLabel: 'Gradebook' }} />
            <Tab.Screen name="Focus"       component={ScreentimeScreen}   options={{ tabBarLabel: 'Focus' }} />
            <Tab.Screen name="Leaderboard" component={LeaderboardScreen}  options={{ tabBarLabel: 'Leaderboard' }} />
            <Tab.Screen name="Integrations" component={IntegrationsScreen} options={{ tabBarLabel: 'Integrations' }} />
            <Tab.Screen name="Premium"     component={PremiumScreen}      options={{ tabBarLabel: 'Upgrade' }} />
            <Tab.Screen name="Settings">
                {(props) => <SettingsScreen {...props} isGuest={isGuest} onSignOut={onSignOut} />}
            </Tab.Screen>
        </Tab.Navigator>
    );
}

// ── Styles ──────────────────────────────────────────────────────

const styles = {
    sidebar: (theme, W) => ({
        position: 'absolute', top: 0, left: 0, bottom: 0, width: W,
        backgroundColor: theme.colors.surface,
        borderRightWidth: 1, borderRightColor: theme.colors.border,
        paddingTop: 20, paddingBottom: 16, paddingHorizontal: 12,
        alignItems: 'center',
        zIndex: 100,
    }),
    logoRow: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        marginBottom: 28, width: '100%', paddingLeft: 4,
    },
    logoMark: (theme) => ({
        width: 32, height: 32, backgroundColor: theme.colors.ink, borderRadius: 8, flexShrink: 0,
    }),
    logoText: (theme) => ({
        fontFamily: theme.fonts.logo || theme.fonts.d,
        fontSize: 24, fontWeight: '700', color: theme.colors.ink, letterSpacing: -0.4,
    }),
    navSection: {
        width: '100%', gap: 2, marginBottom: 4,
    },
    sectionLabel: (theme) => ({
        fontFamily: theme.fonts.m,
        fontSize: 10, fontWeight: '600',
        color: theme.colors.ink4,
        textTransform: 'uppercase', letterSpacing: 1.2,
        paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4,
    }),
    navItem: (theme) => ({
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingVertical: 11, paddingHorizontal: 14,
        borderRadius: 10, position: 'relative', width: '100%',
    }),
    navItemFocused: (theme) => ({
        backgroundColor: theme.colors.surface2,
    }),
    navLabel: (theme) => ({
        fontFamily: theme.fonts.m, fontSize: 14, fontWeight: '500',
        color: theme.colors.ink3, flex: 1,
    }),
    navLabelFocused: (theme) => ({
        color: theme.colors.ink, fontWeight: '600',
    }),
    collapseBtn: (theme) => ({
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
        paddingVertical: 8, borderTopWidth: 1, borderTopColor: theme.colors.border,
        marginTop: 8, width: '100%',
    }),
    userPill: (theme) => ({
        flexDirection: 'row', alignItems: 'center', gap: 10,
        padding: 10, marginTop: 8, borderRadius: 10,
        backgroundColor: theme.colors.surface2, width: '100%',
    }),
    userAvatar: (theme) => ({
        width: 28, height: 28, borderRadius: 14,
        backgroundColor: theme.colors.ink,
        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }),
};
