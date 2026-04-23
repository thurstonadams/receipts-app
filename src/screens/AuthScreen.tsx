import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { Icon } from '../components/Icon';
import { colors, radius } from '../theme';

// Map Supabase auth errors to copy the end user actually benefits from.
function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return "We couldn't find an account with that email and password.";
  if (m.includes('email not confirmed')) return 'Confirm your email first — check your inbox for the link we sent.';
  if (m.includes('already registered') || m.includes('user already registered')) return 'An account with that email already exists. Try signing in instead.';
  if (m.includes('password should be at least')) return 'Password needs to be at least 6 characters.';
  if (m.includes('unable to validate email') || m.includes('valid email')) return 'That doesn\u2019t look like a valid email address.';
  if (m.includes('network') || m.includes('fetch')) return 'Network problem — check your connection and try again.';
  if (m.includes('rate') || m.includes('too many')) return 'Too many attempts. Wait a moment and try again.';
  return message || 'Something went wrong. Try again.';
}

function emailOk(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

export function AuthScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);

  const canSubmit =
    emailOk(email) &&
    (mode === 'signIn' ? password.length >= 1 : password.length >= 6) &&
    !loading;

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    try {
      if (mode === 'signIn') {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) setError(friendlyAuthError(error.message));
      } else {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (error) setError(friendlyAuthError(error.message));
        else setPendingEmail(email.trim());
      }
    } finally {
      setLoading(false);
    }
  }

  async function resendConfirmation() {
    if (!pendingEmail) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email: pendingEmail });
      if (error) Alert.alert("Couldn't resend", friendlyAuthError(error.message));
      else Alert.alert('Sent', `A new confirmation link is on its way to ${pendingEmail}.`);
    } finally {
      setLoading(false);
    }
  }

  async function handlePasswordReset() {
    if (!emailOk(email)) {
      Alert.alert('Email first', 'Enter your email address above, then tap "Forgot password?" again.');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
      if (error) Alert.alert("Couldn't send reset", friendlyAuthError(error.message));
      else Alert.alert('Check your email', `If an account exists for ${email.trim()}, a password reset link is on its way.`);
    } finally {
      setLoading(false);
    }
  }

  // Post-signup confirmation panel.
  if (pendingEmail) {
    return (
      <SafeAreaView style={s.safe}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.inner}>
          <View style={s.checkIconWrap}>
            <Icon name="check" size={36} color={colors.success} />
          </View>
          <Text style={s.title}>Check your email</Text>
          <Text style={s.pendingSub}>
            We sent a confirmation link to{'\n'}
            <Text style={s.pendingEmail}>{pendingEmail}</Text>.{'\n\n'}
            Tap the link, then come back here and sign in.
          </Text>
          <TouchableOpacity style={s.button} onPress={() => { setPendingEmail(null); setMode('signIn'); setPassword(''); }} disabled={loading}>
            <Text style={s.buttonText}>Back to sign in</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={resendConfirmation} disabled={loading} style={{ marginTop: 16 }}>
            <Text style={s.toggle}>
              {loading ? 'Sending\u2026' : "Didn't get it? Resend link"}
            </Text>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.inner}>
        <Text style={s.title}>xFix Receipts</Text>
        <Text style={s.subtitle}>
          {mode === 'signIn' ? 'Sign in to continue' : 'Create your account'}
        </Text>

        <TextInput
          style={s.input} placeholder="Email" placeholderTextColor={colors.textSecondary}
          value={email} onChangeText={t => { setEmail(t); if (error) setError(null); }}
          autoCapitalize="none" keyboardType="email-address" autoCorrect={false}
          textContentType="emailAddress" returnKeyType="next"
        />
        <TextInput
          style={s.input} placeholder={mode === 'signUp' ? 'Password (min 6 characters)' : 'Password'}
          placeholderTextColor={colors.textSecondary}
          value={password} onChangeText={t => { setPassword(t); if (error) setError(null); }}
          secureTextEntry autoCapitalize="none"
          textContentType={mode === 'signUp' ? 'newPassword' : 'password'}
          returnKeyType="done"
          onSubmitEditing={() => canSubmit && handleSubmit()}
        />

        {error && <Text style={s.error}>{error}</Text>}

        <TouchableOpacity
          style={[s.button, !canSubmit && s.buttonDisabled]}
          onPress={handleSubmit}
          disabled={!canSubmit}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.buttonText}>{mode === 'signIn' ? 'Sign In' : 'Create account'}</Text>}
        </TouchableOpacity>

        {mode === 'signIn' && (
          <TouchableOpacity onPress={handlePasswordReset} disabled={loading} style={{ marginTop: 12 }}>
            <Text style={s.subtleLink}>Forgot password?</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity onPress={() => { setMode(m => m === 'signIn' ? 'signUp' : 'signIn'); setError(null); }} style={{ marginTop: 6 }}>
          <Text style={s.toggle}>
            {mode === 'signIn' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
          </Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  inner: { flex: 1, justifyContent: 'center', paddingHorizontal: 32, gap: 12 },
  title: { fontSize: 28, fontWeight: '700', color: colors.text, marginBottom: 4 },
  subtitle: { fontSize: 16, color: colors.textSecondary, marginBottom: 16 },
  input: {
    backgroundColor: colors.card, borderRadius: radius.control,
    paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 16, color: colors.text,
  },
  button: {
    backgroundColor: colors.accent, borderRadius: radius.control,
    paddingVertical: 16, alignItems: 'center', marginTop: 8,
  },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  toggle: { color: colors.accent, fontSize: 14, textAlign: 'center', marginTop: 8 },
  subtleLink: { color: colors.textSecondary, fontSize: 13, textAlign: 'center' },
  error: { color: colors.warning, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  checkIconWrap: {
    width: 72, height: 72, borderRadius: 99,
    backgroundColor: 'rgba(46,95,90,0.1)',
    alignItems: 'center', justifyContent: 'center',
    alignSelf: 'center', marginBottom: 16,
  },
  pendingSub: {
    fontSize: 15, color: colors.textSecondary, textAlign: 'center',
    lineHeight: 22, marginBottom: 24,
  },
  pendingEmail: { color: colors.text, fontWeight: '600' },
});
