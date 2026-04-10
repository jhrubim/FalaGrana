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
} from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { fg } from '../../theme/fgTheme';

type GrupoAtivo = {
  grupo_id: string;
  papel: 'owner' | 'viewer';
  nome_grupo: string;
};

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

type Conta = {
  id: string;
  nome: string;
  tipo?: string | null;
};

type FiltroStatus = 'todos' | 'confirmada' | 'pendente';
type FiltroTipo = 'todos' | 'despesa' | 'receita' | 'transferencia';

const TIPOS: Array<{ value: FiltroTipo; label: string }> = [
  { value: 'todos', label: 'Todos' },
  { value: 'despesa', label: 'Despesa' },
  { value: 'receita', label: 'Receita' },
  { value: 'transferencia', label: 'Transferência' },
];

const STATUS_OPTS: Array<{ value: FiltroStatus; label: string }> = [
  { value: 'todos', label: 'Todos' },
  { value: 'confirmada', label: 'Confirmadas' },
  { value: 'pendente', label: 'Pendentes' },
];

function formatMoney(v?: number | null) {
  const n = Number(v || 0);
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function normalizaTexto(v?: string | null) {
  return (v || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

function parseDateSafe(s?: string | null) {
  if (!s) return 0;
  const t = Date.parse(s);
  return Number.isNaN(t) ? 0 : t;
}

function isValidYmd(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test((s || '').trim());
}

function normEq(a?: string | null, b?: string | null) {
  return normalizaTexto(a || '').trim() === normalizaTexto(b || '').trim();
}

/** ---------- UI local ---------- */

function Card({
  children,
  style,
  noShadow,
}: {
  children: React.ReactNode;
  style?: any;
  noShadow?: boolean;
}) {
  const bg =
    (fg as any)?.colors?.card ||
    (fg as any)?.colors?.surface ||
    '#161b22';
  const border = (fg as any)?.colors?.border || '#21262d';

  return (
    <View
      style={[
        {
          backgroundColor: bg,
          borderColor: border,
          borderWidth: 1,
          borderRadius: 14,
          padding: 12,
          ...(noShadow
            ? {}
            : {
                shadowColor: '#000',
                shadowOpacity: 0.15,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 6 },
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
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const bg = (fg as any)?.colors?.accent || '#4ade80';
  const text = (fg as any)?.colors?.bg || '#0d1117';

  return (
    <Pressable
      onPress={onPress}
      disabled={!!disabled}
      style={({ pressed }) => [
        {
          backgroundColor: bg,
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderRadius: 12,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text style={{ color: text, fontWeight: '900', fontSize: 12 }}>{title}</Text>
    </Pressable>
  );
}

function Input({
  placeholder,
  value,
  onChangeText,
}: {
  placeholder?: string;
  value: string;
  onChangeText: (v: string) => void;
}) {
  const border = (fg as any)?.colors?.border || '#21262d';
  const bg =
    (fg as any)?.colors?.input ||
    (fg as any)?.colors?.surface2 ||
    '#0d1117';

  return (
    <TextInput
      placeholder={placeholder}
      placeholderTextColor={(fg as any)?.colors?.muted || '#7d8590'}
      value={value}
      onChangeText={onChangeText}
      style={[
        {
          borderColor: border,
          borderWidth: 1,
          backgroundColor: bg,
          borderRadius: 12,
          paddingHorizontal: 12,
          paddingVertical: Platform.OS === 'web' ? 10 : 12,
          color: (fg as any)?.colors?.text || '#e6edf3',
          fontWeight: '800',
          fontSize: 13,
        },
      ]}
    />
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
  const border = (fg as any)?.colors?.border || '#21262d';
  const bg =
    active
      ? (fg as any)?.colors?.accent || '#4ade80'
      : (fg as any)?.colors?.surface2 || '#161b22';
  const text = active
    ? (fg as any)?.colors?.bg || '#0d1117'
    : (fg as any)?.colors?.text || '#e6edf3';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          borderColor: border,
          borderWidth: 1,
          backgroundColor: bg,
          paddingHorizontal: 10,
          paddingVertical: 8,
          borderRadius: 999,
          opacity: pressed ? 0.85 : 1,
          marginRight: 8,
          marginBottom: 8,
        },
      ]}
    >
      <Text style={{ color: text, fontWeight: '900', fontSize: 12 }}>{label}</Text>
    </Pressable>
  );
}

function Badge({
  label,
  variant,
}: {
  label: string;
  variant: 'ok' | 'warn' | 'info' | 'danger';
}) {
  const danger = (fg as any)?.colors?.danger || '#ef4444';
  const accent = (fg as any)?.colors?.accent || '#22c55e';
  const muted = (fg as any)?.colors?.muted || '#7d8590';
  const text = (fg as any)?.colors?.text || '#e6edf3';

  let border = '#21262d';
  let bg = '#161b22';
  let fgText = text;

  if (variant === 'danger') {
    border = danger;
    bg = 'rgba(248,113,113,0.12)';
    fgText = danger;
  } else if (variant === 'ok') {
    border = accent;
    bg = 'rgba(74,222,128,0.12)';
    fgText = accent;
  } else if (variant === 'warn') {
    border = muted;
    bg = 'rgba(125,133,144,0.12)';
    fgText = text;
  } else if (variant === 'info') {
    border = muted;
    bg = 'rgba(125,133,144,0.08)';
    fgText = text;
  }

  return (
    <View
      style={{
        borderColor: border,
        borderWidth: 1,
        backgroundColor: bg,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
      }}
    >
      <Text style={{ color: fgText, fontWeight: '900', fontSize: 11 }}>{label}</Text>
    </View>
  );
}

function Divider() {
  const border = (fg as any)?.colors?.border || '#21262d';
  return <View style={{ height: 1, backgroundColor: border, opacity: 0.8 }} />;
}

function Centered({
  message,
  children,
}: {
  message?: string;
  children?: React.ReactNode;
}) {
  return (
    <View style={{ flex: 1, padding: 20, alignItems: 'center', justifyContent: 'center' }}>
      {children}
      {message ? (
        <Text style={{ marginTop: 12, color: (fg as any)?.colors?.muted || '#7d8590', fontWeight: '900' }}>
          {message}
        </Text>
      ) : null}
    </View>
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
          <Text style={{ color: fg.colors.text, fontWeight: '900', fontSize: 18 }}>{title}</Text>
          {subtitle ? (
            <Text style={{ marginTop: 4, color: fg.colors.muted, fontWeight: '900', fontSize: 12 }}>
              {subtitle}
            </Text>
          ) : null}
          {info ? (
            <Text style={{ marginTop: 6, color: fg.colors.muted, fontWeight: '800', fontSize: 11 }}>
              {info}
            </Text>
          ) : null}
        </View>
        {right ? <View>{right}</View> : null}
      </View>
    </Card>
  );
}

function ExcluirWebButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  if (Platform.OS !== 'web') return null;

  return (
    <View style={styles.excluirWebWrap} pointerEvents="auto">
      {/* @ts-ignore */}
      <button
        type="button"
        disabled={!!disabled}
        onClick={(e: any) => {
          e?.preventDefault?.();
          e?.stopPropagation?.();
          onPress();
        }}
        style={{
          appearance: 'none',
          background: 'transparent',
          border: 'none',
          padding: 0,
          margin: 0,
          color: disabled ? 'rgba(125,133,144,0.45)' : fg.colors.danger,
          textDecoration: 'underline',
          fontWeight: 800,
          fontSize: 12,
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        {label}
      </button>
    </View>
  );
}

/** ---------- Screen ---------- */

type Prefill = {
  dataInicio?: string;
  dataFim?: string;
  filtroTipo?: FiltroTipo;
  filtroStatus?: FiltroStatus;
  filtroContaId?: string;
  filtroGrupo?: string;
  filtroSubgrupo?: string;
  busca?: string;
};

export default function LancamentosScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  const appliedPrefillRef = useRef(false);
  const prefill: Prefill | null = route?.params?.prefill ? (route.params.prefill as Prefill) : null;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [erroTela, setErroTela] = useState<string | null>(null);

  const [grupoAtivo, setGrupoAtivo] = useState<GrupoAtivo | null>(null);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [contas, setContas] = useState<Conta[]>([]);

  const [busca, setBusca] = useState('');
  const [filtroTipo, setFiltroTipo] = useState<FiltroTipo>('todos');
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>('todos');
  const [filtroContaId, setFiltroContaId] = useState<string>('todos');

  const [dataInicio, setDataInicio] = useState<string>('');
  const [dataFim, setDataFim] = useState<string>('');

  const [filtroGrupo, setFiltroGrupo] = useState<string>('');
  const [filtroSubgrupo, setFiltroSubgrupo] = useState<string>('');

  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [ordemData, setOrdemData] = useState<'desc' | 'asc'>('desc');

  const isViewer = grupoAtivo?.papel === 'viewer';

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
  }, []);

  const carregarLancamentos = useCallback(async (grupoId: string) => {
    const { data, error } = await supabase
      .from('transacoes')
      .select(
        `
        id,
        transferencia_id,
        grupo_id,
        data_caixa,
        data_despesa,
        conta_id,
        descricao,
        valor,
        grupo,
        subgrupo,
        status,
        origem,
        tipo,
        categoria_id,
        eh_parcela,
        parcela_numero,
        total_parcelas,
        created_at
      `
      )
      .eq('grupo_id', grupoId)
      .order('data_despesa', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(2000);

    if (error) throw new Error(`Não foi possível carregar lançamentos. (${error.message})`);
    setLancamentos((data || []) as Lancamento[]);
  }, []);

  const carregarTela = useCallback(async () => {
    setErroTela(null);
    try {
      const grupo = await carregarGrupoAtivo();
      setGrupoAtivo(grupo);
      await Promise.all([carregarContas(grupo.grupo_id), carregarLancamentos(grupo.grupo_id)]);
    } catch (e: any) {
      console.log('ERRO LANCAMENTOS carregarTela:', e);
      setErroTela(e?.message || 'Erro ao carregar lançamentos.');
      setGrupoAtivo(null);
      setContas([]);
      setLancamentos([]);
    }
  }, [carregarGrupoAtivo, carregarContas, carregarLancamentos]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('FG_REFRESH_ALL', () => carregarTela());
    return () => sub.remove();
  }, [carregarTela]);

  useEffect(() => {
    let ativo = true;
    (async () => {
      setLoading(true);
      await carregarTela();
      if (ativo) setLoading(false);
    })();
    return () => {
      ativo = false;
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

  const mapaContas = useMemo(() => {
    const m = new Map<string, Conta>();
    contas.forEach((c) => m.set(c.id, c));
    return m;
  }, [contas]);

  // aplica prefill 1x
  useEffect(() => {
    if (!prefill || appliedPrefillRef.current) return;

    if (prefill.busca != null) setBusca(String(prefill.busca || ''));
    if (prefill.filtroTipo) setFiltroTipo(prefill.filtroTipo);
    if (prefill.filtroStatus) setFiltroStatus(prefill.filtroStatus);
    if (prefill.filtroContaId) setFiltroContaId(prefill.filtroContaId);
    if (prefill.dataInicio != null) setDataInicio(String(prefill.dataInicio || ''));
    if (prefill.dataFim != null) setDataFim(String(prefill.dataFim || ''));
    if (prefill.filtroGrupo != null) setFiltroGrupo(String(prefill.filtroGrupo || ''));
    if (prefill.filtroSubgrupo != null) setFiltroSubgrupo(String(prefill.filtroSubgrupo || ''));

    appliedPrefillRef.current = true;
  }, [prefill]);

  const basePeriodo = useMemo<'caixa' | 'despesa'>(() => {
    if (filtroContaId === 'todos') return 'despesa';
    const tipoConta = (mapaContas.get(filtroContaId)?.tipo || '').toLowerCase();
    return tipoConta === 'cartao' ? 'caixa' : 'despesa';
  }, [filtroContaId, mapaContas]);

  const getDataFiltro = useCallback(
    (l: Lancamento) => {
      const dDesp = (l.data_despesa || '').slice(0, 10);
      const dCx = (l.data_caixa || '').slice(0, 10);
      if (basePeriodo === 'caixa') return dCx || dDesp || '';
      return dDesp || dCx || '';
    },
    [basePeriodo]
  );

  const lancamentosFiltrados = useMemo(() => {
    let lista = [...lancamentos];

    const iniOk = dataInicio.trim() ? isValidYmd(dataInicio.trim()) : true;
    const fimOk = dataFim.trim() ? isValidYmd(dataFim.trim()) : true;

    if (iniOk && dataInicio.trim()) {
      const ini = dataInicio.trim();
      lista = lista.filter((l) => {
        const d = getDataFiltro(l);
        return d ? d >= ini : false;
      });
    }

    if (fimOk && dataFim.trim()) {
      const fim = dataFim.trim();
      lista = lista.filter((l) => {
        const d = getDataFiltro(l);
        return d ? d <= fim : false;
      });
    }

    if (filtroTipo !== 'todos') lista = lista.filter((l) => l.tipo === filtroTipo);
    if (filtroStatus !== 'todos') lista = lista.filter((l) => (l.status || 'confirmada') === filtroStatus);
    if (filtroContaId !== 'todos') lista = lista.filter((l) => l.conta_id === filtroContaId);

    if (filtroGrupo.trim()) {
      const g = filtroGrupo.trim();
      lista = lista.filter((l) => normEq(l.grupo, g));
    }

    if (filtroSubgrupo.trim()) {
      const s = filtroSubgrupo.trim();
      lista = lista.filter((l) => normEq(l.subgrupo, s));
    }

    if (busca.trim()) {
      const termo = normalizaTexto(busca.trim());
      lista = lista.filter((l) => {
        const contaNome = l.conta_id ? mapaContas.get(l.conta_id)?.nome || '' : '';
        const alvo = [l.descricao || '', l.grupo || '', l.subgrupo || '', l.tipo || '', l.status || '', contaNome]
          .map(normalizaTexto)
          .join(' | ');
        return alvo.includes(termo);
      });
    }

    return lista.sort((a, b) => {
      const d1 = parseDateSafe(a.data_despesa || a.created_at);
      const d2 = parseDateSafe(b.data_despesa || b.created_at);
      return ordemData === 'desc' ? d2 - d1 : d1 - d2;
    });
  }, [
    lancamentos,
    dataInicio,
    dataFim,
    filtroTipo,
    filtroStatus,
    filtroContaId,
    filtroGrupo,
    filtroSubgrupo,
    busca,
    mapaContas,
    getDataFiltro,
    ordemData,
  ]);

  const saldoFinal = useMemo(() => {
    const incluirTransfer = filtroContaId !== 'todos';
    let s = 0;

    for (const l of lancamentosFiltrados) {
      const raw = Number(l.valor || 0);
      const t = String(l.tipo || '').toLowerCase();

      if (t === 'despesa') s += -Math.abs(raw);
      else if (t === 'receita') s += Math.abs(raw);
      else if (t === 'transferencia') {
        if (incluirTransfer) s += raw;
      }
    }

    return s;
  }, [lancamentosFiltrados, filtroContaId]);

  const abrirNovo = () => navigation.navigate('NovoLancamento');
  const abrirEdicao = (item: Lancamento) => navigation.navigate('EditarLancamento', { id: item.id });

  const executarExclusao = async (item: Lancamento) => {
    const key = item.transferencia_id || item.id;

    try {
      if (!grupoAtivo?.grupo_id) throw new Error('Carteira não carregada.');
      setDeletingKey(key);

      if (item.transferencia_id) {
        const { error } = await supabase.rpc('excluir_transferencia', {
          p_transferencia_id: item.transferencia_id,
        });
        if (error) throw error;

        setLancamentos((prev) => prev.filter((x) => x.transferencia_id !== item.transferencia_id));
      } else {
        const { error } = await supabase
          .from('transacoes')
          .delete()
          .eq('id', item.id)
          .eq('grupo_id', grupoAtivo.grupo_id);

        if (error) throw error;
        setLancamentos((prev) => prev.filter((x) => x.id !== item.id));
      }

      if (Platform.OS === 'web') window.alert('Lançamento excluído.');
    } catch (e: any) {
      console.log('ERRO LANCAMENTOS excluir:', e);
      if (Platform.OS === 'web') window.alert(e?.message || 'Não foi possível excluir o lançamento.');
      else Alert.alert('Erro', e?.message || 'Não foi possível excluir o lançamento.');
    } finally {
      setDeletingKey(null);
    }
  };

  const confirmarEExcluir = (item: Lancamento) => {
    if (isViewer) {
      if (Platform.OS === 'web') window.alert('Sem permissão: seu perfil é de visualização.');
      else Alert.alert('Sem permissão', 'Seu perfil é de visualização.');
      return;
    }

    const isTransf = item.tipo === 'transferencia' && !!item.transferencia_id;
    const msg = isTransf
      ? `Deseja excluir esta transferência "${item.descricao || 'Sem descrição'}" (${formatMoney(item.valor)})? Isso apagará os 2 lados.`
      : `Deseja excluir "${item.descricao || 'Sem descrição'}" (${formatMoney(item.valor)})?`;

    if (Platform.OS === 'web') {
      const ok = window.confirm(msg);
      if (!ok) return;
      executarExclusao(item);
      return;
    }

    const key = item.transferencia_id || item.id;
    Alert.alert('Excluir lançamento', msg, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: deletingKey === key ? 'Excluindo...' : 'Excluir',
        style: 'destructive',
        onPress: () => executarExclusao(item),
      },
    ]);
  };

  const limparPeriodo = () => {
    setDataInicio('');
    setDataFim('');
  };

  const limparCategoria = () => {
    setFiltroGrupo('');
    setFiltroSubgrupo('');
  };

  if (loading) {
    return (
      <Centered message="Carregando lançamentos...">
        <ActivityIndicator size="large" color={fg.colors.accent} />
      </Centered>
    );
  }

  const periodoTxt =
    (dataInicio?.trim() ? dataInicio.trim() : '...') + ' → ' + (dataFim?.trim() ? dataFim.trim() : '...');

  const contaSelNome =
    filtroContaId === 'todos' ? 'Todas' : (mapaContas.get(filtroContaId)?.nome || 'Conta');

  const hintSaldo =
    filtroContaId === 'todos'
      ? 'Saldo do filtro (transferências ignoradas).'
      : `Saldo do filtro na conta "${contaSelNome}" (transferências incluídas).`;

  const hintPeriodo =
    filtroContaId !== 'todos' && (mapaContas.get(filtroContaId)?.tipo || '').toLowerCase() === 'cartao'
      ? 'Cartão: período filtra por Data de Caixa.'
      : 'Período filtra por Data da Despesa.';

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: (fg as any)?.colors?.bg || '#0d1117' }}
      contentContainerStyle={{ padding: 14, paddingBottom: 24 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={fg.colors.accent} />}
    >
      <Header
        title="Lançamentos"
        subtitle={grupoAtivo?.nome_grupo || 'Minha Carteira'}
        info={`Perfil: ${isViewer ? 'Viewer' : 'Owner'} • ${lancamentosFiltrados.length} item(ns) no filtro • Período: ${periodoTxt}`}
        right={!isViewer ? <Button title="+ Novo" onPress={abrirNovo} /> : undefined}
      />

      <View style={{ height: 10 }} />

      <Card>
        <Input placeholder="Buscar por descrição, grupo, subgrupo, conta..." value={busca} onChangeText={setBusca} />
      </Card>

      <View style={{ height: 10 }} />

      <Card>
        <Text style={styles.filterLabel}>Período (inicial e final)</Text>

        <View style={{ flexDirection: 'row' }}>
          <View style={{ flex: 1, marginRight: 10 }}>
            <Input placeholder="Data inicial (YYYY-MM-DD)" value={dataInicio} onChangeText={setDataInicio} />
          </View>
          <View style={{ flex: 1 }}>
            <Input placeholder="Data final (YYYY-MM-DD)" value={dataFim} onChangeText={setDataFim} />
          </View>
        </View>

        <View style={{ height: 10 }} />
        <View style={styles.filterRow}>
          <Chip label="Limpar período" active={false} onPress={limparPeriodo} />
        </View>

        <View style={{ height: 8 }} />
        <Text style={styles.periodHint}>{hintPeriodo}</Text>

        {(filtroGrupo.trim() || filtroSubgrupo.trim()) ? (
          <>
            <View style={{ height: 10 }} />
            <Text style={styles.filterLabel}>Categoria (drill)</Text>
            <View style={styles.filterRow}>
              {filtroGrupo.trim() ? <Chip label={`Grupo: ${filtroGrupo.trim()}`} active onPress={() => {}} /> : null}
              {filtroSubgrupo.trim() ? <Chip label={`Sub: ${filtroSubgrupo.trim()}`} active onPress={() => {}} /> : null}
              <Chip label="Limpar categoria" active={false} onPress={limparCategoria} />
            </View>
          </>
        ) : null}

        <View style={{ height: 10 }} />

        <Text style={styles.filterLabel}>Tipo</Text>
        <View style={styles.filterRow}>
          {TIPOS.map((t) => (
            <Chip
              key={t.value}
              label={t.label}
              active={filtroTipo === t.value}
              onPress={() => setFiltroTipo(t.value)}
            />
          ))}
        </View>

        <View style={{ height: 10 }} />

        <Text style={styles.filterLabel}>Status</Text>
        <View style={styles.filterRow}>
          {STATUS_OPTS.map((s) => (
            <Chip
              key={s.value}
              label={s.label}
              active={filtroStatus === s.value}
              onPress={() => setFiltroStatus(s.value)}
            />
          ))}
        </View>

        <View style={{ height: 10 }} />

        <Text style={styles.filterLabel}>Conta</Text>
        <View style={styles.filterRow}>
          <Chip label="Todas" active={filtroContaId === 'todos'} onPress={() => setFiltroContaId('todos')} />
          {contas.slice(0, 20).map((c) => (
            <Chip key={c.id} label={c.nome} active={filtroContaId === c.id} onPress={() => setFiltroContaId(c.id)} />
          ))}
        </View>
      </Card>

      <View style={{ height: 10 }} />

      <Card noShadow>
        <Text style={styles.summaryLabel}>Saldo final no filtro</Text>
        <Text style={[styles.summaryValue, saldoFinal >= 0 ? styles.pos : styles.neg]}>{formatMoney(saldoFinal)}</Text>
        <Text style={styles.summaryHint}>{hintSaldo}</Text>
      </Card>

      <View style={{ height: 10 }} />

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' }}>
        <Pressable
          onPress={() => setOrdemData((o) => (o === 'desc' ? 'asc' : 'desc'))}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: (fg as any)?.colors?.surface || '#161b22',
            borderColor: (fg as any)?.colors?.border || '#21262d',
            borderWidth: 1,
            borderRadius: 999,
            paddingHorizontal: 12,
            paddingVertical: 7,
            opacity: pressed ? 0.75 : 1,
          })}
          accessibilityLabel={ordemData === 'desc' ? 'Ordenar por data crescente' : 'Ordenar por data decrescente'}
        >
          <Text style={{ color: (fg as any)?.colors?.muted || '#7d8590', fontSize: 12, fontWeight: '900' }}>
            Data {ordemData === 'desc' ? '↓ Mais recente' : '↑ Mais antigo'}
          </Text>
        </Pressable>
      </View>

      <View style={{ height: 8 }} />

      {lancamentosFiltrados.length === 0 ? (
        <Card>
          <Text style={styles.emptyText}>Nenhum lançamento encontrado no filtro atual.</Text>
        </Card>
      ) : (
        <Card style={{ padding: 0 }}>
          {lancamentosFiltrados.map((item, idx) => {
            const conta = item.conta_id ? mapaContas.get(item.conta_id) : null;
            const tipo = item.tipo || 'despesa';
            const status = (item.status || 'confirmada') as 'confirmada' | 'pendente';
            const dataRef = (item.data_despesa || item.data_caixa || '-').slice(0, 10);

            const key = item.transferencia_id || item.id;
            const isDeletingThis = deletingKey === key;

            const badgeTipo = tipo === 'receita' ? 'ok' : tipo === 'transferencia' ? 'info' : 'danger';

            const vNum = Number(item.valor || 0);
            const isPos = vNum >= 0;
            const valorStyle =
              tipo === 'transferencia' ? (isPos ? styles.pos : styles.neg) : tipo === 'receita' ? styles.pos : styles.neg;

            const prefixo =
              tipo === 'transferencia' ? (vNum === 0 ? '' : isPos ? '+' : '-') : tipo === 'receita' ? '+' : '-';

            return (
              <View key={item.id} style={styles.rowWrap}>
                <Pressable
                  onPress={() => abrirEdicao(item)}
                  disabled={!!deletingKey}
                  style={({ pressed }) => [styles.listItem, pressed ? styles.listItemPressed : null]}
                >
                  <View style={styles.itemTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemDescricao} numberOfLines={1}>
                        {item.descricao || '(Sem descrição)'}
                      </Text>
                      <Text style={styles.itemMeta} numberOfLines={1}>
                        {item.grupo || '-'} • {item.subgrupo || '-'}
                      </Text>
                      <Text style={styles.itemMeta} numberOfLines={1}>
                        {conta?.nome || 'Conta não encontrada'} • {dataRef}
                      </Text>
                      {tipo === 'transferencia' && item.transferencia_id ? (
                        <Text style={styles.itemMeta} numberOfLines={1}>
                          Transferência: {item.transferencia_id.slice(0, 8)}
                        </Text>
                      ) : null}
                    </View>

                    <View style={{ alignItems: 'flex-end' }}>
                      <Badge label={tipo.toUpperCase()} variant={badgeTipo as any} />
                      <Text style={[styles.itemValor, { marginTop: 8 }, valorStyle]}>
                        {prefixo}
                        {formatMoney(Math.abs(vNum))}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.itemBottom}>
                    <Badge
                      label={status === 'confirmada' ? 'Confirmada' : 'Pendente'}
                      variant={status === 'confirmada' ? 'ok' : 'warn'}
                    />

                    {!isViewer && Platform.OS !== 'web' ? (
                      <Pressable
                        hitSlop={12}
                        onPress={() => {
                          if (isDeletingThis) return;
                          confirmarEExcluir(item);
                        }}
                      >
                        <Text style={[styles.actionText, styles.actionDanger]}>
                          {isDeletingThis ? 'Excluindo...' : 'Excluir'}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                </Pressable>

                {!isViewer ? (
                  <ExcluirWebButton
                    label={isDeletingThis ? 'Excluindo...' : 'Excluir'}
                    disabled={!!deletingKey}
                    onPress={() => {
                      if (isDeletingThis) return;
                      confirmarEExcluir(item);
                    }}
                  />
                ) : null}

                {idx < lancamentosFiltrados.length - 1 ? <Divider /> : null}
              </View>
            );
          })}
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  filterLabel: { color: fg.colors.muted, ...(fg as any)?.typography?.label, marginBottom: 6 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap' },

  periodHint: { color: fg.colors.muted, fontSize: 11, fontWeight: '800' },

  summaryLabel: { color: fg.colors.muted, fontSize: 11, fontWeight: '900', marginBottom: 6 },
  summaryValue: { color: fg.colors.text, fontSize: 16, fontWeight: '900' },
  summaryHint: { marginTop: 6, color: fg.colors.muted, fontSize: 11, fontWeight: '800' },

  pos: { color: fg.colors.accent },
  neg: { color: fg.colors.danger },

  emptyText: { color: fg.colors.muted, ...(fg as any)?.typography?.body },

  rowWrap: { position: 'relative' },
  listItem: { paddingHorizontal: 12, paddingVertical: 12 },
  listItemPressed: { backgroundColor: 'rgba(74,222,128,0.06)' },

  itemTop: { flexDirection: 'row', justifyContent: 'space-between' },
  itemDescricao: { color: fg.colors.text, fontWeight: '900', fontSize: 14 },
  itemMeta: { marginTop: 2, color: fg.colors.muted, fontSize: 12, fontWeight: '800' },
  itemValor: { fontWeight: '900', fontSize: 13 },

  itemBottom: { marginTop: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },

  actionText: { color: fg.colors.muted, fontSize: 12, fontWeight: '800' },
  actionDanger: { color: fg.colors.danger, textDecorationLine: 'underline' },

  excluirWebWrap: { position: 'absolute', right: 12, bottom: 12, zIndex: 9999 },
});