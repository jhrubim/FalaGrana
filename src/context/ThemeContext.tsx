import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@fg_theme_mode';

export type ThemeMode = 'dark' | 'clean';

export type FgColors = {
  bg: string; surface: string; elevated: string;
  surface2: string; surface3: string; transparent: string;
  border: string; borderSoft: string; divider: string;
  text: string; muted: string; muted2: string;
  accent: string; accentSoft: string;
  warn: string; warning: string; warnSoft: string;
  danger: string; dangerSoft: string;
  info: string; infoSoft: string;
  accent2: string; onLight: string;
};

export const DARK_COLORS: FgColors = {
  bg:          '#0d1117',
  surface:     '#161b22',
  elevated:    '#111a11',
  surface2:    '#161b22',
  surface3:    '#111a11',
  transparent: 'transparent',
  border:      '#21262d',
  borderSoft:  '#1e3a1e',
  divider:     '#21262d',
  text:        '#e6edf3',
  muted:       '#7d8590',
  muted2:      '#4a7a4a',
  accent:      '#4ade80',
  accentSoft:  'rgba(74,222,128,0.15)',
  warn:        '#f6c453',
  warning:     '#f6c453',
  warnSoft:    'rgba(246,196,83,0.15)',
  danger:      '#f87171',
  dangerSoft:  'rgba(248,113,113,0.15)',
  info:        '#60a5fa',
  infoSoft:    'rgba(96,165,250,0.15)',
  accent2:     '#60a5fa',
  onLight:     '#0d1117',
};

export const CLEAN_COLORS: FgColors = {
  bg:          '#f6f8fa',
  surface:     '#ffffff',
  elevated:    '#f0f9f1',
  surface2:    '#ffffff',
  surface3:    '#f0f9f1',
  transparent: 'transparent',
  border:      '#d0d7de',
  borderSoft:  '#9dd49d',
  divider:     '#d0d7de',
  text:        '#1f2328',
  muted:       '#636c76',
  muted2:      '#2d6a2d',
  accent:      '#16a34a',
  accentSoft:  'rgba(22,163,74,0.12)',
  warn:        '#d97706',
  warning:     '#d97706',
  warnSoft:    'rgba(217,119,6,0.12)',
  danger:      '#d1242f',
  dangerSoft:  'rgba(209,36,47,0.12)',
  info:        '#2563eb',
  infoSoft:    'rgba(37,99,235,0.12)',
  accent2:     '#2563eb',
  onLight:     '#ffffff',
};

type ThemeCtx = {
  mode: ThemeMode;
  colors: FgColors;
  toggle: () => void;
};

const ThemeContext = createContext<ThemeCtx>({
  mode: 'dark',
  colors: DARK_COLORS,
  toggle: () => {},
});

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>('dark');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((v) => {
      if (v === 'clean' || v === 'dark') setMode(v);
    });
  }, []);

  const toggle = useCallback(() => {
    setMode((m) => {
      const next: ThemeMode = m === 'dark' ? 'clean' : 'dark';
      AsyncStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ mode, colors: mode === 'dark' ? DARK_COLORS : CLEAN_COLORS, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useAppTheme() {
  return useContext(ThemeContext);
}
