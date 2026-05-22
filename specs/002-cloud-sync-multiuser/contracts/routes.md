# Contract: Route Map & Auth Guards

**Date**: 2026-05-22 | **Plan**: [../plan.md](../plan.md)

App Router 라우트, 보호 정책, OAuth 콜백 처리 흐름.

---

## 1. 라우트 맵

| Path | 파일 | 종류 | 보호 | 역할 |
|------|------|------|------|------|
| `/` | `src/app/page.tsx` | Client (`"use client"`) | 공개 | 로그인/회원가입 화면. 인증 사용자가 접근 시 `/main`으로 리다이렉트. |
| `/main` | `src/app/main/page.tsx` | Server (RSC) | 인증 필수 | 메인 3단 화면. 서버에서 `listTasksForUser` + `loadPreferences` 호출 후 `TasksProvider`에 hydrate. |
| `/calendar` | `src/app/calendar/page.tsx` | Client | 인증 필수 | 캘린더 (컨텍스트에서 데이터 소비). |
| `/stats` | `src/app/stats/page.tsx` | Client | 인증 필수 | 통계 (컨텍스트에서 데이터 소비). |
| `/auth/callback` | `src/app/auth/callback/route.ts` | Route Handler | 공개 (코드 교환만) | Google OAuth code → session 교환 후 `/main`으로 리다이렉트. |

## 2. 인증 가드 — `src/middleware.ts`

**책임 2가지**:
1. 모든 요청에서 Supabase 세션을 갱신(`@supabase/ssr`의 권장 패턴 — middleware가 빠지면 토큰 만료로 API 실패).
2. 보호 라우트에 비인증 접근 차단.

```ts
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
            response.cookies.set(name, value, options));
        },
      },
    },
  );

  // 1) 세션 갱신: getUser()는 서버에서 토큰 검증 + 만료 시 자동 갱신
  const { data: { user } } = await supabase.auth.getUser();

  // 2) 보호 라우트 가드
  const pathname = request.nextUrl.pathname;
  const needsAuth = PROTECTED_PREFIXES.some(p => pathname.startsWith(p));
  if (needsAuth && !user) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }

  // 3) 인증된 사용자가 '/'에 접근하면 '/main'으로
  if (pathname === '/' && user) {
    const url = request.nextUrl.clone();
    url.pathname = '/main';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    // 정적 파일·이미지·favicon 제외
    '/((?!_next/static|_next/image|favicon.ico|.*\\.svg|.*\\.png).*)',
  ],
};
```

**계약 의무**:
- `getUser()`를 쓰고 `getSession()`은 쓰지 않는다 — getSession은 캐시된 값만 보고 서명 검증을 안 하므로 위조된 쿠키를 가려내지 못한다.
- `setAll` 콜백에서 응답을 다시 생성해 쿠키를 양쪽(request·response)에 모두 set — 그래야 다음 미들웨어 단계와 RSC에서도 새 토큰을 본다.
- `matcher`에 정적 자원을 빼야 모든 페이지 요청마다 한 번 갱신 사이클이 돈다.

## 3. OAuth 콜백 — `src/app/auth/callback/route.ts`

Google OAuth가 `code`와 `next`를 query에 붙여 리다이렉트하면, 이 핸들러가 code → session 교환을 수행한다.

```ts
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
          setAll: (cs) => cs.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)),
        },
      },
    );
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(new URL(`/?error=${encodeURIComponent('Google 로그인에 실패했어요')}`, url));
    }
  }

  return NextResponse.redirect(new URL(next, url));
}
```

**계약**:
- 성공: 세션 쿠키를 응답에 set한 뒤 `/main`(또는 `next`)로 리다이렉트.
- 실패: 로그인 화면으로 돌려보내고 query string으로 한국어 오류 전달.
- 이 라우트는 비인증 상태에서 호출 가능해야 하므로 middleware의 protected 목록에 포함되지 않는다.

## 4. 로그인 화면 (`/`) — 모드 전환

`src/components/login/LoginScreen.tsx`는 세 부분을 가진다.

```
┌──────────────────────────────────────────┐
│  [demodev Tasks 로고]                    │
│                                          │
│  ( ● 로그인 )  ( ○ 회원가입 )             │   ← 탭 토글 (state)
│                                          │
│  <EmailPasswordForm mode={tab} />        │
│  ───── 또는 ─────                         │
│  <GoogleButton />                        │
│                                          │
│  <AuthError /> (조건부)                   │
└──────────────────────────────────────────┘
```

**계약**:
- 탭 전환 시 입력값은 초기화하지 않는다(사용자가 잘못 들어왔을 수 있음).
- 폼은 `<form onSubmit>`으로 Enter 제출 가능(Constitution 원칙 V).
- 모든 input에 `<label htmlFor>`. `aria-invalid` 토글로 오류 시각 표시.

## 5. 로그아웃 (사이드 네비게이션)

`src/components/shared/LogoutButton.tsx`는 `SideNav.tsx`의 footer 영역에 ThemeToggle과 나란히 둔다.

```tsx
function LogoutButton() {
  const { signOut } = useAuth();
  return (
    <button type="button" aria-label="로그아웃" onClick={signOut}>
      <Icon name="logout" />
      <span>로그아웃</span>
    </button>
  );
}
```

**계약**:
- 클릭 시 `signOut()` → middleware 다음 응답이 비인증을 감지해 `/`로 리다이렉트.
- 시각·키보드·aria 모두 기존 ThemeToggle과 동일한 패턴.

## 6. 리다이렉트 매트릭스

| 진입 경로 | 인증 상태 | 결과 |
|-----------|-----------|------|
| `/` | 비인증 | 로그인 화면 표시 |
| `/` | 인증 | `/main`으로 리다이렉트 |
| `/main`, `/calendar`, `/stats` | 비인증 | `/?redirect=<원경로>`로 리다이렉트 |
| `/main`, `/calendar`, `/stats` | 인증 | 해당 화면 표시 |
| `/auth/callback?code=…` | 비인증→인증 전환 | code 교환 후 `/main` |
| `/auth/callback?error=…` | 실패 | `/?error=한국어 메시지` |

`redirect` 쿼리는 로그인 성공 후 LoginScreen이 `router.push(redirect ?? '/main')`으로 사용.

## 7. 테스트 계약

`tests/integration/route-guard.test.tsx`:

- [ ] 비인증 상태에서 `/main` 요청 → `/` 응답 + `redirect=/main` 쿼리
- [ ] 인증 상태에서 `/` 요청 → `/main` 리다이렉트
- [ ] 비인증 상태에서 `/auth/callback?code=...` → code 교환 시도 → 성공 시 `/main`, 실패 시 `/?error=...`
- [ ] middleware가 `getUser()`만 쓰고 `getSession()`을 쓰지 않음 (정적 분석 또는 모킹)
- [ ] LogoutButton 클릭 → `signOut` 호출 → 다음 라우트 변경에서 `/` 도달
