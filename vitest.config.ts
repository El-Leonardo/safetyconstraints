import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.{test,spec}.{js,ts}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'tests/',
        '**/*.d.ts',
        '**/*.config.{js,ts}',
      ],
    },
    typecheck: {
      enabled: true,
    },
  },
  resolve: {
    alias: {
      '@safetyconstraints/core': './src/index.ts',
      '@safetyconstraints/core/*': './src/*',
    },
  },
});
