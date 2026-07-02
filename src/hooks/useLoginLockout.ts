import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';

const LOCKOUT_KEY = '@falagrana:login_lock';
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 10 * 60 * 1000; // 10 minutos

type LockState = { count: number; lockedUntil: number | null };

// No browser, AsyncStorage não persiste entre recarregamentos — usa localStorage diretamente
const storage = {
  getItem: (key: string): Promise<string | null> => {
    if (Platform.OS === 'web') return Promise.resolve(localStorage.getItem(key));
    return AsyncStorage.getItem(key);
  },
  setItem: (key: string, value: string): Promise<void> => {
    if (Platform.OS === 'web') { localStorage.setItem(key, value); return Promise.resolve(); }
    return AsyncStorage.setItem(key, value);
  },
  removeItem: (key: string): Promise<void> => {
    if (Platform.OS === 'web') { localStorage.removeItem(key); return Promise.resolve(); }
    return AsyncStorage.removeItem(key);
  },
};

export function useLoginLockout() {
  const [state, setState] = useState<LockState>({ count: 0, lockedUntil: null });
  const [now, setNow] = useState(Date.now());
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Carrega estado persistido ao montar
  useEffect(() => {
    storage.getItem(LOCKOUT_KEY).then((raw) => {
      if (!raw) return;
      const parsed: LockState = JSON.parse(raw);
      // Se o bloqueio já expirou, limpa automaticamente
      if (parsed.lockedUntil && Date.now() >= parsed.lockedUntil) {
        const cleared: LockState = { count: 0, lockedUntil: null };
        setState(cleared);
        storage.setItem(LOCKOUT_KEY, JSON.stringify(cleared));
      } else {
        setState(parsed);
      }
    });
  }, []);

  // Inicia/para o ticker do countdown
  useEffect(() => {
    if (state.lockedUntil) {
      tickRef.current = setInterval(() => setNow(Date.now()), 1000);
    } else {
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
    }
    return () => {
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
    };
  }, [state.lockedUntil]);

  // Limpa automaticamente quando o bloqueio expira
  useEffect(() => {
    if (state.lockedUntil && now >= state.lockedUntil) {
      const cleared: LockState = { count: 0, lockedUntil: null };
      setState(cleared);
      storage.setItem(LOCKOUT_KEY, JSON.stringify(cleared));
    }
  }, [now, state.lockedUntil]);

  const isLocked = !!state.lockedUntil && now < state.lockedUntil;
  const remainingMs = isLocked ? state.lockedUntil! - now : 0;
  const remainingMin = Math.floor(remainingMs / 60000);
  const remainingSec = Math.floor((remainingMs % 60000) / 1000);
  const countdown = `${remainingMin}:${String(remainingSec).padStart(2, '0')}`;
  const attemptsLeft = Math.max(0, MAX_ATTEMPTS - state.count);

  const onFailedAttempt = useCallback(
    async (email: string) => {
      const newCount = state.count + 1;
      const shouldLock = newCount >= MAX_ATTEMPTS;
      const newLockedUntil = shouldLock ? Date.now() + LOCKOUT_MS : state.lockedUntil;

      if (shouldLock) {
        // Fire-and-forget: envia alerta por e-mail
        supabase.functions
          .invoke('notify-lockout', {
            body: { email, timestamp: new Date().toISOString() },
          })
          .catch(() => {});
      }

      const newState: LockState = { count: newCount, lockedUntil: newLockedUntil };
      setState(newState);
      await storage.setItem(LOCKOUT_KEY, JSON.stringify(newState));
    },
    [state],
  );

  const onSuccess = useCallback(async () => {
    setState({ count: 0, lockedUntil: null });
    await storage.removeItem(LOCKOUT_KEY);
  }, []);

  return { isLocked, countdown, attemptsLeft, onFailedAttempt, onSuccess };
}
