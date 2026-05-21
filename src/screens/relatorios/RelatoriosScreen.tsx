import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  DeviceEventEmitter,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { fg } from '../../theme/fgTheme';

// ─── Types ───────────────────────────────────────────────────────────────────

type Conta = { id: string; nome: string; tipo?: string | null };

type Lancamento = {
  id: string;
  data_despesa: string | null;
  data_caixa: string | null;
  descricao: string | null;
  valor: number | null;
  tipo: string | null;
  grupo: string | null;
  subgrupo: string | null;
  conta_id: string | null;
  status: string | null;
};

type GrupoAtivo = { grupo_id: string; papel: 'owner' | 'viewer'; nome_grupo: string };

type CatDado = {
  key: string; label: string; grupo: string; subgrupo: string;
  valor: number; count: number; pct: number; classe: 'A' | 'B' | 'C';
  valorAnterior: number; diff: number; diffPct: number | null;
};

type MesDado = { mes: number; label: string; despesa: number; receita: number };

type Insight = { tipo: 'alerta' | 'ok' | 'info'; texto: string };

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const MESES_LONG = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function fmoney(v: number) {
  return Math.abs(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fpct(v: number) {
  return `${v >= 0 ? '+' : ''}${v.toFixed(0)}%`;
}

function normText(s?: string | null) {
  return (s || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim();
}

function normRec(s?: string | null): string {
  return normText(s)
    .replace(/\b\d{2}[/.\-]\d{2}([/.\-]\d{2,4})?\b/g, '')
    .replace(/\b\d{6,}\b/g, '')
    .replace(/\s+/g, ' ').trim().slice(0, 30);
}

function diasNoMes(ano: number, mes: number) {
  return new Date(ano, mes, 0).getDate();
}

// ─── Exportação ──────────────────────────────────────────────────────────────

type LancamentoExport = {
  data_despesa: string | null;
  data_caixa: string | null;
  descricao: string | null;
  valor: number | null;
  tipo: string | null;
  grupo: string | null;
  subgrupo: string | null;
  status: string | null;
  contaNome: string;
};

function gerarCSV(linhas: LancamentoExport[], periodoLabel: string): string {
  const esc = (v: string) => `"${(v ?? '').replace(/"/g, '""')}"`;
  const header = ['Data Despesa', 'Data Caixa', 'Descrição', 'Valor', 'Tipo', 'Grupo', 'Categoria', 'Conta', 'Status'];
  const rows = linhas.map((l) => [
    esc(l.data_despesa?.slice(0, 10) ?? ''),
    esc(l.data_caixa?.slice(0, 10) ?? ''),
    esc(l.descricao ?? ''),
    String(Math.abs(Number(l.valor || 0)).toFixed(2)).replace('.', ','),
    esc(l.tipo ?? ''),
    esc(l.grupo ?? ''),
    esc(l.subgrupo ?? ''),
    esc(l.contaNome),
    esc(l.status ?? ''),
  ]);
  const totalDespesa = linhas.filter(l => l.tipo === 'despesa').reduce((s, l) => s + Math.abs(Number(l.valor || 0)), 0);
  const totalReceita = linhas.filter(l => l.tipo === 'receita').reduce((s, l) => s + Math.abs(Number(l.valor || 0)), 0);
  const rodape = [
    [],
    [esc(`Total despesas: R$ ${totalDespesa.toFixed(2).replace('.', ',')}`), ...Array(8).fill('""')],
    [esc(`Total receitas: R$ ${totalReceita.toFixed(2).replace('.', ',')}`), ...Array(8).fill('""')],
    [esc(`Período: ${periodoLabel}`), ...Array(8).fill('""')],
  ];
  return [header.join(';'), ...rows.map(r => r.join(';')), ...rodape.map(r => r.join(';'))].join('\r\n');
}

function baixarCSV(csv: string, nomeArquivo: string) {
  if (Platform.OS !== 'web') return false;
  try {
    const bom = '﻿';
    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nomeArquivo;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}

// ─── UI Primitivos ────────────────────────────────────────────────────────────

function Card({ children, style }: { children: React.ReactNode; style?: any }) {
  return (
    <View style={[{
      backgroundColor: fg.colors.surface,
      borderColor: fg.colors.border,
      borderWidth: 1,
      borderRadius: fg.radius.lg,
      padding: fg.spacing.card,
    }, style]}>
      {children}
    </View>
  );
}

function SecTitle({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: fg.colors.muted, fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' }}>{title}</Text>
        {sub ? <Text style={{ color: fg.colors.muted, fontSize: 11, marginTop: 3 }}>{sub}</Text> : null}
      </View>
      {right}
    </View>
  );
}

function DiffBadge({ diff, invertido = false, size = 'md' }: { diff: number | null; invertido?: boolean; size?: 'sm' | 'md' }) {
  if (diff === null) return null;
  const bom = invertido ? diff <= 0 : diff >= 0;
  const cor = bom ? fg.colors.accent : fg.colors.danger;
  const sinal = diff >= 0 ? '+' : '';
  const fs = size === 'sm' ? 10 : 12;
  return (
    <View style={{
      paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6,
      backgroundColor: bom ? fg.colors.accentSoft : fg.colors.dangerSoft,
      borderWidth: 1, borderColor: cor + '44',
    }}>
      <Text style={{ color: cor, fontWeight: '700', fontSize: fs }}>{sinal}{diff.toFixed(0)}%</Text>
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        paddingHorizontal: 10, paddingVertical: 7,
        borderRadius: fg.radius.pill,
        backgroundColor: active ? fg.colors.accent : fg.colors.surface,
        borderWidth: 1, borderColor: active ? fg.colors.accent : fg.colors.border,
        marginRight: 6, marginBottom: 6, opacity: pressed ? 0.8 : 1,
      })}
    >
      <Text style={{ fontSize: 12, fontWeight: '600', color: active ? fg.colors.onLight : fg.colors.muted }}>
        {label}
      </Text>
    </Pressable>
  );
}

// ─── Gráfico de barras mensal ─────────────────────────────────────────────────

function GraficoMensal({
  dados, mesAtivo, onPressMes, mostrarReceita, barH,
}: {
  dados: MesDado[]; mesAtivo: number | null;
  onPressMes: (m: number | null) => void;
  mostrarReceita: boolean; barH: number;
}) {
  const maxVal = Math.max(...dados.flatMap((d) => [d.despesa, mostrarReceita ? d.receita : 0]), 1);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: barH + 24 }}>
      {dados.map((d) => {
        const hDesp = (d.despesa / maxVal) * barH;
        const hRec = mostrarReceita ? (d.receita / maxVal) * barH : 0;
        const ativo = mesAtivo === d.mes;

        return (
          <Pressable
            key={d.mes}
            onPress={() => onPressMes(ativo ? null : d.mes)}
            style={{ flex: 1, alignItems: 'center' }}
            accessibilityLabel={`${d.label}: ${fmoney(d.despesa)}`}
          >
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: barH, gap: 2 }}>
              {mostrarReceita ? (
                <View style={{ width: 5, height: Math.max(hRec, 2), backgroundColor: ativo ? fg.colors.accent : 'rgba(74,222,128,0.4)', borderRadius: 2 }} />
              ) : null}
              <View style={{ width: mostrarReceita ? 5 : 10, height: Math.max(hDesp, 2), backgroundColor: ativo ? fg.colors.danger : 'rgba(248,113,113,0.45)', borderRadius: 2 }} />
            </View>
            <Text style={{ fontSize: 9, marginTop: 4, color: ativo ? fg.colors.text : fg.colors.muted, fontWeight: ativo ? '700' : '500' }}>
              {d.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── Componente de categoria com trend ───────────────────────────────────────

const ABC_CFG = {
  A: { color: fg.colors.accent,  bg: fg.colors.accentSoft, border: 'rgba(74,222,128,0.35)' },
  B: { color: fg.colors.warn,    bg: fg.colors.warnSoft,   border: 'rgba(246,196,83,0.35)' },
  C: { color: fg.colors.muted,   bg: 'transparent',        border: fg.colors.border },
};

function CategoriaRow({
  item, totalDespesas, onPress,
}: {
  item: CatDado; totalDespesas: number; onPress: () => void;
}) {
  const cfg = ABC_CFG[item.classe];
  const barW = totalDespesas > 0 ? (item.valor / totalDespesas) * 100 : 0;
  const barWAnt = totalDespesas > 0 ? (item.valorAnterior / totalDespesas) * 100 : 0;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        paddingVertical: 10,
        borderBottomWidth: 1, borderBottomColor: fg.colors.border,
        opacity: pressed ? 0.75 : 1,
      })}
      accessibilityLabel={`${item.label} — ver lançamentos`}
    >
      {/* Linha 1: classe badge + nome + valor */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, backgroundColor: cfg.bg, borderWidth: 1, borderColor: cfg.border }}>
          <Text style={{ color: cfg.color, fontSize: 10, fontWeight: '700' }}>{item.classe}</Text>
        </View>
        <Text style={{ flex: 1, color: fg.colors.text, fontSize: 13, fontWeight: '600' }} numberOfLines={1}>
          {item.label}
        </Text>
        <Text style={{ color: fg.colors.danger, fontWeight: '700', fontSize: 14 }}>
          {fmoney(item.valor)}
        </Text>
        <Text style={{ color: fg.colors.muted, fontSize: 11, marginLeft: 4 }}>↗</Text>
      </View>

      {/* Linha 2: contagem + diff vs anterior */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <Text style={{ color: fg.colors.muted, fontSize: 11 }}>{item.count}× • {item.pct.toFixed(1)}% dos gastos</Text>
        {item.valorAnterior > 0 && (
          <Text style={{ color: fg.colors.muted, fontSize: 11 }}>ant. {fmoney(item.valorAnterior)}</Text>
        )}
        <DiffBadge diff={item.diffPct} invertido size="sm" />
      </View>

      {/* Barra dupla: atual vs anterior */}
      <View style={{ gap: 3 }}>
        <View style={{ height: 4, backgroundColor: fg.colors.border, borderRadius: 2, overflow: 'hidden' }}>
          <View style={{ height: 4, width: `${Math.min(barW, 100)}%`, backgroundColor: cfg.color, borderRadius: 2, opacity: 0.85 }} />
        </View>
        {item.valorAnterior > 0 && (
          <View style={{ height: 2, backgroundColor: fg.colors.border, borderRadius: 1, overflow: 'hidden' }}>
            <View style={{ height: 2, width: `${Math.min(barWAnt, 100)}%`, backgroundColor: fg.colors.muted, borderRadius: 1, opacity: 0.5 }} />
          </View>
        )}
      </View>
    </Pressable>
  );
}

