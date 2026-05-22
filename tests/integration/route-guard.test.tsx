import { describe, it, expect, vi, beforeEach } from 'vitest';

// The middleware uses createServerClient + cookies — both are mocked here.
// We're testing the middleware as a pure async function: given a NextRequest
// (mocked) and a known auth result, it must return the right NextResponse.

const handlers = vi.hoisted(() => ({
  getUser: vi.fn<() => Promise<any>>(async () => ({ data: { user: null }, error: null })),
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser: handlers.getUser } }),
}));

// In Next, redirect() throws — we just want to capture the destination here.
const redirects: string[] = [];
const responseNext = { kind: 'next' as const };
vi.mock('next/server', () => ({
  NextResponse: {
    next: () => responseNext,
    redirect: (url: URL) => {
      redirects.push(url.pathname + (url.search || ''));
      return { kind: 'redirect' as const, url };
    },
  },
}));

import { middleware } from '@/middleware';

function fakeRequest(pathname: string, hasSession = false) {
  return {
    nextUrl: {
      pathname,
      clone() {
        const url = new URL('http://localhost' + pathname);
        return url;
      },
    },
    cookies: {
      getAll: () => (hasSession ? [{ name: 'sb-auth-token', value: 'x' }] : []),
      set: vi.fn(),
    },
    headers: new Headers(),
  } as unknown as Parameters<typeof middleware>[0];
}

beforeEach(() => {
  redirects.length = 0;
  handlers.getUser.mockReset().mockResolvedValue({ data: { user: null }, error: null });
});

describe('middleware: protected routes', () => {
  it('redirects unauthenticated /main to / with redirect= query', async () => {
    await middleware(fakeRequest('/main'));
    expect(redirects[0]).toContain('/');
    expect(redirects[0]).toContain('redirect=%2Fmain');
  });

  it('redirects unauthenticated /calendar to /', async () => {
    await middleware(fakeRequest('/calendar'));
    expect(redirects[0]).toContain('/');
    expect(redirects[0]).toContain('redirect=%2Fcalendar');
  });

  it('redirects unauthenticated /stats to /', async () => {
    await middleware(fakeRequest('/stats'));
    expect(redirects[0]).toContain('/');
    expect(redirects[0]).toContain('redirect=%2Fstats');
  });

  it('lets authenticated requests through to /main', async () => {
    handlers.getUser.mockResolvedValueOnce({
      data: { user: { id: 'u', email: 'x@y.z' } },
      error: null,
    });
    const res = await middleware(fakeRequest('/main', true));
    expect(redirects).toHaveLength(0);
    expect(res).toBe(responseNext);
  });
});

describe('middleware: root route', () => {
  it('redirects authenticated / to /main', async () => {
    handlers.getUser.mockResolvedValueOnce({
      data: { user: { id: 'u', email: 'x@y.z' } },
      error: null,
    });
    await middleware(fakeRequest('/', true));
    expect(redirects[0]).toBe('/main');
  });

  it('lets unauthenticated / through', async () => {
    const res = await middleware(fakeRequest('/'));
    expect(redirects).toHaveLength(0);
    expect(res).toBe(responseNext);
  });
});

describe('middleware: getUser, not getSession', () => {
  it('verifies the auth via getUser() (which validates the token server-side)', async () => {
    await middleware(fakeRequest('/main'));
    expect(handlers.getUser).toHaveBeenCalled();
  });
});
