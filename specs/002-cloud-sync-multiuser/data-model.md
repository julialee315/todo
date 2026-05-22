# Phase 1 Data Model: 다중 사용자 클라우드 동기화 Todo

**Date**: 2026-05-22 | **Plan**: [plan.md](./plan.md) | **Spec**: [spec.md](./spec.md)

데이터는 두 층에 존재한다:

1. **클라우드(단일 진실원)** — Supabase Postgres, `public` 스키마의 세 테이블. RLS가 사용자별 격리를 강제한다.
2. **클라이언트 메모리** — `useReducer` 상태로 hydrate된 도메인 객체. 기존 spec 001의 타입을 그대로 따른다. DB row와의 매핑은 `src/lib/supabase-store/mappers.ts`가 담당.

---

## Entity: User Account (사용자 계정)

Supabase `auth.users`가 표준 스키마로 관리한다. 앱은 이 테이블을 직접 만들지 않으며, FK 참조와 RLS 평가에서만 사용한다.

| Field | Type | 비고 |
|-------|------|------|
| `id` | `uuid` | PK. RLS 정책의 `auth.uid()` 반환값과 동일. |
| `email` | `text` | 표시·검색용. NOT NULL 보장. |
| `raw_app_meta_data` | `jsonb` | 인가 결정에 쓰면 안전(서버만 쓸 수 있음). 이 앱은 인가에 사용 안 함 — 모든 인가는 `user_id` 컬럼 ownership 체크로 처리. |
| `raw_user_meta_data` | `jsonb` | **인가 결정에 사용 금지**(Constitution Governance). 표시명 등 비-인가 용도로만 읽음. |

**관계**: `tasks.user_id` → `auth.users.id` (다대일). `user_preferences.user_id` → `auth.users.id` (일대일).

---

## Entity: Task (할 일)

`public.tasks`. 모든 할 일은 정확히 한 사용자에게 귀속된다.

| Field | Type | 제약 / 규칙 |
|-------|------|-------------|
| `id` | `uuid` | PK. 기본값 `gen_random_uuid()`. |
| `user_id` | `uuid` | NOT NULL. `auth.users(id)` FK with `ON DELETE CASCADE`. RLS predicate 컬럼. |
| `title` | `text` | NOT NULL, `CHECK (length(trim(title)) > 0)`. 공백만 거부(spec FR-011 정신 유지). |
| `due` | `date` | NULL 허용 — `NULL`이면 날짜 기반 뷰(예정/지연/오늘)에서 제외. 클라이언트 도메인의 `''`와 매핑됨. |
| `priority` | `text` | `CHECK (priority IN ('high','med','low','none'))`. 기본값 `'none'`. |
| `category` | `text` | `CHECK (category IN ('design','dev','meeting','plan','personal'))`. 기본값 `'dev'`. |
| `starred` | `boolean` | NOT NULL, 기본값 `false`. |
| `done` | `boolean` | NOT NULL, 기본값 `false`. |
| `notes` | `text` | NOT NULL, 기본값 `''`. |
| `created_at` | `timestamptz` | NOT NULL, 기본값 `now()`. 정렬·통계용. |
| `updated_at` | `timestamptz` | NOT NULL, 기본값 `now()`. 트리거로 모든 UPDATE 시 갱신. 실시간 충돌 분석용. |

**Indexes**:
- `(user_id, due)` — "예정/오늘/지난" 뷰의 핵심 필터.
- `(user_id, done) WHERE done = false` — 부분 인덱스로 진행 중 할 일 빠르게 조회.
- `(user_id, created_at DESC)` — 메인 목록의 기본 정렬.

**Relationships**:
- `category` → 어플리케이션 정의의 Category (DB enum 대신 CHECK; 5개 카테고리가 변하지 않으므로).
- `priority` → 어플리케이션 정의의 Priority.
- 1:N → Subtask (`subtasks.task_id`).

