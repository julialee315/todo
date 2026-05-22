# Contract: Realtime Channels & Event Lifecycle

**Date**: 2026-05-22 | **Plan**: [../plan.md](../plan.md)

같은 사용자의 두 세션이 2초 이내에 수렴(spec FR-017, SC-004)하기 위한 채널 계약. 이 문서는 채널 이름·필터·이벤트 페이로드·라이프사이클을 정의한다.

---

## 1. 채널 식별 & 필터

각 사용자별로 **단일 채널**을 사용한다. WebSocket 1개로 세 테이블 변경을 다 받는다.

| 속성 | 값 |
|------|-----|
| 채널 이름 | `tasks-by-user-${userId}` |
| Bind 이벤트 | `postgres_changes` |
| 필터 | `event: '*'`, `schema: 'public'`, `table: <each>`, `filter: 'user_id=eq.${userId}'` |
| 구독 테이블 | `tasks`, `subtasks`, `user_preferences` |

```ts
const channel = supabase.channel(`tasks-by-user-${userId}`)
  .on('postgres_changes',
      { event: '*', schema: 'public', table: 'tasks',
        filter: `user_id=eq.${userId}` },
      onTaskChange)
  .on('postgres_changes',
      { event: '*', schema: 'public', table: 'subtasks',
        filter: `user_id=eq.${userId}` },
      onSubtaskChange)
  .on('postgres_changes',
      { event: '*', schema: 'public', table: 'user_preferences',
        filter: `user_id=eq.${userId}` },
      onPreferenceChange)
  .subscribe();
```

**계약 의무**:
- `userId`는 반드시 `useAuth().user.id`에서 옴. 다른 사용자의 ID를 임의로 넣어도 RLS와 publication 권한 검사가 거른다(이중 방어).
- 채널 이름에 `userId`를 포함해 디버깅·로그 추적 용이.

## 2. 이벤트 페이로드

Supabase Realtime의 `postgres_changes` 표준 페이로드를 그대로 사용한다.

```ts
type Payload<R> = {
  schema: 'public';
  table: string;
  commit_timestamp: string;  // ISO 8601
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: R | null;             // INSERT/UPDATE → row; DELETE → null
  old: R | null;             // UPDATE/DELETE → 이전 row; INSERT → null
  errors: string[] | null;
};
```

각 핸들러는 페이로드를 `RealtimeChange`로 표준화해 단일 reducer dispatch로 흘려보낸다:

```ts
function onTaskChange(payload: Payload<DbTaskRow>) {
  store.dispatch({
    type: 'remote/taskChanged',
    payload: {
      event: payload.eventType,
      task: payload.new ? dbTaskToDomain(payload.new, []) : null,
      taskId: payload.old?.id ?? payload.new?.id,
    },
  });
}
```

**계약**:
- `subtasks` INSERT/UPDATE/DELETE는 부모 task의 `subs` 배열을 reducer 안에서 in-place 갱신.
- `user_preferences` 변경은 `ThemeProvider`와 `TasksProvider`가 동시에 듣는다 — `theme`/`view`/`sort` 각각 해당 컨텍스트의 상태를 업데이트.

## 3. 라이프사이클

```
컴포넌트 마운트 (TasksProvider)
  ├─ useEffect: subscribeToUserChanges(user.id, onChange) → unsubscribe 저장
  └─ 페이지 이동·로그아웃 시 cleanup: unsubscribe()

세션 토큰 갱신 (middleware가 처리)
  └─ Realtime 채널은 별도 — 토큰 만료 직후 reconnect 필요할 수 있음
       └─ supabase-js의 자동 재연결에 의존, 안 되면 다음 마운트 때 새 채널 생성

오프라인 → 온라인
  └─ supabase-js Realtime이 자동 재구독
  └─ 동시에 컴포넌트가 fetch를 한번 더 트리거해 누락된 변경 동기화

로그아웃
  ├─ unsubscribe()
  ├─ supabase.auth.signOut()
  └─ localStorage.lastSyncedSnapshot 제거
```

**계약 의무**:
- `useEffect` cleanup은 반드시 `unsubscribe()`를 호출 — 누락 시 메모리 누수 + 사용자 전환 시 이전 사용자의 채널이 살아있는 보안 문제.
- 사용자 ID가 바뀌면(드물지만 가능) `useEffect` 의존성 배열에 `user.id`를 두어 자동 cleanup+resubscribe.

## 4. Echo 처리 (낙관적 UI vs Remote push)

**결정**: 낙관적 UI는 도입하지 않는다. mutation은 다음 흐름으로 처리한다.

```
사용자 입력 → mutation 함수 호출 → supabase에 보냄 → 성공
  ↓ (네트워크 RTT, 보통 < 500ms)
Realtime push 도착 → reducer dispatch → 화면 갱신
```

장점: reducer가 단일 진실원의 변경만 처리해 echo·낙관·롤백 분기가 없다. **단순한 멱등 reducer**로 충분.

단점: 사용자가 자기 입력의 반영을 ~500ms 뒤에 본다. spec SC-004(2초) 안에 충분.

**대안**(미채택): mutation 함수가 즉시 dispatch + Realtime push는 멱등 흡수 → 응답이 빠르지만 실패 롤백 분기 필요. YAGNI.

## 5. 충돌 처리 — Last-Write-Wins

spec US3 #3을 만족. 별도 코드 없음 — Postgres의 행 락 + 가장 늦은 UPDATE가 최종 상태. Realtime은 그 최종 상태를 모든 세션에 push.

검증 시나리오 (integration test):
1. 같은 사용자로 두 클라이언트 인스턴스(`createBrowserClient`)를 같은 supabase 프로젝트에 연결.
2. 각각 채널 구독.
3. 같은 task의 title을 거의 동시에 `'A'`, `'B'`로 update.
4. 양쪽 채널이 결국 같은 최종 title(`'A'` 또는 `'B'`)을 받는지 확인.

## 6. 보안 의무

- Realtime publication에 등록된 테이블은 RLS가 활성화돼 있어야 함(Supabase 강제). [db-schema.md](./db-schema.md) §3 참고.
- 채널 이름에 `userId`를 포함해도 권한 상승 효과 없음 — 필터·RLS가 실제 가드.
- `user_metadata` 변경은 publication에 포함되지 않도록 — auth.* 스키마는 기본적으로 publication에 안 들어감. 확인 항목.

## 7. 테스트 계약

`tests/integration/tasks-sync.test.tsx`가 다음을 검증한다:

- [ ] 두 인스턴스 동시 구독 → 한쪽 mutation이 다른 쪽에 2초 이내 도착
- [ ] 다른 사용자로 mutation 발생 → 본인 채널에 이벤트 안 옴(필터 + RLS)
- [ ] 채널 cleanup 후 mutation → 콜백 호출되지 않음
- [ ] 같은 task에 두 동시 update → 양쪽이 동일 최종 상태로 수렴

단위 테스트(`tests/unit/supabase-store/realtime.test.ts`)는 `supabase.channel`을 모킹해 등록된 핸들러가 표준 페이로드를 받으면 올바른 `dispatch` action을 만드는지 검증.
