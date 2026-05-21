// App.tsx
import 'react-native-gesture-handler';
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { DarkTheme, DefaultTheme } from '@react-navigation/native';
import { Platform, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import RootNavigator from './src/navigation/RootNavigator';
import { AppThemeProvider, useAppTheme } from './src/context/ThemeContext';

function AppShell() {
  const { colors, mode } = useAppTheme();

  const navTheme = {
    ...(mode === 'dark' ? DarkTheme : DefaultTheme),
    dark: mode === 'dark',
    colors: {
      ...(mode === 'dark' ? DarkTheme.colors : DefaultTheme.colors),
      primary:      colors.accent,
      background:   colors.bg,
      card:         colors.surface,
      text:         colors.text,
      border:       colors.border,
      notification: colors.warn,
    },
  };

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={[styles.webShell, { backgroundColor: colors.bg }]}>
        <SafeAreaProvider style={styles.mobileFrame}>
          <NavigationContainer theme={navTheme}>
            <RootNavigator />
          </NavigationContainer>
        </SafeAreaProvider>
      </View>
    </GestureHandlerRootView>
  );
}

export default function App() {
  return (
    <AppThemeProvider>
      <AppShell />
    </AppThemeProvider>
  );
}

const styles = StyleSheet.create({
  webShell: {
    flex: 1,
    backgroundColor: '#0d1117',
  },
  mobileFrame: {
    flex: 1,
    width: '100%',
  },
});