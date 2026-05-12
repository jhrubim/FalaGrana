import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { fg } from '../../theme/fgTheme';

export type DonutItem = {
  key: string;
  label: string;
  valor: number;
  color: string;
  pct: number;
};

function fmoney(v: number) {
  return Math.abs(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function DonutChart({
  data,
  size,
  selected,
  onSelect,
}: {
  data: DonutItem[];
  size: number;
  selected: string | null;
  onSelect: (k: string | null) => void;
}) {
  const total = data.reduce((s, d) => s + d.valor, 0);
  if (total === 0) return null;

  // Conic-gradient para web — browsers modernos suportam nativamente
  let cumPct = 0;
  const stops = data.map((d) => {
    const start = cumPct;
    const end = cumPct + d.pct;
    cumPct = end;
    return `${d.color} ${start.toFixed(2)}% ${end.toFixed(2)}%`;
  });

  const conicGradient = `conic-gradient(${stops.join(', ')})`;
  const holeSize = size * 0.52;

  const sel = selected ? data.find((d) => d.key === selected) : null;

  return (
    <Pressable
      onPress={() => onSelect(null)}
      style={{ alignItems: 'center', justifyContent: 'center', width: size, height: size }}
      accessibilityLabel="Gráfico de categorias"
    >
      {/* Círculo externo com conic-gradient */}
      <View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          // @ts-ignore — conic-gradient é CSS puro (web only)
          background: conicGradient,
          opacity: 1,
        }}
      />

      {/* Buraco central */}
      <View
        style={{
          width: holeSize,
          height: holeSize,
          borderRadius: holeSize / 2,
          backgroundColor: fg.colors.surface,
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1,
        }}
      >
        {sel ? (
          <>
            <Text style={{ color: sel.color, fontWeight: '900', fontSize: size > 240 ? 15 : 12 }} numberOfLines={1}>
              {fmoney(sel.valor)}
            </Text>
            <Text style={{ color: fg.colors.muted, fontSize: 10, marginTop: 2 }}>
              {sel.pct.toFixed(1)}%
            </Text>
          </>
        ) : (
          <>
            <Text style={{ color: fg.colors.text, fontWeight: '900', fontSize: size > 240 ? 15 : 12 }}>
              {fmoney(total)}
            </Text>
            <Text style={{ color: fg.colors.muted, fontSize: 10, marginTop: 2 }}>total</Text>
          </>
        )}
      </View>

      {/* Segmentos clicáveis invisíveis sobrepostos (web) */}
      {data.map((item) => (
        <Pressable
          key={item.key}
          onPress={(e) => {
            // @ts-ignore
            e?.stopPropagation?.();
            onSelect(selected === item.key ? null : item.key);
          }}
          style={{
            position: 'absolute',
            width: size,
            height: size,
            borderRadius: size / 2,
            // não visível, apenas para capturar clique (a legenda é o meio principal no web)
            backgroundColor: 'transparent',
          }}
          accessibilityLabel={item.label}
        />
      ))}
    </Pressable>
  );
}
