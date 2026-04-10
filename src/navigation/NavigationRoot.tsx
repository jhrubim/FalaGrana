// src/navigation/NavigationRoot.tsx
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { FalaGranaNavigationTheme } from '../theme/navigationTheme';
import AppStack from './AppStack';

export default function NavigationRoot() {
  return (
    <NavigationContainer theme={FalaGranaNavigationTheme}>
      <AppStack />
    </NavigationContainer>
  );
}