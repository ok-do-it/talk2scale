import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { ConnectionScreen } from '../screens/ConnectionScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { ScaleScreen } from '../screens/ScaleScreen';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootStack() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Scale" component={ScaleScreen} />
        <Stack.Screen name="Connection" component={ConnectionScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
