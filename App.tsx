import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet, ActivityIndicator, Linking } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './src/lib/supabase';
import { StoreProvider, useStore } from './src/store/StoreContext';
import { AuthScreen } from './src/screens/AuthScreen';
import { ResetPasswordScreen } from './src/screens/ResetPasswordScreen';
import { EntitySwitcher } from './src/components/EntitySwitcher';
import { HomeScreen } from './src/screens/HomeScreen';
import { CaptureScreen } from './src/screens/CaptureScreen';
import { BatchScreen } from './src/screens/BatchScreen';
import { ReviewScreen } from './src/screens/ReviewScreen';
import { SyncScreen } from './src/screens/SyncScreen';
import { ReportScreen } from './src/screens/ReportScreen';
import { SearchScreen } from './src/screens/SearchScreen';
import { ForwardingScreen } from './src/screens/ForwardingScreen';
import { ReportsScreen } from './src/screens/ReportsScreen';
import { PeriodDetailScreen } from './src/screens/PeriodDetailScreen';
import { SendSheetScreen } from './src/screens/SendSheetScreen';
import { OrganizeScreen } from './src/screens/OrganizeScreen';
import { colors } from './src/theme';

function Router() {
  const { state, entities, currentEntity, setEntity } = useStore();
  const [switcherOpen, setSwitcherOpen] = useState(false);

  if (!state.ready) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const isDark = state.screen === 'capture' || state.screen === 'batch';

  return (
    <View style={{ flex: 1, backgroundColor: isDark ? '#000' : colors.bg }}>
      {state.screen === 'home'    && <HomeScreen onOpenSwitcher={() => setSwitcherOpen(true)} />}
      {state.screen === 'capture' && <CaptureScreen />}
      {state.screen === 'batch'   && <BatchScreen />}
      {state.screen === 'review'  && <ReviewScreen />}
      {state.screen === 'sync'    && <SyncScreen />}
      {state.screen === 'report'  && <ReportScreen />}
      {state.screen === 'search'  && <SearchScreen />}
      {state.screen === 'forwarding'    && <ForwardingScreen />}
      {state.screen === 'reports'       && <ReportsScreen />}
      {state.screen === 'period-detail' && <PeriodDetailScreen />}
      {state.screen === 'send-sheet'    && <SendSheetScreen />}
      {state.screen === 'organize'      && <OrganizeScreen />}

      <EntitySwitcher
        visible={switcherOpen}
        entities={entities}
        currentId={currentEntity.id}
        onSelect={id => { setEntity(id); setSwitcherOpen(false); }}
        onClose={() => setSwitcherOpen(false)}
      />
      <StatusBar style={isDark ? 'light' : 'dark'} />
    </View>
  );
}

// Extracts auth tokens from a deep-link URL that Supabase appended on
// password recovery. Supabase emits links in two shapes depending on the
// project's auth flow:
//
//   1. PKCE (default for newer projects):
//        xfixreceipts://reset-password?code=<authorization_code>
//      → exchange the code for a session via exchangeCodeForSession.
//
//   2. Implicit (older projects, magic-link style):
//        xfixreceipts://reset-password#access_token=...&refresh_token=...&type=recovery
//      → parse the fragment and call setSession directly.
//
// Either way, the result is that Supabase fires a PASSWORD_RECOVERY event
// on the auth state change channel, which flips us into the reset-password
// UI below.
async function handleRecoveryUrl(url: string): Promise<void> {
  try {
    if (!url.includes('reset-password')) return;

    // PKCE: ?code=...
    const codeMatch = url.match(/[?&]code=([^&]+)/);
    if (codeMatch) {
      const { error } = await supabase.auth.exchangeCodeForSession(decodeURIComponent(codeMatch[1]));
      if (error) console.warn('exchangeCodeForSession failed:', error.message);
      return;
    }

    // Implicit: #access_token=...&refresh_token=...
    const fragmentIndex = url.indexOf('#');
    if (fragmentIndex !== -1) {
      const fragment = url.slice(fragmentIndex + 1);
      const params = new URLSearchParams(fragment);
      const access_token = params.get('access_token');
      const refresh_token = params.get('refresh_token');
      if (access_token && refresh_token) {
        const { error } = await supabase.auth.setSession({ access_token, refresh_token });
        if (error) console.warn('setSession failed:', error.message);
      }
    }
  } catch (e) {
    console.warn('handleRecoveryUrl error:', e);
  }
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  // Set when Supabase reports PASSWORD_RECOVERY via onAuthStateChange.
  // While true, we render ResetPasswordScreen regardless of session state.
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (event === 'PASSWORD_RECOVERY') {
        setRecovering(true);
      } else if (event === 'SIGNED_OUT') {
        setRecovering(false);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // Deep-link handler — catches both cold-start (app was closed when the
  // email link was tapped) and warm-start (app was already open) cases.
  useEffect(() => {
    Linking.getInitialURL().then(url => { if (url) handleRecoveryUrl(url); });
    const sub = Linking.addEventListener('url', ({ url }) => handleRecoveryUrl(url));
    return () => sub.remove();
  }, []);

  if (authLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  // Password-recovery flow takes precedence over normal routing. The user
  // has a valid recovery session at this point; the only action that makes
  // sense is setting a new password.
  if (recovering) {
    return (
      <SafeAreaProvider>
        <ResetPasswordScreen onDone={() => setRecovering(false)} />
      </SafeAreaProvider>
    );
  }

  if (!session) {
    return (
      <SafeAreaProvider>
        <AuthScreen />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StoreProvider userId={session.user.id}>
        <Router />
      </StoreProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
});
