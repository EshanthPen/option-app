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
    Image,
    Modal,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabaseClient';
import { useTheme } from '../context/ThemeContext';
import { Mail, Lock, User, ArrowRight, BookOpen, Eye, EyeOff, CheckCircle2 } from 'lucide-react-native';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';

WebBrowser.maybeCompleteAuthSession();

const AuthScreen = ({ onAuthSuccess, onAuthStart, onAuthReset }) => {
    const { theme } = useTheme();
    const S = getStyles(theme);
    const [isLogin, setIsLogin] = useState(true);
    const [loading, setLoading] = useState(false);
    const [googleLoading, setGoogleLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showVerifyModal, setShowVerifyModal] = useState(false);
    const [status, setStatus] = useState({ message: '', type: '' });

    const handleGoogleSignIn = async () => {
        setGoogleLoading(true);
        setStatus({ message: '', type: '' });
        try {
            const redirectUrl = AuthSession.makeRedirectUri({ useProxy: false });
            const { data, error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: redirectUrl,
                    skipBrowserRedirect: true,
                },
            });
            if (error) throw error;
            if (data?.url) {
                const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);
                if (result.type === 'success' && result.url) {
                    // Extract tokens from the redirect URL
                    const url = new URL(result.url);
                    const params = new URLSearchParams(url.hash?.substring(1) || url.search?.substring(1));
                    const accessToken = params.get('access_token');
                    const refreshToken = params.get('refresh_token');
                    if (accessToken && refreshToken) {
                        const { error: sessionError } = await supabase.auth.setSession({
                            access_token: accessToken,
                            refresh_token: refreshToken,
                        });
                        if (sessionError) throw sessionError;
                        if (onAuthStart) onAuthStart();
                        setTimeout(() => { if (onAuthSuccess) onAuthSuccess(); }, 500);
                    } else {
                        // Try to get session directly (web flow)
                        const { data: sessionData } = await supabase.auth.getSession();
                        if (sessionData?.session) {
                            if (onAuthStart) onAuthStart();
                            setTimeout(() => { if (onAuthSuccess) onAuthSuccess(); }, 500);
                        }
                    }
                }
            }
        } catch (error) {
            setStatus({ message: error.message || 'Google sign-in failed', type: 'error' });
            if (onAuthReset) onAuthReset();
        } finally {
            setGoogleLoading(false);
        }
    };

    const handleAuth = async () => {
        const trimmedEmail = email.trim();
        const trimmedPassword = password.trim();
        if (!trimmedEmail || !trimmedPassword) {
            setStatus({ message: 'Please fill in all fields', type: 'error' });
            return;
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
                setTimeout(() => { if (onAuthSuccess) onAuthSuccess(); }, 500);
            } else {
                const { error } = await supabase.auth.signUp({
                    email: trimmedEmail,
                    password: trimmedPassword,
                    options: {
                        data: {
                            full_name: fullName.trim(),
                            app_name: 'Option Dashboard',
                            signup_source: Platform.OS,
                            signup_date: new Date().toISOString(),
                        }
                    }
                });
                if (error) throw error;
                if (fullName) await AsyncStorage.setItem('userName', fullName);
                setShowVerifyModal(true);
                setIsLogin(true);
                setPassword('');
            }
        } catch (error) {
            let message = error.message;
            if (message.includes('rate limit')) message = "Too many attempts. Please wait a minute.";
            setStatus({ message, type: 'error' });
            if (onAuthReset) onAuthReset();
        } finally {
            setLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={S.container}>
            <View style={S.card}>
                <Text style={S.title}>{isLogin ? 'Please sign in' : 'Create Account'}</Text>

                {status.message ? (
                    <View style={[S.statusBanner, status.type === 'error' ? S.errorBanner : S.successBanner]}>
                        <Text style={S.statusText}>{status.message}</Text>
                    </View>
                ) : null}

                <View style={S.form}>
                    {!isLogin && (
                        <View style={S.inputContainer}>
                            <User size={18} color={theme.colors.ink3} />
                            <TextInput style={S.input} placeholder="Full Name" placeholderTextColor={theme.colors.ink3} value={fullName} onChangeText={setFullName} autoCapitalize="words" />
                        </View>
                    )}

                    <View style={S.inputContainer}>
                        <Mail size={18} color={theme.colors.ink3} />
                        <TextInput style={S.input} placeholder="Username or email" placeholderTextColor={theme.colors.ink3} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
                    </View>

                    <View style={S.inputContainer}>
                        <Lock size={18} color={theme.colors.ink3} />
                        <TextInput style={S.input} placeholder="Password" placeholderTextColor={theme.colors.ink3} value={password} onChangeText={setPassword} secureTextEntry={!showPassword} />
                        <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={S.eyeIcon}>
                            {showPassword ? <EyeOff size={18} color={theme.colors.ink3} /> : <Eye size={18} color={theme.colors.ink3} />}
                        </TouchableOpacity>
                    </View>

                    {isLogin && (
                        <TouchableOpacity style={S.forgotBtn}>
                            <Text style={S.forgotText}>forgot password?</Text>
                        </TouchableOpacity>
                    )}

                    <TouchableOpacity style={[S.button, loading && { opacity: 0.6 }]} onPress={handleAuth} disabled={loading || googleLoading}>
                        {loading ? (
                            <ActivityIndicator color={theme.colors.bg} />
                        ) : (
                            <Text style={S.buttonText}>{isLogin ? 'Login' : 'Create Account'}</Text>
                        )}
                    </TouchableOpacity>

                    {/* Divider */}
                    <View style={S.dividerRow}>
                        <View style={S.dividerLine} />
                        <Text style={S.dividerText}>or</Text>
                        <View style={S.dividerLine} />
                    </View>

                    {/* Google Sign-In */}
                    <TouchableOpacity style={[S.googleBtn, googleLoading && { opacity: 0.6 }]} onPress={handleGoogleSignIn} disabled={loading || googleLoading}>
                        {googleLoading ? (
                            <ActivityIndicator color={theme.colors.ink} />
                        ) : (
                            <View style={S.googleInner}>
                                <View style={S.googleIconWrap}>
                                    <Text style={{ fontSize: 18 }}>G</Text>
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={S.googleText}>Sign in with Google</Text>
                                </View>
                            </View>
                        )}
                    </TouchableOpacity>

                    <TouchableOpacity onPress={() => { setIsLogin(!isLogin); setStatus({ message: '', type: '' }); }} style={S.switchButton}>
                        <Text style={S.switchText}>
                            {isLogin ? "Need an account? Sign up" : "Already a member? Sign in"}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* Verification Modal */}
            <Modal visible={showVerifyModal} transparent animationType="fade">
                <View style={S.modalOverlay}>
                    <View style={S.verifyPopup}>
                        <View style={S.checkIconBox}>
                            <CheckCircle2 size={40} color={theme.colors.green} />
                        </View>
                        <Text style={S.verifyTitle}>Check Your Inbox</Text>
                        <Text style={S.verifyText}>
                            We've sent a verification link to <Text style={{ fontWeight: '700' }}>{email}</Text>.
                        </Text>
                        <TouchableOpacity style={S.verifyBtn} onPress={() => setShowVerifyModal(false)}>
                            <Text style={S.verifyBtnText}>Got it</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </KeyboardAvoidingView>
    );
};

