// src/screens/relatorios/DrillDownLancamentosScreen.tsx
import React, { useMemo } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { fg } from '../../theme/fgTheme';

type DrillItem = {
  id: string;
  descricao: string | null;
  valor: number | null;
  tipo: string | null;
  data_despesa: string | null;
  data_caixa: string | null;
  grupo: string | null;
  subgrupo: string | null;
  conta_id: string | null;
  status: string | null;
};

type RouteParams = {
  items: DrillItem[];
  titulo: string;
  subtitulo: string;
  contaNomes: Record<string, string>;
};

function formatMoney(v?: number | null) {
  return Math.abs(Number(v || 0)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatData(s: string | null | undefined) {
  if (!s) return '';
  const d = s.slice(8, 10);
  const m = s.slice(5, 7);
  return `${d}/${m}`;
}

export default function DrillDownLancamentosScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  const { items = [], titulo = '', subtitulo = '', contaNomes = {} } = (route.params ?? {}) as RouteParams;

  const resumo = useMemo(() => {
    let receita = 0, despesa = 0;
    for (const l of items) {
      const v = Math.abs(Number(l.valor || 0));
      if (l.tipo === 'receita') receita += v;
      else if (l.tipo === 'despesa') despesa += v;
    }
    return { receita, despesa };
  }, [items]);

  const sorted = useMemo(
    () => [...items].sort((a, b) => (b.data_despesa ?? '').localeCompare(a.data_despesa ?? '')),
    [items]
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: fg.colors.bg }}
      contentContainerStyle={[
        styles.container,
        isDesktop && { paddingHorizontal: 28, alignItems: 'center' },
      ]}
    >
      <View style={{ width: '100%', maxWidth: isDesktop ? 720 : undefined, alignSelf: isDesktop ? 'center' : undefined }}>

        {/* Cabeçalho */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.titulo}>{titulo}</Text>
            {!!subtitulo && <Text style={styles.subtitulo}>{subtitulo}</Text>}
          </View>
          <Pressable onPress={() => navigation.goBack()} style={styles.btnBack}>
            <Text style={styles.btnBackText}>← Voltar</Text>
          </Pressable>
        </View>

        {/* Resumo */}
        <View style={styles.resumoRow}>
          <View style={styles.resumoCard}>
            <Text style={styles.resumoLabel}>DESPESAS</Text>
            <Text style={[styles.resumoValor, { color: fg.colors.danger }]}>−{formatMoney(resumo.despesa)}</Text>
          </View>
          {resumo.receita > 0 && (
            <View style={styles.resumoCard}>
              <Text style={styles.resumoLabel}>RECEITAS</Text>
              <Text style={[styles.resumoValor, { color: fg.colors.accent }]}>+{formatMoney(resumo.receita)}</Text>
            </View>
          )}
          <View style={styles.resumoCard}>
            <Text style={styles.resumoLabel}>ITENS</Text>
            <Text style={styles.resumoValor}>{items.length}</Text>
          </View>
        </View>

        {/* Lista */}
        {sorted.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Nenhum lançamento</Text>
          </View>
        ) : (
          <View style={styles.card}>
            {sorted.map((item, idx) => {
              const isReceita = item.tipo === 'receita';
              const conta = item.conta_id ? (contaNomes[item.conta_id] ?? '') : '';
              const cat = [item.grupo, item.subgrupo].filter(Boolean).join(' › ') || conta;
              const isPendente = (item.status || 'confirmada') === 'pendente';
              return (
                <View key={item.id}>
                  <Pressable
                    onPress={() => navigation.navigate('EditarLancamento', { id: item.id })}
                    style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                    accessibilityLabel={item.descricao ?? 'Lançamento'}
                  >
                    <View style={[styles.tipoIcon, {
                      backgroundColor: isReceita ? fg.colors.accentSoft : fg.colors.dangerSoft,
                      borderColor: isReceita ? fg.colors.accent : fg.colors.danger,
                    }]}>
                      <Text style={{ color: isReceita ? fg.colors.accent : fg.colors.danger, fontSize: 15, fontWeight: '700' }}>
                        {isReceita ? '+' : '−'}
                      </Text>
                    </View>

                    <View style={{ flex: 1 }}>
                      <View style={styles.rowTop}>
                        <Text style={styles.rowDesc} numberOfLines={1}>{item.descricao || '(Sem descrição)'}</Text>
                        <Text style={[styles.rowValor, { color: isReceita ? fg.colors.accent : fg.colors.danger }]}>
                          {isReceita ? '+' : '−'}{formatMoney(item.valor)}
                        </Text>
                      </View>
                      <View style={styles.rowBottom}>
                        <Text style={styles.rowMeta} numberOfLines={1}>{cat || conta}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          {isPendente && <View style={styles.pendenteDot} />}
                          <Text style={styles.rowData}>
                            {formatData(item.data_despesa)}
                            {item.data_caixa && item.data_caixa !== item.data_despesa
                              ? ` · cx ${formatData(item.data_caixa)}`
                              : ''}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </Pressable>
                  {idx < sorted.length - 1 && <View style={styles.divider} />}
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

  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 16 },
  titulo: { color: fg.colors.text, fontSize: 18, fontWeight: '600' },
  subtitulo: { color: fg.colors.muted, fontSize: 12, marginTop: 2 },
  btnBack: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: fg.radius.md, backgroundColor: fg.colors.surface, borderWidth: 1, borderColor: fg.colors.border },
  btnBackText: { color: fg.colors.muted, fontSize: 12, fontWeight: '600' },

  resumoRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  resumoCard: { flex: 1, backgroundColor: fg.colors.surface, borderWidth: 1, borderColor: fg.colors.border, borderRadius: fg.radius.md, padding: 10 },
  resumoLabel: { color: fg.colors.muted, fontSize: 9, fontWeight: '700', letterSpacing: 0.8, marginBottom: 4, textTransform: 'uppercase' },
  resumoValor: { color: fg.colors.text, fontSize: 14, fontWeight: '700' },

  card: { backgroundColor: fg.colors.surface, borderWidth: 1, borderColor: fg.colors.border, borderRadius: fg.radius.md, overflow: 'hidden' },

  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 11, gap: 10 },
  rowPressed: { backgroundColor: 'rgba(74,222,128,0.05)' },

  tipoIcon: { width: 34, height: 34, borderRadius: 9, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },

  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  rowDesc: { flex: 1, color: fg.colors.text, fontSize: 13, fontWeight: '500' },
  rowValor: { fontSize: 13, fontWeight: '700' },

  rowBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 3 },
  rowMeta: { flex: 1, color: fg.colors.muted, fontSize: 11 },
  rowData: { color: fg.colors.muted, fontSize: 11 },

  pendenteDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#f6c453' },

  divider: { height: 1, backgroundColor: fg.colors.border, marginLeft: 56 },

  empty: { paddingVertical: 40, alignItems: 'center' },
  emptyText: { color: fg.colors.muted, fontSize: 14 },
});
