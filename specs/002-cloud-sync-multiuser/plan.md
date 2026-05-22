# Implementation Plan: 다중 사용자 클라우드 동기화 Todo

**Branch**: `002-cloud-sync-multiuser` (현재 작업은 `master`에 있음) | **Date**: 2026-05-22 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/002-cloud-sync-multiuser/spec.md`

## Summary

기존 localStorage 기반 단일 사용자 Todo 앱(`specs/001-todo-app`)을 **Supabase**(인증·DB·Realtime)와 **Vercel**(호스팅) 위에서 동작하는 **다중 사용자 클라우드 앱**으로 전환한다. UI·디자인 토큰·기존 인터랙션은 100% 보존하고, **데이터 어댑터 계층(`src/lib/supabase-store/`)만 교체**하는 방식으로 구현한다. 핵심 기술 접근:

1. **인증** — Supabase Auth (이메일/비밀번호 + Google OAuth). `@supabase/ssr`의 server/client/middleware 헬퍼는 이미 설치됨.
2. **데이터** — Postgres 3개 테이블(`tasks`, `subtasks`, `user_preferences`) + 각 테이블에 **RLS** 정책으로 사용자 격리.
3. **실시간** — Supabase Realtime 채널 구독으로 같은 사용자의 다른 세션에 push.
4. **데모 클럭 제거** — `TODAY = new Date(2026,4,15)` 상수를 `new Date()`로 교체. 테스트는 `vi.setSystemTime`으로 결정성 유지.
5. **순수 모듈은 불변** — `reducer.ts`·`selectors.ts`는 그대로. `persistence.ts`만 Supabase 어댑터로 교체.

## Technical Context

**Language/Version**: TypeScript 5.x (strict), Node.js 20+
**Primary Dependencies**:
- 기존: Next.js 15 (App Router), React 18, Vitest, @testing-library/react, jsdom
- 신규(이미 설치됨): `@supabase/supabase-js`, `@supabase/ssr`
- 신규(개발 도구): `supabase` CLI (로컬 마이그레이션 생성 시), `vercel` CLI (선택)

**Storage**:
- **Auth & Remote data**: Supabase Postgres (테이블 `tasks`, `subtasks`, `user_preferences`) + RLS.
- **Local cache**: 클라이언트 메모리(`useReducer` 상태) + 마지막 동기 스냅샷은 `localStorage`에 읽기-전용 캐시로만 보관(오프라인 디스플레이용; 편집 큐 아님).

**Testing**: Vitest + React Testing Library, jsdom 환경. Supabase 클라이언트는 boundary에서 `vi.mock('@supabase/supabase-js')` / `vi.mock('@/utils/supabase/client')`로 모킹.

**Target Platform**:
- **Browser**: 최신 데스크톱 브라우저 (Chrome/Safari/Firefox/Edge).
- **Host**: Vercel (Production + Preview 배포). Next.js Edge runtime은 middleware에만 사용.

**Project Type**: Web application — 프론트엔드 단일 프로젝트(Next.js App Router) + BaaS(Supabase). 별도 백엔드 서비스 없음.

**Performance Goals**:
- 상호작용 → 클라우드 반영: **< 2초** (SC-003/SC-004).
- 실시간 push 도달: **< 2초** (SC-004).
- 첫 로그인 → 시드된 메인 화면: **< 60초** (SC-001).

**Constraints**:
- **보안**(Constitution v1.1.0 Governance): publishable key만 브라우저 노출, `service_role` 절대 금지, 모든 테이블 RLS + ownership predicate, `user_metadata` 인증 결정에 사용 금지, view는 `security_invoker`, `SECURITY DEFINER` 함수의 `public` 스키마 격리 금지.
- **회귀 금지**: 기존 4개 화면의 시각·동작 변경 없음. 기존 122개 테스트는 데모 클럭 교체에 따른 시계 모킹만 추가하고 그대로 통과시킨다.
- **오프라인**: 마지막 캐시 표시 + 편집 차단. 쓰기 큐 없음(범위 밖).

**Scale/Scope**:
- 사용자 수: 학습용 — 동시 활성 사용자 < 100. Supabase Free Tier로 충분.
- 사용자당 데이터: 평균 ~50개 할 일 + 서브태스크. 시드는 14개.
- 화면 4개, 신규 컴포넌트 3개(LoginForm, SignupForm, GoogleButton — 모두 LoginScreen 내부).

## Constitution Check

*GATE: Phase 0 연구 전 통과 필수. Phase 1 설계 후 재확인.*

| 원칙 | 게이트 | 초기 평가 (Phase 0 전) |
|------|--------|------------------------|
| I. Test-First (NON-NEGOTIABLE) | 모든 신규 로직·컴포넌트·DB 정책에 실패 테스트가 선행되는가 | **PASS** — Supabase 클라이언트는 `@/utils/supabase/*` boundary에서 모킹. 새 어댑터(`tasks-repo`, `seed`, `realtime` 등)·새 컴포넌트(LoginForm/SignupForm/GoogleButton)·middleware는 단위·통합 테스트 선행. RLS 정책은 별도 SQL 테스트 또는 격리 통합 테스트로 검증. |
| II. Design Fidelity | 디자인 토큰·기존 화면 시각·기존 인터랙션 보존 | **PASS** — UI 변경은 LoginScreen의 폼 동작 연결과 사이드 네비게이션의 로그아웃 버튼 추가에 한정. 토큰·레이아웃·테마 미러는 무변경. |
| III. Simplicity & YAGNI | spec이 명시한 범위 내, 추측성 추가 없음 | **PASS** — Supabase는 spec이 명시적으로 허가. Edge Function·DB trigger 회피(첫 로그인 시드는 서버 측 RSC에서 멱등하게 보장). 오프라인 쓰기 큐 회피. 계정 연결·비밀번호 재설정·이메일 인증은 명시적으로 v1 범위 밖. |
| IV. Component Modularity | 화면/공유 컴포넌트 분리, 데이터 어댑터 단일 진입점 | **PASS** — 데이터 어댑터는 `src/lib/supabase-store/`에 격리. 컴포넌트는 어댑터 API와 store API(기존 selectors)만 소비. 기존 `reducer.ts`/`selectors.ts`는 불변. |
| V. Accessibility | 시맨틱 HTML·aria·키보드·포커스 | **PASS** — 신규 폼은 `<form>`/`<label htmlFor>`/`<input required>`/`<button type="submit">`. Google 버튼은 접근 가능한 이름(`aria-label="Google로 계속하기"`). 오류 메시지는 `role="alert"`. |
| Supabase 보안 (Governance) | 키 노출·RLS·ownership·user_metadata·security_invoker·SECURITY DEFINER | **PASS** — publishable key만 `NEXT_PUBLIC_*`. RLS는 세 테이블 모두에 `TO authenticated USING (auth.uid() = user_id) WITH CHECK (...)`로 동일하게 적용. 모든 view 미사용(필요 시 `security_invoker = true`). `SECURITY DEFINER` 함수 도입 없음. |

**Post-Design 재확인 (Phase 1 후)**: data-model·contracts/* 작성 후 재평가 — 어떤 원칙도 위반하지 않음. 어댑터 경계(`src/lib/supabase-store/`)와 boundary 모킹이 원칙 I·IV를 구조적으로 보장하고, RLS 계약(`contracts/db-schema.md`)이 Supabase Governance 라인의 모든 항목을 명문화한다. **결과: PASS, 위반 없음.**

## Project Structure

### Documentation (this feature)

```text
specs/002-cloud-sync-multiuser/
├── plan.md              # 이 파일
├── spec.md              # 기능 명세
├── research.md          # Phase 0 출력
├── data-model.md        # Phase 1: 엔티티·관계·상태 전이
├── quickstart.md        # Phase 1: 로컬·Vercel 실행/검증
├── contracts/
│   ├── db-schema.md     # Phase 1: Postgres 테이블 + RLS + Realtime publication DDL
│   ├── store-api.md     # Phase 1: 데이터 어댑터 + store 공개 TS API
│   ├── realtime.md      # Phase 1: 채널·이벤트·구독 라이프사이클 계약
│   └── routes.md        # Phase 1: 라우트 맵 + 인증 가드
├── checklists/
│   └── requirements.md  # 명세 품질 체크리스트 (specify 단계 생성)
└── tasks.md             # Phase 2 출력 (/speckit-tasks)
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── layout.tsx                # 수정: AuthProvider · TasksProvider · ThemeProvider 트리
│   ├── page.tsx                  # 수정: 로그인/회원가입 폼 + Google 버튼 (RSC 셸 → "use client" LoginScreen)
│   ├── main/page.tsx             # 수정: 서버에서 초기 tasks·preferences fetch 후 TasksProvider에 hydrate
│   ├── calendar/page.tsx         # 무변경 (TasksProvider 컨텍스트에서 데이터 소비)
│   ├── stats/page.tsx            # 무변경
│   └── auth/
│       └── callback/route.ts     # NEW: Google OAuth 콜백 — code → session 교환 후 /main 리다이렉트
├── middleware.ts                 # NEW: Supabase 세션 자동 갱신 + 보호 라우트 가드
├── utils/supabase/
│   ├── server.ts                 # 기존 (이미 설치됨)
│   ├── client.ts                 # 기존
│   └── middleware.ts             # 기존
├── lib/
│   ├── types.ts                  # 확장: AuthUser, DbTask, DbSubtask, DbPreference 타입 추가
│   ├── store/
│   │   ├── reducer.ts            # 불변
│   │   ├── selectors.ts          # 불변
│   │   ├── dates.ts              # 수정: TODAY → today() 함수(실시간) — 호출부 변경 동반
│   │   ├── sample-data.ts        # 불변 (시드 소스)
│   │   └── persistence.ts        # 제거 또는 deprecate (Supabase 어댑터로 대체)
│   ├── supabase-store/           # NEW: 데이터 어댑터 경계
│   │   ├── tasks-repo.server.ts  #   서버용 list/get (RSC에서 호출)
│   │   ├── tasks-mutations.ts    #   클라이언트용 insert/update/delete
│   │   ├── subtasks.ts           #   서브태스크 CRUD
│   │   ├── preferences.ts        #   user_preferences load/save
│   │   ├── seed.ts               #   첫 로그인 시드 (멱등)
│   │   ├── realtime.ts           #   채널 구독 훅 useTasksRealtime()
│   │   └── mappers.ts            #   DB row ↔ 도메인 타입 변환
│   └── stats-data.ts             # 불변
├── context/
│   ├── AuthProvider.tsx          # NEW: useSession(), useUser(), signIn/signUp/signOut
│   ├── TasksProvider.tsx         # 수정: Supabase 어댑터 + 실시간 구독 + 변경 dispatch
│   └── ThemeProvider.tsx         # 수정: 테마 변경 시 preferences.upsert
└── components/
    ├── login/
    │   ├── LoginScreen.tsx       # 수정: 폼 컨테이너 (탭/카드 전환)
    │   ├── EmailPasswordForm.tsx # NEW: 로그인/회원가입 폼 (모드 prop)
    │   ├── GoogleButton.tsx      # NEW: "Google로 계속하기" 버튼
    │   └── AuthError.tsx         # NEW: role="alert" 오류 표시
    ├── shared/
    │   ├── SideNav.tsx           # 수정: footer에 LogoutButton 추가
    │   ├── LogoutButton.tsx      # NEW
    │   └── (기존 동일)
    └── (main/calendar/stats 무변경)

supabase/                          # NEW: 인프라
└── migrations/
    ├── <ts>_create_core_tables.sql       # tasks/subtasks/user_preferences + indexes
    ├── <ts>_enable_rls_policies.sql      # RLS enable + SELECT/INSERT/UPDATE/DELETE 정책
    └── <ts>_realtime_publication.sql     # supabase_realtime publication 추가

tests/
├── unit/                          # 기존 + 신규
│   ├── dates.test.ts              #   수정: today() 함수 + vi.setSystemTime
│   ├── selectors.test.ts          #   기존 (불변)
│   ├── reducer.test.ts            #   기존 (불변)
│   ├── persistence.test.ts        #   제거
│   └── supabase-store/            #   NEW
│       ├── mappers.test.ts
│       ├── seed.test.ts
│       └── realtime.test.ts        #   채널 콜백 dispatch 검증 (Realtime 클라이언트 모킹)
├── components/                    # 기존 + 신규
│   ├── LoginScreen.test.tsx       #   수정: 폼·Google 버튼·오류 표시
│   ├── EmailPasswordForm.test.tsx #   NEW
│   ├── GoogleButton.test.tsx      #   NEW
│   ├── LogoutButton.test.tsx      #   NEW
│   ├── AuthProvider.test.tsx      #   NEW: signIn/signUp/signOut 흐름
│   ├── TasksProvider.test.tsx     #   수정: Supabase 어댑터 모킹
│   ├── ThemeProvider.test.tsx     #   수정: preferences upsert 검증
│   └── (나머지 기존 동일)
└── integration/                   # NEW
    ├── auth-flow.test.tsx         #   가입→로그인→메인→로그아웃→재로그인
    ├── route-guard.test.tsx       #   /main 비인증 시 / 로 리다이렉트
    └── tasks-sync.test.tsx        #   추가→재구독→다른 클라이언트에 도착 (모킹)

# 루트 설정
.env.local          # 기존 (이미 설치됨)
.env.local.example  # NEW: 다른 개발자/Vercel 가이드용
package.json · tsconfig.json · next.config.ts · vitest.config.ts
```

**Structure Decision**: 단일 웹 프론트엔드 + BaaS. 구조의 핵심 결정은 **데이터 어댑터를 단일 경계(`src/lib/supabase-store/`)에 격리**한다는 것 — 이로써 (a) 기존 순수 모듈(`reducer`, `selectors`)은 변경되지 않고, (b) 어댑터를 boundary 모킹으로 테스트하면 컴포넌트가 어댑터 구현을 알 필요 없어 Constitution 원칙 I·IV가 구조적으로 강제된다. App Router 페이지는 (1) `/main`만 server component로 두어 초기 fetch + 보호 라우트, (2) 나머지 화면은 클라이언트 컴포넌트로 유지해 프로토타입 동작 동등성을 보존한다. middleware는 세션 갱신·보호 라우트 두 역할만 한다.

## Complexity Tracking

> Constitution Check 위반 없음 — 비움.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| (없음)    | —          | —                                   |
