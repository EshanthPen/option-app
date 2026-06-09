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
<<<<<<< Updated upstream
                        <View style={styles.logoBadge}>
                            <Sparkles size={24} color={theme.colors.ink} />
                        </View>
                        <Text style={[styles.title, { fontFamily: theme.fonts.s }]}>Option</Text>
                        <Text style={styles.subtitle}>
=======
                        <View style={[styles.logoBadge, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
                            <Sparkles size={24} color={theme.colors.ink} />
                        </View>
                        <Text style={[styles.title, { color: theme.colors.ink, fontFamily: theme.fonts.sansSemiBold }]}>
                            Option
                        </Text>
                        <Text style={[styles.subtitle, { color: theme.colors.ink2 }]}>
>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
                            <Text style={styles.buttonText}>Get Started</Text>
                            <ArrowRight size={20} color={theme.colors.ink} />
=======
                            <Text style={[styles.buttonText, { color: theme.colors.bg }]}>Log In</Text>
                            <ArrowRight size={20} color={theme.colors.bg} />
>>>>>>> Stashed changes
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

<<<<<<< Updated upstream
const getStyles = (theme) => StyleSheet.create({
=======
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
>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
        borderRadius: theme.radii.lg,
        backgroundColor: withOpacity(theme.colors.ink, 0.1),
=======
        borderRadius: 20,
>>>>>>> Stashed changes
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24,
        borderWidth: 1,
<<<<<<< Updated upstream
        borderColor: theme.colors.border,
=======
>>>>>>> Stashed changes
    },
    title: {
        fontSize: 48,
        fontWeight: '900',
<<<<<<< Updated upstream
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
=======
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
>>>>>>> Stashed changes
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        ...theme.shadows.sm,
    },
<<<<<<< Updated upstream
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
=======
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
>>>>>>> Stashed changes
    },
    guestButtonText: {
        fontSize: 15,
        fontWeight: '600',
<<<<<<< Updated upstream
        color: withOpacity(theme.colors.ink, 0.7),
    },
    footerText: {
        textAlign: 'center',
        color: withOpacity(theme.colors.ink, 0.4),
        fontSize: 14,
=======
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
>>>>>>> Stashed changes
    },
    modalOverlay: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    modalContent: {
<<<<<<< Updated upstream
        backgroundColor: theme.colors.bg,
        borderTopLeftRadius: theme.radii.xl,
        borderTopRightRadius: theme.radii.xl,
        borderTopWidth: 1,
        borderLeftWidth: 1,
        borderRightWidth: 1,
        borderColor: theme.colors.border,
=======
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
>>>>>>> Stashed changes
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
