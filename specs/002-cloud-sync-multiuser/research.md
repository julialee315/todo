# Phase 0 Research: 다중 사용자 클라우드 동기화 Todo

**Date**: 2026-05-22 | **Plan**: [plan.md](./plan.md)

Technical Context에 `NEEDS CLARIFICATION` 마커는 없다. 스택은 Supabase + Vercel + 기존 Next.js 15 위로 확정. 이 문서는 각 결정의 근거와 거부된 대안, 베스트 프랙티스를 기록한다.

---

## R1. 인증 — Supabase Auth (이메일/비밀번호 + Google OAuth)

- **Decision**: `@supabase/ssr`의 `createServerClient` / `createBrowserClient` 헬퍼를 통해 Supabase Auth를 사용한다. 이메일/비밀번호와 Google OAuth 두 공급자를 동시에 활성화한다. Google OAuth 콜백은 `/auth/callback` 라우트 핸들러가 처리한다.
- **Rationale**:
  - 헬퍼 3개(`server.ts`/`client.ts`/`middleware.ts`)는 이미 설치되어 있음(`src/utils/supabase/`).
  - `@supabase/ssr`는 Next.js App Router의 RSC·middleware·client 컴포넌트 모두에서 동일한 세션을 공유하도록 설계됨 — 세션 갱신을 middleware에 둘 수 있어 보호 라우트와 자연스럽게 결합.
  - Supabase Auth는 publishable key만 브라우저에 노출하면 되어 Constitution Governance "no `service_role` in client-exposed code" 라인을 자연스럽게 만족.
- **Alternatives considered**:
  - **NextAuth.js** — 강력하지만 Supabase 데이터베이스와 Auth를 분리해 RLS의 `auth.uid()` 연동이 어렵다. RLS 활용을 포기하면 격리를 애플리케이션 레이어에서 짊어져야 함 → 보안 면적 ↑.
  - **자체 JWT** — 단순 학습용으로는 과도. Supabase가 제공하는 토큰 갱신·OAuth·세션 라이프사이클을 다 직접 만들어야 함.
- **베스트 프랙티스**:
  - middleware는 **모든** 응답에서 세션 쿠키를 갱신해야 함 — 그렇지 않으면 토큰이 만료되어 API 호출이 401로 떨어진다.
  - `getUser()`를 RSC에서 호출해 진짜 인증 상태를 확인(서버에서 JWT 검증) — `getSession()`은 캐시된 값만 본다.

## R2. 데이터베이스 스키마 — 3 테이블, surrogate `id` + `user_id` FK

- **Decision**: Postgres 테이블 세 개로 구성한다.
  - `public.tasks` (`id uuid PK`, `user_id uuid NOT NULL REFERENCES auth.users`, 도메인 필드, `created_at`, `updated_at`)
  - `public.subtasks` (`id uuid PK`, `task_id uuid NOT NULL REFERENCES tasks ON DELETE CASCADE`, `user_id uuid NOT NULL`)
  - `public.user_preferences` (`user_id uuid PK REFERENCES auth.users ON DELETE CASCADE`, `view`, `sort`, `theme`, `seeded_at`)
  - `subtasks.user_id`은 정규화 관점에서 중복이지만 RLS 정책이 단일 컬럼만 보도록 두기 위해 의도적으로 비정규화한다 → join 없이 정책 평가, 성능·가독성 ↑.
- **Rationale**:
  - 도메인 타입(`Task`, `Subtask`, `Theme`, `ViewId`)이 이미 spec 001에서 확립되어 있어 그 모양을 그대로 반영.
  - `user_id`를 모든 행에 두면 RLS 정책이 단순 `auth.uid() = user_id` 하나로 통일됨(Constitution Governance 의무).
  - `user_preferences`를 별도 테이블로 두면 `tasks` 변경이 선호도 push를 트리거하지 않아 Realtime 채널 분리에 유리.
- **Alternatives considered**:
  - **JSONB 컬럼 하나에 통째로 저장** — 행 수준 변경이 어려워 Realtime delta가 무의미해짐. 탈락.
  - **`subtasks`를 `tasks.subs jsonb`로 인라인** — 서브태스크 단일 토글 시에도 전체 task row를 update해야 해 동시 편집 충돌이 늘어남. 탈락.
- **베스트 프랙티스**:
  - `created_at`/`updated_at`은 `timestamptz default now()`. `updated_at`은 트리거로 자동 갱신.
  - `id`는 `gen_random_uuid()` 기본값.
  - 인덱스: `tasks(user_id, due)`, `subtasks(task_id)`, `tasks(user_id, done) where done = false`(부분 인덱스).

## R3. RLS 정책 — 4종 모두 `auth.uid() = user_id`, `TO authenticated`

