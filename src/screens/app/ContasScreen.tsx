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

type GrupoAtivo = {
  grupo_id: string;
  papel: 'owner' | 'viewer';
  nome_grupo: string;
};

type Conta = {
  id: string;
  grupo_id: string;
  usuario_id: string | null;
  nome: string;
  tipo: 'banco' | 'cartao' | 'dinheiro' | 'investimento' | 'outro';
  instituicao: string | null;
  saldo_inicial: number | null;
  ativa: boolean;
  created_at: string;
  updated_at: string;
};

type FormConta = {
  id?: string;
  nome: string;
  tipo: Conta['tipo'];
  instituicao: string;
  saldo_inicial: string;
  ativa: boolean;
};

const TIPOS_CONTA: Array<{ value: Conta['tipo']; label: string }> = [
  { value: 'banco', label: 'Banco' },
  { value: 'cartao', label: 'Cartão' },
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'investimento', label: 'Investimento' },
  { value: 'outro', label: 'Outro' },
];

function formatarMoeda(valor: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(valor) || 0);
}

function parseValorInput(valorTexto: string): number {
  if (!valorTexto) return 0;

  // aceita "1.234,56" ou "1234.56"
  const normalizado = valorTexto
    .trim()
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.');

  const n = Number(normalizado);
  return Number.isFinite(n) ? n : 0;
}

function tipoLabel(tipo: Conta['tipo']) {
  return TIPOS_CONTA.find((t) => t.value === tipo)?.label ?? tipo;
}

