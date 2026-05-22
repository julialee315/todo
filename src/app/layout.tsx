import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '../styles/colors_and_type.css';
import '../styles/todo.css';
import { AuthProvider } from '@/context/AuthProvider';
import { ThemeProvider } from '@/context/ThemeProvider';
import { TasksProvider } from '@/context/TasksProvider';

export const metadata: Metadata = {
  title: 'demodev Tasks — 한국어 Todo 앱',
  description:
    '팀과 개인의 모든 작업을 한 곳에서. 마감일·우선순위·서브태스크까지.',
};

// Anti-FOUC: apply the persisted theme before paint so dark-mode returning
// users don't flash light. The key string mirrors THEME_KEY in persistence.ts.
const themeScript = `try{var t=localStorage.getItem('demodev-tasks:theme');if(t==='dark'||t==='light')document.documentElement.dataset.theme=t;}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <AuthProvider>
          <ThemeProvider>
            <TasksProvider>{children}</TasksProvider>
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
