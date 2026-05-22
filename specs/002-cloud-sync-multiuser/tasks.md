---

description: "다중 사용자 클라우드 동기화 Todo — task 분해"
---

# Tasks: 다중 사용자 클라우드 동기화 Todo

**Input**: Design documents from `specs/002-cloud-sync-multiuser/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests**: 본 프로젝트는 Constitution v1.1.0 **원칙 I (Test-First, NON-NEGOTIABLE)**에 의해 모든 코드 task에 선행 실패 테스트가 필요하다. `/speckit-tasks`의 "tests optional" 기본은 명시적으로 **오버라이드**된다.

**Organization**: 4개 user story(US1~US4)로 그룹화. 각 story는 단독 검증·시연 가능.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 다른 파일이고 미완 의존이 없어 병렬 가능
- **[Story]**: User Story 매핑 (US1, US2, US3, US4)
- 모든 task는 정확한 파일 경로를 포함

## Path Conventions

`src/`·`tests/`는 저장소 루트 기준. 자세한 구조는 [plan.md §Project Structure](./plan.md#project-structure) 참고. Supabase 마이그레이션은 `supabase/migrations/`에 위치.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 외부 인프라(Supabase 프로젝트) 준비 + 개발 환경 조정.

- [ ] T001 Supabase Dashboard에서 프로젝트 생성 후 `Project URL`과 `publishable key`를 복사해 저장소 루트 `.env.local`에 적용 — [quickstart.md §1.1-1.2](./quickstart.md) 절차 그대로
- [X] T002 [P] 저장소 루트에 `.env.local.example` 생성 — `NEXT_PUBLIC_SUPABASE_URL=...`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...` placeholder
- [X] T003 [P] `supabase/migrations/` 디렉토리 생성 (빈 디렉토리 추적용 `.gitkeep`)
- [X] T004 [P] `tests/setup.ts`에 `beforeEach(() => vi.setSystemTime(new Date('2026-05-15T09:00:00+09:00')))` 추가 — 기존 122개 테스트가 데모 클럭 교체 이후에도 결정성을 유지하도록

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 모든 US의 공통 의존성. 이 phase가 끝나기 전엔 US1~US4 어떤 것도 시작 불가.

**⚠️ CRITICAL**: 이 phase 완료 후에야 user story 작업 시작 가능.

### Database & RLS

