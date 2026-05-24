'use client';

// AuthProvider — single source of truth for the current Supabase session in
// the React tree. Bootstraps from getSession() on mount, then subscribes to
// onAuthStateChange so SIGNED_IN / SIGNED_OUT events from anywhere (this tab,
// another tab, a token refresh, the OAuth callback) flow into one place.
//
// All authorization decisions are owned by Postgres RLS (Constitution
// Governance). This provider only exposes who the user is — not what they're
// allowed to do.
//
// Contract: specs/002-cloud-sync-multiuser/contracts/store-api.md §1.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createClient } from '@/utils/supabase/client';
import type { AuthUser } from '@/lib/types';

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
}

interface AuthActions {
  signInWithPassword(email: string, password: string): Promise<{ error: string | null }>;
  signUpWithPassword(email: string, password: string): Promise<{ error: string | null }>;
  signInWithGoogle(): Promise<{ error: string | null }>;
  signOut(): Promise<void>;
}

type AuthContextValue = AuthState & AuthActions;

const AuthContext = createContext<AuthContextValue | null>(null);

const MIN_PASSWORD = 8;

/** Map a Supabase auth error message to a friendly Korean string the user can
 *  understand. Anything we don't recognise falls through with a generic line. */
function translateAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials') || m.includes('invalid_grant')) {
    return '이메일 또는 비밀번호가 올바르지 않습니다.';
  }
  if (m.includes('already registered') || m.includes('already exists')) {
    return '이미 가입된 이메일입니다. 로그인을 시도해 보세요.';
  }
  if (m.includes('email not confirmed')) {
    return '이메일 확인이 필요해요.';
  }
  if (
    m.includes('email_address_invalid') ||
    m.includes('email address') && m.includes('invalid')
  ) {
    return '이메일 주소가 유효하지 않습니다. 실제 사용 가능한 주소인지 확인해 주세요.';
  }
  if (m.includes('weak password') || m.includes('password should')) {
    return '비밀번호가 너무 약해요. 더 복잡한 조합을 사용해 주세요.';
  }
  if (m.includes('rate limit') || m.includes('too many')) {
    return '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.';
  }
  if (m.includes('network')) {
    return '네트워크 연결을 확인해 주세요.';
  }
  return '문제가 발생했어요. 잠시 후 다시 시도해 주세요.';
}

interface RawAuthUser {
  id: string;
  email?: string | null;
  app_metadata?: { provider?: string } | null;
}

function toAuthUser(raw: RawAuthUser | null | undefined): AuthUser | null {
  if (!raw) return null;
  const provider = raw.app_metadata?.provider === 'google' ? 'google' : 'email';
  return { id: raw.id, email: raw.email ?? '', provider };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // Memoise the supabase client so we don't recreate it on every render —
  // recreating would re-fire getSession() and leak subscriptions.
  const supabase = useMemo(() => createClient(), []);
  const supabaseRef = useRef(supabase);
  supabaseRef.current = supabase;

  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setUser(toAuthUser((data.session?.user as RawAuthUser | undefined) ?? null));
      setLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(toAuthUser((session?.user as RawAuthUser | undefined) ?? null));
    });

    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, [supabase]);

  const signInWithPassword = useCallback(
    async (email: string, password: string) => {
      const { error } = await supabaseRef.current.auth.signInWithPassword({
        email,
        password,
      });
      return { error: error ? translateAuthError(error.message) : null };
    },
    [],
  );

  const signUpWithPassword = useCallback(
    async (email: string, password: string) => {
      if (password.length < MIN_PASSWORD) {
        return { error: `비밀번호는 ${MIN_PASSWORD}자 이상이어야 합니다.` };
      }
      const { error } = await supabaseRef.current.auth.signUp({ email, password });
      return { error: error ? translateAuthError(error.message) : null };
    },
    [],
  );

  const signInWithGoogle = useCallback(async () => {
    const redirectTo =
      typeof window === 'undefined'
        ? undefined
        : `${window.location.origin}/auth/callback`;
    const { error } = await supabaseRef.current.auth.signInWithOAuth({
      provider: 'google',
      options: redirectTo ? { redirectTo } : undefined,
    });
    return { error: error ? translateAuthError(error.message) : null };
  }, []);

  const signOut = useCallback(async () => {
    await supabaseRef.current.auth.signOut();
  }, []);

  const value: AuthContextValue = {
    user,
    loading,
    signInWithPassword,
    signUpWithPassword,
    signInWithGoogle,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
