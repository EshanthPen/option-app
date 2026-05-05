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

const WelcomeScreen = ({ onAuthStart, onAuthReset, onGuestMode }) => {
    const { theme } = useTheme();
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
                            <Sparkles size={24} color="#fff" />
                        </View>
                        <Text style={[styles.title, { fontFamily: theme.fonts.sansSemiBold }]}>Option</Text>
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
                            <ArrowRight size={20} color="#fff" />
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

const styles = StyleSheet.create({
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
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
    },
    title: {
        fontSize: 72,
        fontWeight: '900',
        color: '#fff',
        letterSpacing: -2,
    },
    subtitle: {
        fontSize: 28,
        color: 'rgba(255,255,255,0.7)',
        marginTop: 12,
        lineHeight: 36,
        fontWeight: '500',
    },
    highlight: {
        color: '#fff',
        fontWeight: '700',
    },
    footer: {
        gap: 20,
    },
    primaryButton: {
        backgroundColor: 'transparent',
        height: 64,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
    },
    buttonText: {
        fontSize: 18,
        fontWeight: '700',
        color: '#fff',
    },
    guestButton: {
        height: 52,
        borderRadius: 26,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1.5,
        borderColor: 'rgba(255,255,255,0.3)',
    },
    guestButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.7)',
    },
    footerText: {
        textAlign: 'center',
        color: 'rgba(255,255,255,0.4)',
        fontSize: 14,
    },
    modalOverlay: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: '#121212', // Match dark theme
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        height: height * 0.85,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -10 },
        shadowOpacity: 0.1,
        shadowRadius: 20,
        elevation: 20,
    },
    modalHeader: {
        alignItems: 'center',
        paddingVertical: 16,
    },
    closeBar: {
        width: 40,
        height: 5,
        borderRadius: 2.5,
        backgroundColor: '#ddd',
    }
});

export default WelcomeScreen;
