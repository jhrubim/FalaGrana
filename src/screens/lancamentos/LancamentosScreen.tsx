// src/screens/lancamentos/LancamentosScreen.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { fg } from '../../theme/fgTheme';

// ─── Types ────────────────────────────────────────────────────────────────────

type GrupoAtivo = { grupo_id: string; papel: 'owner' | 'viewer'; nome_grupo: string };

type Lancamento = {
  id: string;
  transferencia_id: string | null;
  grupo_id: string;
  data_caixa: string | null;
  data_despesa: string | null;
  conta_id: string | null;
  descricao: string | null;
  valor: number | null;
  grupo: string | null;
  subgrupo: string | null;
  status: string | null;
  origem: string | null;
  tipo: 'despesa' | 'receita' | 'transferencia' | null;
  categoria_id: string | null;
  eh_parcela: boolean | null;
  parcela_numero: number | null;
  total_parcelas: number | null;
  created_at: string | null;
};

type Conta = { id: string; nome: string; tipo?: string | null };
type FiltroStatus = 'todos' | 'confirmada' | 'pendente';
type FiltroTipo = 'todos' | 'despesa' | 'receita' | 'transferencia';
type PeriodoMode = 'hoje' | 'semana' | 'mes' | 'mes_ant' | '3meses' | 'custom' | 'todos';
type OrdenacaoLanc = 'data_desc' | 'data_asc' | 'valor_desc' | 'valor_asc' | 'desc_asc';

type Prefill = {
  dataInicio?: string;
  dataFim?: string;
  filtroTipo?: FiltroTipo;
  filtroStatus?: FiltroStatus;
  filtroContaId?: string;
  filtroGrupo?: string;
  filtroSubgrupo?: string;
  busca?: string;
  basePeriodo?: 'despesa' | 'caixa';
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatMoney(v?: number | null) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function normText(v?: string | null) {
  return (v || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

function normEq(a?: string | null, b?: string | null) {
  return normText(a).trim() === normText(b).trim();
}

function parseDateSafe(s?: string | null) {
  const t = Date.parse(s || '');
  return Number.isNaN(t) ? 0 : t;
}

function calcPeriodo(mode: PeriodoMode): { ini: string; fim: string } {
  const hoje = new Date();
  const h = ymd(hoje);

  if (mode === 'hoje') return { ini: h, fim: h };

  if (mode === 'semana') {
    const dow = hoje.getDay();
    const seg = new Date(hoje); seg.setDate(hoje.getDate() - dow + (dow === 0 ? -6 : 1));
    const dom = new Date(seg); dom.setDate(seg.getDate() + 6);
    return { ini: ymd(seg), fim: ymd(dom) };
  }

  if (mode === 'mes') {
    const ini = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
    return { ini: ymd(ini), fim: ymd(fim) };
  }

  if (mode === 'mes_ant') {
    const ini = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    const fim = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
    return { ini: ymd(ini), fim: ymd(fim) };
  }

  if (mode === '3meses') {
    const ini = new Date(hoje.getFullYear(), hoje.getMonth() - 2, 1);
    const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
    return { ini: ymd(ini), fim: ymd(fim) };
  }

  return { ini: '', fim: '' };
}

function formatDiaLabel(data: string): string {
  const hoje = ymd(new Date());
  const ontem = ymd(new Date(Date.now() - 86400000));

  if (data === hoje) return 'Hoje';
  if (data === ontem) return 'Ontem';

  const d = new Date(data + 'T12:00:00');
  const dias = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const dia = d.getDate().toString().padStart(2, '0');
  const mes = (d.getMonth() + 1).toString().padStart(2, '0');
  return `${dias[d.getDay()]}, ${dia}/${mes}`;
}

// ─── Componentes ──────────────────────────────────────────────────────────────

function TipoIcon({ tipo }: { tipo: string }) {
  const cfg = {
    despesa:      { bg: fg.colors.dangerSoft, border: fg.colors.danger,  label: '−', color: fg.colors.danger  },
    receita:      { bg: fg.colors.accentSoft, border: fg.colors.accent,  label: '+', color: fg.colors.accent  },
    transferencia:{ bg: fg.colors.infoSoft,   border: fg.colors.info,    label: '⇄', color: fg.colors.info    },
  }[tipo] ?? { bg: fg.colors.surface, border: fg.colors.border, label: '?', color: fg.colors.muted };

  return (
    <View style={{
      width: 36, height: 36, borderRadius: 10, borderWidth: 1,
      backgroundColor: cfg.bg, borderColor: cfg.border,
      alignItems: 'center', justifyContent: 'center',
    }}>
      <Text style={{ color: cfg.color, fontSize: 16, fontWeight: '700' }}>{cfg.label}</Text>
    </View>
  );
}

function PeriodoChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: fg.radius.pill,
        backgroundColor: active ? fg.colors.accent : fg.colors.surface,
        borderWidth: 1,
        borderColor: active ? fg.colors.accent : fg.colors.border,
        marginRight: 6,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Text style={{ fontSize: 12, fontWeight: '600', color: active ? fg.colors.onLight : fg.colors.muted }}>
        {label}
      </Text>
    </Pressable>
  );
}

function FiltroChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: fg.radius.pill,
        backgroundColor: active ? 'rgba(74,222,128,0.15)' : fg.colors.surface,
        borderWidth: 1,
        borderColor: active ? fg.colors.accent : fg.colors.border,
        marginRight: 6,
        marginBottom: 6,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Text style={{ fontSize: 12, fontWeight: '600', color: active ? fg.colors.accent : fg.colors.muted }}>
        {label}
      </Text>
    </Pressable>
  );
}

