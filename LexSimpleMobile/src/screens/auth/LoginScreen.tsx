import React, { useState } from 'react';
import {
    ActivityIndicator,
    Image,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { hasSupabaseConfig, supabase } from '../../services/supabaseClient';

type Mode = 'login' | 'register' | 'confirm' | 'reset' | 'recoveryCode' | 'newPassword';

export default function LoginScreen() {
    const { continueAsGuest, beginRecovery, finishRecovery, cancelRecovery } = useAuth();
    const [mode, setMode] = useState<Mode>('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [code, setCode] = useState('');
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const run = async (action: () => Promise<void>) => {
        if (busy) return;
        setBusy(true);
        setError('');
        setMessage('');
        try { await action(); }
        catch (cause) { setError(cause instanceof Error ? cause.message : 'Please try again.'); }
        finally { setBusy(false); }
    };
    const normalizedEmail = email.trim().toLowerCase();
    const submit = () => void run(async () => {
        if (!supabase) throw new Error('Supabase Auth is not configured yet.');
        if (mode !== 'newPassword' && !/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
            throw new Error('Enter a valid email address.');
        }
        if (mode === 'login') {
            const { error: issue } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
            if (issue) throw issue;
        } else if (mode === 'register') {
            if (password.length < 8) throw new Error('Use at least 8 characters for your password.');
            const { error: issue } = await supabase.auth.signUp({ email: normalizedEmail, password });
            if (issue) throw issue;
            setMode('confirm');
            setMessage('Check your email for the verification code.');
        } else if (mode === 'confirm') {
            const { error: issue } = await supabase.auth.verifyOtp({
                email: normalizedEmail, token: code.trim(), type: 'email',
            });
            if (issue) throw issue;
        } else if (mode === 'reset') {
            const { error: issue } = await supabase.auth.resetPasswordForEmail(normalizedEmail);
            if (issue) throw issue;
            beginRecovery();
            setMode('recoveryCode');
            setMessage('If this account exists, check your email for a reset code.');
        } else if (mode === 'recoveryCode') {
            const { error: issue } = await supabase.auth.verifyOtp({
                email: normalizedEmail, token: code.trim(), type: 'recovery',
            });
            if (issue) throw issue;
            setPassword('');
            setMode('newPassword');
        } else {
            if (password.length < 8) throw new Error('Use at least 8 characters for your new password.');
            const { error: issue } = await supabase.auth.updateUser({ password });
            if (issue) throw issue;
            await finishRecovery();
            setPassword('');
            setMode('login');
            setMessage('Password changed. Log in with your new password.');
        }
    });

    const heading = mode === 'login'
        ? 'Welcome to Lex-Simple'
        : mode === 'register'
            ? 'Create an account'
            : mode === 'confirm'
                ? 'Verify your email'
                : mode === 'newPassword'
                    ? 'Choose a new password'
                    : 'Reset your password';

    return (
        <SafeAreaView style={styles.safe}>
            <KeyboardAvoidingView
                style={styles.flex}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <ScrollView
                    contentContainerStyle={styles.content}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    <View style={styles.brand}>
                        <Image
                            source={require('../../../assets/Lex-Simpe-Logo.png')}
                            style={styles.logo}
                            resizeMode="contain"
                        />
                        <Text style={styles.brandName}>Lex-Simple</Text>
                    </View>

                    <View style={styles.card}>
                        <Text style={styles.eyebrow}>YOUR LEGAL COMPANION</Text>
                        <Text style={styles.heading}>{heading}</Text>
                        <Text style={styles.description}>
                            {mode === 'login'
                                ? 'Understand documents and keep your scans in one place.'
                                : mode === 'register'
                                    ? 'An account will give your scans and chats their own space.'
                                    : mode === 'confirm'
                                        ? 'Enter the code from your confirmation email.'
                                        : mode === 'newPassword'
                                            ? 'Your reset code is verified. Set a new password.'
                                            : 'Enter the code from your email to reset your password.'}
                        </Text>

                        {!hasSupabaseConfig && <Text style={styles.warning}>Set the Supabase URL and publishable key to enable email login.</Text>}
                        {!!message && <Text style={styles.notice}>{message}</Text>}
                        {!!error && <Text accessibilityRole="alert" style={styles.warning}>{error}</Text>}
                        {mode !== 'newPassword' && (
                            <>
                                <Text style={styles.label}>Email address</Text>
                                <TextInput
                                    style={styles.input}
                                    placeholder="you@example.com"
                                    placeholderTextColor="#9A9AAA"
                                    keyboardType="email-address"
                                    autoCapitalize="none"
                                    autoComplete="email"
                                    value={email}
                                    onChangeText={setEmail}
                                    editable={!busy && mode !== 'confirm' && mode !== 'recoveryCode'}
                                />
                            </>
                        )}
                        {(mode === 'login' || mode === 'register' || mode === 'newPassword') && (
                            <>
                                <Text style={styles.label}>{mode === 'newPassword' ? 'New password' : 'Password'}</Text>
                                <TextInput
                                    style={styles.input}
                                    placeholder="Enter password"
                                    placeholderTextColor="#9A9AAA"
                                    secureTextEntry
                                    autoComplete={mode === 'register' || mode === 'newPassword' ? 'new-password' : 'password'}
                                    value={password}
                                    onChangeText={setPassword}
                                    editable={!busy}
                                />
                            </>
                        )}
                        {(mode === 'confirm' || mode === 'recoveryCode') && (
                            <>
                                <Text style={styles.label}>Code from email</Text>
                                <TextInput
                                    style={styles.input}
                                    placeholder="Enter verification code"
                                    placeholderTextColor="#9A9AAA"
                                    keyboardType="number-pad"
                                    autoComplete="one-time-code"
                                    value={code}
                                    onChangeText={setCode}
                                    editable={!busy}
                                />
                            </>
                        )}

                        <TouchableOpacity
                            style={[styles.primaryButton, (busy || !hasSupabaseConfig) && styles.disabled]}
                            disabled={busy || !hasSupabaseConfig}
                            onPress={submit}
                            accessibilityRole="button"
                            accessibilityState={{ disabled: busy || !hasSupabaseConfig }}
                        >
                            {busy ? <ActivityIndicator color="#FFFFFF" /> : (
                                <Text style={styles.primaryText}>
                                    {mode === 'login' ? 'Log in'
                                        : mode === 'register' ? 'Create account'
                                            : mode === 'confirm' ? 'Verify email'
                                                : mode === 'reset' ? 'Send reset code'
                                                    : mode === 'recoveryCode' ? 'Verify reset code'
                                                        : 'Save new password'}
                                </Text>
                            )}
                        </TouchableOpacity>

                        {mode === 'login' ? (
                            <View style={styles.links}>
                                <TouchableOpacity onPress={() => setMode('reset')}>
                                    <Text style={styles.link}>Forgot password?</Text>
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => setMode('register')}>
                                    <Text style={styles.link}>Create account</Text>
                                </TouchableOpacity>
                            </View>
                        ) : mode === 'confirm' ? (
                            <TouchableOpacity style={styles.backLink} disabled={busy} onPress={() => void run(async () => {
                                if (!supabase) throw new Error('Supabase Auth is not configured yet.');
                                const { error: issue } = await supabase.auth.resend({ type: 'signup', email: normalizedEmail });
                                if (issue) throw issue;
                                setMessage('A new verification code was sent.');
                            })}>
                                <Text style={styles.link}>Resend code</Text>
                            </TouchableOpacity>
                        ) : null}
                        {mode !== 'login' && (
                            <TouchableOpacity style={styles.backLink} disabled={busy} onPress={() => void run(async () => {
                                if (mode === 'recoveryCode' || mode === 'newPassword') await cancelRecovery();
                                setMode('login');
                            })}>
                                <Text style={styles.link}>Back to log in</Text>
                            </TouchableOpacity>
                        )}

                        <View style={styles.divider} />
                        <TouchableOpacity
                            style={styles.guestButton}
                            onPress={() => void run(async () => {
                                if (mode === 'recoveryCode' || mode === 'newPassword') await cancelRecovery();
                                await continueAsGuest();
                            })}
                            disabled={busy}
                            accessibilityRole="button"
                        >
                            {busy ? (
                                <ActivityIndicator color="#6855D9" />
                            ) : (
                                <Text style={styles.guestText}>Continue as guest</Text>
                            )}
                        </TouchableOpacity>
                        <Text style={styles.privacyNote}>
                            Your existing guest scans stay on this device.
                        </Text>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    flex: { flex: 1 },
    safe: { flex: 1, backgroundColor: '#F7F8FC' },
    content: {
        flexGrow: 1,
        justifyContent: 'center',
        paddingHorizontal: 20,
        paddingVertical: 30,
    },
    brand: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center', marginBottom: 24 },
    logo: { width: 38, height: 38, marginRight: 8 },
    brandName: { fontSize: 22, fontWeight: '800', color: '#26243B', letterSpacing: -0.5 },
    card: {
        width: '100%',
        maxWidth: 440,
        alignSelf: 'center',
        padding: 24,
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#E8E8F0',
        borderRadius: 20,
    },
    eyebrow: { color: '#6855D9', fontSize: 11, fontWeight: '800', letterSpacing: 1.1, marginBottom: 10 },
    heading: { color: '#25243A', fontSize: 27, fontWeight: '800', letterSpacing: -0.7 },
    description: { color: '#686B7C', fontSize: 14, lineHeight: 21, marginTop: 8, marginBottom: 23 },
    label: { color: '#35364D', fontSize: 13, fontWeight: '700', marginBottom: 8 },
    input: {
        height: 50,
        paddingHorizontal: 14,
        marginBottom: 17,
        borderRadius: 11,
        borderWidth: 1,
        borderColor: '#DCDDE9',
        color: '#28283D',
        backgroundColor: '#FFFFFF',
        fontSize: 15,
    },
    primaryButton: {
        height: 50,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 11,
        backgroundColor: '#6855D9',
        marginTop: 4,
    },
    disabled: { opacity: 0.48 },
    primaryText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
    warning: { color: '#AE303D', fontSize: 13, lineHeight: 19, marginBottom: 14 },
    notice: { color: '#27805F', fontSize: 13, lineHeight: 19, marginBottom: 14 },
    links: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 18, gap: 12 },
    link: { color: '#6855D9', fontSize: 13, fontWeight: '700' },
    backLink: { alignSelf: 'center', marginTop: 18 },
    divider: { height: 1, backgroundColor: '#E9E9F1', marginTop: 25, marginBottom: 20 },
    guestButton: {
        height: 50,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 11,
        borderWidth: 1,
        borderColor: '#C9C3F3',
        backgroundColor: '#F8F7FF',
    },
    guestText: { color: '#5848B8', fontSize: 15, fontWeight: '800' },
    privacyNote: { color: '#898B9B', fontSize: 12, textAlign: 'center', marginTop: 12 },
});