import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import DashboardScreen from '../screens/DashboardScreen';
import MatrixScreen from '../screens/MatrixScreen';
import CalendarScreen from '../screens/CalendarScreen';
import GradebookScreen from '../screens/GradebookScreen';
import SettingsScreen from '../screens/SettingsScreen';
import ComingSoonScreen from '../screens/ComingSoonScreen';
import { colors, fonts } from '../theme';

const Tab = createBottomTabNavigator();

export default function TabNavigator() {
    return (
        <Tab.Navigator
            initialRouteName="Home"
            screenOptions={{
                tabBarActiveTintColor: colors.ink,
                tabBarInactiveTintColor: colors.ink3,
                headerStyle: { backgroundColor: colors.surface, shadowOpacity: 0, elevation: 0, borderBottomWidth: 1, borderBottomColor: colors.border },
                headerTitleStyle: { fontFamily: fonts.displayBold, fontSize: 18, color: colors.ink },
                tabBarStyle: { paddingBottom: 5, paddingTop: 5, height: 60, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
                tabBarLabelStyle: { fontFamily: fonts.sansMedium, fontSize: 11 }
            }}
        >
            <Tab.Screen name="Home" component={DashboardScreen} options={{ tabBarLabel: 'Home' }} />
            <Tab.Screen name="Matrix" component={MatrixScreen} options={{ tabBarLabel: 'Tasks' }} />
            <Tab.Screen name="Gradebook" component={GradebookScreen} options={{ tabBarLabel: 'Grades' }} />
            <Tab.Screen name="Settings" component={SettingsScreen} options={{ tabBarLabel: 'Settings' }} />
            <Tab.Screen name="Later" component={ComingSoonScreen} options={{ tabBarLabel: 'Coming Soon' }} />
        </Tab.Navigator>
    );
}
