// src/screens/lancamentos/LancamentoManualScreen.tsx
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
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { fg } from '../../theme/fgTheme';

type GrupoAtivo = {
  grupo_id: string;
  papel: 'owner' | 'viewer';
  nome_grupo: string;
};

type Conta = {
  id: string;
  nome: string;
  tipo?: string | null; // 'banco' | 'cartao' | null
};

type Categoria = {
  id: string;
  nome?: string | null;
  tipo?: string | null;
  grupo?: string | null;
  subgrupo?: string | null;
};

type TipoLanc = 'despesa' | 'receita' | 'transferencia';

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

function yyyyMmDd(d: Date) {
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

function addMonths(base: Date, months: number) {
  const d = new Date(base.getFullYear(), base.getMonth() + months, 1);
  const day = Math.min(base.getDate(), new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate());
  d.setDate(day);
  return d;
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
            borderColor: border,
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
    return options.filter((o) => {
      const hay = `${o.label} ${o.subtitle || ''}`;
      return normalizeText(hay).includes(qq);
    });
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
            borderColor: border,
            borderWidth: 1,
            backgroundColor: bg,
            borderRadius: 12,
            paddingHorizontal: 12,
            paddingVertical: 12,
            opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
          },
        ]}
      >
        <Text style={{ color: fg.colors.text, fontWeight: '900', fontSize: 13 }}>
          {current?.label || placeholder || 'Selecionar...'}
        </Text>
        {current?.subtitle ? (
          <Text style={{ marginTop: 4, color: fg.colors.muted, fontWeight: '800', fontSize: 11 }}>
            {current.subtitle}
          </Text>
        ) : null}
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
                <Pressable
                  onPress={() => setQ('')}
                  style={({ pressed }) => [styles.clearBtn, pressed ? { opacity: 0.85 } : null]}
                >
                  <Text style={styles.clearBtnText}>Limpar</Text>
                </Pressable>
              </View>
            ) : null}

            {searchable ? (
              <Text style={styles.searchHint}>
                {filtered.length} de {options.length}
              </Text>
            ) : null}

            <ScrollView style={{ maxHeight: 420 }}>
              {filtered.length === 0 ? (
                <View style={{ paddingVertical: 12 }}>
                  <Text style={{ color: fg.colors.muted, fontWeight: '900' }}>
                    Nenhum resultado para “{q}”.
                  </Text>
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
                      <Text style={[styles.modalRowText, active ? { color: fg.colors.accent } : null]}>
                        {opt.label}
                      </Text>
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

export default function LancamentoManualScreen() {
  const navigation = useNavigation<any>();

  const [loading, setLoading] = useState(true);

  const [grupoAtivo, setGrupoAtivo] = useState<GrupoAtivo | null>(null);
  const [contas, setContas] = useState<Conta[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);

  const [contaId, setContaId] = useState<string | null>(null);
  const [contaDestinoId, setContaDestinoId] = useState<string | null>(null);

  const [tipo, setTipo] = useState<TipoLanc>('despesa');
  const [categoriaId, setCategoriaId] = useState<string | null>(null);

  const [dataDespesa, setDataDespesa] = useState<string>(yyyyMmDd(new Date()));

  const [descricao, setDescricao] = useState<string>('');
  const [valorTxt, setValorTxt] = useState<string>('');

  const [statusConfirmada, setStatusConfirmada] = useState<boolean>(true);

  const [ehParcela, setEhParcela] = useState<boolean>(false);
  const [totalParcelasTxt, setTotalParcelasTxt] = useState<string>('2');

  const [saving, setSaving] = useState<boolean>(false);

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

    // ordena por GRUPO, depois por SUBGRUPO/NOME
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

  const carregarTela = useCallback(async () => {
    const grupo = await carregarGrupoAtivo();
    setGrupoAtivo(grupo);
    await Promise.all([carregarContas(grupo.grupo_id), carregarCategorias(grupo.grupo_id)]);
  }, [carregarGrupoAtivo, carregarContas, carregarCategorias]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        await carregarTela();
      } catch (e: any) {
        console.log('ERRO LancamentoManual carregarTela:', e);
        const msg = e?.message || 'Erro ao carregar tela.';
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
  }, [carregarTela, navigation]);

  const contaOrigem = useMemo(
    () => (contaId ? contas.find((c) => c.id === contaId) || null : null),
    [contaId, contas]
  );
  const contaDestino = useMemo(
    () => (contaDestinoId ? contas.find((c) => c.id === contaDestinoId) || null : null),
    [contaDestinoId, contas]
  );

  const categoriasFiltradas = useMemo(() => {
    if (tipo === 'transferencia') return [];
    const t = tipo === 'despesa' ? 'despesa' : 'receita';
    const hasTipo = categorias.some((c) => !!c.tipo);
    if (!hasTipo) return categorias;
    return categorias.filter((c) => (c.tipo || '').toLowerCase() === t);
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

  // label = subgrupo/nome | subtitle = grupo • subgrupo
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
      setEhParcela(false);
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

  const salvar = async () => {
    if (saving) return;
    if (isViewer) {
      const msg = 'Sem permissão: seu perfil é de visualização.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Sem permissão', msg);
      return;
    }

    const dt = parseYmd(dataDespesa);
    if (!dt) {
      const msg = 'Data inválida. Use YYYY-MM-DD.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Erro', msg);
      return;
    }

    if (!contaId) {
      const msg = 'Selecione a conta.';
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

      if (!grupoAtivo?.grupo_id) throw new Error('Carteira não carregada.');

      const status = statusConfirmada ? 'confirmada' : 'pendente';

      if (tipo === 'transferencia') {
        const { error } = await supabase.rpc('criar_transferencia', {
          p_usuario_id: userId,
          p_data_caixa: dataDespesa,
          p_data_despesa: dataDespesa,
          p_conta_origem_id: contaId,
          p_conta_destino_id: contaDestinoId,
          p_descricao: desc,
          p_valor: Math.abs(valor),
          p_origem: 'manual',
          p_status: status,
          p_grupo_id: grupoAtivo.grupo_id,
        });
        if (error) throw error;

        DeviceEventEmitter.emit('FG_REFRESH_ALL');
        navigation.goBack();
        return;
      }

      const dataCaixa = dataCaixaFromContaTipo(dataDespesa, contaOrigem?.tipo);

      if (tipo === 'despesa' && ehParcela) {
        const total = Math.max(2, Math.min(120, parseInt(totalParcelasTxt || '2', 10) || 2));
        const baseDate = parseYmd(dataDespesa)!;

        const totalCent = Math.round(valor * 100);
        const baseParc = Math.floor(totalCent / total);
        let resto = totalCent - baseParc * total;

        const parcelamentoId = globalThis?.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random()}`;

        const rows: any[] = [];
        for (let i = 1; i <= total; i++) {
          const cent = baseParc + (resto > 0 ? 1 : 0);
          if (resto > 0) resto -= 1;

          const dParc = addMonths(baseDate, i - 1);
          const dDesp = yyyyMmDd(dParc);
          const dCx = dataCaixaFromContaTipo(dDesp, contaOrigem?.tipo);

          rows.push({
            grupo_id: grupoAtivo.grupo_id,
            usuario_id: userId,
            conta_id: contaId,
            data_despesa: dDesp,
            data_caixa: dCx,
            descricao: `${desc} (${i}/${total})`,
            valor: cent / 100,
            tipo,
            status,
            origem: 'manual',
            categoria_id: categoriaId,
            eh_parcela: true,
            parcela_numero: i,
            total_parcelas: total,
            parcelamento_id: parcelamentoId,
          });
        }

        const { error } = await supabase.from('transacoes').insert(rows);
        if (error) throw error;

        DeviceEventEmitter.emit('FG_REFRESH_ALL');
        navigation.goBack();
        return;
      }

      const row: any = {
        grupo_id: grupoAtivo.grupo_id,
        usuario_id: userId,
        conta_id: contaId,
        data_despesa: dataDespesa,
        data_caixa: dataCaixa,
        descricao: desc,
        valor: Math.abs(valor),
        tipo,
        status,
        origem: 'manual',
        categoria_id: categoriaId,
        eh_parcela: false,
        parcela_numero: null,
        total_parcelas: null,
        parcelamento_id: null,
      };

      const { error } = await supabase.from('transacoes').insert([row]);
      if (error) throw error;

      DeviceEventEmitter.emit('FG_REFRESH_ALL');
      navigation.goBack();
    } catch (e: any) {
      console.log('ERRO LancamentoManual salvar:', e);
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
        <Text style={styles.title}>Novo Lançamento</Text>
        <Text style={styles.subtitle}>{grupoAtivo?.nome_grupo || 'Minha Carteira'}</Text>
        <Text style={styles.info}>Perfil: {isViewer ? 'Viewer' : 'Owner'}</Text>
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

      <Card>
        <Text style={styles.sectionLabel}>Tipo</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          <Chip label="Despesa" active={tipo === 'despesa'} onPress={() => setTipo('despesa')} />
          <Chip label="Receita" active={tipo === 'receita'} onPress={() => setTipo('receita')} />
          <Chip label="Transferência" active={tipo === 'transferencia'} onPress={() => setTipo('transferencia')} />
        </View>
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
        <Text style={styles.helper}>
          {tipo === 'transferencia'
            ? 'Transferência: Data de Caixa = Data da Despesa.'
            : (contaOrigem?.tipo || '').toLowerCase() === 'cartao'
              ? 'Cartão: Data de Caixa será fixada em 28 do mês.'
              : 'Data de Caixa seguirá a Data da Despesa (conta não-cartão).'}
        </Text>
      </Card>

      <View style={{ height: 10 }} />

      <Card>
        <Input
          label="Descrição *"
          placeholder="Ex.: Mercado / Uber / Salário..."
          value={descricao}
          onChangeText={setDescricao}
        />
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

      {tipo === 'despesa' ? (
        <>
          <View style={{ height: 10 }} />
          <Card>
            <View style={styles.rowBetween}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionLabel}>Parcelamento</Text>
                <Text style={styles.helper}>É parcela?</Text>
              </View>
              <Switch value={ehParcela} onValueChange={setEhParcela} disabled={saving} />
            </View>

            {ehParcela ? (
              <View style={{ marginTop: 10 }}>
                <Input
                  label="Total de parcelas"
                  placeholder="Ex.: 2"
                  value={totalParcelasTxt}
                  onChangeText={setTotalParcelasTxt}
                  keyboardType={Platform.OS === 'web' ? 'default' : 'numeric'}
                />
                <Text style={styles.helper}>
                  Será criado 1 lançamento por mês (ex.: {descricao || 'Descrição'} (1/N)).
                </Text>
              </View>
            ) : null}
          </Card>
        </>
      ) : null}

      <View style={{ height: 14 }} />

      <View style={{ flexDirection: 'row', marginHorizontal: 0 }}>
        <View style={{ flex: 1, marginRight: 10 }}>
          <Button title="Cancelar" variant="ghost" onPress={() => navigation.goBack()} disabled={saving} />
        </View>
        <View style={{ flex: 1 }}>
          <Button title={saving ? 'Salvando...' : 'Salvar e continuar'} onPress={salvar} disabled={saving} />
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