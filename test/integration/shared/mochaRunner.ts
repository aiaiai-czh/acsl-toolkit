import 'mocha/mocha';

import { registerCompletionIntegrationSuite } from './completionSuite';

mocha.setup({
  ui: 'tdd',
  reporter: undefined,
});

registerCompletionIntegrationSuite();

/** Browser-safe entry point used by VS Code's extension-test harnesses. */
export function run(): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      mocha.run((failures) => {
        if (failures === 0) {
          resolve();
          return;
        }

        reject(new Error(`${failures} integration test(s) failed.`));
      });
    } catch (error) {
      console.error(error);
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}
