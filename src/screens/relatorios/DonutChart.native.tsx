import React from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { fg } from '../../theme/fgTheme';

export type DonutItem = {
  key: string;
  label: string;
  valor: number;
  color: string;
  pct: number;
};

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg - 90) * (Math.PI / 180);
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function segPath(cx: number, cy: number, ro: number, ri: number, a0: number, a1: number): string {
  const os = polar(cx, cy, ro, a0);
  const oe = polar(cx, cy, ro, a1);
  const is = polar(cx, cy, ri, a0);
  const ie = polar(cx, cy, ri, a1);
  const la = a1 - a0 > 180 ? 1 : 0;
  return [
    `M ${os.x} ${os.y}`,
    `A ${ro} ${ro} 0 ${la} 1 ${oe.x} ${oe.y}`,
    `L ${ie.x} ${ie.y}`,
    `A ${ri} ${ri} 0 ${la} 0 ${is.x} ${is.y}`,
    'Z',
  ].join(' ');
}

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
  const cx = size / 2;
  const cy = size / 2;
  const ro = size * 0.42;
  const ri = size * 0.26;
  const total = data.reduce((s, d) => s + d.valor, 0);
  if (total === 0) return null;

  let cur = 0;
  const segs = data.map((d) => {
    const ang = (d.valor / total) * 358;
    const s0 = cur;
    const s1 = cur + ang;
    cur = s1 + 2;
    return { ...d, s0, s1 };
  });

  const sel = selected ? segs.find((s) => s.key === selected) : null;

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', width: size, height: size }}>
      <Svg width={size} height={size}>
        {segs.map((seg) => {
          if (seg.s1 - seg.s0 < 0.5) return null;
          const isSel = selected === seg.key;
          const expand = isSel ? 8 : 0;
          return (
            <Path
              key={seg.key}
              d={segPath(cx, cy, ro + expand, ri, seg.s0, seg.s1)}
              fill={seg.color}
              opacity={selected && !isSel ? 0.35 : 1}
              stroke={fg.colors.bg}
              strokeWidth={2}
              onPress={() => onSelect(isSel ? null : seg.key)}
            />
          );
        })}
        <Circle cx={cx} cy={cy} r={ri - 4} fill={fg.colors.surface} />
      </Svg>

      <View
        style={{
          position: 'absolute',
          alignItems: 'center',
          justifyContent: 'center',
          width: ri * 2 - 8,
          height: ri * 2 - 8,
        }}
        pointerEvents="none"
      >
        {sel ? (
          <>
            <Text style={{ color: sel.color, fontWeight: '900', fontSize: size > 240 ? 15 : 12 }} numberOfLines={1} adjustsFontSizeToFit>
              {fmoney(sel.valor)}
            </Text>
            <Text style={{ color: fg.colors.muted, fontSize: 10, marginTop: 1 }}>
              {sel.pct.toFixed(1)}%
            </Text>
          </>
        ) : (
          <>
            <Text style={{ color: fg.colors.text, fontWeight: '900', fontSize: size > 240 ? 15 : 12 }}>
              {fmoney(total)}
            </Text>
            <Text style={{ color: fg.colors.muted, fontSize: 10, marginTop: 1 }}>total</Text>
          </>
        )}
      </View>
    </View>
  );
}
