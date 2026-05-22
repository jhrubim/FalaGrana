// src/utils/parsearVoz.ts
// Interpreta texto em PT-BR e extrai dados de um lançamento financeiro

export type VozParsed = {
  valor: number | null;
  descricao: string;
  data: string;       // YYYY-MM-DD
  grupoSugerido: string | null;
  subgrupoSugerido: string | null;
  confianca: 'alta' | 'media' | 'baixa';
};

// ─── Mapeamento de palavras-chave → categoria ─────────────────────────────────

const CATEGORIA_MAP: Array<{ palavras: string[]; grupo: string; subgrupo: string }> = [
  { palavras: ['mercado', 'supermercado', 'hortifruti', 'feira', 'quitanda', 'carrefour', 'extra', 'pao de acucar', 'assai', 'atacadao'], grupo: 'Alimentação', subgrupo: 'Mercado' },
  { palavras: ['restaurante', 'almoco', 'jantar', 'lanchonete', 'sushi', 'pizza', 'churrasco', 'steakhouse', 'bistrô', 'bistro', 'comida'], grupo: 'Alimentação', subgrupo: 'Restaurantes' },
  { palavras: ['ifood', 'delivery', 'rappi', 'uber eats', 'pedido'], grupo: 'Alimentação', subgrupo: 'Delivery' },
  { palavras: ['padaria', 'cafe', 'cafeteria', 'lanche', 'pao', 'pastelaria', 'confeitaria'], grupo: 'Alimentação', subgrupo: 'Café/Lanches' },
  { palavras: ['bar', 'boteco', 'cerveja', 'chopp', 'drinks', 'pub', 'happy hour', 'balada'], grupo: 'Lazer', subgrupo: 'Bares' },
  { palavras: ['cinema', 'teatro', 'show', 'ingresso', 'bilhete', 'parque'], grupo: 'Lazer', subgrupo: 'Cinema/Shows' },
  { palavras: ['viagem', 'hotel', 'pousada', 'airbnb', 'passagem', 'aerea', 'voo', 'uber viagem'], grupo: 'Lazer', subgrupo: 'Viagens' },
  { palavras: ['jiu', 'academia', 'crossfit', 'pilates', 'natacao', 'futebol', 'quadra', 'esporte', 'gym'], grupo: 'Lazer', subgrupo: 'Jiu-Jitsu' },
  { palavras: ['combustivel', 'gasolina', 'etanol', 'diesel', 'posto', 'shell', 'ipiranga', 'br'], grupo: 'Transporte', subgrupo: 'Combustível' },
  { palavras: ['uber', 'taxi', '99', 'cabify', 'transporte', 'onibus', 'metro', 'trem'], grupo: 'Transporte', subgrupo: 'Transporte por App' },
  { palavras: ['estacionamento', 'pedágio', 'pedagio', 'valet'], grupo: 'Transporte', subgrupo: 'Estacionamento' },
  { palavras: ['farmacia', 'remedio', 'medicamento', 'drogaria', 'ultrafarma', 'panvel'], grupo: 'Saúde', subgrupo: 'Medicamentos' },
  { palavras: ['medico', 'consulta', 'exame', 'laboratorio', 'clinica', 'dentista', 'ortopedista', 'dermato'], grupo: 'Saúde', subgrupo: 'Consultas/Exames' },
  { palavras: ['escola', 'faculdade', 'mensalidade', 'colegio', 'curso', 'ingles', 'aula'], grupo: 'Educação', subgrupo: 'Mensalidade Escolar' },
  { palavras: ['livro', 'material', 'caderno', 'caneta', 'livraria'], grupo: 'Educação', subgrupo: 'Livros/Materiais' },
  { palavras: ['salao', 'barbearia', 'cabelo', 'unha', 'beleza', 'estetica', 'manicure'], grupo: 'Família', subgrupo: 'Higiene e Beleza' },
  { palavras: ['roupa', 'calcado', 'tenis', 'camisa', 'calca', 'vestido', 'shopping', 'loja', 'zara', 'hm', 'renner'], grupo: 'Compras', subgrupo: 'Vestuário' },
  { palavras: ['netflix', 'spotify', 'amazon', 'prime', 'disney', 'youtube', 'assinatura', 'streaming'], grupo: 'Assinaturas', subgrupo: 'Streaming' },
  { palavras: ['internet', 'telefone', 'celular', 'tim', 'claro', 'vivo', 'oi', 'net'], grupo: 'Moradia', subgrupo: 'Internet' },
  { palavras: ['mercadinho', 'vizinho', 'padeiro', 'acougue', 'peixaria'], grupo: 'Alimentação', subgrupo: 'Mercado' },
  { palavras: ['pet', 'veterinario', 'racao', 'petshop', 'cachorro', 'gato'], grupo: 'Pets', subgrupo: 'Veterinário/Petshop' },
];

// ─── Extração de valor ────────────────────────────────────────────────────────

const NUMEROS_PT: Record<string, number> = {
  zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5,
  seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12,
  treze: 13, catorze: 14, quinze: 15, dezesseis: 16, dezessete: 17,
  dezoito: 18, dezenove: 19, vinte: 20, trinta: 30, quarenta: 40,
  cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90,
  cem: 100, cento: 100, duzentos: 200, trezentos: 300, quatrocentos: 400,
  quinhentos: 500, seiscentos: 600, setecentos: 700, oitocentos: 800,
  novecentos: 900, mil: 1000,
};

