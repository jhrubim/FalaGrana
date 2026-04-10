# CLAUDE.md — FalaGrana

## Visão Geral
App mobile multiplataforma de finanças pessoais (Android, iOS, Web).
Stack: React Native + Expo. Backend: Supabase.

---

## Stack Técnica

| Camada              | Tecnologia                                      |
|---------------------|-------------------------------------------------|
| Framework           | React Native 0.81.5 + Expo ~54                  |
| Linguagem           | TypeScript ~5.9 (obrigatório)                   |
| UI/Navigation       | React Navigation v7 (stack + bottom tabs)       |
| Backend/DB          | Supabase (auth + banco de dados)                |
| Armazenamento local | AsyncStorage                                    |
| Animações           | React Native Reanimated ~4.1 + Gesture Handler  |
| Web support         | React Native Web + expo-start --web             |

---

## Regras de Código

- TypeScript obrigatório. Sem `any` sem justificativa explícita.
- Componentes: arrow function, tipagem de props com `interface` ou `type`.
- Estilização: `StyleSheet.create()` — sem inline styles.
- Animações: `react-native-reanimated` (não usar `Animated` da RN nativa).
- Lógica de negócio separada de UI: usar hooks (`useXxx`) ou services.
- Imports: libs externas → internas → componentes → utils → types.
- Nomes de arquivos:
  - Componentes: `PascalCase.tsx`
  - Hooks: `useCamelCase.ts`
  - Utils/services: `camelCase.ts`

---

## Design System — FalaGrana

### Identidade Visual
- **Tema**: Dark/noturno
- **Cor principal**: Verde (#4ade80) — acentos vibrantes sobre fundos escuros
- **Tom**: Moderno, clean, funcional — sem excessos decorativos

### Paleta de Cores

```ts
const colors = {
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
}
```

### Tipografia

```ts
// Textos e UI geral
fontFamily: 'DM Sans'   // pesos: 300, 400, 500, 600

// Valores financeiros e numéricos
fontFamily: 'DM Mono'   // pesos: 400, 500
```

Regras:
- Valores monetários → sempre `DM Mono`
- Labels de seção → uppercase, letterSpacing, 11–12px
- Títulos de tela → 20px, weight 500
- Corpo → 13–14px, weight 400

### Componentes — Padrões Visuais

#### Card de Saldo Principal
- Fundo: `#111a11`, borda: `#1e3a1e`, borderRadius: 16
- Valor: DM Mono 32px, símbolo R$ em verde
- Variação: verde positivo, vermelho negativo

#### Cards de Métricas (Receita / Despesa)
- Grid 2 colunas, gap 10
- Fundo: `#161b22`, borda: `#21262d`, borderRadius: 12
- Label: 11px uppercase, cor `#7d8590`
- Valor: DM Mono 18px — verde (receita), vermelho (despesa)
- Barra de progresso: 3px, cor semântica

#### Transações
- Row: ícone 36x36 (borderRadius 10) + nome/data + valor
- Fundo: `#161b22`, borda: `#21262d`, borderRadius: 12
- Valor: DM Mono 13px — verde ou vermelho
- Data: 11px, cor `#7d8590`

#### Navegação (Bottom Tabs)
- Grid 4 colunas, borderRadius 12
- Inativo: fundo `#161b22`, borda `#21262d`
- Ativo: fundo `#111a11`, borda `#4ade80`, label verde

#### Gráfico de Barras
- Barras: fundo `#21262d`, fill `#2d4a2d` (histórico), `#4ade80` (mês atual)
- Labels: 9px uppercase — `#7d8590` histórico, `#4ade80` atual
- borderRadius nas barras: `4 4 0 0`

### Espaçamento
- Padding horizontal das telas: `20`
- Gap entre cards: `10–12`
- borderRadius padrão: `12` (cards pequenos), `16` (card principal)

---

## Estrutura de Pastas

```
src/
  components/
    ui/           # Componentes genéricos (Button, Card, Badge)
    finance/      # Componentes específicos (TransactionItem, BalanceCard)
  screens/        # Telas navegáveis
  hooks/          # Lógica reutilizável (useTransactions, useBalance)
  services/       # Chamadas ao Supabase
  utils/          # Formatação (formatCurrency, formatDate)
  constants/      # Design tokens (cores, fontes, espaçamentos)
  types/          # Interfaces e tipos globais
```

---

## Utilitários Obrigatórios

```ts
// Formatação monetária
export const formatCurrency = (value: number): string =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)

// Formatação de data
export const formatDate = (date: Date): string =>
  new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
```

---

## Regras de UI

1. Nunca usar cores hardcoded fora do arquivo de constantes.
2. `shadow*` no iOS sempre acompanhado de `elevation` para Android.
3. Todo valor monetário exibido deve passar por `formatCurrency`.
4. Inputs financeiros: `keyboardType="numeric"`.
5. Listas longas: usar `FlashList` (não `FlatList`) para performance.
6. Ícones: preferir SVG via `react-native-svg`.
7. Acessibilidade: `accessibilityLabel` em todos os elementos interativos.