// ─── Tela ─────────────────────────────────────────────────────────────────────

export default function RelatoriosScreen() {
  const navigation = useNavigation<any>();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
  const anoAtual = new Date().getFullYear();
  const mesAtual = new Date().getMonth() + 1;
  const diaAtual = new Date().getDate();

  const [loading, setLoading] = useState(true);
  const [loadingDados, setLoadingDados] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [grupoAtivo, setGrupoAtivo] = useState<GrupoAtivo | null>(null);
  const [contas, setContas] = useState<Conta[]>([]);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);

  const [ano, setAno] = useState(anoAtual);
  const [mes, setMes] = useState<number | null>(mesAtual);
  const [contaId, setContaId] = useState<string>('todas');
  const [mostrarReceita, setMostrarReceita] = useState(false);
  const [basePeriodo, setBasePeriodo] = useState<'despesa' | 'caixa'>('despesa');
  const [listaAberta, setListaAberta] = useState(false);
  const [filtroTipoLista, setFiltroTipoLista] = useState<'despesa' | 'receita' | 'transferencia' | 'todos'>('despesa');
  const [ordenacao, setOrdenacao] = useState<'data_desc' | 'data_asc' | 'valor_desc' | 'valor_asc'>('data_desc');
  const [filtroValorMin, setFiltroValorMin] = useState('');
  const [filtroValorMax, setFiltroValorMax] = useState('');

  const primeiroLoad = useRef(true);

  // ─── Fetch ────────────────────────────────────────────────────────────────

  const carregarGrupo = useCallback(async (): Promise<GrupoAtivo> => {
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr || !auth?.user?.id) throw new Error('Usuário não autenticado.');
    const { data, error } = await supabase
      .from('grupo_membros')
      .select('grupo_id, papel, status, grupos_financeiros(id, nome)')
      .eq('user_id', auth.user.id).eq('status', 'ativo')
      .order('created_at', { ascending: true }).limit(1).single();
    if (error) throw new Error(error.message);
    const d = data as any;
    return {
      grupo_id: d.grupo_id, papel: d.papel,
      nome_grupo: d.grupos_financeiros?.nome || d.grupos_financeiros?.[0]?.nome || 'Minha Carteira',
    };
  }, []);

  const carregarDados = useCallback(async (grupoId: string, anoRef: number, base: 'despesa' | 'caixa') => {
    const start = `${anoRef}-01-01`;
    const end = `${anoRef}-12-31`;
    const select = 'id, data_despesa, data_caixa, descricao, valor, tipo, grupo, subgrupo, conta_id, status';

    let rows: Lancamento[];
    if (base === 'caixa') {
      const [contasRes, comCaixa, semCaixa] = await Promise.all([
        supabase.from('contas').select('id, nome, tipo').eq('grupo_id', grupoId).order('nome'),
        supabase.from('transacoes').select(select).eq('grupo_id', grupoId)
          .in('tipo', ['despesa', 'receita', 'transferencia'])
          .not('data_caixa', 'is', null).gte('data_caixa', start).lte('data_caixa', end).limit(12000),
        supabase.from('transacoes').select(select).eq('grupo_id', grupoId)
          .in('tipo', ['despesa', 'receita', 'transferencia'])
          .is('data_caixa', null).gte('data_despesa', start).lte('data_despesa', end).limit(4000),
      ]);
      if (contasRes.error) throw new Error(contasRes.error.message);
      if (comCaixa.error) throw new Error(comCaixa.error.message);
      if (semCaixa.error) throw new Error(semCaixa.error.message);
      setContas((contasRes.data || []) as Conta[]);
      rows = [...((comCaixa.data || []) as Lancamento[]), ...((semCaixa.data || []) as Lancamento[])];
    } else {
      const [contasRes, lancRes] = await Promise.all([
        supabase.from('contas').select('id, nome, tipo').eq('grupo_id', grupoId).order('nome'),
        supabase.from('transacoes').select(select).eq('grupo_id', grupoId)
          .in('tipo', ['despesa', 'receita', 'transferencia'])
          .gte('data_despesa', start).lte('data_despesa', end).limit(12000),
      ]);
      if (contasRes.error) throw new Error(contasRes.error.message);
      if (lancRes.error) throw new Error(lancRes.error.message);
      setContas((contasRes.data || []) as Conta[]);
      rows = (lancRes.data || []) as Lancamento[];
    }
    setLancamentos(rows);
  }, []);

  const inicializar = useCallback(async (base?: 'despesa' | 'caixa') => {
    setErro(null);
    try {
      const grupo = await carregarGrupo();
      setGrupoAtivo(grupo);
      await carregarDados(grupo.grupo_id, ano, base ?? basePeriodo);
    } catch (e: any) {
      setErro(e?.message || 'Erro ao carregar.');
    }
  }, [carregarGrupo, carregarDados, ano, basePeriodo]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      await inicializar();
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, []); // eslint-disable-line

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('FG_REFRESH_ALL', () => inicializar(basePeriodo));
    return () => sub.remove();
  }, [inicializar, basePeriodo]);

  useEffect(() => {
    if (primeiroLoad.current) { primeiroLoad.current = false; return; }
    if (!grupoAtivo?.grupo_id) return;
    let alive = true;
    (async () => {
      setLoadingDados(true);
      try { await carregarDados(grupoAtivo.grupo_id, ano, basePeriodo); }
      catch (e: any) { setErro(e?.message || 'Erro.'); }
      finally { if (alive) setLoadingDados(false); }
    })();
    return () => { alive = false; };
  }, [ano, basePeriodo]); // eslint-disable-line

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await inicializar(basePeriodo);
    setRefreshing(false);
  }, [inicializar, basePeriodo]);

  // ─── Dados derivados ──────────────────────────────────────────────────────

  const getDataLanc = useCallback((l: Lancamento): string => {
    if (basePeriodo === 'caixa') return ((l.data_caixa || l.data_despesa) || '').slice(0, 7);
    return (l.data_despesa || '').slice(0, 7);
  }, [basePeriodo]);

  const lancConta = useMemo(() => {
    if (contaId === 'todas') return lancamentos;
    return lancamentos.filter((l) => l.conta_id === contaId);
  }, [lancamentos, contaId]);

  const chaveAtual = useMemo(() => {
    if (mes === null) return null;
    return `${ano}-${String(mes).padStart(2, '0')}`;
  }, [ano, mes]);

  const chaveAnterior = useMemo(() => {
    if (mes === null || mes === 1) return null;
    return `${ano}-${String(mes - 1).padStart(2, '0')}`;
  }, [ano, mes]);

  const lancPeriodo = useMemo(() => {
    if (chaveAtual === null) return lancConta;
    return lancConta.filter((l) => getDataLanc(l) === chaveAtual);
  }, [lancConta, chaveAtual, getDataLanc]);

  const lancAnterior = useMemo(() => {
    if (!chaveAnterior) return [];
    return lancConta.filter((l) => getDataLanc(l) === chaveAnterior);
  }, [lancConta, chaveAnterior, getDataLanc]);

  const dadosMensais = useMemo<MesDado[]>(() => {
    return MESES.map((label, i) => {
      const m = i + 1;
      const chave = `${ano}-${String(m).padStart(2, '0')}`;
      let despesa = 0, receita = 0;
      for (const l of lancConta) {
        if (getDataLanc(l) !== chave) continue;
        const raw = Number(l.valor || 0);
        const val = Math.abs(raw);
        if (l.tipo === 'transferencia') { if (raw > 0) receita += val; else despesa += val; }
        else if (l.tipo === 'despesa') despesa += val;
        else if (l.tipo === 'receita') receita += val;
      }
      return { mes: m, label, despesa, receita };
    });
  }, [lancConta, ano, getDataLanc]);

  const resumo = useMemo(() => {
    let receita = 0, despesa = 0, pendente = 0;
    for (const l of lancPeriodo) {
      const raw = Number(l.valor || 0);
      const val = Math.abs(raw);
      if (l.tipo === 'transferencia') { if (raw > 0) receita += val; else despesa += val; }
      else if (l.tipo === 'receita') receita += val;
      else if (l.tipo === 'despesa') {
        despesa += val;
        if ((l.status || 'confirmada') === 'pendente') pendente += val;
      }
    }
    return { receita, despesa, saldo: receita - despesa, n: lancPeriodo.length, pendente };
  }, [lancPeriodo]);

  const resumoAnterior = useMemo(() => {
    let receita = 0, despesa = 0;
    for (const l of lancAnterior) {
      const raw = Number(l.valor || 0);
      const val = Math.abs(raw);
      if (l.tipo === 'receita') receita += val;
      else if (l.tipo === 'despesa') despesa += val;
    }
    return { receita, despesa, saldo: receita - despesa };
  }, [lancAnterior]);

  // Variação despesa vs mês anterior
  const variacaoDespesa = useMemo(() => {
    if (!chaveAnterior || resumoAnterior.despesa === 0) return null;
    return ((resumo.despesa - resumoAnterior.despesa) / resumoAnterior.despesa) * 100;
  }, [resumo.despesa, resumoAnterior.despesa, chaveAnterior]);

  // Ritmo de gastos (apenas mês corrente)
  const ritmo = useMemo(() => {
    if (mes === null || ano !== anoAtual || mes !== mesAtual) return null;
    const totalDias = diasNoMes(ano, mes);
    const diasPassados = Math.max(1, diaAtual);
    const mediaHoje = resumo.despesa / diasPassados;
    const projetado = mediaHoje * totalDias;
    const pct = Math.round((diasPassados / totalDias) * 100);
    const varVsAnt = resumoAnterior.despesa > 0
      ? ((projetado - resumoAnterior.despesa) / resumoAnterior.despesa) * 100
      : null;
    return { diasPassados, totalDias, pct, mediaHoje, projetado, varVsAnt };
  }, [mes, ano, anoAtual, mesAtual, diaAtual, resumo.despesa, resumoAnterior.despesa]);

  // Categorias com trend vs período anterior
  const categorias = useMemo<CatDado[]>(() => {
    // mapa do período atual
    const map = new Map<string, { label: string; grupo: string; subgrupo: string; valor: number; count: number }>();
    for (const l of lancPeriodo) {
      if (l.tipo !== 'despesa') continue;
      const grupo = (l.grupo || 'Outros').trim();
      const sub = (l.subgrupo || 'Não categorizado').trim();
      const key = `${grupo}||${sub}`;
      const prev = map.get(key) || { label: sub === grupo ? grupo : `${grupo} › ${sub}`, grupo, subgrupo: sub, valor: 0, count: 0 };
      map.set(key, { ...prev, valor: prev.valor + Math.abs(Number(l.valor || 0)), count: prev.count + 1 });
    }

    // mapa do período anterior
    const mapAnt = new Map<string, number>();
    for (const l of lancAnterior) {
      if (l.tipo !== 'despesa') continue;
      const grupo = (l.grupo || 'Outros').trim();
      const sub = (l.subgrupo || 'Não categorizado').trim();
      const key = `${grupo}||${sub}`;
      mapAnt.set(key, (mapAnt.get(key) || 0) + Math.abs(Number(l.valor || 0)));
    }

    const sorted = [...map.entries()].map(([key, c]) => {
      const valorAnterior = mapAnt.get(key) || 0;
      const diff = c.valor - valorAnterior;
      const diffPct = valorAnterior > 0 ? (diff / valorAnterior) * 100 : null;
      return { key, ...c, valorAnterior, diff, diffPct };
    }).sort((a, b) => b.valor - a.valor).slice(0, 15);

    const total = sorted.reduce((s, c) => s + c.valor, 0);
    let acum = 0;
    return sorted.map((c) => {
      const pct = total > 0 ? (c.valor / total) * 100 : 0;
      acum += pct;
      const classe: 'A' | 'B' | 'C' = acum <= 70 ? 'A' : acum <= 90 ? 'B' : 'C';
      return { ...c, pct, classe };
    });
  }, [lancPeriodo, lancAnterior]);

  const totalDespesas = useMemo(() => categorias.reduce((s, c) => s + c.valor, 0), [categorias]);

  const topDespesas = useMemo(() =>
    lancPeriodo
      .filter((l) => l.tipo === 'despesa')
      .sort((a, b) => Math.abs(Number(b.valor || 0)) - Math.abs(Number(a.valor || 0)))
      .slice(0, 8),
    [lancPeriodo]
  );

  const recorrentes = useMemo(() => {
    const map = new Map<string, { desc: string; cat: string; grupo: string; subgrupo: string; meses: Set<number>; total: number; count: number }>();
    for (const l of lancConta) {
      if (l.tipo !== 'despesa') continue;
      const dataRef = basePeriodo === 'caixa' ? (l.data_caixa || l.data_despesa || '') : (l.data_despesa || l.data_caixa || '');
      const m = Number(dataRef.slice(5, 7));
      if (!m) continue;
      const grupo = (l.grupo || 'Outros').trim();
      const sub = (l.subgrupo || 'Não categorizado').trim();
      const chave = normRec(l.descricao) + '||' + normText(grupo) + '||' + normText(sub);
      const prev = map.get(chave) || { desc: (l.descricao || '').trim(), cat: `${grupo} › ${sub}`, grupo, subgrupo: sub, meses: new Set<number>(), total: 0, count: 0 };
      prev.meses.add(m); prev.total += Math.abs(Number(l.valor || 0)); prev.count += 1;
      map.set(chave, prev);
    }
    return [...map.values()]
      .filter((r) => r.meses.size >= 2)
      .sort((a, b) => b.meses.size - a.meses.size || b.total - a.total)
      .slice(0, 12)
      .map((r) => ({ ...r, media: r.total / r.count, mesesCount: r.meses.size, anual: (r.total / r.count) * 12 }));
  }, [lancConta, basePeriodo]);

  // Insights automáticos
  const insights = useMemo<Insight[]>(() => {
    const list: Insight[] = [];

    // Ritmo de gastos
    if (ritmo && ritmo.varVsAnt !== null) {
      if (ritmo.varVsAnt > 15) {
        list.push({ tipo: 'alerta', texto: `Projeção: ${fmoney(ritmo.projetado)} este mês — ${fpct(ritmo.varVsAnt)} acima do mês anterior.` });
      } else if (ritmo.varVsAnt < -10) {
        list.push({ tipo: 'ok', texto: `Ótimo ritmo! Projeção ${fmoney(ritmo.projetado)} — ${fpct(ritmo.varVsAnt)} vs mês anterior.` });
      }
    }

    // Categoria com maior alta
    const catAltas = categorias.filter((c) => c.diffPct !== null && c.diffPct > 30).slice(0, 2);
    for (const c of catAltas) {
      list.push({ tipo: 'alerta', texto: `"${c.label}" subiu ${fpct(c.diffPct!)} vs mês anterior (${fmoney(c.valorAnterior)} → ${fmoney(c.valor)}).` });
    }

    // Pendentes
    if (resumo.pendente > 0) {
      list.push({ tipo: 'info', texto: `${fmoney(resumo.pendente)} em despesas pendentes de confirmação.` });
    }

    // Recorrentes total mensal
    const totalRec = recorrentes.reduce((s, r) => s + r.media, 0);
    if (totalRec > 0 && recorrentes.length > 0) {
      list.push({ tipo: 'info', texto: `${recorrentes.length} gasto(s) recorrente(s) identificados — ${fmoney(totalRec)}/mês em média.` });
    }

    // Classe A concentração
    const classA = categorias.filter((c) => c.classe === 'A');
    if (classA.length <= 3 && totalDespesas > 0) {
      const pctA = classA.reduce((s, c) => s + c.pct, 0);
      if (pctA > 60) {
        list.push({ tipo: 'info', texto: `${classA.length} categoria(s) concentram ${pctA.toFixed(0)}% dos gastos — foco aqui tem maior impacto.` });
      }
    }

    return list.slice(0, 4);
  }, [ritmo, categorias, resumo.pendente, recorrentes, totalDespesas]);

  const mapaContas = useMemo(() => {
    const m = new Map<string, string>();
    contas.forEach((c) => m.set(c.id, c.nome));
    return m;
  }, [contas]);

  const transferencias = useMemo(() => {
    return lancPeriodo
      .filter((l) => l.tipo === 'transferencia')
      .sort((a, b) => {
        const da = (basePeriodo === 'caixa' ? (a.data_caixa || a.data_despesa) : (a.data_despesa || a.data_caixa)) || '';
        const db = (basePeriodo === 'caixa' ? (b.data_caixa || b.data_despesa) : (b.data_despesa || b.data_caixa)) || '';
        return db.localeCompare(da);
      });
  }, [lancPeriodo, basePeriodo]);

  const listaDetalhada = useMemo(() => {
    let base = filtroTipoLista === 'todos'
      ? lancPeriodo
      : lancPeriodo.filter((l) => l.tipo === filtroTipoLista);

    const vMin = filtroValorMin ? parseFloat(filtroValorMin.replace(',', '.')) : null;
    const vMax = filtroValorMax ? parseFloat(filtroValorMax.replace(',', '.')) : null;
    if (vMin !== null && !isNaN(vMin)) base = base.filter((l) => Math.abs(Number(l.valor || 0)) >= vMin);
    if (vMax !== null && !isNaN(vMax)) base = base.filter((l) => Math.abs(Number(l.valor || 0)) <= vMax);

    return [...base].sort((a, b) => {
      if (ordenacao === 'valor_desc') return Math.abs(Number(b.valor || 0)) - Math.abs(Number(a.valor || 0));
      if (ordenacao === 'valor_asc') return Math.abs(Number(a.valor || 0)) - Math.abs(Number(b.valor || 0));
      const da = (a.data_despesa || a.data_caixa) || '';
      const db = (b.data_despesa || b.data_caixa) || '';
      return ordenacao === 'data_asc' ? da.localeCompare(db) : db.localeCompare(da);
    });
  }, [lancPeriodo, filtroTipoLista, ordenacao, filtroValorMin, filtroValorMax]);

  const gruposDia = useMemo(() => {
    const map = new Map<string, Lancamento[]>();
    for (const l of listaDetalhada) {
      const key = (l.data_despesa || l.data_caixa || '').slice(0, 10);
      if (!key) continue;
      const prev = map.get(key) || [];
      prev.push(l);
      map.set(key, prev);
    }
    return Array.from(map.entries()).sort(([a], [b]) => b.localeCompare(a));
  }, [listaDetalhada]);

  const exportarCSV = useCallback(() => {
    const label = mes !== null ? `${MESES_LONG[mes - 1]} ${ano}` : String(ano);
    const linhas: LancamentoExport[] = listaDetalhada.map((l) => ({
      data_despesa: l.data_despesa,
      data_caixa: l.data_caixa,
      descricao: l.descricao,
      valor: l.valor,
      tipo: l.tipo,
      grupo: l.grupo,
      subgrupo: l.subgrupo,
      status: l.status,
      contaNome: mapaContas.get(l.conta_id ?? '') ?? '',
    }));
    const csv = gerarCSV(linhas, label);
    const nomeArquivo = `falagram_${label.replace(/\s/g, '_').toLowerCase()}.csv`;

    if (Platform.OS === 'web') {
      const ok = baixarCSV(csv, nomeArquivo);
      if (!ok) Alert.alert('Erro', 'Não foi possível gerar o arquivo.');
    } else {
      Share.share({ message: csv, title: nomeArquivo }).catch(() => {});
    }
  }, [listaDetalhada, mapaContas, mes, ano]);

  const abrirDrillDown = useCallback((grupo: string, subgrupo: string) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    const dataInicio = mes !== null ? `${ano}-${pad(mes)}-01` : `${ano}-01-01`;
    const lastDay = mes !== null ? diasNoMes(ano, mes) : 31;
    const dataFim = mes !== null ? `${ano}-${pad(mes)}-${pad(lastDay)}` : `${ano}-12-31`;
    navigation.navigate('Lancamentos', { prefill: { filtroGrupo: grupo, filtroSubgrupo: subgrupo, filtroTipo: 'despesa', dataInicio, dataFim } });
  }, [navigation, ano, mes]);

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: fg.colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={fg.colors.accent} />
      </View>
    );
  }

  if (erro) {
    return (
      <View style={{ flex: 1, backgroundColor: fg.colors.bg, padding: 20, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: fg.colors.danger, fontWeight: '600', textAlign: 'center' }}>{erro}</Text>
      </View>
    );
  }

  const periodoLabel = mes !== null ? `${MESES_LONG[mes - 1]} ${ano}` : String(ano);
  const antLabel = chaveAnterior && mes ? MESES[mes - 2] : null;
  const pad = fg.spacing.md;
  const maxW = isDesktop ? 960 : undefined;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: fg.colors.bg }}
      contentContainerStyle={{ padding: isDesktop ? 28 : pad, paddingBottom: 40, alignItems: isDesktop ? 'center' : undefined }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={fg.colors.accent} />}
    >
      <View style={{ width: '100%', maxWidth: maxW, alignSelf: isDesktop ? 'center' : undefined }}>
      {/* ── Header ──────────────────────────────────────────────────── */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: pad }}>
        <View>
          <Text style={{ color: fg.colors.text, fontSize: 20, fontWeight: '600' }}>Relatórios</Text>
          <Text style={{ color: fg.colors.muted, fontSize: 12, marginTop: 2 }}>{grupoAtivo?.nome_grupo}</Text>
        </View>
        {loadingDados && <ActivityIndicator size="small" color={fg.colors.accent} />}
      </View>

      {/* ── Filtros ─────────────────────────────────────────────────── */}
      <Card style={{ marginBottom: pad }}>
        {/* Linha 1: Ano + Base */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Pressable
              onPress={() => { setAno((a) => a - 1); setMes(null); }}
              style={{ padding: 8, borderRadius: fg.radius.md, backgroundColor: fg.colors.border }}
            >
              <Text style={{ color: fg.colors.text, fontWeight: '700', fontSize: 14 }}>‹</Text>
            </Pressable>
            <Text style={{ color: fg.colors.text, fontWeight: '700', fontSize: 18, minWidth: 48, textAlign: 'center' }}>{ano}</Text>
            <Pressable
              onPress={() => { setAno((a) => Math.min(a + 1, anoAtual + 1)); setMes(null); }}
              style={{ padding: 8, borderRadius: fg.radius.md, backgroundColor: fg.colors.border }}
            >
              <Text style={{ color: fg.colors.text, fontWeight: '700', fontSize: 14 }}>›</Text>
            </Pressable>
          </View>

          {/* Toggle base de período */}
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {(['despesa', 'caixa'] as const).map((b) => (
              <Pressable
                key={b}
                onPress={() => setBasePeriodo(b)}
                style={({ pressed }) => ({
                  paddingHorizontal: 10, paddingVertical: 6, borderRadius: fg.radius.md,
                  backgroundColor: basePeriodo === b ? fg.colors.accentSoft : 'transparent',
                  borderWidth: 1, borderColor: basePeriodo === b ? fg.colors.accent : fg.colors.border,
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <Text style={{ color: basePeriodo === b ? fg.colors.accent : fg.colors.muted, fontSize: 11, fontWeight: '600' }}>
                  {b === 'despesa' ? 'Por gasto' : 'Por caixa'}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Linha 2: Meses */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: 'row' }}>
            <Chip label="Ano todo" active={mes === null} onPress={() => setMes(null)} />
            {MESES.map((ml, i) => (
              <Chip key={i + 1} label={ml} active={mes === i + 1} onPress={() => setMes(mes === i + 1 ? null : i + 1)} />
            ))}
          </View>
        </ScrollView>

        {/* Linha 3: Contas */}
        {contas.length > 0 && (
          <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: fg.colors.border }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: 'row' }}>
                <Chip label="Todas as contas" active={contaId === 'todas'} onPress={() => setContaId('todas')} />
                {contas.map((c) => (
                  <Chip key={c.id} label={c.nome} active={contaId === c.id} onPress={() => setContaId(c.id)} />
                ))}
              </View>
            </ScrollView>
          </View>
        )}
      </Card>

      {/* ── Hero: Resumo do período ──────────────────────────────────── */}
      <Card style={{ marginBottom: pad, backgroundColor: fg.colors.elevated, borderColor: fg.colors.borderSoft }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <View>
            <Text style={{ color: fg.colors.muted, fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' }}>
              Período
            </Text>
            <Text style={{ color: fg.colors.text, fontSize: 17, fontWeight: '700', marginTop: 2 }}>{periodoLabel}</Text>
          </View>
          {antLabel && variacaoDespesa !== null && (
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ color: fg.colors.muted, fontSize: 10, marginBottom: 4 }}>vs {antLabel}</Text>
              <DiffBadge diff={variacaoDespesa} invertido />
            </View>
          )}
        </View>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1, backgroundColor: fg.colors.accentSoft, borderRadius: fg.radius.md, padding: 12, borderWidth: 1, borderColor: 'rgba(74,222,128,0.3)' }}>
            <Text style={{ color: fg.colors.muted, fontSize: 10, fontWeight: '700', marginBottom: 4 }}>RECEITAS</Text>
            <Text style={{ color: fg.colors.accent, fontWeight: '700', fontSize: isDesktop ? 17 : 14 }}>+{fmoney(resumo.receita)}</Text>
            {antLabel && resumoAnterior.receita > 0 && (
              <Text style={{ color: fg.colors.muted, fontSize: 10, marginTop: 4 }}>ant. {fmoney(resumoAnterior.receita)}</Text>
            )}
          </View>

          <View style={{ flex: 1, backgroundColor: fg.colors.dangerSoft, borderRadius: fg.radius.md, padding: 12, borderWidth: 1, borderColor: 'rgba(248,113,113,0.3)' }}>
            <Text style={{ color: fg.colors.muted, fontSize: 10, fontWeight: '700', marginBottom: 4 }}>DESPESAS</Text>
            <Text style={{ color: fg.colors.danger, fontWeight: '700', fontSize: isDesktop ? 17 : 14 }}>-{fmoney(resumo.despesa)}</Text>
            {antLabel && resumoAnterior.despesa > 0 && (
              <Text style={{ color: fg.colors.muted, fontSize: 10, marginTop: 4 }}>ant. {fmoney(resumoAnterior.despesa)}</Text>
            )}
          </View>

          <View style={{
            flex: 1, borderRadius: fg.radius.md, padding: 12, borderWidth: 1,
            backgroundColor: resumo.saldo >= 0 ? fg.colors.accentSoft : fg.colors.dangerSoft,
            borderColor: resumo.saldo >= 0 ? 'rgba(74,222,128,0.3)' : 'rgba(248,113,113,0.3)',
          }}>
            <Text style={{ color: fg.colors.muted, fontSize: 10, fontWeight: '700', marginBottom: 4 }}>RESULTADO</Text>
            <Text style={{ color: resumo.saldo >= 0 ? fg.colors.accent : fg.colors.danger, fontWeight: '700', fontSize: isDesktop ? 17 : 14 }}>
              {resumo.saldo >= 0 ? '+' : '-'}{fmoney(resumo.saldo)}
            </Text>
            {resumo.receita > 0 && (
              <Text style={{ color: fg.colors.muted, fontSize: 10, marginTop: 4 }}>
                taxa poupança {Math.round((resumo.saldo / resumo.receita) * 100)}%
              </Text>
            )}
          </View>
        </View>

        {resumo.pendente > 0 && (
          <View style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: fg.colors.warn }} />
            <Text style={{ color: fg.colors.muted, fontSize: 11 }}>
              {fmoney(resumo.pendente)} em despesas pendentes
            </Text>
          </View>
        )}
      </Card>

      {/* ── Ritmo de gastos (mês corrente) ──────────────────────────── */}
      {ritmo && (
        <Card style={{ marginBottom: pad }}>
          <SecTitle
            title="Ritmo de gastos"
            sub={`Dia ${ritmo.diasPassados} de ${ritmo.totalDias}`}
          />

          {/* Barra de progresso do mês */}
          <View style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={{ color: fg.colors.muted, fontSize: 11 }}>Mês decorrido</Text>
              <Text style={{ color: fg.colors.text, fontSize: 11, fontWeight: '600' }}>{ritmo.pct}%</Text>
            </View>
            <View style={{ height: 6, backgroundColor: fg.colors.border, borderRadius: 3, overflow: 'hidden' }}>
              <View style={{ height: 6, width: `${ritmo.pct}%`, backgroundColor: fg.colors.muted, borderRadius: 3 }} />
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1, padding: 10, backgroundColor: fg.colors.surface, borderRadius: fg.radius.md, borderWidth: 1, borderColor: fg.colors.border }}>
              <Text style={{ color: fg.colors.muted, fontSize: 10, fontWeight: '700', marginBottom: 4 }}>MÉDIA/DIA</Text>
              <Text style={{ color: fg.colors.text, fontWeight: '700', fontSize: 14 }}>{fmoney(ritmo.mediaHoje)}</Text>
            </View>
            <View style={{
              flex: 1, padding: 10, borderRadius: fg.radius.md, borderWidth: 1,
              backgroundColor: ritmo.varVsAnt !== null && ritmo.varVsAnt > 15 ? fg.colors.dangerSoft : fg.colors.accentSoft,
              borderColor: ritmo.varVsAnt !== null && ritmo.varVsAnt > 15 ? 'rgba(248,113,113,0.3)' : 'rgba(74,222,128,0.3)',
            }}>
              <Text style={{ color: fg.colors.muted, fontSize: 10, fontWeight: '700', marginBottom: 4 }}>PROJEÇÃO MÊS</Text>
              <Text style={{ color: ritmo.varVsAnt !== null && ritmo.varVsAnt > 15 ? fg.colors.danger : fg.colors.accent, fontWeight: '700', fontSize: 14 }}>
                {fmoney(ritmo.projetado)}
              </Text>
              {ritmo.varVsAnt !== null && antLabel && (
                <Text style={{ color: fg.colors.muted, fontSize: 10, marginTop: 4 }}>
                  {fpct(ritmo.varVsAnt)} vs {antLabel}
                </Text>
              )}
            </View>
          </View>
        </Card>
      )}

      {/* ── Insights automáticos ─────────────────────────────────────── */}
      {insights.length > 0 && (
        <Card style={{ marginBottom: pad }}>
          <SecTitle title="Insights" sub="Análise automática do período" />
          <View style={{ gap: 8 }}>
            {insights.map((ins, i) => {
              const cor = ins.tipo === 'alerta' ? fg.colors.danger : ins.tipo === 'ok' ? fg.colors.accent : fg.colors.info;
              const bgCor = ins.tipo === 'alerta' ? fg.colors.dangerSoft : ins.tipo === 'ok' ? fg.colors.accentSoft : fg.colors.infoSoft;
              const icon = ins.tipo === 'alerta' ? '⚠' : ins.tipo === 'ok' ? '✓' : 'ℹ';
              return (
                <View key={i} style={{
                  flexDirection: 'row', alignItems: 'flex-start', gap: 10,
                  backgroundColor: bgCor, borderRadius: fg.radius.md, padding: 10,
                  borderWidth: 1, borderColor: cor + '33',
                }}>
                  <Text style={{ color: cor, fontSize: 14, fontWeight: '700', marginTop: 1 }}>{icon}</Text>
                  <Text style={{ flex: 1, color: fg.colors.text, fontSize: 13, lineHeight: 18 }}>{ins.texto}</Text>
                </View>
              );
            })}
          </View>
        </Card>
      )}

      {/* ── Gráfico Mensal ──────────────────────────────────────────── */}
      <Card style={{ marginBottom: pad }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
          <SecTitle title={`Evolução ${ano}`} sub={`Toque na barra para filtrar por mês`} />
          <Pressable
            onPress={() => setMostrarReceita((v) => !v)}
            style={{ paddingHorizontal: 8, paddingVertical: 5, borderRadius: fg.radius.md, borderWidth: 1, borderColor: mostrarReceita ? fg.colors.accent : fg.colors.border, backgroundColor: mostrarReceita ? fg.colors.accentSoft : 'transparent' }}
          >
            <Text style={{ color: mostrarReceita ? fg.colors.accent : fg.colors.muted, fontSize: 11, fontWeight: '600' }}>+ Receitas</Text>
          </Pressable>
        </View>

        <GraficoMensal
          dados={dadosMensais} mesAtivo={mes} onPressMes={(m) => setMes(m)}
          mostrarReceita={mostrarReceita} barH={isDesktop ? 140 : 100}
        />

        <View style={{ flexDirection: 'row', gap: 14, marginTop: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{ width: 10, height: 10, backgroundColor: fg.colors.danger, borderRadius: 2 }} />
            <Text style={{ color: fg.colors.muted, fontSize: 11 }}>Despesas</Text>
          </View>
          {mostrarReceita && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 10, height: 10, backgroundColor: fg.colors.accent, borderRadius: 2 }} />
              <Text style={{ color: fg.colors.muted, fontSize: 11 }}>Receitas</Text>
            </View>
          )}
        </View>
      </Card>

      {/* ── Grid desktop: Categorias + Top Despesas lado a lado ─────── */}
      <View style={isDesktop ? { flexDirection: 'row', gap: pad, alignItems: 'flex-start' } : undefined}>

      {/* ── Categorias com trend ─────────────────────────────────────── */}
      {categorias.length > 0 && (
        <Card style={[{ marginBottom: pad }, isDesktop ? { flex: 1 } : undefined]}>
          <SecTitle
            title={`Categorias de despesa • ${periodoLabel}`}
            sub={antLabel ? `Com variação vs ${antLabel} • toque para ver lançamentos` : 'Toque para ver lançamentos'}
          />

          {/* Legenda curva ABC */}
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
            {(['A', 'B', 'C'] as const).map((cl) => {
              const cfg = ABC_CFG[cl];
              const items = categorias.filter((c) => c.classe === cl);
              const total = items.reduce((s, c) => s + c.valor, 0);
              return (
                <View key={cl} style={{ flex: 1, backgroundColor: cfg.bg, borderRadius: fg.radius.md, padding: 8, borderWidth: 1, borderColor: cfg.border }}>
                  <Text style={{ color: cfg.color, fontWeight: '700', fontSize: 11 }}>Classe {cl}</Text>
                  <Text style={{ color: fg.colors.text, fontWeight: '700', fontSize: 13, marginTop: 4 }}>{fmoney(total)}</Text>
                  <Text style={{ color: fg.colors.muted, fontSize: 10, marginTop: 2 }}>{items.length} cat.</Text>
                </View>
              );
            })}
          </View>

          {antLabel && (
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <View style={{ width: 16, height: 4, backgroundColor: fg.colors.accent, borderRadius: 2 }} />
                <Text style={{ color: fg.colors.muted, fontSize: 10 }}>Atual</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <View style={{ width: 16, height: 2, backgroundColor: fg.colors.muted, borderRadius: 1, opacity: 0.5 }} />
                <Text style={{ color: fg.colors.muted, fontSize: 10 }}>{antLabel}</Text>
              </View>
            </View>
          )}

          <View>
            {categorias.map((item, i) => (
              <View key={item.key} style={i === categorias.length - 1 ? { borderBottomWidth: 0 } : {}}>
                <CategoriaRow
                  item={item}
                  totalDespesas={totalDespesas}
                  onPress={() => abrirDrillDown(item.grupo, item.subgrupo)}
                />
              </View>
            ))}
          </View>
        </Card>
      )}

      {/* ── Maiores despesas individuais ────────────────────────────── */}
      {topDespesas.length > 0 && (
        <Card style={[{ marginBottom: pad }, isDesktop ? { flex: 1 } : undefined]}>
          <SecTitle title={`Top ${topDespesas.length} despesas • ${periodoLabel}`} />
          {topDespesas.map((l, i) => {
            const val = Math.abs(Number(l.valor || 0));
            const data = (l.data_despesa || '').slice(0, 10);
            const maxVal = Math.abs(Number(topDespesas[0]?.valor || 1));
            const pct = (val / maxVal) * 100;
            const isPendente = (l.status || 'confirmada') === 'pendente';
            const isLast = i === topDespesas.length - 1;
            return (
              <View key={l.id} style={{ paddingVertical: 10, borderBottomWidth: isLast ? 0 : 1, borderBottomColor: fg.colors.border }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: fg.colors.border, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: fg.colors.muted, fontSize: 11, fontWeight: '700' }}>{i + 1}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ flex: 1, color: fg.colors.text, fontWeight: '600', fontSize: 13 }} numberOfLines={1}>
                        {l.descricao || '(Sem descrição)'}
                      </Text>
                      {isPendente && <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: fg.colors.warn }} />}
                    </View>
                    <Text style={{ color: fg.colors.muted, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
                      {l.grupo || '-'} › {l.subgrupo || '-'} • {data}
                    </Text>
                  </View>
                  <Text style={{ color: fg.colors.danger, fontWeight: '700', fontSize: 13 }}>
                    -{fmoney(val)}
                  </Text>
                </View>
                <View style={{ marginLeft: 36, marginTop: 5, height: 3, backgroundColor: fg.colors.border, borderRadius: 2 }}>
                  <View style={{ height: 3, width: `${pct}%`, backgroundColor: 'rgba(248,113,113,0.6)', borderRadius: 2 }} />
                </View>
              </View>
            );
          })}
        </Card>
      )}

      </View>{/* /grid desktop */}

      {/* ── Recorrentes ─────────────────────────────────────────────── */}
      {recorrentes.length > 0 && (
        <Card style={{ marginBottom: pad }}>
          <SecTitle
            title="Gastos recorrentes"
            sub={`Padrões em 2+ meses de ${ano}`}
            right={
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ color: fg.colors.muted, fontSize: 10 }}>Total anual estimado</Text>
                <Text style={{ color: fg.colors.danger, fontWeight: '700', fontSize: 13 }}>
                  {fmoney(recorrentes.reduce((s, r) => s + r.anual, 0))}
                </Text>
              </View>
            }
          />
          {recorrentes.map((r, i) => {
            const isLast = i === recorrentes.length - 1;
            return (
              <Pressable
                key={i}
                onPress={() => abrirDrillDown(r.grupo, r.subgrupo)}
                style={({ pressed }) => ({ paddingVertical: 10, borderBottomWidth: isLast ? 0 : 1, borderBottomColor: fg.colors.border, opacity: pressed ? 0.75 : 1 })}
                accessibilityLabel={`${r.desc} — ver lançamentos`}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: fg.colors.text, fontWeight: '600', fontSize: 13 }} numberOfLines={1}>{r.desc}</Text>
                    <Text style={{ color: fg.colors.muted, fontSize: 11, marginTop: 2 }} numberOfLines={1}>{r.cat}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 3 }}>
                    <Text style={{ color: fg.colors.danger, fontWeight: '700', fontSize: 13 }}>~{fmoney(r.media)}/mês</Text>
                    <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                      <View style={{ paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, backgroundColor: fg.colors.accentSoft, borderWidth: 1, borderColor: fg.colors.borderSoft }}>
                        <Text style={{ color: fg.colors.accent, fontSize: 10, fontWeight: '700' }}>{r.mesesCount}× meses</Text>
                      </View>
                      <Text style={{ color: fg.colors.muted, fontSize: 10 }}>{fmoney(r.anual)}/ano</Text>
                    </View>
                  </View>
                </View>
              </Pressable>
            );
          })}
        </Card>
      )}

      {/* ── Transferências ───────────────────────────────────────────── */}
      {transferencias.length > 0 && (
        <Card style={{ marginBottom: pad }}>
          <SecTitle
            title="Transferências"
            sub={`${transferencias.length} movimentação${transferencias.length !== 1 ? 'ões' : ''} entre contas • ${periodoLabel}`}
            right={
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ color: fg.colors.muted, fontSize: 10 }}>Total movimentado</Text>
                <Text style={{ color: fg.colors.text, fontWeight: '700', fontSize: 13 }}>
                  {fmoney(transferencias.reduce((s, l) => s + Math.abs(Number(l.valor || 0)), 0))}
                </Text>
              </View>
            }
          />
          <View style={{ marginTop: 4, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, backgroundColor: fg.colors.bg, marginBottom: 8 }}>
            <Text style={{ color: fg.colors.muted, fontSize: 11 }}>
              Transferências não entram na análise de despesas/receitas — são movimentações internas e seriam contadas duas vezes se incluídas.
            </Text>
          </View>
          {transferencias.map((l, i) => {
            const isLast = i === transferencias.length - 1;
            const raw = Number(l.valor || 0);
            const val = Math.abs(raw);
            const isSaida = raw < 0;
            const dataRef = (basePeriodo === 'caixa' ? (l.data_caixa || l.data_despesa) : (l.data_despesa || l.data_caixa)) || '';
            const data = dataRef.slice(0, 10);
            const dia = data.slice(8, 10) + '/' + data.slice(5, 7);
            const contaNome = l.conta_id ? (mapaContas.get(l.conta_id) || 'Conta') : 'Conta';
            return (
              <Pressable
                key={l.id}
                onPress={() => navigation.navigate('Lancamentos', {
                  prefill: { filtroTipo: 'transferencia', dataInicio: data, dataFim: data },
                })}
                style={({ pressed }) => ({
                  paddingVertical: 10,
                  borderBottomWidth: isLast ? 0 : 1,
                  borderBottomColor: fg.colors.border,
                  opacity: pressed ? 0.75 : 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                })}
                accessibilityLabel={`Transferência ${l.descricao} — ver lançamento`}
              >
                <View style={{
                  width: 32, height: 32, borderRadius: 8, borderWidth: 1,
                  backgroundColor: fg.colors.infoSoft, borderColor: fg.colors.info,
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text style={{ color: fg.colors.info, fontSize: 14, fontWeight: '700' }}>⇄</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: fg.colors.text, fontWeight: '600', fontSize: 13 }} numberOfLines={1}>
                    {l.descricao || 'Transferência'}
                  </Text>
                  <Text style={{ color: fg.colors.muted, fontSize: 11, marginTop: 2 }}>
                    {dia} • {contaNome} • {isSaida ? 'saída' : 'entrada'}
                  </Text>
                </View>
                <Text style={{ color: isSaida ? fg.colors.danger : fg.colors.accent, fontWeight: '700', fontSize: 13 }}>
                  {isSaida ? '−' : '+'}{fmoney(val)}
                </Text>
              </Pressable>
            );
          })}
        </Card>
      )}

      {/* ── Extrato do período ── */}
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Pressable
            onPress={() => setListaAberta(v => !v)}
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}
            accessibilityLabel="Expandir extrato do período"
          >
            <View style={{ flex: 1 }}>
              <Text style={{ color: fg.colors.muted, fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' }}>
                Extrato do período
              </Text>
              <Text style={{ color: fg.colors.muted, fontSize: 11, marginTop: 3 }}>
                {listaDetalhada.length} lançamento{listaDetalhada.length !== 1 ? 's' : ''}
              </Text>
            </View>
            <Text style={{ color: fg.colors.muted, fontSize: 18, marginLeft: 8 }}>{listaAberta ? '∧' : '∨'}</Text>
          </Pressable>

          {listaDetalhada.length > 0 && (
            <Pressable
              onPress={exportarCSV}
              style={({ pressed }) => ({
                marginLeft: 10, paddingHorizontal: 10, paddingVertical: 7,
                borderRadius: fg.radius.md, borderWidth: 1,
                borderColor: fg.colors.accent,
                backgroundColor: fg.colors.accentSoft,
                opacity: pressed ? 0.75 : 1,
              })}
              accessibilityLabel="Exportar extrato como CSV"
            >
              <Text style={{ color: fg.colors.accent, fontSize: 12, fontWeight: '700' }}>
                ↓ CSV
              </Text>
            </Pressable>
          )}
        </View>

        {listaAberta && (
          <>
            {/* Filtro tipo */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 12, marginBottom: 4 }}>
              {(['despesa', 'receita', 'transferencia', 'todos'] as const).map((t) => (
                <Chip
                  key={t}
                  label={t === 'despesa' ? 'Despesas' : t === 'receita' ? 'Receitas' : t === 'transferencia' ? 'Transferências' : 'Todos'}
                  active={filtroTipoLista === t}
                  onPress={() => setFiltroTipoLista(t)}
                />
              ))}
            </View>

            {/* Ordenação */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 4 }}>
              {([
                { key: 'data_desc', label: 'Data ↓' },
                { key: 'data_asc',  label: 'Data ↑' },
                { key: 'valor_desc', label: 'Valor ↓' },
                { key: 'valor_asc',  label: 'Valor ↑' },
              ] as const).map((o) => (
                <Chip key={o.key} label={o.label} active={ordenacao === o.key} onPress={() => setOrdenacao(o.key)} />
              ))}
            </View>

            {/* Filtro por valor */}
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: fg.colors.muted, fontSize: 10, fontWeight: '700', marginBottom: 4 }}>VALOR MÍN</Text>
                <TextInput
                  value={filtroValorMin}
                  onChangeText={setFiltroValorMin}
                  placeholder="Ex: 50"
                  placeholderTextColor={fg.colors.muted2}
                  keyboardType="numeric"
                  style={{
                    borderWidth: 1, borderColor: filtroValorMin ? fg.colors.accent : fg.colors.border,
                    borderRadius: fg.radius.md, paddingHorizontal: 10,
                    paddingVertical: 8, backgroundColor: fg.colors.surface2,
                    color: fg.colors.text, fontWeight: '700', fontSize: 13,
                  }}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: fg.colors.muted, fontSize: 10, fontWeight: '700', marginBottom: 4 }}>VALOR MÁX</Text>
                <TextInput
                  value={filtroValorMax}
                  onChangeText={setFiltroValorMax}
                  placeholder="Ex: 500"
                  placeholderTextColor={fg.colors.muted2}
                  keyboardType="numeric"
                  style={{
                    borderWidth: 1, borderColor: filtroValorMax ? fg.colors.accent : fg.colors.border,
                    borderRadius: fg.radius.md, paddingHorizontal: 10,
                    paddingVertical: 8, backgroundColor: fg.colors.surface2,
                    color: fg.colors.text, fontWeight: '700', fontSize: 13,
                  }}
                />
              </View>
              {(filtroValorMin || filtroValorMax) && (
                <Pressable
                  onPress={() => { setFiltroValorMin(''); setFiltroValorMax(''); }}
                  style={{ alignSelf: 'flex-end', paddingVertical: 8, paddingHorizontal: 10, borderRadius: fg.radius.md, borderWidth: 1, borderColor: fg.colors.border }}
                  accessibilityLabel="Limpar filtro de valor"
                >
                  <Text style={{ color: fg.colors.muted, fontSize: 12, fontWeight: '700' }}>✕</Text>
                </Pressable>
              )}
            </View>

            {/* Lista por valor (plana) ou por data (agrupada) */}
            {ordenacao.startsWith('valor') ? (
              <>
                {listaDetalhada.map((l, i) => {
                  const val = Math.abs(l.valor ?? 0);
                  const isDespesa = l.tipo === 'despesa';
                  const isReceita = l.tipo === 'receita';
                  const cor = isDespesa ? fg.colors.danger : isReceita ? fg.colors.accent : fg.colors.info;
                  const icone = isDespesa ? '↓' : isReceita ? '↑' : '⇄';
                  const contaNome = mapaContas.get(l.conta_id ?? '') ?? '';
                  const dataRef = (l.data_despesa || l.data_caixa || '').slice(0, 10);
                  const diaLabel = dataRef ? `${dataRef.slice(8)}/${dataRef.slice(5, 7)}` : '';
                  return (
                    <Pressable
                      key={l.id}
                      onPress={() => (navigation as any).navigate('EditarLancamento', { id: l.id })}
                      style={({ pressed }) => ({
                        flexDirection: 'row', alignItems: 'center', gap: 10,
                        paddingVertical: 9,
                        borderTopWidth: 1, borderTopColor: fg.colors.border,
                        opacity: pressed ? 0.7 : 1,
                      })}
                      accessibilityLabel={`Editar ${l.descricao ?? 'lançamento'}`}
                    >
                      <View style={{
                        width: 30, height: 30, borderRadius: 8, borderWidth: 1,
                        backgroundColor: isDespesa ? fg.colors.dangerSoft : isReceita ? fg.colors.accentSoft : fg.colors.infoSoft,
                        borderColor: cor, alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Text style={{ color: cor, fontSize: 13, fontWeight: '700' }}>{icone}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: fg.colors.text, fontSize: 13, fontWeight: '500' }} numberOfLines={1}>
                          {l.descricao || '—'}
                        </Text>
                        <Text style={{ color: fg.colors.muted, fontSize: 11, marginTop: 2 }}>
                          {diaLabel}{contaNome ? ` • ${contaNome}` : ''}{l.subgrupo ? ` • ${l.subgrupo}` : ''}{l.status === 'pendente' ? ' • ●' : ''}
                        </Text>
                      </View>
                      <Text style={{ color: cor, fontSize: 13, fontWeight: '700' }}>
                        {isDespesa ? '−' : isReceita ? '+' : ''}{fmoney(val)}
                      </Text>
                    </Pressable>
                  );
                })}
              </>
            ) : (
              <>
                {gruposDia.map(([dia, itens]) => {
                  const [anoD, mesD, diaD] = dia.split('-');
                  const label = `${diaD}/${mesD}/${anoD}`;
                  const saldo = itens.reduce((acc, l) => {
                    const v = l.valor ?? 0;
                    return acc + (l.tipo === 'despesa' ? -v : v);
                  }, 0);
                  return (
                    <View key={dia}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, marginBottom: 4 }}>
                        <Text style={{ color: fg.colors.muted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 }}>{label}</Text>
                        <Text style={{ color: saldo >= 0 ? fg.colors.accent : fg.colors.danger, fontSize: 11, fontWeight: '600' }}>
                          {saldo >= 0 ? '+' : '−'}{fmoney(Math.abs(saldo))}
                        </Text>
                      </View>
                      {itens.map((l) => {
                        const val = Math.abs(l.valor ?? 0);
                        const isDespesa = l.tipo === 'despesa';
                        const isReceita = l.tipo === 'receita';
                        const cor = isDespesa ? fg.colors.danger : isReceita ? fg.colors.accent : fg.colors.info;
                        const icone = isDespesa ? '↓' : isReceita ? '↑' : '⇄';
                        const contaNome = mapaContas.get(l.conta_id ?? '') ?? '';
                        return (
                          <Pressable
                            key={l.id}
                            onPress={() => (navigation as any).navigate('EditarLancamento', { id: l.id })}
                            style={({ pressed }) => ({
                              flexDirection: 'row', alignItems: 'center', gap: 10,
                              paddingVertical: 9,
                              borderTopWidth: 1, borderTopColor: fg.colors.border,
                              opacity: pressed ? 0.7 : 1,
                            })}
                            accessibilityLabel={`Editar ${l.descricao ?? 'lançamento'}`}
                          >
                            <View style={{
                              width: 30, height: 30, borderRadius: 8, borderWidth: 1,
                              backgroundColor: isDespesa ? fg.colors.dangerSoft : isReceita ? fg.colors.accentSoft : fg.colors.infoSoft,
                              borderColor: cor, alignItems: 'center', justifyContent: 'center',
                            }}>
                              <Text style={{ color: cor, fontSize: 13, fontWeight: '700' }}>{icone}</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={{ color: fg.colors.text, fontSize: 13, fontWeight: '500' }} numberOfLines={1}>
                                {l.descricao || '—'}
                              </Text>
                              <Text style={{ color: fg.colors.muted, fontSize: 11, marginTop: 2 }}>
                                {l.subgrupo || l.grupo || '—'}{contaNome ? ` • ${contaNome}` : ''}{l.status === 'pendente' ? ' • ●' : ''}
                              </Text>
                            </View>
                            <Text style={{ color: cor, fontSize: 13, fontWeight: '700' }}>
                              {isDespesa ? '−' : isReceita ? '+' : ''}{fmoney(val)}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  );
                })}
              </>
            )}

            {listaDetalhada.length === 0 && (
              <Text style={{ color: fg.colors.muted, textAlign: 'center', paddingVertical: 16, fontSize: 13 }}>
                Sem lançamentos neste filtro.
              </Text>
            )}
          </>
        )}
      </Card>

      {resumo.n === 0 && (
        <Card>
          <Text style={{ color: fg.colors.muted, textAlign: 'center', fontWeight: '500', padding: 20 }}>
            Nenhum lançamento para {periodoLabel}.
          </Text>
        </Card>
      )}
      </View>{/* /maxWidth wrapper */}
    </ScrollView>
  );
}
