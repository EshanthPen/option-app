import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ImageBackground,
    Dimensions,
    Modal,
    Platform
} from 'react-native';
import AuthScreen from './AuthScreen';
import { ArrowRight, Sparkles } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';

const { width, height } = Dimensions.get('window');

const withOpacity = (hex, opacity) => {
    if (!hex) return 'transparent';
    let cleanHex = hex.replace('#', '');
    if (cleanHex.length === 3) {
        cleanHex = cleanHex.split('').map(char => char + char).join('');
    }
    const r = parseInt(cleanHex.substring(0, 2), 16);
    const g = parseInt(cleanHex.substring(2, 4), 16);
    const b = parseInt(cleanHex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};

const WelcomeScreen = ({ onAuthStart, onAuthReset, onGuestMode }) => {
    const { theme } = useTheme();
    const styles = getStyles(theme);
    const [authModalVisible, setAuthModalVisible] = useState(false);

    const handleCloseModal = () => {
        setAuthModalVisible(false);
        if (onAuthReset) onAuthReset();
    };

    return (
        <View style={styles.container}>
            <View style={[styles.background, { backgroundColor: theme.colors.bg }]}>
                <View style={styles.content}>
                    <View style={styles.heroSection}>
                        <View style={styles.logoBadge}>
                            <Sparkles size={24} color={theme.colors.ink} />
                        </View>
                        <Text style={[styles.title, { fontFamily: theme.fonts.s }]}>Option</Text>
                        <Text style={styles.subtitle}>
                            Your academic life,{"\n"}
                            <Text style={styles.highlight}>automated & optimized.</Text>
                        </Text>
                    </View>

                    <View style={styles.footer}>
                        <TouchableOpacity
                            style={styles.primaryButton}
                            onPress={() => setAuthModalVisible(true)}
                        >
                            <Text style={styles.buttonText}>Get Started</Text>
                            <ArrowRight size={20} color={theme.colors.ink} />
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.guestButton}
                            onPress={onGuestMode}
                        >
                            <Text style={styles.guestButtonText}>Continue as Guest</Text>
                        </TouchableOpacity>

                        <Text style={styles.footerText}>
                            Join thousands of students optimizing their success.
                        </Text>
                    </View>
                </View>
            </View>

            {/* Auth Popup Modal */}
            <Modal
                animationType="slide"
                transparent={true}
                visible={authModalVisible}
                onRequestClose={handleCloseModal}
            >
                <View style={styles.modalOverlay}>
                    <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.6)' }]} />
                    
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <TouchableOpacity 
                                style={styles.closeBar} 
                                onPress={handleCloseModal}
                            />
                        </View>
                        <AuthScreen 
                            onAuthSuccess={() => setAuthModalVisible(false)} 
                            onAuthStart={onAuthStart}
                            onAuthReset={onAuthReset}
                        />
                    </View>
                </View>
            </Modal>
        </View>
    );
};

const getStyles = (theme) => StyleSheet.create({
    container: {
        flex: 1,
    },
    background: {
        flex: 1,
        justifyContent: 'center',
    },
    content: {
        flex: 1,
        padding: 40,
        justifyContent: 'space-between',
        paddingVertical: 100,
    },
    heroSection: {
        marginTop: 40,
    },
    logoBadge: {
        width: 60,
        height: 60,
        borderRadius: theme.radii.lg,
        backgroundColor: withOpacity(theme.colors.ink, 0.1),
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24,
        borderWidth: 1,
        borderColor: theme.colors.border,
    },
    title: {
        fontSize: 72,
        fontWeight: '900',
        color: theme.colors.ink,
        letterSpacing: -2,
    },
    subtitle: {
        fontSize: 28,
        color: withOpacity(theme.colors.ink, 0.7),
        marginTop: 12,
        lineHeight: 36,
        fontWeight: '500',
    },
    highlight: {
        color: theme.colors.ink,
        fontWeight: '700',
    },
    footer: {
        gap: 20,
    },
    primaryButton: {
        backgroundColor: 'transparent',
        height: 64,
        borderRadius: theme.radii.lg,
        borderWidth: 1,
        borderColor: theme.colors.border,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        ...theme.shadows.sm,
    },
    buttonText: {
        fontSize: 18,
        fontWeight: '700',
        color: theme.colors.ink,
    },
    guestButton: {
        height: 52,
        borderRadius: theme.radii.lg,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: theme.colors.border,
    },
    guestButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: withOpacity(theme.colors.ink, 0.7),
    },
    footerText: {
        textAlign: 'center',
        color: withOpacity(theme.colors.ink, 0.4),
        fontSize: 14,
    },
    modalOverlay: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: theme.colors.bg,
        borderTopLeftRadius: theme.radii.xl,
        borderTopRightRadius: theme.radii.xl,
        borderTopWidth: 1,
        borderLeftWidth: 1,
        borderRightWidth: 1,
        borderColor: theme.colors.border,
        height: height * 0.85,
        ...theme.shadows.md,
    },
    modalHeader: {
        alignItems: 'center',
        paddingVertical: 16,
    },
    closeBar: {
        width: 40,
        height: 5,
        borderRadius: 2.5,
        backgroundColor: theme.colors.ink3,
    }
});

export default WelcomeScreen;