function normText(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim();
}

function extrairValor(texto: string): number | null {
  const t = normText(texto);

  // "R$ 45,50" / "45,50 reais" / "45.50" / "45 reais" / "45"
  const matchNum = t.match(/r?\$?\s*([\d]{1,6}(?:[.,]\d{1,2})?)\s*(?:reais|real)?/);
  if (matchNum) {
    const v = parseFloat(matchNum[1].replace(',', '.'));
    if (!isNaN(v) && v > 0) return v;
  }

  // Tentar converter palavras de número em PT-BR: "vinte e cinco reais"
  const words = t.split(/\s+/);
  let total = 0;
  let current = 0;
  for (const w of words) {
    const n = NUMEROS_PT[w];
    if (n !== undefined) {
      if (w === 'mil') {
        current = current === 0 ? 1000 : current * 1000;
        total += current;
        current = 0;
      } else if (n >= 100) {
        current += n;
      } else {
        current += n;
      }
    } else if (w === 'e') {
      continue;
    } else if (total + current > 0 && !['reais', 'real', 'centavos'].includes(w)) {
      break;
    }
  }
  const result = total + current;
  if (result > 0) return result;

  return null;
}

// ─── Extração de data ─────────────────────────────────────────────────────────

function hoje(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDias(base: string, dias: number): string {
  const d = new Date(base + 'T12:00:00');
  d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const DIAS_SEMANA: Record<string, number> = {
  domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6,
};

function extrairData(texto: string): string {
  const t = normText(texto);
  const h = hoje();

  if (t.includes('hoje')) return h;
  if (t.includes('ontem')) return addDias(h, -1);
  if (t.includes('anteontem')) return addDias(h, -2);

  // "dia 15" / "dia 5 desse mes"
  const diaMatch = t.match(/\bdia\s+(\d{1,2})\b/);
  if (diaMatch) {
    const dia = parseInt(diaMatch[1], 10);
    if (dia >= 1 && dia <= 31) {
      const now = new Date();
      const ano = now.getFullYear();
      const mes = now.getMonth() + 1;
      const candidate = `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
      return candidate <= h ? candidate : addDias(candidate, -30);
    }
  }

  // "segunda" / "sexta passada"
  for (const [nome, dow] of Object.entries(DIAS_SEMANA)) {
    if (t.includes(nome)) {
      const now = new Date();
      const diff = (now.getDay() - dow + 7) % 7;
      return addDias(h, -(diff === 0 ? 7 : diff));
    }
  }

  return h;
}

// ─── Extração de descrição ────────────────────────────────────────────────────

const PALAVRAS_ESTRUTURAIS = [
  'gastei', 'paguei', 'comprei', 'fui', 'comi', 'bebi', 'almocei', 'jantei',
  'no', 'na', 'num', 'numa', 'em', 'de', 'do', 'da', 'pro', 'para', 'com',
  'reais', 'real', 'hoje', 'ontem', 'anteontem', 'dia',
  'r$', 'rs',
];

function extrairDescricao(texto: string, valor: number | null): string {
  let t = normText(texto);

  // Remove o valor numérico
  if (valor !== null) {
    t = t.replace(new RegExp(`r?\\$?\\s*${String(valor).replace('.', '[.,]')}\\s*(?:reais|real)?`, 'g'), '');
  }
  t = t.replace(/\b\d+([.,]\d{1,2})?\s*(?:reais|real)?\b/g, '');

  // Remove palavras estruturais do início
  const words = t.split(/\s+/).filter((w) => {
    const clean = w.replace(/[^a-z]/g, '');
    return clean.length > 1 && !PALAVRAS_ESTRUTURAIS.includes(clean);
  });

  const desc = words.join(' ').trim();
  return desc.length > 1 ? desc.charAt(0).toUpperCase() + desc.slice(1) : '';
}

// ─── Sugestão de categoria ────────────────────────────────────────────────────

function sugerirCategoria(texto: string, descricao: string): { grupo: string | null; subgrupo: string | null } {
  const t = normText(texto + ' ' + descricao);

  for (const entry of CATEGORIA_MAP) {
    for (const palavra of entry.palavras) {
      if (t.includes(normText(palavra))) {
        return { grupo: entry.grupo, subgrupo: entry.subgrupo };
      }
    }
  }
  return { grupo: null, subgrupo: null };
}

// ─── Parser principal ─────────────────────────────────────────────────────────

export function parsearVoz(texto: string): VozParsed {
  const valor = extrairValor(texto);
  const data = extrairData(texto);
  const descricao = extrairDescricao(texto, valor);
  const { grupo, subgrupo } = sugerirCategoria(texto, descricao);

  const confianca: VozParsed['confianca'] =
    valor !== null && descricao.length > 2 ? 'alta'
    : valor !== null ? 'media'
    : 'baixa';

  return { valor, descricao, data, grupoSugerido: grupo, subgrupoSugerido: subgrupo, confianca };
}
