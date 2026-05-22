'use client';

// LogoutButton — rendered in the SideNav footer next to ThemeToggle. Styled
// as a nav item so it inherits the same hover/focus rings.

import { useAuth } from '@/context/AuthProvider';
import { Icon } from '@/components/shared/Icon';

export function LogoutButton() {
  const { signOut } = useAuth();
  return (
    <button
      type="button"
      aria-label="로그아웃"
      className="nav__item"
      onClick={() => {
        void signOut();
      }}
    >
      <Icon name="logout" className="nav__item-ic" size={16} />
      <span className="nav__item-label">로그아웃</span>
    </button>
  );
}
