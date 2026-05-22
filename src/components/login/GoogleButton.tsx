'use client';

// Google sign-in button. Calls AuthProvider.signInWithGoogle, which delegates
// to supabase.auth.signInWithOAuth({ provider: 'google', redirectTo:
// '${origin}/auth/callback' }). The success path is a full-page redirect to
// Google, so the only thing this component returns synchronously is an
// optional `error` for the caller to surface in the LoginScreen alert area.

import { useAuth } from '@/context/AuthProvider';
import { GoogleIcon } from '@/components/shared/Icon';

interface Props {
  onError?: (message: string) => void;
}

export function GoogleButton({ onError }: Props) {
  const { signInWithGoogle } = useAuth();

  async function handleClick() {
    const res = await signInWithGoogle();
    if (res.error && onError) onError(res.error);
  }

  return (
    <button
      type="button"
      className="btn btn--outline"
      style={{
        height: 44,
        justifyContent: 'center',
        gap: 8,
        width: '100%',
      }}
      onClick={handleClick}
      aria-label="Google로 계속하기"
    >
      <GoogleIcon size={16} /> Google로 계속하기
    </button>
  );
}
