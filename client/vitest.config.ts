import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

// Separate from vite.config.ts so the app build never pulls in test-only
// types/config, but reuses the same plugins (react) via mergeConfig.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      setupFiles: ['./tests/setup.ts'],
      css: false,
    },
  }),
);
