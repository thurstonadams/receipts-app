import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { Icon } from '../components/Icon';
import { colors, radius } from '../theme';

// Shown after the user taps a password-recovery link in email and the
// deep-link handler in App.tsx puts us in a recovery session. The user is
// authenticated in a special, short-lived recovery state — the only action
// that makes sense here is setting a new password.
export function ResetPasswordScreen({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    password.length >= 6 &&
    confirm.length >= 6 &&
    password === confirm &&
    !loading;

  async function handleSubmit() {
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      setError('Password needs to be at least 6 characters.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setError(error.message || 'Could not update password. Try again.');
        return;
      }
      // Sign out of the recovery session so the user lands on the normal
      // sign-in screen and re-authenticates with the new password.
      await supabase.auth.signOut();
      Alert.alert(
        'Password updated',
        'Sign in with your new password.',
        [{ text: 'OK', onPress: onDone }],
      );
    } catch (e: any) {
      setError(e?.message || 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.inner}>
        <View style={s.iconWrap}>
          <Icon name="lock" size={32} color={colors.accent} />
        </View>
        <Text style={s.title}>Set a new password</Text>
        <Text style={s.subtitle}>Choose something you'll remember. Minimum 6 characters.</Text>

        <TextInput
          style={s.input}
          placeholder="New password"
          placeholderTextColor={colors.textSecondary}
          value={password}
          onChangeText={t => { setPassword(t); if (error) setError(null); }}
          secureTextEntry
          autoCapitalize="none"
          textContentType="newPassword"
          returnKeyType="next"
        />
        <TextInput
          style={s.input}
          placeholder="Confirm password"
          placeholderTextColor={colors.textSecondary}
          value={confirm}
          onChangeText={t => { setConfirm(t); if (error) setError(null); }}
          secureTextEntry
          autoCapitalize="none"
          textContentType="newPassword"
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
            : <Text style={s.buttonText}>Update password</Text>}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={async () => { await supabase.auth.signOut(); onDone(); }}
          disabled={loading}
          style={{ marginTop: 12 }}
        >
          <Text style={s.subtleLink}>Cancel and return to sign in</Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  inner: { flex: 1, justifyContent: 'center', paddingHorizontal: 32, gap: 12 },
  iconWrap: {
    width: 64, height: 64, borderRadius: 99,
    backgroundColor: 'rgba(46,95,90,0.1)',
    alignItems: 'center', justifyContent: 'center',
    alignSelf: 'center', marginBottom: 12,
  },
  title: { fontSize: 26, fontWeight: '700', color: colors.text, textAlign: 'center', marginBottom: 4 },
  subtitle: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', marginBottom: 16 },
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
  subtleLink: { color: colors.textSecondary, fontSize: 13, textAlign: 'center' },
  error: { color: colors.warning, fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
