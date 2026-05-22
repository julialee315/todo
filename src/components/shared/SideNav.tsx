'use client';

// Unified shared left navigation for the main / calendar / stats screens.
// View items route to /main with a view query, calendar/stats route to their
// pages, category items route to /main with a cat query. Active state is
// driven by props so the component itself never reads useSearchParams (which
// would force a CSR bailout on the calendar/stats routes).

import { useRouter } from 'next/navigation';
import type { CategoryId, ViewId } from '@/lib/types';
import { useTasks } from '@/context/TasksProvider';
import { CATEGORIES, VIEWS } from '@/lib/store/sample-data';
import { viewCount, catCount } from '@/lib/store/selectors';
import { Icon } from '@/components/shared/Icon';
import { ThemeToggle } from '@/components/shared/ThemeToggle';
import { LogoutButton } from '@/components/shared/LogoutButton';

interface SideNavProps {
  activeView?: ViewId | null;
  activeCat?: CategoryId | null;
  activeRoute?: 'calendar' | 'stats';
}

export function SideNav({ activeView, activeCat, activeRoute }: SideNavProps) {
  const router = useRouter();
  const { tasks } = useTasks();

  const onMain = !activeRoute;

  return (
    <aside className="nav">
      <div className="nav__brand">
        <span className="nav__brand-mark">
          <Icon name="check" size={14} strokeWidth={2.5} />
        </span>
        <span>Tasks</span>
        <span style={{ marginLeft: 'auto' }}>
          <button
            type="button"
            className="btn btn--ghost btn--sm btn--icon"
            aria-label="설정"
          >
            <Icon name="settings" size={14} />
          </button>
        </span>
      </div>

      <div className="nav__user">
        <span className="nav__user-avatar">민</span>
        <span
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            minWidth: 0,
          }}
        >
          <span className="nav__user-name">김민지</span>
          <span className="nav__user-mail">minji@demodev.kr</span>
        </span>
        <Icon name="chevD" size={14} style={{ color: 'var(--fg-muted)' }} />
      </div>

      <div style={{ height: 8 }} />

      {VIEWS.map((v) => {
        const count = viewCount(tasks, v.id);
        const active = onMain && !activeCat && activeView === v.id;
        return (
          <button
            key={v.id}
            type="button"
            className={'nav__item' + (active ? ' is-active' : '')}
            onClick={() => router.push(`/main?view=${v.id}`)}
          >
            <Icon name={v.icon} className="nav__item-ic" size={16} />
            <span className="nav__item-label">{v.name}</span>
            {count > 0 && <span className="nav__count">{count}</span>}
          </button>
        );
      })}

      <button
        type="button"
        className={
          'nav__item' + (activeRoute === 'calendar' ? ' is-active' : '')
        }
        onClick={() => router.push('/calendar')}
      >
        <Icon name="calendar" className="nav__item-ic" size={16} />
        <span className="nav__item-label">캘린더</span>
      </button>
      <button
        type="button"
        className={'nav__item' + (activeRoute === 'stats' ? ' is-active' : '')}
        onClick={() => router.push('/stats')}
      >
        <Icon name="stats" className="nav__item-ic" size={16} />
        <span className="nav__item-label">통계</span>
      </button>

      <div className="nav__group-label">
        <span>카테고리</span>
        <button type="button" aria-label="카테고리 추가">
          <Icon name="plus" size={12} />
        </button>
      </div>

      {CATEGORIES.map((c) => {
        const count = catCount(tasks, c.id);
        const active = onMain && activeCat === c.id;
        return (
          <button
            key={c.id}
            type="button"
            className={'nav__item' + (active ? ' is-active' : '')}
            onClick={() => router.push(`/main?cat=${c.id}`)}
          >
            <span className="nav__cat-dot" style={{ background: c.color }} />
            <span className="nav__item-label">{c.name}</span>
            {count > 0 && <span className="nav__count">{count}</span>}
          </button>
        );
      })}

      <div className="nav__footer" style={{ marginTop: 'auto', paddingTop: 8 }}>
        <ThemeToggle />
        <LogoutButton />
      </div>
    </aside>
  );
}
