import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { RootStack } from './src/navigation/RootStack';
import { useScaleStore } from './src/state/scaleStore';

export default function App() {
  const initialize = useScaleStore((s) => s.initialize);
  const teardown = useScaleStore((s) => s.teardown);

  useEffect(() => {
    void initialize();
    return () => {
      teardown();
    };
  }, [initialize, teardown]);

  return (
    <SafeAreaProvider>
      <RootStack />
      <StatusBar style="auto" />
    </SafeAreaProvider>
  );
}
