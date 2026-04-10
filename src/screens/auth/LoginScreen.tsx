import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { supabase } from '../../lib/supabase';

function validarEmail(email: string): boolean {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [loading, setLoading] = useState(false);
  const [erroTela, setErroTela] = useState<string | null>(null);

  const emailTratado = useMemo(() => email.trim().toLowerCase(), [email]);
  const senhaTratada = useMemo(() => senha.trim(), [senha]);

  const emailValido = useMemo(() => validarEmail(emailTratado), [emailTratado]);

  const podeEntrar = useMemo(() => {
    return !loading && emailValido && senhaTratada.length >= 6;
  }, [loading, emailValido, senhaTratada.length]);

  const handleLogin = async () => {
    if (loading) return;

    setErroTela(null);

    if (!emailTratado || !senhaTratada) {
      setErroTela('Preencha e-mail e senha.');
      return;
    }

    if (!emailValido) {
      setErroTela('Informe um e-mail válido.');
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: emailTratado,
        password: senhaTratada,
      });

      if (error) {
        await sleep(600);

        // Segurança: mensagem genérica (não revela se o e-mail existe)
        setErroTela('E-mail ou senha inválidos.');
        return;
      }

      // sucesso: RootNavigator troca automaticamente para AppStack
    } catch {
      await sleep(400);
      setErroTela('Não foi possível concluir o login agora. Tente novamente em instantes.');
    } finally {
      setLoading(false);
    }
  };

  const handleEsqueciSenha = () => {
    setErroTela('Recuperação de senha será habilitada na próxima etapa.');
  };

  return (
    <KeyboardAvoidingView
      style={styles.page}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.wrapper}>
        <View style={styles.card}>
          <Text style={styles.title}>FalaGrana</Text>
          <Text style={styles.subtitle}>Entre para acessar seu dashboard</Text>

          {erroTela ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorBoxText}>{erroTela}</Text>
            </View>
          ) : null}

          <View style={styles.fieldBlock}>
            <Text style={styles.label}>E-mail</Text>
            <TextInput
              style={[styles.input, email.length > 0 && !emailValido ? styles.inputError : null]}
              placeholder="seuemail@dominio.com"
              placeholderTextColor="#9CA3AF"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="emailAddress"
              autoComplete="email"
              value={email}
              onChangeText={(v) => {
                setEmail(v);
                if (erroTela) setErroTela(null);
              }}
              editable={!loading}
              returnKeyType="next"
            />
            {email.length > 0 && !emailValido ? (
              <Text style={styles.helperError}>Digite um e-mail válido.</Text>
            ) : (
              <Text style={styles.helper}>Use o e-mail cadastrado no app.</Text>
            )}
          </View>

          <View style={styles.fieldBlock}>
            <Text style={styles.label}>Senha</Text>
            <View style={styles.passwordRow}>
              <TextInput
                style={styles.passwordInput}
                placeholder="Digite sua senha"
                placeholderTextColor="#9CA3AF"
                secureTextEntry={!mostrarSenha}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="password"
                autoComplete="password"
                value={senha}
                onChangeText={(v) => {
                  setSenha(v);
                  if (erroTela) setErroTela(null);
                }}
                editable={!loading}
                returnKeyType="done"
                onSubmitEditing={handleLogin}
              />

              <Pressable
                onPress={() => setMostrarSenha((prev) => !prev)}
                disabled={loading}
                style={({ pressed }) => [
                  styles.showButton,
                  pressed && !loading ? styles.showButtonPressed : null,
                ]}
                accessibilityRole="button"
                accessibilityLabel={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
              >
                <Text style={styles.showButtonText}>
                  {mostrarSenha ? 'Ocultar' : 'Mostrar'}
                </Text>
              </Pressable>
            </View>
            <Text style={styles.helper}>
              A senha não é armazenada localmente pelo app.
            </Text>
          </View>

          <Pressable
            onPress={handleLogin}
            disabled={!podeEntrar}
            style={({ pressed }) => [
              styles.loginButton,
              !podeEntrar ? styles.loginButtonDisabled : null,
              pressed && podeEntrar ? styles.loginButtonPressed : null,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Entrar"
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.loginButtonText}>Entrar</Text>
            )}
          </Pressable>

          <Pressable
            onPress={handleEsqueciSenha}
            disabled={loading}
            style={({ pressed }) => [
              styles.linkButton,
              pressed && !loading ? styles.linkButtonPressed : null,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Esqueci minha senha"
          >
            <Text style={styles.linkText}>Esqueci minha senha</Text>
          </Pressable>

          <Text style={styles.securityNote}>
            Segurança: em caso de falha no login, o app mostra mensagem genérica para proteger sua conta.
          </Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#0d1117',
  },
  wrapper: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#161b22',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#21262d',
    ...Platform.select({
      web: {
        maxWidth: 560,
        width: '100%',
        alignSelf: 'center',
      },
      default: {},
    }),
  },
  title: {
    fontSize: 28,
    fontWeight: '600',
    color: '#4ade80',
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  subtitle: {
    marginTop: 6,
    marginBottom: 16,
    textAlign: 'center',
    color: '#7d8590',
    fontSize: 13,
  },
  errorBox: {
    backgroundColor: 'rgba(248,113,113,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.3)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  errorBoxText: {
    color: '#f87171',
    fontSize: 13,
    fontWeight: '500',
  },
  fieldBlock: {
    marginBottom: 12,
  },
  label: {
    marginBottom: 6,
    fontWeight: '500',
    fontSize: 12,
    color: '#7d8590',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#21262d',
    backgroundColor: '#0d1117',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    color: '#e6edf3',
  },
  inputError: {
    borderColor: '#f87171',
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#21262d',
    borderRadius: 10,
    backgroundColor: '#0d1117',
    overflow: 'hidden',
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    color: '#e6edf3',
  },
  showButton: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderLeftWidth: 1,
    borderLeftColor: '#21262d',
    backgroundColor: '#161b22',
  },
  showButtonPressed: {
    opacity: 0.7,
  },
  showButtonText: {
    color: '#7d8590',
    fontWeight: '500',
    fontSize: 13,
  },
  helper: {
    marginTop: 5,
    fontSize: 11,
    color: '#7d8590',
  },
  helperError: {
    marginTop: 5,
    fontSize: 11,
    color: '#f87171',
  },
  loginButton: {
    marginTop: 8,
    borderRadius: 10,
    backgroundColor: '#4ade80',
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
  },
  loginButtonDisabled: {
    backgroundColor: '#21262d',
  },
  loginButtonPressed: {
    opacity: 0.85,
  },
  loginButtonText: {
    color: '#0d1117',
    fontWeight: '700',
    fontSize: 15,
  },
  linkButton: {
    marginTop: 12,
    alignSelf: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  linkButtonPressed: {
    opacity: 0.7,
  },
  linkText: {
    color: '#4ade80',
    fontWeight: '500',
    textDecorationLine: 'underline',
    fontSize: 13,
  },
  securityNote: {
    marginTop: 12,
    fontSize: 11,
    color: '#7d8590',
    textAlign: 'center',
    lineHeight: 16,
  },
});