- **Decision**: 세 테이블 모두 `ALTER TABLE … ENABLE ROW LEVEL SECURITY`. 각 테이블에 `SELECT`/`INSERT`/`UPDATE`/`DELETE` 정책 4개를 둔다.
  ```sql
  CREATE POLICY "own rows select" ON public.tasks FOR SELECT
    TO authenticated USING ((select auth.uid()) = user_id);
  CREATE POLICY "own rows insert" ON public.tasks FOR INSERT
    TO authenticated WITH CHECK ((select auth.uid()) = user_id);
  CREATE POLICY "own rows update" ON public.tasks FOR UPDATE
    TO authenticated USING ((select auth.uid()) = user_id)
                       WITH CHECK ((select auth.uid()) = user_id);
  CREATE POLICY "own rows delete" ON public.tasks FOR DELETE
    TO authenticated USING ((select auth.uid()) = user_id);
  ```
  `subtasks`, `user_preferences`도 동일 패턴.
- **Rationale**:
  - Constitution Governance 의무 — `TO authenticated`만으로는 인가가 아니므로 ownership predicate 필수.
  - `UPDATE`는 `USING` + `WITH CHECK` 둘 다 필요 — 그렇지 않으면 사용자가 `user_id`를 다른 사용자로 바꿔 row를 빼앗을 수 있다(Constitution Governance "UPDATE policies require both USING and WITH CHECK").
  - `(select auth.uid())`는 행마다 함수 호출을 캐시해 성능 ↑(Supabase 권장 패턴).
- **Alternatives considered**:
  - **단일 `FOR ALL` 정책** — 가독성은 좋지만 INSERT에 `WITH CHECK`, SELECT에 `USING`이 모두 필요해 의도가 혼합됨. 4개로 분리하는 게 검토·테스트 용이.
  - **`auth.jwt() ->> 'sub'` 비교** — `auth.uid()`가 동일 의미의 표준 헬퍼이므로 일관성 위해 후자.

## R4. 시드 데이터 — 첫 로그인 시 서버 사이드 멱등 보장

- **Decision**: 사용자가 `/main`에 처음 도달할 때 server component가 `user_preferences.seeded_at`을 확인한다. `NULL`이면:
  1. 트랜잭션 시작
  2. `SAMPLE_TASKS` 14건을 `tasks`로 INSERT (user_id = auth.uid())
  3. 각 task의 `subs`를 `subtasks`로 INSERT
  4. `user_preferences`를 upsert하며 `seeded_at = now()` 설정
  5. 커밋
  멱등하므로 동시 두 탭에서 첫 로그인이 일어나도 안전(unique constraint + ON CONFLICT DO NOTHING).
- **Rationale**:
  - Edge Function·DB trigger를 도입하지 않아 Constitution III(YAGNI) 준수.
  - Auth trigger(`on auth.user created` → seed)는 `SECURITY DEFINER`를 요구해 Governance 라인 위반 위험 ↑.
  - 서버 측 fetch 시점에 멱등 체크 하나만 두면 충분.
- **Alternatives considered**:
  - **클라이언트에서 시드** — RLS 정책으로 가능하지만 두 탭 동시 첫 로그인 시 race condition 가능 + 네트워크 왕복 14회.
  - **DB trigger** — `SECURITY DEFINER` 필요. Governance 라인 위반.
- **베스트 프랙티스**:
  - `seeded_at` 컬럼을 두어 "이미 시드됨" 표식. 사용자가 시드를 다 지우고 다시 로그인해도 재주입되지 않음(spec FR-013).
  - 시드 INSERT는 단일 SQL `INSERT INTO tasks (...) SELECT ... FROM (VALUES ...)` 또는 supabase-js의 bulk insert 한 번으로.

## R5. 실시간 동기화 — Supabase Realtime, `user_id` 필터

- **Decision**: `TasksProvider`가 마운트 시 다음 두 채널을 구독한다.
  ```ts
  supabase.channel('tasks-by-user')
    .on('postgres_changes',
        { event: '*', schema: 'public', table: 'tasks', filter: `user_id=eq.${userId}` },
        handleTaskChange)
    .on('postgres_changes',
        { event: '*', schema: 'public', table: 'subtasks', filter: `user_id=eq.${userId}` },
        handleSubtaskChange)
    .subscribe();
  ```
  콜백에서 `dispatch({ type: 'remote/applyChange', payload })`로 기존 reducer에 흘려보낸다. Reducer는 remote/local 구분 없이 적용한다(last-write-wins 자연 달성).
- **Rationale**:
  - 필터를 `user_id=eq.${userId}`로 두면 다른 사용자의 이벤트가 채널에 도달하지 않음(spec FR-019). RLS와 이중 방어.
  - 두 채널을 하나의 `.channel(...)`에 묶으면 단일 WebSocket을 공유 → 리소스 효율.
- **Alternatives considered**:
  - **별도 채널 2개** — 디버깅에 유리하지만 WebSocket 2개 사용. 단일 채널 + 두 on()으로 충분.
  - **Broadcast 채널** — 명시적 publish 호출이 필요해 reducer 로직과 결합도 ↑. postgres_changes가 자동.
- **베스트 프랙티스**:
  - 본인이 발생시킨 변경의 echo를 dispatch에서 식별하려면 `eventId`를 클라이언트에서 생성해 INSERT/UPDATE 시 함께 보내거나, 단순히 멱등 reducer를 두어 echo를 무시한다(상태가 같으면 no-op). 후자가 단순해 채택.
  - `realtime` publication에 세 테이블 모두 추가해야 함:
    ```sql
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks, public.subtasks, public.user_preferences;
    ```

