'use client';

// Login screen — split layout: dark hero on the left, auth surface on the
// right. The right pane has a Google button, a divider, then a 로그인/회원가입
// tab pair that swaps EmailPasswordForm's mode. Errors from AuthProvider land
// in <AuthError /> above the form.
//
// On a successful signin/signup we router.push('/main'). The middleware would
// also redirect on the next request, but pushing here makes the success feel
// instant.

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Icon, GoogleIcon } from '@/components/shared/Icon';
import { EmailPasswordForm } from '@/components/login/EmailPasswordForm';
import { AuthError } from '@/components/login/AuthError';
import { useAuth } from '@/context/AuthProvider';

type Tab = 'signin' | 'signup';

export function LoginScreen() {
  const router = useRouter();
  const search = useSearchParams();
  const { signInWithPassword, signUpWithPassword, signInWithGoogle } = useAuth();

  const [tab, setTab] = useState<Tab>('signin');
  const [error, setError] = useState<string | null>(
    () => search?.get('error') ?? null,
  );

  const target = search?.get('redirect') ?? '/main';

  async function handleSubmit(email: string, password: string) {
    setError(null);
    const res =
      tab === 'signin'
        ? await signInWithPassword(email, password)
        : await signUpWithPassword(email, password);
    if (res.error) {
      setError(res.error);
      return;
    }
    router.push(target);
  }

  async function handleGoogle() {
    setError(null);
    const res = await signInWithGoogle();
    if (res.error) setError(res.error);
    // Success path is a full-page OAuth redirect; nothing else to do here.
  }

  return (
    <div className="login">
      {/* Dark hero */}
      <div className="login__side">
        <div className="login__brand">
          <span className="login__brand-mark">
            <Icon name="check" size={16} strokeWidth={2.5} />
          </span>
          <span>
            demodev{' '}
            <span style={{ color: 'var(--color-gray-500)', fontWeight: 500 }}>
              · Tasks
            </span>
          </span>
        </div>

        <div className="login__hero">
          <span className="login__eyebrow">매일의 흐름</span>
          <h2 className="login__title">
            오늘 할 일에만
            <br />
            온전히 집중하세요.
          </h2>
          <p className="login__sub">
            팀과 개인의 모든 작업을 한 곳에서. 마감일, 우선순위, 서브태스크까지 —
            외주 프로젝트의 복잡한 일정을 단순하게 만들어 줍니다.
          </p>
        </div>

        <div className="login__foot">
          © 2026 demodev (대모산개발단). All rights reserved.
        </div>
      </div>

      {/* Auth surface */}
      <div className="login__pane">
        <div className="login__form">
          <div>
            <h1>다시 오신 것을 환영합니다</h1>
            <p style={{ marginTop: 8 }}>
              계정에 로그인하거나 새로 가입하고 오늘의 할 일을 확인하세요.
            </p>
          </div>

          <button
            className="btn btn--outline"
            type="button"
            style={{ height: 44, justifyContent: 'center', gap: 8, width: '100%' }}
            onClick={handleGoogle}
            aria-label="Google로 계속하기"
          >
            <GoogleIcon size={16} /> Google로 계속하기
          </button>

          <div className="login__divider">또는 이메일로</div>

          {/* Tab pair */}
          <div role="tablist" aria-label="인증 모드" className="login__tabs">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'signin'}
              className={'btn btn--ghost' + (tab === 'signin' ? ' is-active' : '')}
              onClick={() => setTab('signin')}
              style={{ flex: 1 }}
            >
              로그인
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'signup'}
              className={'btn btn--ghost' + (tab === 'signup' ? ' is-active' : '')}
              onClick={() => setTab('signup')}
              style={{ flex: 1 }}
            >
              회원가입
            </button>
          </div>

          {error && <AuthError message={error} />}

          <EmailPasswordForm mode={tab} onSubmit={handleSubmit} />
        </div>
      </div>
    </div>
  );
}
