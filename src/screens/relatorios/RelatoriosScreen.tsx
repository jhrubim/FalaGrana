import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
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
};

type GrupoAtivo = { grupo_id: string; papel: 'owner' | 'viewer'; nome_grupo: string };

type CatDado = {
  key: string; label: string; grupo: string; subgrupo: string;
  valor: number; count: number; pct: number;
  classe: 'A' | 'B' | 'C';
};

type MesDado = { mes: number; label: string; despesa: number; receita: number };

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

function fmoney(v: number) {
  return Math.abs(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
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

// ─── Curva ABC ───────────────────────────────────────────────────────────────

const ABC_CFG = {
  A: { color: fg.colors.accent,  bg: fg.colors.accentSoft, border: 'rgba(74,222,128,0.35)' },
  B: { color: fg.colors.warn,    bg: fg.colors.warnSoft,   border: 'rgba(246,196,83,0.35)' },
  C: { color: fg.colors.muted,   bg: 'transparent',        border: fg.colors.border },
};

function CurvaABC({
  categorias,
  onPress,
}: {
  categorias: CatDado[];
  onPress: (grupo: string, subgrupo: string) => void;
}) {
  if (categorias.length === 0) return null;
  const maxPct = categorias[0]?.pct || 1;

  return (
    <View>
      {/* Legenda das classes */}
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
        {(['A', 'B', 'C'] as const).map((cl) => {
          const cfg = ABC_CFG[cl];
          const items = categorias.filter((c) => c.classe === cl);
          const total = items.reduce((s, c) => s + c.valor, 0);
          const descCl = cl === 'A' ? 'Maior impacto' : cl === 'B' ? 'Relevante' : 'Menor peso';
          return (
            <View key={cl} style={{ flex: 1, backgroundColor: cfg.bg, borderRadius: 10, padding: 8, borderWidth: 1, borderColor: cfg.border }}>
              <Text style={{ color: cfg.color, fontWeight: '900', fontSize: 13 }}>Classe {cl}</Text>
              <Text style={{ color: fg.colors.muted, fontSize: 9, marginTop: 1, marginBottom: 4 }}>{descCl}</Text>
              <Text style={{ color: fg.colors.text, fontWeight: '900', fontSize: 12 }}>{fmoney(total)}</Text>
              <Text style={{ color: fg.colors.muted, fontSize: 10, marginTop: 1 }}>{items.length} categoria(s)</Text>
            </View>
          );
        })}
      </View>

      {categorias.map((item, i) => {
        const cfg = ABC_CFG[item.classe];
        const barW = (item.pct / maxPct) * 100;
        const isLast = i === categorias.length - 1;
        return (
          <Pressable
            key={item.key}
            onPress={() => onPress(item.grupo, item.subgrupo)}
            style={({ pressed }) => ({
              paddingVertical: 9,
              borderBottomWidth: isLast ? 0 : 1,
              borderBottomColor: fg.colors.border,
              opacity: pressed ? 0.75 : 1,
            })}
            accessibilityLabel={`${item.label} — ver lançamentos`}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 5 }}>
              {/* Badge classe */}
              <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, backgroundColor: cfg.bg, borderWidth: 1, borderColor: cfg.border, marginRight: 8 }}>
                <Text style={{ color: cfg.color, fontSize: 11, fontWeight: '900' }}>{item.classe}</Text>
              </View>
              <Text style={{ color: fg.colors.text, fontSize: 13, fontWeight: '900', flex: 1 }} numberOfLines={1}>
                {item.label}
              </Text>
              <Text style={{ color: fg.colors.muted, fontSize: 11, marginLeft: 6 }}>{item.count}×</Text>
              <Text style={{ color: cfg.color, fontWeight: '900', fontSize: 13, marginLeft: 10 }}>
                -{fmoney(item.valor)}
              </Text>
              <Text style={{ color: fg.colors.muted, fontSize: 11, marginLeft: 6 }}>↗</Text>
            </View>
            {/* Barra de proporção */}
            <View style={{ height: 5, backgroundColor: fg.colors.border, borderRadius: 3 }}>
              <View style={{ height: 5, width: `${Math.min(barW, 100)}%`, backgroundColor: cfg.color, borderRadius: 3, opacity: 0.85 }} />
            </View>
            <Text style={{ color: fg.colors.muted, fontSize: 10, marginTop: 3 }}>
              {item.pct.toFixed(1)}% do total de despesas
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── Gráfico de barras mensal ─────────────────────────────────────────────────

function GraficoMensal({
  dados,
  mesAtivo,
  onPressMes,
  mostrarReceita,
  barH,
}: {
  dados: MesDado[];
  mesAtivo: number | null;
  onPressMes: (m: number | null) => void;
  mostrarReceita: boolean;
  barH: number;
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
                <View
                  style={{
                    width: 5,
                    height: Math.max(hRec, 2),
                    backgroundColor: ativo ? fg.colors.accent : 'rgba(74,222,128,0.4)',
                    borderRadius: 2,
                  }}
                />
              ) : null}
              <View
                style={{
                  width: mostrarReceita ? 5 : 10,
                  height: Math.max(hDesp, 2),
                  backgroundColor: ativo ? fg.colors.danger : 'rgba(248,113,113,0.45)',
                  borderRadius: 2,
                }}
              />
            </View>
            <Text
              style={{
                fontSize: 9,
                marginTop: 4,
                color: ativo ? fg.colors.text : fg.colors.muted,
                fontWeight: ativo ? '900' : '800',
              }}
            >
              {d.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── Primitivos ──────────────────────────────────────────────────────────────

function Card({ children, style }: { children: React.ReactNode; style?: any }) {
  return (
    <View
      style={[
        {
          backgroundColor: fg.colors.surface,
          borderColor: fg.colors.border,
          borderWidth: 1,
          borderRadius: fg.radius.lg,
          padding: fg.spacing.card,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

function SecTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={[fg.typography.section, { color: fg.colors.muted }]}>{title}</Text>
      {sub ? <Text style={{ color: fg.colors.muted, fontSize: 11, marginTop: 2 }}>{sub}</Text> : null}
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        paddingHorizontal: 10,
        paddingVertical: 7,
        borderRadius: fg.radius.pill,
        backgroundColor: active ? fg.colors.accent : fg.colors.surface,
        borderWidth: 1,
        borderColor: active ? fg.colors.accent : fg.colors.border,
        marginRight: 6,
        marginBottom: 6,
        opacity: pressed ? 0.8 : 1,
      })}
      accessibilityLabel={label}
    >
      <Text style={{ fontSize: 12, fontWeight: '900', color: active ? fg.colors.onLight : fg.colors.text }}>
        {label}
      </Text>
    </Pressable>
  );
}

// ─── Tela ─────────────────────────────────────────────────────────────────────

export default function RelatoriosScreen() {
  const navigation = useNavigation<any>();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
  const anoAtual = new Date().getFullYear();

  const [loading, setLoading] = useState(true);
  const [loadingDados, setLoadingDados] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [grupoAtivo, setGrupoAtivo] = useState<GrupoAtivo | null>(null);
  const [contas, setContas] = useState<Conta[]>([]);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);

  const [ano, setAno] = useState(anoAtual);
  const [mes, setMes] = useState<number | null>(null);
  const [contaId, setContaId] = useState<string>('todas');
  const [mostrarReceita, setMostrarReceita] = useState(false);
  const [basePeriodo, setBasePeriodo] = useState<'despesa' | 'caixa'>('despesa');

  const primeiroLoad = useRef(true);

  // ─── Fetch ────────────────────────────────────────────────────────────────

  const carregarGrupo = useCallback(async (): Promise<GrupoAtivo> => {
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr || !auth?.user?.id) throw new Error('Usuário não autenticado.');
    const { data, error } = await supabase
      .from('grupo_membros')
      .select('grupo_id, papel, status, grupos_financeiros(id, nome)')
      .eq('user_id', auth.user.id)
      .eq('status', 'ativo')
      .order('created_at', { ascending: true })
      .limit(1)
      .single();
    if (error) throw new Error(error.message);
    const d = data as any;
    return {
      grupo_id: d.grupo_id,
      papel: d.papel,
      nome_grupo: d.grupos_financeiros?.nome || d.grupos_financeiros?.[0]?.nome || 'Minha Carteira',
    };
  }, []);

  const carregarDados = useCallback(async (
    grupoId: string,
    anoRef: number,
    base: 'despesa' | 'caixa',
  ) => {
    const start = `${anoRef}-01-01`;
    const end = `${anoRef}-12-31`;
    const select = 'id, data_despesa, data_caixa, descricao, valor, tipo, grupo, subgrupo, conta_id';

    let lancamentos: Lancamento[];

    if (base === 'caixa') {
      // Duas queries: (1) com data_caixa no período, (2) data_caixa nulo + data_despesa no período
      const [contasRes, comCaixa, semCaixa] = await Promise.all([
        supabase.from('contas').select('id, nome, tipo').eq('grupo_id', grupoId).order('nome'),
        supabase.from('transacoes').select(select).eq('grupo_id', grupoId)
          .in('tipo', ['despesa', 'receita', 'transferencia'])
          .not('data_caixa', 'is', null)
          .gte('data_caixa', start).lte('data_caixa', end)
          .limit(12000),
        supabase.from('transacoes').select(select).eq('grupo_id', grupoId)
          .in('tipo', ['despesa', 'receita', 'transferencia'])
          .is('data_caixa', null)
          .gte('data_despesa', start).lte('data_despesa', end)
          .limit(4000),
      ]);
      if (contasRes.error) throw new Error(contasRes.error.message);
      if (comCaixa.error) throw new Error(comCaixa.error.message);
      if (semCaixa.error) throw new Error(semCaixa.error.message);
      setContas((contasRes.data || []) as Conta[]);
      lancamentos = [
        ...((comCaixa.data || []) as Lancamento[]),
        ...((semCaixa.data || []) as Lancamento[]),
      ];
    } else {
      const [contasRes, lancRes] = await Promise.all([
        supabase.from('contas').select('id, nome, tipo').eq('grupo_id', grupoId).order('nome'),
        supabase.from('transacoes').select(select).eq('grupo_id', grupoId)
          .in('tipo', ['despesa', 'receita', 'transferencia'])
          .gte('data_despesa', start).lte('data_despesa', end)
          .limit(12000),
      ]);
      if (contasRes.error) throw new Error(contasRes.error.message);
      if (lancRes.error) throw new Error(lancRes.error.message);
      setContas((contasRes.data || []) as Conta[]);
      lancamentos = (lancRes.data || []) as Lancamento[];
    }

    setLancamentos(lancamentos);
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

  // Recarrega quando ano ou basePeriodo mudam
  useEffect(() => {
    if (primeiroLoad.current) { primeiroLoad.current = false; return; }
    if (!grupoAtivo?.grupo_id) return;
    let alive = true;
    (async () => {
      setLoadingDados(true);
      try {
        await carregarDados(grupoAtivo.grupo_id, ano, basePeriodo);
      } catch (e: any) {
        setErro(e?.message || 'Erro.');
      } finally {
        if (alive) setLoadingDados(false);
      }
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
    if (basePeriodo === 'caixa') {
      // Se data_caixa não foi preenchida, usa data_despesa como fallback
      const dc = l.data_caixa || l.data_despesa;
      return (dc || '').slice(0, 7);
    }
    return (l.data_despesa || '').slice(0, 7);
  }, [basePeriodo]);

  const lancConta = useMemo(() => {
    if (contaId === 'todas') return lancamentos;
    return lancamentos.filter((l) => l.conta_id === contaId);
  }, [lancamentos, contaId]);

  const dadosMensais = useMemo<MesDado[]>(() => {
    return MESES.map((label, i) => {
      const m = i + 1;
      const mStr = String(m).padStart(2, '0');
      const chave = `${ano}-${mStr}`;
      let despesa = 0, receita = 0;
      for (const l of lancConta) {
        if (getDataLanc(l) !== chave) continue;
        const raw = Number(l.valor || 0);
        const val = Math.abs(raw);
        if (l.tipo === 'transferencia') {
          if (raw > 0) receita += val; else despesa += val;
        } else if (l.tipo === 'despesa') despesa += val;
        else if (l.tipo === 'receita') receita += val;
      }
      return { mes: m, label, despesa, receita };
    });
  }, [lancConta, ano, getDataLanc]);

  const lancPeriodo = useMemo(() => {
    if (mes === null) return lancConta;
    const mStr = String(mes).padStart(2, '0');
    const chave = `${ano}-${mStr}`;
    return lancConta.filter((l) => getDataLanc(l) === chave);
  }, [lancConta, mes, ano, getDataLanc]);

  const resumo = useMemo(() => {
    let receita = 0, despesa = 0;
    for (const l of lancPeriodo) {
      const raw = Number(l.valor || 0);
      const val = Math.abs(raw);
      if (l.tipo === 'transferencia') {
        if (raw > 0) receita += val; else despesa += val;
      } else if (l.tipo === 'receita') receita += val;
      else if (l.tipo === 'despesa') despesa += val;
    }
    return { receita, despesa, saldo: receita - despesa, n: lancPeriodo.length };
  }, [lancPeriodo]);

  const categorias = useMemo<CatDado[]>(() => {
    const map = new Map<string, { label: string; grupo: string; subgrupo: string; valor: number; count: number }>();
    for (const l of lancPeriodo) {
      if (l.tipo !== 'despesa') continue;
      const grupo = (l.grupo || 'Outros').trim();
      const sub = (l.subgrupo || 'Não categorizado').trim();
      const key = `${grupo}||${sub}`;
      const prev = map.get(key) || { label: `${grupo} • ${sub}`, grupo, subgrupo: sub, valor: 0, count: 0 };
      map.set(key, { ...prev, valor: prev.valor + Math.abs(Number(l.valor || 0)), count: prev.count + 1 });
    }
    const sorted = [...map.values()].sort((a, b) => b.valor - a.valor).slice(0, 15);
    const total = sorted.reduce((s, c) => s + c.valor, 0);
    let acumPct = 0;
    return sorted.map((c) => {
      const pct = total > 0 ? (c.valor / total) * 100 : 0;
      acumPct += pct;
      const classe: 'A' | 'B' | 'C' = acumPct <= 70 ? 'A' : acumPct <= 90 ? 'B' : 'C';
      return { key: `${c.grupo}||${c.subgrupo}`, ...c, pct, classe };
    });
  }, [lancPeriodo]);

  const topDespesas = useMemo(() =>
    lancPeriodo
      .filter((l) => l.tipo === 'despesa')
      .sort((a, b) => Math.abs(Number(b.valor || 0)) - Math.abs(Number(a.valor || 0)))
      .slice(0, 10),
    [lancPeriodo]
  );

  const recorrentes = useMemo(() => {
    const map = new Map<string, { desc: string; cat: string; grupo: string; subgrupo: string; meses: Set<number>; total: number; count: number }>();
    for (const l of lancConta) {
      if (l.tipo !== 'despesa') continue;
      const dataRef = basePeriodo === 'caixa' ? (l.data_caixa || l.data_despesa || '') : (l.data_despesa || l.data_caixa || '');
      const m = Number((dataRef).slice(5, 7));
      if (!m) continue;
      const grupo = (l.grupo || 'Outros').trim();
      const sub = (l.subgrupo || 'Não categorizado').trim();
      const chave = normRec(l.descricao) + '||' + normText(grupo) + '||' + normText(sub);
      const prev = map.get(chave) || { desc: (l.descricao || '').trim(), cat: `${grupo} • ${sub}`, grupo, subgrupo: sub, meses: new Set<number>(), total: 0, count: 0 };
      prev.meses.add(m);
      prev.total += Math.abs(Number(l.valor || 0));
      prev.count += 1;
      map.set(chave, prev);
    }
    return [...map.values()]
      .filter((r) => r.meses.size >= 2)
      .sort((a, b) => b.meses.size - a.meses.size || b.total - a.total)
      .slice(0, 12)
      .map((r) => ({ ...r, media: r.total / r.count, mesesCount: r.meses.size }));
  }, [lancConta, basePeriodo]);

  const comparativo = useMemo(() => {
    if (mes === null || mes === 1) return null;
    const calc = (m: number) => {
      const mStr = String(m).padStart(2, '0');
      const chave = `${ano}-${mStr}`;
      let d = 0, r = 0;
      for (const l of lancConta) {
        if (getDataLanc(l) !== chave) continue;
        const val = Math.abs(Number(l.valor || 0));
        if (l.tipo === 'despesa') d += val; else if (l.tipo === 'receita') r += val;
      }
      return { despesa: d, receita: r };
    };
    const atual = calc(mes);
    const ant = calc(mes - 1);
    return { mesAtual: MESES[mes - 1], mesAnterior: MESES[mes - 2], atual, ant, despesaDiff: atual.despesa - ant.despesa, receitaDiff: atual.receita - ant.receita };
  }, [mes, lancConta, ano, getDataLanc]);

  const abrirDrillDown = useCallback((grupo: string, subgrupo: string) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    const dataInicio = mes !== null ? `${ano}-${pad(mes)}-01` : `${ano}-01-01`;
    const lastDay = mes !== null ? new Date(ano, mes, 0).getDate() : 31;
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
        <Text style={{ color: fg.colors.danger, fontWeight: '900', textAlign: 'center' }}>{erro}</Text>
      </View>
    );
  }

  const periodoLabel = mes !== null ? `${MESES[mes - 1]}/${ano}` : String(ano);
  const pad = fg.spacing.md;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: fg.colors.bg }}
      contentContainerStyle={{ padding: pad, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={fg.colors.accent} />}
    >
      {/* ── Header ──────────────────────────────────────────────────── */}
      <Card style={{ marginBottom: pad }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <Text style={[fg.typography.title, { color: fg.colors.text }]}>Relatórios</Text>
            <Text style={{ color: fg.colors.muted, fontSize: 12, marginTop: 2 }}>{grupoAtivo?.nome_grupo}</Text>
          </View>
          {loadingDados && <ActivityIndicator size="small" color={fg.colors.accent} />}
        </View>
      </Card>

      {/* ── Filtros ─────────────────────────────────────────────────── */}
      <Card style={{ marginBottom: pad }}>

        {/* Linha 1: Ano | Conta | Base do período */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start', marginBottom: 14 }}>

          {/* Ano */}
          <View style={{ minWidth: 130 }}>
            <SecTitle title="Ano" />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Pressable
                onPress={() => { setAno((a) => a - 1); setMes(null); }}
                style={{ padding: 8, borderRadius: fg.radius.md, backgroundColor: fg.colors.border }}
                accessibilityLabel="Ano anterior"
              >
                <Text style={{ color: fg.colors.text, fontWeight: '900', fontSize: 16, lineHeight: 20 }}>‹</Text>
              </Pressable>
              <Text style={{ color: fg.colors.text, fontWeight: '900', fontSize: 20, minWidth: 48, textAlign: 'center' }}>
                {ano}
              </Text>
              <Pressable
                onPress={() => { setAno((a) => Math.min(a + 1, anoAtual + 1)); setMes(null); }}
                style={{ padding: 8, borderRadius: fg.radius.md, backgroundColor: fg.colors.border }}
                accessibilityLabel="Próximo ano"
              >
                <Text style={{ color: fg.colors.text, fontWeight: '900', fontSize: 16, lineHeight: 20 }}>›</Text>
              </Pressable>
            </View>
          </View>

          {/* Conta */}
          {contas.length > 0 && (
            <View style={{ flex: 1, minWidth: 180 }}>
              <SecTitle title="Conta" />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                <Chip label="Todas" active={contaId === 'todas'} onPress={() => setContaId('todas')} />
                {contas.map((c) => (
                  <Chip key={c.id} label={c.nome} active={contaId === c.id} onPress={() => setContaId(c.id)} />
                ))}
              </View>
            </View>
          )}

          {/* Base de período */}
          <View style={{ minWidth: 160 }}>
            <SecTitle title="Base do período" sub="Como agrupar as datas" />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable
                onPress={() => setBasePeriodo('despesa')}
                style={({ pressed }) => ({
                  flex: 1, paddingVertical: 8, paddingHorizontal: 10, borderRadius: fg.radius.md,
                  backgroundColor: basePeriodo === 'despesa' ? fg.colors.accentSoft : fg.colors.surface,
                  borderWidth: 1,
                  borderColor: basePeriodo === 'despesa' ? fg.colors.accent : fg.colors.border,
                  alignItems: 'center', opacity: pressed ? 0.8 : 1,
                })}
                accessibilityLabel="Agrupar por data da despesa"
              >
                <Text style={{ color: basePeriodo === 'despesa' ? fg.colors.accent : fg.colors.muted, fontWeight: '900', fontSize: 12 }}>
                  Despesa
                </Text>
                <Text style={{ color: fg.colors.muted, fontSize: 10, marginTop: 2 }}>data do gasto</Text>
              </Pressable>
              <Pressable
                onPress={() => setBasePeriodo('caixa')}
                style={({ pressed }) => ({
                  flex: 1, paddingVertical: 8, paddingHorizontal: 10, borderRadius: fg.radius.md,
                  backgroundColor: basePeriodo === 'caixa' ? 'rgba(246,196,83,0.15)' : fg.colors.surface,
                  borderWidth: 1,
                  borderColor: basePeriodo === 'caixa' ? fg.colors.warn : fg.colors.border,
                  alignItems: 'center', opacity: pressed ? 0.8 : 1,
                })}
                accessibilityLabel="Agrupar por data de caixa"
              >
                <Text style={{ color: basePeriodo === 'caixa' ? fg.colors.warn : fg.colors.muted, fontWeight: '900', fontSize: 12 }}>
                  Caixa
                </Text>
                <Text style={{ color: fg.colors.muted, fontSize: 10, marginTop: 2 }}>data do pagamento</Text>
              </Pressable>
            </View>
          </View>
        </View>

        {/* Linha 2: Meses (largura total, 2 linhas de 6) */}
        <View style={{ borderTopWidth: 1, borderTopColor: fg.colors.border, paddingTop: 12 }}>
          <SecTitle title="Mês" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 0 }}>
            <Chip label="Todos" active={mes === null} onPress={() => setMes(null)} />
            {MESES.map((ml, i) => (
              <Chip key={i + 1} label={ml} active={mes === i + 1} onPress={() => setMes(mes === i + 1 ? null : i + 1)} />
            ))}
          </View>
        </View>
      </Card>

      {/* ── Resumo ──────────────────────────────────────────────────── */}
      <Card style={{ marginBottom: pad }}>
        <SecTitle title={`Resumo • ${periodoLabel}`} sub={`${resumo.n} lançamentos • por data de ${basePeriodo === 'caixa' ? 'caixa (pagamento)' : 'despesa (gasto)'}`} />
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
          <View style={{ flex: 1, backgroundColor: fg.colors.elevated, borderRadius: fg.radius.md, padding: 12, borderWidth: 1, borderColor: fg.colors.borderSoft }}>
            <Text style={{ color: fg.colors.muted, fontSize: 10, fontWeight: '900', marginBottom: 4 }}>RECEITAS</Text>
            <Text style={{ color: fg.colors.accent, fontWeight: '900', fontSize: isDesktop ? 17 : 14 }}>+{fmoney(resumo.receita)}</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: fg.colors.surface, borderRadius: fg.radius.md, padding: 12, borderWidth: 1, borderColor: fg.colors.border }}>
            <Text style={{ color: fg.colors.muted, fontSize: 10, fontWeight: '900', marginBottom: 4 }}>DESPESAS</Text>
            <Text style={{ color: fg.colors.danger, fontWeight: '900', fontSize: isDesktop ? 17 : 14 }}>-{fmoney(resumo.despesa)}</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: resumo.saldo >= 0 ? fg.colors.elevated : 'rgba(248,113,113,0.08)', borderRadius: fg.radius.md, padding: 12, borderWidth: 1, borderColor: resumo.saldo >= 0 ? fg.colors.borderSoft : 'rgba(248,113,113,0.35)' }}>
            <Text style={{ color: fg.colors.muted, fontSize: 10, fontWeight: '900', marginBottom: 4 }}>SALDO</Text>
            <Text style={{ color: resumo.saldo >= 0 ? fg.colors.accent : fg.colors.danger, fontWeight: '900', fontSize: isDesktop ? 17 : 14 }}>
              {resumo.saldo >= 0 ? '+' : '-'}{fmoney(resumo.saldo)}
            </Text>
          </View>
        </View>

        {/* Comparativo */}
        {comparativo && (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
            {[
              { label: 'Despesas', diff: comparativo.despesaDiff, invertido: true },
              { label: 'Receitas', diff: comparativo.receitaDiff, invertido: false },
            ].map((item) => {
              const bom = item.invertido ? item.diff <= 0 : item.diff >= 0;
              const cor = bom ? fg.colors.accent : fg.colors.danger;
              const sinal = item.diff >= 0 ? '+' : '';
              return (
                <View key={item.label} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: bom ? 'rgba(74,222,128,0.07)' : 'rgba(248,113,113,0.07)', borderRadius: 8, padding: 8, borderWidth: 1, borderColor: cor + '33' }}>
                  <Text style={{ color: fg.colors.muted, fontSize: 11 }}>{item.label}:</Text>
                  <Text style={{ color: cor, fontWeight: '900', fontSize: 12 }}>
                    {sinal}{fmoney(Math.abs(item.diff))} vs {comparativo.mesAnterior}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </Card>

      {/* ── Gráfico Mensal ──────────────────────────────────────────── */}
      <Card style={{ marginBottom: pad }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
          <SecTitle title={`Evolução Mensal • ${ano}`} sub={`Toque na barra para filtrar • por data de ${basePeriodo === 'caixa' ? 'caixa' : 'despesa'}`} />
          <Pressable
            onPress={() => setMostrarReceita((v) => !v)}
            style={{ paddingHorizontal: 8, paddingVertical: 5, borderRadius: fg.radius.md, borderWidth: 1, borderColor: mostrarReceita ? fg.colors.accent : fg.colors.border, backgroundColor: mostrarReceita ? fg.colors.accentSoft : 'transparent' }}
            accessibilityLabel="Mostrar receitas"
          >
            <Text style={{ color: mostrarReceita ? fg.colors.accent : fg.colors.muted, fontSize: 11, fontWeight: '900' }}>
              + Receitas
            </Text>
          </Pressable>
        </View>

        <GraficoMensal
          dados={dadosMensais}
          mesAtivo={mes}
          onPressMes={(m) => setMes(m)}
          mostrarReceita={mostrarReceita}
          barH={isDesktop ? 140 : 100}
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

      {/* ── Curva ABC de Categorias ──────────────────────────────────── */}
      {categorias.length > 0 && (
        <Card style={{ marginBottom: pad }}>
          <SecTitle
            title={`Despesas por Categoria • ${periodoLabel}`}
            sub="Prioridade: A = concentra 70% dos gastos · B = mais 20% · C = restante · toque para ver lançamentos"
          />
          <CurvaABC categorias={categorias} onPress={abrirDrillDown} />
        </Card>
      )}

      {/* ── Maiores despesas individuais ────────────────────────────── */}
      {topDespesas.length > 0 && (
        <Card style={{ marginBottom: pad }}>
          <SecTitle title={`Maiores Despesas Individuais • ${periodoLabel}`} sub={`Top ${topDespesas.length}`} />
          {topDespesas.map((l, i) => {
            const val = Math.abs(Number(l.valor || 0));
            const data = (l.data_despesa || '').slice(0, 10);
            const maxVal = Math.abs(Number(topDespesas[0]?.valor || 1));
            const pct = (val / maxVal) * 100;
            const isLast = i === topDespesas.length - 1;
            return (
              <View key={l.id} style={{ paddingVertical: 9, borderBottomWidth: isLast ? 0 : 1, borderBottomColor: fg.colors.border }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: fg.colors.border, alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                    <Text style={{ color: fg.colors.muted, fontSize: 11, fontWeight: '900' }}>{i + 1}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: fg.colors.text, fontWeight: '900', fontSize: 13 }} numberOfLines={1}>
                      {l.descricao || '(Sem descrição)'}
                    </Text>
                    <Text style={{ color: fg.colors.muted, fontSize: 11, marginTop: 1 }} numberOfLines={1}>
                      {l.grupo || '-'} • {l.subgrupo || '-'} • {data}
                    </Text>
                  </View>
                  <Text style={{ color: fg.colors.danger, fontWeight: '900', fontSize: 13, marginLeft: 8 }}>
                    -{fmoney(val)}
                  </Text>
                </View>
                {/* Mini barra de proporção */}
                <View style={{ marginLeft: 36, marginTop: 5, height: 3, backgroundColor: fg.colors.border, borderRadius: 2 }}>
                  <View style={{ height: 3, width: `${pct}%`, backgroundColor: 'rgba(248,113,113,0.6)', borderRadius: 2 }} />
                </View>
              </View>
            );
          })}
        </Card>
      )}

      {/* ── Recorrentes ─────────────────────────────────────────────── */}
      {recorrentes.length > 0 && (
        <Card style={{ marginBottom: pad }}>
          <SecTitle title="Gastos Recorrentes" sub={`Padrões em 2+ meses de ${ano}`} />
          {recorrentes.map((r, i) => {
            const isLast = i === recorrentes.length - 1;
            return (
              <Pressable
                key={i}
                onPress={() => abrirDrillDown(r.grupo, r.subgrupo)}
                style={({ pressed }) => ({ paddingVertical: 9, borderBottomWidth: isLast ? 0 : 1, borderBottomColor: fg.colors.border, opacity: pressed ? 0.75 : 1 })}
                accessibilityLabel={`${r.desc} — ver lançamentos`}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: fg.colors.text, fontWeight: '900', fontSize: 13, flex: 1 }} numberOfLines={1}>
                    {r.desc}
                  </Text>
                  <Text style={{ color: fg.colors.danger, fontWeight: '900', fontSize: 13, marginLeft: 8 }}>
                    -{fmoney(r.total)}
                  </Text>
                  <Text style={{ color: fg.colors.muted, fontSize: 11, marginLeft: 6 }}>↗</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, alignItems: 'center' }}>
                  <Text style={{ color: fg.colors.muted, fontSize: 11, flex: 1 }} numberOfLines={1}>{r.cat}</Text>
                  <View style={{ flexDirection: 'row', gap: 6, marginLeft: 8, alignItems: 'center' }}>
                    <View style={{ paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, backgroundColor: fg.colors.accentSoft, borderWidth: 1, borderColor: fg.colors.borderSoft }}>
                      <Text style={{ color: fg.colors.accent, fontSize: 10, fontWeight: '900' }}>{r.mesesCount}× meses</Text>
                    </View>
                    <Text style={{ color: fg.colors.muted, fontSize: 11 }}>~{fmoney(r.media)}/mês</Text>
                  </View>
                </View>
              </Pressable>
            );
          })}
        </Card>
      )}

      {resumo.n === 0 && (
        <Card>
          <Text style={{ color: fg.colors.muted, textAlign: 'center', fontWeight: '900' }}>
            Nenhum lançamento para {periodoLabel}.
          </Text>
        </Card>
      )}
    </ScrollView>
  );
}