**Lifecycle / State transitions** (spec US2 #3, 001 spec과 동일):
- INSERT — 사용자가 추가 입력에 제목을 쓰고 Enter. `id`·`created_at`·`updated_at`은 DB가 채움.
- UPDATE (필드별) — title/notes/priority/category/due/done/starred 단일/복수 변경.
- DELETE — CASCADE로 자식 subtasks 동반 삭제.
- 모든 변경은 Realtime publication을 통해 같은 user_id의 다른 세션에 push.

---

## Entity: Subtask (서브태스크)

`public.subtasks`. 한 Task에 속하는 체크리스트 항목.

| Field | Type | 제약 / 규칙 |
|-------|------|-------------|
| `id` | `uuid` | PK. 기본값 `gen_random_uuid()`. |
| `task_id` | `uuid` | NOT NULL. `tasks(id)` FK with `ON DELETE CASCADE`. |
| `user_id` | `uuid` | NOT NULL. **부모 task의 user_id와 동일**해야 함 — 트리거로 강제(R2 비정규화 이유). RLS predicate 컬럼. |
| `text` | `text` | NOT NULL, `CHECK (length(trim(text)) > 0)`. |
| `done` | `boolean` | NOT NULL, 기본값 `false`. |
| `sort_order` | `integer` | NOT NULL, 기본값 `0`. 같은 task 안에서의 표시 순서. |
| `created_at` | `timestamptz` | NOT NULL, 기본값 `now()`. |
| `updated_at` | `timestamptz` | NOT NULL, 기본값 `now()`. 트리거로 갱신. |

**Indexes**:
- `(task_id, sort_order)` — 같은 task의 서브태스크 정렬.
- `(user_id)` — RLS·Realtime 필터.

**Trigger**: `BEFORE INSERT OR UPDATE` 트리거가 `NEW.user_id := (SELECT user_id FROM tasks WHERE id = NEW.task_id)`로 강제. 클라이언트가 임의 `user_id`를 INSERT 못 함.

**Lifecycle**:
- INSERT — DetailPanel에서 "+ 추가" 시.
- UPDATE — `done` 토글, `text` 편집, `sort_order` 변경.
- DELETE — 명시적 삭제 또는 부모 task CASCADE.

---

## Entity: UserPreference (사용자 선호도)

`public.user_preferences`. 한 사용자당 정확히 하나.

| Field | Type | 제약 / 규칙 |
|-------|------|-------------|
| `user_id` | `uuid` | PK. `auth.users(id)` FK with `ON DELETE CASCADE`. |
| `view` | `text` | `CHECK (view IN ('inbox','today','upcoming','overdue','done'))`. 기본값 `'inbox'`. |
| `sort` | `text` | `CHECK (sort IN ('created_desc','due_asc','priority','title'))`. 기본값 `'created_desc'`. |
| `theme` | `text` | `CHECK (theme IN ('light','dark'))`. 기본값 `'light'`. |
| `seeded_at` | `timestamptz` | NULL 허용. NULL이면 아직 첫 로그인 시드를 채우지 않은 상태. seed 어댑터가 `now()`로 set. |
| `updated_at` | `timestamptz` | NOT NULL, 기본값 `now()`. 트리거로 갱신. |

**Relationships**: 1:1 with User Account.

**Lifecycle**:
- INSERT — 사용자가 로그인하고 어떤 선호도를 처음 저장하거나, 시드 단계에서 자동으로 행 생성.
- UPDATE — 뷰 전환·정렬 변경·테마 토글마다 단일 row upsert.

---

## 매핑: DB row ↔ 도메인 타입

`src/lib/supabase-store/mappers.ts`가 양방향 변환을 담당한다. 데이터 어댑터 외부(컴포넌트, reducer)는 도메인 타입만 본다.

| 도메인 타입 (`src/lib/types.ts`) | DB row (`public.tasks` 등) | 매핑 규칙 |
|----------------------------------|----------------------------|----------|
| `Task.id: string` | `id: uuid` | 그대로. |
| `Task.due: string` (`'YYYY-MM-DD'` 또는 `''`) | `due: date \| null` | `''` ↔ `null`. 그 외엔 `toISOString().slice(0,10)`. |
| `Task.priority: PriorityId` | `priority: text` | 동일 값. |
| `Task.category: CategoryId` | `category: text` | 동일 값. |
| `Task.starred/done/notes` | 동일 컬럼 | 그대로. |
| `Task.subs: Subtask[]` | `subtasks` 테이블의 자식 row들 | 별도 fetch + 메모리 결합. `sort_order` 오름차순. |
| `Subtask.text` | `subtasks.text` | 그대로. |
| `Subtask.id/done` | 동일 | 그대로. |
| `Theme` | `user_preferences.theme` | 그대로. |
| `ViewId` | `user_preferences.view` | 그대로. |

**서버 fetch 패턴**: 메인 화면 RSC 진입 시 `tasks` + `subtasks`를 두 쿼리로 가져와 메모리에서 join(`Task.subs`). N+1 회피 위해 `subtasks`는 `IN (task_ids)` 한 번에 가져옴.

---

## RLS 정책 요약 (계약은 [contracts/db-schema.md](./contracts/db-schema.md))

세 테이블 모두 동일 패턴:
- `ENABLE ROW LEVEL SECURITY`
- `SELECT` / `INSERT` / `UPDATE` / `DELETE` 각각 4개 정책, 모두 `TO authenticated`
- `USING` 절: `(select auth.uid()) = user_id`
- `INSERT WITH CHECK`·`UPDATE WITH CHECK`도 동일

→ 클라이언트가 어떤 SQL을 보내든 자신의 `user_id` 행만 조작 가능. 다른 사용자의 ID를 짐작해 호출해도 0행 반환.

---

## 무결성 보장

- `subtasks.user_id`는 트리거가 부모 `tasks.user_id`로 강제 → "내 task에 다른 사용자가 subtask 끼워넣기" 불가능(RLS만으로는 INSERT 시 `user_id`를 자기 것으로 두면 통과해 버려 보안 갭이 됨 — 트리거가 이를 막음).
- FK CASCADE → task 삭제 시 subtask 동반 삭제, user 삭제 시 모든 데이터 동반 삭제(GDPR 친화).
- CHECK 제약 → priority/category/view/sort/theme의 허용 값 일탈을 DB 레벨에서 거부.
- `updated_at` 트리거 → 클라이언트가 임의로 과거 값으로 set 불가능(트리거가 `now()`로 덮어씀).

---

## 시드 데이터

`SAMPLE_TASKS` 14건(spec 001과 동일 corpus)을 첫 로그인 시 INSERT. 자세한 흐름은 [research.md R4](./research.md#r4-시드-데이터--첫-로그인-시-서버-사이드-멱등-보장)와 [contracts/db-schema.md](./contracts/db-schema.md#시드-수입-패턴) 참고.
