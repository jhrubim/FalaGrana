import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export default function CategoriasRegrasScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Categorias e Regras</Text>
      <Text style={styles.text}>Tela placeholder para categorias, subcategorias e regras automáticas.</Text>
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
    marginBottom: 8,
    color: '#e6edf3',
  },
  text: {
    color: '#7d8590',
    fontSize: 14,
  },
});