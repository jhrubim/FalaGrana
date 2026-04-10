import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AppStackParamList } from '../../navigation/AppStack';
import { supabase } from '../../lib/supabase';

type NavProp = NativeStackNavigationProp<AppStackParamList>;

export default function MaisScreen() {
  const navigation = useNavigation<NavProp>();

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      Alert.alert('Erro ao sair', error.message);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Mais</Text>

      <TouchableOpacity style={styles.item} onPress={() => navigation.navigate('ContasCartoes')} accessibilityLabel="Contas e Cartões">
        <Text style={styles.itemText}>Contas e Cartões</Text>
        <Text style={styles.itemArrow}>›</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.item} onPress={() => navigation.navigate('Categorias')} accessibilityLabel="Categorias">
        <Text style={styles.itemText}>Categorias</Text>
        <Text style={styles.itemArrow}>›</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.item} onPress={() => navigation.navigate('CategoriasRegras')} accessibilityLabel="Regras de categorização">
        <Text style={styles.itemText}>Regras de categorização</Text>
        <Text style={styles.itemArrow}>›</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.item} onPress={() => navigation.navigate('Configuracoes')} accessibilityLabel="Configurações">
        <Text style={styles.itemText}>Configurações</Text>
        <Text style={styles.itemArrow}>›</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.item, styles.logout]} onPress={handleLogout} accessibilityLabel="Sair da conta">
        <Text style={[styles.itemText, { color: '#f87171' }]}>Sair</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#0d1117',
  },
  title: {
    fontSize: 20,
    fontWeight: '500',
    marginBottom: 16,
    color: '#e6edf3',
  },
  item: {
    backgroundColor: '#161b22',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#21262d',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  itemText: {
    fontWeight: '500',
    color: '#e6edf3',
    fontSize: 14,
  },
  itemArrow: {
    color: '#7d8590',
    fontSize: 16,
  },
  logout: {
    marginTop: 8,
    borderColor: 'rgba(248,113,113,0.3)',
  },
});