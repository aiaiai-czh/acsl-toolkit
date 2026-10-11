import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: [
        'src/context/**/*.ts',
        'src/completion/completionItems.ts',
        'src/completion/prefix.ts',
      ],
      reporter: ['text', 'json-summary'],
      thresholds: {
        branches: 90,
        functions: 90,
        lines: 90,
        statements: 90,
      },
    },
    environment: 'node',
    include: ['test/{unit,grammar}/**/*.test.ts'],
    restoreMocks: true,
  },
});
