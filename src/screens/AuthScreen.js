import React, { useState } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    KeyboardAvoidingView,
    Platform,
    ActivityIndicator,
    Alert,
    ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabaseClient';
import { useTheme } from '../context/ThemeContext';
import { Mail, Lock, User, ArrowRight, BookOpen, GraduationCap, X, Eye, EyeOff, CheckCircle2, Shield, Calendar } from 'lucide-react-native';
import { Modal } from 'react-native';

const MIN_AGE = 13;

/**
 * Calculate age from a date of birth string (YYYY-MM-DD or MM/DD/YYYY).
 */
const calculateAge = (dobString) => {
    const dob = new Date(dobString);
    if (isNaN(dob.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
        age--;
    }
    return age;
};

const AuthScreen = ({ onAuthSuccess, onAuthStart, onAuthReset }) => {
    const { theme } = useTheme();
    const [isLogin, setIsLogin] = useState(true);
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [schoologyUrl, setSchoologyUrl] = useState('');
    const [dateOfBirth, setDateOfBirth] = useState('');
    const [acceptedTerms, setAcceptedTerms] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showVerifyModal, setShowVerifyModal] = useState(false);
    const [showPrivacyModal, setShowPrivacyModal] = useState(false);
    const [status, setStatus] = useState({ message: '', type: '' });

    const handleAuth = async () => {
        const trimmedEmail = email.trim();
        const trimmedPassword = password.trim();

        if (!trimmedEmail || !trimmedPassword) {
            setStatus({ message: 'Please fill in all fields', type: 'error' });
            return;
        }

        // Age verification for signup
        if (!isLogin) {
            if (!dateOfBirth.trim()) {
                setStatus({ message: 'Please enter your date of birth', type: 'error' });
                return;
            }
            const age = calculateAge(dateOfBirth.trim());
            if (age === null) {
                setStatus({ message: 'Please enter a valid date (YYYY-MM-DD)', type: 'error' });
                return;
            }
            if (age < MIN_AGE) {
                setStatus({
                    message: `You must be at least ${MIN_AGE} years old to create an account. This is required by the Children's Online Privacy Protection Act (COPPA).`,
                    type: 'error'
                });
                return;
            }
            if (!acceptedTerms) {
                setStatus({ message: 'Please accept the Privacy Policy and Terms of Service to continue', type: 'error' });
                return;
            }
        }

        setLoading(true);
        setStatus({ message: '', type: '' });

        try {
            if (isLogin) {
                const { error } = await supabase.auth.signInWithPassword({
                    email: trimmedEmail,
                    password: trimmedPassword,
                });
                if (error) throw error;

                if (onAuthStart) onAuthStart();

                setTimeout(() => {
                    if (onAuthSuccess) onAuthSuccess();
                }, 500);
            } else {
                const { error } = await supabase.auth.signUp({
                    email: trimmedEmail,
                    password: trimmedPassword,
                    options: {
                        data: {
                            full_name: fullName.trim(),
                            app_name: 'Option Dashboard',
                            accepted_terms_at: new Date().toISOString(),
                            age_verified: true,
                        }
                    }
                });
                if (error) throw error;

                if (schoologyUrl) {
                    await AsyncStorage.setItem('schoologyUrl', schoologyUrl);
                }
                if (fullName) {
                    await AsyncStorage.setItem('userName', fullName);
                }

                setShowVerifyModal(true);
                setIsLogin(true);
                setPassword('');
            }
        } catch (error) {
            let message = error.message;
            if (message.includes('rate limit')) {
                message = "Too many attempts. Please wait a minute before trying again.";
            }
            setStatus({ message, type: 'error' });
            if (onAuthReset) onAuthReset();
        } finally {
            setLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={getStyles(theme).container}
        >
            <View style={getStyles(theme).card}>
                <Text style={getStyles(theme).title}>{isLogin ? 'Welcome Back' : 'Create Account'}</Text>
                <Text style={getStyles(theme).subtitle}>
                    {isLogin ? 'Sign in to access your dashboard' : 'Join Option to sync your data'}
                </Text>

                {status.message ? (
                    <View style={[getStyles(theme).statusBanner, status.type === 'error' ? getStyles(theme).errorBanner : getStyles(theme).successBanner]}>
                        <Text style={getStyles(theme).statusText}>{status.message}</Text>
                    </View>
                ) : null}

                <View style={getStyles(theme).form}>
                    {!isLogin && (
                        <View style={getStyles(theme).inputContainer}>
                            <User size={18} color={theme.colors.ink3} />
                            <TextInput
                                style={getStyles(theme).input}
                                placeholder="Full Name"
                                placeholderTextColor={theme.colors.ink3}
                                value={fullName}
                                onChangeText={setFullName}
                                autoCapitalize="words"
                            />
                        </View>
                    )}

                    <View style={getStyles(theme).inputContainer}>
                        <Mail size={18} color={theme.colors.ink3} />
                        <TextInput
                            style={getStyles(theme).input}
                            placeholder="Email Address"
                            placeholderTextColor={theme.colors.ink3}
                            value={email}
                            onChangeText={setEmail}
                            autoCapitalize="none"
                            keyboardType="email-address"
                        />
                    </View>

                    <View style={getStyles(theme).inputContainer}>
                        <Lock size={18} color={theme.colors.ink3} />
                        <TextInput
                            style={getStyles(theme).input}
                            placeholder="Password"
                            placeholderTextColor={theme.colors.ink3}
                            value={password}
                            onChangeText={setPassword}
                            secureTextEntry={!showPassword}
                        />
                        <TouchableOpacity 
                            onPress={() => setShowPassword(!showPassword)}
                            style={getStyles(theme).eyeIcon}
                        >
                            {showPassword ? (
                                <EyeOff size={18} color={theme.colors.ink3} />
                            ) : (
                                <Eye size={18} color={theme.colors.ink3} />
                            )}
                        </TouchableOpacity>
                    </View>

                    {!isLogin && (
                        <View style={getStyles(theme).inputContainer}>
                            <Calendar size={18} color={theme.colors.ink3} />
                            <TextInput
                                style={getStyles(theme).input}
                                placeholder="Date of Birth (YYYY-MM-DD)"
                                placeholderTextColor={theme.colors.ink3}
                                value={dateOfBirth}
                                onChangeText={setDateOfBirth}
                                autoCapitalize="none"
                                keyboardType="numbers-and-punctuation"
                            />
                        </View>
                    )}

                    {!isLogin && (
                        <View style={getStyles(theme).inputContainer}>
                            <BookOpen size={18} color={theme.colors.ink3} />
                            <TextInput
                                style={getStyles(theme).input}
                                placeholder="Schoology Link (Optional)"
                                placeholderTextColor={theme.colors.ink3}
                                value={schoologyUrl}
                                onChangeText={setSchoologyUrl}
                                autoCapitalize="none"
                            />
                        </View>
                    )}

                    {!isLogin && (
                        <TouchableOpacity
                            style={getStyles(theme).termsRow}
                            onPress={() => setAcceptedTerms(!acceptedTerms)}
                            activeOpacity={0.7}
                        >
                            <View style={[
                                getStyles(theme).checkbox,
                                acceptedTerms && { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent }
                            ]}>
                                {acceptedTerms && <CheckCircle2 size={14} color="#fff" />}
                            </View>
                            <Text style={getStyles(theme).termsText}>
                                I agree to the{' '}
                                <Text style={getStyles(theme).termsLink} onPress={() => setShowPrivacyModal(true)}>
                                    Privacy Policy & Terms of Service
                                </Text>
                            </Text>
                        </TouchableOpacity>
                    )}

                    <TouchableOpacity
                        style={[getStyles(theme).button, loading && { opacity: 0.7 }]}
                        onPress={handleAuth}
                        disabled={loading}
                    >
                        {loading ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <>
                                <Text style={getStyles(theme).buttonText}>
                                    {isLogin ? 'Let\'s Go' : 'Create My Account'}
                                </Text>
                                <ArrowRight size={20} color="#fff" />
                            </>
                        )}
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={() => setIsLogin(!isLogin)}
                        style={getStyles(theme).switchButton}
                    >
                        <Text style={getStyles(theme).switchText}>
                            {isLogin ? "Need an account? Join now" : "Already a member? Login here"}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* Verification Required Modal */}
            <Modal
                visible={showVerifyModal}
                transparent
                animationType="fade"
            >
                <View style={getStyles(theme).modalOverlay}>
                    <View style={getStyles(theme).verifyPopup}>
                        <View style={getStyles(theme).checkIconBox}>
                            <CheckCircle2 size={48} color={theme.colors.green} />
                        </View>
                        <Text style={getStyles(theme).verifyTitle}>Check Your Inbox</Text>
                        <Text style={getStyles(theme).verifyText}>
                            We've sent a verification link to <Text style={{fontWeight: '700'}}>{email}</Text>. Please click it to activate your account!
                        </Text>
                        <TouchableOpacity
                            style={getStyles(theme).verifyBtn}
                            onPress={() => setShowVerifyModal(false)}
                        >
                            <Text style={getStyles(theme).verifyBtnText}>Got it!</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Privacy Policy & Terms Modal */}
            <Modal
                visible={showPrivacyModal}
                transparent
                animationType="fade"
            >
                <View style={getStyles(theme).modalOverlay}>
                    <View style={[getStyles(theme).verifyPopup, { maxHeight: '80%' }]}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: 12 }}>
                            <Text style={getStyles(theme).verifyTitle}>Privacy & Terms</Text>
                            <TouchableOpacity onPress={() => setShowPrivacyModal(false)}>
                                <X size={22} color={theme.colors.ink} />
                            </TouchableOpacity>
                        </View>
                        <ScrollView style={{ maxHeight: 400, width: '100%' }}>
                            <Text style={{ fontFamily: theme.fonts.d, fontSize: 18, fontWeight: '700', color: theme.colors.ink, marginBottom: 8 }}>
                                Privacy Policy Summary
                            </Text>
                            <Text style={{ fontFamily: theme.fonts.m, fontSize: 12, color: theme.colors.ink2, lineHeight: 20, marginBottom: 16 }}>
                                {'\u2022'} We collect only your email, display name, and focus scores{'\n'}
                                {'\u2022'} StudentVUE credentials are stored locally on your device only{'\n'}
                                {'\u2022'} We never sell or share your data with advertisers{'\n'}
                                {'\u2022'} You must be 13+ to use this app (COPPA compliance){'\n'}
                                {'\u2022'} You can delete your account and all data at any time{'\n'}
                                {'\u2022'} Leaderboard shows only your chosen display name
                            </Text>
                            <Text style={{ fontFamily: theme.fonts.d, fontSize: 18, fontWeight: '700', color: theme.colors.ink, marginBottom: 8 }}>
                                Terms of Service Summary
                            </Text>
                            <Text style={{ fontFamily: theme.fonts.m, fontSize: 12, color: theme.colors.ink2, lineHeight: 20 }}>
                                {'\u2022'} You must be 13+ and agree to use the app responsibly{'\n'}
                                {'\u2022'} Do not harass others or share inappropriate content{'\n'}
                                {'\u2022'} Grade data accuracy depends on your school's system{'\n'}
                                {'\u2022'} We provide the app "as is" without warranties
                            </Text>
                        </ScrollView>
                        <TouchableOpacity
                            style={[getStyles(theme).verifyBtn, { marginTop: 16 }]}
                            onPress={() => {
                                setAcceptedTerms(true);
                                setShowPrivacyModal(false);
                            }}
                        >
                            <Text style={getStyles(theme).verifyBtnText}>I Agree</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </KeyboardAvoidingView>
    );
};

