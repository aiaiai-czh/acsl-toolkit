import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const readText = (relativePath) =>
  readFileSync(resolve(root, relativePath), 'utf8');
const manifest = JSON.parse(readText('package.json'));
const errors = [];

function fail(message) {
  errors.push(message);
}

function isPlaceholder(value) {
  return value
    .split(/[/:._-]+/u)
    .some((part) => /^(?:example|placeholder|replace(?:me)?|todo|your)$/iu.test(part));
}

function requireHttpsUrl(name, value) {
  if (typeof value !== 'string' || value.length === 0) {
    fail(`${name} is missing`);
    return undefined;
  }

  try {
    const url = new URL(value.replace(/^git\+/, ''));
    if (url.protocol !== 'https:') {
      fail(`${name} must use https`);
    }
    if (isPlaceholder(url.hostname) || isPlaceholder(url.pathname)) {
      fail(`${name} contains a placeholder`);
    }
    return url;
  } catch {
    fail(`${name} must be a valid URL`);
    return undefined;
  }
}

const expectedPublisher = process.env.EXPECTED_VSCODE_PUBLISHER?.trim();
if (expectedPublisher === undefined || expectedPublisher.length === 0) {
  fail('EXPECTED_VSCODE_PUBLISHER must contain the confirmed Marketplace publisher ID');
} else if (manifest.publisher !== expectedPublisher) {
  fail(
    `package.json publisher ${JSON.stringify(manifest.publisher)} does not match ` +
      `EXPECTED_VSCODE_PUBLISHER ${JSON.stringify(expectedPublisher)}`,
  );
}

if (typeof manifest.publisher !== 'string' || manifest.publisher.length === 0) {
  fail('package.json publisher is missing');
} else if (isPlaceholder(manifest.publisher)) {
  fail('package.json publisher contains a placeholder');
}

const repositoryValue =
  typeof manifest.repository === 'string'
    ? manifest.repository
    : manifest.repository?.url;
const repositoryUrl = requireHttpsUrl('package.json repository.url', repositoryValue);
const homepageUrl = requireHttpsUrl('package.json homepage', manifest.homepage);
const bugsUrl = requireHttpsUrl('package.json bugs.url', manifest.bugs?.url);

const expectedRepository = process.env.GITHUB_REPOSITORY?.trim().toLowerCase();
if (expectedRepository && repositoryUrl !== undefined) {
  const normalizedPath = repositoryUrl.pathname
    .replace(/^\//, '')
    .replace(/\.git$/, '')
    .toLowerCase();
  if (repositoryUrl.hostname !== 'github.com' || normalizedPath !== expectedRepository) {
    fail(
      `package.json repository does not match GITHUB_REPOSITORY ${JSON.stringify(
        process.env.GITHUB_REPOSITORY,
      )}`,
    );
  }
}

if (repositoryUrl !== undefined) {
  const repositoryRoot = `https://${repositoryUrl.hostname}${repositoryUrl.pathname.replace(
    /\.git$/,
    '',
  )}`;
  for (const [name, url] of [
    ['package.json homepage', homepageUrl],
    ['package.json bugs.url', bugsUrl],
  ]) {
    if (url !== undefined && !url.href.startsWith(repositoryRoot)) {
      fail(`${name} must point to the public source repository`);
    }
  }
}

if (typeof manifest.icon !== 'string' || !manifest.icon.endsWith('.png')) {
  fail('package.json icon must reference a PNG file');
} else {
  const iconPath = resolve(root, manifest.icon);
  if (!existsSync(iconPath)) {
    fail(`icon file does not exist: ${manifest.icon}`);
  } else {
    const icon = readFileSync(iconPath);
    const pngSignature = '89504e470d0a1a0a';
    if (icon.length < 24 || icon.subarray(0, 8).toString('hex') !== pngSignature) {
      fail(`icon is not a valid PNG: ${manifest.icon}`);
    } else {
      const width = icon.readUInt32BE(16);
      const height = icon.readUInt32BE(20);
      if (width < 128 || height < 128 || width !== height) {
        fail(`icon must be square and at least 128x128 pixels; found ${width}x${height}`);
      }
    }
  }
}

const changelog = readText('CHANGELOG.md');
const escapedVersion = manifest.version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const datedVersionHeading = new RegExp(
  `^## \\[${escapedVersion}\\] - \\d{4}-\\d{2}-\\d{2}$`,
  'm',
);
if (!datedVersionHeading.test(changelog)) {
  fail(
    `CHANGELOG.md must contain a dated "## [${manifest.version}] - YYYY-MM-DD" heading`,
  );
}

const requiredFiles = [
  'README.md',
  'README.zh-CN.md',
  'CHANGELOG.md',
  'CONTRIBUTING.md',
  'SUPPORT.md',
  'SECURITY.md',
  'LICENSE',
  'THIRD_PARTY_NOTICES.md',
];
for (const relativePath of requiredFiles) {
  if (!existsSync(resolve(root, relativePath))) {
    fail(`required public file is missing: ${relativePath}`);
  }
}

const publicTextFiles = requiredFiles.filter(
  (path) => path.endsWith('.md') && existsSync(resolve(root, path)),
);
const privatePathPatterns = [
  /\/home\/[A-Za-z0-9._-]+\//,
  /\/Users\/[A-Za-z0-9._-]+\//,
  /[A-Za-z]:\\Users\\[^\\]+\\/,
];
for (const relativePath of publicTextFiles) {
  const content = readText(relativePath);
  for (const pattern of privatePathPatterns) {
    if (pattern.test(content)) {
      fail(`${relativePath} contains a local absolute path`);
      break;
    }
  }
}

const readme = readText('README.md');
for (const developmentCommand of ['npm ci', 'npm run package', 'xvfb-run']) {
  if (readme.includes(developmentCommand)) {
    fail(`README.md contains developer-only command: ${developmentCommand}`);
  }
}

const gitignore = readText('.gitignore');
for (const pattern of ['/AGENTS.md', '/.agents/', '/.aws/', '/.codex/']) {
  if (!gitignore.split(/\r?\n/u).includes(pattern)) {
    fail(`.gitignore must exclude local-only path: ${pattern}`);
  }
}

const vscodeignore = readText('.vscodeignore');
for (const pattern of ['AGENTS.md', 'CONTRIBUTING.md', 'SECURITY.md']) {
  if (!vscodeignore.split(/\r?\n/u).includes(pattern)) {
    fail(`.vscodeignore must exclude developer-only path: ${pattern}`);
  }
}

if (manifest.scripts?.package?.includes('--allow-missing-repository')) {
  fail('package script must not bypass missing repository metadata');
}

if (errors.length > 0) {
  console.error('Release metadata validation failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    `Release metadata is ready for ${manifest.publisher}.${manifest.name} ${manifest.version}.`,
  );
}
