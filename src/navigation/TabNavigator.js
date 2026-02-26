import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import MatrixScreen from '../screens/MatrixScreen';
import CalendarScreen from '../screens/CalendarScreen';
import GradebookScreen from '../screens/GradebookScreen';
import SettingsScreen from '../screens/SettingsScreen';

const Tab = createBottomTabNavigator();

export default function TabNavigator() {
    return (
        <Tab.Navigator
            screenOptions={{
                tabBarActiveTintColor: '#007AFF',
                tabBarInactiveTintColor: 'gray',
                headerStyle: { backgroundColor: '#fff' },
                headerTitleStyle: { fontWeight: 'bold', fontSize: 20 },
            }}
        >
            <Tab.Screen name="Matrix" component={MatrixScreen} options={{ tabBarLabel: 'Tasks' }} />
            <Tab.Screen name="Calendar" component={CalendarScreen} options={{ tabBarLabel: 'Schedule' }} />
            <Tab.Screen name="Gradebook" component={GradebookScreen} options={{ tabBarLabel: 'Grades' }} />
            <Tab.Screen name="Settings" component={SettingsScreen} options={{ tabBarLabel: 'Settings' }} />
        </Tab.Navigator>
    );
}
