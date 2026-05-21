import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useAppTheme } from '../../context/ThemeContext';

export default function ConfiguracoesScreen() {
  const { colors: c, mode, toggle } = useAppTheme();

  const isDark = mode === 'dark';

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
    >
      <Text style={{ color: c.muted, fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 12 }}>
        Aparência
      </Text>

      {/* Theme toggle */}
      <View style={{
        backgroundColor: c.surface,
        borderColor: c.border,
        borderWidth: 1,
        borderRadius: 14,
        padding: 16,
        marginBottom: 10,
      }}>
        <Text style={{ color: c.text, fontWeight: '600', fontSize: 15, marginBottom: 4 }}>
          Tema do aplicativo
        </Text>
        <Text style={{ color: c.muted, fontSize: 13, marginBottom: 16 }}>
          {isDark ? 'Modo escuro (Black) ativo' : 'Modo claro (Clean) ativo'}
        </Text>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Pressable
            onPress={() => !isDark && toggle()}
            style={({ pressed }) => ({
              flex: 1,
              alignItems: 'center',
              paddingVertical: 14,
              borderRadius: 12,
              backgroundColor: isDark ? c.elevated : c.surface,
              borderWidth: 2,
              borderColor: isDark ? c.accent : c.border,
              opacity: pressed ? 0.8 : 1,
            })}
            accessibilityLabel="Ativar tema escuro"
          >
            <Text style={{ fontSize: 24, marginBottom: 6 }}>🌑</Text>
            <Text style={{ color: isDark ? c.accent : c.muted, fontWeight: '700', fontSize: 13 }}>
              Black
            </Text>
            <Text style={{ color: c.muted, fontSize: 11, marginTop: 3 }}>
              Fundo escuro
            </Text>
          </Pressable>

          <Pressable
            onPress={() => isDark && toggle()}
            style={({ pressed }) => ({
              flex: 1,
              alignItems: 'center',
              paddingVertical: 14,
              borderRadius: 12,
              backgroundColor: !isDark ? c.elevated : c.surface,
              borderWidth: 2,
              borderColor: !isDark ? c.accent : c.border,
              opacity: pressed ? 0.8 : 1,
            })}
            accessibilityLabel="Ativar tema claro"
          >
            <Text style={{ fontSize: 24, marginBottom: 6 }}>☀️</Text>
            <Text style={{ color: !isDark ? c.accent : c.muted, fontWeight: '700', fontSize: 13 }}>
              Clean
            </Text>
            <Text style={{ color: c.muted, fontSize: 11, marginTop: 3 }}>
              Fundo claro
            </Text>
          </Pressable>
        </View>
      </View>

      <Text style={{ color: c.muted, fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 12, marginTop: 20 }}>
        Sobre
      </Text>

      <View style={{
        backgroundColor: c.surface,
        borderColor: c.border,
        borderWidth: 1,
        borderRadius: 14,
        padding: 16,
      }}>
        <Text style={{ color: c.text, fontWeight: '600', fontSize: 15 }}>FalaGrana</Text>
        <Text style={{ color: c.muted, fontSize: 13, marginTop: 4 }}>
          Finanças pessoais simplificadas.
        </Text>
      </View>
    </ScrollView>
  );
}
