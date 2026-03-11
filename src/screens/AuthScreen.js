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
    Alert
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabaseClient';
import { useTheme } from '../context/ThemeContext';
import { Mail, Lock, User, ArrowRight, BookOpen, GraduationCap, X, Eye, EyeOff } from 'lucide-react-native';

const AuthScreen = ({ onAuthSuccess, onAuthStart, onAuthReset }) => {
    const { theme } = useTheme();
    const [isLogin, setIsLogin] = useState(true);
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [schoologyUrl, setSchoologyUrl] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [status, setStatus] = useState({ message: '', type: '' }); // { message: string, type: 'error' | 'success' }

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
                
                // CRITICAL: Only trigger the global "authenticating" loader ON SUCCESS
                // This prevents the infinite spinner if the credentials are wrong.
                if (onAuthStart) onAuthStart();

                // Small delay to ensure session is recognized if needed, then close modal
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
                            schoology_url: schoologyUrl.trim(),
                        }
                    }
                });
                if (error) throw error;
                
                if (schoologyUrl) {
                    await AsyncStorage.setItem('schoologyUrl', schoologyUrl);
                }

                setStatus({ 
                    message: 'Account created! Please check your email to confirm, then you can login.', 
                    type: 'success' 
                });
                setIsLogin(true); // Switch to login after signup
                setPassword(''); // Clear password for login
            }
        } catch (error) {
            let message = error.message;
            if (message.includes('rate limit')) {
                message = "Too many attempts. Please wait a minute before trying again.";
            }
            setStatus({ message, type: 'error' });
            if (onAuthReset) onAuthReset(); // Ensure global state is reset if we hit an error
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
        color: '#fff',
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
});

export default AuthScreen;
