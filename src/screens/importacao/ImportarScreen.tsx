// src/screens/importacao/ImportarScreen.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../../lib/supabase';
import { AppStackParamList } from '../../navigation/AppStack';
import { importarExtratoTexto } from '../../utils/importacaoExtrato';
import { getImportacaoPreviewPayload, setImportacaoPreviewPayload } from '../../utils/importacaoPreviewSession';
import { fg } from '../../theme/fgTheme';
import {
  FGAlertBox,
  FGButton,
  FGCard,
  FGCentered,
  FGHeader,
  FGInput,
  FGScrollScreen,
  FGSelect,
} from '../../components/ui/FG';

type NavProp = NativeStackNavigationProp<AppStackParamList>;

type GrupoAtivo = {
  grupo_id: string;
  papel: 'owner' | 'viewer';
};

type Conta = {
  id: string;
  nome: string;
  tipo?: string | null;
};

function todayISO() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isISODateYYYYMMDD(v: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function maxDataExtratoISO(transacoes: Array<any>): string | null {
  let max: string | null = null;
  for (const t of transacoes || []) {
    const data = String(t?.data || '').trim();
    if (!data) continue;
    if (!isISODateYYYYMMDD(data)) continue;
    if (!max || data > max) max = data;
  }
  return max;
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

function truncarExtratoAposMarcador(texto: string) {
  const raw = String(texto || '');
  const lines = raw.split(/\r?\n/);

  let cutIndex = -1;
  let marcadorLinha: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i] ?? '';
    const n = normFind(ln);

    if (n.includes('lancamentos futuros') || n.includes('saidas futuras')) {
      cutIndex = i;
      marcadorLinha = ln.trim();
      break;
    }
  }

  if (cutIndex < 0) {
    return { textoUtil: raw, cortou: false, marcador: null as string | null, linhasRemovidas: 0 };
  }

  const textoUtil = lines.slice(0, cutIndex).join('\n').trimEnd();
  const linhasRemovidas = Math.max(0, lines.length - cutIndex);

  return { textoUtil, cortou: true, marcador: marcadorLinha, linhasRemovidas };
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

// ✅ Mantém seu “5,9” consistente como “5,90” (não mexe na data porque só pega ,/.)
function normalizarValores1CasaDecimal(texto: string) {
  const raw = String(texto || '');
  return raw.replace(/(\d)([,.])(\d)(?!\d)/g, '$1$2$30');
}

function pareceLinhaDataDescValor(dateStr: string, valueStr: string) {
  const d = String(dateStr || '').trim();
  const v = String(valueStr || '').trim();

  const okDate =
    /^\d{2}\/\d{2}\/\d{4}$/.test(d) ||
    /^\d{4}-\d{2}-\d{2}$/.test(d) ||
    /^\d{1,2}\s+(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\.?$/i.test(d);
  const okValue = /^[-+]?\d[\d.,]*$/.test(v) && /\d/.test(v);

  return okDate && okValue;
}

// ✅ CORREÇÃO PRINCIPAL: só sanitiza descrição, não a data.
function sanitizarDescricaoNoExtrato(texto: string) {
  const raw = String(texto || '');
  const lines = raw.split(/\r?\n/);

  let alteradas = 0;

  const out = lines.map((ln) => {
    const line = String(ln ?? '');
    const t = line.trim();
    if (!t) return line;

    // evita mexer em OFX/XML
    if (t.startsWith('<') || t.includes('OFX') || t.includes('DTPOSTED') || t.includes('TRNAMT')) return line;

    // prioriza TSV (seu caso)
    if (line.includes('\t')) {
      const parts = line.split('\t').map((p) => p.trim()).filter((p) => p.length > 0);
      if (parts.length >= 3) {
        const dateStr = parts[0];
        const valueStr = parts[parts.length - 1];
        if (pareceLinhaDataDescValor(dateStr, valueStr)) {
          const descRaw = parts.slice(1, -1).join(' ').trim();
          const descSan = descRaw
            .replace(/[\/.]+/g, ' ')     // aqui resolve APPLE.COM/BILL
            .replace(/\s+/g, ' ')
            .trim();

          if (descSan !== descRaw) alteradas += 1;

          // reconstruir em TSV (mantém seu padrão)
          return `${dateStr}\t${descSan}\t${valueStr}`;
        }
      }
    }

    // fallback: tenta regex "DATA ... VALOR"
    const m =
      t.match(/^(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+([-+]?\d[\d.,]*)$/) ||
      t.match(/^(\d{4}-\d{2}-\d{2})\s+(.+?)\s+([-+]?\d[\d.,]*)$/);

    if (m) {
      const dateStr = m[1];
      const descRaw = m[2];
      const valueStr = m[3];

      if (pareceLinhaDataDescValor(dateStr, valueStr)) {
        const descSan = descRaw
          .replace(/[\/.]+/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        if (descSan !== descRaw) alteradas += 1;

        return `${dateStr}\t${descSan}\t${valueStr}`;
      }
    }

    return line;
  });

  return { texto: out.join('\n'), alteradas };
}

export default function ImportarScreen() {
  const navigation = useNavigation<NavProp>();

  const [loading, setLoading] = useState(true);
  const [processando, setProcessando] = useState(false);
  const [erroTela, setErroTela] = useState<string | null>(null);

  const [grupoAtivo, setGrupoAtivo] = useState<GrupoAtivo | null>(null);
  const [contas, setContas] = useState<Conta[]>([]);
  const [contaSelecionada, setContaSelecionada] = useState<Conta | null>(null);

  const [textoExtrato, setTextoExtrato] = useState('');
  const [saldoExtratoRef, setSaldoExtratoRef] = useState('');
  const [buscaConta, setBuscaConta] = useState('');
  const [modalConta, setModalConta] = useState(false);

  const [erroProcessamento, setErroProcessamento] = useState<string | null>(null);
  const [infoProcessamento, setInfoProcessamento] = useState<string | null>(null);

  // Detecta retorno da tela de preview: se o payload foi limpo lá, o import foi concluído
  const foiParaPreviewRef = useRef(false);

  useFocusEffect(useCallback(() => {
    if (!foiParaPreviewRef.current) return;
    foiParaPreviewRef.current = false;
    // Payload null = import concluído com sucesso → limpa formulário
    if (getImportacaoPreviewPayload() === null) {
      setTextoExtrato('');
      setSaldoExtratoRef('');
      setContaSelecionada(null);
      setUltimoResumo(null);
      setErroProcessamento(null);
      setInfoProcessamento(null);
    }
  }, []));

  const [ultimoResumo, setUltimoResumo] = useState<{
    total: number;
    saldoFinal: number;
    formato: string;
    dataReferencia: string;
    corteFuturosAtivo: boolean;
    corteFuturosMarcador: string | null;
    corteFuturosLinhasRemovidas: number;
    pagamentosIgnorados: number;
    normalizados1Casa: boolean;
    descricoesSanitizadas: number;
  } | null>(null);

  const isViewer = grupoAtivo?.papel === 'viewer';

  const formatarMoeda = (valor: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor || 0);

  const carregarGrupoAtivo = useCallback(async (): Promise<GrupoAtivo> => {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user?.id) throw new Error('Usuário não autenticado.');

    const { data, error } = await supabase
      .from('grupo_membros')
      .select('grupo_id, papel, status')
      .eq('user_id', authData.user.id)
      .eq('status', 'ativo')
      .order('created_at', { ascending: true })
      .limit(1);

    if (error) throw new Error(`Não foi possível carregar acesso. (${error.message})`);
    if (!data?.length) throw new Error('Nenhum acesso ativo encontrado.');

    return { grupo_id: data[0].grupo_id, papel: data[0].papel } as GrupoAtivo;
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

  const carregarTela = useCallback(async () => {
    setErroTela(null);
    try {
      const grupo = await carregarGrupoAtivo();
      setGrupoAtivo(grupo);
      await carregarContas(grupo.grupo_id);
    } catch (e: any) {
      setErroTela(e?.message || 'Erro ao carregar tela.');
      setGrupoAtivo(null);
      setContas([]);
    }
  }, [carregarGrupoAtivo, carregarContas]);

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

  const contasFiltradas = useMemo(() => {
    const t = buscaConta.trim().toLowerCase();
    if (!t) return contas;
    return contas.filter((c) => c.nome.toLowerCase().includes(t));
  }, [contas, buscaConta]);

  const processarImportacao = async () => {
    if (processando) return;

    setErroProcessamento(null);
    setInfoProcessamento(null);

    if (isViewer) {
      setErroProcessamento('Seu perfil é de visualização — sem permissão para importar.');
      return;
    }
    if (!grupoAtivo?.grupo_id) {
      setErroProcessamento('Acesso não identificado. Tente recarregar a tela.');
      return;
    }
    if (!contaSelecionada?.id) {
      setErroProcessamento('Selecione a conta ou cartão antes de continuar.');
      return;
    }
    if (!textoExtrato.trim()) {
      setErroProcessamento('Cole o texto do extrato no campo acima.');
      return;
    }

    setProcessando(true);

    try {
      const corte = truncarExtratoAposMarcador(textoExtrato);
      const san = sanitizarDescricaoNoExtrato(corte.textoUtil);
      const textoNormalizado = normalizarValores1CasaDecimal(san.texto);

      const resultado = importarExtratoTexto(textoNormalizado);

      const contaEhCartao = String(contaSelecionada.tipo || '').toLowerCase() === 'cartao';

      let transacoes = (resultado.transacoes || []) as Array<any>;

      let ignoradosPagamento = 0;
      if (contaEhCartao) {
        const antes = transacoes.length;
        transacoes = transacoes.filter((t: any) => {
          const desc = t?.descricao ?? t?.historico ?? t?.memo ?? t?.texto ?? '';
          return !isPagamentoEfetuado(desc);
        });
        ignoradosPagamento = antes - transacoes.length;
      }

      const dataReferencia = maxDataExtratoISO(transacoes) || todayISO();

      setUltimoResumo({
        total: transacoes.length,
        saldoFinal: resultado.estatisticas.saldoFinal,
        formato: resultado.formato,
        dataReferencia,
        corteFuturosAtivo: corte.cortou,
        corteFuturosMarcador: corte.marcador,
        corteFuturosLinhasRemovidas: corte.linhasRemovidas,
        pagamentosIgnorados: ignoradosPagamento,
        normalizados1Casa: textoNormalizado !== san.texto,
        descricoesSanitizadas: san.alteradas,
      });

      if (!transacoes.length) {
        const msg = corte.cortou
          ? `Nenhum lançamento válido encontrado antes do marcador “${corte.marcador}”. Verifique o formato do extrato.`
          : `Nenhum lançamento válido encontrado. Formato detectado: ${resultado.formato}. Verifique se o texto foi copiado corretamente.`;
        setErroProcessamento(msg);
        return;
      }

      setImportacaoPreviewPayload(
        {
          grupoId: grupoAtivo.grupo_id,
          contaId: contaSelecionada.id,
          contaNome: contaSelecionada.nome,
          contaTipo: contaSelecionada.tipo ?? null,
          formatoDetectado: resultado.formato,
          transacoes,
          dataReferencia,
          saldoExtratoRef: saldoExtratoRef.trim() || null,
          corteFuturos: {
            ativo: corte.cortou,
            marcador: corte.marcador,
            linhasRemovidas: corte.linhasRemovidas,
          },
        } as any
      );

      if (corte.cortou) {
        setInfoProcessamento(`Lançamentos futuros ignorados — tudo após “${corte.marcador}” foi descartado (${corte.linhasRemovidas} linhas).`);
      } else if (normFind(textoExtrato).includes('futuros')) {
        setInfoProcessamento('Encontrei a palavra “futuros” no texto, mas não identifiquei o marcador de corte. Confira se há lançamentos futuros incluídos.');
      }

      foiParaPreviewRef.current = true;
      navigation.navigate('PreviewImportacao');
    } catch (e: any) {
      const msg = (e as any)?.message || 'Não foi possível processar o extrato.';
      setErroProcessamento(msg);
      if (Platform.OS !== 'web') {
        // em mobile, Alert dá mais visibilidade
        const { Alert } = require('react-native');
        Alert.alert('Erro na importação', msg);
      }
    } finally {
      setProcessando(false);
    }
  };

  if (loading) {
    return (
      <FGCentered message="Carregando importação...">
        <ActivityIndicator size="large" color={fg.colors.accent} />
      </FGCentered>
    );
  }

  return (
    <>
      <FGScrollScreen>
        <FGHeader
          title="Importação de Extrato"
          subtitle="Selecione a conta e cole o extrato"
          info="Regra: ignora tudo após “lançamentos futuros / saídas futuras”"
        />

        {erroTela ? <FGAlertBox variant="danger" text={erroTela} /> : null}

        <FGCard>
          <Text style={styles.cardTitle}>Conta / Cartão *</Text>

          <FGSelect
            valueText={contaSelecionada ? contaSelecionada.nome : 'Selecionar conta/cartão'}
            filled={!!contaSelecionada}
            onPress={() => {
              setBuscaConta('');
              setModalConta(true);
            }}
            disabled={processando}
          />

          {contaSelecionada?.tipo ? <Text style={styles.hint}>Tipo: {contaSelecionada.tipo}</Text> : null}
          <Text style={styles.hint}>
            Sanitização: troca “.” e “/” na <Text style={styles.hintStrong}>descrição</Text> (ex.: APPLE.COM/BILL → APPLE COM BILL).
          </Text>
        </FGCard>

        <FGCard>
          <Text style={styles.cardTitle}>Extrato (colar texto)</Text>
          <FGInput
            style={styles.textArea}
            multiline
            placeholder="Cole aqui o extrato (OFX, CSV ou texto copiado do app/banco)..."
            value={textoExtrato}
            onChangeText={setTextoExtrato}
            editable={!processando}
            textAlignVertical="top"
          />
          <Text style={styles.hint}>Dica: pode colar OFX, CSV ou texto copiado do extrato.</Text>
        </FGCard>

        <FGCard>
          <Text style={styles.cardTitle}>Saldo no extrato de referência (opcional)</Text>
          <FGInput
            placeholder="Ex.: 1.234,56"
            value={saldoExtratoRef}
            onChangeText={setSaldoExtratoRef}
            keyboardType="decimal-pad"
            editable={!processando}
          />
          <Text style={styles.hint}>
            Informe o saldo exibido no extrato para conferência após importação.
          </Text>
        </FGCard>

        {ultimoResumo ? (
          <FGCard>
            <Text style={styles.cardTitle}>Último processamento</Text>
            <Text style={styles.resumeText}>Formato: {ultimoResumo.formato}</Text>
            <Text style={styles.resumeText}>Lançamentos (válidos): {ultimoResumo.total}</Text>
            <Text style={styles.resumeText}>Data referência do extrato: {ultimoResumo.dataReferencia}</Text>
            <Text style={styles.resumeText}>
              Descrições sanitizadas: {ultimoResumo.descricoesSanitizadas}
            </Text>
            {ultimoResumo.pagamentosIgnorados > 0 ? (
              <Text style={styles.resumeText}>Pagamentos ignorados: {ultimoResumo.pagamentosIgnorados}</Text>
            ) : null}
            <Text style={styles.resumeText}>
              Saldo final do extrato (informativo): {formatarMoeda(ultimoResumo.saldoFinal)}
            </Text>
          </FGCard>
        ) : null}

        {erroProcessamento ? (
          <FGAlertBox variant="danger" text={erroProcessamento} />
        ) : null}

        {infoProcessamento ? (
          <FGAlertBox variant="warn" text={infoProcessamento} />
        ) : null}

        <View style={{ marginTop: 6 }}>
          <FGButton
            title={processando ? 'Processando...' : 'Processar e revisar'}
            onPress={processarImportacao}
            loading={processando}
            disabled={processando || isViewer}
          />
        </View>
      </FGScrollScreen>

      <Modal visible={modalConta} transparent animationType="fade" onRequestClose={() => setModalConta(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Selecionar conta/cartão</Text>
              <Pressable onPress={() => setModalConta(false)}>
                <Text style={styles.modalClose}>Fechar</Text>
              </Pressable>
            </View>

            <FGInput placeholder="Buscar conta..." value={buscaConta} onChangeText={setBuscaConta} />

            <View style={{ height: 10 }} />

            <ScrollView style={{ maxHeight: 420 }}>
              {contasFiltradas.map((c) => {
                const ativo = contaSelecionada?.id === c.id;
                return (
                  <Pressable
                    key={c.id}
                    style={[styles.optionRow, ativo && styles.optionRowActive]}
                    onPress={() => {
                      setContaSelecionada(c);
                      setModalConta(false);
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.optionTitle}>{c.nome}</Text>
                      {c.tipo ? <Text style={styles.optionMeta}>Tipo: {c.tipo}</Text> : null}
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
  cardTitle: { color: fg.colors.text, fontWeight: '900', fontSize: 13, marginBottom: 10 },
  hint: { marginTop: 6, color: fg.colors.muted, fontSize: 12, fontWeight: '800' },
  hintStrong: { color: fg.colors.text, fontWeight: '900' },

  textArea: { minHeight: 220 },

  resumeText: { color: fg.colors.text, fontSize: 13, marginBottom: 3, fontWeight: '800' },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 16 },
  modalCard: {
    backgroundColor: fg.colors.surface,
    borderRadius: fg.radius.lg,
    borderWidth: 1,
    borderColor: fg.colors.border,
    padding: 12,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  modalTitle: { fontSize: 16, fontWeight: '900', color: fg.colors.text },
  modalClose: { color: fg.colors.text, fontWeight: '900', textDecorationLine: 'underline' },

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
  optionTitle: { color: fg.colors.text, fontWeight: '900', fontSize: 13 },
  optionMeta: { marginTop: 4, color: fg.colors.muted, fontSize: 12, fontWeight: '800' },
  optionCheck: { color: fg.colors.accent, fontWeight: '900', fontSize: 16 },
});