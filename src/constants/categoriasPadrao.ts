export type CategoriaPadrao = {
  grupo: string;
  subgrupo: string;
};

export const CATEGORIA_FALLBACK: CategoriaPadrao = {
  grupo: 'Outros',
  subgrupo: 'Não categorizado',
};

export const CATALOGO_CATEGORIAS_PADRAO: CategoriaPadrao[] = [
  // RECEITAS
  { grupo: 'Receitas', subgrupo: 'Salário' },
  { grupo: 'Receitas', subgrupo: 'Adiantamento Salarial' },
  { grupo: 'Receitas', subgrupo: 'Décimo Terceiro' },
  { grupo: 'Receitas', subgrupo: 'Férias' },
  { grupo: 'Receitas', subgrupo: 'PPR/PLR' },
  { grupo: 'Receitas', subgrupo: 'Freelance/Extras' },
  { grupo: 'Receitas', subgrupo: 'Reembolso Empresa' },
  { grupo: 'Receitas', subgrupo: 'Presente' },
  { grupo: 'Receitas', subgrupo: 'Venda de Itens' },
  { grupo: 'Receitas', subgrupo: 'Restituição IR' },
  { grupo: 'Receitas', subgrupo: 'NF Paulista' },
  { grupo: 'Receitas', subgrupo: 'Proventos/Dividendos' },
  { grupo: 'Receitas', subgrupo: 'Outras Receitas' },

  // MORADIA
  { grupo: 'Moradia', subgrupo: 'Aluguel/Financiamento' },
  { grupo: 'Moradia', subgrupo: 'Condomínio' },
  { grupo: 'Moradia', subgrupo: 'Energia Elétrica' },
  { grupo: 'Moradia', subgrupo: 'Água/Esgoto' },
  { grupo: 'Moradia', subgrupo: 'Gás' },
  { grupo: 'Moradia', subgrupo: 'Internet' },
  { grupo: 'Moradia', subgrupo: 'Telefone' },
  { grupo: 'Moradia', subgrupo: 'IPTU' },
  { grupo: 'Moradia', subgrupo: 'Manutenção' },
  { grupo: 'Moradia', subgrupo: 'Móveis/Utensílios' },
  { grupo: 'Moradia', subgrupo: 'Coisas para Casa' },
  { grupo: 'Moradia', subgrupo: 'Seguro Residencial' },
  { grupo: 'Moradia', subgrupo: 'Serviços Domésticos' },

  // ALIMENTAÇÃO
  { grupo: 'Alimentação', subgrupo: 'Mercado' },
  { grupo: 'Alimentação', subgrupo: 'Hortifruti/Feira' },
  { grupo: 'Alimentação', subgrupo: 'Açougue' },
  { grupo: 'Alimentação', subgrupo: 'Padaria' },
  { grupo: 'Alimentação', subgrupo: 'Restaurantes' },
  { grupo: 'Alimentação', subgrupo: 'Delivery' },
  { grupo: 'Alimentação', subgrupo: 'Café/Lanches' },
  { grupo: 'Alimentação', subgrupo: 'Suplementos' },

  // EDUCAÇÃO
  { grupo: 'Educação', subgrupo: 'Mensalidade Escolar' },
  { grupo: 'Educação', subgrupo: 'Transporte Escolar' },
  { grupo: 'Educação', subgrupo: 'Cantina Escolar' },
  { grupo: 'Educação', subgrupo: 'Matrícula' },
  { grupo: 'Educação', subgrupo: 'Livros/Materiais' },
  { grupo: 'Educação', subgrupo: 'Cursos' },
  { grupo: 'Educação', subgrupo: 'Idiomas' },
  { grupo: 'Educação', subgrupo: 'Cursos Diversos' },

  // TRANSPORTE
  { grupo: 'Transporte', subgrupo: 'Combustível' },
  { grupo: 'Transporte', subgrupo: 'Aplicativos (Uber/99)' },
  { grupo: 'Transporte', subgrupo: 'Táxi' },
  { grupo: 'Transporte', subgrupo: 'Transporte Público' },
  { grupo: 'Transporte', subgrupo: 'Estacionamento' },
  { grupo: 'Transporte', subgrupo: 'Pedágio' },
  { grupo: 'Transporte', subgrupo: 'Sem Parar/Pedágio Automático' },
  { grupo: 'Transporte', subgrupo: 'Manutenção Veículo' },
  { grupo: 'Transporte', subgrupo: 'Lavagem' },
  { grupo: 'Transporte', subgrupo: 'Seguro Veículo' },
  { grupo: 'Transporte', subgrupo: 'IPVA/Licenciamento' },
  { grupo: 'Transporte', subgrupo: 'Multas' },

  // SAÚDE
  { grupo: 'Saúde', subgrupo: 'Plano de Saúde' },
  { grupo: 'Saúde', subgrupo: 'Consultas' },
  { grupo: 'Saúde', subgrupo: 'Exames' },
  { grupo: 'Saúde', subgrupo: 'Medicamentos' },
  { grupo: 'Saúde', subgrupo: 'Odontologia' },
  { grupo: 'Saúde', subgrupo: 'Academia' },
  { grupo: 'Saúde', subgrupo: 'Terapias' },
  { grupo: 'Saúde', subgrupo: 'Convênios Familiares' },

  // FAMÍLIA
  { grupo: 'Família', subgrupo: 'Mesada' },
  { grupo: 'Família', subgrupo: 'Presentes' },
  { grupo: 'Família', subgrupo: 'Cuidados' },
  { grupo: 'Família', subgrupo: 'Farmácia Família' },
  { grupo: 'Família', subgrupo: 'Higiene e Beleza' },
  { grupo: 'Família', subgrupo: 'Celebrações' },
  { grupo: 'Família', subgrupo: 'Doações' },
  { grupo: 'Família', subgrupo: 'Outros Família' },

  // LAZER
  { grupo: 'Lazer', subgrupo: 'Entretenimento' },
  { grupo: 'Lazer', subgrupo: 'Bares' },
  { grupo: 'Lazer', subgrupo: 'Cinema/Shows' },
  { grupo: 'Lazer', subgrupo: 'Passeios' },
  { grupo: 'Lazer', subgrupo: 'Viagens' },
  { grupo: 'Lazer', subgrupo: 'Hospedagem' },
  { grupo: 'Lazer', subgrupo: 'Hobbies' },
  { grupo: 'Lazer', subgrupo: 'Quadra/Esportes' },
  { grupo: 'Lazer', subgrupo: 'Jiu-Jitsu' },
  { grupo: 'Lazer', subgrupo: 'Cursos de Lazer' },
  { grupo: 'Lazer', subgrupo: 'Apostas Eletrônicas' },

  // COMPRAS
  { grupo: 'Compras', subgrupo: 'Vestuário' },
  { grupo: 'Compras', subgrupo: 'Calçados' },
  { grupo: 'Compras', subgrupo: 'Eletrônicos' },
  { grupo: 'Compras', subgrupo: 'Celulares' },
  { grupo: 'Compras', subgrupo: 'Casa' },
  { grupo: 'Compras', subgrupo: 'Presentes' },
  { grupo: 'Compras', subgrupo: 'Beleza/Cuidados' },
  { grupo: 'Compras', subgrupo: 'Diversos' },

  // ASSINATURAS
  { grupo: 'Assinaturas', subgrupo: 'Netflix' },
  { grupo: 'Assinaturas', subgrupo: 'Spotify' },
  { grupo: 'Assinaturas', subgrupo: 'YouTube Premium' },
  { grupo: 'Assinaturas', subgrupo: 'Amazon Prime' },
  { grupo: 'Assinaturas', subgrupo: 'Disney+/Max/Outros' },
  { grupo: 'Assinaturas', subgrupo: 'Mercado Livre (Meli+)' },
  { grupo: 'Assinaturas', subgrupo: 'Apps/Softwares' },
  { grupo: 'Assinaturas', subgrupo: 'Apple/Google' },
  { grupo: 'Assinaturas', subgrupo: 'Prudential/Seguros' },

  // PETS
  { grupo: 'Pets', subgrupo: 'Pet Shop' },
  { grupo: 'Pets', subgrupo: 'Ração' },
  { grupo: 'Pets', subgrupo: 'Veterinário' },
  { grupo: 'Pets', subgrupo: 'Banho/Tosa' },
  { grupo: 'Pets', subgrupo: 'Medicamentos' },

  // TRABALHO
  { grupo: 'Trabalho', subgrupo: 'Almoços' },
  { grupo: 'Trabalho', subgrupo: 'Café' },
  { grupo: 'Trabalho', subgrupo: 'Diversos Job' },
  { grupo: 'Trabalho', subgrupo: 'Reembolsável' },
  { grupo: 'Trabalho', subgrupo: 'Ferramentas/Software' },
  { grupo: 'Trabalho', subgrupo: 'Transporte Trabalho' },

  // IMPOSTOS E TAXAS
  { grupo: 'Impostos/Taxas', subgrupo: 'IR/IRPF' },
  { grupo: 'Impostos/Taxas', subgrupo: 'IOF' },
  { grupo: 'Impostos/Taxas', subgrupo: 'Taxas Bancárias' },
  { grupo: 'Impostos/Taxas', subgrupo: 'Taxas Cartão' },
  { grupo: 'Impostos/Taxas', subgrupo: 'Anuidade' },
  { grupo: 'Impostos/Taxas', subgrupo: 'Taxas Diversas' },

  // FINANCEIRO
  { grupo: 'Financeiro', subgrupo: 'Saldo Inicial' },
  { grupo: 'Financeiro', subgrupo: 'Transferência entre Contas' },
  { grupo: 'Financeiro', subgrupo: 'Pagamento Fatura' },
  { grupo: 'Financeiro', subgrupo: 'Estorno Cartão' },
  { grupo: 'Financeiro', subgrupo: 'Saques' },
  { grupo: 'Financeiro', subgrupo: 'Juros/Multas' },
  { grupo: 'Financeiro', subgrupo: 'Multa por Atraso' },
  { grupo: 'Financeiro', subgrupo: 'Ajustes/Correções' },

  // INVESTIMENTOS
  { grupo: 'Investimentos', subgrupo: 'Aporte' },
  { grupo: 'Investimentos', subgrupo: 'Resgate' },
  { grupo: 'Investimentos', subgrupo: 'Rendimentos' },
  { grupo: 'Investimentos', subgrupo: 'Proventos/Dividendos' },
  { grupo: 'Investimentos', subgrupo: 'Taxas/Corretagem' },
  { grupo: 'Investimentos', subgrupo: 'Fundos Imobiliários (FIIs)' },
  { grupo: 'Investimentos', subgrupo: 'Ações' },
  { grupo: 'Investimentos', subgrupo: 'Cofrinho/Emergência' },
  { grupo: 'Investimentos', subgrupo: 'Empréstimos a Terceiros' },

  // OUTROS (fallback oficial)
  { grupo: 'Outros', subgrupo: 'Não categorizado' },
].filter((item, idx, arr) => {
  const chave = `${(item.grupo || '').trim()}|${(item.subgrupo || '').trim()}`.toLowerCase();
  return (
    arr.findIndex((x) => {
      const k = `${(x.grupo || '').trim()}|${(x.subgrupo || '').trim()}`.toLowerCase();
      return k === chave;
    }) === idx
  );
});

