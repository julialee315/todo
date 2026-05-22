// OAuth callback route. Google sends the user back here with a ?code=...
// (and an optional ?next=...); we hand the code to Supabase, which writes
// the session cookies via the cookieStore adapter, then redirect into the
// app. Failures land back on / with an encoded Korean error message.
//
// Contract: specs/002-cloud-sync-multiuser/contracts/routes.md §3.

import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') ?? '/main';

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: (cs) =>
            cs.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            ),
        },
      },
    );
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(
        new URL(
          `/?error=${encodeURIComponent('Google 로그인에 실패했어요')}`,
          url,
        ),
      );
    }
  }

  return NextResponse.redirect(new URL(next, url));
}
