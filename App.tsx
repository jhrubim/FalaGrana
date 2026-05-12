// App.tsx
import 'react-native-gesture-handler';
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { Platform, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import RootNavigator from './src/navigation/RootNavigator';
import { navigationTheme } from './src/theme/navigationTheme';

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#0d1117' }}>
      <View style={styles.webShell}>
        <SafeAreaProvider style={styles.mobileFrame}>
          <NavigationContainer theme={navigationTheme}>
            <RootNavigator />
          </NavigationContainer>
        </SafeAreaProvider>
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  webShell: {
    flex: 1,
    alignItems: Platform.OS === 'web' ? 'center' : undefined,
    backgroundColor: '#0d1117',
  },
  mobileFrame: {
    flex: 1,
    width: '100%',
    ...Platform.select({
      web: {
        maxWidth: 600,
      },
    }),
  },
});