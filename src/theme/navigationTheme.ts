// src/theme/navigationTheme.ts
import { DarkTheme, type Theme } from '@react-navigation/native';
import { fg } from './fgTheme';

export const navigationTheme: Theme = {
  ...DarkTheme, // ✅ mantém fonts (regular/medium/bold/...)
  dark: true,
  colors: {
    ...DarkTheme.colors,
    primary: fg.colors.accent,
    background: fg.colors.bg,
    card: fg.colors.surface,
    text: fg.colors.text,
    border: fg.colors.border,
    notification: fg.colors.warn,
  },
};