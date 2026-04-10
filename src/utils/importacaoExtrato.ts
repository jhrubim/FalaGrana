// src/utils/importacaoExtrato.ts
export type TipoTransacaoImportada = 'receita' | 'despesa' | 'transferencia';

export type TransacaoImportada = {
  data: string; // YYYY-MM-DD
  descricao: string;
  valor: number; // pode vir negativo do parser
  tipo: TipoTransacaoImportada;
};

export type ResultadoImportacao = {
  formato: string;
  transacoes: TransacaoImportada[];
  estatisticas: {
    total: number;
    receitas: number;
    despesas: number;
    filtradas: number;
    duplicadasRemovidas: number;
  };
};

export type SugestaoCategoria = {
  grupo: string;
  subgrupo: string;
  confianca: 'alta' | 'media' | 'baixa';
  fonte: 'historico_exato' | 'historico_similar' | 'regra_generica' | 'heuristica' | 'fallback';
};

type ParserDef = {
  nome: string;
  detectar: (texto: string) => boolean;
  parse: (texto: string) => TransacaoImportada[];
};

export function normalizarTexto(texto: string) {
  if (!texto) return '';
  return String(texto)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const FiltroLinhas = {
  PALAVRAS_IGNORADAS: [
    'saldo anterior',
    'saldo do dia',
    'saldo disponivel',
    'saldo disponível',
    'saldo em',
    'novo saldo',
    'saldo atual',
    'saldo final',
    'saldo bloqueado',
    'saldo devedor',
    'saldo credor',
    'saldo negativo',
    'saldo positivo',

    'total da fatura',
    'fatura fechada',
    'fatura aberta',
    'total fatura',
    'fatura atual',
    'fatura anterior',
    'limite disponivel',
    'limite total',
    'limite utilizado',
    'limite de credito',
    'limite de crédito',

    'total de entradas',
    'total de saidas',
    'total de saídas',
    'total creditos',
    'total débitos',
    'total créditos',
    'total débitos',
    'subtotal',
    'total geral',
    'total:',
    'total ',
    'total dos',
    'soma dos',
    'somatório',
    'acumulado',

    'data lancamento',
    'data',
    'historico',
    'histórico',
    'valor',
    'documento',
    'descricao',
    'descrição',
    'lançamento',
    'movimentação',
    'movimentacao',
    'tipo',
    'categoria',
    'origem',
    'destino',
    'natureza',

    'itau unibanco',
    'banco itau',
    'itaú',
    'nubank',
    'banco inter',
    'banco do brasil',
    'bradesco',
    'santander',
    'caixa economica',
    'caixa econômica',
    'original',
    'c6 bank',
    'next',
    'neon',
    'picpay',
    'mercado pago',
    'pagseguro',
    'stone',
    'sumup',

    'ag:',
    'cc:',
    'c/c',
    'conta:',
    'agencia:',
    'agência:',
    'conta corrente',
    'conta poupança',
    'conta salario',
    'conta salário',
    'agencia',
    'agência',
    'conta debito',
    'conta crédito',
    'conta-corrente',
    'nº conta',

    'extrato de',
    'periodo',
    'período',
    'competencia',
    'competência',
    'data inicial',
    'data final',
    'de:',
    'até:',
    'ate:',
    'referente a',
    'referente ao',
    'emissão',
    'emissao',

    'continua...',
    'verso',
    'pagina',
    'página',
    'data mov.',
    'hora',
    'impresso em',
    'emitido em',
    'via internet',
    'via app',
    'internet banking',
    'mobile banking',
    'auto atendimento',
    'caixa eletronico',
    'caixa eletrônico',
    'comprovante',
    'autenticação',
    'autenticacao',
    'protocolo',
  ],

  PADROES_IGNORADOS: [
    /^\d{2}\/\d{2}(\/\d{4})?\s+SALDO\s+(ANTERIOR|DIA|DISPON[IÍ]VEL|ATUAL|FINAL|BLOQUEADO)/i,
    /^\d{2}\/\d{2}(\/\d{4})?\s+SDO\s+/i,
    /^\d{2}\/\d{2}(\/\d{4})?\s+SD\s+/i,
    /^SALDO\s+(ANTERIOR|DIA|DISPON[IÍ]VEL|ATUAL|FINAL|BLOQUEADO)/i,
    /^(TOTAL|SUBTOTAL|SOMA|TOTAL\s+DE|SOMA\s+DOS)\s*[:\-]/i,
    /FATURA\s+(FECHADA|ABERTA|ATUAL|ANTERIOR)/i,
    /^\s*(R\$)?\s*[\d.,]+\s*$/,
    /^.{0,4}$/,
    /^\d{2}\/\d{2}(\/\d{4})?\s*$/,
    /\b\d{2}:\d{2}(:\d{2})?\b/,
    /\b\d{2}h\d{2}\b/i,
    /^\d{40,}$/,
    /(www\.|@|\.com|\.br|http)/i,
    /^R\$\s*[\d.,]+\s*$/,
    /^(DOC|TED|PIX|BOLETO)\s*$/i,
  ] as RegExp[],

  deveIgnorar(linha: string) {
    if (!linha || typeof linha !== 'string') return true;

    const trimmed = linha.trim();
    if (!trimmed) return true;

    const normalizada = trimmed.toLowerCase();

    for (let i = 0; i < this.PALAVRAS_IGNORADAS.length; i++) {
      if (normalizada.includes(this.PALAVRAS_IGNORADAS[i])) return true;
    }

    for (let i = 0; i < this.PADROES_IGNORADOS.length; i++) {
      if (this.PADROES_IGNORADOS[i].test(trimmed)) return true;
    }

    return false;
  },

  filtrar(linhas: string[]) {
    if (!Array.isArray(linhas)) return [];

    const resultado: string[] = [];
    for (let i = 0; i < linhas.length; i++) {
      const linha = linhas[i];
      if (!this.deveIgnorar(linha)) resultado.push(linha);
    }

    return resultado;
  },

  filtrarTexto(texto: string) {
    if (!texto) return '';
    const linhas = texto.split('\n');
    return this.filtrar(linhas).join('\n');
  },
};

function converterData(dataStr: string) {
  if (!dataStr) return new Date().toISOString().split('T')[0];

  const str = String(dataStr).trim();

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
    const [dia, mes, ano] = str.split('/');
    return `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
  }

  if (/^\d{2}\/\d{2}$/.test(str)) {
    const [dia, mes] = str.split('/');
    const ano = new Date().getFullYear();
    return `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }

  if (/^\d{2}-\d{2}-\d{4}$/.test(str)) {
    const [mes, dia, ano] = str.split('-');
    return `${ano}-${mes}-${dia}`;
  }

  const data = new Date(str);
  if (!Number.isNaN(data.getTime())) return data.toISOString().split('T')[0];

  return new Date().toISOString().split('T')[0];
}

