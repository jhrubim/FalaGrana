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
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { useAppTheme } from '../../context/ThemeContext';

type GrupoAtivo = {
  grupo_id: string;
  papel: 'owner' | 'viewer';
  nome_grupo: string;
};

type Conta = {
  id: string;
  nome: string;
  tipo?: string | null; // banco | cartao | null
  saldo_inicial?: number | null;
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
  const { colors: c } = useAppTheme();
  return (
    <View
      style={[
        {
          backgroundColor: c.surface,
          borderColor: c.border,
          borderWidth: 1,
          borderRadius: 14,
          padding: 12,
          ...(noShadow
            ? {}
            : {
                shadowColor: '#000',
                shadowOpacity: 0.2,
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
  const { colors: c } = useAppTheme();
  const isGhost = variant === 'ghost';
  const bg = isGhost ? 'transparent' : c.accent;
  const tx = isGhost ? c.text : c.onLight;

  return (
    <Pressable
      onPress={onPress}
      disabled={!!disabled}
      style={({ pressed }) => [
        {
          backgroundColor: bg,
          borderColor: isGhost ? c.border : 'transparent',
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
  const { colors: c } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        borderColor: active ? c.accent : c.border,
        borderWidth: 1,
        backgroundColor: active ? c.elevated : c.surface,
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderRadius: 999,
        opacity: pressed ? 0.85 : 1,
        marginRight: 8,
        marginBottom: 8,
      })}
    >
      <Text style={{ color: active ? c.accent : c.muted, fontWeight: '600', fontSize: 12 }}>{label}</Text>
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
  const { colors: c } = useAppTheme();
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <View style={{ flex: 1, paddingRight: 10 }}>
          <Text style={{ color: c.text, fontWeight: '600', fontSize: 18 }}>{title}</Text>
          {subtitle ? (
            <Text style={{ marginTop: 4, color: c.muted, fontWeight: '400', fontSize: 12 }}>{subtitle}</Text>
          ) : null}
          {info ? (
            <Text style={{ marginTop: 6, color: c.muted, fontWeight: '400', fontSize: 11 }}>{info}</Text>
          ) : null}
        </View>
        {right ? <View>{right}</View> : null}
      </View>
    </Card>
  );
}

function Centered({ message }: { message: string }) {
  const { colors: c } = useAppTheme();
  return (
    <View style={{ flex: 1, padding: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg }}>
      <ActivityIndicator size="large" color={c.accent} />
      <Text style={{ marginTop: 12, color: c.muted, fontWeight: '400' }}>{message}</Text>
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
  const { colors: c } = useAppTheme();
  const color = variant === 'pos' ? c.accent : variant === 'neg' ? c.danger : c.text;

  return (
    <Card style={{ flex: 1, borderRadius: 12 }} noShadow>
      <Text style={{ color: c.muted, fontWeight: '600', fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase' }}>{label}</Text>
      <Text style={{ color, fontWeight: '700', fontSize: 15, marginTop: 6 }} numberOfLines={1}>{value}</Text>
      {hint ? (
        <Text style={{ color: c.muted, fontWeight: '400', fontSize: 11, marginTop: 4 }} numberOfLines={1}>{hint}</Text>
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
  projetado,
}: {
  saldo: number;
  dataRef: string;
  walletName: string;
  onRefresh: () => void;
  refreshing: boolean;
  projetado?: boolean;
}) {
  const { colors: c } = useAppTheme();
  const isPos = saldo >= 0;
  const formatted = formatMoney(saldo);
  const dataLabel = projetado
    ? 'Saldo projetado (inclui pendentes)'
    : dataRef ? `Saldo bancário em ${ddmm(dataRef)}` : 'Saldo bancário';

  return (
    <View
      style={{
        backgroundColor: c.elevated,
        borderColor: c.borderSoft,
        borderWidth: 1,
        borderRadius: 16,
        padding: 20,
        shadowColor: '#000',
        shadowOpacity: 0.2,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 6 },
        elevation: 4,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.muted2, fontWeight: '600', fontSize: 11, letterSpacing: 0.8, textTransform: 'uppercase' }}>
            {walletName}
          </Text>
          <Text style={{ color: c.muted, fontWeight: '400', fontSize: 11, marginTop: 2 }}>
            {dataLabel}
          </Text>
        </View>
        <Pressable
          onPress={onRefresh}
          disabled={refreshing}
          style={({ pressed }) => ({
            borderWidth: 1,
            borderColor: c.borderSoft,
            borderRadius: 10,
            paddingHorizontal: 10,
            paddingVertical: 6,
            opacity: refreshing || pressed ? 0.6 : 1,
          })}
        >
          <Text style={{ color: c.muted2, fontSize: 12, fontWeight: '600' }}>
            {refreshing ? '...' : 'Atualizar'}
          </Text>
        </Pressable>
      </View>

      <Text
        style={{
          color: isPos ? c.accent : c.danger,
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
  const { colors: c } = useAppTheme();
  const max = Math.max(1, ...points.map((p) => p.value));
  const total = points.reduce((a, p) => a + p.value, 0);
  const top = points.reduce((acc, p) => (p.value > acc.value ? p : acc), { label: '-', value: 0 });

  return (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.text, fontWeight: '600', fontSize: 14 }}>{title}</Text>
          {subtitle ? (
            <Text style={{ color: c.muted, fontWeight: '400', fontSize: 11, marginTop: 4 }}>{subtitle}</Text>
          ) : null}
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ color: c.muted, fontWeight: '400', fontSize: 11 }}>Total</Text>
          <Text style={{ color: c.danger, fontWeight: '600', fontSize: 13 }}>{valueFormatter(total)}</Text>
          <Text style={{ color: c.muted, fontWeight: '400', fontSize: 11 }}>
            Pico {top.label} • {valueFormatter(top.value)}
          </Text>
        </View>
      </View>

      <View style={{ height: 10 }} />

      {points.length === 0 ? (
        <Text style={{ color: c.muted, fontWeight: '400' }}>Sem dados no período.</Text>
      ) : (
        <>
          <View style={{
            height: 120,
            borderWidth: 1,
            borderColor: c.border,
            borderRadius: 14,
            padding: 10,
            backgroundColor: c.elevated,
            flexDirection: 'row',
            alignItems: 'flex-end',
            gap: 6,
          }}>
            {points.map((p, idx) => {
              const h = Math.max(2, Math.round((p.value / max) * 95));
              const isLast = idx === points.length - 1;
              return (
                <View key={`${p.label}-${idx}`} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end' }}>
                  <View style={{
                    width: '100%',
                    height: h,
                    backgroundColor: isLast ? c.accent : c.accentSoft,
                    borderRadius: 10,
                  }} />
                </View>
              );
            })}
          </View>

          <View style={{ height: 8 }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ color: c.muted, fontWeight: '400', fontSize: 11 }}>{points[0]?.label || '-'}</Text>
            <Text style={{ color: c.muted, fontWeight: '400', fontSize: 11 }}>{points[points.length - 1]?.label || '-'}</Text>
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
  const { colors: c } = useAppTheme();
  const max = Math.max(1, ...items.map((x) => x.value));

  return (
    <Card>
      <Text style={{ color: c.text, fontWeight: '600', fontSize: 14 }}>{title}</Text>
      {subtitle ? (
        <Text style={{ color: c.muted, fontWeight: '400', fontSize: 11, marginTop: 4 }}>{subtitle}</Text>
      ) : null}

      <View style={{ height: 10 }} />

      {items.length === 0 ? (
        <Text style={{ color: c.muted, fontWeight: '400' }}>Sem gastos no período.</Text>
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
                borderColor: isSel ? c.accent : c.border,
                borderRadius: 12,
                padding: 10,
                marginBottom: 8,
                backgroundColor: isSel ? c.accentSoft : c.surface,
              }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                <Pressable
                  onPress={() => onDrillGrupo(it.key)}
                  style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.9 : 1 })}
                >
                  <Text style={{ color: c.text, fontWeight: '600' }} numberOfLines={1}>{it.label}</Text>
                  <Text style={{ color: c.muted, fontWeight: '400', fontSize: 11, marginTop: 2 }}>
                    {formatMoney(it.value)} • {pct}%
                  </Text>
                </Pressable>

                {it.key !== '__outros__' ? (
                  <Pressable
                    onPress={() => onToggleDetail(it.key)}
                    style={({ pressed }) => ({
                      borderWidth: 1,
                      borderColor: c.border,
                      borderRadius: 12,
                      paddingHorizontal: 10,
                      paddingVertical: 8,
                      opacity: pressed ? 0.85 : 1,
                    })}
                  >
                    <Text style={{ color: c.text, fontWeight: '600', fontSize: 12 }}>
                      {isSel ? 'Fechar' : 'Detalhar'}
                    </Text>
                  </Pressable>
                ) : null}
              </View>

              <View style={{ marginTop: 8, height: 3, borderRadius: 2, backgroundColor: c.border, overflow: 'hidden' }}>
                <View style={{ width: `${Math.round(barPct * 100)}%`, height: 3, backgroundColor: c.danger }} />
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
  const { width } = useWindowDimensions();
  const { colors: c } = useAppTheme();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [erroTela, setErroTela] = useState<string | null>(null);

  const [grupoAtivo, setGrupoAtivo] = useState<GrupoAtivo | null>(null);
  const [contas, setContas] = useState<Conta[]>([]);
  const [saldoPorContaConfirmado, setSaldoPorContaConfirmado] = useState<Record<string, number>>({});
  const [saldoPorContaTotal, setSaldoPorContaTotal] = useState<Record<string, number>>({});
  const [dataUltimaTransacao, setDataUltimaTransacao] = useState<string>('');

  const [rangeMode, setRangeMode] = useState<RangeMode>('30d');
  const [customIni, setCustomIni] = useState('');
  const [customFim, setCustomFim] = useState('');

  // IMPORTANTE: aqui já ignoramos transferências (somente receita/despesa)
  const [transacoesPeriodo, setTransacoesPeriodo] = useState<Transacao[]>([]);

  const [grupoDetalhe, setGrupoDetalhe] = useState<string | null>(null);
  const [includePendentes, setIncludePendentes] = useState(true);

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
      .select('id, nome, tipo, saldo_inicial')
      .eq('grupo_id', grupoId)
      .order('nome', { ascending: true });

    if (error) throw new Error(`Não foi possível carregar contas. (${error.message})`);
    setContas((data || []) as Conta[]);
    return (data || []) as Conta[];
  }, []);

  const carregarSaldosPorConta = useCallback(
    async (grupoId: string, contaList: Conta[]) => {
      // Cartão: usa data_despesa (quando gastou) — inclui fatura ainda não vencida
      // Banco/outros: usa data_caixa (quando liquidou)
      const cartaoIds = new Set(
        contaList.filter((c) => (c.tipo || '').toLowerCase() === 'cartao').map((c) => c.id)
      );

      // Pagina em blocos de 1000 até buscar todos (Supabase limita 1000/req por padrão)
      // Busca todas (confirmadas + pendentes) para calcular os dois cenários de uma vez
      const allData: any[] = [];
      let from = 0;
      const PAGE = 1000;
      while (true) {
        const { data: page, error } = await supabase
          .from('transacoes')
          .select('conta_id, valor, tipo, status, data_caixa, data_despesa')
          .eq('grupo_id', grupoId)
          .range(from, from + PAGE - 1);

        if (error) throw new Error(`Não foi possível calcular saldos. (${error.message})`);
        if (!page || page.length === 0) break;
        allData.push(...page);
        if (page.length < PAGE) break;
        from += PAGE;
      }

      // Inicializa cada conta com saldo_inicial (se existir)
      const mConfirmado: Record<string, number> = {};
      const mTotal: Record<string, number> = {};
      contaList.forEach((c) => {
        mConfirmado[c.id] = Number(c.saldo_inicial || 0);
        mTotal[c.id] = Number(c.saldo_inicial || 0);
      });

      let maxData = '';
      allData.forEach((r: any) => {
        const cid = r?.conta_id;
        if (!cid) return;

        const isCartao = cartaoIds.has(cid);
        const dataRef = isCartao
          ? (r?.data_despesa || r?.data_caixa || '').slice(0, 10)
          : (r?.data_caixa || r?.data_despesa || '').slice(0, 10);

        if (!dataRef || dataRef > hojeYmd) return;

        const raw = Number(r?.valor || 0);
        const t = String(r?.tipo || '').toLowerCase();
        const isPendente = r?.status === 'pendente';

        let signed = 0;
        if (t === 'despesa') signed = -Math.abs(raw);
        else if (t === 'receita') signed = Math.abs(raw);
        else if (t === 'transferencia') signed = raw;

        // mTotal inclui tudo (confirmado + pendente)
        mTotal[cid] = (mTotal[cid] || 0) + signed;

        // mConfirmado só inclui status confirmada ou null
        if (!isPendente) {
          mConfirmado[cid] = (mConfirmado[cid] || 0) + signed;
        }

        const dc = (r?.data_caixa || '').slice(0, 10);
        if (dc && dc > maxData) maxData = dc;
      });

      setSaldoPorContaConfirmado(mConfirmado);
      setSaldoPorContaTotal(mTotal);
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

    // total: sem filtro de data
    return { ini: '', fim: '', label: 'Todo o período' };
  }, [rangeMode, customIni, customFim, hoje]);

  const carregarTransacoesPeriodo = useCallback(
    async (grupoId: string, ini: string, fim: string) => {
      // ✅ IGNORA TRANSFERÊNCIAS NO DASH: só receita/despesa
      let query = supabase
        .from('transacoes')
        .select(
          `id,grupo_id,conta_id,data_caixa,data_despesa,descricao,valor,grupo,subgrupo,status,tipo,transferencia_id,created_at`
        )
        .eq('grupo_id', grupoId)
        .in('tipo', ['despesa', 'receita']);

      if (ini && fim) {
        query = query
          .gte('data_despesa', ini)
          .lte('data_despesa', fim)
          .lte('data_despesa', hojeYmd);
      }

      const { data, error } = await query.limit(20000);

      if (error) throw new Error(`Não foi possível carregar dados do período. (${error.message})`);

      setTransacoesPeriodo((data || []) as Transacao[]);
    },
    [hojeYmd]
  );

  // Carrega grupo, contas e saldos (sem transações — período independente)
  const carregarTela = useCallback(async () => {
    setErroTela(null);
    try {
      const grupo = await carregarGrupoAtivo();
      setGrupoAtivo(grupo);
      const contaList = await carregarContas(grupo.grupo_id);
      await carregarSaldosPorConta(grupo.grupo_id, contaList);
    } catch (e: any) {
      console.log('ERRO DASHBOARD carregarTela:', e);
      setErroTela(e?.message || 'Erro ao carregar dashboard.');
      setGrupoAtivo(null);
      setContas([]);
      setSaldoPorContaConfirmado({});
      setSaldoPorContaTotal({});
    }
  }, [carregarGrupoAtivo, carregarContas, carregarSaldosPorConta]);

  // Carrega transações sempre que o grupo ou período mudam
  useEffect(() => {
    if (!grupoAtivo?.grupo_id) return;
    carregarTransacoesPeriodo(grupoAtivo.grupo_id, range.ini, range.fim);
  }, [grupoAtivo?.grupo_id, range.ini, range.fim, carregarTransacoesPeriodo]);

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
    return () => { alive = false; };
  }, [carregarTela]);

  useFocusEffect(
    useCallback(() => {
      if (!loading) carregarTela();
    }, [carregarTela, loading])
  );

  // Troca período e dispara fetch imediatamente — sem depender de useEffect reativo
  const aplicarPeriodo = useCallback((mode: RangeMode) => {
    setRangeMode(mode);
    const gid = grupoAtivo?.grupo_id;
    if (!gid || mode === 'custom') return;
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let ini = '';
    let fim = '';
    if (mode === 'mes') { ini = ymd(startOfMonth(end)); fim = ymd(endOfMonth(end)); }
    else if (mode === '30d') { ini = ymd(addDays(end, -29)); fim = ymd(end); }
    else if (mode === '90d') { ini = ymd(addDays(end, -89)); fim = ymd(end); }
    else if (mode === 'ano') { ini = ymd(startOfYear(end)); fim = ymd(end); }
    // 'total': ini='', fim='' — sem filtro de data
    carregarTransacoesPeriodo(gid, ini, fim);
  }, [grupoAtivo?.grupo_id, carregarTransacoesPeriodo]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await carregarTela();
    if (grupoAtivo?.grupo_id) {
      await carregarTransacoesPeriodo(grupoAtivo.grupo_id, range.ini, range.fim);
    }
    setRefreshing(false);
  }, [carregarTela, grupoAtivo?.grupo_id, range.ini, range.fim, carregarTransacoesPeriodo]);

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
    if (grupoAtivo?.grupo_id) {
      carregarTransacoesPeriodo(grupoAtivo.grupo_id, customIni.trim(), customFim.trim());
    }
  };

  const mapaContas = useMemo(() => {
    const m = new Map<string, Conta>();
    contas.forEach((c) => m.set(c.id, c));
    return m;
  }, [contas]);

  const saldoPorConta = useMemo(
    () => includePendentes ? saldoPorContaTotal : saldoPorContaConfirmado,
    [includePendentes, saldoPorContaTotal, saldoPorContaConfirmado]
  );

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

  const contasBanco = useMemo(
    () => saldosOrdenados.filter((c: any) => (c.tipo || '').toLowerCase() === 'banco'),
    [saldosOrdenados]
  );
  const contasCartao = useMemo(
    () => saldosOrdenados.filter((c: any) => (c.tipo || '').toLowerCase() === 'cartao'),
    [saldosOrdenados]
  );
  const contasOutras = useMemo(
    () => saldosOrdenados.filter((c: any) => {
      const t = (c.tipo || '').toLowerCase();
      return t !== 'banco' && t !== 'cartao';
    }),
    [saldosOrdenados]
  );

  const saldoBancario = useMemo(
    () => contasBanco.reduce((acc, c: any) => acc + Number(c.saldo || 0), 0),
    [contasBanco]
  );
  const totalFatura = useMemo(
    () => contasCartao.reduce((acc, c: any) => acc + Math.min(0, Number(c.saldo || 0)), 0),
    [contasCartao]
  );

  const pendentes = useMemo(
    () => transacoesPeriodo.filter((t) => t.status === 'pendente'),
    [transacoesPeriodo]
  );

  const transacoesBase = useMemo(
    () => includePendentes
      ? transacoesPeriodo
      : transacoesPeriodo.filter((t) => t.status !== 'pendente'),
    [transacoesPeriodo, includePendentes]
  );

  // ✅ KPIs do período (sem transferências)
  const agregados = useMemo(() => {
    let receitas = 0;
    let despesas = 0;
    let maiorDesp = { v: 0, desc: '-', g: '-', s: '-', dt: '-' };

    for (const t of transacoesBase) {
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
  }, [transacoesBase, range.ini, range.fim]);

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
      for (const t of transacoesBase) {
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

      for (const t of transacoesBase) {
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
    for (const t of transacoesBase) {
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
  }, [transacoesBase, range.ini, range.fim]);

  // ✅ Gastos por categoria (grupo) + subgrupo detalhe
  const despesasPorGrupo = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of transacoesBase) {
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
  }, [transacoesBase]);

  const totalDespesas = useMemo(() => agregados.despesas, [agregados.despesas]);

  const despesasPorSubgrupo = useMemo(() => {
    if (!grupoDetalhe) return [];
    const m = new Map<string, number>();

    for (const t of transacoesBase) {
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
  }, [transacoesBase, grupoDetalhe]);

  const maiorCategoria = useMemo(() => {
    const top = despesasPorGrupo[0];
    if (!top || totalDespesas <= 0) return { nome: '-', v: 0, pct: 0 };
    const pct = Math.round((top.value / totalDespesas) * 100);
    return { nome: top.label, v: top.value, pct };
  }, [despesasPorGrupo, totalDespesas]);

  const ultimasDespesas = useMemo(() => {
    const list = transacoesBase
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
  }, [transacoesBase, mapaContas]);

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

  const isWide = width >= 900;
  const maxW = isWide ? 1200 : undefined;

  /* ── blocos reutilizáveis ── */

  const leftColumn = (
    <>
      {/* Hero: saldo bancário */}
      <HeroCard
        saldo={saldoBancario}
        dataRef={includePendentes ? '' : dataUltimaTransacao}
        walletName={grupoAtivo?.nome_grupo || 'Minha Carteira'}
        onRefresh={carregarTela}
        refreshing={refreshing}
        projetado={includePendentes}
      />

      {/* Resumo do mês — 3 chips rápidos */}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
        <View style={{ flex: 1, backgroundColor: c.accentSoft, borderColor: c.accent + '55', borderWidth: 1, borderRadius: 10, padding: 10 }}>
          <Text style={{ color: c.muted, fontSize: 9, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' }}>Receita</Text>
          <Text style={{ color: c.accent, fontWeight: '700', fontSize: 13, marginTop: 3 }} numberOfLines={1}>{formatMoney(agregados.receitas)}</Text>
        </View>
        <View style={{ flex: 1, backgroundColor: c.dangerSoft, borderColor: c.danger + '55', borderWidth: 1, borderRadius: 10, padding: 10 }}>
          <Text style={{ color: c.muted, fontSize: 9, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' }}>Gastos</Text>
          <Text style={{ color: c.danger, fontWeight: '700', fontSize: 13, marginTop: 3 }} numberOfLines={1}>{formatMoney(agregados.despesas)}</Text>
        </View>
        <View style={{
          flex: 1,
          backgroundColor: agregados.resultado >= 0 ? c.accentSoft : c.dangerSoft,
          borderColor: (agregados.resultado >= 0 ? c.accent : c.danger) + '55',
          borderWidth: 1, borderRadius: 10, padding: 10,
        }}>
          <Text style={{ color: c.muted, fontSize: 9, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' }}>Resultado</Text>
          <Text style={{ color: agregados.resultado >= 0 ? c.accent : c.danger, fontWeight: '700', fontSize: 13, marginTop: 3 }} numberOfLines={1}>
            {formatMoney(agregados.resultado)}
          </Text>
        </View>
      </View>

      {/* Toggle pendentes */}
      <Pressable
        onPress={() => setIncludePendentes((v) => !v)}
        style={({ pressed }) => ({
          flexDirection: 'row', alignItems: 'center', gap: 8,
          alignSelf: 'flex-end', marginTop: 8,
          paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
          borderWidth: 1,
          borderColor: includePendentes ? c.warn + '88' : c.border,
          backgroundColor: includePendentes ? c.warnSoft : 'transparent',
          opacity: pressed ? 0.75 : 1,
        })}
        accessibilityLabel={includePendentes ? 'Ocultar pendentes dos totais' : 'Incluir pendentes nos totais'}
      >
        <View style={{
          width: 28, height: 16, borderRadius: 8,
          backgroundColor: includePendentes ? c.warn : c.border,
          justifyContent: 'center',
          paddingHorizontal: 2,
        }}>
          <View style={{
            width: 12, height: 12, borderRadius: 6, backgroundColor: '#fff',
            alignSelf: includePendentes ? 'flex-end' : 'flex-start',
          }} />
        </View>
        <Text style={{ fontSize: 11, fontWeight: '600', color: includePendentes ? c.warn : c.muted }}>
          {includePendentes ? 'Com pendentes' : 'Sem pendentes'}
        </Text>
      </Pressable>

      <View style={{ height: 12 }} />

      {/* Card de conciliação — pendentes */}
      {pendentes.length > 0 && (
        <Pressable
          onPress={() => navigation.navigate('Lancamentos', { prefill: { filtroStatus: 'pendente' } })}
          style={({ pressed }) => ({
            backgroundColor: c.warnSoft,
            borderColor: c.warn + '88',
            borderWidth: 1,
            borderRadius: 12,
            padding: 12,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            marginBottom: 12,
            opacity: pressed ? 0.8 : 1,
          })}
          accessibilityLabel={`${pendentes.length} lançamentos pendentes de conciliação`}
        >
          <Text style={{ fontSize: 20 }}>⚠</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.warn, fontWeight: '700', fontSize: 13 }}>
              {pendentes.length} lançamento{pendentes.length !== 1 ? 's' : ''} a conciliar
            </Text>
            <Text style={{ color: c.muted, fontSize: 11, marginTop: 2 }}>
              Toque para revisar e confirmar
            </Text>
          </View>
          <Text style={{ color: c.warn, fontSize: 16 }}>›</Text>
        </Pressable>
      )}

      {/* Contas bancárias */}
      {contasBanco.length > 0 && (
        <>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Text style={[styles.sectionTitle, { color: c.muted }]}>Banco</Text>
            <Pressable onPress={() => navigation.navigate('Lancamentos')} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
              <Text style={{ color: c.muted2, fontSize: 12, fontWeight: '600' }}>Ver lançamentos</Text>
            </Pressable>
          </View>
          <View style={styles.accountsGrid}>
            {contasBanco.map((ct: any) => {
              const saldo = Number(ct.saldo || 0);
              return (
                <Card key={ct.id} style={styles.accountCard} noShadow>
                  <Text style={[styles.accountType, { color: c.muted }]}>BANCO</Text>
                  <Text style={[styles.accountName, { color: c.text }]} numberOfLines={1}>{ct.nome}</Text>
                  <Text style={{ marginTop: 6, fontWeight: '600', fontSize: 13, color: saldo >= 0 ? c.accent : c.danger }}>
                    {formatMoney(saldo)}
                  </Text>
                </Card>
              );
            })}
          </View>
          <View style={{ height: 12 }} />
        </>
      )}

      {/* Cartões de crédito */}
      {contasCartao.length > 0 && (
        <>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Text style={[styles.sectionTitle, { color: c.muted }]}>Cartões</Text>
            {totalFatura < 0 && (
              <Text style={{ color: c.danger, fontSize: 12, fontWeight: '600' }}>
                Fatura total: {formatMoney(Math.abs(totalFatura))}
              </Text>
            )}
          </View>
          <View style={styles.accountsGrid}>
            {contasCartao.map((ct: any) => {
              const saldo = Number(ct.saldo || 0);
              const temFatura = saldo < 0;
              return (
                <Card key={ct.id} style={[styles.accountCard, temFatura && { borderColor: c.danger + '44' }]} noShadow>
                  <Text style={[styles.accountType, { color: c.muted }]}>CARTÃO</Text>
                  <Text style={[styles.accountName, { color: c.text }]} numberOfLines={1}>{ct.nome}</Text>
                  {temFatura ? (
                    <>
                      <Text style={{ marginTop: 6, fontWeight: '700', fontSize: 12, color: c.danger }}>
                        Fatura: {formatMoney(Math.abs(saldo))}
                      </Text>
                    </>
                  ) : (
                    <Text style={{ marginTop: 6, fontWeight: '600', fontSize: 13, color: c.accent }}>
                      {formatMoney(saldo)}
                    </Text>
                  )}
                </Card>
              );
            })}
          </View>
          <View style={{ height: 12 }} />
        </>
      )}

      {/* Outras contas */}
      {contasOutras.length > 0 && (
        <>
          <View style={{ marginBottom: 8 }}>
            <Text style={[styles.sectionTitle, { color: c.muted }]}>Outras contas</Text>
          </View>
          <View style={styles.accountsGrid}>
            {contasOutras.map((ct: any) => {
              const saldo = Number(ct.saldo || 0);
              return (
                <Card key={ct.id} style={styles.accountCard} noShadow>
                  <Text style={[styles.accountType, { color: c.muted }]}>{(ct.tipo || 'CONTA').toUpperCase()}</Text>
                  <Text style={[styles.accountName, { color: c.text }]} numberOfLines={1}>{ct.nome}</Text>
                  <Text style={{ marginTop: 6, fontWeight: '600', fontSize: 13, color: saldo >= 0 ? c.accent : c.danger }}>
                    {formatMoney(saldo)}
                  </Text>
                </Card>
              );
            })}
          </View>
          <View style={{ height: 12 }} />
        </>
      )}

      <View style={{ height: 4 }} />
      <View style={{ height: 1, backgroundColor: c.border, marginBottom: 16 }} />

      {erroTela ? (
        <>
          <Card>
            <Text style={{ color: c.danger, fontWeight: '600' }}>{erroTela}</Text>
          </Card>
          <View style={{ height: 10 }} />
        </>
      ) : null}

      {/* Período */}
      <Card>
        <Text style={[styles.sectionTitle, { color: c.muted }]}>Período</Text>
        <View style={{ height: 8 }} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          <Chip label="Este mês" active={rangeMode === 'mes'} onPress={() => aplicarPeriodo('mes')} />
          <Chip label="30 dias" active={rangeMode === '30d'} onPress={() => aplicarPeriodo('30d')} />
          <Chip label="90 dias" active={rangeMode === '90d'} onPress={() => aplicarPeriodo('90d')} />
          <Chip label="Este ano" active={rangeMode === 'ano'} onPress={() => aplicarPeriodo('ano')} />
          <Chip label="Todo período" active={rangeMode === 'total'} onPress={() => aplicarPeriodo('total')} />
          <Chip label="Personalizado" active={rangeMode === 'custom'} onPress={() => aplicarPeriodo('custom')} />
        </View>

        {rangeMode === 'custom' ? (
          <>
            <View style={{ height: 10 }} />
            <View style={{ flexDirection: 'row' }}>
              <TextInput
                value={customIni}
                onChangeText={setCustomIni}
                placeholder="Data inicial (YYYY-MM-DD)"
                placeholderTextColor={c.muted}
                style={[styles.periodInput, { marginRight: 10, color: c.text, borderColor: c.border, backgroundColor: c.surface }]}
              />
              <TextInput
                value={customFim}
                onChangeText={setCustomFim}
                placeholder="Data final (YYYY-MM-DD)"
                placeholderTextColor={c.muted}
                style={[styles.periodInput, { color: c.text, borderColor: c.border, backgroundColor: c.surface }]}
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

      {/* KPIs 2×3 */}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <KpiCard label="Receitas" value={formatMoney(agregados.receitas)} variant="pos" hint={periodoLabel} />
        <KpiCard label="Gastos" value={formatMoney(agregados.despesas)} variant="neg" hint={periodoLabel} />
      </View>
      <View style={{ height: 10 }} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <KpiCard
          label="Resultado"
          value={formatMoney(agregados.resultado)}
          variant={agregados.resultado >= 0 ? 'pos' : 'neg'}
          hint={periodoLabel}
        />
        <KpiCard label="Média/dia" value={formatMoney(agregados.mediaDia)} variant="neutral" hint={`${agregados.dias} dias`} />
      </View>
      <View style={{ height: 10 }} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <KpiCard
          label="Maior categoria"
          value={maiorCategoria.nome}
          variant="neutral"
          hint={`${formatMoney(maiorCategoria.v)} • ${maiorCategoria.pct}% dos gastos`}
        />
        <KpiCard
          label="Maior despesa"
          value={formatMoney(agregados.maiorDesp.v)}
          variant="neutral"
          hint={`${agregados.maiorDesp.dt} • ${agregados.maiorDesp.g}`}
        />
      </View>
    </>
  );

  const rightColumn = (
    <>
      {/* Gastos por categoria */}
      <CategoryBars
        title="Gastos por categoria"
        subtitle="Toque no grupo para abrir lançamentos filtrados"
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
            <Text style={{ color: c.text, fontWeight: '600', fontSize: 14 }}>{grupoDetalhe}</Text>
            <Text style={{ color: c.muted, fontWeight: '400', fontSize: 11, marginTop: 4 }}>
              Toque na subcategoria para abrir os lançamentos filtrados
            </Text>
            <View style={{ height: 10 }} />
            {despesasPorSubgrupo.length === 0 ? (
              <Text style={{ color: c.muted, fontWeight: '400' }}>Sem dados.</Text>
            ) : (
              despesasPorSubgrupo.map((it) => {
                const pct = totalDespesas > 0 ? Math.round((it.value / totalDespesas) * 100) : 0;
                return (
                  <Pressable
                    key={it.key}
                    onPress={() => drillLancamentos(grupoDetalhe, it.key)}
                    style={({ pressed }) => ({
                      borderWidth: 1,
                      borderColor: c.border,
                      borderRadius: 12,
                      padding: 10,
                      marginBottom: 8,
                      backgroundColor: c.surface,
                      opacity: pressed ? 0.9 : 1,
                    })}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                      <Text style={{ color: c.text, fontWeight: '600', flex: 1 }} numberOfLines={1}>{it.label}</Text>
                      <Text style={{ color: c.danger, fontWeight: '600', fontSize: 13 }}>{formatMoney(it.value)}</Text>
                    </View>
                    <Text style={{ color: c.muted, fontWeight: '400', fontSize: 11, marginTop: 2 }}>
                      {pct}% dos gastos do período
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

      {/* Gráfico de gastos */}
      <SimpleBarChart
        title="Gastos ao longo do período"
        subtitle={serieGastos.subtitle}
        points={serieGastos.points}
        valueFormatter={formatMoney}
      />

      <View style={{ height: 10 }} />

      {/* Últimas despesas */}
      <Card>
        <Text style={[styles.sectionTitle, { color: c.muted }]}>Últimas despesas</Text>
        <Text style={[styles.sectionHint, { color: c.muted }]}>Toque para abrir a edição do lançamento.</Text>
        <View style={{ height: 10 }} />
        {ultimasDespesas.length === 0 ? (
          <Text style={{ color: c.muted, fontWeight: '400' }}>Sem despesas no período.</Text>
        ) : (
          ultimasDespesas.map((x) => (
            <Pressable
              key={x.id}
              onPress={() => navigation.navigate('EditarLancamento', { id: x.id })}
              style={({ pressed }) => ({
                borderWidth: 1,
                borderColor: c.border,
                borderRadius: 12,
                padding: 10,
                marginBottom: 8,
                backgroundColor: pressed ? c.elevated : c.surface,
              })}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.text, fontWeight: '600' }} numberOfLines={1}>{x.desc}</Text>
                  <Text style={{ color: c.muted, fontWeight: '400', fontSize: 11, marginTop: 4 }} numberOfLines={1}>
                    {x.dt} — {x.conta}
                  </Text>
                  <Text style={{ color: c.muted, fontWeight: '400', fontSize: 11, marginTop: 2 }} numberOfLines={1}>
                    {x.g} — {x.s}
                  </Text>
                </View>
                <Text style={{ color: c.danger, fontWeight: '600', fontSize: 13 }}>{formatMoney(x.v)}</Text>
              </View>
            </Pressable>
          ))
        )}
      </Card>
    </>
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={{
        padding: isWide ? 28 : 14,
        paddingBottom: 40,
        alignItems: isWide ? 'center' : undefined,
      }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}
    >
      <View style={{ width: '100%', maxWidth: maxW, alignSelf: isWide ? 'center' : undefined }}>
        {isWide ? (
          /* ── Layout 2 colunas (desktop) ── */
          <View style={{ flexDirection: 'row', gap: 20, alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>{leftColumn}</View>
            <View style={{ flex: 1 }}>{rightColumn}</View>
          </View>
        ) : (
          /* ── Layout 1 coluna (mobile) ── */
          <>
            {leftColumn}
            <View style={{ height: 10 }} />
            {rightColumn}
          </>
        )}
        <View style={{ height: 18 }} />
      </View>
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