import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Home, CalendarDays, BookOpen, Settings, Timer } from 'lucide-react-native';
import DashboardScreen from '../screens/DashboardScreen';
import MatrixScreen from '../screens/MatrixScreen';
import GradebookScreen from '../screens/GradebookScreen';
import SettingsScreen from '../screens/SettingsScreen';
import ScreentimeScreen from '../screens/ScreentimeScreen';
import { theme } from '../utils/theme';

const Tab = createBottomTabNavigator();

const isWeb = typeof window !== 'undefined' && Dimensions.get('window').width > 768;
const SIDEBAR_WIDTH = isWeb ? 220 : 72;

const NAV_ITEMS = [
    { name: 'Home', label: 'Dashboard', Icon: Home },
    { name: 'Calendar', label: 'Calendar', Icon: CalendarDays },
    { name: 'Gradebook', label: 'Gradebook', Icon: BookOpen },
    { name: 'Focus', label: 'Focus', Icon: Timer },
    { name: 'Settings', label: 'Settings', Icon: Settings },
];

function CustomSidebar({ state, descriptors, navigation }) {
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

                    return (
                        <TouchableOpacity
                            key={route.key}
                            onPress={onPress}
                            style={[styles.navItem, isFocused && styles.navItemFocused, !isWeb && { justifyContent: 'center' }]}
                        >
                            <Icon size={20} color={isFocused ? theme.colors.ink : theme.colors.ink3} strokeWidth={isFocused ? 2.5 : 2} />
                            {isWeb && (
                                <Text style={[styles.navLabel, isFocused && styles.navLabelFocused]}>{label}</Text>
                            )}
                        </TouchableOpacity>
                    );
                })}
            </View>
        </View>
    );
}

export default function TabNavigator() {
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
            <Tab.Screen name="Calendar" component={MatrixScreen} options={{ tabBarLabel: 'Calendar' }} />
            <Tab.Screen name="Gradebook" component={GradebookScreen} options={{ tabBarLabel: 'Gradebook' }} />
            <Tab.Screen name="Focus" component={ScreentimeScreen} options={{ tabBarLabel: 'Focus' }} />
            <Tab.Screen name="Settings" component={SettingsScreen} options={{ tabBarLabel: 'Settings' }} />
        </Tab.Navigator>
    );
}

const styles = StyleSheet.create({
    sidebarContainer: {
        position: 'absolute', top: 0, left: 0, bottom: 0,
        backgroundColor: theme.colors.surface,
        borderRightWidth: 1, borderRightColor: theme.colors.border,
        paddingTop: 40, alignItems: 'center', paddingHorizontal: 12,
        zIndex: 100,
    },
    logoContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 40, width: '100%', gap: 10 },
    logoCircle: { width: 30, height: 30, backgroundColor: theme.colors.ink, borderRadius: 8 },
    logoText: { fontFamily: theme.fonts.d, fontSize: 22, fontWeight: '700', color: theme.colors.ink, letterSpacing: -0.5 },
    navItemsContainer: { width: '100%', gap: 4 },
    navItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 12, borderRadius: theme.radii.lg, gap: 10 },
    navItemFocused: { backgroundColor: theme.colors.surface2 },
    navLabel: { fontFamily: theme.fonts.m, fontSize: 13, color: theme.colors.ink3, fontWeight: '500' },
    navLabelFocused: { color: theme.colors.ink, fontWeight: '700' },
});
