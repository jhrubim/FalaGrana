// src/navigation/AppStack.tsx
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AppTabs from './AppTabs';
import LancamentoManualScreen from '../screens/lancamentos/LancamentoManualScreen';
import EditarLancamentoScreen from '../screens/lancamentos/EditarLancamentoScreen';
import PreviewImportacaoScreen from '../screens/importacao/PreviewImportacaoScreen';
import DrillDownLancamentosScreen from '../screens/relatorios/DrillDownLancamentosScreen';
import CapturarVozScreen from '../screens/voz/CapturarVozScreen';
import PendentesVozScreen from '../screens/voz/PendentesVozScreen';
import ContasCartoesScreen from '../screens/mais/ContasCartoesScreen';
import CategoriasScreen from '../screens/mais/CategoriasScreen';
import CategoriasRegrasScreen from '../screens/mais/CategoriasRegrasScreen';
import ConfiguracoesScreen from '../screens/mais/ConfiguracoesScreen';

export type AppStackParamList = {
  Tabs: undefined;
  NovoLancamento: undefined;
  EditarLancamento: { id: string };
  PreviewImportacao: undefined;
  DrillDownLancamentos: {
    items: any[];
    titulo: string;
    subtitulo: string;
    contaNomes: Record<string, string>;
  };
  ContasCartoes: undefined;
  Categorias: undefined;
  CategoriasRegras: undefined;
  Configuracoes: undefined;
  CapturarVoz: undefined;
  PendentesVoz: undefined;
};

const Stack = createNativeStackNavigator<AppStackParamList>();

export default function AppStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Tabs" component={AppTabs} options={{ headerShown: false }} />

      <Stack.Screen
        name="NovoLancamento"
        component={LancamentoManualScreen}
        options={{ title: 'Novo lançamento' }}
      />

      <Stack.Screen
        name="EditarLancamento"
        component={EditarLancamentoScreen}
        options={{ title: 'Editar lançamento' }}
      />

      <Stack.Screen
        name="PreviewImportacao"
        component={PreviewImportacaoScreen}
        options={{ title: 'Preview da importação' }}
      />

      <Stack.Screen
        name="DrillDownLancamentos"
        component={DrillDownLancamentosScreen}
        options={{ title: 'Detalhe' }}
      />

      <Stack.Screen
        name="ContasCartoes"
        component={ContasCartoesScreen}
        options={{ title: 'Contas e Cartões' }}
      />

      <Stack.Screen
        name="Categorias"
        component={CategoriasScreen}
        options={{ title: 'Categorias' }}
      />

      <Stack.Screen
        name="CategoriasRegras"
        component={CategoriasRegrasScreen}
        options={{ title: 'Categorias e Regras' }}
      />

      <Stack.Screen
        name="Configuracoes"
        component={ConfiguracoesScreen}
        options={{ title: 'Configurações' }}
      />

      <Stack.Screen
        name="CapturarVoz"
        component={CapturarVozScreen}
        options={{ title: 'Registrar por voz' }}
      />

      <Stack.Screen
        name="PendentesVoz"
        component={PendentesVozScreen}
        options={{ title: 'Pendentes de voz' }}
      />
    </Stack.Navigator>
  );
}