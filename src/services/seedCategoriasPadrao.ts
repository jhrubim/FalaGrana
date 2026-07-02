import { supabase } from '../lib/supabase';
import { CATALOGO_CATEGORIAS_PADRAO } from '../constants/categoriasPadrao';

function inferirTipo(grupo: string): 'receita' | 'despesa' | 'transferencia' {
  const g = (grupo || '').trim().toLowerCase();
  if (g === 'receitas') return 'receita';
  return 'despesa';
}

function norm(s?: string | null) {
  return (s || '').trim().toLowerCase();
}

export async function seedCategoriasPadraoSeNecessario(grupoId: string, userId: string) {
  // Busca todas as categorias de origem 'padrao' já existentes no banco
  const { data, error } = await supabase
    .from('categorias')
    .select('grupo, subgrupo')
    .eq('grupo_id', grupoId)
    .eq('origem', 'padrao');

  if (error) throw error;

  const existentes = new Set(
    (data || []).map((r) => `${norm(r.grupo)}|${norm(r.subgrupo)}`),
  );

  // Filtra apenas as que ainda não existem no banco
  const faltando = CATALOGO_CATEGORIAS_PADRAO.filter(
    (c) => !existentes.has(`${norm(c.grupo)}|${norm(c.subgrupo)}`),
  );

  if (faltando.length === 0) return;

  const payload = faltando.map((c) => ({
    grupo_id: grupoId,
    usuario_id: userId,
    tipo: inferirTipo(c.grupo),
    grupo: c.grupo,
    subgrupo: c.subgrupo,
    ativa: true,
    origem: 'padrao',
  }));

  const { error: insertError } = await supabase.from('categorias').insert(payload);
  if (insertError) throw insertError;
}
