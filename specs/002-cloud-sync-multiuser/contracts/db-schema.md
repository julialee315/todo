# Contract: Postgres Schema, RLS, Realtime Publication

**Date**: 2026-05-22 | **Plan**: [../plan.md](../plan.md)

이 파일은 Supabase Postgres에 적용될 **데이터 계약**이다. 구현 시 `supabase migration new <name>`으로 마이그레이션 파일을 생성하고 아래 SQL을 그대로 옮긴다. **하나라도 빠지면 Constitution v1.1.0 Governance "Supabase 컴플라이언스" 위반**이다.

순서: (1) 테이블 → (2) 트리거 → (3) RLS → (4) Realtime publication.

---

## 1. 테이블

```sql
-- 1.1 tasks
CREATE TABLE public.tasks (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       text        NOT NULL CHECK (length(trim(title)) > 0),
  due         date,
  priority    text        NOT NULL DEFAULT 'none'
                          CHECK (priority IN ('high','med','low','none')),
  category    text        NOT NULL DEFAULT 'dev'
                          CHECK (category IN ('design','dev','meeting','plan','personal')),
  starred     boolean     NOT NULL DEFAULT false,
  done        boolean     NOT NULL DEFAULT false,
  notes       text        NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX tasks_user_due_idx           ON public.tasks (user_id, due);
CREATE INDEX tasks_user_created_idx       ON public.tasks (user_id, created_at DESC);
CREATE INDEX tasks_user_open_idx          ON public.tasks (user_id) WHERE done = false;

-- 1.2 subtasks
CREATE TABLE public.subtasks (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     uuid        NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL,  -- 트리거로 부모와 동일하게 강제
  text        text        NOT NULL CHECK (length(trim(text)) > 0),
  done        boolean     NOT NULL DEFAULT false,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX subtasks_task_sort_idx       ON public.subtasks (task_id, sort_order);
CREATE INDEX subtasks_user_idx            ON public.subtasks (user_id);

-- 1.3 user_preferences
CREATE TABLE public.user_preferences (
  user_id     uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  view        text        NOT NULL DEFAULT 'inbox'
                          CHECK (view IN ('inbox','today','upcoming','overdue','done')),
  sort        text        NOT NULL DEFAULT 'created_desc'
                          CHECK (sort IN ('created_desc','due_asc','priority','title')),
  theme       text        NOT NULL DEFAULT 'light'
                          CHECK (theme IN ('light','dark')),
  seeded_at   timestamptz,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
```

## 2. 트리거 — `updated_at` 자동 갱신 + `subtasks.user_id` 무결성

```sql
-- 2.1 공통 updated_at 갱신
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER  -- Constitution Governance: SECURITY DEFINER 미사용
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER tasks_touch_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER subtasks_touch_updated_at
  BEFORE UPDATE ON public.subtasks
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER preferences_touch_updated_at
  BEFORE UPDATE ON public.user_preferences
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2.2 subtasks.user_id 강제 (부모 task의 user_id로 덮어쓰기)
CREATE OR REPLACE FUNCTION public.subtasks_enforce_user_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  SELECT user_id INTO NEW.user_id FROM public.tasks WHERE id = NEW.task_id;
  IF NEW.user_id IS NULL THEN
    RAISE EXCEPTION 'subtasks.task_id does not reference a task owned by any user';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER subtasks_enforce_user_id_trg
  BEFORE INSERT OR UPDATE OF task_id ON public.subtasks
  FOR EACH ROW EXECUTE FUNCTION public.subtasks_enforce_user_id();
```

**`SECURITY INVOKER` 명시**: Constitution v1.1.0 Governance — `SECURITY DEFINER` 함수는 `public` 스키마에 없어야 한다. 위 두 함수는 권한 상승이 필요 없으므로 INVOKER로 충분.

## 3. RLS 활성화 + 정책

```sql
-- 3.1 활성화
ALTER TABLE public.tasks             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subtasks          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences  ENABLE ROW LEVEL SECURITY;

-- 3.2 tasks 정책 (CRUD 4개)
CREATE POLICY "tasks: own select" ON public.tasks
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY "tasks: own insert" ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "tasks: own update" ON public.tasks
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "tasks: own delete" ON public.tasks
  FOR DELETE TO authenticated
  USING ((select auth.uid()) = user_id);

-- 3.3 subtasks 정책 (CRUD 4개) — 동일 패턴
CREATE POLICY "subtasks: own select" ON public.subtasks
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY "subtasks: own insert" ON public.subtasks
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "subtasks: own update" ON public.subtasks
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "subtasks: own delete" ON public.subtasks
  FOR DELETE TO authenticated
  USING ((select auth.uid()) = user_id);

-- 3.4 user_preferences 정책 (CRUD 4개) — user_id가 PK이자 ownership 컬럼
CREATE POLICY "prefs: own select" ON public.user_preferences
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY "prefs: own insert" ON public.user_preferences
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "prefs: own update" ON public.user_preferences
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "prefs: own delete" ON public.user_preferences
  FOR DELETE TO authenticated
  USING ((select auth.uid()) = user_id);
```

