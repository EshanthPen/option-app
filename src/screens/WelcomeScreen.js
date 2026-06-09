import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Dimensions,
    Modal,
    ScrollView,
    Animated,
} from 'react-native';
import AuthScreen from './AuthScreen';
import { ArrowRight, Sparkles, Zap, Target, BookOpen, Shield } from 'lucide-react-native';
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

    const fadeAnim = React.useRef(new Animated.Value(0)).current;
    const slideAnim = React.useRef(new Animated.Value(30)).current;

    React.useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
            Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
        ]).start();
    }, []);

    const handleCloseModal = () => {
        setAuthModalVisible(false);
        if (onAuthReset) onAuthReset();
    };

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.bg }]}>
            <ScrollView 
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
                    {/* Hero Section */}
                    <View style={styles.heroSection}>
                        <View style={[styles.logoBadge, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
                            <Sparkles size={24} color={theme.colors.ink} />
                        </View>
                        <Text style={[styles.title, { color: theme.colors.ink, fontFamily: theme.fonts.s }]}>
                            Option
                        </Text>
                        <Text style={[styles.subtitle, { color: theme.colors.ink2 }]}>
                            Your academic life,{"\n"}
                            <Text style={{ color: theme.colors.ink, fontWeight: '700' }}>automated & optimized.</Text>
                        </Text>
                    </View>

                    {/* Info Cards */}
                    <View style={styles.featuresContainer}>
                        <FeatureCard 
                            icon={<Zap size={20} color={theme.colors.ink} />}
                            title="Smart Sync"
                            description="Auto-import grades & assignments from SIS & Schoology."
                            theme={theme}
                        />
                        <FeatureCard 
                            icon={<Target size={20} color={theme.colors.ink} />}
                            title="Focus Score"
                            description="Track your productivity and build study streaks."
                            theme={theme}
                        />
                        <FeatureCard 
                            icon={<BookOpen size={20} color={theme.colors.ink} />}
                            title="All-in-One"
                            description="Grades, calendar, AI tutor, and focus timer."
                            theme={theme}
                        />
                    </View>

                    {/* Footer */}
                    <View style={styles.footer}>
                        <TouchableOpacity
                            style={[styles.primaryButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.ink }]}
                            onPress={() => setAuthModalVisible(true)}
                        >
                            <Text style={[styles.buttonText, { color: theme.colors.bg }]}>Log In</Text>
                            <ArrowRight size={20} color={theme.colors.bg} />
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.guestButton, { borderColor: theme.colors.border }]}
                            onPress={onGuestMode}
                        >
                            <Text style={[styles.guestButtonText, { color: theme.colors.ink2 }]}>Continue as Guest</Text>
                        </TouchableOpacity>

                        <View style={styles.securityBadge}>
                            <Shield size={14} color={theme.colors.ink3} />
                            <Text style={[styles.footerText, { color: theme.colors.ink3 }]}>
                                Secure login. Your data is encrypted.
                            </Text>
                        </View>
                    </View>
                </Animated.View>
            </ScrollView>

            {/* Auth Popup Modal */}
            <Modal
                animationType="slide"
                transparent={true}
                visible={authModalVisible}
                onRequestClose={handleCloseModal}
            >
                <View style={styles.modalOverlay}>
                    <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.6)' }]} />
                    
                    <View style={[styles.modalContent, { backgroundColor: theme.colors.bg }]}>
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

const FeatureCard = ({ icon, title, description, theme }) => (
    <View style={[styles.featureCard, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
        <View style={[styles.featureIcon, { backgroundColor: theme.colors.bg }]}>
            {icon}
        </View>
        <Text style={[styles.featureTitle, { color: theme.colors.ink }]}>{title}</Text>
        <Text style={[styles.featureDescription, { color: theme.colors.ink2 }]}>{description}</Text>
    </View>
);

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
        padding: 24,
        justifyContent: 'center',
    },
    heroSection: {
        alignItems: 'center',
        marginBottom: 32,
    },
    logoBadge: {
        width: 60,
        height: 60,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24,
        borderWidth: 1,
    },
    title: {
        fontSize: 48,
        fontWeight: '900',
        letterSpacing: -1.5,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 18,
        marginTop: 8,
        lineHeight: 28,
        textAlign: 'center',
        maxWidth: 300,
    },
    featuresContainer: {
        gap: 12,
        marginBottom: 32,
    },
    featureCard: {
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    featureIcon: {
        width: 40,
        height: 40,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    featureTitle: {
        fontSize: 15,
        fontWeight: '700',
        marginBottom: 2,
    },
    featureDescription: {
        fontSize: 13,
        lineHeight: 18,
        flex: 1,
    },
    footer: {
        gap: 12,
    },
    primaryButton: {
        height: 56,
        borderRadius: 14,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    buttonText: {
        fontSize: 17,
        fontWeight: '700',
    },
    guestButton: {
        height: 48,
        borderRadius: 14,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
    },
    guestButtonText: {
        fontSize: 15,
        fontWeight: '600',
    },
    securityBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        marginTop: 12,
    },
    footerText: {
        fontSize: 12,
    },
    modalOverlay: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    modalContent: {
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        height: height * 0.85,
    },
    modalHeader: {
        alignItems: 'center',
        paddingVertical: 16,
    },
    closeBar: {
        width: 40,
        height: 5,
        borderRadius: 2.5,
        backgroundColor: theme => theme.colors.ink3,
    }
});

const getStyles = (theme) => styles;

export default WelcomeScreen;
