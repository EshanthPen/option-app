import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function CalendarScreen() {
    return (
        <View style={styles.container}>
            <Text style={styles.title}>Auto-Scheduler</Text>
            <Text style={styles.subtitle}>Your scheduled time blocks will appear here.</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' },
    title: { fontSize: 28, fontWeight: 'bold', marginBottom: 10, color: '#333' },
    subtitle: { fontSize: 16, color: '#666' }
});
