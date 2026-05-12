// src/screens/lancamentos/EditarLancamentoScreen.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  DeviceEventEmitter,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { fg } from '../../theme/fgTheme';

type RouteParams = { id: string };

type GrupoAtivo = {
  grupo_id: string;
  papel: 'owner' | 'viewer';
  nome_grupo: string;
};

type Conta = {
  id: string;
  nome: string;
  tipo?: string | null;
};

type Categoria = {
  id: string;
  nome?: string | null;
  tipo?: string | null;
  grupo?: string | null;
  subgrupo?: string | null;
};

type TipoLanc = 'despesa' | 'receita' | 'transferencia';

type Transacao = {
  id: string;
  transferencia_id: string | null;
  grupo_id: string;
  usuario_id: string | null;

  conta_id: string | null;
  data_despesa: string | null;
  data_caixa: string | null;

  descricao: string | null;
  valor: number | null;

  tipo: TipoLanc | null;
  status: string | null;
  origem: string | null;
  categoria_id: string | null;

  eh_parcela?: boolean | null;
  parcelamento_id?: string | null;
};

function onlyDigitsMoneyToNumber(v: string) {
  const s = (v || '').trim();
  if (!s) return 0;
  const normalized = s
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^0-9.-]/g, '');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(v?: number | null) {
  const n = Number(v || 0);
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
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

function dataCaixaFromContaTipo(dataDespesaYmd: string, contaTipo?: string | null) {
  const dt = parseYmd(dataDespesaYmd);
  if (!dt) return dataDespesaYmd;
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  if ((contaTipo || '').toLowerCase() === 'cartao') return `${y}-${m}-28`;
  return dataDespesaYmd;
}

function pickFirstString(obj: any, keys: string[]) {
  for (const k of keys) {
    const v = obj?.[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

function normalizeText(v?: string | null) {
  return (v || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim();
}

function toValorTxt(n: number) {
  const v = Math.abs(Number(n || 0));
  const s = String(v);
  return s.includes('.') ? s.replace('.', ',') : s;
}

const SIMILARIDADE_THRESHOLD = 0.6;

// Termos genéricos de transações financeiras que não identificam o lançamento
const STOPWORDS_FINANCEIRAS = new Set([
  'pix', 'ted', 'doc', 'transf', 'transferencia', 'transferência',
  'pag', 'pagto', 'pagamento', 'pgto', 'boleto',
  'dep', 'deposito', 'depósito', 'saque',
  'compra', 'deb', 'debito', 'débito', 'cred', 'credito', 'crédito',
  'tarifa', 'taxa', 'iof', 'stf',
]);

function tokenize(s: string): Set<string> {
  return new Set(
    normalizeText(s)
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS_FINANCEIRAS.has(w))
  );
}

function calcSimilaridade(a: string, b: string): number {
  const sa = tokenize(a);
  const sb = tokenize(b);
  // se ambos ficam sem tokens identificadores após remover stopwords, sem match
  if (sa.size === 0 || sb.size === 0) return 0;
  let intersect = 0;
  sa.forEach((w) => { if (sb.has(w)) intersect++; });
  // exige ao menos 1 token identificador em comum
  if (intersect === 0) return 0;
  return intersect / (sa.size + sb.size - intersect);
}

async function aplicarCategoriaEmSimilares(
  grupoId: string,
  descricaoRef: string,
  idExcluir: string,
  catId: string,
  catGrupo: string | null,
  catSubgrupo: string | null,
  catLabel: string
): Promise<void> {
  const { data, error } = await supabase
    .from('transacoes')
    .select('id, descricao, valor, tipo')
    .eq('grupo_id', grupoId)
    .or('categoria_id.is.null,subgrupo.eq.Não categorizado')
    .neq('id', idExcluir)
    .limit(5000);

  if (error || !data || data.length === 0) return;

  const similares = (data as any[]).filter(
    (t) => calcSimilaridade(t.descricao || '', descricaoRef) >= SIMILARIDADE_THRESHOLD
  );

  if (similares.length === 0) return;

  const MAX_PREVIEW = 8;
  const preview = similares
    .slice(0, MAX_PREVIEW)
    .map((t: any) => {
      const desc = (t.descricao || '(sem descrição)').trim();
      const sinal = String(t.tipo || '').toLowerCase() === 'receita' ? '+' : '-';
      const val = formatMoney(Math.abs(Number(t.valor || 0)));
      return `• ${desc}  ${sinal}${val}`;
    })
    .join('\n');
  const rodape = similares.length > MAX_PREVIEW
    ? `\n  ... e mais ${similares.length - MAX_PREVIEW} lançamento(s)`
    : '';

  const confirmMsg =
    `${similares.length} lançamento(s) similar(es) sem categoria:\n\n${preview}${rodape}\n\nAplicar "${catLabel}" a todos?`;

  const ok =
    Platform.OS === 'web'
      ? window.confirm(confirmMsg)
      : await new Promise<boolean>((resolve) => {
          Alert.alert('Auto-categorização', confirmMsg, [
            { text: 'Ignorar', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Aplicar a todos', onPress: () => resolve(true) },
          ]);
        });

  if (!ok) return;

  const ids = similares.map((t: any) => t.id);
  const CHUNK = 200;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    await supabase
      .from('transacoes')
      .update({ categoria_id: catId, grupo: catGrupo, subgrupo: catSubgrupo })
      .in('id', chunk)
      .eq('grupo_id', grupoId);
  }
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
  const bg =
    (fg as any)?.colors?.card ||
    (fg as any)?.colors?.surface ||
    'rgba(255,255,255,0.06)';
  const border = (fg as any)?.colors?.border || 'rgba(255,255,255,0.10)';

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
  variant,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'ghost' | 'danger';
}) {
  const accent = (fg as any)?.colors?.accent || 'rgba(234,246,251,0.18)';
  const danger = (fg as any)?.colors?.danger || '#ef4444';
  const border = (fg as any)?.colors?.border || 'rgba(255,255,255,0.14)';
  const textOnAccent = (fg as any)?.colors?.bg || '#0b1220';
  const text = (fg as any)?.colors?.text || '#EAF6FB';

  const isDanger = variant === 'danger';
  const isGhost = variant === 'ghost';

  const bg = isDanger ? danger : isGhost ? 'transparent' : accent;
  const tx = isDanger ? '#fff' : isGhost ? text : textOnAccent;
  const bd = isGhost ? border : 'transparent';

  return (
    <Pressable
      onPress={onPress}
      disabled={!!disabled}
      style={({ pressed }) => [
        {
          backgroundColor: bg,
          borderColor: bd,
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
      <Text style={{ color: tx, fontWeight: '900', fontSize: 12 }}>{title}</Text>
    </Pressable>
  );
}

function Input({
  label,
  placeholder,
  value,
  onChangeText,
  keyboardType,
}: {
  label?: string;
  placeholder?: string;
  value: string;
  onChangeText: (v: string) => void;
  keyboardType?: any;
}) {
  const border = (fg as any)?.colors?.border || 'rgba(255,255,255,0.14)';
  const bg =
    (fg as any)?.colors?.input ||
    (fg as any)?.colors?.surface2 ||
    'rgba(0,0,0,0.18)';

  return (
    <View>
      {label ? (
        <Text style={{ color: fg.colors.muted, fontWeight: '900', fontSize: 12, marginBottom: 6 }}>
          {label}
        </Text>
      ) : null}
      <TextInput
        placeholder={placeholder}
        placeholderTextColor={(fg as any)?.colors?.muted || 'rgba(234,246,251,0.55)'}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        style={[
          {
            borderColor: 'rgba(74,222,128,0.35)',
            borderWidth: 1,
            backgroundColor: bg,
            borderRadius: 12,
            paddingHorizontal: 12,
            paddingVertical: Platform.OS === 'web' ? 10 : 12,
            color: (fg as any)?.colors?.text || '#EAF6FB',
            fontWeight: '800',
            fontSize: 13,
          },
        ]}
      />
    </View>
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
  const border = (fg as any)?.colors?.border || 'rgba(255,255,255,0.14)';
  const bg =
    active
      ? (fg as any)?.colors?.accent || 'rgba(234,246,251,0.18)'
      : (fg as any)?.colors?.surface2 || 'rgba(255,255,255,0.06)';
  const text = active
    ? (fg as any)?.colors?.bg || '#0b1220'
    : (fg as any)?.colors?.text || '#EAF6FB';

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

type SelectOpt = { value: string; label: string; subtitle?: string };

function Select({
  label,
  value,
  placeholder,
  options,
  onChange,
  disabled,
  searchable,
  searchPlaceholder,
}: {
  label?: string;
  value: string | null;
  placeholder?: string;
  options: SelectOpt[];
  onChange: (v: string) => void;
  disabled?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');

  const border = (fg as any)?.colors?.border || 'rgba(255,255,255,0.14)';
  const bg =
    (fg as any)?.colors?.input ||
    (fg as any)?.colors?.surface2 ||
    'rgba(0,0,0,0.18)';

  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (open) setQ('');
  }, [open]);

  const filtered = useMemo(() => {
    if (!searchable) return options;
    const qq = normalizeText(q);
    if (!qq) return options;
    return options.filter((o) => normalizeText(`${o.label} ${o.subtitle || ''}`).includes(qq));
  }, [options, q, searchable]);

  return (
    <View>
      {label ? (
        <Text style={{ color: fg.colors.muted, fontWeight: '900', fontSize: 12, marginBottom: 6 }}>
          {label}
        </Text>
      ) : null}

      <Pressable
        onPress={() => {
          if (disabled) return;
          setOpen(true);
        }}
        style={({ pressed }) => [
          {
            borderColor: disabled ? border : 'rgba(74,222,128,0.35)',
            borderWidth: 1,
            backgroundColor: bg,
            borderRadius: 12,
            paddingHorizontal: 12,
            paddingVertical: 12,
            opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
            flexDirection: 'row',
            alignItems: 'center',
          },
        ]}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ color: fg.colors.text, fontWeight: '900', fontSize: 13 }}>
            {current?.label || placeholder || 'Selecionar...'}
          </Text>
          {current?.subtitle ? (
            <Text style={{ marginTop: 4, color: fg.colors.muted, fontWeight: '800', fontSize: 11 }}>
              {current.subtitle}
            </Text>
          ) : null}
        </View>
        <Text style={{ color: 'rgba(74,222,128,0.7)', fontSize: 14, marginLeft: 8 }}>▾</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>{label || 'Selecionar'}</Text>

            {searchable ? (
              <View style={styles.searchRow}>
                <TextInput
                  value={q}
                  onChangeText={setQ}
                  placeholder={searchPlaceholder || 'Buscar...'}
                  placeholderTextColor={(fg as any)?.colors?.muted || 'rgba(234,246,251,0.55)'}
                  autoFocus
                  style={styles.searchInput}
                />
                <Pressable onPress={() => setQ('')} style={({ pressed }) => [styles.clearBtn, pressed ? { opacity: 0.85 } : null]}>
                  <Text style={styles.clearBtnText}>Limpar</Text>
                </Pressable>
              </View>
            ) : null}

            {searchable ? <Text style={styles.searchHint}>{filtered.length} de {options.length}</Text> : null}

            <ScrollView style={{ maxHeight: 420 }}>
              {filtered.length === 0 ? (
                <View style={{ paddingVertical: 12 }}>
                  <Text style={{ color: fg.colors.muted, fontWeight: '900' }}>Nenhum resultado para “{q}”.</Text>
                </View>
              ) : (
                filtered.map((opt) => {
                  const active = opt.value === value;
                  return (
                    <Pressable
                      key={opt.value}
                      onPress={() => {
                        onChange(opt.value);
                        setOpen(false);
                      }}
                      style={({ pressed }) => [
                        styles.modalRow,
                        active ? styles.modalRowActive : null,
                        pressed ? { opacity: 0.85 } : null,
                      ]}
                    >
                      <Text style={[styles.modalRowText, active ? { color: fg.colors.accent } : null]}>{opt.label}</Text>
                      {opt.subtitle ? <Text style={styles.modalRowSub}>{opt.subtitle}</Text> : null}
                    </Pressable>
                  );
                })
              )}
            </ScrollView>

            <View style={{ height: 10 }} />
            <Button title="Fechar" variant="ghost" onPress={() => setOpen(false)} />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

/** ---------- Screen ---------- */

export default function EditarLancamentoScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { id } = (route.params || {}) as RouteParams;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [grupoAtivo, setGrupoAtivo] = useState<GrupoAtivo | null>(null);
  const [contas, setContas] = useState<Conta[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);

  const [original, setOriginal] = useState<Transacao | null>(null);
  const [transferenciaIdOriginal, setTransferenciaIdOriginal] = useState<string | null>(null);

  const [tipo, setTipo] = useState<TipoLanc>('despesa');
  const [contaId, setContaId] = useState<string | null>(null);
  const [contaDestinoId, setContaDestinoId] = useState<string | null>(null);
  const [categoriaId, setCategoriaId] = useState<string | null>(null);

  const [dataDespesa, setDataDespesa] = useState<string>('');
  const [dataCaixa, setDataCaixa] = useState<string>('');
  const [descricao, setDescricao] = useState<string>('');
  const [valorTxt, setValorTxt] = useState<string>('');

  const [statusConfirmada, setStatusConfirmada] = useState<boolean>(true);

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

  const carregarCategorias = useCallback(async (grupoId: string) => {
    const { data, error } = await supabase
      .from('categorias')
      .select('*')
      .eq('grupo_id', grupoId)
      .limit(5000);

    if (error) throw new Error(`Não foi possível carregar categorias. (${error.message})`);

    const rows = (data || []) as any[];

    const mapped: Categoria[] = rows.map((r) => {
      const nome = pickFirstString(r, ['nome', 'name', 'descricao', 'descrição', 'titulo', 'title', 'categoria', 'label']) || '';
      const tipo = pickFirstString(r, ['tipo', 'type', 'natureza', 'natureza_tipo']) || null;
      const grupo = pickFirstString(r, ['grupo', 'group', 'grupo_nome', 'categoria_grupo', 'grupo_categoria']) || null;
      const subgrupo =
        pickFirstString(r, ['subgrupo', 'sub_group', 'subgrupo_nome', 'categoria_subgrupo', 'subgrupo_categoria']) ||
        (nome || null);

      return { id: String(r.id), nome: nome || subgrupo || null, tipo, grupo, subgrupo };
    });

    mapped.sort((a, b) => {
      const ga = String(a.grupo || '').trim().toLowerCase();
      const gb = String(b.grupo || '').trim().toLowerCase();
      if (ga !== gb) return ga.localeCompare(gb, 'pt-BR');
      const sa = String(a.subgrupo || a.nome || '').trim().toLowerCase();
      const sb = String(b.subgrupo || b.nome || '').trim().toLowerCase();
      return sa.localeCompare(sb, 'pt-BR');
    });

    setCategorias(mapped);
  }, []);

  const carregarTransacao = useCallback(async (grupoId: string) => {
    const { data, error } = await supabase
      .from('transacoes')
      .select('*')
      .eq('grupo_id', grupoId)
      .eq('id', id)
      .single();

    if (error) throw new Error(`Não foi possível carregar lançamento. (${error.message})`);

    const row = data as any as Transacao;
    setOriginal(row);
    setTransferenciaIdOriginal(row.transferencia_id || null);

    if ((row.tipo || '').toLowerCase() === 'transferencia' && row.transferencia_id) {
      const { data: legs, error: legsErr } = await supabase
        .from('transacoes')
        .select('id, conta_id, valor, descricao, data_despesa, data_caixa, status, tipo, created_at')
        .eq('grupo_id', grupoId)
        .eq('transferencia_id', row.transferencia_id)
        .limit(10);

      if (legsErr) throw new Error(`Não foi possível carregar transferência. (${legsErr.message})`);

      const arr = (legs || []) as any[];
      const neg = arr.find((x) => Number(x.valor || 0) < 0) || arr[0];
      const pos = arr.find((x) => Number(x.valor || 0) > 0) || arr[arr.length - 1];

      setTipo('transferencia');
      setContaId(neg?.conta_id || null);
      setContaDestinoId(pos?.conta_id || null);
      setCategoriaId(null);

      const dd = (neg?.data_despesa || pos?.data_despesa || row.data_despesa || row.data_caixa || '') as string;
      setDataDespesa(dd ? String(dd).slice(0, 10) : '');
      setDataCaixa(dd ? String(dd).slice(0, 10) : '');

      const desc = (neg?.descricao || pos?.descricao || row.descricao || '') as string;
      setDescricao(desc || '');

      setValorTxt(toValorTxt(Math.abs(Number(neg?.valor || pos?.valor || row.valor || 0))));
      const st = String(neg?.status || pos?.status || row.status || 'confirmada');
      setStatusConfirmada(st !== 'pendente');

      return;
    }

    const t = (row.tipo || 'despesa') as TipoLanc;
    setTipo(t);
    setContaId(row.conta_id || null);
    setContaDestinoId(null);
    setCategoriaId(row.categoria_id || null);

    const dd = (row.data_despesa || row.data_caixa || '') as string;
    setDataDespesa(dd ? String(dd).slice(0, 10) : '');

    const dc = (row.data_caixa || '') as string;
    setDataCaixa(dc ? String(dc).slice(0, 10) : (dd ? String(dd).slice(0, 10) : ''));

    setDescricao(row.descricao || '');
    setValorTxt(toValorTxt(Math.abs(Number(row.valor || 0))));

    const st = String(row.status || 'confirmada');
    setStatusConfirmada(st !== 'pendente');
  }, [id]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const grupo = await carregarGrupoAtivo();
        setGrupoAtivo(grupo);

        await Promise.all([carregarContas(grupo.grupo_id), carregarCategorias(grupo.grupo_id)]);
        await carregarTransacao(grupo.grupo_id);
      } catch (e: any) {
        console.log('ERRO EditarLancamento carregar:', e);
        const msg = e?.message || 'Erro ao carregar edição.';
        if (Platform.OS === 'web') window.alert(msg);
        else Alert.alert('Erro', msg);
        navigation.goBack();
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [carregarGrupoAtivo, carregarContas, carregarCategorias, carregarTransacao, navigation]);

  const contaOrigem = useMemo(
    () => (contaId ? contas.find((c) => c.id === contaId) || null : null),
    [contaId, contas]
  );

  const categoriaSelecionada = useMemo(
    () => (categoriaId ? categorias.find((c) => c.id === categoriaId) || null : null),
    [categoriaId, categorias]
  );
  const contaDestino = useMemo(
    () => (contaDestinoId ? contas.find((c) => c.id === contaDestinoId) || null : null),
    [contaDestinoId, contas]
  );

  const categoriasFiltradas = useMemo(() => {
    if (tipo === 'transferencia') return [];
    const alvo = tipo === 'despesa' ? 'despesa' : 'receita';
    // categoria sem tipo definido → aparece para receita e despesa
    return categorias.filter((c) => !c.tipo || (c.tipo || '').toLowerCase() === alvo);
  }, [categorias, tipo]);

  const contasOpts = useMemo<SelectOpt[]>(
    () =>
      contas.map((c) => ({
        value: c.id,
        label: c.nome,
        subtitle: c.tipo ? `Tipo: ${c.tipo}` : undefined,
      })),
    [contas]
  );

  const contaDestinoOpts = useMemo<SelectOpt[]>(
    () =>
      contas
        .filter((c) => !contaId || c.id !== contaId)
        .map((c) => ({
          value: c.id,
          label: c.nome,
          subtitle: c.tipo ? `Tipo: ${c.tipo}` : undefined,
        })),
    [contas, contaId]
  );

  const categoriasOpts = useMemo<SelectOpt[]>(
    () =>
      categoriasFiltradas.map((c) => {
        const grupo = (c.grupo || '').trim();
        const sub = (c.subgrupo || '').trim();
        const titulo = sub || (c.nome || '').trim() || 'Categoria';
        const subTitulo = grupo && sub ? `${grupo} • ${sub}` : grupo ? grupo : sub ? sub : undefined;
        return { value: c.id, label: titulo, subtitle: subTitulo };
      }),
    [categoriasFiltradas]
  );

  useEffect(() => {
    if (tipo === 'transferencia') {
      setCategoriaId(null);
      if (!descricao.trim()) setDescricao('Pagamento de fatura');
    } else {
      setContaDestinoId(null);
    }
  }, [tipo]);

  useEffect(() => {
    if (tipo === 'transferencia' && (contaDestino?.tipo || '').toLowerCase() === 'cartao') {
      if (!descricao.trim() || descricao.trim().toLowerCase() === 'transferência') {
        setDescricao('Pagamento de fatura');
      }
    }
  }, [tipo, contaDestino?.tipo]);

  const excluir = async () => {
    if (deleting) return;
    if (isViewer) {
      const msg = 'Sem permissão: seu perfil é de visualização.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Sem permissão', msg);
      return;
    }
    if (!grupoAtivo?.grupo_id || !original) return;

    const ok = Platform.OS === 'web'
      ? window.confirm('Deseja excluir este lançamento? (se for transferência, apagará as 2 pernas)')
      : await new Promise<boolean>((resolve) => {
          Alert.alert('Excluir', 'Deseja excluir este lançamento? (se for transferência, apagará as 2 pernas)', [
            { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Excluir', style: 'destructive', onPress: () => resolve(true) },
          ]);
        });

    if (!ok) return;

    try {
      setDeleting(true);

      if (transferenciaIdOriginal) {
        const { error } = await supabase.rpc('excluir_transferencia', { p_transferencia_id: transferenciaIdOriginal });
        if (error) throw error;
      } else {
        const { error } = await supabase.from('transacoes').delete().eq('id', original.id).eq('grupo_id', grupoAtivo.grupo_id);
        if (error) throw error;
      }

      DeviceEventEmitter.emit('FG_REFRESH_ALL');
      navigation.goBack();
    } catch (e: any) {
      console.log('ERRO EditarLancamento excluir:', e);
      const msg = e?.message || 'Não foi possível excluir.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Erro', msg);
    } finally {
      setDeleting(false);
    }
  };

  const salvar = async () => {
    if (saving) return;
    if (isViewer) {
      const msg = 'Sem permissão: seu perfil é de visualização.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Sem permissão', msg);
      return;
    }
    if (!grupoAtivo?.grupo_id || !original) return;

    if (original.eh_parcela || original.parcelamento_id) {
      const msg = 'Este lançamento é parcela. Edição/conversão de parcelamento não está habilitada aqui.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Atenção', msg);
      return;
    }

    const dt = parseYmd(dataDespesa);
    if (!dt) {
      const msg = 'Data da despesa inválida. Use YYYY-MM-DD.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Erro', msg);
      return;
    }

    const isCartao = (contaOrigem?.tipo || '').toLowerCase() === 'cartao';
    if (tipo !== 'transferencia' && isCartao) {
      if (!parseYmd(dataCaixa)) {
        const msg = 'Data de caixa inválida. Use YYYY-MM-DD.';
        if (Platform.OS === 'web') window.alert(msg);
        else Alert.alert('Erro', msg);
        return;
      }
    }

    if (!contaId) {
      const msg = tipo === 'transferencia' ? 'Selecione a conta origem.' : 'Selecione a conta.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Erro', msg);
      return;
    }

    if (tipo === 'transferencia') {
      if (!contaDestinoId) {
        const msg = 'Selecione a conta destino.';
        if (Platform.OS === 'web') window.alert(msg);
        else Alert.alert('Erro', msg);
        return;
      }
      if (contaDestinoId === contaId) {
        const msg = 'Conta destino não pode ser igual à conta origem.';
        if (Platform.OS === 'web') window.alert(msg);
        else Alert.alert('Erro', msg);
        return;
      }
    } else {
      if (!categoriaId) {
        const msg = 'Selecione a categoria.';
        if (Platform.OS === 'web') window.alert(msg);
        else Alert.alert('Erro', msg);
        return;
      }
    }

    const valor = onlyDigitsMoneyToNumber(valorTxt);
    if (!valor || valor <= 0) {
      const msg = 'Informe um valor válido.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Erro', msg);
      return;
    }

    const desc = (descricao || '').trim();
    if (!desc) {
      const msg = 'Informe a descrição.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Erro', msg);
      return;
    }

    try {
      setSaving(true);

      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData?.user?.id) throw new Error('Usuário não autenticado.');
      const userId = authData.user.id;

      const status = statusConfirmada ? 'confirmada' : 'pendente';

      if (transferenciaIdOriginal && tipo !== 'transferencia') {
        const { error: delErr } = await supabase.rpc('excluir_transferencia', { p_transferencia_id: transferenciaIdOriginal });
        if (delErr) throw delErr;

        const ehCartao = (contaOrigem?.tipo || '').toLowerCase() === 'cartao';
        const dataCaixaFinal = ehCartao ? (dataCaixa || dataCaixaFromContaTipo(dataDespesa, 'cartao')) : dataDespesa;

        const row: any = {
          grupo_id: grupoAtivo.grupo_id,
          usuario_id: userId,
          conta_id: contaId,
          data_despesa: dataDespesa,
          data_caixa: dataCaixaFinal,
          descricao: desc,
          valor: Math.abs(valor),
          tipo: tipo,
          status: status,
          origem: original.origem || 'manual',
          categoria_id: categoriaId,
          grupo: categoriaSelecionada?.grupo || null,
          subgrupo: categoriaSelecionada?.subgrupo || null,
          transferencia_id: null,
          eh_parcela: false,
          parcelamento_id: null,
        };

        const { error: insErr } = await supabase.from('transacoes').insert([row]);
        if (insErr) throw insErr;

        if (categoriaId) {
          await aplicarCategoriaEmSimilares(
            grupoAtivo.grupo_id,
            desc,
            original.id,
            categoriaId,
            categoriaSelecionada?.grupo || null,
            categoriaSelecionada?.subgrupo || null,
            categoriaSelecionada?.subgrupo || categoriaSelecionada?.nome || 'Categoria'
          );
        }

        DeviceEventEmitter.emit('FG_REFRESH_ALL');
        navigation.goBack();
        return;
      }

      if (!transferenciaIdOriginal && tipo === 'transferencia') {
        const { error: delErr } = await supabase.from('transacoes').delete().eq('id', original.id).eq('grupo_id', grupoAtivo.grupo_id);
        if (delErr) throw delErr;

        const { error: rpcErr } = await supabase.rpc('criar_transferencia', {
          p_usuario_id: userId,
          p_data_caixa: dataDespesa,
          p_data_despesa: dataDespesa,
          p_conta_origem_id: contaId,
          p_conta_destino_id: contaDestinoId,
          p_descricao: desc,
          p_valor: Math.abs(valor),
          p_origem: original.origem || 'importacao',
          p_status: status,
          p_grupo_id: grupoAtivo.grupo_id,
        });
        if (rpcErr) throw rpcErr;

        DeviceEventEmitter.emit('FG_REFRESH_ALL');
        navigation.goBack();
        return;
      }

      if (transferenciaIdOriginal && tipo === 'transferencia') {
        const { error: delErr } = await supabase.rpc('excluir_transferencia', { p_transferencia_id: transferenciaIdOriginal });
        if (delErr) throw delErr;

        const { error: rpcErr } = await supabase.rpc('criar_transferencia', {
          p_usuario_id: userId,
          p_data_caixa: dataDespesa,
          p_data_despesa: dataDespesa,
          p_conta_origem_id: contaId,
          p_conta_destino_id: contaDestinoId,
          p_descricao: desc,
          p_valor: Math.abs(valor),
          p_origem: original.origem || 'manual',
          p_status: status,
          p_grupo_id: grupoAtivo.grupo_id,
        });
        if (rpcErr) throw rpcErr;

        DeviceEventEmitter.emit('FG_REFRESH_ALL');
        navigation.goBack();
        return;
      }

      const ehCartao = (contaOrigem?.tipo || '').toLowerCase() === 'cartao';
      const dataCaixaFinal = ehCartao ? (dataCaixa || dataCaixaFromContaTipo(dataDespesa, 'cartao')) : dataDespesa;

      const patch: any = {
        conta_id: contaId,
        data_despesa: dataDespesa,
        data_caixa: dataCaixaFinal,
        descricao: desc,
        valor: Math.abs(valor),
        tipo: tipo,
        status: status,
        categoria_id: categoriaId,
        grupo: categoriaSelecionada?.grupo || null,
        subgrupo: categoriaSelecionada?.subgrupo || null,
      };

      const { error: upErr } = await supabase.from('transacoes').update(patch).eq('id', original.id).eq('grupo_id', grupoAtivo.grupo_id);
      if (upErr) throw upErr;

      if (categoriaId) {
        await aplicarCategoriaEmSimilares(
          grupoAtivo.grupo_id,
          desc,
          original.id,
          categoriaId,
          categoriaSelecionada?.grupo || null,
          categoriaSelecionada?.subgrupo || null,
          categoriaSelecionada?.subgrupo || categoriaSelecionada?.nome || 'Categoria'
        );
      }

      DeviceEventEmitter.emit('FG_REFRESH_ALL');
      navigation.goBack();
    } catch (e: any) {
      console.log('ERRO EditarLancamento salvar:', e);
      const msg = e?.message || 'Não foi possível salvar.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Erro', msg);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.root, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={fg.colors.accent} />
        <Text style={{ marginTop: 10, color: fg.colors.muted, fontWeight: '900' }}>Carregando...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.container}>
      <Card>
        <Text style={styles.title}>Editar Lançamento</Text>
        <Text style={styles.subtitle}>{grupoAtivo?.nome_grupo || 'Minha Carteira'}</Text>
        <Text style={styles.info}>Perfil: {isViewer ? 'Viewer' : 'Owner'}</Text>
      </Card>

      <View style={{ height: 10 }} />

      <Card>
        <Text style={styles.sectionLabel}>Tipo</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          <Chip label="Despesa" active={tipo === 'despesa'} onPress={() => setTipo('despesa')} />
          <Chip label="Receita" active={tipo === 'receita'} onPress={() => setTipo('receita')} />
          <Chip label="Transferência" active={tipo === 'transferencia'} onPress={() => setTipo('transferencia')} />
        </View>
      </Card>

      <View style={{ height: 10 }} />

      <Card>
        <Select
          label={tipo === 'transferencia' ? 'Conta origem *' : 'Conta *'}
          value={contaId}
          placeholder="Selecionar conta"
          options={contasOpts}
          onChange={(v) => {
            setContaId(v);
            if (contaDestinoId === v) setContaDestinoId(null);
          }}
          disabled={saving}
          searchable
          searchPlaceholder="Buscar conta..."
        />
        {contaOrigem?.tipo ? <Text style={styles.helper}>Tipo da conta: {contaOrigem.tipo}</Text> : null}
      </Card>

      <View style={{ height: 10 }} />

      {tipo === 'transferencia' ? (
        <Card>
          <Select
            label="Conta destino *"
            value={contaDestinoId}
            placeholder="Selecionar conta destino"
            options={contaDestinoOpts}
            onChange={setContaDestinoId}
            disabled={saving || !contaId}
            searchable
            searchPlaceholder="Buscar conta destino..."
          />
          <Text style={styles.helper}>Transferência cria 2 lançamentos (origem negativo / destino positivo).</Text>
        </Card>
      ) : (
        <Card>
          <Select
            label="Categoria *"
            value={categoriaId}
            placeholder="Selecionar categoria"
            options={categoriasOpts}
            onChange={setCategoriaId}
            disabled={saving}
            searchable
            searchPlaceholder="Buscar categoria..."
          />
        </Card>
      )}

      <View style={{ height: 10 }} />

      <Card>
        <Input
          label="Data da Despesa *"
          placeholder="YYYY-MM-DD"
          value={dataDespesa}
          onChangeText={setDataDespesa}
          keyboardType={Platform.OS === 'web' ? 'default' : 'numbers-and-punctuation'}
        />
        {tipo !== 'transferencia' && (contaOrigem?.tipo || '').toLowerCase() === 'cartao' ? (
          <>
            <View style={{ height: 12 }} />
            <Input
              label="Data de Caixa — pagamento da fatura *"
              placeholder="YYYY-MM-DD"
              value={dataCaixa}
              onChangeText={setDataCaixa}
              keyboardType={Platform.OS === 'web' ? 'default' : 'numbers-and-punctuation'}
            />
            <Text style={styles.helper}>
              Data em que o dinheiro sai da conta (pagamento da fatura do cartão).
            </Text>
          </>
        ) : (
          <Text style={styles.helper}>
            {tipo === 'transferencia'
              ? 'Transferência: Data de Caixa = Data da Despesa.'
              : 'Data de Caixa seguirá a Data da Despesa.'}
          </Text>
        )}
      </Card>

      <View style={{ height: 10 }} />

      <Card>
        <Input label="Descrição *" placeholder="Ex.: Pagamento de fatura" value={descricao} onChangeText={setDescricao} />
        <View style={{ height: 10 }} />
        <Input
          label="Valor *"
          placeholder="Ex.: 123,45"
          value={valorTxt}
          onChangeText={setValorTxt}
          keyboardType={Platform.OS === 'web' ? 'default' : 'numeric'}
        />
        <Text style={styles.helper}>Prévia: {formatMoney(onlyDigitsMoneyToNumber(valorTxt))}</Text>
      </Card>

      <View style={{ height: 10 }} />

      <Card>
        <View style={styles.rowBetween}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionLabel}>Status</Text>
            <Text style={styles.helper}>{statusConfirmada ? 'Confirmada' : 'Pendente'}</Text>
          </View>
          <Switch value={statusConfirmada} onValueChange={setStatusConfirmada} disabled={saving} />
        </View>
      </Card>

      <View style={{ height: 14 }} />

      <View style={{ flexDirection: 'row' }}>
        <View style={{ flex: 1, marginRight: 10 }}>
          <Button title={deleting ? 'Excluindo...' : 'Excluir'} variant="danger" onPress={excluir} disabled={saving || deleting} />
        </View>
        <View style={{ flex: 1, marginRight: 10 }}>
          <Button title="Cancelar" variant="ghost" onPress={() => navigation.goBack()} disabled={saving || deleting} />
        </View>
        <View style={{ flex: 1 }}>
          <Button title={saving ? 'Salvando...' : 'Salvar'} onPress={salvar} disabled={saving || deleting} />
        </View>
      </View>

      <View style={{ height: 18 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: (fg as any)?.colors?.bg || '#0b1220' },
  container: { padding: 14, paddingBottom: 24 },

  title: { color: fg.colors.text, fontWeight: '900', fontSize: 18 },
  subtitle: { marginTop: 4, color: fg.colors.muted, fontWeight: '900', fontSize: 12 },
  info: { marginTop: 6, color: fg.colors.muted, fontWeight: '800', fontSize: 11 },

  sectionLabel: { color: fg.colors.muted, fontWeight: '900', fontSize: 12, marginBottom: 6 },
  helper: { marginTop: 8, color: fg.colors.muted, fontWeight: '800', fontSize: 11 },

  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: (fg as any)?.colors?.card || (fg as any)?.colors?.surface || '#101827',
    borderColor: (fg as any)?.colors?.border || 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
  },
  modalTitle: { color: fg.colors.text, fontWeight: '900', fontSize: 14, marginBottom: 10 },
  modalRow: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    marginBottom: 8,
  },
  modalRowActive: {
    borderColor: (fg as any)?.colors?.accent || '#22c55e',
    backgroundColor: 'rgba(34,197,94,0.10)',
  },
  modalRowText: { color: fg.colors.text, fontWeight: '900', fontSize: 13 },
  modalRowSub: { marginTop: 4, color: fg.colors.muted, fontWeight: '800', fontSize: 11 },

  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: (fg as any)?.colors?.border || 'rgba(255,255,255,0.14)',
    backgroundColor: (fg as any)?.colors?.surface2 || 'rgba(0,0,0,0.18)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'web' ? 10 : 12,
    color: fg.colors.text,
    fontWeight: '800',
    fontSize: 13,
  },
  clearBtn: {
    borderWidth: 1,
    borderColor: (fg as any)?.colors?.border || 'rgba(255,255,255,0.14)',
    backgroundColor: 'transparent',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  clearBtnText: { color: fg.colors.text, fontWeight: '900', fontSize: 12 },
  searchHint: { color: fg.colors.muted, fontWeight: '800', fontSize: 11, marginBottom: 8 },
});