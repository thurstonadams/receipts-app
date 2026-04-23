import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { colors, radius } from '../theme';

export function AuthScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    setMessage(null);
    if (mode === 'signIn') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
    } else {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) setError(error.message);
      else setMessage('Check your email to confirm your account, then sign in.');
    }
    setLoading(false);
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
          value={email} onChangeText={setEmail}
          autoCapitalize="none" keyboardType="email-address" autoCorrect={false}
        />
        <TextInput
          style={s.input} placeholder="Password" placeholderTextColor={colors.textSecondary}
          value={password} onChangeText={setPassword} secureTextEntry
        />

        {error ? <Text style={s.error}>{error}</Text> : null}
        {message ? <Text style={s.message}>{message}</Text> : null}

        <TouchableOpacity style={s.button} onPress={handleSubmit} disabled={loading}>
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.buttonText}>{mode === 'signIn' ? 'Sign In' : 'Sign Up'}</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => { setMode(m => m === 'signIn' ? 'signUp' : 'signIn'); setError(null); }}>
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
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  toggle: { color: colors.accent, fontSize: 14, textAlign: 'center', marginTop: 8 },
  error: { color: colors.warning, fontSize: 14, textAlign: 'center' },
  message: { color: colors.success, fontSize: 14, textAlign: 'center' },
});
