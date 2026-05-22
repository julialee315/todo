# Quickstart: 다중 사용자 클라우드 동기화 Todo

**Date**: 2026-05-22 | **Plan**: [plan.md](./plan.md)

로컬 개발 환경에서 이 feature를 돌려보고 Vercel에 배포하기까지의 최소 단계.

---

## 사전 준비

| 도구 | 필수 여부 | 비고 |
|------|----------|------|
| Node.js 20+ | ✅ | 기존 |
| npm | ✅ | 기존 |
| Supabase 계정 | ✅ | https://supabase.com — Free Tier로 충분 |
| Supabase CLI | ⚪ (마이그레이션 작성 시) | `brew install supabase/tap/supabase` 또는 `npm i -g supabase` |
| Google Cloud Console 프로젝트 | ⚪ (P4만) | OAuth client ID 발급용 |
| Vercel 계정 | ⚪ (배포 시) | https://vercel.com |

---

## 1. Supabase 프로젝트 셋업

### 1.1 프로젝트 생성

1. https://supabase.com/dashboard → "New project"
2. 이름, 리전(서울에 가까운 곳), 데이터베이스 비밀번호 설정
3. 생성 후 **Settings → API**에서 두 값 복사:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` (publishable) key → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - ⚠️ `service_role` 키는 **절대 복사·노출 금지** (Constitution Governance)

### 1.2 `.env.local` 갱신

```bash
# /Users/julia/Desktop/AX-project/ax-academy-1/.env.local
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

### 1.3 스키마 + RLS 적용

[contracts/db-schema.md](./contracts/db-schema.md)의 SQL을 다음 순서로 적용:

**옵션 A — Supabase Dashboard SQL Editor**
1. Dashboard → SQL Editor → New query
2. db-schema.md §1 (테이블) 복붙 → Run
3. §2 (트리거) → Run
4. §3 (RLS) → Run
5. §4 (Realtime publication) → Run

**옵션 B — Supabase CLI (권장)**
```bash
supabase link --project-ref <your-project-ref>
supabase migration new create_core_tables
# 생성된 supabase/migrations/<ts>_create_core_tables.sql에 §1 SQL 붙여넣기
supabase migration new enable_rls_policies
# §2 + §3 붙여넣기
supabase migration new realtime_publication
# §4 붙여넣기
supabase db push
```

### 1.4 검증

[db-schema.md §6 검증 절차](./contracts/db-schema.md#6-검증-절차-constitution-governance-의무) 체크리스트 7개를 모두 확인.

```bash
# CLI v2.81.3+
supabase db advisors
# 또는 MCP get_advisors — 경고 0건이어야 함
```

---

## 2. Google OAuth 셋업 (P4 단계에 필요)

P1~P3까지는 이메일/비밀번호만으로 가능하니, P4 구현 직전에 한다.

### 2.1 Google Cloud Console

1. https://console.cloud.google.com → 프로젝트 만들기/선택
2. APIs & Services → Credentials → Create credentials → OAuth client ID
3. Application type: **Web application**
4. Authorized redirect URIs에 다음 추가:
   - `https://<your-project-ref>.supabase.co/auth/v1/callback`
5. Client ID·Client Secret 복사

### 2.2 Supabase Dashboard

1. Authentication → Providers → Google → Enable
2. Client ID, Client Secret 붙여넣기 → Save
3. Authentication → URL Configuration → Redirect URLs에 다음 추가:
   - `http://localhost:3000/auth/callback`
   - `https://<your-vercel-prod-domain>/auth/callback`
   - `https://*-<team>.vercel.app/auth/callback` (Preview 배포용 와일드카드)

---

## 3. 로컬 개발

```bash
cd /Users/julia/Desktop/AX-project/ax-academy-1
npm install         # 이미 했으면 스킵
npm run dev         # http://localhost:3000
```

### 3.1 첫 동작 확인 (P1)

1. http://localhost:3000 접속 → 로그인 화면
2. "회원가입" 탭 → 이메일 + 8자 이상 비밀번호 → 가입
3. 자동으로 `/main` 도착 → 시드 14개 할 일이 보임
4. 로그아웃 → `/` 도착
5. 다시 로그인 → 같은 데이터

### 3.2 멀티 디바이스 확인 (P3)

1. 같은 계정으로 두 개의 다른 브라우저(또는 시크릿창)에서 로그인
2. 한쪽에서 할 일 추가 → 다른 쪽에 2초 이내 도착 확인
3. 같은 task의 제목을 거의 동시에 다른 값으로 수정 → 양쪽 모두 더 늦은 값으로 수렴

### 3.3 격리 확인 (P2 보안)

1. 사용자 A로 가입 → 할 일 추가 → 메모해 둔 task ID 확인 (브라우저 DevTools → Network 응답)
2. 로그아웃 → 사용자 B로 새 가입
3. B의 콘솔에서 직접 호출:
   ```js
   await supabase.from('tasks').select('*').eq('id', '<A의 task ID>');
   ```
   → `data: []` (RLS가 0행 반환)

---

## 4. 테스트 실행

```bash
npm test               # 전체 단위·컴포넌트 테스트
npm test integration   # 새 통합 테스트만
npm run typecheck      # TypeScript 검증
```

기대 결과:
- 기존 122개 + 새 테스트 모두 통과
- 신규 영역(Auth/Adapter/Realtime)의 커버리지 ≥ 기존 도메인 로직 수준

---

## 5. Vercel 배포

### 5.1 첫 배포

1. https://vercel.com → New Project → GitHub 저장소 `julialee315/todo` 연결
2. Framework Preset: **Next.js** (자동 감지)
3. Environment Variables에 다음 추가 (Production·Preview·Development 전부):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
4. Deploy

### 5.2 도메인 → Supabase에 등록

배포된 URL(예: `https://todo-julialee315.vercel.app`)을 Supabase의 Redirect URLs에 추가해야 OAuth가 동작 (2.2 참고).

### 5.3 검증

배포 후 production URL에서 3.1~3.3 시나리오를 다시 한 번 돌려본다.

---

## 6. 흔한 문제

| 증상 | 원인 | 해결 |
|------|------|------|
| 로그인 후 새로고침하면 로그아웃됨 | middleware 미동작 | `src/middleware.ts` 존재 + `matcher` 설정 확인 |
| OAuth callback에서 "Invalid redirect URL" | Supabase에 URL 미등록 | 2.2 단계 다시 |
| Realtime 이벤트가 안 옴 | publication 미설정 | db-schema.md §4 SQL 실행 |
| 다른 사용자의 데이터가 보임 | RLS 미적용 또는 정책 누락 | db-schema.md §3 SQL 모두 실행, Dashboard에서 RLS Enabled 확인 |
| `service_role` 환경변수 노출 | 키 잘못 복사 | Vercel·`.env.local` 모두에서 즉시 제거, Supabase Dashboard에서 키 재발급 |

---

## 7. 다음 단계

1. `/speckit-tasks` — P1~P4를 task 단위로 분해
2. `/speckit-analyze` — spec ↔ plan ↔ tasks 일관성 검사 (선택)
3. `/speckit-implement` — TDD로 task 차례차례 구현
