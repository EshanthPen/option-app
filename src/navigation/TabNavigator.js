import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import DashboardScreen from '../screens/DashboardScreen';
import MatrixScreen from '../screens/MatrixScreen';
import CalendarScreen from '../screens/CalendarScreen';
import GradebookScreen from '../screens/GradebookScreen';
import SettingsScreen from '../screens/SettingsScreen';
import ComingSoonScreen from '../screens/ComingSoonScreen';

const Tab = createBottomTabNavigator();

export default function TabNavigator() {
    return (
        <Tab.Navigator
            initialRouteName="Home"
            screenOptions={{
                tabBarActiveTintColor: '#007AFF',
                tabBarInactiveTintColor: 'gray',
                headerStyle: { backgroundColor: '#fff' },
                headerTitleStyle: { fontWeight: 'bold', fontSize: 20 },
                tabBarStyle: { paddingBottom: 5, paddingTop: 5, height: 60 }
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
