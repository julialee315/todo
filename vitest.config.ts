import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// Single jsdom environment for all tests. Pure-logic tests in tests/unit/ do
// not use the DOM but run fine here, and jsdom provides a real localStorage —
// which the persistence unit tests need — so a separate node project would
// only add a localStorage-mock burden for no benefit.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.{test,spec}.{ts,tsx}'],
    // Placeholders so `createClient()` from @supabase/ssr doesn't throw in
    // tests that import a module that constructs it eagerly. Tests that
    // verify Supabase behaviour mock '@/utils/supabase/client' anyway, so
    // these values are never used to make real calls.
    env: {
      NEXT_PUBLIC_SUPABASE_URL: 'https://placeholder.supabase.co',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_placeholder',
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
});
