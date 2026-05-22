import { describe, it, expect, vi, beforeEach } from 'vitest';

// /auth/callback is a route handler (no React). We test the GET function
// directly: a successful exchangeCodeForSession sends the user to /main,
// a failure redirects to / with an encoded ?error= message.

const exchange = vi.hoisted(() => vi.fn(async () => ({ error: null as any })));
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { exchangeCodeForSession: exchange },
  }),
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () => [],
    set: vi.fn(),
  }),
}));

const redirects: string[] = [];
vi.mock('next/server', () => ({
  NextResponse: {
    redirect: (url: URL) => {
      redirects.push(url.pathname + (url.search || ''));
      return { url };
    },
  },
}));

import { GET } from '@/app/auth/callback/route';

function fakeRequest(url: string): any {
  return { url };
}

beforeEach(() => {
  redirects.length = 0;
  exchange.mockReset().mockResolvedValue({ error: null });
});

describe('/auth/callback', () => {
  it('on success, exchanges the code and redirects to /main by default', async () => {
    await GET(fakeRequest('http://localhost:3000/auth/callback?code=abc'));
    expect(exchange).toHaveBeenCalledWith('abc');
    expect(redirects[0]).toBe('/main');
  });

  it('honours the next= query when provided', async () => {
    await GET(
      fakeRequest('http://localhost:3000/auth/callback?code=abc&next=/calendar'),
    );
    expect(redirects[0]).toBe('/calendar');
  });

  it('on exchange failure, sends the user back to / with a Korean error', async () => {
    exchange.mockResolvedValueOnce({ error: { message: 'denied' } });
    await GET(fakeRequest('http://localhost:3000/auth/callback?code=bad'));
    expect(redirects[0]).toMatch(/^\/\?error=/);
    expect(decodeURIComponent(redirects[0])).toMatch(/Google 로그인/);
  });

  it('without a code, just redirects to / without calling exchange', async () => {
    await GET(fakeRequest('http://localhost:3000/auth/callback'));
    expect(exchange).not.toHaveBeenCalled();
    expect(redirects[0]).toBe('/main');
  });
});
