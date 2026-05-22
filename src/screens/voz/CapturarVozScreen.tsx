// src/screens/voz/CapturarVozScreen.tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { parsearVoz, type VozParsed } from '../../utils/parsearVoz';
import { fg } from '../../theme/fgTheme';

// ─── Types ────────────────────────────────────────────────────────────────────

type EstadoMic = 'idle' | 'ouvindo' | 'processando' | 'revisando' | 'salvando';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMoney(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function yyyyMmDd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ─── Web Speech API ───────────────────────────────────────────────────────────

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

function criarReconhecimento(): any | null {
  if (Platform.OS !== 'web') return null;
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Rec) return null;
  const rec = new Rec();
  rec.lang = 'pt-BR';
  rec.continuous = false;
  rec.interimResults = true;
  return rec;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CapturarVozScreen() {
  const navigation = useNavigation<any>();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  const [estado, setEstado] = useState<EstadoMic>('idle');
  const [textoOuvido, setTextoOuvido] = useState('');
  const [textoManual, setTextoManual] = useState('');
  const [parsed, setParsed] = useState<VozParsed | null>(null);
  const [erroMic, setErroMic] = useState('');

  // Campos editáveis pós-parse
  const [valor, setValor] = useState('');
  const [descricao, setDescricao] = useState('');
  const [data, setData] = useState(yyyyMmDd(new Date()));
  const [grupo, setGrupo] = useState('');
  const [subgrupo, setSubgrupo] = useState('');

  const recRef = useRef<any>(null);
  const temSpeechAPI = Platform.OS === 'web' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  const aplicarParsed = useCallback((p: VozParsed) => {
    setParsed(p);
    setValor(p.valor !== null ? String(p.valor).replace('.', ',') : '');
    setDescricao(p.descricao);
    setData(p.data);
    setGrupo(p.grupoSugerido ?? '');
    setSubgrupo(p.subgrupoSugerido ?? '');
    setEstado('revisando');
  }, []);

  // ── Microfone (Web Speech API) ─────────────────────────────────────────────
  const iniciarGravacao = useCallback(() => {
    setErroMic('');
    setTextoOuvido('');
    const rec = criarReconhecimento();
    if (!rec) { setErroMic('API de voz não disponível neste dispositivo.'); return; }
    recRef.current = rec;

    rec.onstart = () => setEstado('ouvindo');

    rec.onresult = (e: any) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          setTextoOuvido(t);
          setEstado('processando');
          setTimeout(() => aplicarParsed(parsearVoz(t)), 200);
        } else {
          interim += t;
          setTextoOuvido(interim);
        }
      }
    };

    rec.onerror = (e: any) => {
      setErroMic(e.error === 'not-allowed'
        ? 'Permissão de microfone negada. Permita o acesso nas configurações do navegador.'
        : `Erro no microfone: ${e.error}`);
      setEstado('idle');
    };

    rec.onend = () => {
      if (estado === 'ouvindo') setEstado('idle');
    };

    rec.start();
  }, [aplicarParsed, estado]);

  const pararGravacao = useCallback(() => {
    recRef.current?.stop();
    setEstado('idle');
  }, []);

  useEffect(() => () => recRef.current?.abort?.(), []);

  // ── Processar texto manual ─────────────────────────────────────────────────
  const processarManual = useCallback(() => {
    if (!textoManual.trim()) return;
    setEstado('processando');
    setTimeout(() => aplicarParsed(parsearVoz(textoManual)), 100);
  }, [textoManual, aplicarParsed]);

  // ── Salvar ─────────────────────────────────────────────────────────────────
  const salvar = useCallback(async () => {
    const valorNum = parseFloat(valor.replace(',', '.'));
    if (isNaN(valorNum) || valorNum <= 0) {
      Alert.alert('Valor inválido', 'Informe um valor maior que zero.');
      return;
    }
    if (!descricao.trim()) {
      Alert.alert('Descrição obrigatória', 'Informe uma descrição para o lançamento.');
      return;
    }

    setEstado('salvando');
    try {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData?.user?.id) throw new Error('Usuário não autenticado.');

      const { data: grupos } = await supabase
        .from('grupo_membros')
        .select('grupo_id')
        .eq('user_id', authData.user.id)
        .eq('status', 'ativo')
        .limit(1);
      const grupoId = grupos?.[0]?.grupo_id;
      if (!grupoId) throw new Error('Carteira não encontrada.');

      const { error } = await supabase.from('transacoes').insert({
        grupo_id: grupoId,
        descricao: descricao.trim(),
        valor: valorNum,
        tipo: 'despesa',
        data_despesa: data,
        data_caixa: data,
        grupo: grupo.trim() || null,
        subgrupo: subgrupo.trim() || null,
        status: 'pendente',
        origem: 'voz',
      });

      if (error) throw error;

      const msg = `${formatMoney(valorNum)} — ${descricao}\nsalvo como pendente ✓`;
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Salvo!', msg);

      // Reset para nova captura
      setEstado('idle');
      setTextoOuvido('');
      setTextoManual('');
      setParsed(null);
      setValor('');
      setDescricao('');
      setData(yyyyMmDd(new Date()));
      setGrupo('');
      setSubgrupo('');
    } catch (e: any) {
      Alert.alert('Erro', e?.message ?? 'Não foi possível salvar.');
      setEstado('revisando');
    }
  }, [valor, descricao, data, grupo, subgrupo]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: fg.colors.bg }}
      contentContainerStyle={[styles.container, isDesktop && { alignItems: 'center' }]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ width: '100%', maxWidth: isDesktop ? 560 : undefined }}>

        {/* Título */}
        <Text style={styles.titulo}>Registrar gasto</Text>
        <Text style={styles.subtitulo}>Fale ou digite o que gastou — fica pendente até a importação confirmar.</Text>

        {/* ── Área de microfone ─────────────────────────────────────── */}
        {temSpeechAPI && estado !== 'revisando' && estado !== 'salvando' && (
          <View style={styles.micArea}>
            <Pressable
              onPress={estado === 'ouvindo' ? pararGravacao : iniciarGravacao}
              disabled={estado === 'processando'}
              style={({ pressed }) => [
                styles.micBtn,
                estado === 'ouvindo' && styles.micBtnOuvindo,
                pressed && { opacity: 0.85 },
              ]}
              accessibilityLabel={estado === 'ouvindo' ? 'Parar gravação' : 'Iniciar gravação de voz'}
            >
              {estado === 'processando' ? (
                <ActivityIndicator size="large" color={fg.colors.bg} />
              ) : (
                <Text style={styles.micIcon}>{estado === 'ouvindo' ? '⏹' : '🎤'}</Text>
              )}
            </Pressable>

            <Text style={styles.micStatus}>
              {estado === 'idle' && 'Toque para falar'}
              {estado === 'ouvindo' && 'Ouvindo... toque para parar'}
              {estado === 'processando' && 'Interpretando...'}
            </Text>

            {textoOuvido.length > 0 && (
              <View style={styles.textoOuvidoBox}>
                <Text style={styles.textoOuvidoLabel}>ENTENDIDO</Text>
                <Text style={styles.textoOuvido}>"{textoOuvido}"</Text>
              </View>
            )}

            {erroMic.length > 0 && (
              <View style={styles.erroBadge}>
                <Text style={styles.erroText}>{erroMic}</Text>
              </View>
            )}
          </View>
        )}

        {/* ── Input de texto (fallback ou alternativa) ────────────── */}
        {estado !== 'revisando' && estado !== 'salvando' && (
          <View style={styles.manualArea}>
            <Text style={styles.manualLabel}>
              {temSpeechAPI ? 'OU DIGITANDO' : 'DESCREVA O GASTO'}
            </Text>
            <View style={styles.manualRow}>
              <TextInput
                style={styles.manualInput}
                placeholder={'"gastei 45 no bar" ou "35,50 mercado ontem"'}
                placeholderTextColor={fg.colors.muted}
                value={textoManual}
                onChangeText={setTextoManual}
                onSubmitEditing={processarManual}
                returnKeyType="done"
              />
              <Pressable
                onPress={processarManual}
                disabled={!textoManual.trim()}
                style={({ pressed }) => [styles.manualBtn, pressed && { opacity: 0.8 }, !textoManual.trim() && { opacity: 0.4 }]}
              >
                <Text style={styles.manualBtnText}>→</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* ── Formulário de revisão ────────────────────────────────── */}
        {(estado === 'revisando' || estado === 'salvando') && (
          <View style={styles.revisaoCard}>
            <View style={styles.revisaoHeader}>
              <Text style={styles.revisaoTitulo}>Confirme os dados</Text>
              {parsed?.confianca && (
                <View style={[styles.confiancaBadge, parsed.confianca === 'alta' ? styles.badgeAlta : parsed.confianca === 'media' ? styles.badgeMedia : styles.badgeBaixa]}>
                  <Text style={styles.confiancaText}>
                    {parsed.confianca === 'alta' ? '✓ alta confiança' : parsed.confianca === 'media' ? '~ média' : '⚠ revise'}
                  </Text>
                </View>
              )}
            </View>

            <Text style={styles.fieldLabel}>VALOR (R$)</Text>
            <TextInput
              style={styles.fieldInput}
              value={valor}
              onChangeText={setValor}
              keyboardType="decimal-pad"
              placeholder="0,00"
              placeholderTextColor={fg.colors.muted}
            />

            <Text style={[styles.fieldLabel, { marginTop: 12 }]}>DESCRIÇÃO</Text>
            <TextInput
              style={styles.fieldInput}
              value={descricao}
              onChangeText={setDescricao}
              placeholder="Ex: Bar do Bigode"
              placeholderTextColor={fg.colors.muted}
            />

            <Text style={[styles.fieldLabel, { marginTop: 12 }]}>DATA (AAAA-MM-DD)</Text>
            <TextInput
              style={styles.fieldInput}
              value={data}
              onChangeText={setData}
              placeholder="2026-05-22"
              placeholderTextColor={fg.colors.muted}
            />

            {(grupo || subgrupo) && (
              <>
                <Text style={[styles.fieldLabel, { marginTop: 12 }]}>CATEGORIA SUGERIDA</Text>
                <View style={styles.catBadge}>
                  <Text style={styles.catBadgeText}>{grupo}{subgrupo ? ` › ${subgrupo}` : ''}</Text>
                </View>
                <View style={styles.catEditRow}>
                  <TextInput
                    style={[styles.fieldInput, { flex: 1, marginRight: 6 }]}
                    value={grupo}
                    onChangeText={setGrupo}
                    placeholder="Grupo"
                    placeholderTextColor={fg.colors.muted}
                  />
                  <TextInput
                    style={[styles.fieldInput, { flex: 1 }]}
                    value={subgrupo}
                    onChangeText={setSubgrupo}
                    placeholder="Subcategoria"
                    placeholderTextColor={fg.colors.muted}
                  />
                </View>
              </>
            )}

            <View style={styles.botoesRow}>
              <Pressable
                onPress={() => { setEstado('idle'); setParsed(null); setTextoOuvido(''); setTextoManual(''); }}
                style={({ pressed }) => [styles.btnSecundario, pressed && { opacity: 0.8 }]}
              >
                <Text style={styles.btnSecundarioText}>Refazer</Text>
              </Pressable>
              <Pressable
                onPress={salvar}
                disabled={estado === 'salvando'}
                style={({ pressed }) => [styles.btnSalvar, pressed && { opacity: 0.85 }, estado === 'salvando' && { opacity: 0.6 }]}
              >
                {estado === 'salvando'
                  ? <ActivityIndicator size="small" color={fg.colors.bg} />
                  : <Text style={styles.btnSalvarText}>Salvar como pendente</Text>
                }
              </Pressable>
            </View>
          </View>
        )}

        {/* Dicas */}
        {estado === 'idle' && (
          <View style={styles.dicasBox}>
            <Text style={styles.dicasLabel}>EXEMPLOS DE FALA</Text>
            {[
              '"gastei 45 reais no bar"',
              '"paguei 120 no mercado ontem"',
              '"35,50 no ifood hoje"',
              '"almocei por 28 reais no restaurante"',
              '"comprei remédio por 47,50 na farmácia"',
            ].map((d, i) => (
              <Text key={i} style={styles.dicaItem}>{d}</Text>
            ))}
          </View>
        )}

      </View>
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 24, paddingBottom: 40 },

  titulo: { color: fg.colors.text, fontSize: 22, fontWeight: '700', marginBottom: 6 },
  subtitulo: { color: fg.colors.muted, fontSize: 13, lineHeight: 18, marginBottom: 24 },

  micArea: { alignItems: 'center', marginBottom: 24 },
  micBtn: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: fg.colors.accent,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: fg.colors.accent, shadowOpacity: 0.5,
    shadowRadius: 16, shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  micBtnOuvindo: {
    backgroundColor: fg.colors.danger,
    shadowColor: fg.colors.danger,
  },
  micIcon: { fontSize: 38 },
  micStatus: { marginTop: 14, color: fg.colors.muted, fontSize: 13, fontWeight: '500' },

  textoOuvidoBox: {
    marginTop: 16, width: '100%',
    backgroundColor: fg.colors.surface, borderRadius: fg.radius.md,
    borderWidth: 1, borderColor: fg.colors.border, padding: 12,
  },
  textoOuvidoLabel: { color: fg.colors.accent, fontSize: 9, fontWeight: '700', letterSpacing: 0.8, marginBottom: 4 },
  textoOuvido: { color: fg.colors.text, fontSize: 14, fontStyle: 'italic', lineHeight: 20 },

  erroBadge: { marginTop: 12, backgroundColor: 'rgba(255,77,109,0.12)', borderRadius: fg.radius.md, borderWidth: 1, borderColor: 'rgba(255,77,109,0.3)', padding: 10 },
  erroText: { color: fg.colors.danger, fontSize: 12, fontWeight: '600' },

  manualArea: { marginBottom: 16 },
  manualLabel: { color: fg.colors.muted, fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginBottom: 8 },
  manualRow: { flexDirection: 'row', gap: 8 },
  manualInput: {
    flex: 1, backgroundColor: fg.colors.surface, borderWidth: 1, borderColor: fg.colors.border,
    borderRadius: fg.radius.md, paddingHorizontal: 12, paddingVertical: 12,
    color: fg.colors.text, fontSize: 13,
  },
  manualBtn: {
    backgroundColor: fg.colors.accent, borderRadius: fg.radius.md,
    width: 48, alignItems: 'center', justifyContent: 'center',
  },
  manualBtnText: { color: fg.colors.bg, fontSize: 20, fontWeight: '700' },

  revisaoCard: {
    backgroundColor: fg.colors.surface, borderWidth: 1, borderColor: fg.colors.border,
    borderRadius: fg.radius.lg, padding: 16, marginBottom: 16,
  },
  revisaoHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  revisaoTitulo: { color: fg.colors.text, fontSize: 15, fontWeight: '700' },
  confiancaBadge: { borderRadius: fg.radius.pill, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1 },
  badgeAlta: { backgroundColor: 'rgba(34,211,139,0.15)', borderColor: 'rgba(34,211,139,0.3)' },
  badgeMedia: { backgroundColor: 'rgba(251,191,36,0.15)', borderColor: 'rgba(251,191,36,0.3)' },
  badgeBaixa: { backgroundColor: 'rgba(255,77,109,0.12)', borderColor: 'rgba(255,77,109,0.3)' },
  confiancaText: { fontSize: 10, fontWeight: '700', color: fg.colors.muted },

  fieldLabel: { color: fg.colors.muted, fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginBottom: 6 },
  fieldInput: {
    backgroundColor: fg.colors.surface2, borderWidth: 1, borderColor: fg.colors.border,
    borderRadius: fg.radius.md, paddingHorizontal: 12, paddingVertical: 10,
    color: fg.colors.text, fontSize: 14, fontWeight: '600',
  },

  catBadge: {
    backgroundColor: 'rgba(34,211,139,0.12)', borderRadius: fg.radius.pill,
    borderWidth: 1, borderColor: 'rgba(34,211,139,0.25)',
    paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'flex-start', marginBottom: 8,
  },
  catBadgeText: { color: fg.colors.accent, fontSize: 12, fontWeight: '700' },
  catEditRow: { flexDirection: 'row', marginTop: 4 },

  botoesRow: { flexDirection: 'row', gap: 10, marginTop: 20 },
  btnSecundario: {
    flex: 1, paddingVertical: 12, borderRadius: fg.radius.md,
    backgroundColor: fg.colors.surface2, borderWidth: 1, borderColor: fg.colors.border,
    alignItems: 'center',
  },
  btnSecundarioText: { color: fg.colors.muted, fontSize: 13, fontWeight: '700' },
  btnSalvar: {
    flex: 2, paddingVertical: 12, borderRadius: fg.radius.md,
    backgroundColor: fg.colors.accent, alignItems: 'center',
  },
  btnSalvarText: { color: fg.colors.bg, fontSize: 13, fontWeight: '900' },

  dicasBox: {
    marginTop: 8, backgroundColor: fg.colors.surface,
    borderRadius: fg.radius.md, borderWidth: 1, borderColor: fg.colors.border, padding: 14,
  },
  dicasLabel: { color: fg.colors.muted, fontSize: 9, fontWeight: '700', letterSpacing: 0.8, marginBottom: 8 },
  dicaItem: { color: fg.colors.muted, fontSize: 12, fontStyle: 'italic', marginBottom: 4 },
});
