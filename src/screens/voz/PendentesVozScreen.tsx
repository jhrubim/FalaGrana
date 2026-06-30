// src/screens/voz/PendentesVozScreen.tsx
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { fg } from '../../theme/fgTheme';

type Pendente = {
  id: string;
  descricao: string | null;
  valor: number | null;
  data_despesa: string | null;
  grupo: string | null;
  subgrupo: string | null;
  conta_id: string | null;
  created_at: string | null;
};

const MESES = ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];

function formatMoney(v?: number | null) {
  return Math.abs(Number(v || 0)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function parseDateParts(s: string | null | undefined) {
  if (!s) return null;
  const dia = s.slice(8, 10);
  const mes = parseInt(s.slice(5, 7), 10) - 1;
  return { dia, mes: MESES[mes] ?? '' };
}

export default function PendentesVozScreen() {
  const navigation = useNavigation<any>();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  const [pendentes, setPendentes] = useState<Pendente[]>([]);
  const [contaNomes, setContaNomes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData?.user?.id) return;

      const { data: grupos } = await supabase
        .from('grupo_membros')
        .select('grupo_id')
        .eq('user_id', authData.user.id)
        .eq('status', 'ativo')
        .limit(1);
      const grupoId = grupos?.[0]?.grupo_id;
      if (!grupoId) return;

      const [{ data: txData }, { data: contasData }] = await Promise.all([
        supabase
          .from('transacoes')
          .select('id, descricao, valor, data_despesa, grupo, subgrupo, conta_id, created_at')
          .eq('grupo_id', grupoId)
          .eq('origem', 'voz')
          .eq('status', 'pendente')
          .order('created_at', { ascending: false })
          .limit(200),
        supabase
          .from('contas')
          .select('id, nome')
          .eq('grupo_id', grupoId),
      ]);

      const nomes: Record<string, string> = {};
      (contasData || []).forEach((c: any) => { nomes[c.id] = c.nome; });

      setPendentes((txData || []) as Pendente[]);
      setContaNomes(nomes);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  const excluir = useCallback((item: Pendente) => {
    Alert.alert(
      'Excluir lançamento',
      `Excluir "${item.descricao || 'sem descrição'}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir', style: 'destructive',
          onPress: async () => {
            await supabase.from('transacoes').delete().eq('id', item.id);
            carregar();
          },
        },
      ]
    );
  }, [carregar]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: fg.colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={fg.colors.accent} />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: fg.colors.bg }}
      contentContainerStyle={[styles.container, isDesktop && { alignItems: 'center' }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); carregar(); }} tintColor={fg.colors.accent} />}
    >
      <View style={{ width: '100%', maxWidth: isDesktop ? 680 : undefined }}>

        {/* Cabeçalho */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.titulo}>Pendentes de voz</Text>
            <Text style={styles.subtitulo}>
              {pendentes.length === 0
                ? 'Nenhum gasto aguardando confirmação'
                : `${pendentes.length} gasto${pendentes.length !== 1 ? 's' : ''} aguardando importação`}
            </Text>
          </View>
          <Pressable
            onPress={() => navigation.navigate('CapturarVoz')}
            style={styles.btnNovo}
            accessibilityLabel="Novo registro por voz"
          >
            <Text style={styles.btnNovoText}>🎤 Novo</Text>
          </Pressable>
        </View>

        {/* Info */}
        {pendentes.length > 0 && (
          <View style={styles.infoBox}>
            <Text style={styles.infoText}>
              Esses gastos serão automaticamente confirmados quando você importar o extrato da conta correspondente.
            </Text>
          </View>
        )}

        {/* Lista */}
        {pendentes.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🎤</Text>
            <Text style={styles.emptyTitle}>Nenhum pendente</Text>
            <Text style={styles.emptyDesc}>Registre gastos por voz — eles aparecem aqui até serem confirmados pela importação.</Text>
            <Pressable
              onPress={() => navigation.navigate('CapturarVoz')}
              style={styles.btnEmptyAcao}
              accessibilityLabel="Registrar gasto por voz"
            >
              <Text style={styles.btnEmptyAcaoText}>Registrar agora</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.card}>
            {pendentes.map((item, idx) => {
              const dateParts = parseDateParts(item.data_despesa);
              const contaNome = item.conta_id ? contaNomes[item.conta_id] : null;
              const cat = [item.grupo, item.subgrupo].filter(Boolean).join(' › ');

              return (
                <View key={item.id}>
                  <View style={styles.row}>
                    {/* Bloco de data */}
                    <View style={styles.dateBlock}>
                      <Text style={styles.dateDay}>{dateParts?.dia ?? '--'}</Text>
                      <Text style={styles.dateMes}>{dateParts?.mes ?? ''}</Text>
                    </View>

                    {/* Conteúdo */}
                    <Pressable
                      style={{ flex: 1 }}
                      onPress={() => navigation.navigate('EditarLancamento', { id: item.id })}
                      accessibilityLabel={item.descricao ?? 'Lançamento pendente'}
                    >
                      <View style={styles.rowTop}>
                        <Text style={styles.rowDesc} numberOfLines={1}>
                          {item.descricao || '(Sem descrição)'}
                        </Text>
                        <Text style={[styles.rowValor, { color: fg.colors.danger }]}>
                          −{formatMoney(item.valor)}
                        </Text>
                      </View>
                      <View style={styles.rowBottom}>
                        <Text style={styles.rowMeta} numberOfLines={1}>
                          {[contaNome, cat].filter(Boolean).join(' · ') || 'Sem conta'}
                        </Text>
                        <View style={styles.pendenteBadge}>
                          <Text style={styles.pendenteBadgeText}>pendente</Text>
                        </View>
                      </View>
                    </Pressable>

                    {/* Botão excluir */}
                    <Pressable
                      onPress={() => excluir(item)}
                      style={({ pressed }) => [styles.btnExcluir, pressed && { opacity: 0.6 }]}
                      accessibilityLabel="Excluir lançamento"
                    >
                      <Text style={styles.btnExcluirText}>✕</Text>
                    </Pressable>
                  </View>
                  {idx < pendentes.length - 1 && <View style={styles.divider} />}
                </View>
              );
            })}
          </View>
        )}

        <View style={{ height: 40 }} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingTop: 20 },

  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 14 },
  titulo: { color: fg.colors.text, fontSize: 18, fontWeight: '700' },
  subtitulo: { color: fg.colors.muted, fontSize: 12, marginTop: 2 },
  btnNovo: {
    backgroundColor: fg.colors.accent, borderRadius: fg.radius.md,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  btnNovoText: { color: fg.colors.bg, fontSize: 12, fontWeight: '700' },

  infoBox: {
    backgroundColor: 'rgba(74,222,128,0.08)', borderWidth: 1, borderColor: 'rgba(74,222,128,0.2)',
    borderRadius: fg.radius.md, padding: 12, marginBottom: 16,
  },
  infoText: { color: fg.colors.muted, fontSize: 12, lineHeight: 18 },

  card: {
    backgroundColor: fg.colors.surface, borderWidth: 1, borderColor: fg.colors.border,
    borderRadius: fg.radius.md, overflow: 'hidden',
  },

  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, gap: 10 },

  dateBlock: {
    width: 40, minHeight: 40, borderRadius: 10,
    backgroundColor: fg.colors.surface2, borderWidth: 1, borderColor: fg.colors.border,
    alignItems: 'center', justifyContent: 'center', paddingVertical: 4,
  },
  dateDay: { color: fg.colors.text, fontSize: 16, fontWeight: '700', lineHeight: 18 },
  dateMes: { color: fg.colors.accent, fontSize: 9, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },

  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  rowDesc: { flex: 1, color: fg.colors.text, fontSize: 13, fontWeight: '500' },
  rowValor: { fontSize: 13, fontWeight: '700' },

  rowBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 3 },
  rowMeta: { flex: 1, color: fg.colors.muted, fontSize: 11 },

  pendenteBadge: {
    backgroundColor: 'rgba(246,196,83,0.15)', borderWidth: 1, borderColor: 'rgba(246,196,83,0.3)',
    borderRadius: fg.radius.pill, paddingHorizontal: 6, paddingVertical: 2,
  },
  pendenteBadgeText: { color: '#f6c453', fontSize: 9, fontWeight: '700' },

  btnExcluir: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: fg.colors.surface2, borderWidth: 1, borderColor: fg.colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  btnExcluirText: { color: fg.colors.muted, fontSize: 11, fontWeight: '700' },

  divider: { height: 1, backgroundColor: fg.colors.border, marginLeft: 62 },

  empty: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 },
  emptyIcon: { fontSize: 44, marginBottom: 14 },
  emptyTitle: { color: fg.colors.text, fontSize: 16, fontWeight: '700', marginBottom: 8 },
  emptyDesc: { color: fg.colors.muted, fontSize: 13, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  btnEmptyAcao: {
    backgroundColor: fg.colors.accent, borderRadius: fg.radius.md,
    paddingHorizontal: 24, paddingVertical: 12,
  },
  btnEmptyAcaoText: { color: fg.colors.bg, fontSize: 14, fontWeight: '700' },
});
