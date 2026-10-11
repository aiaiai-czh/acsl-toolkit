#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runTests } from '@vscode/test-electron';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

await runTests({
  version: process.env.VSCODE_TEST_VERSION?.trim() || 'stable',
  extensionDevelopmentPath: repositoryRoot,
  extensionTestsPath: path.join(
    repositoryRoot,
    'dist/test/integration/desktop/index.js',
  ),
  extensionTestsEnv: {
    ELECTRON_RUN_AS_NODE: undefined,
    VSCODE_CWD: undefined,
    VSCODE_ESM_ENTRYPOINT: undefined,
    VSCODE_HANDLES_SIGPIPE: undefined,
    VSCODE_HANDLES_UNCAUGHT_ERRORS: undefined,
    VSCODE_IPC_HOOK_CLI: undefined,
    VSCODE_L10N_BUNDLE_LOCATION: undefined,
    VSCODE_NLS_CONFIG: undefined,
    VSCODE_RECONNECTION_GRACE_TIME: undefined,
    VSCODE_WSL_EXT_LOCATION: undefined,
  },
  launchArgs: [
    path.join(repositoryRoot, 'test/integration/fixtures/workspace'),
    '--extensionDevelopmentKind=web',
    '--disable-gpu',
    '--disable-workspace-trust',
    '--disable-telemetry',
    '--skip-release-notes',
    '--skip-welcome',
  ],
});
