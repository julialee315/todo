// /main — server-side auth gate then renders the MainScreen.
//
// The middleware already redirects unauthenticated traffic here, but this
// server-side check is a second layer that runs even if matcher config is
// wrong or the request slips through. getUser() (not getSession()) is
// required so we trust a real server-validated identity, not a cookie copy.

import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { MainScreen } from '@/components/main/MainScreen';

export default async function MainPage() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  return (
    <div className="app">
      <Suspense fallback={null}>
        <MainScreen />
      </Suspense>
    </div>
  );
}
