import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';
import { Session } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import AuthStack from './AuthStack';
import AppStack from './AppStack';

const LAST_ACTIVE_KEY = '@falagrana:last_active';
// Exige novo login após 7 dias sem abrir o app
const SESSION_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000;

export default function RootNavigator() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // Ref para acessar a sessão atual sem criar closures stale nos handlers de AppState
  const sessionRef = useRef<Session | null>(null);
  sessionRef.current = session;

  const checkSessionTimeout = async () => {
    if (!sessionRef.current) return;

    try {
      const stored = await AsyncStorage.getItem(LAST_ACTIVE_KEY);
      if (stored && Date.now() - Number(stored) > SESSION_TIMEOUT_MS) {
        await supabase.auth.signOut();
        await AsyncStorage.removeItem(LAST_ACTIVE_KEY);
        return;
      }
    } catch {}

    await AsyncStorage.setItem(LAST_ACTIVE_KEY, String(Date.now()));
  };

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data, error }) => {
      if (error) console.log('Erro getSession:', error.message);
      if (mounted) {
        setSession(data.session ?? null);
        setLoading(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (mounted) setSession(newSession ?? null);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  // Verifica timeout quando a sessão é (re)estabelecida
  useEffect(() => {
    if (session) {
      checkSessionTimeout();
    } else {
      AsyncStorage.removeItem(LAST_ACTIVE_KEY).catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // Verifica timeout ao voltar para o foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkSessionTimeout();
    });
    return () => sub.remove();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return session ? <AppStack /> : <AuthStack />;
}
