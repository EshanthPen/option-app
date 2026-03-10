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
import { Mail, Lock, User, ArrowRight, BookOpen, GraduationCap } from 'lucide-react-native';

const AuthScreen = ({ onAuthSuccess, onAuthStart }) => {
    const [isLogin, setIsLogin] = useState(true);
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [schoologyUrl, setSchoologyUrl] = useState('');
    const [status, setStatus] = useState({ message: '', type: '' }); // { message: string, type: 'error' | 'success' }

    const handleAuth = async () => {
        if (!email || !password) {
            setStatus({ message: 'Please fill in all fields', type: 'error' });
            return;
        }

        setLoading(true);
        setStatus({ message: '', type: '' });
        if (isLogin && onAuthStart) onAuthStart();
        try {
            if (isLogin) {
                const { error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });
                if (error) throw error;
                
                // Small delay to ensure session is recognized if needed, then close modal
                setTimeout(() => {
                    if (onAuthSuccess) onAuthSuccess();
                }, 500);
            } else {
                const { error } = await supabase.auth.signUp({
                    email,
                    password,
                    options: {
                        data: {
                            full_name: fullName,
                            schoology_url: schoologyUrl,
                        }
                    }
                });
                if (error) throw error;
                
                if (schoologyUrl) {
                    await AsyncStorage.setItem('schoologyUrl', schoologyUrl);
                }

                setStatus({ 
                    message: 'Account created! Please check your email to confirm, then you can log in.', 
                    type: 'success' 
                });
                setIsLogin(true); // Switch to login after signup
                setPassword(''); // Clear password for login
            }
        } catch (error) {
            setStatus({ message: error.message, type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.container}
        >
            <View style={styles.card}>
                <Text style={styles.title}>{isLogin ? 'Welcome Back' : 'Create Account'}</Text>
                <Text style={styles.subtitle}>
                    {isLogin ? 'Sign in to access your dashboard' : 'Join Option to sync your data'}
                </Text>

                {status.message ? (
                    <View style={[styles.statusBanner, status.type === 'error' ? styles.errorBanner : styles.successBanner]}>
                        <Text style={styles.statusText}>{status.message}</Text>
                    </View>
                ) : null}

                <View style={styles.form}>
                    {!isLogin && (
                        <View style={styles.inputContainer}>
                            <User size={20} color="#666" style={styles.icon} />
                            <TextInput
                                style={styles.input}
                                placeholder="Full Name"
                                value={fullName}
                                onChangeText={setFullName}
                                autoCapitalize="words"
                            />
                        </View>
                    )}

                    <View style={styles.inputContainer}>
                        <Mail size={20} color="#666" style={styles.icon} />
                        <TextInput
                            style={styles.input}
                            placeholder="Email Address"
                            value={email}
                            onChangeText={setEmail}
                            autoCapitalize="none"
                            keyboardType="email-address"
                        />
                    </View>

                    <View style={styles.inputContainer}>
                        <Lock size={20} color="#666" style={styles.icon} />
                        <TextInput
                            style={styles.input}
                            placeholder="Password"
                            value={password}
                            onChangeText={setPassword}
                            secureTextEntry
                        />
                    </View>

                    {!isLogin && (
                        <View style={styles.inputContainer}>
                            <BookOpen size={20} color="#666" style={styles.icon} />
                            <TextInput
                                style={styles.input}
                                placeholder="Schoology Calendar Link (Optional)"
                                value={schoologyUrl}
                                onChangeText={setSchoologyUrl}
                                autoCapitalize="none"
                            />
                        </View>
                    )}

                    <TouchableOpacity
                        style={styles.button}
                        onPress={handleAuth}
                        disabled={loading}
                    >
                        {loading ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <>
                                <Text style={styles.buttonText}>
                                    {isLogin ? 'Login' : 'Sign Up'}
                                </Text>
                                <ArrowRight size={20} color="#fff" />
                            </>
                        )}
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={() => setIsLogin(!isLogin)}
                        style={styles.switchButton}
                    >
                        <Text style={styles.switchText}>
                            {isLogin ? "Don't have an account? Sign Up" : "Already have an account? Login"}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>
        </KeyboardAvoidingView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F8F9FA',
        justifyContent: 'center',
        padding: 20,
    },
    card: {
        backgroundColor: '#fff',
        borderRadius: 24,
        padding: 32,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 8,
    },
    statusBanner: {
        padding: 12,
        borderRadius: 12,
        marginBottom: 20,
    },
    errorBanner: {
        backgroundColor: '#FFF0F0',
        borderWidth: 1,
        borderColor: '#FFC1C1',
    },
    successBanner: {
        backgroundColor: '#F0FFF4',
        borderWidth: 1,
        borderColor: '#C1FFD7',
    },
    statusText: {
        fontSize: 14,
        textAlign: 'center',
        fontWeight: '500',
        color: '#333',
    },
    title: {
        fontSize: 32,
        fontWeight: 'bold',
        color: '#1A1A1A',
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 16,
        color: '#666',
        marginBottom: 32,
    },
    form: {
        gap: 16,
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F1F3F5',
        borderRadius: 12,
        paddingHorizontal: 16,
        height: 56,
    },
    icon: {
        marginRight: 12,
    },
    input: {
        flex: 1,
        fontSize: 16,
        color: '#1A1A1A',
    },
    button: {
        backgroundColor: '#007AFF',
        borderRadius: 12,
        height: 56,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginTop: 16,
    },
    buttonText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
    },
    switchButton: {
        marginTop: 16,
        alignItems: 'center',
    },
    switchText: {
        color: '#007AFF',
        fontSize: 14,
        fontWeight: '600',
    },
});

export default AuthScreen;
