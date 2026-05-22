// Edge middleware:
//   1. Refresh the Supabase session cookie on every request so it doesn't
//      expire while the user is browsing (the @supabase/ssr recommended
//      pattern).
//   2. Guard protected routes: unauthenticated requests to /main, /calendar,
//      or /stats are redirected to the login screen with a ?redirect=...
//      hint so the post-login push can return there.
//   3. Authenticated requests to '/' are sent to '/main'.
//
// We deliberately use getUser() (server-side JWT validation), NOT getSession()
// (cached-cookie read), per Constitution Governance.
//
// Contract: specs/002-cloud-sync-multiuser/contracts/routes.md §2.

import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const PROTECTED_PREFIXES = ['/main', '/calendar', '/stats'];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookies) => {
          cookies.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookies.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  if (PROTECTED_PREFIXES.some((p) => pathname.startsWith(p)) && !user) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }

  if (pathname === '/' && user) {
    const url = request.nextUrl.clone();
    url.pathname = '/main';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    // Run on every request except static assets, images, favicons, and the
    // OAuth callback (which has its own session-write logic).
    '/((?!_next/static|_next/image|favicon.ico|auth/callback|.*\\.svg|.*\\.png|.*\\.ico).*)',
  ],
};
