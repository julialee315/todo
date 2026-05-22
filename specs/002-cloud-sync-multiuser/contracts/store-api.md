# Contract: Store & Adapter Public API

**Date**: 2026-05-22 | **Plan**: [../plan.md](../plan.md)

컴포넌트가 데이터에 접근하는 단일 통로. 어댑터 계층(`src/lib/supabase-store/`)은 이 계약을 만족해야 하며, 컴포넌트는 이 API 바깥의 supabase-js 호출을 직접 하지 않는다(Constitution 원칙 IV).

기존 spec 001의 store API(`reducer`/`selectors`/`dates`)는 **불변**이다. 변경되는 것은 (a) `dates.ts`의 `TODAY` 상수 → `today()` 함수, (b) `persistence.ts` 폐기, (c) 새 어댑터 계약 추가.

---

## 1. Auth API (`src/context/AuthProvider.tsx`)

```ts
export interface AuthUser {
  id: string;        // auth.users.id (uuid)
  email: string;
  provider: 'email' | 'google';
}

export interface AuthState {
  user: AuthUser | null;     // null = 비인증
  loading: boolean;          // 초기 세션 확인 중 true
}

export interface AuthActions {
  signInWithPassword(email: string, password: string): Promise<{ error: string | null }>;
  signUpWithPassword(email: string, password: string): Promise<{ error: string | null }>;
  signInWithGoogle(): Promise<{ error: string | null }>;  // 리다이렉트로 끝남
  signOut(): Promise<void>;
}

export function useAuth(): AuthState & AuthActions;
```

**계약**:
- `loading` 동안 보호 라우트의 셸은 사용자에게 보이지 않음.
- `signInWithPassword`/`signUpWithPassword` 실패 시 `error`에 사용자 표시용 한국어 메시지.
- `signOut`은 모든 캐시 정리(`localStorage` 시드 캐시 포함) 후 로그인 화면으로 리다이렉트.
- 동작 단위 테스트: 가입·로그인·로그아웃 각각 실패/성공 경로, 토큰 갱신 실패 경로.

## 2. Tasks Repository (서버) — `src/lib/supabase-store/tasks-repo.server.ts`

RSC 또는 route handler에서만 호출. `createServerClient(await cookies())`를 내부에서 만든다.

```ts
export async function listTasksForUser(userId: string): Promise<Task[]>;
// 단일 fetch: tasks + 그 안의 모든 subtasks를 (task_id IN (...)) 한 번에 가져와 메모리에서 join.
// 정렬은 created_at DESC. subtasks는 sort_order ASC.

export async function getTaskById(userId: string, taskId: string): Promise<Task | null>;
// RLS가 다른 사용자 task를 자동 거름. 본인 것 외엔 null.

export async function loadPreferences(userId: string): Promise<UserPreference>;
// 행이 없으면 기본값 객체 반환(아직 시드 전일 수 있음).
```

**계약**:
- `listTasksForUser` 호출 시 자동으로 시드 보장 호출 후 fetch — `ensureSeed`가 idempotent.
- 모든 함수는 에러를 throw — 상위(RSC)가 처리.
- 호출자는 `userId`를 직접 받지만 RLS가 동일성 강제 — `userId !== auth.uid()`이면 0행.

## 3. Tasks Mutations (클라이언트) — `src/lib/supabase-store/tasks-mutations.ts`

브라우저에서만 호출. `createBrowserClient()`를 내부에서 만든다.

```ts
export async function addTask(input: { title: string; category?: CategoryId; priority?: PriorityId; due?: string }): Promise<Task>;
// title 공백만 → throw. category 미지정 시 active 필터 또는 'dev'.
// 반환: INSERT된 row를 도메인 타입으로 매핑.

export async function updateTask(taskId: string, patch: Partial<Pick<Task, 'title' | 'notes' | 'priority' | 'category' | 'due' | 'starred' | 'done'>>): Promise<void>;
// 빈 patch는 no-op (no DB call). due === '' → null로 매핑.

export async function deleteTask(taskId: string): Promise<void>;
// CASCADE로 자식 subtasks 동반 삭제 — 클라이언트는 추가 작업 없음.

export async function toggleTaskDone(taskId: string, done: boolean): Promise<void>;
// updateTask의 편의 래퍼.

export async function toggleTaskStarred(taskId: string, starred: boolean): Promise<void>;
```

**계약**:
- 모든 mutation은 RLS에 의해 본인 row만 영향. 다른 사용자 row를 patch해도 0행 영향(에러 X) — 어댑터는 영향받은 행 수를 확인하고 0이면 throw.
- 호출자는 `dispatch`를 하지 않음 — Realtime push가 reducer에 변경을 흘려보낸다(echo는 멱등 reducer가 흡수).

## 4. Subtasks API — `src/lib/supabase-store/subtasks.ts`

```ts
export async function addSubtask(taskId: string, text: string): Promise<Subtask>;
// text 공백만 → throw. sort_order는 현재 max+1.

export async function updateSubtask(subtaskId: string, patch: Partial<Pick<Subtask, 'text' | 'done'>>): Promise<void>;

export async function deleteSubtask(subtaskId: string): Promise<void>;

export async function reorderSubtasks(taskId: string, orderedIds: string[]): Promise<void>;
// orderedIds에 따라 sort_order를 일괄 업데이트(트랜잭션 한 번).
```

