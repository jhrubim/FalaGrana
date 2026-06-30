// src/screens/importacao/PreviewImportacaoScreen.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  DeviceEventEmitter,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import {
  categorizarPorRegras,
  normalizarTexto,
  type SugestaoCategoria,
  type TransacaoImportada,
  type TipoTransacao,
} from '../../utils/importacaoExtrato';
import {
  clearImportacaoPreviewPayload,
  getImportacaoPreviewPayload,
  type ImportacaoPreviewPayload,
} from '../../utils/importacaoPreviewSession';
import { fg } from '../../theme/fgTheme';
import {
  FGAlertBox,
  FGBadge,
  FGButton,
  FGCard,
  FGCentered,
  FGDivider,
  FGHeader,
  FGInput,
  FGScrollScreen,
  FGSelect,
  FGSectionTitle,
} from '../../components/ui/FG';

type Categoria = {
  id: string;
  grupo: string;
  subgrupo: string;
  ativa?: boolean;
  tipo?: 'receita' | 'despesa' | 'transferencia';
  tipo_permitido?: 'receita' | 'despesa' | 'transferencia' | 'ambos';
};

type HistoricoCat = {
  descricao_normalizada: string | null;
  grupo: string | null;
  subgrupo: string | null;
};

type LinhaPreview = {
  idLocal: string;
  data: string; // data_despesa
  descricao: string;
  valor: number; // absoluto
  tipo: TipoTransacao; // já normalizado
  categoriaId: string | null;
  confianca: SugestaoCategoria['confianca'] | 'manual';
  fonte: SugestaoCategoria['fonte'] | 'manual';
};

function formatarMoeda(valor: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor || 0);
}

function formatarDataBR(dataIso: string | null | undefined) {
  if (!dataIso) return '-';
  const partes = dataIso.split('-');
  if (partes.length !== 3) return dataIso;
  const [ano, mes, dia] = partes;
  return `${dia}/${mes}/${ano}`;
}

