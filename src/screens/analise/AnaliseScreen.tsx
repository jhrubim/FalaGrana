import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Svg, { Circle, G, Line, Path, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { fg } from '../../theme/fgTheme';

// ─── Types ────────────────────────────────────────────────────────────────────

type Transacao = {
  id: string;
  tipo: string | null;
  valor: number | null;
  data_despesa: string | null;
  grupo: string | null;
  status: string | null;
};

type GrupoAtivo = { grupo_id: string; nome_grupo: string };
type PeriodoMode = '3m' | '6m' | '1a' | 'total';

interface DualBarData { label: string; receita: number; despesa: number }
interface HBarItem    { label: string; value: number; pct: number; color: string }
interface LineData    { name: string; color: string; points: number[] }
interface HeatRow     { monthLabel: string; weeks: number[] }

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ymdStr = (d: Date) => d.toISOString().slice(0, 10);

function calcRange(mode: PeriodoMode): { ini: string; fim: string } {
  const hoje = new Date();
  if (mode === 'total') return { ini: '', fim: '' };
  if (mode === '1a') return { ini: `${hoje.getFullYear()}-01-01`, fim: ymdStr(hoje) };
  const months = mode === '3m' ? 3 : 6;
  const start = new Date(hoje.getFullYear(), hoje.getMonth() - months + 1, 1);
  return { ini: ymdStr(start), fim: ymdStr(hoje) };
}

const fmoney = (v: number) =>
  Math.abs(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmoneyK = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : Math.round(v).toString());

const MESES_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const LINE_COLORS = ['#4ade80', '#60a5fa', '#f59e0b'];

const PERIODO_OPTIONS: Array<{ mode: PeriodoMode; label: string }> = [
  { mode: '3m',    label: '3 meses'  },
  { mode: '6m',    label: '6 meses'  },
  { mode: '1a',    label: 'Este ano' },
  { mode: 'total', label: 'Tudo'     },
];

// ─── SVG Charts ───────────────────────────────────────────────────────────────

/** 1. Barras duplas: receita (verde) vs despesa (vermelho) por mês */
function DualBarChart({ data, width }: { data: DualBarData[]; width: number }) {
  const c = fg.colors;
  const H = 180, PL = 44, PR = 8, PT = 12, PB = 24;
  const chartW = width - PL - PR;
  const chartH = H - PT - PB;
  if (!data.length) return null;

  const maxV = Math.max(...data.map(d => Math.max(d.receita, d.despesa)), 1);
  const n = data.length;
  const groupW = chartW / n;
  const barW = Math.min(groupW * 0.3, 18);
  const sy = (v: number) => PT + chartH * (1 - v / maxV);

  return (
    <Svg width={width} height={H}>
      {([0.25, 0.5, 0.75, 1] as const).map((f, i) => (
        <G key={i}>
          <Line
            x1={PL} y1={PT + chartH * (1 - f)}
            x2={width - PR} y2={PT + chartH * (1 - f)}
            stroke={c.border} strokeWidth={0.5}
          />
          <SvgText x={PL - 3} y={PT + chartH * (1 - f) + 3.5}
            textAnchor="end" fontSize={8} fill={c.muted}>
            {fmoneyK(maxV * f)}
          </SvgText>
        </G>
      ))}

      {data.map((d, i) => {
        const cx = PL + groupW * i + groupW / 2;
        const neg = d.despesa > d.receita;
        return (
          <G key={i}>
            <Rect
              x={cx - barW - 1} y={sy(d.receita)} width={barW}
              height={(d.receita / maxV) * chartH} rx={3}
              fill={neg ? `${c.accent}44` : c.accent}
            />
            <Rect
              x={cx + 1} y={sy(d.despesa)} width={barW}
              height={(d.despesa / maxV) * chartH} rx={3}
              fill={neg ? c.danger : `${c.danger}44`}
            />
            <SvgText x={cx} y={H - 5} textAnchor="middle" fontSize={9}
              fill={neg ? c.danger : c.muted}>
              {d.label}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

/** 2. Barras horizontais: pareto de categorias */
function HBarChart({ data, width }: { data: HBarItem[]; width: number }) {
  const c = fg.colors;
  const rowH = 30, PL = 90, PR = 38, PT = 4;
  const chartW = width - PL - PR;
  const H = data.length * rowH + PT + 4;
  const maxV = data[0]?.value || 1;

  return (
    <Svg width={width} height={H}>
      {data.map((d, i) => {
        const y = PT + i * rowH;
        const barH = 7, barY = y + (rowH - barH) / 2;
        const barW = (d.value / maxV) * chartW;
        return (
          <G key={i}>
            <SvgText x={PL - 6} y={barY + barH / 2 + 3.5}
              textAnchor="end" fontSize={11} fill={c.text}>
              {d.label.length > 12 ? d.label.slice(0, 11) + '…' : d.label}
            </SvgText>
            <Rect x={PL} y={barY} width={chartW} height={barH} rx={3.5} fill={c.border} />
            <Rect x={PL} y={barY} width={barW} height={barH} rx={3.5} fill={d.color} />
            <SvgText x={PL + chartW + 5} y={barY + barH / 2 + 3.5}
              textAnchor="start" fontSize={10} fill={c.muted}>
              {d.pct.toFixed(0)}%
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

/** 3. Taxa de poupança: barras positivas/negativas por mês */
function SavingsChart({ data, width }: { data: Array<{ label: string; rate: number }>; width: number }) {
  const c = fg.colors;
  const H = 120, PL = 34, PR = 8, PT = 10, PB = 20;
  const chartW = width - PL - PR;
  const chartH = H - PT - PB;
  const midY = PT + chartH / 2;
  const maxAbs = Math.max(...data.map(d => Math.abs(d.rate)), 0.05);
  const n = data.length;
  const barW = Math.min((chartW / n) * 0.55, 28);

  return (
    <Svg width={width} height={H}>
      <Line x1={PL} y1={midY} x2={width - PR} y2={midY} stroke={c.border} strokeWidth={1} />
      <SvgText x={PL - 3} y={PT + 3.5} textAnchor="end" fontSize={8} fill={c.accent}>
        +{(maxAbs * 100).toFixed(0)}%
      </SvgText>
      <SvgText x={PL - 3} y={H - PB} textAnchor="end" fontSize={8} fill={c.danger}>
        -{(maxAbs * 100).toFixed(0)}%
      </SvgText>

      {data.map((d, i) => {
        const cx = PL + (chartW / n) * i + chartW / n / 2;
        const pos = d.rate >= 0;
        const barH = Math.max((Math.abs(d.rate) / maxAbs) * (chartH / 2), 2);
        const barY = pos ? midY - barH : midY;
        const labelY = pos ? barY - 4 : barY + barH + 10;
        return (
          <G key={i}>
            <Rect x={cx - barW / 2} y={barY} width={barW} height={barH} rx={3}
              fill={pos ? c.accent : c.danger} />
            <SvgText x={cx} y={H - 5} textAnchor="middle" fontSize={9}
              fill={pos ? c.muted : c.danger}>{d.label}</SvgText>
            <SvgText x={cx} y={labelY} textAnchor="middle" fontSize={8}
              fill={pos ? c.accent : c.danger}>
              {`${pos ? '+' : ''}${(d.rate * 100).toFixed(0)}%`}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

/** 4. Multi-line: evolução de top categorias */
function MultiLineChart({ lines, xLabels, width }: { lines: LineData[]; xLabels: string[]; width: number }) {
  const c = fg.colors;
  const H = 165, PL = 44, PR = 58, PT = 12, PB = 22;
  const chartW = width - PL - PR;
  const chartH = H - PT - PB;
  const n = xLabels.length;
  if (!n || !lines.length) return null;

  const allVals = lines.flatMap(l => l.points);
  const maxV = Math.max(...allVals, 1);
  const xPos = (i: number) => PL + (i / Math.max(n - 1, 1)) * chartW;
  const yPos = (v: number) => PT + chartH - (v / maxV) * chartH;

  return (
    <Svg width={width} height={H}>
      {([0, 0.5, 1] as const).map((f, i) => (
        <G key={i}>
          <Line x1={PL} y1={PT + chartH * (1 - f)} x2={PL + chartW} y2={PT + chartH * (1 - f)}
            stroke={c.border} strokeWidth={0.5} />
          {f > 0 && (
            <SvgText x={PL - 3} y={PT + chartH * (1 - f) + 3.5}
              textAnchor="end" fontSize={8} fill={c.muted}>
              {fmoneyK(maxV * f)}
            </SvgText>
          )}
        </G>
      ))}

      {lines.map((line, li) => {
        const pts = line.points.map((v, i) => `${xPos(i).toFixed(1)},${yPos(v).toFixed(1)}`).join(' ');
        const lastX = xPos(n - 1);
        const lastY = yPos(line.points[n - 1] ?? 0);
        return (
          <G key={li}>
            <Polyline points={pts} fill="none" stroke={line.color}
              strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
            {line.points.map((v, i) => (
              <Circle key={i} cx={xPos(i)} cy={yPos(v)} r={3.5} fill={line.color} />
            ))}
            <SvgText x={lastX + 6} y={lastY + 4} fontSize={9} fill={line.color}>
              {line.name.length > 9 ? line.name.slice(0, 8) + '…' : line.name}
            </SvgText>
          </G>
        );
      })}

      {xLabels.map((lbl, i) => (
        <SvgText key={i} x={xPos(i)} y={H - 5} textAnchor="middle" fontSize={9} fill={c.muted}>
          {lbl}
        </SvgText>
      ))}
    </Svg>
  );
}

/** 5. Heatmap: semanas × meses */
function WeekHeatmap({ data, width }: { data: HeatRow[]; width: number }) {
  const c = fg.colors;
  const n = data.length;
  if (!n) return null;

  const labelW = 32, gap = 4, cols = 4;
  const cellW = Math.floor((width - labelW - gap * (cols - 1)) / cols);
  const cellH = 22;
  const H = n * (cellH + gap) + 22;
  const allVals = data.flatMap(d => d.weeks);
  const maxV = Math.max(...allVals, 1);

  return (
    <Svg width={width} height={H}>
      {['S1', 'S2', 'S3', 'S4'].map((w, wi) => (
        <SvgText key={wi}
          x={labelW + wi * (cellW + gap) + cellW / 2}
          y={13} textAnchor="middle" fontSize={9} fill={c.muted}>
          {w}
        </SvgText>
      ))}

      {data.map((row, ri) => (
        <G key={ri}>
          <SvgText
            x={labelW - 4}
            y={20 + ri * (cellH + gap) + cellH / 2 + 3.5}
            textAnchor="end" fontSize={9} fill={c.muted}>
            {row.monthLabel}
          </SvgText>
          {row.weeks.map((v, wi) => {
            const t = v / maxV;
            const x = labelW + wi * (cellW + gap);
            const y = 20 + ri * (cellH + gap);
            return (
              <G key={wi}>
                <Rect x={x} y={y} width={cellW} height={cellH} rx={4}
                  fill={`rgba(74,222,128,${(0.06 + t * 0.52).toFixed(2)})`} />
                {t > 0.38 && (
                  <SvgText x={x + cellW / 2} y={y + cellH / 2 + 3.5}
                    textAnchor="middle" fontSize={8} fill={c.accent}>
                    {fmoneyK(v)}
                  </SvgText>
                )}
              </G>
            );
          })}
        </G>
      ))}
    </Svg>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function AnaliseScreen() {
  const { width: screenW } = useWindowDimensions();
  const chartW = screenW - 40;
  const c = fg.colors;

  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);
  const [transacoes, setTransacoes]     = useState<Transacao[]>([]);
  const [grupoAtivo, setGrupoAtivo]     = useState<GrupoAtivo | null>(null);
  const [periodoMode, setPeriodoMode]   = useState<PeriodoMode>('6m');

  // Refs para useFocusEffect (evita stale closure)
  const grupoIdRef  = useRef<string | null>(null);
  const rangeRef    = useRef(calcRange('6m'));

  useEffect(() => { grupoIdRef.current = grupoAtivo?.grupo_id ?? null; }, [grupoAtivo]);

  // ── Fetch helpers ─────────────────────────────────────────────────────────

  const fetchGrupo = useCallback(async (): Promise<GrupoAtivo> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Não autenticado');
    const { data, error } = await supabase
      .from('grupo_membros')
      .select('grupo_id, grupos_financeiros(id, nome)')
      .eq('user_id', user.id)
      .eq('status', 'ativo')
      .order('created_at', { ascending: true })
      .limit(1)
      .single();
    if (error || !data) throw new Error('Grupo não encontrado');
    const g = data as any;
    return { grupo_id: g.grupo_id, nome_grupo: g.grupos_financeiros?.nome ?? 'Meu grupo' };
  }, []);

  const fetchTransacoes = useCallback(async (
    grupoId: string, ini: string, fim: string
  ): Promise<Transacao[]> => {
    const PAGE = 1000;
    const hoje = ymdStr(new Date());
    let all: Transacao[] = [];
    let from = 0;
    while (true) {
      let q = supabase
        .from('transacoes')
        .select('id,tipo,valor,data_despesa,grupo,status')
        .eq('grupo_id', grupoId)
        .in('tipo', ['despesa', 'receita'])
        .order('data_despesa', { ascending: true })
        .range(from, from + PAGE - 1);
      if (ini && fim) q = q.gte('data_despesa', ini).lte('data_despesa', fim).lte('data_despesa', hoje);
      const { data, error } = await q;
      if (error) throw error;
      all = all.concat((data || []) as Transacao[]);
      if (!data || data.length < PAGE) break;
      from += PAGE;
    }
    return all;
  }, []);

  // ── Load helpers ──────────────────────────────────────────────────────────

  const loadTransacoes = useCallback(async (gid: string, ini: string, fim: string) => {
    try {
      const txs = await fetchTransacoes(gid, ini, fim);
      setTransacoes(txs);
    } catch (e) {
      console.error('AnaliseScreen.loadTransacoes:', e);
    }
  }, [fetchTransacoes]);

  // ── Period change: set mode + fetch immediately ───────────────────────────

  const aplicarPeriodo = useCallback((mode: PeriodoMode) => {
    setPeriodoMode(mode);
    const range = calcRange(mode);
    rangeRef.current = range;
    const gid = grupoIdRef.current;
    if (!gid) return;
    setLoading(true);
    loadTransacoes(gid, range.ini, range.fim).finally(() => setLoading(false));
  }, [loadTransacoes]);

  // ── Initial mount ─────────────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const grupo = await fetchGrupo();
        setGrupoAtivo(grupo);
        grupoIdRef.current = grupo.grupo_id;
        const range = calcRange('6m');
        rangeRef.current = range;
        const txs = await fetchTransacoes(grupo.grupo_id, range.ini, range.fim);
        setTransacoes(txs);
      } catch (e) {
        console.error('AnaliseScreen.mount:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Reload on focus ───────────────────────────────────────────────────────

  useFocusEffect(useCallback(() => {
    const gid = grupoIdRef.current;
    if (!gid) return;
    const { ini, fim } = rangeRef.current;
    loadTransacoes(gid, ini, fim);
  }, [loadTransacoes]));

  // ── Refresh pull ──────────────────────────────────────────────────────────

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    const gid = grupoIdRef.current;
    if (gid) await loadTransacoes(gid, rangeRef.current.ini, rangeRef.current.fim);
    setRefreshing(false);
  }, [loadTransacoes]);

  // ─── Computed Data ─────────────────────────────────────────────────────────

  const mesesData = useMemo(() => {
    const map = new Map<string, { receita: number; despesa: number }>();
    for (const t of transacoes) {
      const k = (t.data_despesa || '').slice(0, 7);
      if (!k) continue;
      const cur = map.get(k) ?? { receita: 0, despesa: 0 };
      const v = Math.abs(Number(t.valor || 0));
      const tipo = (t.tipo || '').toLowerCase();
      if (tipo === 'receita') cur.receita += v;
      else if (tipo === 'despesa') cur.despesa += v;
      map.set(k, cur);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, d]) => {
        const m = parseInt(k.slice(5, 7), 10) - 1;
        const y = parseInt(k.slice(0, 4), 10);
        return {
          key: k,
          label: `${MESES_SHORT[m]}/${String(y).slice(2)}`,
          shortLabel: MESES_SHORT[m],
          ...d,
          resultado: d.receita - d.despesa,
        };
      });
  }, [transacoes]);

  const totais = useMemo(() => {
    const receita = mesesData.reduce((s, d) => s + d.receita, 0);
    const despesa = mesesData.reduce((s, d) => s + d.despesa, 0);
    return { receita, despesa, resultado: receita - despesa };
  }, [mesesData]);

  const categoriaData = useMemo((): HBarItem[] => {
    const map = new Map<string, number>();
    let total = 0;
    for (const t of transacoes) {
      if ((t.tipo || '').toLowerCase() !== 'despesa') continue;
      const g = (t.grupo || 'Sem categoria').trim() || 'Sem categoria';
      const v = Math.abs(Number(t.valor || 0));
      map.set(g, (map.get(g) || 0) + v);
      total += v;
    }
    if (!total) return [];
    const arr = Array.from(map.entries())
      .sort(([, a], [, b]) => b - a)
      .map(([label, value], i) => ({
        label, value,
        pct: (value / total) * 100,
        color: [c.accent, '#60a5fa', '#f59e0b', '#a78bfa'][i] ?? `${c.accent}44`,
      }));
    const top = arr.slice(0, 7);
    const rest = arr.slice(7).reduce((s, x) => s + x.value, 0);
    if (rest > 0) top.push({ label: 'Outros', value: rest, pct: (rest / total) * 100, color: `${c.muted}66` });
    return top;
  }, [transacoes, c.accent, c.muted]);

  const paretoN = useMemo(() => {
    let cum = 0, n = 0;
    for (const cat of categoriaData) {
      if (cat.label === 'Outros') continue;
      cum += cat.pct; n++;
      if (cum >= 80) break;
    }
    return { n, cum: cum.toFixed(0) };
  }, [categoriaData]);

  const taxasPoupanca = useMemo(
    () => mesesData.map(d => ({
      label: d.shortLabel,
      rate: d.receita > 0 ? (d.receita - d.despesa) / d.receita : 0,
    })),
    [mesesData]
  );

  const taxaMedia = useMemo(() => {
    if (!taxasPoupanca.length) return 0;
    return taxasPoupanca.reduce((s, d) => s + d.rate, 0) / taxasPoupanca.length;
  }, [taxasPoupanca]);

  const topCatTrend = useMemo(() => {
    const top3 = categoriaData.filter(c => c.label !== 'Outros').slice(0, 3);
    if (!top3.length || mesesData.length < 2) return { lines: [], xLabels: [] };
    const catMonth = new Map<string, Map<string, number>>();
    for (const t of transacoes) {
      if ((t.tipo || '').toLowerCase() !== 'despesa') continue;
      const g = (t.grupo || 'Sem categoria').trim() || 'Sem categoria';
      if (!top3.find(x => x.label === g)) continue;
      const k = (t.data_despesa || '').slice(0, 7);
      if (!k) continue;
      if (!catMonth.has(g)) catMonth.set(g, new Map());
      const m = catMonth.get(g)!;
      m.set(k, (m.get(k) || 0) + Math.abs(Number(t.valor || 0)));
    }
    const monthKeys = mesesData.map(d => d.key);
    const lines: LineData[] = top3.map((cat, i) => ({
      name: cat.label,
      color: LINE_COLORS[i],
      points: monthKeys.map(k => catMonth.get(cat.label)?.get(k) || 0),
    }));
    return { lines, xLabels: mesesData.map(d => d.shortLabel) };
  }, [categoriaData, transacoes, mesesData]);

  const heatmapData = useMemo((): HeatRow[] =>
    mesesData.map(mes => {
      const weeks = [0, 0, 0, 0];
      for (const t of transacoes) {
        if ((t.tipo || '').toLowerCase() !== 'despesa') continue;
        const dt = t.data_despesa || '';
        if (!dt.startsWith(mes.key)) continue;
        const day = parseInt(dt.slice(8, 10), 10);
        weeks[Math.min(Math.floor((day - 1) / 7), 3)] += Math.abs(Number(t.valor || 0));
      }
      return { monthLabel: mes.shortLabel, weeks };
    })
  , [transacoes, mesesData]);

  const projecao = useMemo(() => {
    const hoje = new Date();
    const curMesKey = ymdStr(hoje).slice(0, 7);
    const curMes = mesesData.find(m => m.key === curMesKey);
    if (!curMes) return null;
    const daysPassed = hoje.getDate();
    const daysTotal = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
    const avgDia = curMes.despesa / daysPassed;
    const projetado = avgDia * daysTotal;
    const rec3 = mesesData.slice(-3).reduce((s, m) => s + m.receita, 0) /
      Math.max(mesesData.slice(-3).length, 1);
    const anterior = mesesData[mesesData.length - 2];
    return {
      avgDia, projetado, rec3,
      resultado: rec3 - projetado,
      vsAnterior: anterior ? ((projetado - anterior.despesa) / anterior.despesa) * 100 : null,
      daysPassed, daysTotal,
    };
  }, [mesesData]);

  // ─── Render ────────────────────────────────────────────────────────────────

  const s = makeStyles(c);
  const hasMeses = mesesData.length > 0;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={s.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />
      }
      showsVerticalScrollIndicator={false}
    >
      {/* Seletor de período */}
      <View style={s.periodRow}>
        {PERIODO_OPTIONS.map(opt => {
          const active = periodoMode === opt.mode;
          return (
            <Pressable
              key={opt.mode}
              onPress={() => aplicarPeriodo(opt.mode)}
              accessibilityRole="button"
              accessibilityLabel={opt.label}
              accessibilityState={{ selected: active }}
              style={[s.chip, active && s.chipActive]}
            >
              <Text style={[s.chipLabel, active && s.chipLabelActive]}>{opt.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Loading */}
      {loading && (
        <View style={s.loadingBox}>
          <ActivityIndicator size="large" color={c.accent} />
          <Text style={s.loadingText}>Processando dados…</Text>
        </View>
      )}

      {!loading && !hasMeses && (
        <View style={s.loadingBox}>
          <Text style={s.loadingText}>Nenhum lançamento no período</Text>
        </View>
      )}

      {!loading && hasMeses && (
        <>
          {/* KPIs rápidos */}
          <View style={s.kpiRow}>
            {([
              { label: 'Receita',   val: totais.receita,    color: c.accent },
              { label: 'Gastos',    val: totais.despesa,    color: c.danger },
              { label: 'Resultado', val: totais.resultado,  color: totais.resultado >= 0 ? c.accent : c.danger },
            ] as const).map(k => (
              <View key={k.label} style={s.kpi}>
                <Text style={s.kpiLabel}>{k.label}</Text>
                <Text style={[s.kpiVal, { color: k.color }]} numberOfLines={1} adjustsFontSizeToFit>
                  {k.val < 0 ? '-' : ''}{fmoney(k.val)}
                </Text>
              </View>
            ))}
          </View>

          {/* ── Visão 1: Fluxo Mensal ──────────────────────────────────── */}
          <View style={s.card}>
            <Text style={s.eye}>VISÃO 1 · FLUXO MENSAL</Text>
            <Text style={s.cardTitle}>Receita vs Gastos por mês</Text>
            <Text style={s.cardSub}>
              <Text style={{ color: c.accent, fontWeight: '600' }}>
                {mesesData.filter(d => d.resultado >= 0).length}
              </Text>
              {' de '}{mesesData.length} meses com resultado positivo
            </Text>
            <View style={{ marginTop: 10 }}>
              <DualBarChart
                data={mesesData.map(d => ({ label: d.shortLabel, receita: d.receita, despesa: d.despesa }))}
                width={chartW}
              />
            </View>
            <View style={s.legend}>
              <View style={s.legendItem}>
                <View style={[s.legendDot, { backgroundColor: c.accent }]} />
                <Text style={s.legendText}>Receita</Text>
              </View>
              <View style={s.legendItem}>
                <View style={[s.legendDot, { backgroundColor: c.danger }]} />
                <Text style={s.legendText}>Gastos</Text>
              </View>
            </View>
          </View>

          {/* ── Visão 2: Pareto ────────────────────────────────────────── */}
          {categoriaData.length > 0 && (
            <View style={s.card}>
              <Text style={s.eye}>VISÃO 2 · CONCENTRAÇÃO DE GASTOS</Text>
              <Text style={s.cardTitle}>Pareto de categorias</Text>
              <Text style={s.cardSub}>
                <Text style={{ color: c.accent, fontWeight: '600' }}>{paretoN.n} categorias</Text>
                {' respondem por '}
                <Text style={{ color: c.accent, fontWeight: '600' }}>{paretoN.cum}%</Text>
                {' dos gastos — foco aqui tem impacto direto'}
              </Text>
              <View style={{ marginTop: 12 }}>
                <HBarChart data={categoriaData} width={chartW} />
              </View>
            </View>
          )}

          {/* ── Visão 3: Taxa de poupança ─────────────────────────────── */}
          <View style={s.card}>
            <Text style={s.eye}>VISÃO 3 · POUPANÇA</Text>
            <Text style={s.cardTitle}>Taxa de poupança por mês</Text>
            <Text style={s.cardSub}>
              {'Média de '}
              <Text style={{ color: taxaMedia >= 0 ? c.accent : c.danger, fontWeight: '600' }}>
                {taxaMedia >= 0 ? '+' : ''}{(taxaMedia * 100).toFixed(1)}%
              </Text>
              {' do que entra fica no período'}
            </Text>
            <View style={{ marginTop: 10 }}>
              <SavingsChart data={taxasPoupanca} width={chartW} />
            </View>
          </View>

          {/* ── Visão 4: Tendência de categorias ──────────────────────── */}
          {topCatTrend.lines.length >= 1 && mesesData.length >= 2 && (
            <View style={s.card}>
              <Text style={s.eye}>VISÃO 4 · TENDÊNCIA</Text>
              <Text style={s.cardTitle}>Evolução das top categorias</Text>
              <Text style={s.cardSub}>
                Gastos mensais das{' '}
                <Text style={{ color: c.accent, fontWeight: '600' }}>
                  {topCatTrend.lines.length} maiores categorias
                </Text>
                {' ao longo do tempo'}
              </Text>
              <View style={{ marginTop: 10 }}>
                <MultiLineChart lines={topCatTrend.lines} xLabels={topCatTrend.xLabels} width={chartW} />
              </View>
            </View>
          )}

          {/* ── Visão 5: Heatmap ──────────────────────────────────────── */}
          {heatmapData.length >= 2 && (
            <View style={s.card}>
              <Text style={s.eye}>VISÃO 5 · PADRÃO TEMPORAL</Text>
              <Text style={s.cardTitle}>Intensidade de gastos por semana</Text>
              <Text style={s.cardSub}>
                Identifica em qual semana do mês você gasta mais — útil para planejar boletos e compras
              </Text>
              <View style={{ marginTop: 12 }}>
                <WeekHeatmap data={heatmapData} width={chartW} />
              </View>
            </View>
          )}

          {/* ── Visão 6: Projeção ─────────────────────────────────────── */}
          {projecao && (
            <View style={s.card}>
              <Text style={s.eye}>VISÃO 6 · PROJEÇÃO</Text>
              <Text style={s.cardTitle}>Mês atual ao ritmo atual</Text>
              <Text style={s.cardSub}>
                {projecao.daysPassed} de {projecao.daysTotal} dias — média de{' '}
                <Text style={{ color: c.danger, fontWeight: '600' }}>
                  {fmoney(projecao.avgDia)}/dia
                </Text>
              </Text>
              <View style={s.projGrid}>
                {([
                  { label: 'Gastos projetados', val: projecao.projetado, color: c.danger },
                  { label: 'Resultado esperado', val: projecao.resultado, color: projecao.resultado >= 0 ? c.accent : c.danger },
                  { label: 'Receita estimada', val: projecao.rec3, color: c.accent },
                  projecao.vsAnterior !== null
                    ? { label: 'vs. mês anterior', val: projecao.vsAnterior, color: projecao.vsAnterior <= 0 ? c.accent : c.danger, pct: true }
                    : null,
                ].filter(Boolean) as Array<{ label: string; val: number; color: string; pct?: boolean }>)
                  .map(k => (
                    <View key={k.label} style={s.projCard}>
                      <Text style={s.projLabel}>{k.label}</Text>
                      <Text style={[s.projVal, { color: k.color }]}>
                        {k.pct
                          ? `${k.val >= 0 ? '+' : ''}${k.val.toFixed(0)}%`
                          : (k.val < 0 ? '-' : '') + fmoney(k.val)
                        }
                      </Text>
                    </View>
                  ))}
              </View>
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(c: typeof fg.colors) {
  return StyleSheet.create({
    container: {
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 48,
    },
    periodRow: {
      flexDirection: 'row',
      gap: 6,
      marginBottom: 16,
    },
    chip: {
      flex: 1, alignItems: 'center', paddingVertical: 7,
      borderRadius: 8, borderWidth: 1,
      backgroundColor: c.surface, borderColor: c.border,
    },
    chipActive: {
      backgroundColor: c.elevated, borderColor: c.accent,
    },
    chipLabel: { fontSize: 11, fontWeight: '500', color: c.muted },
    chipLabelActive: { color: c.accent },
    loadingBox: {
      alignItems: 'center', paddingVertical: 60,
    },
    loadingText: { color: c.muted, fontSize: 13, marginTop: 12 },
    kpiRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
    kpi: {
      flex: 1, backgroundColor: c.surface,
      borderWidth: 1, borderColor: c.border,
      borderRadius: 12, padding: 12,
    },
    kpiLabel: {
      fontSize: 10, color: c.muted,
      letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4,
    },
    kpiVal: { fontSize: 13, fontWeight: '700' },
    card: {
      backgroundColor: c.surface, borderWidth: 1,
      borderColor: c.border, borderRadius: 14,
      padding: 16, marginBottom: 12,
    },
    eye: {
      fontSize: 10, letterSpacing: 0.8,
      textTransform: 'uppercase', color: c.muted, marginBottom: 4,
    },
    cardTitle: { fontSize: 15, fontWeight: '600', color: c.text, marginBottom: 4 },
    cardSub: { fontSize: 12, color: c.muted, lineHeight: 17 },
    legend: { flexDirection: 'row', gap: 16, marginTop: 8 },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    legendDot: { width: 10, height: 6, borderRadius: 3 },
    legendText: { fontSize: 10, color: c.muted },
    projGrid: {
      flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12,
    },
    projCard: {
      flex: 1, minWidth: '45%',
      backgroundColor: c.bg, borderWidth: 1,
      borderColor: c.border, borderRadius: 10, padding: 12,
    },
    projLabel: {
      fontSize: 10, color: c.muted,
      letterSpacing: 0.3, textTransform: 'uppercase', marginBottom: 4,
    },
    projVal: { fontSize: 16, fontWeight: '700' },
  });
}
