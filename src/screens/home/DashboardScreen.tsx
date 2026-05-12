// src/screens/dashboard/DashboardScreen.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  DeviceEventEmitter,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';

type GrupoAtivo = {
  grupo_id: string;
  papel: 'owner' | 'viewer';
  nome_grupo: string;
};

type Conta = {
  id: string;
  nome: string;
  tipo?: string | null; // banco | cartao | null
};

type Transacao = {
  id: string;
  grupo_id: string;
  conta_id: string | null;
  data_caixa: string | null;
  data_despesa: string | null;
  descricao: string | null;
  valor: number | null;
  grupo: string | null;
  subgrupo: string | null;
  status: string | null;
  tipo: 'despesa' | 'receita' | 'transferencia' | null;
  transferencia_id: string | null;
  created_at: string | null;
};

type RangeMode = 'mes' | '30d' | '90d' | 'ano' | 'custom' | 'total';

function formatMoney(v?: number | null) {
  const n = Number(v || 0);
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseYmd(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((s || '').trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const dt = new Date(y, mo, d, 0, 0, 0, 0);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo || dt.getDate() !== d) return null;
  return dt;
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function startOfYear(d: Date) {
  return new Date(d.getFullYear(), 0, 1);
}

function daysBetweenInclusive(a: Date, b: Date) {
  const ms = 24 * 60 * 60 * 1000;
  const aa = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const bb = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.floor((bb - aa) / ms) + 1;
}

function ddmm(ymdStr: string) {
  const s = (ymdStr || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s || '-';
  return `${s.slice(8, 10)}/${s.slice(5, 7)}`;
}

function ymLabel(ym: string) {
  // YYYY-MM -> MM/YY
  if (!/^\d{4}-\d{2}$/.test(ym)) return ym;
  return `${ym.slice(5, 7)}/${ym.slice(2, 4)}`;
}

/** ---------- UI ---------- */

function Card({
  children,
  style,
  noShadow,
}: {
  children: React.ReactNode;
  style?: any;
  noShadow?: boolean;
}) {
  return (
    <View
      style={[
        {
          backgroundColor: '#161b22',
          borderColor: '#21262d',
          borderWidth: 1,
          borderRadius: 14,
          padding: 12,
          ...(noShadow
            ? {}
            : {
                shadowColor: '#000',
                shadowOpacity: 0.3,
                shadowRadius: 12,
                shadowOffset: { width: 0, height: 4 },
                elevation: 2,
              }),
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

function Button({
  title,
  onPress,
  disabled,
  variant,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'ghost';
}) {
  const isGhost = variant === 'ghost';
  const bg = isGhost ? 'transparent' : '#4ade80';
  const tx = isGhost ? '#e6edf3' : '#0d1117';

  return (
    <Pressable
      onPress={onPress}
      disabled={!!disabled}
      style={({ pressed }) => [
        {
          backgroundColor: bg,
          borderColor: isGhost ? '#21262d' : 'transparent',
          borderWidth: isGhost ? 1 : 0,
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderRadius: 12,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
          alignItems: 'center',
          justifyContent: 'center',
        },
      ]}
    >
      <Text style={{ color: tx, fontWeight: '600', fontSize: 12 }}>{title}</Text>
    </Pressable>
  );
}

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  const activeBorderColor = active ? '#4ade80' : '#21262d';
  const activeBg = active ? '#111a11' : '#161b22';
  const activeText = active ? '#4ade80' : '#7d8590';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          borderColor: activeBorderColor,
          borderWidth: 1,
          backgroundColor: activeBg,
          paddingHorizontal: 10,
          paddingVertical: 8,
          borderRadius: 999,
          opacity: pressed ? 0.85 : 1,
          marginRight: 8,
          marginBottom: 8,
        },
      ]}
    >
      <Text style={{ color: activeText, fontWeight: '600', fontSize: 12 }}>{label}</Text>
    </Pressable>
  );
}

function Header({
  title,
  subtitle,
  info,
  right,
}: {
  title: string;
  subtitle?: string;
  info?: string;
  right?: React.ReactNode;
}) {
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <View style={{ flex: 1, paddingRight: 10 }}>
          <Text style={{ color: '#e6edf3', fontWeight: '600', fontSize: 18 }}>{title}</Text>
          {subtitle ? (
            <Text style={{ marginTop: 4, color: '#7d8590', fontWeight: '400', fontSize: 12 }}>
              {subtitle}
            </Text>
          ) : null}
          {info ? (
            <Text style={{ marginTop: 6, color: '#7d8590', fontWeight: '400', fontSize: 11 }}>
              {info}
            </Text>
          ) : null}
        </View>
        {right ? <View>{right}</View> : null}
      </View>
    </Card>
  );
}

function Centered({ message }: { message: string }) {
  return (
    <View style={{ flex: 1, padding: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0d1117' }}>
      <ActivityIndicator size="large" color="#4ade80" />
      <Text style={{ marginTop: 12, color: '#7d8590', fontWeight: '400' }}>{message}</Text>
    </View>
  );
}

function KpiCard({
  label,
  value,
  variant,
  hint,
}: {
  label: string;
  value: string;
  variant: 'pos' | 'neg' | 'neutral';
  hint?: string;
}) {
  const color =
    variant === 'pos'
      ? '#4ade80'
      : variant === 'neg'
        ? '#f87171'
        : '#e6edf3';

  return (
    <Card style={{ flexGrow: 1, flexBasis: 220, backgroundColor: '#161b22', borderColor: '#21262d', borderRadius: 12 }} noShadow>
      <Text style={{ color: '#7d8590', fontWeight: '400', fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase' }}>{label}</Text>
      <Text style={{ color, fontWeight: '600', fontSize: 16, marginTop: 6 }}>{value}</Text>
      {hint ? (
        <Text style={{ color: '#7d8590', fontWeight: '400', fontSize: 11, marginTop: 6 }}>{hint}</Text>
      ) : null}
    </Card>
  );
}

function HeroCard({
  saldo,
  dataRef,
  walletName,
  onRefresh,
  refreshing,
}: {
  saldo: number;
  dataRef: string;
  walletName: string;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const isPos = saldo >= 0;
  const formatted = formatMoney(saldo);
  const dataLabel = dataRef ? `Saldo em ${ddmm(dataRef)}` : 'Saldo atual';

  return (
    <View
      style={{
        backgroundColor: '#111a11',
        borderColor: '#1e3a1e',
        borderWidth: 1,
        borderRadius: 16,
        padding: 20,
        shadowColor: '#000',
        shadowOpacity: 0.4,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 6 },
        elevation: 4,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              color: '#4a7a4a',
              fontWeight: '600',
              fontSize: 11,
              letterSpacing: 0.8,
              textTransform: 'uppercase',
            }}
          >
            {walletName}
          </Text>
          <Text style={{ color: '#7d8590', fontWeight: '400', fontSize: 11, marginTop: 2 }}>
            {dataLabel}
          </Text>
        </View>
        <Pressable
          onPress={onRefresh}
          disabled={refreshing}
          style={({ pressed }) => [
            {
              borderWidth: 1,
              borderColor: '#1e3a1e',
              borderRadius: 10,
              paddingHorizontal: 10,
              paddingVertical: 6,
              opacity: refreshing || pressed ? 0.6 : 1,
            },
          ]}
        >
          <Text style={{ color: '#4a7a4a', fontSize: 12, fontWeight: '600' }}>
            {refreshing ? '...' : 'Atualizar'}
          </Text>
        </Pressable>
      </View>

      <Text
        style={{
          color: isPos ? '#4ade80' : '#f87171',
          fontSize: 36,
          fontWeight: '600',
          marginTop: 16,
          fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
          letterSpacing: -0.5,
        }}
      >
        {formatted}
      </Text>
    </View>
  );
}

function SimpleBarChart({
  title,
  subtitle,
  points,
  valueFormatter,
}: {
  title: string;
  subtitle?: string;
  points: Array<{ label: string; value: number }>;
  valueFormatter: (n: number) => string;
}) {
  const max = Math.max(1, ...points.map((p) => p.value));
  const total = points.reduce((a, p) => a + p.value, 0);
  const top = points.reduce((acc, p) => (p.value > acc.value ? p : acc), { label: '-', value: 0 });

  return (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#e6edf3', fontWeight: '600', fontSize: 14 }}>{title}</Text>
          {subtitle ? (
            <Text style={{ color: '#7d8590', fontWeight: '400', fontSize: 11, marginTop: 4 }}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ color: '#7d8590', fontWeight: '400', fontSize: 11 }}>Total</Text>
          <Text style={{ color: '#f87171', fontWeight: '600', fontSize: 13 }}>{valueFormatter(total)}</Text>
          <Text style={{ color: '#7d8590', fontWeight: '400', fontSize: 11 }}>
            Pico {top.label} • {valueFormatter(top.value)}
          </Text>
        </View>
      </View>

      <View style={{ height: 10 }} />

      {points.length === 0 ? (
        <Text style={{ color: '#7d8590', fontWeight: '400' }}>Sem dados no período.</Text>
      ) : (
        <>
          <View
            style={{
              height: 120,
              borderWidth: 1,
              borderColor: '#21262d',
              borderRadius: 14,
              padding: 10,
              backgroundColor: '#161b22',
              flexDirection: 'row',
              alignItems: 'flex-end',
              gap: 6,
            }}
          >
            {points.map((p, idx) => {
              const h = Math.max(2, Math.round((p.value / max) * 95));
              const isLast = idx === points.length - 1;
              return (
                <View key={`${p.label}-${idx}`} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end' }}>
                  <View
                    style={{
                      width: '100%',
                      height: h,
                      backgroundColor: isLast ? '#4ade80' : '#2d4a2d',
                      borderRadius: 10,
                    }}
                  />
                </View>
              );
            })}
          </View>

          <View style={{ height: 8 }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ color: '#7d8590', fontWeight: '400', fontSize: 11 }}>
              {points[0]?.label || '-'}
            </Text>
            <Text style={{ color: '#7d8590', fontWeight: '400', fontSize: 11 }}>
              {points[points.length - 1]?.label || '-'}
            </Text>
          </View>
        </>
      )}
    </Card>
  );
}

function CategoryBars({
  title,
  subtitle,
  items,
  total,
  onDrillGrupo,
  onDrillSub,
  selectedGrupo,
  onToggleDetail,
}: {
  title: string;
  subtitle?: string;
  items: Array<{ key: string; label: string; value: number }>;
  total: number;
  onDrillGrupo: (grupo: string) => void;
  onDrillSub: (grupo: string, subgrupo: string) => void;
  selectedGrupo: string | null;
  onToggleDetail: (grupo: string) => void;
}) {
  const max = Math.max(1, ...items.map((x) => x.value));

  return (
    <Card>
      <Text style={{ color: '#e6edf3', fontWeight: '600', fontSize: 14 }}>{title}</Text>
      {subtitle ? (
        <Text style={{ color: '#7d8590', fontWeight: '400', fontSize: 11, marginTop: 4 }}>{subtitle}</Text>
      ) : null}

      <View style={{ height: 10 }} />

      {items.length === 0 ? (
        <Text style={{ color: '#7d8590', fontWeight: '400' }}>Sem gastos no período.</Text>
      ) : (
        items.map((it) => {
          const pct = total > 0 ? Math.round((it.value / total) * 100) : 0;
          const barPct = Math.max(0, Math.min(1, it.value / max));
          const isSel = selectedGrupo === it.key;

          return (
            <View
              key={it.key}
              style={{
                borderWidth: 1,
                borderColor: isSel ? '#4ade80' : '#21262d',
                borderRadius: 12,
                padding: 10,
                marginBottom: 8,
                backgroundColor: '#161b22',
              }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                <Pressable
                  onPress={() => onDrillGrupo(it.key)}
                  style={({ pressed }) => [{ flex: 1, opacity: pressed ? 0.9 : 1 }]}
                >
                  <Text style={{ color: '#e6edf3', fontWeight: '600' }} numberOfLines={1}>
                    {it.label}
                  </Text>
                  <Text style={{ color: '#7d8590', fontWeight: '400', fontSize: 11, marginTop: 2 }}>
                    {formatMoney(it.value)} • {pct}%
                  </Text>
                </Pressable>

                {it.key !== '__outros__' ? (
                  <Pressable
                    onPress={() => onToggleDetail(it.key)}
                    style={({ pressed }) => [
                      {
                        borderWidth: 1,
                        borderColor: '#21262d',
                        borderRadius: 12,
                        paddingHorizontal: 10,
                        paddingVertical: 8,
                        opacity: pressed ? 0.85 : 1,
                      },
                    ]}
                  >
                    <Text style={{ color: '#e6edf3', fontWeight: '600', fontSize: 12 }}>
                      {isSel ? 'Fechar' : 'Detalhar'}
                    </Text>
                  </Pressable>
                ) : null}
              </View>

              <View
                style={{
                  marginTop: 8,
                  height: 3,
                  borderRadius: 2,
                  backgroundColor: '#21262d',
                  overflow: 'hidden',
                }}
              >
                <View
                  style={{
                    width: `${Math.round(barPct * 100)}%`,
                    height: 3,
                    backgroundColor: '#f87171',
                  }}
                />
              </View>
            </View>
          );
        })
      )}
    </Card>
  );
}

/** ---------- Screen ---------- */

export default function DashboardScreen() {
  const navigation = useNavigation<any>();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [erroTela, setErroTela] = useState<string | null>(null);

  const [grupoAtivo, setGrupoAtivo] = useState<GrupoAtivo | null>(null);
  const [contas, setContas] = useState<Conta[]>([]);
  const [saldoPorConta, setSaldoPorConta] = useState<Record<string, number>>({});
  const [dataUltimaTransacao, setDataUltimaTransacao] = useState<string>('');

  const [rangeMode, setRangeMode] = useState<RangeMode>('30d');
  const [customIni, setCustomIni] = useState('');
  const [customFim, setCustomFim] = useState('');

  // IMPORTANTE: aqui já ignoramos transferências (somente receita/despesa)
  const [transacoesPeriodo, setTransacoesPeriodo] = useState<Transacao[]>([]);

  const [grupoDetalhe, setGrupoDetalhe] = useState<string | null>(null);

  const hoje = useMemo(() => new Date(), []);
  const hojeYmd = useMemo(() => ymd(new Date()), []);

  const carregarGrupoAtivo = useCallback(async (): Promise<GrupoAtivo> => {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user?.id) throw new Error('Usuário não autenticado.');
    const userId = authData.user.id;

    const { data, error } = await supabase
      .from('grupo_membros')
      .select(
        `
        grupo_id,
        papel,
        status,
        grupos_financeiros (
          id,
          nome
        )
      `
      )
      .eq('user_id', userId)
      .eq('status', 'ativo')
      .order('created_at', { ascending: true })
      .limit(10);

    if (error) throw new Error(`Não foi possível carregar a carteira. (${error.message})`);
    if (!data || data.length === 0) throw new Error('Nenhuma carteira ativa encontrada.');

    const primeiro = data[0] as any;
    const nomeGrupo =
      primeiro?.grupos_financeiros?.nome ||
      primeiro?.grupos_financeiros?.[0]?.nome ||
      'Minha Carteira';

    return { grupo_id: primeiro.grupo_id, papel: primeiro.papel, nome_grupo: nomeGrupo };
  }, []);

  const carregarContas = useCallback(async (grupoId: string) => {
    const { data, error } = await supabase
      .from('contas')
      .select('id, nome, tipo')
      .eq('grupo_id', grupoId)
      .order('nome', { ascending: true });

    if (error) throw new Error(`Não foi possível carregar contas. (${error.message})`);
    setContas((data || []) as Conta[]);
    return (data || []) as Conta[];
  }, []);

  const carregarSaldosPorConta = useCallback(
    async (grupoId: string) => {
      // saldo por conta é “saldo real” => inclui transferências (pois alteram saldo individual)
      const { data, error } = await supabase
        .from('transacoes')
        .select('conta_id, valor, tipo, status, data_caixa')
        .eq('grupo_id', grupoId)
        .lte('data_caixa', hojeYmd)
        .or('status.eq.confirmada,status.is.null')
        .limit(20000);

      if (error) throw new Error(`Não foi possível calcular saldos. (${error.message})`);

      const m: Record<string, number> = {};
      let maxData = '';
      (data || []).forEach((r: any) => {
        const cid = r?.conta_id;
        if (!cid) return;

        const raw = Number(r?.valor || 0);
        const t = String(r?.tipo || '').toLowerCase();

        let signed = 0;
        if (t === 'despesa') signed = -Math.abs(raw);
        else if (t === 'receita') signed = Math.abs(raw);
        else if (t === 'transferencia') signed = raw;
        else signed = 0;

        m[cid] = (m[cid] || 0) + signed;

        const dc = (r?.data_caixa || '').slice(0, 10);
        if (dc && dc > maxData) maxData = dc;
      });

      setSaldoPorConta(m);
      setDataUltimaTransacao(maxData);
    },
    [hojeYmd]
  );

  const range = useMemo(() => {
    const end = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());

    if (rangeMode === 'mes') {
      const ini = startOfMonth(end);
      const fim = endOfMonth(end);
      return { ini: ymd(ini), fim: ymd(fim), label: `Mês atual (${String(ini.getMonth() + 1).padStart(2, '0')}/${ini.getFullYear()})` };
    }

    if (rangeMode === '30d') {
      const ini = addDays(end, -29);
      return { ini: ymd(ini), fim: ymd(end), label: 'Últimos 30 dias' };
    }

    if (rangeMode === '90d') {
      const ini = addDays(end, -89);
      return { ini: ymd(ini), fim: ymd(end), label: 'Últimos 90 dias' };
    }

    if (rangeMode === 'ano') {
      const ini = startOfYear(end);
      return { ini: ymd(ini), fim: ymd(end), label: `Ano (${ini.getFullYear()})` };
    }

    if (rangeMode === 'custom') {
      const iniOk = parseYmd(customIni);
      const fimOk = parseYmd(customFim);
      if (iniOk && fimOk) return { ini: customIni.trim(), fim: customFim.trim(), label: `Personalizado` };
      return { ini: '', fim: '', label: `Personalizado` };
    }

    // total: para o dashboard, vamos mostrar visão “amigável” dos últimos 12 meses
    const ini = new Date(end.getFullYear(), end.getMonth() - 11, 1);
    const fim = endOfMonth(end);
    return { ini: ymd(ini), fim: ymd(fim), label: 'Últimos 12 meses' };
  }, [rangeMode, customIni, customFim, hoje]);

  const carregarTransacoesPeriodo = useCallback(
    async (grupoId: string) => {
      if (!range.ini || !range.fim) {
        setTransacoesPeriodo([]);
        return;
      }

      // ✅ IGNORA TRANSFERÊNCIAS NO DASH: só receita/despesa
      const { data, error } = await supabase
        .from('transacoes')
        .select(
          `
          id,
          grupo_id,
          conta_id,
          data_caixa,
          data_despesa,
          descricao,
          valor,
          grupo,
          subgrupo,
          status,
          tipo,
          transferencia_id,
          created_at
        `
        )
        .eq('grupo_id', grupoId)
        .in('tipo', ['despesa', 'receita'])
        .gte('data_despesa', range.ini)
        .lte('data_despesa', range.fim)
        .lte('data_despesa', hojeYmd)
        .limit(20000);

      if (error) throw new Error(`Não foi possível carregar dados do período. (${error.message})`);

      setTransacoesPeriodo((data || []) as Transacao[]);
    },
    [range.ini, range.fim, hojeYmd]
  );

  const carregarTela = useCallback(async () => {
    setErroTela(null);
    try {
      const grupo = await carregarGrupoAtivo();
      setGrupoAtivo(grupo);

      await Promise.all([
        carregarContas(grupo.grupo_id),
        carregarSaldosPorConta(grupo.grupo_id),
        carregarTransacoesPeriodo(grupo.grupo_id),
      ]);
    } catch (e: any) {
      console.log('ERRO DASHBOARD carregarTela:', e);
      setErroTela(e?.message || 'Erro ao carregar dashboard.');
      setGrupoAtivo(null);
      setContas([]);
      setSaldoPorConta({});
      setTransacoesPeriodo([]);
    }
  }, [carregarGrupoAtivo, carregarContas, carregarSaldosPorConta, carregarTransacoesPeriodo]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('FG_REFRESH_ALL', () => carregarTela());
    return () => sub.remove();
  }, [carregarTela]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      await carregarTela();
      if (alive) setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [carregarTela]);

  useFocusEffect(
    useCallback(() => {
      if (!loading) carregarTela();
    }, [carregarTela, loading])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await carregarTela();
    setRefreshing(false);
  }, [carregarTela]);

  const aplicarCustom = () => {
    const ini = parseYmd(customIni);
    const fim = parseYmd(customFim);
    if (!ini || !fim) {
      const msg = 'Período inválido. Use YYYY-MM-DD nos dois campos.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Erro', msg);
      return;
    }
    if (ini.getTime() > fim.getTime()) {
      const msg = 'Data inicial não pode ser maior que a data final.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Erro', msg);
      return;
    }
    setRangeMode('custom');
  };

  const mapaContas = useMemo(() => {
    const m = new Map<string, Conta>();
    contas.forEach((c) => m.set(c.id, c));
    return m;
  }, [contas]);

  const saldosOrdenados = useMemo(() => {
    const list = contas.map((c) => ({
      ...c,
      saldo: Number(saldoPorConta[c.id] || 0),
    }));
    return list.sort((a, b) => {
      const ta = (a.tipo || '').toLowerCase();
      const tb = (b.tipo || '').toLowerCase();
      const pa = ta === 'banco' ? 0 : ta === 'cartao' ? 1 : 2;
      const pb = tb === 'banco' ? 0 : tb === 'cartao' ? 1 : 2;
      if (pa !== pb) return pa - pb;
      return (a.nome || '').localeCompare(b.nome || '', 'pt-BR');
    });
  }, [contas, saldoPorConta]);

  const saldoTotalContas = useMemo(() => saldosOrdenados.reduce((acc, c: any) => acc + Number(c.saldo || 0), 0), [saldosOrdenados]);

  // ✅ KPIs do período (sem transferências)
  const agregados = useMemo(() => {
    let receitas = 0;
    let despesas = 0;
    let maiorDesp = { v: 0, desc: '-', g: '-', s: '-', dt: '-' };

    for (const t of transacoesPeriodo) {
      const tipo = String(t.tipo || '').toLowerCase();
      const v = Math.abs(Number(t.valor || 0));
      if (tipo === 'receita') receitas += v;
      else if (tipo === 'despesa') {
        despesas += v;

        if (v > maiorDesp.v) {
          maiorDesp = {
            v,
            desc: t.descricao || '(Sem descrição)',
            g: (t.grupo || '-').trim() || '-',
            s: (t.subgrupo || '-').trim() || '-',
            dt: (t.data_despesa || t.data_caixa || t.created_at || '').slice(0, 10) || '-',
          };
        }
      }
    }

    const resultado = receitas - despesas;

    const ini = parseYmd(range.ini);
    const fim = parseYmd(range.fim);
    const dias = ini && fim ? Math.max(1, daysBetweenInclusive(ini, fim)) : 1;
    const mediaDia = despesas / dias;

    return { receitas, despesas, resultado, mediaDia, maiorDesp, dias };
  }, [transacoesPeriodo, range.ini, range.fim]);

  // ✅ Série “gastos ao longo do período” (diário/semana/mês)
  const serieGastos = useMemo(() => {
    const ini = parseYmd(range.ini);
    const fim = parseYmd(range.fim);
    if (!ini || !fim) return { points: [] as Array<{ label: string; value: number }>, subtitle: '' };

    const dias = daysBetweenInclusive(ini, fim);

    // daily <= 45 dias, weekly <= 180, senão mensal
    const mode = dias <= 45 ? 'daily' : dias <= 180 ? 'weekly' : 'monthly';

    if (mode === 'daily') {
      const m = new Map<string, number>();
      for (const t of transacoesPeriodo) {
        if (String(t.tipo || '').toLowerCase() !== 'despesa') continue;
        const d = (t.data_despesa || '').slice(0, 10);
        if (!d) continue;
        m.set(d, (m.get(d) || 0) + Math.abs(Number(t.valor || 0)));
      }

      const pts: Array<{ label: string; value: number }> = [];
      for (let i = 0; i < dias; i++) {
        const d = addDays(ini, i);
        const key = ymd(d);
        pts.push({ label: ddmm(key), value: Number(m.get(key) || 0) });
      }

      return { points: pts, subtitle: 'Diário (gastos)' };
    }

    if (mode === 'weekly') {
      const bucketCount = Math.max(1, Math.ceil(dias / 7));
      const sums = Array(bucketCount).fill(0);

      for (const t of transacoesPeriodo) {
        if (String(t.tipo || '').toLowerCase() !== 'despesa') continue;
        const d = parseYmd((t.data_despesa || '').slice(0, 10));
        if (!d) continue;

        const diff = daysBetweenInclusive(ini, d) - 1;
        const idx = Math.floor(diff / 7);
        if (idx >= 0 && idx < bucketCount) sums[idx] += Math.abs(Number(t.valor || 0));
      }

      const pts = sums.map((v, idx) => ({ label: `S${idx + 1}`, value: v }));
      return { points: pts, subtitle: 'Semanal (gastos)' };
    }

    // monthly
    const m = new Map<string, number>();
    for (const t of transacoesPeriodo) {
      if (String(t.tipo || '').toLowerCase() !== 'despesa') continue;
      const d = (t.data_despesa || '').slice(0, 10);
      if (!d) continue;
      const key = d.slice(0, 7); // YYYY-MM
      m.set(key, (m.get(key) || 0) + Math.abs(Number(t.valor || 0)));
    }

    const months: string[] = [];
    let cur = new Date(ini.getFullYear(), ini.getMonth(), 1);
    const endM = new Date(fim.getFullYear(), fim.getMonth(), 1);
    while (cur.getTime() <= endM.getTime()) {
      months.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`);
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    }

    const pts = months.map((k) => ({ label: ymLabel(k), value: Number(m.get(k) || 0) }));
    return { points: pts, subtitle: 'Mensal (gastos)' };
  }, [transacoesPeriodo, range.ini, range.fim]);

  // ✅ Gastos por categoria (grupo) + subgrupo detalhe
  const despesasPorGrupo = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of transacoesPeriodo) {
      if (String(t.tipo || '').toLowerCase() !== 'despesa') continue;
      const g = (t.grupo || 'Sem grupo').trim() || 'Sem grupo';
      const v = Math.abs(Number(t.valor || 0));
      m.set(g, (m.get(g) || 0) + v);
    }

    const arr = Array.from(m.entries())
      .map(([key, value]) => ({ key, label: key, value }))
      .sort((a, b) => b.value - a.value);

    const top = arr.slice(0, 10);
    const rest = arr.slice(10).reduce((acc, x) => acc + x.value, 0);
    if (rest > 0) top.push({ key: '__outros__', label: 'Outros', value: rest });

    return top;
  }, [transacoesPeriodo]);

  const totalDespesas = useMemo(() => agregados.despesas, [agregados.despesas]);

  const despesasPorSubgrupo = useMemo(() => {
    if (!grupoDetalhe) return [];
    const m = new Map<string, number>();

    for (const t of transacoesPeriodo) {
      if (String(t.tipo || '').toLowerCase() !== 'despesa') continue;
      const g = (t.grupo || 'Sem grupo').trim() || 'Sem grupo';
      if (g !== grupoDetalhe) continue;

      const s = (t.subgrupo || t.descricao || 'Sem subgrupo').trim() || 'Sem subgrupo';
      const v = Math.abs(Number(t.valor || 0));
      m.set(s, (m.get(s) || 0) + v);
    }

    const arr = Array.from(m.entries())
      .map(([key, value]) => ({ key, label: key, value }))
      .sort((a, b) => b.value - a.value);

    return arr.slice(0, 12);
  }, [transacoesPeriodo, grupoDetalhe]);

  const maiorCategoria = useMemo(() => {
    const top = despesasPorGrupo[0];
    if (!top || totalDespesas <= 0) return { nome: '-', v: 0, pct: 0 };
    const pct = Math.round((top.value / totalDespesas) * 100);
    return { nome: top.label, v: top.value, pct };
  }, [despesasPorGrupo, totalDespesas]);

  const ultimasDespesas = useMemo(() => {
    const list = transacoesPeriodo
      .filter((t) => String(t.tipo || '').toLowerCase() === 'despesa')
      .sort((a, b) => {
        const d1 = Date.parse((a.data_despesa || a.created_at || '') as string);
        const d2 = Date.parse((b.data_despesa || b.created_at || '') as string);
        return (Number.isNaN(d2) ? 0 : d2) - (Number.isNaN(d1) ? 0 : d1);
      })
      .slice(0, 8);

    return list.map((t) => {
      const conta = t.conta_id ? mapaContas.get(t.conta_id)?.nome || 'Conta' : 'Conta';
      const dt = (t.data_despesa || t.data_caixa || t.created_at || '').slice(0, 10) || '-';
      const g = (t.grupo || '-').trim() || '-';
      const s = (t.subgrupo || '-').trim() || '-';
      const v = Math.abs(Number(t.valor || 0));
      return { id: t.id, conta, dt, g, s, desc: t.descricao || '(Sem descrição)', v };
    });
  }, [transacoesPeriodo, mapaContas]);

  // ✅ Drill-through para Lançamentos
  const drillLancamentos = (grupo: string, subgrupo: string) => {
    navigation.navigate('Lancamentos', {
      prefill: {
        filtroTipo: 'despesa',
        dataInicio: rangeMode === 'total' ? '' : range.ini,
        dataFim: rangeMode === 'total' ? '' : range.fim,
        filtroGrupo: grupo || '',
        filtroSubgrupo: subgrupo || '',
      },
    });
  };

  const toggleDetail = (g: string) => setGrupoDetalhe((prev) => (prev === g ? null : g));

  useEffect(() => {
    setGrupoDetalhe(null);
  }, [rangeMode, range.ini, range.fim]);

  if (loading) return <Centered message="Carregando dashboard..." />;

  const periodoLabel =
    rangeMode === 'custom'
      ? range.ini && range.fim
        ? `${range.ini} -> ${range.fim}`
        : 'Personalizado'
      : range.label;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#0d1117' }}
      contentContainerStyle={{ padding: 14, paddingBottom: 24 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4ade80" />}
    >
      {/* ── Hero: saldo total + data de referência ── */}
      <HeroCard
        saldo={saldoTotalContas}
        dataRef={dataUltimaTransacao}
        walletName={grupoAtivo?.nome_grupo || 'Minha Carteira'}
        onRefresh={carregarTela}
        refreshing={refreshing}
      />

      <View style={{ height: 12 }} />

      {/* ── Saldos por conta ── */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Text style={styles.sectionTitle}>Contas</Text>
        <Pressable
          onPress={() => navigation.navigate('Lancamentos')}
          style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
        >
          <Text style={{ color: '#4a7a4a', fontSize: 12, fontWeight: '600' }}>Ver lancamentos</Text>
        </Pressable>
      </View>

      <View style={styles.accountsGrid}>
        {saldosOrdenados.map((c: any) => {
          const tipo = String(c.tipo || '').toLowerCase();
          const badge = tipo === 'cartao' ? 'CARTAO' : tipo === 'banco' ? 'BANCO' : (c.tipo || 'CONTA').toUpperCase();
          const saldo = Number(c.saldo || 0);

          return (
            <Card key={c.id} style={styles.accountCard} noShadow>
              <Text style={styles.accountType}>{badge}</Text>
              <Text style={styles.accountName} numberOfLines={1}>{c.nome}</Text>
              <Text style={[styles.accountSaldo, saldo >= 0 ? styles.pos : styles.neg]}>{formatMoney(saldo)}</Text>
            </Card>
          );
        })}
      </View>

      <View style={{ height: 16 }} />

      {/* ── Divider ── */}
      <View style={{ height: 1, backgroundColor: '#21262d', marginBottom: 16 }} />

      {erroTela ? (
        <>
          <Card>
            <Text style={{ color: '#f87171', fontWeight: '600' }}>{erroTela}</Text>
          </Card>
          <View style={{ height: 10 }} />
        </>
      ) : null}

      {/* ── Período ── */}
      <Card>
        <Text style={styles.sectionTitle}>Periodo</Text>
        <View style={{ height: 8 }} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          <Chip label="Mes" active={rangeMode === 'mes'} onPress={() => setRangeMode('mes')} />
          <Chip label="30d" active={rangeMode === '30d'} onPress={() => setRangeMode('30d')} />
          <Chip label="90d" active={rangeMode === '90d'} onPress={() => setRangeMode('90d')} />
          <Chip label="Ano" active={rangeMode === 'ano'} onPress={() => setRangeMode('ano')} />
          <Chip label="Total" active={rangeMode === 'total'} onPress={() => setRangeMode('total')} />
          <Chip label="Custom" active={rangeMode === 'custom'} onPress={() => setRangeMode('custom')} />
        </View>

        {rangeMode === 'custom' ? (
          <>
            <View style={{ height: 10 }} />
            <View style={{ flexDirection: 'row' }}>
              <TextInput
                value={customIni}
                onChangeText={setCustomIni}
                placeholder="Data inicial (YYYY-MM-DD)"
                placeholderTextColor="#7d8590"
                style={[styles.periodInput, { marginRight: 10 }]}
              />
              <TextInput
                value={customFim}
                onChangeText={setCustomFim}
                placeholder="Data final (YYYY-MM-DD)"
                placeholderTextColor="#7d8590"
                style={styles.periodInput}
              />
            </View>

            <View style={{ height: 10 }} />
            <View style={{ flexDirection: 'row' }}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Button title="Aplicar" onPress={aplicarCustom} />
              </View>
              <View style={{ flex: 1 }}>
                <Button title="Limpar" variant="ghost" onPress={() => { setCustomIni(''); setCustomFim(''); }} />
              </View>
            </View>
          </>
        ) : null}
      </Card>

      <View style={{ height: 10 }} />

      {/* ── KPIs do período ── */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 } as any}>
        <KpiCard label="Receitas" value={formatMoney(agregados.receitas)} variant="pos" hint={periodoLabel} />
        <KpiCard label="Gastos" value={formatMoney(agregados.despesas)} variant="neg" hint={periodoLabel} />
        <KpiCard
          label="Resultado"
          value={formatMoney(agregados.resultado)}
          variant={agregados.resultado >= 0 ? 'pos' : 'neg'}
        />
        <KpiCard label="Media/dia (gastos)" value={formatMoney(agregados.mediaDia)} variant="neutral" hint={agregados.dias + ' dias'} />
      </View>

      <View style={{ height: 10 }} />

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 } as any}>
        <KpiCard
          label="Maior categoria"
          value={maiorCategoria.nome + ' ' + formatMoney(maiorCategoria.v)}
          variant="neutral"
          hint={maiorCategoria.pct + '% dos gastos'}
        />
        <KpiCard
          label="Maior despesa"
          value={formatMoney(agregados.maiorDesp.v)}
          variant="neutral"
          hint={agregados.maiorDesp.dt + ' - ' + agregados.maiorDesp.g}
        />
      </View>

      <View style={{ height: 10 }} />

      {/* ── Gastos por categoria ── */}
      <CategoryBars
        title="Gastos por categoria"
        subtitle="Toque no grupo para abrir lancamentos filtrados"
        items={despesasPorGrupo}
        total={totalDespesas}
        selectedGrupo={grupoDetalhe}
        onToggleDetail={toggleDetail}
        onDrillGrupo={(g) => {
          if (g === '__outros__') drillLancamentos('', '');
          else drillLancamentos(g, '');
        }}
        onDrillSub={(g, s) => drillLancamentos(g, s)}
      />

      {grupoDetalhe ? (
        <>
          <View style={{ height: 10 }} />
          <Card>
            <Text style={{ color: '#e6edf3', fontWeight: '600', fontSize: 14 }}>
              {grupoDetalhe}
            </Text>
            <Text style={{ color: '#7d8590', fontWeight: '400', fontSize: 11, marginTop: 4 }}>
              Toque na subcategoria para abrir os lancamentos filtrados
            </Text>

            <View style={{ height: 10 }} />

            {despesasPorSubgrupo.length === 0 ? (
              <Text style={{ color: '#7d8590', fontWeight: '400' }}>Sem dados.</Text>
            ) : (
              despesasPorSubgrupo.map((it) => {
                const pct = totalDespesas > 0 ? Math.round((it.value / totalDespesas) * 100) : 0;
                return (
                  <Pressable
                    key={it.key}
                    onPress={() => drillLancamentos(grupoDetalhe, it.key)}
                    style={({ pressed }) => [
                      {
                        borderWidth: 1,
                        borderColor: '#21262d',
                        borderRadius: 12,
                        padding: 10,
                        marginBottom: 8,
                        backgroundColor: '#161b22',
                        opacity: pressed ? 0.9 : 1,
                      },
                    ]}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                      <Text style={{ color: '#e6edf3', fontWeight: '600', flex: 1 }} numberOfLines={1}>
                        {it.label}
                      </Text>
                      <Text style={{ color: '#f87171', fontWeight: '600', fontSize: 13 }}>{formatMoney(it.value)}</Text>
                    </View>
                    <Text style={{ color: '#7d8590', fontWeight: '400', fontSize: 11, marginTop: 2 }}>
                      {pct}% dos gastos do periodo
                    </Text>
                  </Pressable>
                );
              })
            )}

            <View style={{ height: 8 }} />
            <Button title="Fechar" variant="ghost" onPress={() => setGrupoDetalhe(null)} />
          </Card>
        </>
      ) : null}

      <View style={{ height: 10 }} />

      {/* ── Grafico de gastos ── */}
      <SimpleBarChart
        title="Gastos ao longo do periodo"
        subtitle={serieGastos.subtitle}
        points={serieGastos.points}
        valueFormatter={formatMoney}
      />

      <View style={{ height: 10 }} />

      {/* ── Ultimas despesas ── */}
      <Card>
        <Text style={styles.sectionTitle}>Ultimas despesas</Text>
        <Text style={styles.sectionHint}>Toque para abrir a edicao do lancamento.</Text>

        <View style={{ height: 10 }} />

        {ultimasDespesas.length === 0 ? (
          <Text style={{ color: '#7d8590', fontWeight: '400' }}>Sem despesas no periodo.</Text>
        ) : (
          ultimasDespesas.map((x) => (
            <Pressable
              key={x.id}
              onPress={() => navigation.navigate('EditarLancamento', { id: x.id })}
              style={({ pressed }) => [
                {
                  borderWidth: 1,
                  borderColor: '#21262d',
                  borderRadius: 12,
                  padding: 10,
                  marginBottom: 8,
                  backgroundColor: pressed ? 'rgba(255,255,255,0.03)' : '#161b22',
                },
              ]}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#e6edf3', fontWeight: '600' }} numberOfLines={1}>
                    {x.desc}
                  </Text>
                  <Text style={{ color: '#7d8590', fontWeight: '400', fontSize: 11, marginTop: 4 }} numberOfLines={1}>
                    {x.dt} - {x.conta}
                  </Text>
                  <Text style={{ color: '#7d8590', fontWeight: '400', fontSize: 11, marginTop: 2 }} numberOfLines={1}>
                    {x.g} - {x.s}
                  </Text>
                </View>
                <Text style={{ color: '#f87171', fontWeight: '600', fontSize: 13 }}>{formatMoney(x.v)}</Text>
              </View>
            </Pressable>
          ))
        )}
      </Card>

      <View style={{ height: 18 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    color: '#7d8590',
    fontWeight: '600',
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  sectionHint: { marginTop: 4, color: '#7d8590', fontWeight: '400', fontSize: 11 },

  pos: { color: '#4ade80' },
  neg: { color: '#f87171' },

  periodInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#21262d',
    backgroundColor: '#0d1117',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'web' ? 10 : 12,
    color: '#e6edf3',
    fontWeight: '400',
    fontSize: 13,
  },

  accountsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  accountCard: {
    flexGrow: 1,
    flexBasis: 140,
    padding: 12,
    backgroundColor: '#161b22',
    borderColor: '#21262d',
    borderRadius: 12,
  },
  accountName: { color: '#e6edf3', fontWeight: '600', fontSize: 12, marginTop: 2 },
  accountType: { color: '#7d8590', fontWeight: '400', fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase' },
  accountSaldo: { marginTop: 6, fontWeight: '600', fontSize: 13 },
});