function SectionHeader({ label, receita, despesa }: { label: string; receita: number; despesa: number }) {
  const saldo = receita - despesa;
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionHeaderLabel}>{label}</Text>
      {(receita > 0 || despesa > 0) && (
        <Text style={[styles.sectionHeaderSaldo, { color: saldo >= 0 ? fg.colors.accent : fg.colors.danger }]}>
          {saldo >= 0 ? '+' : ''}{formatMoney(saldo)}
        </Text>
      )}
    </View>
  );
}

function LancamentoRow({
  item,
  conta,
  onPress,
  onDelete,
  isDeleting,
  isViewer,
  selectionMode = false,
  isSelected = false,
  onToggleSelect,
}: {
  item: Lancamento;
  conta: string;
  onPress: () => void;
  onDelete: () => void;
  isDeleting: boolean;
  isViewer: boolean;
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
}) {
  const tipo = item.tipo || 'despesa';
  const vNum = Number(item.valor || 0);
  const isPos = tipo === 'transferencia' ? vNum >= 0 : tipo === 'receita';
  const valorColor = isPos ? fg.colors.accent : fg.colors.danger;
  const prefixo = tipo === 'transferencia' ? (vNum === 0 ? '' : isPos ? '+' : '') : tipo === 'receita' ? '+' : '-';
  const status = item.status || 'confirmada';
  const isPendente = status === 'pendente';

  const cat = [item.grupo, item.subgrupo].filter(Boolean).join(' › ') || conta;
  const dataStr = (item.data_despesa || item.data_caixa || '').slice(0, 10);
  const dataLabel = dataStr
    ? `${dataStr.slice(8, 10)}/${dataStr.slice(5, 7)}`
    : '';

  return (
    <Pressable
      onPress={selectionMode ? onToggleSelect : onPress}
      disabled={isDeleting && !selectionMode}
      style={({ pressed }) => [
        styles.row,
        pressed && styles.rowPressed,
        selectionMode && isSelected && { backgroundColor: 'rgba(74,222,128,0.08)' },
      ]}
      accessibilityLabel={`${item.descricao || 'Lançamento'}, ${formatMoney(vNum)}`}
    >
      {selectionMode ? (
        <View style={{
          width: 22, height: 22, borderRadius: 11, borderWidth: 2,
          borderColor: isSelected ? fg.colors.accent : fg.colors.muted,
          backgroundColor: isSelected ? fg.colors.accent : 'transparent',
          alignItems: 'center', justifyContent: 'center', marginRight: 10,
        }}>
          {isSelected && <Text style={{ color: fg.colors.bg, fontSize: 12, fontWeight: '700' }}>✓</Text>}
        </View>
      ) : (
        <TipoIcon tipo={tipo} />
      )}

      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text style={styles.rowDesc} numberOfLines={1}>{item.descricao || '(Sem descrição)'}</Text>
          <Text style={[styles.rowValor, { color: valorColor }]}>
            {prefixo}{formatMoney(Math.abs(vNum))}
          </Text>
        </View>
        <View style={styles.rowBottom}>
          <Text style={styles.rowMeta} numberOfLines={1}>
            {dataLabel ? <Text style={{ color: fg.colors.accent, fontWeight: '600' }}>{dataLabel}</Text> : null}
            {dataLabel && cat ? '  ·  ' : ''}{cat}
          </Text>
          <View style={styles.rowStatusRow}>
            {isPendente && (
              <View style={styles.pendenteDot} />
            )}
            {!isViewer && !selectionMode && (
              Platform.OS === 'web' ? (
                // @ts-ignore
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={(e: any) => { e?.preventDefault?.(); e?.stopPropagation?.(); onDelete(); }}
                  style={{
                    appearance: 'none', background: 'none', border: 'none', padding: 0, margin: 0,
                    color: isDeleting ? fg.colors.muted : fg.colors.danger,
                    fontSize: 11, cursor: isDeleting ? 'not-allowed' : 'pointer', marginLeft: 8,
                  }}
                >
                  {isDeleting ? '…' : 'Excluir'}
                </button>
              ) : (
                <Pressable
                  hitSlop={10}
                  onPress={(e) => { e.stopPropagation?.(); onDelete(); }}
                  style={{ marginLeft: 8 }}
                >
                  <Text style={styles.deleteText}>{isDeleting ? '…' : 'Excluir'}</Text>
                </Pressable>
              )
            )}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

const PERIODO_OPTS: Array<{ value: PeriodoMode; label: string }> = [
  { value: 'hoje',    label: 'Hoje' },
  { value: 'semana',  label: 'Semana' },
  { value: 'mes',     label: 'Este mês' },
  { value: 'mes_ant', label: 'Mês ant.' },
  { value: '3meses',  label: '3 meses' },
  { value: 'todos',   label: 'Todos' },
  { value: 'custom',  label: 'Custom' },
];

const TIPOS: Array<{ value: FiltroTipo; label: string }> = [
  { value: 'todos',         label: 'Todos' },
  { value: 'despesa',       label: 'Despesa' },
  { value: 'receita',       label: 'Receita' },
  { value: 'transferencia', label: 'Transf.' },
];

const STATUS_OPTS: Array<{ value: FiltroStatus; label: string }> = [
  { value: 'todos',      label: 'Todos' },
  { value: 'confirmada', label: 'Confirmada' },
  { value: 'pendente',   label: 'Pendente' },
];

export default function LancamentosScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  const appliedPrefillRef = useRef<Prefill | null>(null);
  const prefill: Prefill | null = route?.params?.prefill ?? null;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [grupoAtivo, setGrupoAtivo] = useState<GrupoAtivo | null>(null);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [contas, setContas] = useState<Conta[]>([]);

  const [busca, setBusca] = useState('');
  const [filtroTipo, setFiltroTipo] = useState<FiltroTipo>('todos');
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>('todos');
  const [filtroContaId, setFiltroContaId] = useState<string>('todos');
  const [filtroGrupo, setFiltroGrupo] = useState('');
  const [filtroSubgrupo, setFiltroSubgrupo] = useState('');

  const [periodoMode, setPeriodoMode] = useState<PeriodoMode>('mes');
  const [customIni, setCustomIni] = useState('');
  const [customFim, setCustomFim] = useState('');

  const [basePeriodo, setBasePeriodo] = useState<'despesa' | 'caixa'>('despesa');

  const [ordenacao, setOrdenacao] = useState<OrdenacaoLanc>('data_desc');

  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const isViewer = grupoAtivo?.papel === 'viewer';

  // ── Supabase ──────────────────────────────────────────────────────────────

  const carregarGrupoAtivo = useCallback(async (): Promise<GrupoAtivo> => {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user?.id) throw new Error('Usuário não autenticado.');

    const { data, error } = await supabase
      .from('grupo_membros')
      .select('grupo_id, papel, status, grupos_financeiros(id, nome)')
      .eq('user_id', authData.user.id)
      .eq('status', 'ativo')
      .order('created_at', { ascending: true })
      .limit(10);

    if (error) throw new Error(error.message);
    if (!data?.length) throw new Error('Nenhuma carteira ativa encontrada.');

    const p = data[0] as any;
    return {
      grupo_id: p.grupo_id,
      papel: p.papel,
      nome_grupo: p?.grupos_financeiros?.nome || p?.grupos_financeiros?.[0]?.nome || 'Minha Carteira',
    };
  }, []);

  const carregarContas = useCallback(async (grupoId: string) => {
    const { data, error } = await supabase
      .from('contas').select('id, nome, tipo').eq('grupo_id', grupoId).order('nome');
    if (error) throw new Error(error.message);
    setContas((data || []) as Conta[]);
  }, []);

  const carregarLancamentos = useCallback(async (grupoId: string) => {
    const { data, error } = await supabase
      .from('transacoes')
      .select('id,transferencia_id,grupo_id,data_caixa,data_despesa,conta_id,descricao,valor,grupo,subgrupo,status,origem,tipo,categoria_id,eh_parcela,parcela_numero,total_parcelas,created_at')
      .eq('grupo_id', grupoId)
      .order('data_despesa', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(2000);
    if (error) throw new Error(error.message);
    setLancamentos((data || []) as Lancamento[]);
  }, []);

  const carregarTela = useCallback(async () => {
    try {
      const grupo = await carregarGrupoAtivo();
      setGrupoAtivo(grupo);
      await Promise.all([carregarContas(grupo.grupo_id), carregarLancamentos(grupo.grupo_id)]);
    } catch (e: any) {
      console.log('ERRO LANCAMENTOS:', e);
    }
  }, [carregarGrupoAtivo, carregarContas, carregarLancamentos]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('FG_REFRESH_ALL', carregarTela);
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

  const primeiroFocoRef = useRef(true);
  useFocusEffect(useCallback(() => {
    if (primeiroFocoRef.current) { primeiroFocoRef.current = false; return; }
    carregarTela();
  }, [carregarTela]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await carregarTela();
    setRefreshing(false);
  }, [carregarTela]);

  // ── Prefill ────────────────────────────────────────────────────────────────

  useEffect(() => {
    // Compara por referência: cada navigate() cria um novo objeto,
    // então dois drills diferentes sempre terão referências distintas.
    if (!prefill || prefill === appliedPrefillRef.current) return;
    appliedPrefillRef.current = prefill;
    if (prefill.filtroTipo) setFiltroTipo(prefill.filtroTipo);
    if (prefill.filtroStatus) setFiltroStatus(prefill.filtroStatus);
    if (prefill.filtroContaId) setFiltroContaId(prefill.filtroContaId);
    if (prefill.filtroGrupo != null) setFiltroGrupo(String(prefill.filtroGrupo));
    if (prefill.filtroSubgrupo != null) setFiltroSubgrupo(String(prefill.filtroSubgrupo));
    if (prefill.busca != null) setBusca(String(prefill.busca));
    if (prefill.dataInicio || prefill.dataFim) {
      setPeriodoMode('custom');
      if (prefill.dataInicio) setCustomIni(prefill.dataInicio);
      if (prefill.dataFim) setCustomFim(prefill.dataFim);
    }
    if (prefill.basePeriodo) setBasePeriodo(prefill.basePeriodo);
  }, [prefill]);

  // ── Derivados ──────────────────────────────────────────────────────────────

  const mapaContas = useMemo(() => {
    const m = new Map<string, Conta>();
    contas.forEach((c) => m.set(c.id, c));
    return m;
  }, [contas]);

  const { dataInicio, dataFim } = useMemo(() => {
    if (periodoMode === 'custom') return { dataInicio: customIni, dataFim: customFim };
    if (periodoMode === 'todos') return { dataInicio: '', dataFim: '' };
    const { ini, fim } = calcPeriodo(periodoMode);
    return { dataInicio: ini, dataFim: fim };
  }, [periodoMode, customIni, customFim]);

  const getDataFiltro = useCallback((l: Lancamento) => {
    const dDesp = (l.data_despesa || '').slice(0, 10);
    const dCx = (l.data_caixa || '').slice(0, 10);
    return basePeriodo === 'caixa' ? (dCx || dDesp) : (dDesp || dCx);
  }, [basePeriodo]);

  const lancamentosFiltrados = useMemo(() => {
    let lista = [...lancamentos];

    if (dataInicio) lista = lista.filter((l) => { const d = getDataFiltro(l); return d ? d >= dataInicio : false; });
    if (dataFim)    lista = lista.filter((l) => { const d = getDataFiltro(l); return d ? d <= dataFim : false; });

    if (filtroTipo !== 'todos')     lista = lista.filter((l) => l.tipo === filtroTipo);
    if (filtroStatus !== 'todos')   lista = lista.filter((l) => (l.status || 'confirmada') === filtroStatus);
    if (filtroContaId !== 'todos')  lista = lista.filter((l) => l.conta_id === filtroContaId);
    if (filtroGrupo.trim())         lista = lista.filter((l) => normEq(l.grupo, filtroGrupo));
    if (filtroSubgrupo.trim())      lista = lista.filter((l) => normEq(l.subgrupo, filtroSubgrupo));

    if (busca.trim()) {
      const termo = normText(busca.trim());
      lista = lista.filter((l) => {
        const conta = l.conta_id ? mapaContas.get(l.conta_id)?.nome || '' : '';
        return [l.descricao, l.grupo, l.subgrupo, l.tipo, l.status, conta]
          .map(normText).join(' ').includes(termo);
      });
    }

    return lista.sort((a, b) => {
      if (ordenacao === 'valor_desc') return Math.abs(Number(b.valor || 0)) - Math.abs(Number(a.valor || 0));
      if (ordenacao === 'valor_asc')  return Math.abs(Number(a.valor || 0)) - Math.abs(Number(b.valor || 0));
      if (ordenacao === 'desc_asc')   return normText(a.descricao).localeCompare(normText(b.descricao));
      const da = parseDateSafe(a.data_despesa || a.created_at);
      const db = parseDateSafe(b.data_despesa || b.created_at);
      return ordenacao === 'data_asc' ? da - db : db - da;
    });
  }, [lancamentos, dataInicio, dataFim, filtroTipo, filtroStatus, filtroContaId, filtroGrupo, filtroSubgrupo, busca, mapaContas, getDataFiltro, ordenacao]);

  const grupos = useMemo(() => {
    const map = new Map<string, { items: Lancamento[]; receita: number; despesa: number }>();
    for (const l of lancamentosFiltrados) {
      const data = getDataFiltro(l) || (l.created_at || '').slice(0, 10) || 'sem-data';
      const prev = map.get(data) || { items: [], receita: 0, despesa: 0 };
      const v = Math.abs(Number(l.valor || 0));
      if (l.tipo === 'receita') prev.receita += v;
      else if (l.tipo === 'despesa') prev.despesa += v;
      prev.items.push(l);
      map.set(data, prev);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([data, val]) => ({ data, label: formatDiaLabel(data), ...val }));
  }, [lancamentosFiltrados, getDataFiltro]);

  const resumo = useMemo(() => {
    let receita = 0, despesa = 0;
    for (const l of lancamentosFiltrados) {
      const v = Math.abs(Number(l.valor || 0));
      if (l.tipo === 'receita') receita += v;
      else if (l.tipo === 'despesa') despesa += v;
    }
    return { receita, despesa, saldo: receita - despesa, n: lancamentosFiltrados.length };
  }, [lancamentosFiltrados]);

  const modoFlat = ordenacao !== 'data_desc' && ordenacao !== 'data_asc';

  const filtrosAtivos = useMemo(() => {
    let n = 0;
    if (filtroTipo !== 'todos') n++;
    if (filtroStatus !== 'todos') n++;
    if (filtroContaId !== 'todos') n++;
    if (filtroGrupo.trim()) n++;
    if (filtroSubgrupo.trim()) n++;
    if (basePeriodo !== 'despesa') n++;
    if (ordenacao !== 'data_desc') n++;
    return n;
  }, [filtroTipo, filtroStatus, filtroContaId, filtroGrupo, filtroSubgrupo, basePeriodo, ordenacao]);

  // ── Ações ──────────────────────────────────────────────────────────────────

  const limparFiltros = () => {
    setFiltroTipo('todos');
    setFiltroStatus('todos');
    setFiltroContaId('todos');
    setFiltroGrupo('');
    setFiltroSubgrupo('');
    setBusca('');
    setPeriodoMode('mes');
    setCustomIni('');
    setCustomFim('');
    setBasePeriodo('despesa');
    setOrdenacao('data_desc');
  };

  const executarExclusao = async (item: Lancamento) => {
    const key = item.transferencia_id || item.id;
    try {
      if (!grupoAtivo?.grupo_id) throw new Error('Carteira não carregada.');
      setDeletingKey(key);
      if (item.transferencia_id) {
        const { error } = await supabase.rpc('excluir_transferencia', { p_transferencia_id: item.transferencia_id });
        if (error) throw error;
        setLancamentos((prev) => prev.filter((x) => x.transferencia_id !== item.transferencia_id));
      } else {
        const { error } = await supabase.from('transacoes').delete().eq('id', item.id).eq('grupo_id', grupoAtivo.grupo_id);
        if (error) throw error;
        setLancamentos((prev) => prev.filter((x) => x.id !== item.id));
      }
      DeviceEventEmitter.emit('FG_REFRESH_ALL');
    } catch (e: any) {
      const msg = e?.message || 'Não foi possível excluir.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Erro', msg);
    } finally {
      setDeletingKey(null);
    }
  };

  const confirmarExclusao = (item: Lancamento) => {
    if (isViewer) {
      const msg = 'Sem permissão: perfil de visualização.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Sem permissão', msg);
      return;
    }
    const isTransf = item.tipo === 'transferencia' && !!item.transferencia_id;
    const msg = isTransf
      ? `Excluir transferência "${item.descricao || 'Sem descrição'}"? Apagará os 2 lados.`
      : `Excluir "${item.descricao || 'Sem descrição'}" (${formatMoney(item.valor)})?`;

    if (Platform.OS === 'web') {
      if (window.confirm(msg)) executarExclusao(item);
    } else {
      Alert.alert('Excluir', msg, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Excluir', style: 'destructive', onPress: () => executarExclusao(item) },
      ]);
    }
  };

  const toggleSelecionar = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selecionarTodos = () => {
    setSelectedIds(new Set(lancamentosFiltrados.map((l) => l.id)));
  };

  const cancelarSelecao = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const confirmarExclusaoEmLote = () => {
    if (selectedIds.size === 0) return;
    const qtd = selectedIds.size;
    const msg = `Excluir ${qtd} lançamento${qtd !== 1 ? 's' : ''} selecionado${qtd !== 1 ? 's' : ''}? Esta ação não pode ser desfeita.`;
    if (Platform.OS === 'web') {
      if (window.confirm(msg)) executarExclusaoEmLote();
    } else {
      Alert.alert('Excluir selecionados', msg, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Excluir', style: 'destructive', onPress: executarExclusaoEmLote },
      ]);
    }
  };

  const executarExclusaoEmLote = async () => {
    if (!grupoAtivo?.grupo_id || selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    try {
      setDeletingKey('lote');
      const { error } = await supabase
        .from('transacoes')
        .delete()
        .in('id', ids)
        .eq('grupo_id', grupoAtivo.grupo_id);
      if (error) throw error;
      setLancamentos((prev) => prev.filter((l) => !selectedIds.has(l.id)));
      DeviceEventEmitter.emit('FG_REFRESH_ALL');
      cancelarSelecao();
    } catch (e: any) {
      const msg = e?.message || 'Não foi possível excluir.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Erro', msg);
    } finally {
      setDeletingKey(null);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={fg.colors.accent} />
        <Text style={styles.centeredText}>Carregando lançamentos...</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: fg.colors.bg }}>
      <ScrollView
        contentContainerStyle={[styles.container, isDesktop && { paddingHorizontal: 28, paddingTop: 28, alignItems: 'center' }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={fg.colors.accent} />}
      >
      <View style={{ width: '100%', maxWidth: isDesktop ? 960 : undefined, alignSelf: isDesktop ? 'center' : undefined }}>
        {/* ── Cabeçalho ─────────────────────────────────────────── */}
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.screenTitle}>Lançamentos</Text>
            <Text style={styles.screenSub}>{grupoAtivo?.nome_grupo || 'Minha Carteira'}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={styles.resumoMini}>
              <Text style={[styles.resumoVal, { color: fg.colors.accent }]}>+{formatMoney(resumo.receita)}</Text>
              <Text style={[styles.resumoVal, { color: fg.colors.danger }]}>−{formatMoney(resumo.despesa)}</Text>
            </View>
            {!isViewer && (
              <Pressable
                onPress={() => { setSelectionMode((s) => !s); setSelectedIds(new Set()); }}
                style={({ pressed }) => ({
                  paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
                  borderWidth: 1,
                  borderColor: selectionMode ? fg.colors.accent : fg.colors.border,
                  backgroundColor: selectionMode ? 'rgba(74,222,128,0.1)' : 'transparent',
                  opacity: pressed ? 0.7 : 1,
                })}
                accessibilityLabel="Modo de seleção"
              >
                <Text style={{ fontSize: 11, fontWeight: '700', color: selectionMode ? fg.colors.accent : fg.colors.muted }}>
                  {selectionMode ? 'Cancelar' : 'Selecionar'}
                </Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* ── Barra de seleção ──────────────────────────────────── */}
        {selectionMode && (
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 8,
            backgroundColor: fg.colors.surface, borderRadius: 10,
            borderWidth: 1, borderColor: fg.colors.border,
            paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10,
          }}>
            <Text style={{ flex: 1, color: fg.colors.text, fontSize: 13, fontWeight: '600' }}>
              {selectedIds.size === 0 ? 'Toque para selecionar' : `${selectedIds.size} selecionado${selectedIds.size !== 1 ? 's' : ''}`}
            </Text>
            <Pressable onPress={selecionarTodos} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
              <Text style={{ color: fg.colors.accent, fontSize: 12, fontWeight: '600' }}>Todos</Text>
            </Pressable>
            <Pressable
              onPress={confirmarExclusaoEmLote}
              disabled={selectedIds.size === 0 || deletingKey === 'lote'}
              style={({ pressed }) => ({
                paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8,
                backgroundColor: selectedIds.size > 0 ? fg.colors.danger : fg.colors.border,
                opacity: (pressed || selectedIds.size === 0) ? 0.6 : 1,
              })}
            >
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>
                {deletingKey === 'lote' ? '…' : 'Excluir'}
              </Text>
            </Pressable>
          </View>
        )}

        {/* ── Busca ─────────────────────────────────────────────── */}
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar descrição, categoria, conta..."
            placeholderTextColor={fg.colors.muted}
            value={busca}
            onChangeText={setBusca}
          />
          {busca.length > 0 && (
            <Pressable onPress={() => setBusca('')} hitSlop={8}>
              <Text style={{ color: fg.colors.muted, fontSize: 16 }}>×</Text>
            </Pressable>
          )}
        </View>

        {/* ── Período shortcuts ─────────────────────────────────── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.periodoRow} contentContainerStyle={{ paddingRight: 20 }}>
          {PERIODO_OPTS.map((p) => (
            <PeriodoChip
              key={p.value}
              label={p.label}
              active={periodoMode === p.value}
              onPress={() => setPeriodoMode(p.value)}
            />
          ))}
        </ScrollView>

        {/* Custom date inputs */}
        {periodoMode === 'custom' && (
          <View style={styles.customDates}>
            <TextInput
              style={styles.dateInput}
              placeholder="Início (AAAA-MM-DD)"
              placeholderTextColor={fg.colors.muted}
              value={customIni}
              onChangeText={setCustomIni}
              keyboardType={Platform.OS === 'web' ? 'default' : 'numbers-and-punctuation'}
            />
            <Text style={{ color: fg.colors.muted, marginHorizontal: 8 }}>→</Text>
            <TextInput
              style={styles.dateInput}
              placeholder="Fim (AAAA-MM-DD)"
              placeholderTextColor={fg.colors.muted}
              value={customFim}
              onChangeText={setCustomFim}
              keyboardType={Platform.OS === 'web' ? 'default' : 'numbers-and-punctuation'}
            />
          </View>
        )}

        {/* ── Barra de filtros ──────────────────────────────────── */}
        <View style={styles.filtroBar}>
          <Pressable
            onPress={() => setFiltrosAbertos((v) => !v)}
            style={({ pressed }) => [styles.filtroBtn, pressed && { opacity: 0.75 }]}
          >
            <Text style={styles.filtroBtnText}>
              {filtrosAbertos ? 'Fechar filtros' : 'Filtros'}
            </Text>
            {filtrosAtivos > 0 && (
              <View style={styles.filtroBadge}>
                <Text style={styles.filtroBadgeText}>{filtrosAtivos}</Text>
              </View>
            )}
          </Pressable>

          <Text style={styles.countLabel}>{resumo.n} lançamento{resumo.n !== 1 ? 's' : ''}</Text>

          {(filtrosAtivos > 0 || busca || periodoMode !== 'mes') && (
            <Pressable onPress={limparFiltros} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
              <Text style={styles.limparText}>Limpar</Text>
            </Pressable>
          )}
        </View>

        {/* Filtros colapsáveis */}
        {filtrosAbertos && (
          <View style={styles.filtroPanel}>
            <Text style={styles.filtroLabel}>BASE DO PERÍODO</Text>
            <View style={styles.chipRow}>
              <FiltroChip
                label="Data despesa"
                active={basePeriodo === 'despesa'}
                onPress={() => setBasePeriodo('despesa')}
              />
              <FiltroChip
                label="Data caixa"
                active={basePeriodo === 'caixa'}
                onPress={() => setBasePeriodo('caixa')}
              />
            </View>

            <Text style={[styles.filtroLabel, { marginTop: 10 }]}>TIPO</Text>
            <View style={styles.chipRow}>
              {TIPOS.map((t) => (
                <FiltroChip key={t.value} label={t.label} active={filtroTipo === t.value} onPress={() => setFiltroTipo(t.value)} />
              ))}
            </View>

            <Text style={[styles.filtroLabel, { marginTop: 10 }]}>STATUS</Text>
            <View style={styles.chipRow}>
              {STATUS_OPTS.map((s) => (
                <FiltroChip key={s.value} label={s.label} active={filtroStatus === s.value} onPress={() => setFiltroStatus(s.value)} />
              ))}
            </View>

            <Text style={[styles.filtroLabel, { marginTop: 10 }]}>CONTA</Text>
            <View style={styles.chipRow}>
              <FiltroChip label="Todas" active={filtroContaId === 'todos'} onPress={() => setFiltroContaId('todos')} />
              {contas.slice(0, 20).map((c) => (
                <FiltroChip key={c.id} label={c.nome} active={filtroContaId === c.id} onPress={() => setFiltroContaId(c.id)} />
              ))}
            </View>

            <Text style={[styles.filtroLabel, { marginTop: 10 }]}>ORDENAR POR</Text>
            <View style={styles.chipRow}>
              {([
                { value: 'data_desc', label: 'Data ↓' },
                { value: 'data_asc',  label: 'Data ↑' },
                { value: 'valor_desc', label: 'Valor ↓' },
                { value: 'valor_asc',  label: 'Valor ↑' },
                { value: 'desc_asc',   label: 'Nome A→Z' },
              ] as const).map((o) => (
                <FiltroChip key={o.value} label={o.label} active={ordenacao === o.value} onPress={() => setOrdenacao(o.value)} />
              ))}
            </View>

            {(filtroGrupo.trim() || filtroSubgrupo.trim()) && (
              <>
                <Text style={[styles.filtroLabel, { marginTop: 10 }]}>CATEGORIA (DRILL)</Text>
                <View style={styles.chipRow}>
                  {filtroGrupo.trim() && <FiltroChip label={`${filtroGrupo}`} active onPress={() => setFiltroGrupo('')} />}
                  {filtroSubgrupo.trim() && <FiltroChip label={`${filtroSubgrupo}`} active onPress={() => setFiltroSubgrupo('')} />}
                </View>
              </>
            )}
          </View>
        )}

        {/* ── Lista ─────────────────────────────────────────────── */}
        {lancamentosFiltrados.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📭</Text>
            <Text style={styles.emptyTitle}>Nenhum lançamento</Text>
            <Text style={styles.emptyDesc}>Ajuste os filtros ou adicione um novo lançamento.</Text>
          </View>
        ) : modoFlat ? (
          <View style={styles.card}>
            {lancamentosFiltrados.map((item, idx) => {
              const conta = item.conta_id ? (mapaContas.get(item.conta_id)?.nome || 'Conta') : 'Conta';
              const key = item.transferencia_id || item.id;
              return (
                <View key={item.id}>
                  <LancamentoRow
                    item={item}
                    conta={conta}
                    onPress={() => navigation.navigate('EditarLancamento', { id: item.id })}
                    onDelete={() => { if (!deletingKey) confirmarExclusao(item); }}
                    isDeleting={deletingKey === key}
                    isViewer={isViewer}
                    selectionMode={selectionMode}
                    isSelected={selectedIds.has(item.id)}
                    onToggleSelect={() => toggleSelecionar(item.id)}
                  />
                  {idx < lancamentosFiltrados.length - 1 && <View style={styles.divider} />}
                </View>
              );
            })}
          </View>
        ) : (
          grupos.map((grupo) => (
            <View key={grupo.data}>
              <SectionHeader label={grupo.label} receita={grupo.receita} despesa={grupo.despesa} />
              <View style={styles.card}>
                {grupo.items.map((item, idx) => {
                  const conta = item.conta_id ? (mapaContas.get(item.conta_id)?.nome || 'Conta') : 'Conta';
                  const key = item.transferencia_id || item.id;
                  return (
                    <View key={item.id}>
                      <LancamentoRow
                        item={item}
                        conta={conta}
                        onPress={() => navigation.navigate('EditarLancamento', { id: item.id })}
                        onDelete={() => { if (!deletingKey) confirmarExclusao(item); }}
                        isDeleting={deletingKey === key}
                        isViewer={isViewer}
                        selectionMode={selectionMode}
                        isSelected={selectedIds.has(item.id)}
                        onToggleSelect={() => toggleSelecionar(item.id)}
                      />
                      {idx < grupo.items.length - 1 && <View style={styles.divider} />}
                    </View>
                  );
                })}
              </View>
            </View>
          ))
        )}

        <View style={{ height: 80 }} />
        </View>{/* /maxWidth wrapper */}
      </ScrollView>

      {/* ── FABs ──────────────────────────────────────────────── */}
      {!isViewer && (
        <>
          <Pressable
            onPress={() => navigation.navigate('CapturarVoz')}
            style={({ pressed }) => [styles.fabMic, pressed && { opacity: 0.85, transform: [{ scale: 0.96 }] }]}
            accessibilityLabel="Registrar gasto por voz"
          >
            <Text style={styles.fabMicLabel}>🎤</Text>
          </Pressable>
          <Pressable
            onPress={() => navigation.navigate('NovoLancamento')}
            style={({ pressed }) => [styles.fab, pressed && { opacity: 0.85, transform: [{ scale: 0.96 }] }]}
            accessibilityLabel="Novo lançamento"
          >
            <Text style={styles.fabLabel}>+</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 16 },
  centered: { flex: 1, backgroundColor: fg.colors.bg, alignItems: 'center', justifyContent: 'center' },
  centeredText: { marginTop: 12, color: fg.colors.muted, fontWeight: '500' },

  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  screenTitle: { color: fg.colors.text, fontSize: 20, fontWeight: '600' },
  screenSub: { color: fg.colors.muted, fontSize: 12, marginTop: 2 },
  resumoMini: { alignItems: 'flex-end', gap: 2 },
  resumoVal: { fontSize: 12, fontWeight: '700' },

  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: fg.colors.surface, borderWidth: 1, borderColor: fg.colors.border,
    borderRadius: fg.radius.md, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10,
  },
  searchIcon: { fontSize: 14, marginRight: 8 },
  searchInput: { flex: 1, color: fg.colors.text, fontSize: 13, fontWeight: '400' },

  periodoRow: { marginBottom: 8 },

  customDates: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  dateInput: {
    flex: 1, backgroundColor: fg.colors.surface, borderWidth: 1, borderColor: fg.colors.border,
    borderRadius: fg.radius.md, paddingHorizontal: 10, paddingVertical: 8,
    color: fg.colors.text, fontSize: 12,
  },

  filtroBar: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 8 },
  filtroBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: fg.colors.surface, borderWidth: 1, borderColor: fg.colors.border,
    borderRadius: fg.radius.md, paddingHorizontal: 12, paddingVertical: 7,
  },
  filtroBtnText: { color: fg.colors.text, fontSize: 13, fontWeight: '500' },
  filtroBadge: {
    backgroundColor: fg.colors.accent, borderRadius: 10, minWidth: 18, height: 18,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  filtroBadgeText: { color: fg.colors.onLight, fontSize: 11, fontWeight: '700' },
  countLabel: { flex: 1, color: fg.colors.muted, fontSize: 12 },
  limparText: { color: fg.colors.accent, fontSize: 12, fontWeight: '600' },

  filtroPanel: {
    backgroundColor: fg.colors.surface, borderWidth: 1, borderColor: fg.colors.border,
    borderRadius: fg.radius.md, padding: 12, marginBottom: 10,
  },
  filtroLabel: { color: fg.colors.muted, fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginBottom: 6 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap' },

  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 8, paddingHorizontal: 2, marginTop: 6,
  },
  sectionHeaderLabel: { color: fg.colors.muted, fontSize: 12, fontWeight: '600' },
  sectionHeaderSaldo: { fontSize: 12, fontWeight: '700' },

  card: {
    backgroundColor: fg.colors.surface, borderWidth: 1, borderColor: fg.colors.border,
    borderRadius: fg.radius.md, overflow: 'hidden', marginBottom: 4,
  },

  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12, gap: 10 },
  rowPressed: { backgroundColor: 'rgba(74,222,128,0.05)' },
  rowBody: { flex: 1 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  rowDesc: { flex: 1, color: fg.colors.text, fontSize: 14, fontWeight: '500' },
  rowValor: { fontSize: 14, fontWeight: '700' },
  rowBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 3 },
  rowMeta: { flex: 1, color: fg.colors.muted, fontSize: 12 },
  rowStatusRow: { flexDirection: 'row', alignItems: 'center' },
  pendenteDot: {
    width: 7, height: 7, borderRadius: 4,
    backgroundColor: '#f6c453', marginRight: 4,
  },
  deleteText: { color: fg.colors.danger, fontSize: 11, fontWeight: '500' },

  divider: { height: 1, backgroundColor: fg.colors.border, marginLeft: 58 },

  emptyState: { alignItems: 'center', paddingVertical: 48 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { color: fg.colors.text, fontSize: 16, fontWeight: '600', marginBottom: 6 },
  emptyDesc: { color: fg.colors.muted, fontSize: 13, textAlign: 'center' },

  fab: {
    position: 'absolute', bottom: 24, right: 20,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: fg.colors.accent,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: fg.colors.accent, shadowOpacity: 0.4,
    shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  fabLabel: { color: fg.colors.onLight, fontSize: 28, fontWeight: '400', lineHeight: 32 },

  fabMic: {
    position: 'absolute', bottom: 24, right: 88,
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: fg.colors.surface,
    borderWidth: 1, borderColor: fg.colors.accent,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.25,
    shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  fabMicLabel: { fontSize: 22, lineHeight: 26 },
});
