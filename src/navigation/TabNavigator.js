import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Home, CalendarDays, BookOpen, Settings, Timer, Trophy, Plug, Crown, Sparkles } from 'lucide-react-native';
import DashboardScreen from '../screens/DashboardScreen';
import MatrixScreen from '../screens/MatrixScreen';
import SettingsScreen from '../screens/SettingsScreen';
import ScreentimeScreen from '../screens/ScreentimeScreen';
import LeaderboardScreen from '../screens/LeaderboardScreen';
import IntegrationsScreen from '../screens/IntegrationsScreen';
import PremiumScreen from '../screens/PremiumScreen';
import AIAssistantScreen from '../screens/AIAssistantScreen';
import { theme as staticTheme } from '../utils/theme';
import { useTheme } from '../context/ThemeContext';

const Tab = createBottomTabNavigator();

const isWeb = typeof window !== 'undefined' && Dimensions.get('window').width > 768;
const SIDEBAR_WIDTH = isWeb ? 220 : 72;

const NAV_ITEMS = [
    { name: 'Home', label: 'Dashboard', Icon: Home },
    { name: 'AI', label: 'AI Assistant', Icon: Sparkles, highlight: true },
    { name: 'Calendar', label: 'Calendar', Icon: CalendarDays },
    { name: 'Focus', label: 'Focus', Icon: Timer },
    { name: 'Leaderboard', label: 'Leaderboard', Icon: Trophy },
    { name: 'Integrations', label: 'Integrations', Icon: Plug },
    { name: 'Premium', label: 'Upgrade', Icon: Crown, highlight: true },
    { name: 'Settings', label: 'Settings', Icon: Settings },
];

function CustomSidebar({ state, descriptors, navigation }) {
    const { theme, isDarkMode } = useTheme();
    const styles = getStyles(theme);

    return (
        <View style={[styles.sidebarContainer, { width: SIDEBAR_WIDTH }]}>
            <View style={styles.logoContainer}>
                <View style={styles.logoCircle} />
                {isWeb && <Text style={styles.logoText}>Option</Text>}
            </View>

            <View style={styles.navItemsContainer}>
                {state.routes.map((route, index) => {
                    const isFocused = state.index === index;
                    const nav = NAV_ITEMS.find(n => n.name === route.name) || NAV_ITEMS[0];
                    const { Icon, label } = nav;

                    const onPress = () => {
                        const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                        if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name);
                    };

                    const isHighlight = nav.highlight;
                    const iconColor = isHighlight ? '#FFB800' : (isFocused ? theme.colors.ink : theme.colors.ink3);

                    return (
                        <TouchableOpacity
                            key={route.key}
                            onPress={onPress}
                            style={[styles.navItem, isFocused && styles.navItemFocused, !isWeb && { justifyContent: 'center' }]}
                        >
                            <Icon size={20} color={iconColor} strokeWidth={isFocused ? 2.5 : 2} />
                            {isWeb && (
                                <Text style={[styles.navLabel, isFocused && styles.navLabelFocused, isHighlight && { color: '#FFB800' }]}>{label}</Text>
                            )}
                        </TouchableOpacity>
                    );
                })}
            </View>
        </View>
    );
}

export default function TabNavigator({ isGuest, onSignOut }) {
    const { theme } = useTheme();
    return (
        <Tab.Navigator
            initialRouteName="Home"
            tabBar={(props) => <CustomSidebar {...props} />}
            screenOptions={{
                headerShown: false,
                sceneStyle: { backgroundColor: theme.colors.bg, paddingLeft: SIDEBAR_WIDTH },
            }}
        >
            <Tab.Screen name="Home" component={DashboardScreen} options={{ tabBarLabel: 'Dashboard' }} />
            <Tab.Screen name="AI" component={AIAssistantScreen} options={{ tabBarLabel: 'AI Assistant' }} />
            <Tab.Screen name="Calendar" component={MatrixScreen} options={{ tabBarLabel: 'Calendar' }} />
            <Tab.Screen name="Focus" component={ScreentimeScreen} options={{ tabBarLabel: 'Focus' }} />
            <Tab.Screen name="Leaderboard" component={LeaderboardScreen} options={{ tabBarLabel: 'Leaderboard' }} />
            <Tab.Screen name="Integrations" component={IntegrationsScreen} options={{ tabBarLabel: 'Integrations' }} />
            <Tab.Screen name="Premium" component={PremiumScreen} options={{ tabBarLabel: 'Upgrade' }} />
            <Tab.Screen name="Settings">
                {(props) => <SettingsScreen {...props} isGuest={isGuest} onSignOut={onSignOut} />}
            </Tab.Screen>
        </Tab.Navigator>
    );
}

const getStyles = (theme) => StyleSheet.create({
    sidebarContainer: {
        position: 'absolute', top: 0, left: 0, bottom: 0,
        backgroundColor: theme.colors.surface,
        borderRightWidth: 1, borderRightColor: theme.colors.border,
        paddingTop: 40, alignItems: 'center', paddingHorizontal: 12,
        zIndex: 100,
    },
    logoContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 36, width: '100%', gap: 10 },
    logoCircle: { width: 28, height: 28, backgroundColor: theme.colors.ink, borderRadius: 7 },
    logoText: { fontFamily: theme.fonts.logo || theme.fonts.d, fontSize: 20, fontWeight: '700', color: theme.colors.ink, letterSpacing: -0.3 },
    navItemsContainer: { width: '100%', gap: 2 },
    navItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, borderRadius: theme.radii.r, gap: 10 },
    navItemFocused: { backgroundColor: theme.colors.surface2 },
    navLabel: { fontFamily: theme.fonts.m, fontSize: 13, color: theme.colors.ink3, fontWeight: '500' },
    navLabelFocused: { color: theme.colors.ink, fontWeight: '600' },
});