function isISODateYYYYMMDD(v: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function todayISO() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function setDay28(dateISO: string) {
  const [y, m] = dateISO.split('-');
  return `${y}-${m}-28`;
}

function isOnOrBefore(aISO: string, bISO: string) {
  if (!aISO || !bISO) return false;
  return aISO <= bISO;
}

function parseMoneyToNumber(v: string) {
  const s = String(v || '').trim();
  if (!s) return 0;

  const cleaned = s
    .replace(/\s/g, '')
    .replace(/R\$/gi, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '');

  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function chunkArray<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function normFind(s: string) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isPagamentoEfetuado(descricao: any) {
  const n = normFind(String(descricao || ''));
  return (
    n.includes('pagamento efetuado') ||
    n.includes('pgto efetuado') ||
    n.includes('pagamento da fatura') ||
    n.includes('pagamento fatura') ||
    n.includes('pgto fatura') ||
    n.includes('pagto fatura') ||
    n.includes('pagamento cartao') ||
    n.includes('pgto cartao')
  );
}

function sugerirCategoria(
  descricao: string,
  historicoExato: Map<string, { categoriaId: string }>,
  historicoLista: Array<{ desc: string; categoriaId: string }>
): { categoriaId: string | null; confianca: SugestaoCategoria['confianca']; fonte: SugestaoCategoria['fonte'] } {
  const descNorm = normalizarTexto(descricao);

  const exata = historicoExato.get(descNorm);
  if (exata) return { categoriaId: exata.categoriaId, confianca: 'alta', fonte: 'historico_exato' };

  for (const h of historicoLista) {
    if (h.desc.length >= 8 && descNorm.length >= 8) {
      if (h.desc.includes(descNorm.substring(0, 10)) || descNorm.includes(h.desc.substring(0, 10))) {
        return { categoriaId: h.categoriaId, confianca: 'media', fonte: 'historico_similar' };
      }
    }
  }

  const sug = categorizarPorRegras(descricao);
  return { categoriaId: null, confianca: sug.confianca, fonte: sug.fonte };
}

function montarLinhasPreview(
  transacoes: TransacaoImportada[],
  categorias: Categoria[],
  historico: HistoricoCat[],
  contaEhCartao: boolean
): LinhaPreview[] {
  const mapCatByGrupoSub = new Map<string, Categoria>();
  for (const c of categorias) {
    const key = `${normalizarTexto(c.grupo)}|${normalizarTexto(c.subgrupo)}`;
    mapCatByGrupoSub.set(key, c);
  }

  const historicoExato = new Map<string, { categoriaId: string }>();
  const historicoLista: Array<{ desc: string; categoriaId: string }> = [];

  for (const h of historico) {
    const desc = normalizarTexto(h.descricao_normalizada || '');
    const grupo = (h.grupo || '').trim();
    const subgrupo = (h.subgrupo || '').trim();
    if (!desc || !grupo || !subgrupo) continue;

    const key = `${normalizarTexto(grupo)}|${normalizarTexto(subgrupo)}`;
    const cat = mapCatByGrupoSub.get(key);
    if (!cat) continue;

    historicoExato.set(desc, { categoriaId: cat.id });
    historicoLista.push({ desc, categoriaId: cat.id });
  }

  const base = (transacoes || []).filter((t: any) => {
    if (!contaEhCartao) return true;
    const desc = (t as any)?.descricao ?? '';
    return !isPagamentoEfetuado(desc);
  });

  return base.map((t: any, idx: number) => {
    const valorRaw = Number(t.valor) || 0;

    // ✅ REGRA CARTÃO:
    // positivo = despesa
    // negativo = crédito (receita)
    const tipo: TipoTransacao = contaEhCartao
      ? (valorRaw >= 0 ? 'despesa' : 'receita')
      : ((t.tipo as any) || (valorRaw < 0 ? 'despesa' : 'receita'));

    const valorAbs = Math.abs(valorRaw);

    const sug = sugerirCategoria(t.descricao, historicoExato, historicoLista);

    let categoriaId: string | null = null;

    if (sug.categoriaId) {
      categoriaId = sug.categoriaId;
    } else {
      const regra = categorizarPorRegras(t.descricao);
      const key = `${normalizarTexto(regra.grupo)}|${normalizarTexto(regra.subgrupo)}`;
      const cat = mapCatByGrupoSub.get(key);
      categoriaId = cat?.id ?? null;
    }

    return {
      idLocal: `${idx + 1}-${normalizarTexto(t.descricao).slice(0, 16)}-${t.data}`,
      data: t.data,
      descricao: t.descricao,
      valor: valorAbs,
      tipo,
      categoriaId,
      confianca: categoriaId ? sug.confianca : 'baixa',
      fonte: categoriaId ? sug.fonte : 'fallback',
    };
  });
}

export default function PreviewImportacaoScreen() {
  const navigation = useNavigation<any>();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [salvando, setSalvando] = useState(false);
  const [erroTela, setErroTela] = useState<string | null>(null);
  const [msgAcao, setMsgAcao] = useState<string | null>(null);

  const [payload, setPayload] = useState<ImportacaoPreviewPayload | null>(null);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [linhas, setLinhas] = useState<LinhaPreview[]>([]);

  const [saldoAtualRef, setSaldoAtualRef] = useState<number | null>(null);
  const [carregandoSaldo, setCarregandoSaldo] = useState(false);

  // Saldo do extrato vem do payload (preenchido na tela de importação)
  const saldoExtratoRefStr = useMemo(
    () => String((payload as any)?.saldoExtratoRef || ''),
    [payload]
  );
  const saldoExtratoRefNum = useMemo(() => parseMoneyToNumber(saldoExtratoRefStr), [saldoExtratoRefStr]);

  const [dataCaixaFatura, setDataCaixaFatura] = useState('');

  const [mostrarApenasPendentes, setMostrarApenasPendentes] = useState(true);
  const [busca, setBusca] = useState('');

  const [modalEdicao, setModalEdicao] = useState(false);
  const [modalCategoria, setModalCategoria] = useState(false);

  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [editData, setEditData] = useState('');
  const [editDescricao, setEditDescricao] = useState('');
  const [editValor, setEditValor] = useState('');
  const [editTipo, setEditTipo] = useState<TipoTransacao>('despesa');
  const [editCategoriaId, setEditCategoriaId] = useState<string | null>(null);
  const [buscaCategoria, setBuscaCategoria] = useState('');

  const cancelRef = useRef(false);
  const mountedRef = useRef(true);
  const navBypassRef = useRef(false);
  const inseridosRef = useRef(0);
  const totalRef = useRef(0);

  const [cancelSolicitado, setCancelSolicitado] = useState(false);
  const [progresso, setProgresso] = useState<{ done: number; total: number }>({ done: 0, total: 0 });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cancelRef.current = true;
    };
  }, []);

  const safeSetState = useCallback((fn: () => void) => {
    if (mountedRef.current) fn();
  }, []);

  const alertar = useCallback((titulo: string, mensagem: string) => {
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof (window as any).alert === 'function') {
        (window as any).alert(`${titulo}\n\n${mensagem}`);
      } else {
        Alert.alert(titulo, mensagem);
      }
    } catch {
      console.log('ALERTA:', titulo, mensagem);
    }
  }, []);

  const confirmarWebOuNative = useCallback(async (titulo: string, mensagem: string) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof (window as any).confirm === 'function') {
      return (window as any).confirm(`${titulo}\n\n${mensagem}`);
    }
    return await new Promise<boolean>((resolve) => {
      Alert.alert(titulo, mensagem, [
        { text: 'Não', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Sim', style: 'destructive', onPress: () => resolve(true) },
      ]);
    });
  }, []);

  const fpTx = useCallback(
    (r: {
      grupo_id: string;
      conta_id: string;
      data_despesa: string;
      data_caixa: string;
      tipo: string;
      valor: number;
      descricao_normalizada: string;
    }) => {
      const v = Number(r.valor || 0);
      const v2 = v.toFixed(2);
      return [
        r.grupo_id,
        r.conta_id,
        r.data_despesa,
        r.data_caixa,
        String(r.tipo || '').toLowerCase().trim(),
        v2,
        String(r.descricao_normalizada || '').trim(),
      ].join('|');
    },
    []
  );

  const dedupeLocal = useCallback(<T,>(arr: T[], keyFn: (x: T) => string) => {
    const seen = new Set<string>();
    const out: T[] = [];
    for (const x of arr) {
      const k = keyFn(x);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(x);
    }
    return out;
  }, []);

  const carregarExistentesDedupe = useCallback(
    async (params: { grupoId: string; contaId: string; dataMin: string; dataMax: string }) => {
      const { grupoId, contaId, dataMin, dataMax } = params;

      const pageSize = 1000;
      let page = 0;
      const set = new Set<string>();

      while (true) {
        const from = page * pageSize;
        const to = from + pageSize - 1;

        const { data, error } = await supabase
          .from('transacoes')
          .select('grupo_id, conta_id, data_despesa, data_caixa, tipo, valor, descricao_normalizada')
          .eq('grupo_id', grupoId)
          .eq('conta_id', contaId)
          .gte('data_despesa', dataMin)
          .lte('data_despesa', dataMax)
          .eq('status', 'confirmada')
          .range(from, to);

        if (error) throw error;

        const rows = (data || []) as any[];
        for (const r of rows) {
          set.add(
            fpTx({
              grupo_id: r.grupo_id,
              conta_id: r.conta_id,
              data_despesa: r.data_despesa,
              data_caixa: r.data_caixa,
              tipo: r.tipo,
              valor: Number(r.valor || 0),
              descricao_normalizada: r.descricao_normalizada || '',
            })
          );
        }

        if (rows.length < pageSize) break;
        page += 1;
        if (page > 50) break;
      }

      return set;
    },
    [fpTx]
  );

  const dataRef = String((payload as any)?.dataReferencia || todayISO());
  const corteFuturos = (payload as any)?.corteFuturos || null;
  const contaEhCartao = String((payload as any)?.contaTipo || '').toLowerCase() === 'cartao';

  const categoriasMap = useMemo(() => {
    const m = new Map<string, Categoria>();
    for (const c of categorias) m.set(c.id, c);
    return m;
  }, [categorias]);

  const getCategoriaOutrosNaoCategorizado = useCallback((): Categoria | null => {
    for (const c of categorias) {
      const g = normalizarTexto(c.grupo || '');
      const s = normalizarTexto(c.subgrupo || '');
      if (g === 'outros' && s === 'nao categorizado') return c;
    }
    return null;
  }, [categorias]);

  const isOutrosNaoCategorizado = useCallback((cat: Categoria | null | undefined) => {
    if (!cat) return false;
    const g = normalizarTexto(cat.grupo || '');
    const s = normalizarTexto(cat.subgrupo || '');
    return g === 'outros' && s === 'nao categorizado';
  }, []);

  const isLinhaPendente = useCallback(
    (l: LinhaPreview) => {
      if (!l.categoriaId) return true;
      const cat = categoriasMap.get(l.categoriaId);
      if (!cat) return true;
      if (isOutrosNaoCategorizado(cat)) return true;
      return false;
    },
    [categoriasMap, isOutrosNaoCategorizado]
  );

  const indicadores = useMemo(() => {
    const total = linhas.length;
    const naoCategorizados = linhas.filter(isLinhaPendente).length;

    // Impacto total de todos os lançamentos a importar
    const impactoTotal = linhas.reduce((acc, l) => {
      const v = Math.abs(Number(l.valor) || 0);
      return acc + (l.tipo === 'receita' ? v : -v);
    }, 0);

    const saldoProjetado = (saldoAtualRef ?? 0) + impactoTotal;

    // Diferença: saldo informado no extrato menos saldo projetado
    const diffExtrato = saldoExtratoRefStr.trim().length > 0 ? saldoExtratoRefNum - saldoProjetado : null;

    return { total, naoCategorizados, impactoTotal, saldoProjetado, diffExtrato };
  }, [linhas, isLinhaPendente, saldoAtualRef, saldoExtratoRefStr, saldoExtratoRefNum]);

  const linhasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    return linhas.filter((l) => {
      if (mostrarApenasPendentes && !isLinhaPendente(l)) return false;
      if (!termo) return true;

      const cat = l.categoriaId ? categoriasMap.get(l.categoriaId) : null;
      const alvo = [l.descricao, l.data, cat?.grupo, cat?.subgrupo].filter(Boolean).join(' ').toLowerCase();
      return alvo.includes(termo);
    });
  }, [linhas, busca, mostrarApenasPendentes, isLinhaPendente, categoriasMap]);

  const categoriasFiltradasModal = useMemo(() => {
    const termo = buscaCategoria.trim().toLowerCase();
    const tipoAtual = editTipo;

    return categorias.filter((c) => {
      const tp = c.tipo_permitido ?? c.tipo ?? 'ambos';
      const okTipo = tp === 'ambos' || tp === tipoAtual;
      if (!okTipo) return false;

      if (!termo) return true;
      return c.grupo.toLowerCase().includes(termo) || c.subgrupo.toLowerCase().includes(termo);
    });
  }, [categorias, buscaCategoria, editTipo]);

  // Saldo atual real da conta: todas as transações confirmadas, sem filtro de data.
  // Filtra conta_id em memória para garantir precisão.
  const carregarSaldoAtual = useCallback(
    async (p: ImportacaoPreviewPayload) => {
      safeSetState(() => setCarregandoSaldo(true));

      try {
        const grupoId = String((p as any).grupoId || '');
        const contaId = String((p as any).contaId || '');

        if (!grupoId || !contaId) {
          safeSetState(() => setSaldoAtualRef(null));
          return;
        }

        let page = 0;
        const pageSize = 2000;
        let saldo = 0;

        while (true) {
          const from = page * pageSize;
          const to = from + pageSize - 1;

          const { data, error } = await supabase
            .from('transacoes')
            .select('conta_id, tipo, valor')
            .eq('grupo_id', grupoId)
            .eq('status', 'confirmada')
            .range(from, to);

          if (error) throw error;

          const rows = (data || []) as Array<{ conta_id: string | null; tipo: string | null; valor: any }>;
          for (const r of rows) {
            if (r.conta_id !== contaId) continue;

            const tipo = String(r.tipo || '').toLowerCase().trim();
            const vRaw = Number.isFinite(Number(r.valor)) ? Number(r.valor) : 0;
            const vAbs = Math.abs(vRaw);

            if (tipo === 'receita') saldo += vAbs;
            else if (tipo === 'despesa') saldo -= vAbs;
            else if (tipo === 'transferencia') saldo += vRaw;
          }

          if (rows.length < pageSize) break;
          page += 1;
          if (page > 50) break;
        }

        safeSetState(() => setSaldoAtualRef(saldo));
      } catch (e: any) {
        console.log('ERRO saldo conta:', e);
        safeSetState(() => setSaldoAtualRef(null));
      } finally {
        safeSetState(() => setCarregandoSaldo(false));
      }
    },
    [safeSetState]
  );

  const carregarTela = useCallback(async () => {
    safeSetState(() => {
      setErroTela(null);
      setMsgAcao(null);
    });

    try {
      const p = getImportacaoPreviewPayload();
      if (!p) throw new Error('Nenhuma importação em memória. Volte e processe o extrato novamente.');
      safeSetState(() => setPayload(p));

      const refISO = String((p as any).dataReferencia || todayISO());
      const cartao = String((p as any)?.contaTipo || '').toLowerCase() === 'cartao';

      if (cartao) {
        const refISO = String((p as any).dataReferencia || todayISO());
        safeSetState(() => setDataCaixaFatura(setDay28(refISO)));
      }

      const { data: catData, error: catError } = await supabase
        .from('categorias')
        .select('id, grupo, subgrupo, ativa, tipo, tipo_permitido')
        .eq('grupo_id', (p as any).grupoId)
        .eq('ativa', true)
        .order('grupo', { ascending: true })
        .order('subgrupo', { ascending: true });

      if (catError) throw new Error(`Erro ao carregar categorias. (${catError.message})`);

      const { data: histData, error: histError } = await supabase
        .from('transacoes')
        .select('descricao_normalizada, grupo, subgrupo')
        .eq('grupo_id', (p as any).grupoId)
        .not('grupo', 'is', null)
        .not('subgrupo', 'is', null)
        .order('created_at', { ascending: false })
        .limit(500);

      if (histError) throw new Error(`Erro ao carregar histórico. (${histError.message})`);

      const categoriasLista = (catData || []) as Categoria[];
      const historico = (histData || []) as HistoricoCat[];

      safeSetState(() => setCategorias(categoriasLista));
      safeSetState(() => setLinhas(montarLinhasPreview((p as any).transacoes, categoriasLista, historico, cartao)));

      await carregarSaldoAtual(p);
    } catch (e: any) {
      safeSetState(() => setErroTela(e?.message || 'Erro ao carregar preview.'));
      safeSetState(() => setCategorias([]));
      safeSetState(() => setLinhas([]));
      safeSetState(() => setSaldoAtualRef(null));
      safeSetState(() => setPayload(null));
    }
  }, [carregarSaldoAtual, safeSetState]);

  useEffect(() => {
    let ativo = true;
    (async () => {
      safeSetState(() => setLoading(true));
      await carregarTela();
      if (ativo) safeSetState(() => setLoading(false));
    })();
    return () => {
      ativo = false;
    };
  }, [carregarTela, safeSetState]);

  const onRefresh = useCallback(async () => {
    safeSetState(() => setRefreshing(true));
    await carregarTela();
    safeSetState(() => setRefreshing(false));
  }, [carregarTela, safeSetState]);

  const abrirEdicao = (indexListaFiltrada: number) => {
    const l = linhasFiltradas[indexListaFiltrada];
    const realIndex = linhas.findIndex((x) => x.idLocal === l.idLocal);
    if (realIndex < 0) return;

    safeSetState(() => setEditIndex(realIndex));
    safeSetState(() => setEditData(l.data));
    safeSetState(() => setEditDescricao(l.descricao));
    safeSetState(() => setEditValor(
      l.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    ));
    safeSetState(() => setEditTipo(l.tipo));
    safeSetState(() => setEditCategoriaId(l.categoriaId));
    safeSetState(() => setBuscaCategoria(''));
    safeSetState(() => setModalEdicao(true));
  };

  const salvarEdicaoItem = () => {
    if (editIndex === null) return;

    if (!isISODateYYYYMMDD(editData)) {
      alertar('Validação', 'Data inválida. Use AAAA-MM-DD.');
      return;
    }

    const desc = editDescricao.trim();
    if (!desc) {
      alertar('Validação', 'Descrição obrigatória.');
      return;
    }

    const valorNum = Number(editValor.replace(/\./g, '').replace(',', '.'));
    if (!Number.isFinite(valorNum) || valorNum <= 0) {
      alertar('Validação', 'Valor inválido.');
      return;
    }

    safeSetState(() => {
      setLinhas((prev) => {
        const next = [...prev];
        const atual = next[editIndex];
        if (!atual) return prev;

        next[editIndex] = {
          ...atual,
          data: editData,
          descricao: desc,
          valor: valorNum,
          tipo: editTipo,
          categoriaId: editCategoriaId,
          confianca: 'manual',
          fonte: 'manual',
        };

        return next;
      });
      setModalEdicao(false);
    });
  };

  const confirmarCancelamento = useCallback(
    async (onConfirm?: () => void) => {
      const ok = await confirmarWebOuNative(
        'Cancelar importação?',
        'Isso vai interromper o processo. Pode ter sido importada uma parte dos lançamentos (até o bloco atual).'
      );
      if (!ok) return;
      cancelRef.current = true;
      safeSetState(() => setCancelSolicitado(true));
      onConfirm?.();
    },
    [confirmarWebOuNative, safeSetState]
  );

  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', (e: any) => {
      if (navBypassRef.current) return;
      if (!salvando) return;
      e.preventDefault();
      confirmarCancelamento(() => {
        clearImportacaoPreviewPayload();
        navigation.dispatch(e.data.action);
      });
    });
    return unsub;
  }, [navigation, salvando, confirmarCancelamento]);

  const onVoltarOuCancelar = () => {
    if (salvando) {
      confirmarCancelamento(() => {
        clearImportacaoPreviewPayload();
        navigation.goBack();
      });
      return;
    }
    navigation.goBack();
  };

  const salvarImportacao = async (permitirPendentes: boolean) => {
    if (salvando) return;

    if (!payload || !(payload as any)?.grupoId || !(payload as any).contaId) {
      throw new Error('Dados da importação não encontrados. Volte e processe o extrato novamente.');
    }

    if (!linhas.length) {
      throw new Error('Nenhum lançamento para importar.');
    }

    const catOutros = getCategoriaOutrosNaoCategorizado();

    cancelRef.current = false;
    inseridosRef.current = 0;
    totalRef.current = 0;

    safeSetState(() => {
      setCancelSolicitado(false);
      setProgresso({ done: 0, total: 0 });
      setSalvando(true);
    });

    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user?.id) throw new Error('Usuário não autenticado.');

    const contaEhCartaoLocal = String((payload as any).contaTipo || '').toLowerCase() === 'cartao';

    const registrosBase = linhas.map((l) => {
      let cat: Categoria | null = null;

      if (l.categoriaId) cat = categoriasMap.get(l.categoriaId) || null;

      if (!cat) {
        if (!permitirPendentes) throw new Error(`Sem categoria: "${l.descricao}".`);
        if (!catOutros) throw new Error('Crie a categoria "Outros • Não categorizado" (ativa) para importar pendentes.');
        cat = catOutros;
      }

      if (isOutrosNaoCategorizado(cat) && !permitirPendentes) {
        throw new Error(`Categoria pendente (Outros • Não categorizado): "${l.descricao}".`);
      }

      return {
        grupo_id: (payload as any).grupoId,
        usuario_id: authData.user.id,
        tipo: l.tipo,
        categoria_id: cat.id,
        grupo: cat.grupo,
        subgrupo: cat.subgrupo,
        conta_id: (payload as any).contaId,
        data_despesa: l.data,
        data_caixa: contaEhCartaoLocal ? dataCaixaFatura : l.data,
        descricao: l.descricao,
        descricao_normalizada: normalizarTexto(l.descricao),
        valor: Math.abs(Number(l.valor) || 0),
        status: 'confirmada',
        origem: 'importacao',
        eh_parcela: false,
        parcela_numero: null,
        total_parcelas: null,
        parcelamento_id: null,
      };
    });

    // Permite duplicatas legítimas no mesmo lote (ex: dois táxis do mesmo valor no mesmo dia).
    // A verificação contra o banco (abaixo) cuida dos já importados.
    let registrosFinal = [...registrosBase];
    const removidosNoLote = 0;

    const datas = registrosFinal.map((r: any) => r.data_despesa).filter(Boolean).sort();
    const dataMin = datas[0];
    const dataMax = datas[datas.length - 1];

    const existentes = await carregarExistentesDedupe({
      grupoId: (payload as any).grupoId,
      contaId: (payload as any).contaId,
      dataMin,
      dataMax,
    });

    const antesFiltroBanco = registrosFinal.length;
    registrosFinal = registrosFinal.filter((r: any) => {
      const k = fpTx({
        grupo_id: r.grupo_id,
        conta_id: r.conta_id,
        data_despesa: r.data_despesa,
        data_caixa: r.data_caixa,
        tipo: r.tipo,
        valor: Number(r.valor || 0),
        descricao_normalizada: r.descricao_normalizada || '',
      });
      return !existentes.has(k);
    });
    const removidosPorExistencia = antesFiltroBanco - registrosFinal.length;

    if (!registrosFinal.length) {
      alertar(
        'Nada novo para importar',
        `Todos os lançamentos já existiam.\nDuplicados evitados: ${removidosNoLote + removidosPorExistencia}`
      );

      navBypassRef.current = true;
      safeSetState(() => setSalvando(false));
      clearImportacaoPreviewPayload();
      try {
        DeviceEventEmitter.emit('FG_REFRESH_ALL', { ts: Date.now(), origem: 'importacao' });
      } catch {}
      navigation.goBack();
      return;
    }

    // ── Matching com lançamentos pendentes de voz ──────────────────────────────
    // Busca entradas origem='voz', status='pendente' do período ± 5 dias
    const dataPadded = (base: string, dias: number) => {
      const d = new Date(base + 'T12:00:00');
      d.setDate(d.getDate() + dias);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    const { data: vozPendentes } = await supabase
      .from('transacoes')
      .select('id, tipo, valor, data_despesa, conta_id')
      .eq('grupo_id', (payload as any).grupoId)
      .eq('origem', 'voz')
      .eq('status', 'pendente')
      .gte('data_despesa', dataPadded(dataMin, -7))
      .lte('data_despesa', dataPadded(dataMax, 7));

    const contaImportacao = (payload as any).contaId as string;
    const vozDisponivel = [...(vozPendentes || [])];
    const vozAtualizacoes: Array<{ id: string; patch: Record<string, unknown> }> = [];
    const indicesToRemover = new Set<number>();

    for (let ri = 0; ri < registrosFinal.length; ri++) {
      const r = registrosFinal[ri] as any;
      const bestIdx = vozDisponivel.findIndex((v) => {
        if (!v.tipo || v.tipo !== r.tipo) return false;
        // Se a captura de voz indicou uma conta, ela deve bater com a importação
        if (v.conta_id && v.conta_id !== contaImportacao) return false;
        const valDiff = Math.abs(Number(v.valor || 0) - Number(r.valor || 0));
        const valOk = Number(r.valor || 0) > 0 && valDiff / Number(r.valor) <= 0.15;
        if (!valOk) return false;
        const dtV = new Date((v.data_despesa ?? '') + 'T12:00:00').getTime();
        const dtR = new Date((r.data_despesa ?? '') + 'T12:00:00').getTime();
        const daysDiff = Math.abs(dtV - dtR) / 86400000;
        return daysDiff <= 5;
      });

      if (bestIdx !== -1) {
        const voz = vozDisponivel[bestIdx];
        vozAtualizacoes.push({
          id: voz.id,
          patch: {
            categoria_id: r.categoria_id,
            grupo: r.grupo,
            subgrupo: r.subgrupo,
            descricao: r.descricao,
            descricao_normalizada: r.descricao_normalizada,
            valor: r.valor,
            data_despesa: r.data_despesa,
            data_caixa: r.data_caixa,
            conta_id: r.conta_id,
            status: 'confirmada',
            origem: 'voz+importacao',
          },
        });
        vozDisponivel.splice(bestIdx, 1);
        indicesToRemover.add(ri);
      }
    }

    // Remove itens que foram resolvidos pela voz (já não precisam ser inseridos)
    const registrosParaInserir = registrosFinal.filter((_, i) => !indicesToRemover.has(i));

    // Atualiza os lançamentos de voz em paralelo
    if (vozAtualizacoes.length > 0) {
      await Promise.all(
        vozAtualizacoes.map(({ id, patch }) =>
          supabase.from('transacoes').update(patch as any).eq('id', id)
        )
      );
    }

    const totalEfetivo = registrosParaInserir.length + vozAtualizacoes.length;
    if (!registrosParaInserir.length && !vozAtualizacoes.length) {
      alertar('Nada novo para importar', 'Todos os lançamentos já existiam.');
      navBypassRef.current = true;
      safeSetState(() => setSalvando(false));
      clearImportacaoPreviewPayload();
      try { DeviceEventEmitter.emit('FG_REFRESH_ALL', { ts: Date.now(), origem: 'importacao' }); } catch {}
      navigation.goBack();
      return;
    }
    // ─────────────────────────────────────────────────────────────────────────

    totalRef.current = registrosParaInserir.length;
    safeSetState(() => setProgresso({ done: vozAtualizacoes.length, total: totalEfetivo }));

    const blocos = chunkArray(registrosParaInserir, 200);

    for (let i = 0; i < blocos.length; i++) {
      if (cancelRef.current) throw new Error('__CANCEL__');

      const bloco = blocos[i];

      let upsertOk = true;
      const { error: upErr } = await supabase.from('transacoes').upsert(bloco as any, {
        onConflict: 'grupo_id,conta_id,data_despesa,data_caixa,tipo,valor,descricao_normalizada',
        ignoreDuplicates: true,
      });

      if (upErr) {
        const msg = String((upErr as any)?.message || '');
        if (msg.toLowerCase().includes('no unique') || msg.toLowerCase().includes('on conflict')) {
          upsertOk = false;
        } else {
          throw upErr;
        }
      }

      if (!upsertOk) {
        const { error: insErr } = await supabase.from('transacoes').insert(bloco as any);
        if (insErr) throw insErr;
      }

      inseridosRef.current += bloco.length;
      safeSetState(() => setProgresso({ done: inseridosRef.current, total: totalRef.current }));

      if (cancelRef.current) throw new Error('__CANCEL__');
    }

    const vozMsg = vozAtualizacoes.length > 0
      ? `\n🎤 ${vozAtualizacoes.length} lançamento(s) de voz confirmados.`
      : '';
    alertar(
      'Importação concluída',
      `${registrosParaInserir.length} lançamentos importados.\nDuplicados evitados: ${removidosNoLote + removidosPorExistencia}${vozMsg}`
    );

    navBypassRef.current = true;
    safeSetState(() => setSalvando(false));

    clearImportacaoPreviewPayload();
    try {
      DeviceEventEmitter.emit('FG_REFRESH_ALL', { ts: Date.now(), origem: 'importacao' });
    } catch {}
    navigation.goBack();
  };

  const onConfirmarPress = async () => {
    safeSetState(() => setMsgAcao(null));

    if (salvando) {
      safeSetState(() => setMsgAcao('Importação em andamento...'));
      return;
    }

    if (!payload) {
      const msg = 'Nenhuma importação em memória. Volte e processe o extrato novamente.';
      safeSetState(() => setMsgAcao(msg));
      alertar('Importação inválida', msg);
      return;
    }

    if (!linhas.length) {
      const msg = 'Nenhum lançamento para importar.';
      safeSetState(() => setMsgAcao(msg));
      alertar('Validação', msg);
      return;
    }

    const contaEhCartaoAgora = String((payload as any)?.contaTipo || '').toLowerCase() === 'cartao';
    if (contaEhCartaoAgora && !isISODateYYYYMMDD(dataCaixaFatura)) {
      const msg = 'Informe a data de pagamento da fatura (Data de Caixa) no formato AAAA-MM-DD.';
      safeSetState(() => setMsgAcao(msg));
      alertar('Validação', msg);
      return;
    }

    let permitirPendentes = false;
    if (indicadores.naoCategorizados > 0) {
      const ok = await confirmarWebOuNative(
        'Importar com pendências?',
        `Existem ${indicadores.naoCategorizados} pendentes.\n\nSe continuar, eles serão importados como "Outros • Não categorizado" para você categorizar depois.`
      );
      if (!ok) {
        safeSetState(() => setMsgAcao('Importação cancelada (pendências).'));
        return;
      }
      permitirPendentes = true;
    }

    try {
      await salvarImportacao(permitirPendentes);
    } catch (e: any) {
      if (String(e?.message || '') === '__CANCEL__') {
        const done = inseridosRef.current;
        const total = totalRef.current;
        alertar('Importação cancelada', `Cancelado.\nImportados: ${done} de ${total}.`);
        navBypassRef.current = true;
        safeSetState(() => setSalvando(false));
        clearImportacaoPreviewPayload();
        try {
          DeviceEventEmitter.emit('FG_REFRESH_ALL', { ts: Date.now(), origem: 'importacao' });
        } catch {}
        navigation.goBack();
      } else {
        const msg = e?.message || 'Não foi possível concluir a importação.';
        safeSetState(() => setMsgAcao(msg));
        alertar('Erro', msg);
      }
    } finally {
      safeSetState(() => setSalvando(false));
    }
  };

  if (loading) {
    return (
      <FGCentered message="Carregando preview...">
        <ActivityIndicator size="large" color={fg.colors.accent} />
      </FGCentered>
    );
  }

  return (
    <>
      <FGScrollScreen
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={fg.colors.accent} />}
      >
        <FGHeader
          title="Preview da Importação"
          subtitle={(payload as any)?.contaNome || 'Conta não informada'}
          info={
            ((payload as any)?.contaTipo ? 'Tipo: ' + (payload as any).contaTipo : '') +
            ((payload as any)?.formatoDetectado ? ' • Formato: ' + (payload as any).formatoDetectado : '') +
            ' • ' + indicadores.total + ' lançamentos'
          }
          right={salvando ? <FGButton title="Cancelar" variant="danger" onPress={onVoltarOuCancelar} /> : undefined}
        />

        {corteFuturos?.ativo ? (
          <FGAlertBox
            variant="warn"
            text={`⚠️ Seção "${String(corteFuturos.marcador)}" foi ignorada (aprox. ${Number(
              corteFuturos.linhasRemovidas || 0
            )} linhas removidas).`}
          />
        ) : null}

        {contaEhCartao ? (
          <FGCard style={{ marginBottom: 8, borderColor: isISODateYYYYMMDD(dataCaixaFatura) ? 'rgba(74,222,128,0.35)' : 'rgba(246,196,83,0.5)' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: fg.colors.accent, fontWeight: '900', fontSize: 12, marginBottom: 2 }}>
                  DATA DE PAGAMENTO DA FATURA
                </Text>
                <Text style={{ color: fg.colors.muted, fontSize: 11, marginBottom: 8 }}>
                  Data de caixa aplicada a todos os lançamentos desta importação
                </Text>
                <FGInput
                  value={dataCaixaFatura}
                  onChangeText={setDataCaixaFatura}
                  placeholder="AAAA-MM-DD"
                  editable={!salvando}
                />
              </View>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 24 }}>💳</Text>
                {isISODateYYYYMMDD(dataCaixaFatura) ? (
                  <Text style={{ color: fg.colors.accent, fontSize: 11, fontWeight: '900', marginTop: 4 }}>
                    {formatarDataBR(dataCaixaFatura)}
                  </Text>
                ) : (
                  <Text style={{ color: fg.colors.warn, fontSize: 11, fontWeight: '900', marginTop: 4 }}>
                    Obrigatório
                  </Text>
                )}
              </View>
            </View>
          </FGCard>
        ) : null}

        {erroTela ? <FGAlertBox variant="danger" text={erroTela} /> : null}

        {salvando ? (
          <FGCard>
            <Text style={styles.progressTitle}>
              Importando... {progresso.done}/{progresso.total}
            </Text>
            <Text style={styles.progressHint}>
              {cancelSolicitado ? 'Cancelamento solicitado... finalizando bloco atual.' : 'Você pode cancelar a qualquer momento.'}
            </Text>
          </FGCard>
        ) : null}

        {msgAcao ? <FGAlertBox variant="warn" text={`⚠️ ${msgAcao}`} /> : null}

        <View style={styles.duasColunasRow}>
          {/* Coluna esquerda: Resumo */}
          <View style={styles.colunaEsquerda}>
            <FGSectionTitle title="Resumo" />
            <FGCard glow>
          {/* Linha: saldo atual */}
          <View style={styles.resumoRow}>
            <Text style={styles.resumoLabel}>Saldo atual no sistema</Text>
            <Text style={[styles.resumoValor, (saldoAtualRef ?? 0) >= 0 ? styles.pos : styles.neg]}>
              {carregandoSaldo ? '...' : formatarMoeda(saldoAtualRef ?? 0)}
            </Text>
          </View>

          {/* Linha: impacto */}
          <View style={styles.resumoRow}>
            <Text style={styles.resumoLabel}>
              {indicadores.impactoTotal >= 0 ? '+' : ''} Importação ({indicadores.total} lançamentos)
            </Text>
            <Text style={[styles.resumoValor, indicadores.impactoTotal >= 0 ? styles.pos : styles.neg]}>
              {indicadores.impactoTotal >= 0 ? '+' : ''}{formatarMoeda(indicadores.impactoTotal)}
            </Text>
          </View>

          {/* Separador */}
          <View style={styles.resumoDivider} />

          {/* Linha: saldo projetado — destaque */}
          <View style={styles.resumoRow}>
            <Text style={styles.resumoLabelBig}>Saldo projetado</Text>
            <Text style={[styles.resumoValorBig, indicadores.saldoProjetado >= 0 ? styles.pos : styles.neg]}>
              {formatarMoeda(indicadores.saldoProjetado)}
            </Text>
          </View>

          {/* Conferência com saldo do extrato */}
          {saldoExtratoRefStr ? (
            <>
              <View style={styles.resumoDivider} />

              <View style={styles.resumoRow}>
                <Text style={styles.resumoLabel}>Saldo informado (extrato)</Text>
                <Text style={styles.resumoValor}>{formatarMoeda(saldoExtratoRefNum)}</Text>
              </View>

              <View style={styles.resumoRow}>
                <Text style={styles.resumoLabel}>Diferença</Text>
                <View style={[{ minWidth: 130, alignItems: 'flex-end' }]}><View style={[
                  styles.diffPill,
                  indicadores.diffExtrato !== null && Math.abs(indicadores.diffExtrato) <= 0.005
                    ? styles.diffPillOk
                    : styles.diffPillWarn,
                ]}>
                  <Text style={[
                    styles.diffPillText,
                    indicadores.diffExtrato !== null && Math.abs(indicadores.diffExtrato) <= 0.005
                      ? styles.pos
                      : styles.neg,
                  ]}>
                    {indicadores.diffExtrato !== null
                      ? `${formatarMoeda(indicadores.diffExtrato)}${Math.abs(indicadores.diffExtrato) <= 0.005 ? ' ✓' : ''}`
                      : '-'}
                  </Text>
                </View></View>
              </View>
            </>
          ) : (
            <>
              <View style={styles.resumoDivider} />
              <Text style={styles.hint}>Saldo do extrato não informado — volte e preencha para conferência.</Text>
            </>
          )}

          {/* Pendentes */}
          {indicadores.naoCategorizados > 0 ? (
            <>
              <View style={styles.resumoDivider} />
              <View style={styles.resumoRow}>
                <Text style={styles.resumoLabel}>Pendentes de categoria</Text>
                <Text style={[styles.resumoValor, styles.neg]}>{indicadores.naoCategorizados}</Text>
              </View>
            </>
          ) : null}
          </FGCard>
          </View>{/* fim colunaEsquerda */}

          {/* Coluna direita: Filtros */}
          <View style={styles.colunaDireita}>
            <FGSectionTitle title="Lançamentos (revisão)" />
            <FGCard>
          <Text style={styles.cardTitle}>Filtros</Text>

          <View style={styles.rowBetween}>
            <Text style={styles.label}>Mostrar só pendentes</Text>
            <Switch value={mostrarApenasPendentes} onValueChange={setMostrarApenasPendentes} disabled={salvando} />
          </View>

          <View style={{ height: 10 }} />

          <FGInput
            placeholder="Buscar por descrição/categoria..."
            value={busca}
            onChangeText={setBusca}
            editable={!salvando}
          />

          <View style={{ height: 10 }} />

          <View style={styles.filterInline}>
            <Text style={styles.hint}>
              Mostrando: <Text style={styles.hintStrong}>{linhasFiltradas.length}</Text> de{' '}
              <Text style={styles.hintStrong}>{linhas.length}</Text>
            </Text>

            {indicadores.naoCategorizados > 0 ? (
              <FGBadge label={`Pendentes: ${indicadores.naoCategorizados}`} variant="warn" />
            ) : (
              <FGBadge label="Sem pendências" variant="ok" />
            )}
          </View>
            </FGCard>
          </View>{/* fim colunaDireita */}
        </View>{/* fim duasColunasRow */}

        {linhasFiltradas.length === 0 ? (
          <FGCard>
            <Text style={styles.emptyText}>Nenhum lançamento encontrado com os filtros atuais.</Text>
          </FGCard>
        ) : (
          <FGCard style={{ padding: 0 }}>
            {linhasFiltradas.map((item, idx) => {
              const cat = item.categoriaId ? categoriasMap.get(item.categoriaId) : null;
              const pendente = isLinhaPendente(item);
              const labelCategoria = cat ? `${cat.grupo} • ${cat.subgrupo}` : 'Sem categoria';

              const badgeTipo = item.tipo === 'receita' ? 'ok' : item.tipo === 'transferencia' ? 'info' : 'danger';

              return (
                <View key={item.idLocal}>
                  <Pressable
                    style={({ pressed }) => [styles.listItem, pressed ? styles.listItemPressed : null]}
                    onPress={() => abrirEdicao(idx)}
                    disabled={salvando}
                  >
                    <View style={styles.listLeft}>
                      <Text style={styles.listTitle} numberOfLines={1}>
                        {item.descricao}
                      </Text>

                      <View style={styles.metaRow}>
                        <Text style={styles.listMeta} numberOfLines={1}>
                          {formatarDataBR(item.data)}
                        </Text>
                        <FGBadge
                          label={item.tipo === 'receita' ? 'CRÉDITO' : item.tipo === 'transferencia' ? 'TRANSFERÊNCIA' : 'DESPESA'}
                          variant={badgeTipo as any}
                        />
                      </View>

                      <View style={{ marginTop: 8, alignItems: 'flex-start' }}>
                        <FGBadge label={labelCategoria} variant={pendente ? 'warn' : 'ok'} />
                      </View>
                    </View>

                    <View style={styles.listRight}>
                      <Text style={[styles.listValue, item.tipo === 'receita' ? styles.pos : styles.neg]}>
                        {item.tipo === 'receita' ? '+' : '-'} {formatarMoeda(item.valor)}
                      </Text>

                      <View style={styles.editPill}>
                        <Text style={styles.editPillText}>✏️ Editar</Text>
                      </View>
                    </View>
                  </Pressable>

                  {idx < linhasFiltradas.length - 1 ? <FGDivider /> : null}
                </View>
              );
            })}
          </FGCard>
        )}

        <View style={styles.actions}>
          <FGButton title={salvando ? 'Cancelar' : 'Voltar'} variant="secondary" onPress={onVoltarOuCancelar} />
          <FGButton title="Confirmar importação" onPress={onConfirmarPress} loading={salvando} disabled={salvando || !payload} />
        </View>

        <View style={{ height: 6 }} />
      </FGScrollScreen>

      {/* Modal edição item */}
      <Modal visible={modalEdicao} transparent animationType="fade" onRequestClose={() => setModalEdicao(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Editar lançamento</Text>
              <Pressable onPress={() => setModalEdicao(false)}>
                <Text style={styles.modalClose}>Fechar</Text>
              </Pressable>
            </View>

            <Text style={styles.modalLabel}>Data</Text>
            <FGInput value={editData} onChangeText={setEditData} editable={!salvando} placeholder="AAAA-MM-DD" />

            <View style={{ height: 12 }} />

            <Text style={styles.modalLabel}>Descrição</Text>
            <FGInput value={editDescricao} onChangeText={setEditDescricao} editable={!salvando} />

            <View style={{ height: 12 }} />

            <View style={styles.modalFieldRow}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={styles.modalLabel}>Valor</Text>
                <FGInput value={editValor} onChangeText={setEditValor} keyboardType="decimal-pad" editable={!salvando} />
              </View>
              <View>
                <Text style={styles.modalLabel}>Tipo</Text>
                <View style={[styles.chipsRow, { marginTop: 2 }]}>
                  <Pressable style={[styles.chip, editTipo === 'despesa' && styles.chipActive]} onPress={() => setEditTipo('despesa')} disabled={salvando}>
                    <Text style={[styles.chipText, editTipo === 'despesa' && styles.chipTextActive]}>Despesa</Text>
                  </Pressable>
                  <Pressable style={[styles.chip, editTipo === 'receita' && styles.chipActive]} onPress={() => setEditTipo('receita')} disabled={salvando}>
                    <Text style={[styles.chipText, editTipo === 'receita' && styles.chipTextActive]}>Crédito</Text>
                  </Pressable>
                </View>
              </View>
            </View>

            <View style={{ height: 12 }} />

            <Text style={styles.modalLabel}>Categoria</Text>
            <FGSelect
              valueText={
                editCategoriaId
                  ? `${categoriasMap.get(editCategoriaId)?.grupo} • ${categoriasMap.get(editCategoriaId)?.subgrupo}`
                  : 'Selecionar categoria'
              }
              filled={!!editCategoriaId}
              onPress={() => {
                setBuscaCategoria('');
                setModalCategoria(true);
              }}
              disabled={salvando}
            />

            <View style={{ height: 12 }} />

            <View style={styles.actionsModal}>
              <FGButton title="Cancelar" variant="secondary" onPress={() => setModalEdicao(false)} disabled={salvando} />
              <FGButton title="Salvar item" onPress={salvarEdicaoItem} disabled={salvando} />
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal selecionar categoria */}
      <Modal visible={modalCategoria} transparent animationType="fade" onRequestClose={() => setModalCategoria(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Selecionar categoria</Text>
              <Pressable onPress={() => setModalCategoria(false)}>
                <Text style={styles.modalClose}>Fechar</Text>
              </Pressable>
            </View>

            <FGInput placeholder="Buscar categoria..." value={buscaCategoria} onChangeText={setBuscaCategoria} editable={!salvando} />

            <View style={{ height: 10 }} />

            <ScrollView style={{ maxHeight: 420 }}>
              <Pressable
                style={[styles.optionRow, !editCategoriaId && styles.optionRowActive]}
                onPress={() => {
                  setEditCategoriaId(null);
                  setModalCategoria(false);
                }}
                disabled={salvando}
              >
                <Text style={styles.optionTitle}>Sem categoria</Text>
                {!editCategoriaId ? <Text style={styles.optionCheck}>✓</Text> : null}
              </Pressable>

              {categoriasFiltradasModal.map((c) => {
                const ativo = editCategoriaId === c.id;
                return (
                  <Pressable
                    key={c.id}
                    style={[styles.optionRow, ativo && styles.optionRowActive]}
                    onPress={() => {
                      setEditCategoriaId(c.id);
                      setModalCategoria(false);
                    }}
                    disabled={salvando}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.optionTitle}>
                        {c.grupo} • {c.subgrupo}
                      </Text>
                      {c.tipo_permitido || c.tipo ? (
                        <Text style={styles.optionMeta}>Permitido: {String(c.tipo_permitido ?? c.tipo ?? 'ambos')}</Text>
                      ) : null}
                    </View>
                    {ativo ? <Text style={styles.optionCheck}>✓</Text> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  progressTitle: { color: fg.colors.text, fontWeight: '900', fontSize: 13 },
  progressHint: { marginTop: 4, color: fg.colors.muted, fontWeight: '800', fontSize: 12 },

  duasColunasRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start' },
  colunaEsquerda: { flex: 1, minWidth: 260 },
  colunaDireita: { flex: 1, minWidth: 260 },

  resumoRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  resumoLabel: { color: fg.colors.muted, fontWeight: '800', fontSize: 13, flex: 1, paddingRight: 12 },
  resumoLabelBig: { color: fg.colors.text, fontWeight: '900', fontSize: 14, flex: 1, paddingRight: 12 },
  resumoValor: { color: fg.colors.text, fontWeight: '900', fontSize: 14, textAlign: 'right', minWidth: 130 },
  resumoValorBig: { fontWeight: '900', fontSize: 20, textAlign: 'right', minWidth: 130 },
  resumoDivider: { height: 1, backgroundColor: fg.colors.border, marginVertical: 6, opacity: 0.6 },

  diffPill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderWidth: 1,
  },
  diffPillOk: { backgroundColor: 'rgba(74,222,128,0.1)', borderColor: 'rgba(74,222,128,0.3)' },
  diffPillWarn: { backgroundColor: 'rgba(248,113,113,0.1)', borderColor: 'rgba(248,113,113,0.3)' },
  diffPillText: { fontWeight: '900', fontSize: 13 },

  pos: { color: fg.colors.accent },
  neg: { color: fg.colors.danger },

  cardTitle: { color: fg.colors.text, fontWeight: '900', fontSize: 13, marginBottom: 8 },
  label: { color: fg.colors.text, fontWeight: '900', fontSize: 13, marginBottom: 6 },
  hint: { color: fg.colors.muted, fontSize: 12, fontWeight: '800' },
  hintStrong: { color: fg.colors.text, fontWeight: '900' },

  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  filterInline: { marginTop: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },

  emptyText: { color: fg.colors.muted, fontSize: 13, fontWeight: '800' },

  listItem: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingHorizontal: 12, paddingVertical: 12 },
  listItemPressed: { backgroundColor: 'rgba(255,255,255,0.04)' },

  listLeft: { flex: 1 },
  listRight: { alignItems: 'flex-end', justifyContent: 'center' },

  listTitle: { color: fg.colors.text, fontWeight: '900', fontSize: 13 },
  metaRow: { marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  listMeta: { color: fg.colors.muted, fontSize: 11, fontWeight: '800' },
  listValue: { fontWeight: '900', fontSize: 13 },

  editPill: {
    marginTop: 8,
    backgroundColor: fg.colors.surface2,
    borderRadius: fg.radius.pill,
    borderWidth: 1,
    borderColor: fg.colors.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  editPillText: { color: fg.colors.text, fontWeight: '900', fontSize: 11 },

  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },

  chipsRow: { flexDirection: 'row', gap: 8 },
  chip: {
    backgroundColor: fg.colors.surface2,
    borderColor: fg.colors.border,
    borderWidth: 1,
    borderRadius: fg.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  chipActive: { backgroundColor: fg.colors.accent, borderColor: 'rgba(34,211,139,0.35)' },
  chipText: { color: fg.colors.text, fontSize: 12, fontWeight: '900', opacity: 0.9 },
  chipTextActive: { color: fg.colors.bg, opacity: 1 },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 16 },
  modalCard: {
    backgroundColor: fg.colors.surface,
    borderRadius: fg.radius.lg,
    borderWidth: 1,
    borderColor: fg.colors.border,
    padding: 20,
    maxWidth: 520,
    width: '100%',
    alignSelf: 'center',
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: fg.colors.border },
  modalTitle: { fontSize: 16, fontWeight: '900', color: fg.colors.text },
  modalClose: { color: fg.colors.accent, fontWeight: '900', fontSize: 13 },
  modalLabel: { color: fg.colors.muted, fontWeight: '800', fontSize: 11, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.5 },
  modalFieldRow: { flexDirection: 'row', alignItems: 'flex-start' },

  actionsModal: { flexDirection: 'row', gap: 10, marginTop: 4 },

  optionRow: {
    borderWidth: 1,
    borderColor: fg.colors.borderSoft,
    borderRadius: fg.radius.md,
    padding: 10,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: fg.colors.surface2,
  },
  optionRowActive: { borderColor: 'rgba(34,211,139,0.45)' },
  optionTitle: { color: fg.colors.text, fontWeight: '900', fontSize: 13, flex: 1 },
  optionMeta: { marginTop: 4, color: fg.colors.muted, fontSize: 12, fontWeight: '800' },
  optionCheck: { color: fg.colors.accent, fontWeight: '900', fontSize: 16 },
});