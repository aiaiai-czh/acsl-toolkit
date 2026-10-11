import { context } from 'esbuild';

const watch = process.argv.includes('--watch');
const extensionOnly = process.argv.includes('--extension-only');
const testsOnly = process.argv.includes('--tests-only');
const production = process.env.NODE_ENV === 'production';

const shared = {
  bundle: true,
  external: ['vscode'],
  format: 'cjs',
  logLevel: 'info',
  minify: production,
  platform: 'browser',
  sourcemap: production || extensionOnly ? false : 'linked',
  target: 'es2022',
};

const builds = [];

if (!testsOnly) {
  builds.push(
    context({
      ...shared,
      entryPoints: ['src/extension.ts'],
      outfile: 'dist/extension.js',
    }),
  );
}

if (!extensionOnly) {
  builds.push(
    context({
      ...shared,
      define: { global: 'globalThis' },
      entryPoints: ['test/integration/desktop/index.ts'],
      outfile: 'dist/test/integration/desktop/index.js',
    }),
    context({
      ...shared,
      define: { global: 'globalThis' },
      entryPoints: ['test/integration/web/index.ts'],
      outfile: 'dist/test/integration/web/index.js',
    }),
  );
}

const contexts = await Promise.all(builds);

if (watch) {
  await Promise.all(contexts.map((buildContext) => buildContext.watch()));
  console.log('Watching ACSL Toolkit bundles...');
} else {
  try {
    await Promise.all(contexts.map((buildContext) => buildContext.rebuild()));
  } finally {
    await Promise.all(contexts.map((buildContext) => buildContext.dispose()));
  }
}
