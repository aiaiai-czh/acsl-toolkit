import { PackageManager, listFiles } from '@vscode/vsce';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

const expectedFiles = [
  'CHANGELOG.md',
  'LICENSE',
  'README.md',
  'SUPPORT.md',
  'THIRD_PARTY_NOTICES.md',
  'dist/extension.js',
  'images/icon.png',
  'package.json',
  'syntaxes/acsl-injection.tmLanguage.json',
  'syntaxes/acsl-language-configuration.json',
  'syntaxes/acsl.tmLanguage.json',
].sort();

const actualFiles = (await listFiles({
  cwd: root,
  packageManager: PackageManager.None,
}))
  .map((file) => file.replaceAll('\\', '/'))
  .sort();

const missing = expectedFiles.filter((file) => !actualFiles.includes(file));
const unexpected = actualFiles.filter((file) => !expectedFiles.includes(file));

if (missing.length > 0 || unexpected.length > 0) {
  console.error('VSIX content allowlist validation failed.');
  if (missing.length > 0) {
    console.error(`Missing files: ${missing.join(', ')}`);
  }
  if (unexpected.length > 0) {
    console.error(`Unexpected files: ${unexpected.join(', ')}`);
  }
  process.exitCode = 1;
} else {
  console.log(`VSIX content allowlist validated (${actualFiles.length} files).`);
}
