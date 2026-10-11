# Extension integration tests

The shared suite exercises the public VS Code completion command rather than
calling provider implementation details. Both runners open the fixture
workspace in `fixtures/workspace` and verify that:

- C and C++ documents keep their existing language IDs;
- ACSL completion is available inside block and line annotations;
- ordinary code and ordinary comments do not receive ACSL candidates;
- VS Code's built-in line-comment action inserts `//` inside a block annotation,
  suppresses ACSL completion on that clause, and restores it when toggled again;
  and
- an `untitled:` document works, proving that the provider is not restricted to
  the `file:` URI scheme.

## Build contract

The browser extension and its tests must be bundled for a Web Worker. The
build should produce these test entry points:

```text
dist/test/integration/desktop/index.js
dist/test/integration/web/index.js
```

Bundle each `index.ts` and all of its imports into one CommonJS file with
`vscode` externalized. Both runner bundles include `mocha/mocha`; they should
define `global` as `globalThis`, matching the VS Code web-extension esbuild
guidance. The desktop `index.js` supports both the checked-in debug launch
config and the `@vscode/test-electron` runner.

The desktop suite is launched by `scripts/run-desktop-tests.mjs`. The browser
suite is run with a command equivalent to:

```sh
vscode-test-web --quality=stable --browser=chromium --extensionDevelopmentPath=. --extensionTestsPath=dist/test/integration/web/index.js test/integration/fixtures/workspace
```

Set `VSCODE_TEST_VERSION` to test a specific desktop VS Code release; otherwise
the desktop configuration uses `stable`.