## 5. Preferences API — `src/lib/supabase-store/preferences.ts`

```ts
export interface UserPreference {
  view: ViewId;
  sort: SortId;
  theme: Theme;
}

export async function savePreference(patch: Partial<UserPreference>): Promise<void>;
// upsert. user_id는 클라이언트가 명시하지 않음 — RLS WITH CHECK이 auth.uid()로 강제.
```

## 6. Seed API — `src/lib/supabase-store/seed.ts`

```ts
export async function ensureSeed(userId: string): Promise<void>;
// 멱등. user_preferences.seeded_at IS NULL일 때만 14개 시드 INSERT + seeded_at = now().
// 동시 호출 시 PK 충돌로 한쪽이 fail → catch하고 무시(이미 시드됨).
```

**계약**: 서버에서만 호출. 첫 `/main` 진입의 RSC가 호출. 이후 호출은 no-op.

## 7. Realtime Subscription — `src/lib/supabase-store/realtime.ts`

```ts
export interface RealtimeChange {
  table: 'tasks' | 'subtasks' | 'user_preferences';
  event: 'INSERT' | 'UPDATE' | 'DELETE';
  new?: any;     // payload.new (postgres_changes)
  old?: any;     // payload.old
}

export function subscribeToUserChanges(
  userId: string,
  onChange: (change: RealtimeChange) => void,
): () => void;
// 반환: unsubscribe 함수. 컴포넌트 unmount 시 호출.
```

**계약**:
- 채널은 단일 — `tasks-by-user-${userId}`. WebSocket 1개.
- 필터: `user_id=eq.${userId}` 세 테이블 모두.
- `onChange`는 reducer로 dispatch되는 단순 전달 콜백.
- 자세한 라이프사이클은 [realtime.md](./realtime.md).

## 8. Mappers — `src/lib/supabase-store/mappers.ts`

```ts
export function dbTaskToDomain(row: DbTaskRow, subs: DbSubtaskRow[]): Task;
export function domainTaskToDbInsert(t: Partial<Task>, userId: string): DbTaskInsert;

export function dbSubtaskToDomain(row: DbSubtaskRow): Subtask;
export function domainSubtaskToDbInsert(s: Partial<Subtask>, taskId: string): DbSubtaskInsert;

export function dbPreferenceToDomain(row: DbPreferenceRow): UserPreference;
```

**계약**: 양방향 변환의 순수 함수. 단위 테스트로 6경로(`tasks`/`subtasks`/`preferences` × in/out)를 격리 검증.

## 9. Dates (변경) — `src/lib/store/dates.ts`

**Before** (spec 001):
```ts
export const TODAY = new Date(2026, 4, 15);
export const TODAY_KEY = '2026-05-15';
```

**After**:
```ts
export function today(): Date { return new Date(); }
export function todayKey(): string { return fmtKey(today()); }
```

호출부 변경:
- `relDay`, `isOverdue`, `isToday`, `isUpcoming`, `viewCount` 등 모든 곳에서 `TODAY` → `today()`, `TODAY_KEY` → `todayKey()`.
- 테스트는 `tests/setup.ts`에서 `vi.setSystemTime(new Date('2026-05-15T09:00:00+09:00'))`를 전역 설치 — 기존 테스트는 그대로 통과.

## 10. Persistence (제거) — `src/lib/store/persistence.ts`

**제거**. 어댑터(R2~R5)가 역할을 인수. `tests/unit/persistence.test.ts`도 제거. localStorage는 `tasks-repo.server.ts`가 마지막 동기 스냅샷을 저장하는 보조 캐시로만 사용 — 그 코드는 어댑터에 위치.

---

## 호출 그래프 요약

```
RSC (/main/page.tsx)
  └─ tasks-repo.server.listTasksForUser(userId)
       └─ ensureSeed(userId) — idempotent
       └─ supabase.from('tasks').select(...) + .from('subtasks').select(...)

Client (TasksProvider mount)
  ├─ subscribeToUserChanges(userId, dispatch)
  └─ on user action:
       ├─ addTask/updateTask/deleteTask  ─┐
       ├─ addSubtask/updateSubtask/...    ├─ supabase mutations (RLS-enforced)
       └─ savePreference                  ┘
       └─ Realtime push → onChange → dispatch (echo는 멱등 reducer 흡수)
```

## 보안 의무 (Constitution Governance 매핑)

- "no `service_role` in client-exposed code" — 어댑터 어디에도 `service_role` 키 임포트·참조 없음. `src/utils/supabase/*` 헬퍼는 publishable key만 사용.
- "RLS enabled on every exposed-schema table" — `tasks`/`subtasks`/`user_preferences` 모두 [db-schema.md](./db-schema.md) §3에서 활성화.
- "ownership predicate in every `TO authenticated` policy" — 같은 §3에서 모든 정책에 `auth.uid() = user_id`.
- "no `user_metadata` in authorization" — 어댑터에서 `user.user_metadata`를 읽지 않음. 표시명이 필요해도 `auth.users.email` 또는 `user_preferences`에서.
- "`security_invoker` views" — view 미사용. 도입 시 의무화.
- "`SECURITY DEFINER` functions kept out of `public`" — `touch_updated_at` / `subtasks_enforce_user_id` 모두 `SECURITY INVOKER` 명시.
