'use client';

// Login route — renders LoginScreen (which reads useSearchParams to surface
// the ?error=... or ?redirect=... query) and also bounces already-authed
// users to /main as a client-side defence against stale tabs or
// back-button returns after sign-in. The middleware does the same
// server-side on hard navigation.

import { Suspense, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LoginScreen } from '@/components/login/LoginScreen';
import { useAuth } from '@/context/AuthProvider';

function LoginPageInner() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && user) router.replace('/main');
  }, [loading, user, router]);

  return (
    <div className="app">
      <LoginScreen />
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}
