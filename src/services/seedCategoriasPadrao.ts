import { supabase } from '../lib/supabase';
import { CATALOGO_CATEGORIAS_PADRAO } from '../constants/categoriasPadrao';

function inferirTipo(grupo: string): 'receita' | 'despesa' | 'transferencia' {
  const g = (grupo || '').trim().toLowerCase();

  if (g === 'receitas') return 'receita';

  // Você pode refinar isso depois (ex.: "Financeiro" -> transferencia em alguns casos)
  return 'despesa';
}

export async function seedCategoriasPadraoSeNecessario(grupoId: string, userId: string) {
  // Verifica se já existem categorias nessa carteira
  const { count, error: countError } = await supabase
    .from('categorias')
    .select('id', { count: 'exact', head: true })
    .eq('grupo_id', grupoId);

  if (countError) throw countError;

  // Se já existir qualquer categoria, não semeia de novo
  if ((count || 0) > 0) return;

  const payload = CATALOGO_CATEGORIAS_PADRAO.map((c) => ({
    grupo_id: grupoId,
    usuario_id: userId,
    tipo: inferirTipo(c.grupo),
    grupo: c.grupo,
    subgrupo: c.subgrupo,
    ativa: true,
    origem: 'padrao',
  }));

  const { error } = await supabase.from('categorias').insert(payload);
  if (error) throw error;
}