function parseItau(texto: string): TransacaoImportada[] {
  const transacoes: TransacaoImportada[] = [];
  const linhas = FiltroLinhas.filtrar(texto.split('\n'));

  for (const linha of linhas) {
    const limpa = linha.replace(/\t/g, ' ').replace(/\s+/g, ' ').trim();
    const partes = limpa.split(' ');

    if (partes.length < 3) continue;

    const data = partes[0];
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(data)) continue;

    const valorStr = partes[partes.length - 1];
    if (!/^-?[\d.,]+$/.test(valorStr)) continue;

    const descricao = partes.slice(1, -1).join(' ').trim();
    if (!descricao) continue;

    if (/SALDO\s+(ANTERIOR|DIA|ATUAL|FINAL|DISPON[IÍ]VEL)|\bSDO\b|\bTOTAL\b/i.test(descricao)) {
      continue;
    }

    const valor = parseFloat(valorStr.replace(/\./g, '').replace(',', '.'));
    if (Number.isNaN(valor) || valor === 0) continue;

    transacoes.push({
      data: converterData(data),
      descricao,
      valor,
      tipo: valor < 0 ? 'despesa' : 'receita',
    });
  }

  return transacoes;
}

function parseNubank(texto: string): TransacaoImportada[] {
  const transacoes: TransacaoImportada[] = [];
  const linhas = texto.split('\n');

  for (const linhaOriginal of linhas) {
    const linha = linhaOriginal.trim();
    if (!linha) continue;

    const partes = linha.split(',');
    if (partes.length < 3) continue;

    const data = (partes[0] || '').replace(/"/g, '').trim();
    const descricao = (partes[1] || '').replace(/"/g, '').trim();
    const valorStr = (partes[2] || '').replace(/"/g, '').trim();

    if (/^data$/i.test(data) || /^descri[cç][aã]o$/i.test(descricao)) continue;
    if (FiltroLinhas.deveIgnorar(descricao)) continue;

    const valor = parseFloat(String(valorStr).replace(/\./g, '').replace(',', '.'));
    if (Number.isNaN(valor) || !descricao) continue;

    transacoes.push({
      data: converterData(data),
      descricao,
      valor,
      tipo: valor < 0 ? 'despesa' : 'receita',
    });
  }

  return transacoes;
}

function parseOFX(texto: string): TransacaoImportada[] {
  const transacoes: TransacaoImportada[] = [];
  const regexTransacao = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
  let match: RegExpExecArray | null;

  while ((match = regexTransacao.exec(texto)) !== null) {
    const bloco = match[1];

    const dataMatch = bloco.match(/<DTPOSTED>(\d{8})/i);
    const valorMatch = bloco.match(/<TRNAMT>([-\d.]+)/i);
    const descMatch = bloco.match(/<MEMO>([^<]+)/i);

    if (!dataMatch || !valorMatch) continue;

    const data = dataMatch[1];
    const valor = parseFloat(valorMatch[1]);
    const descricao = descMatch ? descMatch[1].trim() : 'Sem descrição';

    if (FiltroLinhas.deveIgnorar(descricao)) continue;
    if (Number.isNaN(valor) || valor === 0) continue;

    transacoes.push({
      data: `${data.substring(0, 4)}-${data.substring(4, 6)}-${data.substring(6, 8)}`,
      descricao,
      valor,
      tipo: valor < 0 ? 'despesa' : 'receita',
    });
  }

  return transacoes;
}

function parseCSV(texto: string): TransacaoImportada[] {
  const transacoes: TransacaoImportada[] = [];
  const linhas = texto.split('\n');

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i].trim();
    if (!linha) continue;

    const delimitador = linha.includes(';') && !linha.includes(',') ? ';' : ',';
    const partes = linha.split(delimitador);
    if (partes.length < 3) continue;

    const data = (partes[0] || '').replace(/"/g, '').trim();
    const descricao = (partes[1] || '').replace(/"/g, '').trim();
    const valor = parseFloat(
      String(partes[2] || '')
        .replace(/"/g, '')
        .replace(/[^\d,.-]/g, '')
        .replace(/\./g, '')
        .replace(',', '.')
    );

    if (/^data$/i.test(data) || /^descri[cç][aã]o$/i.test(descricao)) continue;
    if (FiltroLinhas.deveIgnorar(descricao)) continue;
    if (Number.isNaN(valor) || !descricao) continue;

    transacoes.push({
      data: converterData(data),
      descricao,
      valor,
      tipo: valor < 0 ? 'despesa' : 'receita',
    });
  }

  return transacoes;
}

function parseGenerico(texto: string): TransacaoImportada[] {
  const transacoes: TransacaoImportada[] = [];
  const linhas = FiltroLinhas.filtrar(texto.split('\n'));

  for (const linhaOriginal of linhas) {
    const linha = linhaOriginal.replace(/\t/g, ' ').replace(/\s+/g, ' ').trim();
    if (!linha) continue;

    const dataMatch = linha.match(/(\d{2}\/\d{2}\/\d{4})/) || linha.match(/(\d{2}\/\d{2})/);
    if (!dataMatch) continue;

    const dataStr = dataMatch[1];

    let valorMatch = linha.match(/(-?\d{1,3}(?:\.\d{3})*,\d{2})\s*$/);
    if (!valorMatch) valorMatch = linha.match(/(-?\d+[.,]\d{2})\s*$/);
    if (!valorMatch) continue;

    const valorBr = valorMatch[1];
    const valor = parseFloat(valorBr.replace(/\./g, '').replace(',', '.'));
    if (Number.isNaN(valor) || valor === 0) continue;

    let descricao = linha
      .replace(dataStr, '')
      .replace(valorBr, '')
      .replace(/\s+/g, ' ')
      .trim();

    descricao = descricao.replace(/^[\-–—:]+|[\-–—:]+$/g, '').trim();

    if (!descricao || descricao.length < 2) continue;
    if (FiltroLinhas.deveIgnorar(descricao)) continue;
    if (/SALDO\s+(ANTERIOR|DIA|ATUAL|FINAL|DISPON[IÍ]VEL)/i.test(descricao)) continue;

    transacoes.push({
      data: converterData(dataStr),
      descricao,
      valor,
      tipo: valor < 0 ? 'despesa' : 'receita',
    });
  }

  return transacoes;
}

const PARSERS: Record<string, ParserDef> = {
  ofx: {
    nome: 'OFX',
    detectar: (texto) => /<OFX>|<BANKMSGSRSV1>|<STMTTRN>/i.test(texto),
    parse: parseOFX,
  },
  nubank: {
    nome: 'Nubank CSV',
    detectar: (texto) =>
      /descri[cç][aã]o/i.test(texto) &&
      /data/i.test(texto) &&
      /valor/i.test(texto) &&
      /,/.test(texto),
    parse: parseNubank,
  },
  itau: {
    nome: 'Itaú',
    detectar: (texto) =>
      texto.includes('ITAÚ') ||
      texto.includes('AGÊNCIA') ||
      texto.includes('CONTA CORRENTE') ||
      texto.includes('SALDO TOTAL DISPONÍVEL') ||
      /^\d{2}\/\d{2}\/\d{4}/m.test(texto),
    parse: parseItau,
  },
  csv: {
    nome: 'CSV',
    detectar: (texto) => /,|;/.test(texto) && /\d{2}[\/-]\d{2}/.test(texto),
    parse: parseCSV,
  },
  generico: {
    nome: 'Genérico',
    detectar: () => true,
    parse: parseGenerico,
  },
};

function detectarFormato(texto: string) {
  for (const [key, parser] of Object.entries(PARSERS)) {
    if (parser.detectar(texto)) return { formato: key, nome: parser.nome };
  }
  return null;
}

function removerDuplicatas(transacoes: TransacaoImportada[]) {
  const vistas = new Set<string>();

  return transacoes.filter((t) => {
    const chave = `${t.data}|${Math.abs(Number(t.valor || 0)).toFixed(2)}|${normalizarTexto(t.descricao || '')}`;
    if (vistas.has(chave)) return false;
    vistas.add(chave);
    return true;
  });
}

export function importarExtratoTexto(textoBruto: string): ResultadoImportacao {
  if (!textoBruto || !String(textoBruto).trim()) {
    throw new Error('Extrato vazio.');
  }

  const linhasOriginais = textoBruto.split('\n').length;
  const textoFiltrado = FiltroLinhas.filtrarTexto(textoBruto);
  const linhasFiltradas = textoFiltrado ? textoFiltrado.split('\n').length : 0;

  const formatoDetectado = detectarFormato(textoFiltrado || textoBruto);
  if (!formatoDetectado) {
    throw new Error('Formato não reconhecido.');
  }

  let transacoes = PARSERS[formatoDetectado.formato].parse(textoFiltrado || textoBruto);

  if (!Array.isArray(transacoes) || transacoes.length === 0) {
    throw new Error('Nenhuma transação encontrada no extrato.');
  }

  const antes = transacoes.length;
  transacoes = removerDuplicatas(transacoes);
  const removidas = antes - transacoes.length;

  return {
    formato: formatoDetectado.nome,
    transacoes,
    estatisticas: {
      total: transacoes.length,
      receitas: transacoes.filter((t) => Number(t.valor) > 0).length,
      despesas: transacoes.filter((t) => Number(t.valor) < 0).length,
      filtradas: Math.max(0, linhasOriginais - linhasFiltradas),
      duplicadasRemovidas: removidas,
    },
  };
}

function categorizarPorHeuristica(descricao: string): SugestaoCategoria {
  const lower = normalizarTexto(descricao);

  if (lower.includes('pix') && (lower.includes('receb') || lower.includes('credito'))) {
    return { grupo: 'Receitas', subgrupo: 'Outras Receitas', confianca: 'baixa', fonte: 'heuristica' };
  }

  if (lower.includes('pix') && (lower.includes('envi') || lower.includes('debito'))) {
    return { grupo: 'Financeiro', subgrupo: 'Transferência entre Contas', confianca: 'baixa', fonte: 'heuristica' };
  }

  if (lower.includes('cartao') || lower.includes('cartão')) {
    return { grupo: 'Financeiro', subgrupo: 'Pagamento Fatura', confianca: 'baixa', fonte: 'heuristica' };
  }

  return { grupo: 'Outros', subgrupo: 'Não categorizado', confianca: 'baixa', fonte: 'fallback' };
}

export function categorizarPorRegras(descricao: string): SugestaoCategoria {
  const normalizada = normalizarTexto(descricao);

  const palavrasChave: Record<string, { grupo: string; subgrupo: string }> = {
    'mercado|supermercado|carrefour|walmart|pao de acucar|extra|assai|atacadao': {
      grupo: 'Alimentação',
      subgrupo: 'Mercado',
    },
    'feira|hortifruti|horti fruti|sacolao|acougue': {
      grupo: 'Alimentação',
      subgrupo: 'Açougue/Hortifruti',
    },
    'restaurante|almoco|jantar|madero|outback|burger|mcdonalds|subway': {
      grupo: 'Alimentação',
      subgrupo: 'Restaurantes',
    },
    'ifood|rappi|uber eats|delivery': {
      grupo: 'Alimentação',
      subgrupo: 'Delivery',
    },
    'cafe|lanchonete|lanche': {
      grupo: 'Alimentação',
      subgrupo: 'Café/Lanches',
    },

    'uber|99|taxi|cabify': {
      grupo: 'Transporte',
      subgrupo: 'Aplicativos (Uber/99)',
    },
    'posto|shell|ipiranga|petrobras|combustivel|gasolina|etanol|diesel': {
      grupo: 'Transporte',
      subgrupo: 'Combustível',
    },
    'metro|onibus|bilhete unico|recarga transporte': {
      grupo: 'Transporte',
      subgrupo: 'Transporte Público',
    },
    'estacionamento|estapar|zona azul': {
      grupo: 'Transporte',
      subgrupo: 'Estacionamento',
    },
    'pedagio|sem parar': {
      grupo: 'Transporte',
      subgrupo: 'Pedágio',
    },

    'farmacia|droga|drogasil|raia|pague menos': {
      grupo: 'Saúde',
      subgrupo: 'Medicamentos',
    },
    'unimed|amil|bradesco saude|sulamerica|plano de saude': {
      grupo: 'Saúde',
      subgrupo: 'Plano de Saúde',
    },
    'consulta|medico|dentista|odonto|clinica|laboratorio|exame': {
      grupo: 'Saúde',
      subgrupo: 'Consultas',
    },
    'academia|smart fit|bio ritmo': {
      grupo: 'Saúde',
      subgrupo: 'Academia',
    },

    'escola|matricula|mensalidade escola': {
      grupo: 'Educação',
      subgrupo: 'Mensalidade',
    },
    'curso|udemy|alura': {
      grupo: 'Educação',
      subgrupo: 'Cursos',
    },
    'ingles|wizard|ccaa|cultura inglesa': {
      grupo: 'Educação',
      subgrupo: 'Idiomas',
    },
    'livro|material escolar|papelaria': {
      grupo: 'Educação',
      subgrupo: 'Livros/Materiais',
    },

    netflix: {
      grupo: 'Assinaturas',
      subgrupo: 'Netflix',
    },
    spotify: {
      grupo: 'Assinaturas',
      subgrupo: 'Spotify',
    },
    'youtube premium': {
      grupo: 'Assinaturas',
      subgrupo: 'YouTube Premium',
    },
    'amazon prime|prime video': {
      grupo: 'Assinaturas',
      subgrupo: 'Amazon Prime',
    },
    'disney|max|hbo': {
      grupo: 'Assinaturas',
      subgrupo: 'Disney+/Max/Outros',
    },
    'apple|icloud|google one|microsoft 365': {
      grupo: 'Assinaturas',
      subgrupo: 'Apps/Softwares',
    },

    'salario|pagamento folha|folha|remuneracao': {
      grupo: 'Receitas',
      subgrupo: 'Salário',
    },
    'decimo terceiro': {
      grupo: 'Receitas',
      subgrupo: 'Décimo Terceiro',
    },
    ferias: {
      grupo: 'Receitas',
      subgrupo: 'Férias',
    },
    'plr|ppr': {
      grupo: 'Receitas',
      subgrupo: 'PPR/PLR',
    },
    reembolso: {
      grupo: 'Receitas',
      subgrupo: 'Reembolso Empresa',
    },
    'restituicao|irpf|nf paulista': {
      grupo: 'Receitas',
      subgrupo: 'Restituição IR',
    },
    'freelance|extra': {
      grupo: 'Receitas',
      subgrupo: 'Freelance/Extras',
    },

    condominio: {
      grupo: 'Moradia',
      subgrupo: 'Condomínio',
    },
    'enel|energia|cpfl|eletropaulo|luz': {
      grupo: 'Moradia',
      subgrupo: 'Energia Elétrica',
    },
    'sabesp|agua': {
      grupo: 'Moradia',
      subgrupo: 'Água/Esgoto',
    },
    'gas|comgas': {
      grupo: 'Moradia',
      subgrupo: 'Gás',
    },
    'vivo|claro|tim|internet fibra|fibra': {
      grupo: 'Moradia',
      subgrupo: 'Internet',
    },
    iptu: {
      grupo: 'Moradia',
      subgrupo: 'IPTU',
    },
    'aluguel|financiamento imobiliario': {
      grupo: 'Moradia',
      subgrupo: 'Aluguel/Financiamento',
    },

    'pet shop|petshop|cobasi|petz': {
      grupo: 'Pets',
      subgrupo: 'Ração',
    },
    'veterinario|vet': {
      grupo: 'Pets',
      subgrupo: 'Veterinário',
    },

    'cinema|show|teatro': {
      grupo: 'Lazer',
      subgrupo: 'Cinema/Shows',
    },
    'viagem|hotel|airbnb': {
      grupo: 'Lazer',
      subgrupo: 'Viagens',
    },

    'tarifa|taxa banc': {
      grupo: 'Impostos/Taxas',
      subgrupo: 'Taxas Bancárias',
    },
    anuidade: {
      grupo: 'Impostos/Taxas',
      subgrupo: 'Taxas Cartão',
    },
    iof: {
      grupo: 'Financeiro',
      subgrupo: 'IOF',
    },
    'juros|multa atraso': {
      grupo: 'Financeiro',
      subgrupo: 'Juros/Multas',
    },
    'transferencia|ted|doc': {
      grupo: 'Financeiro',
      subgrupo: 'Transferência entre Contas',
    },
    'fatura cartao': {
      grupo: 'Financeiro',
      subgrupo: 'Pagamento Fatura',
    },

    'fii|fundo imobiliario': {
      grupo: 'Investimentos',
      subgrupo: 'Fundos Imobiliários (FIIs)',
    },
    'dividendo|provento': {
      grupo: 'Investimentos',
      subgrupo: 'Proventos/Dividendos',
    },
    'corretora|xp investimentos|rico|clear': {
      grupo: 'Investimentos',
      subgrupo: 'Aporte',
    },
    'resgate aplicacao': {
      grupo: 'Investimentos',
      subgrupo: 'Resgate',
    },
  };

  for (const [padrao, categoria] of Object.entries(palavrasChave)) {
    if (new RegExp(padrao, 'i').test(normalizada)) {
      return {
        ...categoria,
        confianca: 'media',
        fonte: 'regra_generica',
      };
    }
  }

  return categorizarPorHeuristica(descricao);
}