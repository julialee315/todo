'use client';

// Calendar — month grid for the visible month (starts on May 2026, today).
// Read-only over the task list: events are category dots, a clicked date
// drives the right-hand preview panel.

import { useMemo, useState } from 'react';
import { SideNav } from '@/components/shared/SideNav';
import { Icon } from '@/components/shared/Icon';
import { useTasks } from '@/context/TasksProvider';
import { CAT_BY_ID, PRIO_BY_ID } from '@/lib/store/sample-data';
import { todayKey, fmtDay, fmtKey, parseKey } from '@/lib/store/dates';

const MONTH_NAMES = [
  '1월', '2월', '3월', '4월', '5월', '6월',
  '7월', '8월', '9월', '10월', '11월', '12월',
];
const DOW_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

export function CalendarScreen() {
  const { tasks } = useTasks();
  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState('2026-05-15');

  const base = new Date(2026, 4 + monthOffset, 1);
  const year = base.getFullYear();
  const monthIdx = base.getMonth();
  const monthName = MONTH_NAMES[monthIdx];

  const first = new Date(year, monthIdx, 1);
  const startDow = first.getDay();
  const gridStart = new Date(year, monthIdx, 1 - startDow);

  const cells = useMemo(() => {
    const out = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      const k = fmtKey(d);
      out.push({
        date: d,
        key: k,
        inMonth: d.getMonth() === monthIdx,
        isToday: k === todayKey(),
        events: tasks.filter((t) => t.due === k),
      });
    }
    return out;
  }, [gridStart.getTime(), monthIdx, tasks]);

  const dayTasks = tasks.filter((t) => t.due === selectedDay);
  const dayDate = parseKey(selectedDay);

  return (
    <div className="cal">
      <SideNav activeRoute="calendar" />

      <section className="cal__main">
        <header className="cal__head">
          <div className="cal__head-left">
            <h1 className="cal__month">{monthName}</h1>
            <span className="cal__year">{year}</span>
          </div>
          <div className="cal__nav">
            <button
              type="button"
              className="btn btn--ghost btn--sm btn--icon"
              aria-label="이전 달"
              onClick={() => setMonthOffset((o) => o - 1)}
            >
              <Icon name="chevL" size={14} />
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              aria-label="오늘로 이동"
              onClick={() => setMonthOffset(0)}
            >
              오늘
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--sm btn--icon"
              aria-label="다음 달"
              onClick={() => setMonthOffset((o) => o + 1)}
            >
              <Icon name="chevR" size={14} />
            </button>
            <span style={{ width: 12 }} />
            <div
              style={{
                display: 'flex',
                gap: 4,
                padding: 4,
                background: 'var(--bg-muted)',
                borderRadius: 'var(--radius-button-md)',
              }}
            >
              <button
                type="button"
                className="btn btn--sm"
                style={{
                  background: 'var(--bg)',
                  boxShadow: 'var(--shadow-xs)',
                }}
              >
                월
              </button>
              <button type="button" className="btn btn--ghost btn--sm">
                주
              </button>
              <button type="button" className="btn btn--ghost btn--sm">
                일
              </button>
            </div>
            <span style={{ width: 8 }} />
            <button type="button" className="btn btn--primary btn--sm">
              <Icon name="plus" size={12} /> 새 할 일
            </button>
          </div>
        </header>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 320px',
            flex: 1,
            minHeight: 0,
          }}
        >
          <div className="cal__grid">
            {DOW_NAMES.map((n, i) => (
              <div
                key={n}
                className={
                  'cal__dow' +
                  (i === 0 ? ' is-sun' : '') +
                  (i === 6 ? ' is-sat' : '')
                }
              >
                {n}
              </div>
            ))}
            {cells.map((c, i) => {
              const dow = c.date.getDay();
              const cls = [
                'cell',
                !c.inMonth && 'is-other',
                c.isToday && 'is-today',
                c.key === selectedDay && 'is-selected',
                dow === 0 && 'is-sun',
                dow === 6 && 'is-sat',
              ]
                .filter(Boolean)
                .join(' ');
              return (
                <div
                  key={i}
                  className={cls}
                  onClick={() => setSelectedDay(c.key)}
                >
                  <span className="cell__num">{c.date.getDate()}</span>
                  <div className="cell__events">
                    {c.events.slice(0, 3).map((t) => {
                      const cat = CAT_BY_ID[t.category];
                      return (
                        <div
                          key={t.id}
                          className={'cal-evt' + (t.done ? ' is-done' : '')}
                        >
                          <span
                            className="cal-evt__dot"
                            style={{ background: cat.color }}
                          />
                          <span
                            style={{
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {t.title}
                          </span>
                        </div>
                      );
                    })}
                    {c.events.length > 3 && (
                      <div className="cal-evt__more">
                        + {c.events.length - 3}개 더
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Day preview sidebar */}
          <div
            style={{
              borderLeft: '1px solid var(--border-subtle)',
              background: 'var(--bg-muted)',
              padding: '20px 20px 24px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            <div>
              <div
                style={{
                  font: '500 12px/1 var(--font-sans)',
                  color: 'var(--fg-muted)',
                  marginBottom: 6,
                }}
              >
                {DOW_NAMES[dayDate.getDay()]}요일
              </div>
              <div
                style={{
                  font: '700 22px/1.2 var(--font-sans)',
                  letterSpacing: 'var(--tracking-snug)',
                }}
              >
                {fmtDay(dayDate)}
              </div>
              <div
                style={{
                  font: '500 12px/1 var(--font-sans)',
                  color: 'var(--fg-muted)',
                  marginTop: 8,
                }}
              >
                {dayTasks.length}개의 할 일 ·{' '}
                {dayTasks.filter((t) => t.done).length}개 완료
              </div>
            </div>

            <div className="divider" />

            <div
              style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
            >
              {dayTasks.length === 0 ? (
                <div
                  style={{
                    padding: '20px 8px',
                    textAlign: 'center',
                    color: 'var(--fg-muted)',
                    font: '500 13px/1.5 var(--font-sans)',
                  }}
                >
                  이 날짜에 등록된 할 일이 없습니다.
                </div>
              ) : (
                dayTasks.map((t) => {
                  const cat = CAT_BY_ID[t.category];
                  return (
                    <div
                      key={t.id}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 10,
                        padding: 10,
                        background: 'var(--bg)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-lg)',
                      }}
                    >
                      <span
                        className={'check' + (t.done ? ' is-checked' : '')}
                        style={{ marginTop: 1 }}
                        aria-hidden="true"
                      >
                        {t.done && (
                          <svg
                            width="11"
                            height="11"
                            viewBox="0 0 12 12"
                            fill="none"
                          >
                            <path
                              d="M2 6L5 9L10 3"
                              stroke="white"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                      </span>
                      <div
                        style={{
                          flex: 1,
                          minWidth: 0,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 4,
                        }}
                      >
                        <div
                          style={{
                            font: '600 13px/1.4 var(--font-sans)',
                            letterSpacing: 'var(--tracking-snug)',
                            color: t.done ? 'var(--fg-muted)' : 'var(--fg)',
                            textDecoration: t.done ? 'line-through' : 'none',
                          }}
                        >
                          {t.title}
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            font: '500 11px/1 var(--font-sans)',
                            color: 'var(--fg-muted)',
                          }}
                        >
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <span
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: '50%',
                                background: cat.color,
                              }}
                            />
                            {cat.name}
                          </span>
                          {t.priority !== 'none' && (
                            <>
                              <span
                                style={{
                                  width: 2,
                                  height: 2,
                                  borderRadius: 1,
                                  background: 'var(--fg-muted)',
                                }}
                              />
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                }}
                              >
                                <span
                                  style={{
                                    width: 6,
                                    height: 6,
                                    borderRadius: 2,
                                    background: PRIO_BY_ID[t.priority].color,
                                  }}
                                />
                                {PRIO_BY_ID[t.priority].name}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <button
              type="button"
              className="btn btn--outline btn--block"
              style={{ marginTop: 'auto' }}
            >
              <Icon name="plus" size={12} /> 이 날에 할 일 추가
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
