<!--
SYNC IMPACT REPORT
==================
Version change: 1.0.0 → 1.1.0
Bump rationale: MINOR — Supabase 도입을 명시적으로 허용하도록 원칙 III와
  Technology Constraints를 확장하고, Governance에 Supabase 보안 컴플라이언스
  라인을 추가. 기존 원칙의 의미는 유지되며 가이드가 materially expanded됨.

Modified principles:
  III. Simplicity & YAGNI — "No backend." 단호한 금지에서, "spec이 명시적으로
    허가한 경우에만 Supabase 사용. 추측성 추가는 여전히 금지."로 정련.
  (I, II, IV, V 변경 없음)

Modified sections:
  - Technology Constraints — Persistence 항목 분리(local UI state = localStorage,
    Auth/remote data = 선택적 Supabase). Supabase 키 정책 및 RLS 의무 추가.
  - Governance — Supabase 보안 체크리스트 컴플라이언스 라인 추가.

Added sections: none
Removed sections: none

Templates requiring updates:
  ✅ .specify/templates/plan-template.md — generic gates; 향후 plan에서 Supabase
     사용 시 Constitution Check에 해당 줄을 추가하면 됨. 템플릿 자체 수정 불필요.
  ✅ .specify/templates/spec-template.md — generic; Supabase 사용 여부는 각 spec이
     명시.
  ✅ .specify/templates/tasks-template.md — generic; 변경 불필요.

Follow-up TODOs:
  - README.md: 라인 43 "**localStorage** 영속화 (백엔드 없음)" 문구는 현재 master
    상태 기준이라 그대로 둠. Supabase 통합 feature가 spec/plan으로 채택될 때
    README도 함께 갱신.
  - specs/001-todo-app/plan.md: 현재 feature는 Supabase 미사용이므로 Constitution
    Check 그대로 유효. 신규 feature(예: 002-supabase-auth)가 만들어질 때 plan에
    Supabase 게이트 추가.
-->

# demodev Tasks Constitution

/ 한국어 Todo 웹앱 — Claude Design 핸드오프 번들의 프로덕션 구현

## Core Principles

### I. Test-First (NON-NEGOTIABLE)

TDD is mandatory. The cycle is strictly Red-Green-Refactor: write a failing test,
make it pass with the minimum code, then refactor.

- Pure logic — the task store and its derived selectors (`filterTasks`, `isOverdue`,
  `isToday`, `isUpcoming`, `viewCount`, `catCount`, date helpers) MUST have unit
  tests written BEFORE the implementation.
- Component behavior — interactive components (add / edit / delete / toggle-done /
  toggle-star / subtask CRUD / view switching / theme toggle) MUST have behavioral
  tests (React Testing Library) written BEFORE the component logic.
- A test that has never failed is not trusted. Every test MUST be observed failing
  for the right reason before its implementation is written.
- Tests are NOT optional for this project; the `/speckit-tasks` "tests optional"
  default is overridden here.

Rationale: the prototype's value lives in its filtering/grouping logic and its
interactivity. Locking that behavior with tests first prevents regressions when the
prototype's structure is restructured into production components.

### II. Design Fidelity

The Claude Design handoff bundle is the source of truth for visual output.

- Recreate the visual result pixel-faithfully: layout, spacing (4px grid), colors,
  radii, typography, and the four screens (login / main 3-panel / calendar / stats).
- The demodev design tokens (`colors_and_type.css`) MUST be used verbatim as the
  token layer — no re-derivation of color, type, radius, spacing, or shadow scales.
- The prototype's harness (DesignCanvas pan/zoom, TweaksPanel host protocol, Babel
  standalone, `window`-global module pattern) MUST NOT be carried into production —
  it is a prototyping medium, not a structure to copy.
- Both light and dark themes MUST match the design system's `[data-theme="dark"]`
  mirror.

Rationale: the README of the handoff bundle is explicit — match the visual output,
do not copy the prototype's internal structure.

### III. Simplicity & YAGNI

Build only what is specified. No speculative generality.

- Persistence layers are explicitly scoped: **local UI state (theme, view, in-flight
  edits) uses `localStorage`**; **auth and shared/remote data use Supabase ONLY when
  a spec explicitly authorizes it**. Adding Supabase (or any other backend) to a
  scope that did not call for it is a violation of this principle.
- No features beyond the spec — no abstractions for single-use code, no config
  surface that was not requested, no error handling for impossible states.
- Prefer the smallest code that satisfies a passing test. If it can be 50 lines,
  it is not 200.

Rationale: the scope is a faithful, interactive reproduction of a fixed design,
optionally extended with auth/sync via Supabase. The principle is not "no backend
ever" — it is "no backend, no abstraction, no surface that wasn't asked for."

