// src/theme/fgTheme.ts
// Paleta alinhada ao CLAUDE.md — Design System FalaGrana
import { colors } from '../constants/colors';

export const fg = {
  colors: {
    // Fundos
    bg:       colors.bg.base,
    surface:  colors.bg.surface,
    elevated: colors.bg.elevated,

    // Aliases mantidos para compatibilidade com código existente
    surface2: colors.bg.surface,
    surface3: colors.bg.elevated,

    transparent: 'transparent',

    // Bordas
    border:     colors.border.default,
    borderSoft: colors.border.accent,
    divider:    colors.border.default,

    // Texto
    text:   colors.text.primary,
    muted:  colors.text.secondary,
    muted2: colors.text.accent,

    // Acentos semânticos
    accent:     colors.green,
    accentSoft: 'rgba(74,222,128,0.15)',

    warn:     '#f6c453',
    warning:  '#f6c453',
    warnSoft: 'rgba(246,196,83,0.15)',

    danger:     colors.red,
    dangerSoft: 'rgba(248,113,113,0.15)',

    info:     '#60a5fa',
    infoSoft: 'rgba(96,165,250,0.15)',

    accent2: '#60a5fa',

    onLight: colors.bg.base,
  },

  radius: {
    sm:   10,
    md:   12,
    lg:   16,
    pill: 999,
  },

  spacing: {
    xs:  6,
    sm:  10,
    md:  14,
    lg:  18,
    xl:  24,

    screen:       20,  // padding horizontal padrão CLAUDE.md
    screenBottom: 24,
    card:         12,
  },

  typography: {
    screenTitle: { fontSize: 20, fontWeight: '500' as const },
    title:       { fontSize: 20, fontWeight: '500' as const },
    subtitle:    { fontSize: 14, fontWeight: '400' as const },
    subInfo:     { fontSize: 11, fontWeight: '400' as const },
    section:     { fontSize: 11, fontWeight: '600' as const, letterSpacing: 0.8, textTransform: 'uppercase' as const },
    mono:        { fontFamily: 'DM Mono' },
    sans:        { fontFamily: 'DM Sans' },
  },

  shadow: {
    card: {
      shadowColor: '#000',
      shadowOpacity: 0.3,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 4,
    },
    glow: {
      shadowColor: colors.green,
      shadowOpacity: 0.2,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 0 },
      elevation: 0,
    },
  },
} as const;