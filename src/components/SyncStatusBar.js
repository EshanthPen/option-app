import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import {
    getSyncStatus,
    onSyncStatusChange,
    checkConnectivity,
} from '../utils/syncManager';

const AUTO_HIDE_DELAY = 3000;
const FADE_DURATION = 300;
const CONNECTIVITY_INTERVAL = 30000;

export default function SyncStatusBar() {
    const { theme } = useTheme();
    const [status, setStatus] = useState(getSyncStatus());
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const hideTimer = useRef(null);
    const pulseLoop = useRef(null);

    // Subscribe to status changes
    useEffect(() => {
        const unsubscribe = onSyncStatusChange((newStatus) => {
            setStatus(newStatus);
        });
        return unsubscribe;
    }, []);

    // Periodic connectivity check
    useEffect(() => {
        checkConnectivity();
        const interval = setInterval(checkConnectivity, CONNECTIVITY_INTERVAL);
        return () => clearInterval(interval);
    }, []);

    // Manage visibility and animations based on status
    useEffect(() => {
        if (hideTimer.current) {
            clearTimeout(hideTimer.current);
            hideTimer.current = null;
        }

        // Show the bar
        Animated.timing(fadeAnim, {
            toValue: 1,
            duration: FADE_DURATION,
            useNativeDriver: true,
        }).start();

        // Start or stop pulse animation
        if (status === 'syncing') {
            startPulse();
        } else {
            stopPulse();
        }

        // Auto-hide when synced/online
        if (status === 'online') {
            hideTimer.current = setTimeout(() => {
                Animated.timing(fadeAnim, {
                    toValue: 0,
                    duration: FADE_DURATION,
                    useNativeDriver: true,
                }).start();
            }, AUTO_HIDE_DELAY);
        }

        return () => {
            if (hideTimer.current) {
                clearTimeout(hideTimer.current);
            }
        };
    }, [status]);

    const startPulse = () => {
        stopPulse();
        pulseAnim.setValue(1);
        pulseLoop.current = Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, {
                    toValue: 0.4,
                    duration: 600,
                    useNativeDriver: true,
                }),
                Animated.timing(pulseAnim, {
                    toValue: 1,
                    duration: 600,
                    useNativeDriver: true,
                }),
            ])
        );
        pulseLoop.current.start();
    };

    const stopPulse = () => {
        if (pulseLoop.current) {
            pulseLoop.current.stop();
            pulseLoop.current = null;
        }
        pulseAnim.setValue(1);
    };

    const getStatusConfig = () => {
        switch (status) {
            case 'syncing':
                return {
                    color: theme.colors.orange,
                    label: 'Syncing...',
                };
            case 'offline':
                return {
                    color: theme.colors.red,
                    label: 'Offline - changes saved locally',
                };
            case 'online':
            default:
                return {
                    color: theme.colors.green,
                    label: 'Synced',
                };
        }
    };

    const config = getStatusConfig();

    return (
        <Animated.View
            pointerEvents="none"
            style={[
                styles.container,
                {
                    backgroundColor: config.color,
                    opacity: fadeAnim,
                },
            ]}
        >
            <Animated.Text
                style={[
                    styles.label,
                    {
                        fontFamily: theme.fonts.s,
                        color: '#fff',
                        opacity: status === 'syncing' ? pulseAnim : 1,
                    },
                ]}
            >
                {config.label}
            </Animated.Text>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 999,
        height: 28,
        justifyContent: 'center',
        alignItems: 'center',
    },
    label: {
        fontSize: 12,
        fontWeight: '600',
        letterSpacing: 0.3,
    },
});
