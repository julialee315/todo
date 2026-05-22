'use client';

// EmailPasswordForm — the inputs+submit half of the login surface. Two modes
// (signin / signup) share the same shape; only the button label changes.
// Pure presentational: the onSubmit handler decides what to do with the typed
// values (LoginScreen wires it up to AuthProvider).
//
// Submit via Enter inside either field works because the wrapper is a real
// <form onSubmit>. While onSubmit is pending the button is disabled to stop
// double-submit.

import { useState, type FormEvent } from 'react';

export type EmailPasswordMode = 'signin' | 'signup';

interface Props {
  mode: EmailPasswordMode;
  onSubmit: (email: string, password: string) => Promise<{ error: string | null } | void> | void;
}

const LABEL: Record<EmailPasswordMode, string> = {
  signin: '로그인',
  signup: '회원가입',
};

export function EmailPasswordForm({ mode, onSubmit }: Props) {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    try {
      await onSubmit(email, pw);
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="login__group-stack" onSubmit={handleSubmit}>
      <div className="login__group">
        <label htmlFor="ep-email">이메일</label>
        <div className="field field--lg">
          <input
            id="ep-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>
      </div>

      <div className="login__group">
        <label htmlFor="ep-pw">비밀번호</label>
        <div className="field field--lg">
          <input
            id="ep-pw"
            type="password"
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            required
            minLength={mode === 'signup' ? 8 : undefined}
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder={mode === 'signup' ? '8자 이상' : '••••••••'}
          />
        </div>
      </div>

      <button
        type="submit"
        className="btn btn--primary btn--lg btn--block"
        disabled={pending}
      >
        {pending ? '진행 중…' : LABEL[mode]}
      </button>
    </form>
  );
}