const MAPA_CATEGORIAS_PADRAO = new Map(
  CATALOGO_CATEGORIAS_PADRAO.map((item) => [
    `${item.grupo}|${item.subgrupo}`.toLowerCase(),
    { grupo: item.grupo, subgrupo: item.subgrupo },
  ])
);

export function categoriaExisteNoCatalogo(grupo?: string | null, subgrupo?: string | null) {
  if (!grupo || !subgrupo) return false;
  const chave = `${String(grupo).trim()}|${String(subgrupo).trim()}`.toLowerCase();
  return MAPA_CATEGORIAS_PADRAO.has(chave);
}

export function garantirCategoriaValida(grupo?: string | null, subgrupo?: string | null) {
  if (!grupo || !subgrupo) return { ...CATEGORIA_FALLBACK };

  const g = String(grupo).trim();
  const s = String(subgrupo).trim();
  const chave = `${g}|${s}`.toLowerCase();

  const exata = MAPA_CATEGORIAS_PADRAO.get(chave);
  if (exata) return exata;

  const grupoNorm = g.toLowerCase();
  const subgrupoNorm = s.toLowerCase();

  const match = CATALOGO_CATEGORIAS_PADRAO.find(
    (item) =>
      item.grupo.toLowerCase() === grupoNorm &&
      item.subgrupo.toLowerCase() === subgrupoNorm
  );

  return match ? { grupo: match.grupo, subgrupo: match.subgrupo } : { ...CATEGORIA_FALLBACK };
}