### IV. Component Modularity

Screens and shared UI are separated into independently testable units.

- Each screen (login, main, calendar, stats) is its own module/route.
- Shared UI (icons, side-nav, primitives like check / chip / button) lives in
  shared modules consumed by screens.
- The task store is a single module with a typed public API; components consume it,
  they do not re-implement filtering or mutation logic.
- A unit MUST be testable without mounting an unrelated screen.

Rationale: modular boundaries are what make Principle I's component tests cheap and
what keep the four-screen scope from collapsing into one file.

### V. Accessibility

The production build MUST be at least as accessible as the prototype.

- Semantic HTML: real `<button>`, `<input>`, `<label>`, `<nav>`, `<aside>`,
  heading hierarchy.
- All `aria-label`s present in the prototype MUST be preserved; interactive
  controls without visible text MUST have an accessible name.
- Keyboard operability: Enter submits the add-task and add-subtask inputs; focus
  states are visible (`:focus-visible` rings from the token layer).
- Checkboxes, toggles, and radio groups expose correct roles/states.

Rationale: the prototype already encodes these affordances; regressing them in the
"real" build would be a downgrade, not a port.

## Technology Constraints

- **Framework**: Next.js (App Router).
- **Language**: TypeScript — strict mode; no implicit `any` in committed code.
- **Testing**: Vitest + React Testing Library; jsdom environment.
- **Styling**: CSS carrying the demodev design tokens; no CSS framework that would
  re-derive the token scales.
- **Local persistence**: `localStorage` for client-only state (selected view, theme,
  unsynced UI state). No IndexedDB, no service worker cache.
- **Remote persistence & auth (optional)**: Supabase via `@supabase/ssr` +
  `@supabase/supabase-js`. When used:
  - The **publishable key** (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) is the only
    Supabase key allowed in browser-exposed code. The `service_role` key MUST NEVER
    appear in any file under `src/` or in any `NEXT_PUBLIC_*` env var.
  - Every table in an exposed schema (default: `public`) MUST have **RLS enabled**.
    `TO authenticated` alone is not authorization — every policy MUST include an
    ownership predicate (e.g. `(select auth.uid()) = user_id`).
  - Authorization decisions MUST use `app_metadata`, never `user_metadata`.
  - Views MUST use `WITH (security_invoker = true)`; `SECURITY DEFINER` functions
    MUST NOT live in the `public` schema without an explicit `auth.uid()` check.
- **Fonts**: Pretendard Variable + Gaegu + JetBrains Mono via the existing CDN
  `@import`s in `colors_and_type.css`.
- **Demo clock**: "today" is pinned to 2026-05-15 for the localStorage-only feature
  set to keep relative-date logic and sample data deterministic. Features that move
  data to Supabase MAY use real `now()` once the spec authorizes it.

## Development Workflow

- The SDD pipeline is followed in order: constitution → specify → clarify → plan →
  tasks → analyze → implement.
- Within implementation, work proceeds task-by-task; each task that produces code
  follows Red-Green-Refactor.
- A task is "done" only when its tests pass AND the broader suite still passes.
  Failing or partial states keep the task open.
- Commits are made per task or per logical group, with the test added in (or before)
  the same commit as the code it covers.
- The Constitution Check gate in `plan.md` MUST pass before Phase 0 research and be
  re-verified after Phase 1 design. Violations go in Complexity Tracking with a
  justification or the design changes.

## Governance

- This constitution supersedes other practices for this project. Where a tool's
  default conflicts with a principle here (e.g. "tests optional"), this document
  wins.
- Amendments require: a written rationale, a version bump per the policy below, and
  propagation to dependent templates/docs in the same change.
- Versioning policy (semantic):
  - MAJOR — backward-incompatible governance change or principle removal/redefinition.
  - MINOR — a new principle/section, or materially expanded guidance.
  - PATCH — clarifications, wording, or non-semantic refinements.
- Compliance review: every plan and task breakdown MUST be checked against these
  principles; any complexity that violates a principle MUST be justified in the
  plan's Complexity Tracking table or removed.
- **Supabase compliance**: any change that touches Supabase (schema, RLS, auth,
  storage, edge functions, client/server helpers) MUST be reviewed against the
  Supabase security checklist before merge — specifically: no `service_role` in
  client-exposed code, RLS enabled on every exposed-schema table, ownership
  predicates in every `TO authenticated` policy, no `user_metadata` in authorization,
  `security_invoker` views, and `SECURITY DEFINER` functions kept out of `public`.

**Version**: 1.1.0 | **Ratified**: 2026-05-15 | **Last Amended**: 2026-05-22