## R6. 충돌 해소 — Last-Write-Wins (Postgres 기본)

- **Decision**: 동시 UPDATE는 Postgres의 자연스러운 순서에 맡긴다 — 늦게 도착한 트랜잭션이 최종 상태. 클라이언트는 Realtime push로 최종 상태를 받는다.
- **Rationale**:
  - spec US3 acceptance #3: "더 늦은 변경 값으로 양쪽 탭이 수렴". Postgres가 이미 그렇게 동작.
  - 학습용 앱이라 OT/CRDT 같은 머지 알고리즘은 과도.
- **Alternatives considered**:
  - **Optimistic concurrency** (`updated_at` 비교 후 거부) — 사용자에게 충돌 UX를 만들어야 함. 범위 밖.
  - **CRDT** — 라이브러리 도입 + 데이터 모델 변경 필요. YAGNI.

## R7. 데모 클럭 제거 — `today()` 함수 + 테스트에서 `vi.setSystemTime`

- **Decision**: `src/lib/store/dates.ts`의 `TODAY = new Date(2026,4,15)` 상수를 `function today(): Date { return new Date(); }` 함수로 바꾼다. 모든 호출부(`relDay`, `isOverdue`, `isToday`, `isUpcoming`)는 함수 호출로 전환. 기존 테스트는 `beforeEach(() => vi.setSystemTime(new Date('2026-05-15')))`로 결정성 유지.
- **Rationale**:
  - spec FR-024 명시 — 실시간 시각으로 전환.
  - 함수로 두면 테스트가 `setSystemTime`만으로 결정적이고, 프로덕션은 자연스럽게 현재 시각.
- **Alternatives considered**:
  - **`Date.now()`를 직접 쓰기** — 함수 boundary가 없어 테스트 격리 ↓.
  - **DI(주입)** — 모든 호출부에 인자 추가 필요. 과도.

## R8. 오프라인 — 마지막 캐시 표시, 편집 차단

- **Decision**: `tasks-repo.server.ts`가 fetch 성공 시 결과를 `localStorage.lastSyncedSnapshot`에 저장. 클라이언트 마운트 시 `navigator.onLine === false` 또는 fetch 실패면 그 스냅샷을 hydrate해 화면에 표시. 같은 상태에서 모든 mutation 버튼은 disabled + "오프라인 상태입니다" 토스트.
- **Rationale**:
  - spec Assumptions: "오프라인 동안 화면은 마지막으로 동기화된 상태를 읽기 전용으로". 쓰기 큐 도입 시 spec 범위 초과.
  - `localStorage`를 캐시로만 쓰면 단일 진실원은 클라우드, 캐시는 보조. 단순.
- **Alternatives considered**:
  - **Service Worker + 큐** — 큰 스코프. YAGNI.
  - **오프라인 화면 차단** — 사용자가 "지금 뭐가 있는지"도 못 봄. 나쁜 UX.

## R9. Vercel 배포 — 환경 변수 + OAuth Redirect URL 화이트리스트

- **Decision**: Vercel 프로젝트의 Environment Variables에 다음을 등록 (Production + Preview + Development 모두):
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
  Supabase Dashboard → Authentication → URL Configuration에 다음 redirect URL을 등록:
  - `http://localhost:3000/auth/callback`
  - `https://<vercel-prod-domain>/auth/callback`
  - `https://*-<team>.vercel.app/auth/callback` (Preview 배포)
- **Rationale**:
  - Vercel Preview 배포는 매번 다른 URL이라 와일드카드 redirect를 허용해야 함.
  - 환경변수는 `NEXT_PUBLIC_*`이라 자동으로 클라이언트에 노출 — publishable key만 두므로 안전.
- **베스트 프랙티스**:
  - `service_role`은 절대 Vercel에 등록하지 않음. 이 프로젝트는 server-side에서도 RLS를 거치므로 필요 없음.
  - Google Cloud Console의 OAuth client에도 동일한 redirect URL 등록 필요.

## R10. 기존 테스트 적응 — 어댑터 모킹 + 시계 모킹

- **Decision**: `tests/setup.ts`에서 전역 `vi.setSystemTime(new Date('2026-05-15T09:00:00+09:00'))`를 설정. `tests/components/`의 기존 테스트는 `vi.mock('@/utils/supabase/client')`로 supabase 클라이언트를 boundary 모킹. `TasksProvider` 테스트는 어댑터를 직접 모킹해 reducer 동작만 검증.
- **Rationale**:
  - 기존 122개 테스트는 도메인 로직 회귀 방지의 자산. 폐기하지 않고 그대로 통과시키는 것이 Constitution II(Design Fidelity의 정신).
- **Alternatives considered**:
  - **기존 테스트 폐기** — 회귀 안전망 손실. 탈락.
  - **로컬 Supabase 컨테이너로 통합 테스트** — 가치 있지만 학습 범위 초과. 후속 spec으로.

---

## 미해결 항목

없음. 모든 결정이 Phase 1으로 넘어갈 만큼 구체적이다.