- [X] T005 `supabase migration new create_core_tables` 실행 후 생성된 SQL 파일에 [contracts/db-schema.md §1](./contracts/db-schema.md#1-테이블) DDL 그대로 작성 (`tasks`, `subtasks`, `user_preferences` + 인덱스)
- [X] T006 `supabase migration new add_triggers` 실행 후 [contracts/db-schema.md §2](./contracts/db-schema.md#2-트리거--updated_at-자동-갱신--subtasksuser_id-무결성) SQL 작성 (`touch_updated_at`, `subtasks_enforce_user_id` 함수 + 3개 트리거)
- [X] T007 `supabase migration new enable_rls_policies` 실행 후 [contracts/db-schema.md §3](./contracts/db-schema.md#3-rls-활성화--정책) SQL 작성 (3 테이블 × 4 정책 = 12개)
- [X] T008 `supabase migration new realtime_publication` 실행 후 [contracts/db-schema.md §4](./contracts/db-schema.md#4-realtime-publication) SQL 작성 (`ALTER PUBLICATION supabase_realtime ADD TABLE ...`)
- [ ] T009 `supabase db push`로 4개 마이그레이션 dev 프로젝트에 적용. Supabase Dashboard → Authentication → Policies에서 세 테이블 모두 "RLS Enabled"인지 시각 확인
- [ ] T010 `supabase db advisors` 실행 — 경고 0건 확인. 경고 발생 시 마이그레이션 수정 후 T009부터 재실행

### Types & Mappers

- [X] T011 [P] `src/lib/types.ts` 확장 — `AuthUser`, `DbTaskRow`, `DbSubtaskRow`, `DbPreferenceRow`, `DbTaskInsert`, `DbSubtaskInsert`, `DbPreferenceUpsert`, `SortId`, `RealtimeChange` 추가 (기존 도메인 타입은 무변경)
- [X] T012 [P] `tests/unit/supabase-store/mappers.test.ts` 작성 (RED) — `dbTaskToDomain`, `domainTaskToDbInsert`, `dbSubtaskToDomain`, `domainSubtaskToDbInsert`, `dbPreferenceToDomain`의 6경로 단위 테스트
- [X] T013 `src/lib/supabase-store/mappers.ts` 구현 (GREEN) — T012 통과시키기. `due: ''` ↔ `due: null` 매핑 포함

### 데모 클럭 제거 (`TODAY` → `today()`)

- [X] T014 [P] `tests/unit/dates.test.ts` 수정 — 기존 `TODAY` 상수 직접 참조를 `today()` 함수 호출로 변경, `vi.setSystemTime` 활용
- [X] T015 `src/lib/store/dates.ts` 수정 — `TODAY` 상수와 `TODAY_KEY` 상수를 `today(): Date`와 `todayKey(): string` 함수로 교체. `relDay`/`isOverdue`/`isToday`/`isUpcoming` 등 모든 내부 호출 갱신
- [X] T016 `src/lib/store/selectors.ts` 호출부 갱신 — `TODAY` → `today()`, `TODAY_KEY` → `todayKey()` (로직 변경 없음, 호출 형태만)
- [X] T017 [P] `tests/unit/selectors.test.ts` 실행해 setSystemTime 하에 기존 검증 모두 통과하는지 확인 (필요 시 fixture 보정)
- [X] T018 `src/lib/store/persistence.ts` 제거 + `tests/unit/persistence.test.ts` 제거 — 어댑터 계층이 영속성을 인수 ([store-api.md §10](./contracts/store-api.md)). **DEFERRED to US2 (T050~T053)**: 단독 제거 시 `TasksProvider`의 `loadTasks/saveTasks` 임포트가 깨지므로 TasksProvider를 어댑터로 재배선할 때 함께 제거.

**Checkpoint**: Foundation 완료. T011~T018의 작업이 모든 user story에 깔려 있고, US1~US4가 병렬로 시작 가능.

---

## Phase 3: User Story 1 — 이메일/비밀번호 인증 (P1) 🎯 MVP

**Goal**: 사용자가 이메일+비밀번호로 가입·로그인·로그아웃하고, 세션이 새로고침을 가로질러 유지되며, 비인증 사용자가 `/main`·`/calendar`·`/stats`에 들어가면 `/`로 리다이렉트된다.

**Independent Test**: [spec.md §US1](./spec.md#user-story-1--이메일비밀번호-인증-priority-p1)의 7개 acceptance 시나리오를 모두 만족. 메인 화면은 빈 상태(데이터는 US2 범위)여도 됨.

### Tests for User Story 1 (write FIRST, ensure FAIL) ⚠️

- [X] T019 [P] [US1] `tests/components/AuthProvider.test.tsx` — 가입/로그인/로그아웃 성공·실패 경로 검증 (`@supabase/ssr` boundary 모킹). `loading` 상태 전이도 검증
- [X] T020 [P] [US1] `tests/components/EmailPasswordForm.test.tsx` — 입력·제출(Enter 포함)·오류 표시·`aria-invalid` 토글 검증
- [X] T021 [P] [US1] `tests/components/LoginScreen.test.tsx` 갱신 — 로그인/회원가입 탭 전환, 폼 마운트, AuthError 표시 (Google 버튼은 stub 처리)
- [X] T022 [P] [US1] `tests/components/LogoutButton.test.tsx` — 클릭 시 `signOut` 호출되는지 검증
- [X] T023 [P] [US1] `tests/components/SideNav.test.tsx` 갱신 — LogoutButton이 footer에 ThemeToggle과 나란히 렌더되는지
- [X] T024 [P] [US1] `tests/integration/auth-flow.test.tsx` — 가입 → `/main` 도착 → 로그아웃 → `/` 도착 → 재로그인 → `/main` (전체를 어댑터 모킹으로)
- [X] T025 [P] [US1] `tests/integration/route-guard.test.tsx` — 비인증 `/main` 요청 시 `/?redirect=/main`으로 리다이렉트, 인증 상태에서 `/` 요청 시 `/main`으로 — middleware 동작 검증

### Implementation for User Story 1

- [X] T026 [P] [US1] `src/context/AuthProvider.tsx` 작성 — `useAuth()`, `signInWithPassword`, `signUpWithPassword`, `signOut` 구현. `signInWithGoogle`은 본 phase에서 stub(throw 'not implemented')으로 두고 US4에서 채움
- [X] T027 [US1] `src/app/layout.tsx` 수정 — `<AuthProvider>` 트리 추가(기존 ThemeProvider/TasksProvider 외부에)
- [X] T028 [P] [US1] `src/components/login/EmailPasswordForm.tsx` 작성 — `mode: 'signin' | 'signup'` prop, `<form>` 시맨틱, `<label htmlFor>`, 최소 8자 검증, Enter 제출
- [X] T029 [P] [US1] `src/components/login/AuthError.tsx` 작성 — `role="alert"`, 한국어 메시지 표시
- [X] T030 [US1] `src/components/login/LoginScreen.tsx` 수정 — 탭 토글(state) + `EmailPasswordForm` + `AuthError` 통합. Google 버튼 자리는 placeholder div(US4에서 교체)
- [X] T031 [P] [US1] `src/components/shared/LogoutButton.tsx` 작성 — `useAuth().signOut` 호출, `aria-label="로그아웃"`, 키보드 포커스 가능
- [X] T032 [US1] `src/components/shared/SideNav.tsx` 수정 — footer에 `<LogoutButton />`을 `<ThemeToggle />` 옆에 추가 (T031 의존)
- [X] T033 [US1] `src/middleware.ts` 작성 — [contracts/routes.md §2](./contracts/routes.md#2-인증-가드--srcmiddlewarets) 코드 그대로. `getUser()` 사용, `getSession()` 금지. matcher에 정적 자원 제외
- [X] T034 [US1] `src/app/main/page.tsx` 임시 셸 — RSC에서 `createServerClient`로 `getUser()` 호출, 비인증 시 `redirect('/')`, 인증 시 빈 `TasksProvider` 셸 렌더 (실제 데이터 fetch는 US2에서 추가)
- [X] T035 [US1] `src/app/page.tsx` 수정 — 인증 상태에서는 middleware가 이미 `/main`으로 보내지만, 클라이언트 측 hydration에서도 `useAuth().user`가 있으면 `router.replace('/main')` (이중 가드)

**Checkpoint**: US1 fully functional. 가입·로그인·로그아웃·세션 유지·라우트 가드가 모두 동작한다. `/main`은 빈 상태로 보이지만 사이드 네비와 로그아웃 버튼은 정상 동작.

---

## Phase 4: User Story 2 — 사용자별 클라우드 데이터 (P2)

**Goal**: 인증된 사용자가 자기 데이터만 보고·수정·삭제한다. 첫 로그인 시 시드 14건이 자동 채워진다. 다른 사용자의 데이터는 어떤 경로로도 접근 불가.

**Independent Test**: [spec.md §US2](./spec.md#user-story-2--사용자별-클라우드-데이터-priority-p2)의 6개 acceptance 시나리오. 두 사용자 격리 시나리오(A·B) 포함.

### Tests for User Story 2 (write FIRST, ensure FAIL) ⚠️

- [X] T036 [P] [US2] `tests/unit/supabase-store/seed.test.ts` — `ensureSeed` 멱등 동작: `seeded_at IS NULL` → 14건 INSERT + subs INSERT + `seeded_at = now()`; 이미 시드됨 → no-op; 동시 호출 경합 → 한쪽 성공·다른쪽 catch 후 무시
- [X] T037 [P] [US2] `tests/unit/supabase-store/tasks-repo.test.ts` — `listTasksForUser`가 tasks + subtasks 두 fetch를 메모리 join, `created_at DESC` 정렬, sub들은 `sort_order ASC`
- [X] T038 [P] [US2] `tests/unit/supabase-store/tasks-mutations.test.ts` — `addTask`(공백만 → throw), `updateTask`(빈 patch → no-op), `deleteTask`(0행 영향 → throw), `toggleTaskDone`, `toggleTaskStarred`
- [X] T039 [P] [US2] `tests/unit/supabase-store/subtasks.test.ts` — `addSubtask`(sort_order = max+1), `updateSubtask`, `deleteSubtask`, `reorderSubtasks`(트랜잭션 한 번)
- [X] T040 [P] [US2] `tests/unit/supabase-store/preferences.test.ts` — `savePreference` upsert가 `user_id` 명시하지 않고 RLS WITH CHECK에 의존
- [X] T041 [P] [US2] `tests/components/TasksProvider.test.tsx` 갱신 — 어댑터 모킹, 사용자 동작 → mutation 호출 + dispatch 검증. 초기 hydrate prop 동작
- [X] T042 [P] [US2] `tests/components/ThemeProvider.test.tsx` 갱신 — 테마 토글 시 `savePreference({ theme })` 호출
- [X] T043 [P] [US2] `tests/integration/cloud-data-isolation.test.tsx` — 사용자 A로 task INSERT 후, B 세션에서 같은 task ID로 select/update/delete 시 0행 — 어댑터에서 RLS 응답 모킹
- [X] T044 [P] [US2] `tests/integration/offline-cache.test.tsx` — `navigator.onLine = false`로 둔 상태에서 마지막 `lastSyncedSnapshot`이 화면에 표시되고, 모든 mutation 버튼이 disabled + 토스트 표시

### Implementation for User Story 2

- [X] T045 [P] [US2] `src/lib/supabase-store/seed.ts` — `ensureSeed(userId)` — [db-schema.md §5 시드 수입 패턴](./contracts/db-schema.md#5-시드-수입-패턴) 그대로
- [X] T046 [P] [US2] `src/lib/supabase-store/tasks-repo.server.ts` — `listTasksForUser`, `getTaskById`, `loadPreferences`. 호출 전 `ensureSeed` 자동 호출(멱등이라 안전)
- [X] T047 [P] [US2] `src/lib/supabase-store/tasks-mutations.ts` — `addTask`/`updateTask`/`deleteTask`/`toggleTaskDone`/`toggleTaskStarred` ([store-api.md §3](./contracts/store-api.md))
- [X] T048 [P] [US2] `src/lib/supabase-store/subtasks.ts` — `addSubtask`/`updateSubtask`/`deleteSubtask`/`reorderSubtasks`
- [X] T049 [P] [US2] `src/lib/supabase-store/preferences.ts` — `savePreference(patch)` upsert
- [X] T050 [US2] `src/app/main/page.tsx` 갱신 (T034 위에) — `listTasksForUser` + `loadPreferences` 호출 후 결과를 `<TasksProvider initialTasks={...} initialPrefs={...}>` props로 hydrate
- [X] T051 [US2] `src/context/TasksProvider.tsx` 갱신 — (a) initialTasks/initialPrefs prop으로 useReducer lazy init, (b) 모든 mutation 핸들러를 어댑터 호출로 위임, (c) 성공한 fetch는 `localStorage.lastSyncedSnapshot`에 캐시
- [X] T052 [US2] `src/context/ThemeProvider.tsx` 갱신 — `setTheme` 호출 시 `savePreference({ theme })` 호출 + 로컬 state 갱신
- [X] T053 [US2] 오프라인 핸들링 — `TasksProvider`에 `navigator.onLine` 리스너, 오프라인이면 mutation 함수들이 즉시 throw + 토스트 컴포넌트로 안내. 화면은 캐시된 마지막 snapshot 표시

**Checkpoint**: US1 + US2 모두 동작. 두 사용자가 격리되고, 첫 로그인 시드가 채워지고, 모든 CRUD가 클라우드에 즉시 반영. 같은 계정으로 다른 브라우저 로그인 시 같은 상태.

---

## Phase 5: User Story 3 — 멀티 디바이스 실시간 동기화 (P3)

**Goal**: 같은 사용자의 두 세션이 한쪽 변경 후 2초 이내 자동 수렴. 충돌은 last-write-wins.

**Independent Test**: [spec.md §US3](./spec.md#user-story-3--멀티-디바이스-실시간-동기화-priority-p3)의 4개 acceptance 시나리오. 두 탭 시연.

### Tests for User Story 3 (write FIRST, ensure FAIL) ⚠️

- [X] T054 [P] [US3] `tests/unit/supabase-store/realtime.test.ts` — `subscribeToUserChanges`가 단일 채널에 세 테이블 핸들러 바인딩, `user_id=eq.${userId}` 필터, postgres_changes 페이로드 → `RealtimeChange` 변환, unsubscribe 동작
- [X] T055 [P] [US3] `tests/unit/reducer.test.ts` 확장 — `remote/applyChange` 액션이 INSERT/UPDATE/DELETE 모두 멱등하게 흡수 (자기 echo 무시)
- [X] T056 [P] [US3] `tests/integration/tasks-sync.test.tsx` — 두 `createBrowserClient` 인스턴스 모킹 + 채널 이벤트 발생 → 다른 인스턴스의 reducer가 변경 반영 (2초 이내, fake timer)
- [X] T057 [P] [US3] `tests/integration/conflict-lww.test.tsx` — 같은 task에 두 동시 update → 양쪽 채널이 더 늦은 값으로 수렴

### Implementation for User Story 3

- [X] T058 [P] [US3] `src/lib/supabase-store/realtime.ts` — `subscribeToUserChanges(userId, onChange)` ([contracts/realtime.md](./contracts/realtime.md) §1·2)
- [X] T059 [US3] `src/lib/store/reducer.ts`에 `remote/applyChange` 액션 추가 — `event`·`table`·`new`·`old`를 받아 멱등하게 적용. 같은 상태면 동일 reference 반환(불필요한 re-render 방지)
- [X] T060 [US3] `src/context/TasksProvider.tsx` 갱신 — `useEffect`에서 `subscribeToUserChanges(user.id, dispatchRemote)`, cleanup으로 unsubscribe. 의존성에 `user.id` (사용자 전환 시 재구독)
- [X] T061 [US3] `src/context/ThemeProvider.tsx` 갱신 — `user_preferences` 변경 push 시 `theme`·`view`·`sort` 동기

**Checkpoint**: 두 탭으로 시연 가능. 한쪽 추가/수정/삭제가 < 2초에 다른쪽 반영. 동시 충돌은 LWW로 수렴.

---

## Phase 6: User Story 4 — Google 소셜 로그인 (P4)

**Goal**: 로그인 화면의 "Google로 계속하기" 버튼으로 한 클릭 가입·로그인. 이메일/비밀번호 로그인 그대로 공존.

**Independent Test**: [spec.md §US4](./spec.md#user-story-4--google-소셜-로그인-priority-p4)의 4개 acceptance 시나리오.

### Pre-Step: Provider 설정 (수동)

- [ ] T062 [US4] Google Cloud Console에서 OAuth client ID 발급 후 Supabase Dashboard → Authentication → Providers → Google 활성화 + Redirect URLs에 `http://localhost:3000/auth/callback`과 production·preview URL 등록 — [quickstart.md §2](./quickstart.md#2-google-oauth-셋업-p4-단계에-필요) 절차 그대로

### Tests for User Story 4 (write FIRST, ensure FAIL) ⚠️

- [X] T063 [P] [US4] `tests/components/GoogleButton.test.tsx` — 클릭 → `signInWithGoogle` 호출. `aria-label="Google로 계속하기"`, 키보드 포커스 가능
- [X] T064 [P] [US4] `tests/components/LoginScreen.test.tsx` 추가 — Google 버튼이 이메일 폼과 함께 노출, "또는" 구분선 시맨틱
- [X] T065 [P] [US4] `tests/integration/oauth-callback.test.tsx` — `/auth/callback?code=...` 핸들러 호출 → `exchangeCodeForSession` 모킹 성공 시 `/main` 리다이렉트, 실패 시 `/?error=...`
- [X] T066 [P] [US4] `tests/components/AuthProvider.test.tsx` 추가 — `signInWithGoogle` 호출이 `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: '/auth/callback' } })`로 위임

### Implementation for User Story 4

- [X] T067 [P] [US4] `src/components/login/GoogleButton.tsx` 작성 — 디자인 토큰 사용, `aria-label`, `useAuth().signInWithGoogle` 호출
- [X] T068 [US4] `src/context/AuthProvider.tsx` 갱신 — T026의 stub을 실제 구현으로 교체 (`signInWithOAuth` 호출)
- [X] T069 [US4] `src/app/auth/callback/route.ts` 작성 — [contracts/routes.md §3](./contracts/routes.md#3-oauth-콜백--srcappauthcallbackroutets) 코드 그대로. 실패 시 한국어 에러 query로 리다이렉트
- [X] T070 [US4] `src/components/login/LoginScreen.tsx` 갱신 — T030의 placeholder를 실제 `<GoogleButton />`으로 교체, "또는" 구분선 추가
- [X] T071 [US4] `src/app/page.tsx`에서 `?error=...` query 읽어 `<AuthError>`로 표시 — OAuth 콜백 실패 흐름의 사용자 피드백

**Checkpoint**: 4개 user story 모두 독립 동작. Google 로그인·이메일 로그인 공존, 둘 다 같은 데이터로 들어감 (단 v1에서 두 경로는 별개 계정으로 취급 — Assumptions).

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: 회귀 방지·문서·배포 검증.

- [X] T072 `npm test` 전체 통과 — 기존 122개 + 신규(약 25개 test 파일) 모두 GREEN
- [X] T073 `npm run typecheck` 통과 — 전체 strict TypeScript 검증
- [X] T074 `npm run build` 통과 — Vercel 빌드 호환 확인 (next build)
- [X] T075 [quickstart.md §3.1~3.3](./quickstart.md#3-로컬-개발) 시나리오를 로컬에서 직접 수행 — 가입·시드·격리·멀티탭 동작 시각 확인
- [ ] T076 [contracts/db-schema.md §6](./contracts/db-schema.md#6-검증-절차-constitution-governance-의무) 보안 체크리스트 7항목 모두 확인 (다른 사용자 데이터 접근 거부, RLS WITH CHECK 위반 거부, subtask user_id 트리거 강제 등)
- [X] T077 [P] `README.md` 갱신 — "백엔드 없음" 문구를 "Supabase Auth + Postgres + Realtime 사용. localStorage는 오프라인 캐시로만 보조" 식으로 수정. 환경변수 셋업 안내 추가 (Constitution v1.1.0의 follow-up TODO 해결)
- [X] T078 [P] `.specify/memory/constitution.md`의 follow-up TODO 영역 정리 — `specs/001-todo-app/plan.md` 관련 줄과 README.md 줄을 모두 ✅로 마킹
- [ ] T079 Vercel 첫 배포 — Vercel Dashboard에서 저장소 연결, `NEXT_PUBLIC_*` env vars 등록(Production·Preview·Development), 배포 트리거 — [quickstart.md §5.1](./quickstart.md#51-첫-배포)
- [ ] T080 Vercel production URL을 Supabase Auth Redirect URLs에 등록 (T062의 Google OAuth client에도 동시 등록) — [quickstart.md §5.2](./quickstart.md#52-도메인--supabase에-등록)
- [ ] T081 Production URL에서 T075 시나리오 재수행 — 실제 배포본에서 가입·시드·격리·멀티탭·Google 로그인 모두 동작 확인

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: 의존 없음 — 즉시 시작
- **Phase 2 (Foundational)**: Phase 1 완료 후. T005~T010(DB)은 직렬, T011~T013(mappers)은 T005 후 시작 가능, T014~T018(dates) 병렬 가능
- **Phase 3 (US1)**: Phase 2 완료 후. **MVP의 종점.** 단독 시연 가능.
- **Phase 4 (US2)**: Phase 2 + Phase 3 완료 후. 일부 task(T045~T049 어댑터 구현)는 Phase 3 진행 중에도 가능하지만, T050~T053(컴포넌트 연결)은 US1의 `/main` 셸이 있어야 의미가 있음
- **Phase 5 (US3)**: Phase 4 완료 후 (실시간 push가 동기할 데이터·어댑터가 필요)
- **Phase 6 (US4)**: Phase 3 완료 후. US2/US3와 독립 가능 — Google 로그인 자체는 데이터 흐름 변경 없음
- **Phase 7 (Polish)**: 원하는 모든 US 완료 후

### User Story Dependencies

- **US1**: Foundational만 의존. 단독 MVP.
- **US2**: Foundational + US1(인증 컨텍스트 필요)
- **US3**: US2(데이터가 있어야 동기화할 게 있음)
- **US4**: US1(AuthProvider 위에서 메서드 하나 추가). US2/US3와 무관

### Within Each User Story

- **테스트(RED) → 구현(GREEN) → 리팩토링** 순서 엄수 — Constitution 원칙 I
- 모델/타입 → 어댑터 → 컨텍스트/컴포넌트 → 라우트 통합
- 각 phase의 checkpoint에서 단독 실행·검증 후 다음 phase 시작

### Parallel Opportunities (요약)

- Setup의 T002·T003·T004 동시 가능
- Foundational의 T011·T014 동시 가능 (T005~T010 종료 후 T012·T013은 mappers)
- US1의 테스트 7개(T019~T025) 동시 작성 가능
- US1 구현 중 T026·T028·T029·T031 동시 가능
- US2의 어댑터 5개(T045~T049) 동시 가능
- US2 vs US4는 거의 완전 독립 — 팀이 있다면 병렬

---

## Parallel Example: User Story 1 Tests

```text
# US1 phase 진입 직후, 모든 RED 테스트를 동시에 작성
T019 [US1] tests/components/AuthProvider.test.tsx
T020 [US1] tests/components/EmailPasswordForm.test.tsx
T021 [US1] tests/components/LoginScreen.test.tsx 갱신
T022 [US1] tests/components/LogoutButton.test.tsx
T023 [US1] tests/components/SideNav.test.tsx 갱신
T024 [US1] tests/integration/auth-flow.test.tsx
T025 [US1] tests/integration/route-guard.test.tsx
```

7개를 동시에 작성 후 일괄 실행해 모두 RED 확인 → 구현 시작.

## Parallel Example: US2 Adapters

```text
# Foundational + US1 종료 직후 어댑터 작성을 동시 진행
T045 [US2] src/lib/supabase-store/seed.ts
T046 [US2] src/lib/supabase-store/tasks-repo.server.ts
T047 [US2] src/lib/supabase-store/tasks-mutations.ts
T048 [US2] src/lib/supabase-store/subtasks.ts
T049 [US2] src/lib/supabase-store/preferences.ts
```

5개의 어댑터 파일은 서로 의존하지 않으므로 동시 작성 가능. 각자 사전 RED 테스트(T036~T040)와 짝.

---

## Implementation Strategy

### MVP First (Phase 1 → 2 → 3)

1. Setup (T001~T004) — 단일 세션이면 1시간 이내
2. Foundational (T005~T018) — DB 적용 + 타입·매퍼·dates 마이그레이션
3. US1 (T019~T035) — 인증 풀 사이클 구현
4. **STOP and VALIDATE**: 가입/로그인/로그아웃/라우트 가드 단독 시연. MVP 완성.
5. Vercel에 첫 배포해 봐도 됨 (이 시점에서 학습 가치는 충분).

### Incremental Delivery

1. **MVP 출시**: US1까지 — 인증 풀 사이클
2. **+ 클라우드 데이터**: US2 추가 → 사용자별 데이터 + 시드 + 격리
3. **+ 실시간**: US3 추가 → 멀티 디바이스 시연
4. **+ 소셜**: US4 추가 → Google 로그인 옵션
5. **Polish**: Phase 7 → 배포·문서·보안 체크

각 단계마다 시각·인터랙션 회귀 없음을 `npm test`로 확인.

### Solo Strategy (현 프로젝트)

순차 진행 권장:
1. Phase 1·2를 하루 만에 끝낸다
2. US1 (3~5 commits) → 체크포인트 시연
3. US2 (5~8 commits) → 체크포인트 시연
4. US3 (3~5 commits) → 두 탭 시연
5. US4 (3~5 commits) → Google 시연
6. Polish + Vercel

---

## Notes

- **[P] task**는 다른 파일이고 미완 의존이 없음을 의미. 같은 파일을 동시에 만지면 충돌.
- **[Story] 레이블**은 trace용 — 각 phase의 task만 붙음. Setup·Foundational·Polish엔 없음.
- **테스트 우선** — `vi.mock`·`vi.setSystemTime`·fake timer 적극 활용. Supabase 클라이언트는 boundary(`@/utils/supabase/client`)에서 모킹.
- **commit 단위** — 각 task 끝에서 1 commit 권장 (또는 RED+GREEN을 한 commit으로). PR 단위는 phase 단위.
- **체크포인트 검증** — 다음 phase 시작 전에 npm test + 시각 시연 둘 다 확인. 어느 하나라도 빨간 상태면 진도 X.
- **Constitution 위반 의심 시** 즉시 [.specify/memory/constitution.md](./../../.specify/memory/constitution.md)와 [contracts/db-schema.md §6](./contracts/db-schema.md#6-검증-절차-constitution-governance-의무) 확인.
