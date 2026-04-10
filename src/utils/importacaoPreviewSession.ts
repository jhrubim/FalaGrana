// src/utils/importacaoPreviewSession.ts
import type { ResultadoImportacao } from './importacaoExtrato';

export type ImportacaoPreviewPayload = ResultadoImportacao & {
  grupo_id: string;
  grupo_nome: string;
  conta_id: string;
  conta_nome: string;
  conta_tipo?: string | null;
  saldoExtratoRef?: string | null;
};

let payloadAtual: ImportacaoPreviewPayload | null = null;

export function setImportacaoPreviewPayload(payload: ImportacaoPreviewPayload) {
  payloadAtual = payload;
}

export function getImportacaoPreviewPayload() {
  return payloadAtual;
}

export function clearImportacaoPreviewPayload() {
  payloadAtual = null;
}