**검증 의무**:
- 모든 정책이 `TO authenticated`. `anon` 정책 없음 → 비인증 요청은 0행.
- 모든 INSERT/UPDATE에 `WITH CHECK`. 사용자가 `user_id`를 다른 사용자로 바꿔 row 탈취 불가능.
- `auth.role()` 사용 없음 (deprecated). `TO` 절로만 인증 확인.
- `user_metadata` 사용 없음 (Constitution Governance).

## 4. Realtime Publication

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE
  public.tasks,
  public.subtasks,
  public.user_preferences;
```

세 테이블 모두 `postgres_changes` 이벤트가 흘러나오게 한다. 클라이언트 채널 필터(`user_id=eq.${userId}`)와 RLS가 이중으로 다른 사용자의 변경 노출을 막는다.

## 5. 시드 수입 패턴

첫 로그인 시 server component에서 호출되는 함수(`src/lib/supabase-store/seed.ts`)가 다음 SQL을 트랜잭션으로 실행한다 (의사 코드):

```ts
async function ensureSeed(supabase, userId) {
  // 1. 멱등 체크
  const { data: pref } = await supabase
    .from('user_preferences')
    .select('seeded_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (pref?.seeded_at) return; // 이미 시드됨

  // 2. tasks 일괄 INSERT (SAMPLE_TASKS 14건)
  const taskRows = SAMPLE_TASKS.map((t) => ({
    user_id: userId,
    title: t.title,
    due: t.due || null,
    priority: t.priority,
    category: t.category,
    starred: t.starred,
    done: t.done,
    notes: t.notes,
  }));
  const { data: inserted, error: e1 } = await supabase
    .from('tasks')
    .insert(taskRows)
    .select('id, title');
  if (e1) throw e1;

  // 3. subtasks 일괄 INSERT (시드의 subs 펼치기)
  const subRows = SAMPLE_TASKS.flatMap((t, idx) =>
    (t.subs || []).map((s, j) => ({
      task_id: inserted[idx].id,
      // user_id는 트리거가 채움
      text: s.text,
      done: s.done,
      sort_order: j,
    })),
  );
  if (subRows.length) {
    const { error: e2 } = await supabase.from('subtasks').insert(subRows);
    if (e2) throw e2;
  }

  // 4. seeded_at 마킹 (UPSERT)
  await supabase
    .from('user_preferences')
    .upsert({ user_id: userId, seeded_at: new Date().toISOString() });
}
```

**동시성 보장**: 두 탭이 같은 순간에 첫 로그인을 trigger하더라도, `user_preferences.user_id`가 PK이므로 두 번째 INSERT는 conflict. 첫 번째가 성공한 경우 두 번째는 `seeded_at`이 이미 있어 step 1에서 return. 잘못된 경우 `ON CONFLICT (user_id) DO NOTHING`을 step 4에 추가해도 됨.

## 6. 검증 절차 (Constitution Governance 의무)

마이그레이션 적용 후 다음을 모두 확인한 뒤 PR을 머지한다:

- [ ] `supabase db advisors` (CLI v2.81.3+) 또는 MCP `get_advisors` 실행 — 경고 0건
- [ ] 비인증 익명 클라이언트로 `select * from tasks` 호출 → 0행 반환되는지 확인
- [ ] 사용자 A로 INSERT한 task를 사용자 B로 `select` 시도 → 0행
- [ ] 사용자 B가 사용자 A의 task ID로 `update`/`delete` 시도 → 0행 영향
- [ ] 사용자가 `user_id`를 다른 사용자로 INSERT 시도 → RLS WITH CHECK 위반으로 거부
- [ ] subtask를 다른 사용자의 task에 INSERT 시도 → 트리거 + RLS로 거부
- [ ] Realtime 채널에 다른 user_id 필터로 구독 시도 → 본인 데이터 이벤트만 흐름

이 체크들이 통과해야 contracts/db-schema.md가 **계약을 만족**한 것이다.
