//src/lib/transferencias.ts
import { supabase } from './supabase';

type CriarTransferenciaParams = {
  usuarioId: string;
  dataCaixa: string;   // 'YYYY-MM-DD'
  dataDespesa: string; // 'YYYY-MM-DD' (normalmente igual)
  contaOrigemId: string;
  contaDestinoId: string;
  descricao: string;
  valor: number;       // sempre positivo aqui
  origem?: string;     // 'manual' | 'importacao' etc
  status?: string;     // 'confirmado' | 'pendente' etc
  grupoId?: string | null;
};

export async function criarTransferencia(params: CriarTransferenciaParams) {
  const {
    usuarioId,
    dataCaixa,
    dataDespesa,
    contaOrigemId,
    contaDestinoId,
    descricao,
    valor,
    origem = 'manual',
    status = 'confirmado',
    grupoId = null,
  } = params;

  const valorAbs = Math.abs(Number(valor || 0));
  if (!valorAbs) throw new Error('Informe um valor válido.');
  if (!contaOrigemId || !contaDestinoId) throw new Error('Informe conta origem e destino.');
  if (contaOrigemId === contaDestinoId) throw new Error('Origem e destino não podem ser iguais.');

  const { data, error } = await supabase.rpc('criar_transferencia', {
    p_usuario_id: usuarioId,
    p_data_caixa: dataCaixa,
    p_data_despesa: dataDespesa,
    p_conta_origem_id: contaOrigemId,
    p_conta_destino_id: contaDestinoId,
    p_descricao: (descricao || 'Pagamento de fatura').trim(),
    p_valor: valorAbs,
    p_origem: origem,
    p_status: status,
    p_grupo_id: grupoId,
  });

  if (error) throw error;
  return data as string; // transferencia_id
}

export async function excluirTransferencia(transferenciaId: string) {
  const { error } = await supabase.rpc('excluir_transferencia', {
    p_transferencia_id: transferenciaId,
  });
  if (error) throw error;
}