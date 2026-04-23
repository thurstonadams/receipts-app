import React, { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StoreProvider, useStore } from './src/store/StoreContext';
import { EntitySwitcher } from './src/components/EntitySwitcher';
import { HomeScreen } from './src/screens/HomeScreen';
import { CaptureScreen } from './src/screens/CaptureScreen';
import { BatchScreen } from './src/screens/BatchScreen';
import { ReviewScreen } from './src/screens/ReviewScreen';
import { SyncScreen } from './src/screens/SyncScreen';
import { ReportScreen } from './src/screens/ReportScreen';
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
      {state.screen === 'home' && <HomeScreen onOpenSwitcher={() => setSwitcherOpen(true)} />}
      {state.screen === 'capture' && <CaptureScreen />}
      {state.screen === 'batch' && <BatchScreen />}
      {state.screen === 'review' && <ReviewScreen />}
      {state.screen === 'sync' && <SyncScreen />}
      {state.screen === 'report' && <ReportScreen />}

      <EntitySwitcher
        visible={switcherOpen}
        entities={entities}
        currentId={currentEntity.id}
        onSelect={id => {
          setEntity(id);
          setSwitcherOpen(false);
        }}
        onClose={() => setSwitcherOpen(false)}
      />

      <StatusBar style={isDark ? 'light' : 'dark'} />
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <Router />
      </StoreProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
});
