// Design tokens — FalaGrana Design System
// Referência: CLAUDE.md § Paleta de Cores

export const colors = {
  bg: {
    base:     '#0d1117',  // fundo principal (tela)
    surface:  '#161b22',  // cards, inputs
    elevated: '#111a11',  // cards de destaque (balanço)
  },
  border: {
    default: '#21262d',
    accent:  '#1e3a1e',
  },
  text: {
    primary:   '#e6edf3',
    secondary: '#7d8590',
    accent:    '#4a7a4a',
  },
  green: '#4ade80',  // receitas, positivo, destaque
  red:   '#f87171',  // despesas, negativo, alerta
} as const;

export type Colors = typeof colors;