export default function ContasScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const [erroTela, setErroTela] = useState<string | null>(null);

  const [grupoAtivo, setGrupoAtivo] = useState<GrupoAtivo | null>(null);
  const [contas, setContas] = useState<Conta[]>([]);

  const [modalVisivel, setModalVisivel] = useState(false);
  const [form, setForm] = useState<FormConta>({
    nome: '',
    tipo: 'banco',
    instituicao: '',
    saldo_inicial: '',
    ativa: true,
  });

  const [filtroAtivas, setFiltroAtivas] = useState<'todas' | 'ativas' | 'inativas'>('todas');

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

    if (error) throw new Error('Não foi possível carregar a carteira.');

    if (!data || data.length === 0) {
      throw new Error('Nenhuma carteira ativa encontrada.');
    }

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

  const carregarContas = useCallback(async (grupoId: string) => {
    const { data, error } = await supabase
      .from('contas')
      .select(
        'id, grupo_id, usuario_id, nome, tipo, instituicao, saldo_inicial, ativa, created_at, updated_at'
      )
      .eq('grupo_id', grupoId)
      .order('ativa', { ascending: false })
      .order('nome', { ascending: true });

    if (error) {
      throw new Error('Não foi possível carregar as contas.');
    }

    setContas((data || []) as Conta[]);
  }, []);

  const carregarTela = useCallback(async () => {
    setErroTela(null);

    try {
      const grupo = await carregarGrupoAtivo();
      setGrupoAtivo(grupo);

      await carregarContas(grupo.grupo_id);
    } catch (e: any) {
      setErroTela(e?.message || 'Erro ao carregar contas.');
      setGrupoAtivo(null);
      setContas([]);
    }
  }, [carregarContas, carregarGrupoAtivo]);

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

  const contasFiltradas = useMemo(() => {
    if (filtroAtivas === 'ativas') return contas.filter((c) => c.ativa);
    if (filtroAtivas === 'inativas') return contas.filter((c) => !c.ativa);
    return contas;
  }, [contas, filtroAtivas]);

  const abrirModalNova = () => {
    if (isViewer) {
      Alert.alert('Sem permissão', 'Seu perfil é de visualização.');
      return;
    }

    setForm({
      nome: '',
      tipo: 'banco',
      instituicao: '',
      saldo_inicial: '',
      ativa: true,
    });
    setModalVisivel(true);
  };

  const abrirModalEditar = (conta: Conta) => {
    if (isViewer) return;

    setForm({
      id: conta.id,
      nome: conta.nome ?? '',
      tipo: conta.tipo ?? 'banco',
      instituicao: conta.instituicao ?? '',
      saldo_inicial:
        conta.saldo_inicial !== null && conta.saldo_inicial !== undefined
          ? String(conta.saldo_inicial).replace('.', ',')
          : '',
      ativa: conta.ativa,
    });
    setModalVisivel(true);
  };

  const fecharModal = () => {
    if (salvando) return;
    setModalVisivel(false);
  };

  const salvarConta = async () => {
    if (salvando) return;

    if (!grupoAtivo?.grupo_id) {
      Alert.alert('Erro', 'Carteira não identificada.');
      return;
    }

    const nome = form.nome.trim();
    if (!nome) {
      Alert.alert('Validação', 'Informe o nome da conta.');
      return;
    }

    const payload = {
      grupo_id: grupoAtivo.grupo_id,
      nome,
      tipo: form.tipo,
      instituicao: form.instituicao.trim() || null,
      saldo_inicial: parseValorInput(form.saldo_inicial),
      ativa: form.ativa,
    };

    setSalvando(true);

    try {
      if (form.id) {
        const { error } = await supabase
          .from('contas')
          .update(payload)
          .eq('id', form.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('contas')
          .insert(payload);

        if (error) throw error;
      }

      setModalVisivel(false);
      await carregarContas(grupoAtivo.grupo_id);
    } catch (e: any) {
      Alert.alert('Erro', e?.message || 'Não foi possível salvar a conta.');
    } finally {
      setSalvando(false);
    }
  };

  const alternarStatusConta = async (conta: Conta) => {
    if (isViewer || !grupoAtivo?.grupo_id) return;

    const acao = conta.ativa ? 'inativar' : 'reativar';
    const titulo = conta.ativa ? 'Inativar conta' : 'Reativar conta';
    const mensagem = `Deseja ${acao} a conta "${conta.nome}"?`;

    const confirmar = async () => {
      try {
        const { error } = await supabase
          .from('contas')
          .update({ ativa: !conta.ativa })
          .eq('id', conta.id);

        if (error) throw error;

        await carregarContas(grupoAtivo.grupo_id);
      } catch (e: any) {
        Alert.alert('Erro', e?.message || 'Não foi possível atualizar a conta.');
      }
    };

    if (typeof Alert.alert === 'function') {
      Alert.alert(titulo, mensagem, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Confirmar', onPress: confirmar },
      ]);
    } else {
      await confirmar();
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Carregando contas...</Text>
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
            <Text style={styles.title}>Contas</Text>
            <Text style={styles.subtitle}>{grupoAtivo?.nome_grupo || 'Minha Carteira'}</Text>
            <Text style={styles.subInfo}>
              Perfil: {isViewer ? 'Viewer' : 'Owner'} • {contas.length} conta(s)
            </Text>
          </View>

          {!isViewer ? (
            <Pressable style={styles.primaryButton} onPress={abrirModalNova}>
              <Text style={styles.primaryButtonText}>+ Nova conta</Text>
            </Pressable>
          ) : null}
        </View>

        {erroTela ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorBoxText}>{erroTela}</Text>
          </View>
        ) : null}

        <View style={styles.filterRow}>
          <Pressable
            style={[styles.filterChip, filtroAtivas === 'todas' && styles.filterChipActive]}
            onPress={() => setFiltroAtivas('todas')}
          >
            <Text
              style={[
                styles.filterChipText,
                filtroAtivas === 'todas' && styles.filterChipTextActive,
              ]}
            >
              Todas
            </Text>
          </Pressable>

          <Pressable
            style={[styles.filterChip, filtroAtivas === 'ativas' && styles.filterChipActive]}
            onPress={() => setFiltroAtivas('ativas')}
          >
            <Text
              style={[
                styles.filterChipText,
                filtroAtivas === 'ativas' && styles.filterChipTextActive,
              ]}
            >
              Ativas
            </Text>
          </Pressable>

          <Pressable
            style={[styles.filterChip, filtroAtivas === 'inativas' && styles.filterChipActive]}
            onPress={() => setFiltroAtivas('inativas')}
          >
            <Text
              style={[
                styles.filterChipText,
                filtroAtivas === 'inativas' && styles.filterChipTextActive,
              ]}
            >
              Inativas
            </Text>
          </Pressable>
        </View>

        {contasFiltradas.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>
              {isViewer
                ? 'Nenhuma conta encontrada nesta carteira.'
                : 'Nenhuma conta cadastrada ainda. Clique em "+ Nova conta".'}
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {contasFiltradas.map((conta) => (
              <Pressable
                key={conta.id}
                onPress={() => abrirModalEditar(conta)}
                disabled={isViewer}
                style={({ pressed }) => [
                  styles.listItem,
                  !conta.ativa ? styles.listItemInactive : null,
                  pressed && !isViewer ? styles.listItemPressed : null,
                ]}
              >
                <View style={styles.listItemLeft}>
                  <Text style={styles.listItemTitle} numberOfLines={1}>
                    {conta.nome}
                  </Text>
                  <Text style={styles.listItemMeta}>
                    {tipoLabel(conta.tipo)}
                    {conta.instituicao ? ` • ${conta.instituicao}` : ''}
                  </Text>
                  <Text style={styles.listItemMeta}>
                    Saldo inicial: {formatarMoeda(Number(conta.saldo_inicial) || 0)}
                  </Text>
                </View>

                <View style={styles.listItemRight}>
                  <View
                    style={[
                      styles.badge,
                      conta.ativa ? styles.badgeActive : styles.badgeInactive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.badgeText,
                        conta.ativa ? styles.badgeTextActive : styles.badgeTextInactive,
                      ]}
                    >
                      {conta.ativa ? 'Ativa' : 'Inativa'}
                    </Text>
                  </View>

                  {!isViewer ? (
                    <Pressable
                      onPress={() => alternarStatusConta(conta)}
                      style={styles.actionLink}
                    >
                      <Text style={styles.actionLinkText}>
                        {conta.ativa ? 'Inativar' : 'Reativar'}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

      <Modal
        visible={modalVisivel}
        transparent
        animationType="fade"
        onRequestClose={fecharModal}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{form.id ? 'Editar conta' : 'Nova conta'}</Text>
            <Text style={styles.modalSubtitle}>
              {grupoAtivo?.nome_grupo || 'Minha Carteira'}
            </Text>

            <View style={styles.field}>
              <Text style={styles.label}>Nome da conta *</Text>
              <TextInput
                style={styles.input}
                placeholder="Ex.: Itaú, Visa, Dinheiro"
                value={form.nome}
                onChangeText={(v) => setForm((prev) => ({ ...prev, nome: v }))}
                editable={!salvando}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Tipo *</Text>
              <View style={styles.tipoWrap}>
                {TIPOS_CONTA.map((tipo) => {
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
              <Text style={styles.label}>Instituição</Text>
              <TextInput
                style={styles.input}
                placeholder="Ex.: Itaú, Nubank, Bradesco"
                value={form.instituicao}
                onChangeText={(v) => setForm((prev) => ({ ...prev, instituicao: v }))}
                editable={!salvando}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Saldo inicial</Text>
              <TextInput
                style={styles.input}
                placeholder="0,00"
                keyboardType="decimal-pad"
                value={form.saldo_inicial}
                onChangeText={(v) => setForm((prev) => ({ ...prev, saldo_inicial: v }))}
                editable={!salvando}
              />
            </View>

            <View style={styles.switchRow}>
              <Text style={styles.label}>Conta ativa</Text>
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
                onPress={salvarConta}
                disabled={salvando}
              >
                {salvando ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.primaryButtonText}>
                    {form.id ? 'Salvar' : 'Criar conta'}
                  </Text>
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
    minWidth: 100,
    minHeight: 40,
  },
  primaryButtonText: {
    color: '#0d1117',
    fontWeight: '700',
    fontSize: 13,
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
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  filterChip: {
    backgroundColor: '#161b22',
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
  list: {
    backgroundColor: '#161b22',
    borderWidth: 1,
    borderColor: '#21262d',
    borderRadius: 12,
    overflow: 'hidden',
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
  listItemTitle: {
    color: '#e6edf3',
    fontWeight: '500',
    fontSize: 14,
  },
  listItemMeta: {
    marginTop: 3,
    color: '#7d8590',
    fontSize: 12,
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
  input: {
    borderWidth: 1,
    borderColor: '#21262d',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: '#0d1117',
    color: '#e6edf3',
  },
  tipoWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tipoChip: {
    borderWidth: 1,
    borderColor: '#21262d',
    backgroundColor: '#161b22',
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
});