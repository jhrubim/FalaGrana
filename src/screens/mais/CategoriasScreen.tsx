import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { seedCategoriasPadraoSeNecessario } from '../../services/seedCategoriasPadrao';

type GrupoAtivo = {
  grupo_id: string;
  papel: 'owner' | 'viewer';
  nome_grupo: string;
};

type Categoria = {
  id: string;
  grupo_id: string;
  usuario_id: string | null;
  tipo: 'receita' | 'despesa' | 'transferencia';
  grupo: string;
  subgrupo: string;
  ativa: boolean;
  origem: 'padrao' | 'usuario';
  created_at: string;
  updated_at: string;
};

type FormCategoria = {
  id?: string;
  tipo: Categoria['tipo'];
  grupo: string;
  subgrupo: string;
  ativa: boolean;
};

const TIPOS: Array<{ value: Categoria['tipo']; label: string }> = [
  { value: 'despesa', label: 'Despesa' },
  { value: 'receita', label: 'Receita' },
  { value: 'transferencia', label: 'Transferência' },
];

export default function CategoriasScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const [erroTela, setErroTela] = useState<string | null>(null);
  const [grupoAtivo, setGrupoAtivo] = useState<GrupoAtivo | null>(null);
  const [categorias, setCategorias] = useState<Categoria[]>([]);

  const [modalVisivel, setModalVisivel] = useState(false);
  const [form, setForm] = useState<FormCategoria>({
    tipo: 'despesa',
    grupo: '',
    subgrupo: '',
    ativa: true,
  });

  const [filtroAtivas, setFiltroAtivas] = useState<'todas' | 'ativas' | 'inativas'>('todas');
  const [filtroTipo, setFiltroTipo] = useState<'todos' | Categoria['tipo']>('todos');
  const [filtroGrupo, setFiltroGrupo] = useState<string>('todos');
  const [busca, setBusca] = useState('');

  const isViewer = grupoAtivo?.papel === 'viewer';

  const carregarGrupoAtivo = useCallback(async (): Promise<GrupoAtivo> => {
    const { data: authData, error: authError } = await supabase.auth.getUser();

    if (authError || !authData?.user?.id) {
      throw new Error('Usuário não autenticado.');
    }

    const userId = authData.user.id;

    const { data, error } = await supabase
      .from('grupo_membros')
      .select(`
        grupo_id,
        papel,
        status,
        grupos_financeiros (
          id,
          nome
        )
      `)
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

    return {
      grupo_id: primeiro.grupo_id,
      papel: primeiro.papel,
      nome_grupo: nomeGrupo,
    };
  }, []);

  const carregarCategorias = useCallback(async (grupoId: string) => {
    const { data, error } = await supabase
      .from('categorias')
      .select('id, grupo_id, usuario_id, tipo, grupo, subgrupo, ativa, origem, created_at, updated_at')
      .eq('grupo_id', grupoId)
      .order('grupo', { ascending: true })
      .order('subgrupo', { ascending: true });

    if (error) throw new Error(`Não foi possível carregar categorias. (${error.message})`);

    setCategorias((data || []) as Categoria[]);
  }, []);

  const carregarTela = useCallback(async () => {
    setErroTela(null);

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData?.user?.id) {
        throw new Error('Usuário não autenticado.');
      }
      const userId = authData.user.id;

      const grupo = await carregarGrupoAtivo();
      setGrupoAtivo(grupo);

      await seedCategoriasPadraoSeNecessario(grupo.grupo_id, userId);
      await carregarCategorias(grupo.grupo_id);
    } catch (e: any) {
      console.log('ERRO CATEGORIAS carregarTela:', e);
      setErroTela(e?.message || 'Erro ao carregar categorias.');
      setGrupoAtivo(null);
      setCategorias([]);
    }
  }, [carregarCategorias, carregarGrupoAtivo]);

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

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await carregarTela();
    setRefreshing(false);
  }, [carregarTela]);

  const categoriasBaseFiltradas = useMemo(() => {
    let lista = [...categorias];

    if (filtroAtivas === 'ativas') lista = lista.filter((c) => c.ativa);
    if (filtroAtivas === 'inativas') lista = lista.filter((c) => !c.ativa);

    if (filtroTipo !== 'todos') lista = lista.filter((c) => c.tipo === filtroTipo);

    if (busca.trim()) {
      const termo = busca.trim().toLowerCase();
      lista = lista.filter(
        (c) =>
          c.grupo.toLowerCase().includes(termo) ||
          c.subgrupo.toLowerCase().includes(termo) ||
          c.tipo.toLowerCase().includes(termo)
      );
    }

    return lista;
  }, [categorias, filtroAtivas, filtroTipo, busca]);

  const gruposFiltro = useMemo(() => {
    const mapa = new Map<string, number>();

    categoriasBaseFiltradas.forEach((c) => {
      mapa.set(c.grupo, (mapa.get(c.grupo) || 0) + 1);
    });

    return Array.from(mapa.entries())
      .sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'))
      .map(([grupo, total]) => ({ grupo, total }));
  }, [categoriasBaseFiltradas]);

  useEffect(() => {
    if (filtroGrupo !== 'todos' && !gruposFiltro.some((g) => g.grupo === filtroGrupo)) {
      setFiltroGrupo('todos');
    }
  }, [filtroGrupo, gruposFiltro]);

  const categoriasFiltradas = useMemo(() => {
    let lista = [...categoriasBaseFiltradas];

    if (filtroGrupo !== 'todos') {
      lista = lista.filter((c) => c.grupo === filtroGrupo);
    }

    return lista;
  }, [categoriasBaseFiltradas, filtroGrupo]);

  const categoriasAgrupadas = useMemo(() => {
    const mapa = new Map<string, Categoria[]>();

    categoriasFiltradas.forEach((cat) => {
      const arr = mapa.get(cat.grupo) || [];
      arr.push(cat);
      mapa.set(cat.grupo, arr);
    });

    return Array.from(mapa.entries())
      .sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'))
      .map(([grupo, itens]) => ({
        grupo,
        itens: [...itens].sort((a, b) => a.subgrupo.localeCompare(b.subgrupo, 'pt-BR')),
      }));
  }, [categoriasFiltradas]);

  const abrirModalNova = () => {
    if (isViewer) {
      Alert.alert('Sem permissão', 'Seu perfil é de visualização.');
      return;
    }

    setForm({
      tipo: 'despesa',
      grupo: filtroGrupo !== 'todos' ? filtroGrupo : '',
      subgrupo: '',
      ativa: true,
    });
    setModalVisivel(true);
  };

  const abrirModalEditar = (cat: Categoria) => {
    if (isViewer) return;

    setForm({
      id: cat.id,
      tipo: cat.tipo,
      grupo: cat.grupo,
      subgrupo: cat.subgrupo,
      ativa: cat.ativa,
    });
    setModalVisivel(true);
  };

  const fecharModal = () => {
    if (salvando) return;
    setModalVisivel(false);
  };

  const salvarCategoria = async () => {
    if (salvando) return;

    if (!grupoAtivo?.grupo_id) {
      Alert.alert('Erro', 'Carteira não identificada.');
      return;
    }

    const grupo = form.grupo.trim();
    const subgrupo = form.subgrupo.trim();

    if (!grupo) {
      Alert.alert('Validação', 'Informe o grupo.');
      return;
    }
    if (!subgrupo) {
      Alert.alert('Validação', 'Informe o subgrupo.');
      return;
    }

    setSalvando(true);

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData?.user?.id) {
        throw new Error('Usuário não autenticado.');
      }

      const payload: any = {
        grupo_id: grupoAtivo.grupo_id,
        usuario_id: authData.user.id,
        tipo: form.tipo,
        grupo,
        subgrupo,
        ativa: form.ativa,
        origem: 'usuario',
      };

      if (form.id) {
        const original = categorias.find((c) => c.id === form.id);
        if (original?.origem) {
          payload.origem = original.origem;
        }

        const { error } = await supabase.from('categorias').update(payload).eq('id', form.id);

        if (error) throw error;
      } else {
        const { error } = await supabase.from('categorias').insert([payload]);

        if (error) throw error;
      }

      setModalVisivel(false);
      await carregarCategorias(grupoAtivo.grupo_id);
    } catch (e: any) {
      console.log('ERRO CATEGORIAS salvar (raw):', e);

      let msg =
        e?.message ||
        e?.details ||
        e?.hint ||
        e?.error_description ||
        'Não foi possível salvar a categoria.';

      if (
        String(msg).toLowerCase().includes('duplicate') ||
        String(msg).toLowerCase().includes('unique')
      ) {
        msg = 'Já existe essa categoria (grupo + subgrupo) nessa carteira.';
      }

      Alert.alert('Erro ao salvar categoria', msg);
    } finally {
      setSalvando(false);
    }
  };

  const alternarStatusCategoria = async (cat: Categoria) => {
    if (isViewer || !grupoAtivo?.grupo_id) return;

    const titulo = cat.ativa ? 'Inativar categoria' : 'Reativar categoria';
    const mensagem = `Deseja ${cat.ativa ? 'inativar' : 'reativar'} "${cat.grupo} • ${cat.subgrupo}"?`;

    Alert.alert(titulo, mensagem, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Confirmar',
        onPress: async () => {
          try {
            const { error } = await supabase.from('categorias').update({ ativa: !cat.ativa }).eq('id', cat.id);

            if (error) throw error;

            await carregarCategorias(grupoAtivo.grupo_id);
          } catch (e: any) {
            console.log('ERRO CATEGORIAS alternarStatus:', e);
            Alert.alert('Erro', e?.message || 'Não foi possível atualizar a categoria.');
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Carregando categorias...</Text>
      </View>
    );
  }

  return (
    <>
      <ScrollView
        style={styles.page}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Categorias</Text>
            <Text style={styles.subtitle}>{grupoAtivo?.nome_grupo || 'Minha Carteira'}</Text>
            <Text style={styles.subInfo}>
              Perfil: {isViewer ? 'Viewer' : 'Owner'} • {categorias.length} categoria(s)
            </Text>
          </View>

          {!isViewer ? (
            <Pressable style={styles.primaryButton} onPress={abrirModalNova}>
              <Text style={styles.primaryButtonText}>+ Nova</Text>
            </Pressable>
          ) : null}
        </View>

        {erroTela ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorBoxText}>{erroTela}</Text>
          </View>
        ) : null}

        <View style={styles.searchBox}>
          <TextInput
            style={styles.input}
            placeholder="Buscar por grupo, subgrupo ou tipo..."
            value={busca}
            onChangeText={setBusca}
          />
        </View>

        <View style={styles.filterSection}>
          <Text style={styles.filterLabel}>Status</Text>
          <View style={styles.filterRow}>
            {(['todas', 'ativas', 'inativas'] as const).map((opt) => {
              const ativo = filtroAtivas === opt;
              const label = opt === 'todas' ? 'Todas' : opt === 'ativas' ? 'Ativas' : 'Inativas';
              return (
                <Pressable
                  key={opt}
                  style={[styles.filterChip, ativo && styles.filterChipActive]}
                  onPress={() => setFiltroAtivas(opt)}
                >
                  <Text style={[styles.filterChipText, ativo && styles.filterChipTextActive]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={[styles.filterLabel, { marginTop: 8 }]}>Tipo</Text>
          <View style={styles.filterRow}>
            <Pressable
              style={[styles.filterChip, filtroTipo === 'todos' && styles.filterChipActive]}
              onPress={() => setFiltroTipo('todos')}
            >
              <Text
                style={[
                  styles.filterChipText,
                  filtroTipo === 'todos' && styles.filterChipTextActive,
                ]}
              >
                Todos
              </Text>
            </Pressable>

            {TIPOS.map((t) => {
              const ativo = filtroTipo === t.value;
              return (
                <Pressable
                  key={t.value}
                  style={[styles.filterChip, ativo && styles.filterChipActive]}
                  onPress={() => setFiltroTipo(t.value)}
                >
                  <Text style={[styles.filterChipText, ativo && styles.filterChipTextActive]}>
                    {t.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={[styles.filterLabel, { marginTop: 8 }]}>Grupo</Text>
          <View style={styles.filterRow}>
            <Pressable
              style={[styles.filterChip, filtroGrupo === 'todos' && styles.filterChipActive]}
              onPress={() => setFiltroGrupo('todos')}
            >
              <Text
                style={[
                  styles.filterChipText,
                  filtroGrupo === 'todos' && styles.filterChipTextActive,
                ]}
              >
                Todos ({categoriasBaseFiltradas.length})
              </Text>
            </Pressable>

            {gruposFiltro.map((g) => {
              const ativo = filtroGrupo === g.grupo;
              return (
                <Pressable
                  key={g.grupo}
                  style={[styles.filterChip, ativo && styles.filterChipActive]}
                  onPress={() => setFiltroGrupo(g.grupo)}
                >
                  <Text style={[styles.filterChipText, ativo && styles.filterChipTextActive]}>
                    {g.grupo} ({g.total})
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {categoriasFiltradas.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>
              {isViewer
                ? 'Nenhuma categoria encontrada nesta carteira.'
                : 'Nenhuma categoria encontrada. Ajuste os filtros ou crie uma nova.'}
            </Text>
          </View>
        ) : (
          <View style={styles.groupedList}>
            {categoriasAgrupadas.map((grupoSecao) => (
              <View key={grupoSecao.grupo} style={styles.groupSection}>
                <View style={styles.groupHeader}>
                  <Text style={styles.groupHeaderTitle} numberOfLines={1}>
                    {grupoSecao.grupo}
                  </Text>
                  <Text style={styles.groupHeaderCount}>{grupoSecao.itens.length}</Text>
                </View>

                <View style={styles.groupItems}>
                  {grupoSecao.itens.map((cat, idx) => (
                    <Pressable
                      key={cat.id}
                      onPress={() => abrirModalEditar(cat)}
                      disabled={isViewer}
                      style={({ pressed }) => [
                        styles.listItem,
                        idx === grupoSecao.itens.length - 1 && styles.listItemLast,
                        !cat.ativa ? styles.listItemInactive : null,
                        pressed && !isViewer ? styles.listItemPressed : null,
                      ]}
                    >
                      <View style={styles.listItemLeft}>
                        <View style={styles.topLine}>
                          <Text style={styles.listItemTitle} numberOfLines={1}>
                            {cat.subgrupo}
                          </Text>

                          <View
                            style={[
                              styles.typeBadge,
                              cat.tipo === 'receita'
                                ? styles.typeReceita
                                : cat.tipo === 'transferencia'
                                ? styles.typeTransferencia
                                : styles.typeDespesa,
                            ]}
                          >
                            <Text style={styles.typeBadgeText}>{cat.tipo}</Text>
                          </View>
                        </View>

                        <Text style={styles.listItemMeta}>
                          Origem: {cat.origem === 'padrao' ? 'Padrão' : 'Usuário'}
                        </Text>
                      </View>

                      <View style={styles.listItemRight}>
                        <View
                          style={[styles.badge, cat.ativa ? styles.badgeActive : styles.badgeInactive]}
                        >
                          <Text
                            style={[
                              styles.badgeText,
                              cat.ativa ? styles.badgeTextActive : styles.badgeTextInactive,
                            ]}
                          >
                            {cat.ativa ? 'Ativa' : 'Inativa'}
                          </Text>
                        </View>

                        {!isViewer ? (
                          <Pressable onPress={() => alternarStatusCategoria(cat)} style={styles.actionLink}>
                            <Text style={styles.actionLinkText}>
                              {cat.ativa ? 'Inativar' : 'Reativar'}
                            </Text>
                          </Pressable>
                        ) : null}
                      </View>
                    </Pressable>
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <Modal visible={modalVisivel} transparent animationType="fade" onRequestClose={fecharModal}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{form.id ? 'Editar categoria' : 'Nova categoria'}</Text>
            <Text style={styles.modalSubtitle}>{grupoAtivo?.nome_grupo || 'Minha Carteira'}</Text>

            <View style={styles.field}>
              <Text style={styles.label}>Tipo *</Text>
              <View style={styles.tipoWrap}>
                {TIPOS.map((tipo) => {
                  const ativo = form.tipo === tipo.value;
                  return (
                    <Pressable
                      key={tipo.value}
                      onPress={() => setForm((prev) => ({ ...prev, tipo: tipo.value }))}
                      style={[styles.tipoChip, ativo && styles.tipoChipActive]}
                      disabled={salvando}
                    >
                      <Text style={[styles.tipoChipText, ativo && styles.tipoChipTextActive]}>
                        {tipo.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Grupo *</Text>
              <TextInput
                style={styles.input}
                placeholder="Ex.: Moradia"
                value={form.grupo}
                onChangeText={(v) => setForm((prev) => ({ ...prev, grupo: v }))}
                editable={!salvando}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Subgrupo *</Text>
              <TextInput
                style={styles.input}
                placeholder="Ex.: Aluguel/Financiamento"
                value={form.subgrupo}
                onChangeText={(v) => setForm((prev) => ({ ...prev, subgrupo: v }))}
                editable={!salvando}
              />
            </View>

            <View style={styles.switchRow}>
              <Text style={styles.label}>Categoria ativa</Text>
              <Switch
                value={form.ativa}
                onValueChange={(v) => setForm((prev) => ({ ...prev, ativa: v }))}
                disabled={salvando}
              />
            </View>

            <View style={styles.modalActions}>
              <Pressable
                style={[styles.secondaryButton, salvando && styles.buttonDisabled]}
                onPress={fecharModal}
                disabled={salvando}
              >
                <Text style={styles.secondaryButtonText}>Cancelar</Text>
              </Pressable>

              <Pressable
                style={[styles.primaryButton, salvando && styles.buttonDisabled]}
                onPress={salvarCategoria}
                disabled={salvando}
              >
                {salvando ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.primaryButtonText}>{form.id ? 'Salvar' : 'Criar categoria'}</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#0d1117',
  },
  content: {
    padding: 20,
    paddingBottom: 24,
  },
  centered: {
    flex: 1,
    backgroundColor: '#0d1117',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 10,
    color: '#7d8590',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '500',
    color: '#e6edf3',
  },
  subtitle: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: '400',
    color: '#7d8590',
  },
  subInfo: {
    marginTop: 4,
    fontSize: 11,
    color: '#7d8590',
  },
  primaryButton: {
    backgroundColor: '#4ade80',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 90,
    minHeight: 40,
  },
  primaryButtonText: {
    color: '#0d1117',
    fontWeight: '700',
    fontSize: 13,
  },
  secondaryButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#21262d',
    paddingHorizontal: 12,
    paddingVertical: 10,
    minWidth: 96,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#161b22',
  },
  secondaryButtonText: {
    color: '#e6edf3',
    fontWeight: '500',
    fontSize: 13,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  errorBox: {
    backgroundColor: 'rgba(248,113,113,0.1)',
    borderColor: 'rgba(248,113,113,0.3)',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  errorBoxText: {
    color: '#f87171',
    fontWeight: '500',
    fontSize: 13,
  },
  searchBox: {
    marginBottom: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: '#21262d',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: '#0d1117',
    color: '#e6edf3',
  },
  filterSection: {
    backgroundColor: '#161b22',
    borderWidth: 1,
    borderColor: '#21262d',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  filterLabel: {
    color: '#7d8590',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    backgroundColor: '#0d1117',
    borderColor: '#21262d',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  filterChipActive: {
    backgroundColor: '#111a11',
    borderColor: '#4ade80',
  },
  filterChipText: {
    color: '#7d8590',
    fontSize: 12,
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: '#4ade80',
  },
  emptyBox: {
    backgroundColor: '#161b22',
    borderWidth: 1,
    borderColor: '#21262d',
    borderRadius: 12,
    padding: 14,
  },
  emptyText: {
    color: '#7d8590',
    fontSize: 13,
  },

  groupedList: {
    gap: 10,
  },
  groupSection: {
    backgroundColor: '#161b22',
    borderWidth: 1,
    borderColor: '#21262d',
    borderRadius: 12,
    overflow: 'hidden',
  },
  groupHeader: {
    minHeight: 40,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#21262d',
    backgroundColor: '#0d1117',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  groupHeaderTitle: {
    flex: 1,
    color: '#e6edf3',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  groupHeaderCount: {
    color: '#7d8590',
    fontWeight: '600',
    fontSize: 11,
    backgroundColor: '#21262d',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  groupItems: {
    backgroundColor: '#161b22',
  },

  listItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#21262d',
  },
  listItemLast: {
    borderBottomWidth: 0,
  },
  listItemPressed: {
    backgroundColor: '#0d1117',
  },
  listItemInactive: {
    opacity: 0.5,
  },
  listItemLeft: {
    flex: 1,
  },
  listItemRight: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 6,
  },
  topLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  listItemTitle: {
    color: '#e6edf3',
    fontWeight: '500',
    fontSize: 14,
    flex: 1,
  },
  listItemMeta: {
    marginTop: 4,
    color: '#7d8590',
    fontSize: 12,
  },

  typeBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  typeReceita: {
    backgroundColor: 'rgba(74,222,128,0.12)',
  },
  typeDespesa: {
    backgroundColor: 'rgba(248,113,113,0.12)',
  },
  typeTransferencia: {
    backgroundColor: 'rgba(96,165,250,0.12)',
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#7d8590',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },

  badge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeActive: {
    backgroundColor: 'rgba(74,222,128,0.12)',
  },
  badgeInactive: {
    backgroundColor: '#21262d',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  badgeTextActive: {
    color: '#4ade80',
  },
  badgeTextInactive: {
    color: '#7d8590',
  },

  actionLink: {
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  actionLinkText: {
    color: '#4ade80',
    fontSize: 12,
    fontWeight: '500',
    textDecorationLine: 'underline',
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: '#161b22',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#21262d',
    padding: 16,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '500',
    color: '#e6edf3',
  },
  modalSubtitle: {
    marginTop: 2,
    marginBottom: 12,
    color: '#7d8590',
    fontSize: 12,
  },
  field: {
    marginBottom: 10,
  },
  label: {
    marginBottom: 6,
    color: '#7d8590',
    fontWeight: '500',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  tipoWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tipoChip: {
    borderWidth: 1,
    borderColor: '#21262d',
    backgroundColor: '#0d1117',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  tipoChipActive: {
    backgroundColor: '#111a11',
    borderColor: '#4ade80',
  },
  tipoChipText: {
    color: '#7d8590',
    fontWeight: '500',
    fontSize: 12,
  },
  tipoChipTextActive: {
    color: '#4ade80',
  },
  switchRow: {
    marginTop: 2,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 2,
  },
});