const getStyles = (theme) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'transparent',
        justifyContent: 'center',
        padding: 20,
    },
    card: {
        backgroundColor: theme.colors.surface,
        borderRadius: 20,
        padding: 32,
        borderWidth: 2,
        borderColor: theme.colors.border,
        // Neo-Brutalism Shadow
        shadowColor: theme.colors.border,
        shadowOffset: { width: 4, height: 4 },
        shadowOpacity: 1,
        shadowRadius: 0,
        elevation: 4,
    },
    title: {
        fontFamily: theme.fonts.d,
        fontSize: 32,
        fontWeight: '700',
        color: theme.colors.ink,
        marginBottom: 8,
        letterSpacing: -0.5,
    },
    subtitle: {
        fontFamily: theme.fonts.s,
        fontSize: 15,
        color: theme.colors.ink2,
        marginBottom: 24,
        lineHeight: 22,
    },
    statusBanner: {
        padding: 14,
        borderRadius: 12,
        marginBottom: 24,
        borderWidth: 2,
    },
    errorBanner: {
        backgroundColor: '#FFF0F0',
        borderColor: theme.colors.red,
    },
    successBanner: {
        backgroundColor: '#F0FFF4',
        borderColor: theme.colors.green,
    },
    statusText: {
        fontFamily: theme.fonts.m,
        fontSize: 13,
        textAlign: 'center',
        fontWeight: '600',
        color: theme.colors.ink,
        lineHeight: 18,
    },
    form: {
        gap: 14,
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.surface2,
        borderRadius: 12,
        paddingHorizontal: 16,
        height: 56,
        borderWidth: 2,
        borderColor: theme.colors.border2,
        gap: 12,
    },
    input: {
        flex: 1,
        fontFamily: theme.fonts.s,
        fontSize: 16,
        color: theme.colors.ink,
        height: '100%',
    },
    eyeIcon: {
        padding: 4,
    },
    button: {
        backgroundColor: theme.colors.accent,
        borderRadius: 14,
        height: 60,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        marginTop: 12,
        borderWidth: 2,
        borderColor: theme.colors.border,
        // Shadow for button
        shadowColor: theme.colors.border,
        shadowOffset: { width: 3, height: 3 },
        shadowOpacity: 1,
        shadowRadius: 0,
        elevation: 4,
    },
    buttonText: {
        color: theme.colors.bg, // Soften the contrast
        fontFamily: theme.fonts.b,
        fontSize: 19,
        fontWeight: '700',
        letterSpacing: 0.5,
    },
    switchButton: {
        marginTop: 12,
        alignItems: 'center',
        paddingVertical: 10,
    },
    switchText: {
        fontFamily: theme.fonts.m,
        color: theme.colors.ink2,
        fontSize: 13,
        fontWeight: '600',
        textDecorationLine: 'underline',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.85)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    verifyPopup: {
        backgroundColor: theme.colors.surface,
        borderRadius: 24,
        padding: 32,
        alignItems: 'center',
        borderWidth: 3,
        borderColor: theme.colors.border,
        width: '100%',
        maxWidth: 400,
        shadowColor: theme.colors.border,
        shadowOffset: { width: 8, height: 8 },
        shadowOpacity: 1,
        shadowRadius: 0,
    },
    checkIconBox: {
        marginBottom: 20,
        backgroundColor: theme.colors.surface2,
        padding: 16,
        borderRadius: 20,
        borderWidth: 2,
        borderColor: theme.colors.green,
    },
    verifyTitle: {
        fontFamily: theme.fonts.d,
        fontSize: 28,
        color: theme.colors.ink,
        marginBottom: 12,
        textAlign: 'center',
    },
    verifyText: {
        fontFamily: theme.fonts.s,
        fontSize: 16,
        color: theme.colors.ink2,
        textAlign: 'center',
        lineHeight: 24,
        marginBottom: 28,
    },
    verifyBtn: {
        backgroundColor: theme.colors.green,
        paddingVertical: 16,
        paddingHorizontal: 32,
        borderRadius: 12,
        width: '100%',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: theme.colors.border,
        // Shadow
        shadowColor: theme.colors.border,
        shadowOffset: { width: 4, height: 4 },
        shadowOpacity: 1,
        shadowRadius: 0,
    },
    verifyBtnText: {
        fontFamily: theme.fonts.b,
        color: '#fff',
        fontSize: 18,
        fontWeight: '700',
    },
    termsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 4,
    },
    checkbox: {
        width: 22,
        height: 22,
        borderRadius: 6,
        borderWidth: 2,
        borderColor: theme.colors.border2,
        alignItems: 'center',
        justifyContent: 'center',
    },
    termsText: {
        fontFamily: theme.fonts.m,
        fontSize: 12,
        color: theme.colors.ink2,
        flex: 1,
        lineHeight: 18,
    },
    termsLink: {
        color: theme.colors.accent,
        fontWeight: '700',
        textDecorationLine: 'underline',
    },
});

export default AuthScreen;