const getStyles = (theme) => StyleSheet.create({
    container: { flex: 1, backgroundColor: 'transparent', justifyContent: 'center', padding: 20 },
    card: {
        backgroundColor: theme.colors.surface,
        borderRadius: 20,
        padding: 28,
        borderWidth: 1,
        borderColor: theme.colors.border,
        ...theme.shadows.md,
    },
    title: {
        fontFamily: theme.fonts.d,
        fontSize: 26,
        fontWeight: '700',
        color: theme.colors.ink,
        marginBottom: 20,
        letterSpacing: -0.3,
    },
    statusBanner: { padding: 12, borderRadius: 10, marginBottom: 16, borderWidth: 1 },
    errorBanner: { backgroundColor: theme.colors.red + '10', borderColor: theme.colors.red + '40' },
    successBanner: { backgroundColor: theme.colors.green + '10', borderColor: theme.colors.green + '40' },
    statusText: { fontFamily: theme.fonts.m, fontSize: 13, textAlign: 'center', fontWeight: '600', color: theme.colors.ink, lineHeight: 18 },
    form: { gap: 12 },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.bg,
        borderRadius: 12,
        paddingHorizontal: 14,
        height: 52,
        borderWidth: 1,
        borderColor: theme.colors.border,
        gap: 10,
    },
    input: { flex: 1, fontFamily: theme.fonts.m, fontSize: 15, color: theme.colors.ink, height: '100%' },
    eyeIcon: { padding: 4 },
    forgotBtn: { alignSelf: 'center', paddingVertical: 2 },
    forgotText: { fontFamily: theme.fonts.m, fontSize: 13, color: theme.colors.ink3 },
    button: {
        backgroundColor: theme.colors.ink,
        borderRadius: 12,
        height: 52,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 4,
        ...theme.shadows.sm,
    },
    buttonText: { color: theme.colors.bg, fontFamily: theme.fonts.s, fontSize: 17, fontWeight: '700' },
    dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 4 },
    dividerLine: { flex: 1, height: 1, backgroundColor: theme.colors.border },
    dividerText: { fontFamily: theme.fonts.m, fontSize: 13, color: theme.colors.ink3 },
    googleBtn: {
        borderRadius: 12,
        height: 52,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
        justifyContent: 'center',
        paddingHorizontal: 4,
        ...theme.shadows.sm,
    },
    googleInner: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 8 },
    googleIconWrap: {
        width: 36, height: 36, borderRadius: 8,
        backgroundColor: theme.colors.bg,
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, borderColor: theme.colors.border,
    },
    googleText: { fontFamily: theme.fonts.m, fontSize: 15, color: theme.colors.ink2, fontWeight: '500' },
    switchButton: { marginTop: 8, alignItems: 'center', paddingVertical: 8 },
    switchText: { fontFamily: theme.fonts.m, color: theme.colors.ink3, fontSize: 13 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
    verifyPopup: {
        backgroundColor: theme.colors.surface,
        borderRadius: 20, padding: 28,
        alignItems: 'center', borderWidth: 1, borderColor: theme.colors.border,
        width: '100%', maxWidth: 400, ...theme.shadows.lg,
    },
    checkIconBox: { marginBottom: 16, backgroundColor: theme.colors.green + '10', padding: 14, borderRadius: 16 },
    verifyTitle: { fontFamily: theme.fonts.d, fontSize: 24, color: theme.colors.ink, marginBottom: 8, textAlign: 'center' },
    verifyText: { fontFamily: theme.fonts.m, fontSize: 14, color: theme.colors.ink3, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
    verifyBtn: { backgroundColor: theme.colors.ink, paddingVertical: 14, borderRadius: 12, width: '100%', alignItems: 'center', ...theme.shadows.sm },
    verifyBtnText: { fontFamily: theme.fonts.s, color: theme.colors.bg, fontSize: 15, fontWeight: '700' },
});

export default AuthScreen;
