import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './src/lib/supabase';
import { StoreProvider, useStore } from './src/store/StoreContext';
import { AuthScreen } from './src/screens/AuthScreen';
import { EntitySwitcher } from './src/components/EntitySwitcher';
import { HomeScreen } from './src/screens/HomeScreen';
import { CaptureScreen } from './src/screens/CaptureScreen';
import { BatchScreen } from './src/screens/BatchScreen';
import { ReviewScreen } from './src/screens/ReviewScreen';
import { SyncScreen } from './src/screens/SyncScreen';
import { ReportScreen } from './src/screens/ReportScreen';
import { SearchScreen } from './src/screens/SearchScreen';
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

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (authLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.accent} />
      </View>
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
