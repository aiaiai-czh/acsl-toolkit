import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

export const CATALOG_PATHS = [
  'data/acsl/1.24/clauses.json',
  'data/acsl/1.24/keywords.json',
  'data/acsl/1.24/builtins.json',
  'data/acsl/1.24/multiword.json',
];

export const SNIPPET_PATH = 'data/acsl/1.24/snippets.json';
export const VERSIONS_PATH = 'data/acsl/versions.json';

const CATEGORIES = new Set([
  'clause',
  'keyword',
  'logic-type',
  'builtin-term',
  'builtin-function',
  'builtin-predicate',
  'multiword',
]);

const REQUIRED_LABELS = [
  'requires',
  'ensures',
  'assigns',
  'assert',
  'writes',
  'loop invariant',
  'loop assigns',
  'loop variant',
  'complete behaviors',
  'disjoint behaviors',
  '\\result',
  '\\old',
  '\\at',
  '\\valid',
  '\\valid_read',
  '\\initialized',
  '\\separated',
  '\\forall',
  '\\exists',
];

async function readJson(relativePath) {
  const absolutePath = path.join(REPOSITORY_ROOT, relativePath);
  return JSON.parse(await readFile(absolutePath, 'utf8'));
}

export async function loadCatalogData() {
  const [versions, snippetDocument, ...catalogDocuments] = await Promise.all([
    readJson(VERSIONS_PATH),
    readJson(SNIPPET_PATH),
    ...CATALOG_PATHS.map(readJson),
  ]);

  return { versions, snippetDocument, catalogDocuments };
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isOfficialSourceUrl(value) {
  return (
    isNonEmptyString(value) &&
    value.startsWith('https://github.com/acsl-language/acsl/') &&
    value.includes('/1.24')
  );
}

function validateSource(source, location, errors) {
  if (source === null || typeof source !== 'object') {
    errors.push(`${location}: missing source metadata`);
    return;
  }

  if (source.version !== '1.24' || source.tag !== '1.24') {
    errors.push(`${location}: source must target ACSL tag 1.24`);
  }
  if (source.commit !== '585d28a206a7f7b06987292153cc02ca16b670ba') {
    errors.push(`${location}: unexpected ACSL 1.24 commit`);
  }
  if (source.license !== 'CC-BY-4.0') {
    errors.push(`${location}: source license must be CC-BY-4.0`);
  }
  if (!isOfficialSourceUrl(source.url)) {
    errors.push(`${location}: source URL must identify the official 1.24 repository`);
  }
}

function validateEntry(entry, location, ids, labels, errors) {
  if (entry === null || typeof entry !== 'object') {
    errors.push(`${location}: entry must be an object`);
    return;
  }

  if (!isNonEmptyString(entry.id) || !/^[a-z][a-z0-9.-]+$/.test(entry.id)) {
    errors.push(`${location}: invalid id`);
  } else if (ids.has(entry.id)) {
    errors.push(`${location}: duplicate id ${entry.id}`);
  } else {
    ids.add(entry.id);
  }

  if (!isNonEmptyString(entry.label)) {
    errors.push(`${location}: missing label`);
  } else if (labels.has(entry.label)) {
    errors.push(`${location}: duplicate label ${entry.label}`);
  } else {
    labels.add(entry.label);
  }

  if (!CATEGORIES.has(entry.category)) {
    errors.push(`${location}: unsupported category ${String(entry.category)}`);
  }
  if (!isNonEmptyString(entry.detail) || !entry.detail.startsWith('ACSL 1.24 · ')) {
    errors.push(`${location}: detail must start with "ACSL 1.24 · "`);
  }
  if (!isNonEmptyString(entry.documentation)) {
    errors.push(`${location}: missing documentation`);
  }
  if (!Number.isInteger(entry.priority) || entry.priority < 0 || entry.priority > 999) {
    errors.push(`${location}: priority must be an integer from 0 through 999`);
  }
  if (entry.insertion !== 'plain') {
    errors.push(`${location}: base catalog entries must use plain insertion`);
  }
  if (entry.category === 'multiword' && !entry.label?.includes(' ')) {
    errors.push(`${location}: multiword labels must contain whitespace`);
  }
  if (entry.category !== 'multiword' && entry.label?.includes(' ')) {
    errors.push(`${location}: only multiword entries may contain whitespace`);
  }
  if (entry.aliases !== undefined) {
    if (
      !Array.isArray(entry.aliases) ||
      entry.aliases.some((alias) => !isNonEmptyString(alias)) ||
      new Set(entry.aliases).size !== entry.aliases.length
    ) {
      errors.push(`${location}: aliases must be unique non-empty strings`);
    }
  }

  if (entry.spec === null || typeof entry.spec !== 'object') {
    errors.push(`${location}: missing specification reference`);
  } else {
    if (entry.spec.version !== '1.24') {
      errors.push(`${location}: specification version must be 1.24`);
    }
    if (!isNonEmptyString(entry.spec.section)) {
      errors.push(`${location}: missing specification section`);
    }
    if (!isOfficialSourceUrl(entry.spec.sourceUrl)) {
      errors.push(`${location}: specification URL must identify official 1.24 sources`);
    }
  }
}

function validateSnippet(snippet, location, entriesById, snippetIds, errors) {
  if (snippet === null || typeof snippet !== 'object') {
    errors.push(`${location}: snippet must be an object`);
    return;
  }
  if (!entriesById.has(snippet.entryId)) {
    errors.push(`${location}: unknown entry id ${String(snippet.entryId)}`);
  } else if (snippetIds.has(snippet.entryId)) {
    errors.push(`${location}: duplicate snippet for ${snippet.entryId}`);
  } else {
    snippetIds.add(snippet.entryId);
  }
  if (!isNonEmptyString(snippet.body) || !isNonEmptyString(snippet.description)) {
    errors.push(`${location}: body and description are required`);
    return;
  }

  const entry = entriesById.get(snippet.entryId);
  if (entry !== undefined && !snippet.body.startsWith(entry.label)) {
    errors.push(`${location}: body must start with catalog label ${entry.label}`);
  }
  if (
    entry?.category === 'builtin-function' &&
    !snippet.body.startsWith(`${entry.label}(`)
  ) {
    errors.push(`${location}: built-in function snippet must start with ${entry.label}(`);
  }
  if (entry?.category === 'builtin-function' && snippet.body.endsWith(';')) {
    errors.push(`${location}: built-in function snippet must not end with a semicolon`);
  }

  const placeholders = [...snippet.body.matchAll(/\$\{([1-9][0-9]*):[^}]+\}/g)].map(
    (match) => Number(match[1]),
  );
  if (placeholders.length === 0) {
    errors.push(`${location}: snippet requires at least one named placeholder`);
  } else {
    const unique = [...new Set(placeholders)].sort((left, right) => left - right);
    if (unique.some((value, index) => value !== index + 1)) {
      errors.push(`${location}: placeholder numbers must be contiguous from 1`);
    }
  }
}

export function validateCatalogData({ versions, catalogDocuments, snippetDocument }) {
  const errors = [];
  const ids = new Set();
  const labels = new Set();
  const entriesById = new Map();

  if (versions?.defaultVersion !== '1.24') {
    errors.push(`${VERSIONS_PATH}: defaultVersion must be 1.24`);
  }
  const version = versions?.versions?.find((candidate) => candidate.version === '1.24');
  if (version === undefined) {
    errors.push(`${VERSIONS_PATH}: missing ACSL 1.24 metadata`);
  } else {
    if (version.tag !== '1.24') errors.push(`${VERSIONS_PATH}: tag must be 1.24`);
    if (version.commit !== '585d28a206a7f7b06987292153cc02ca16b670ba') {
      errors.push(`${VERSIONS_PATH}: unexpected ACSL 1.24 commit`);
    }
    if (version.license !== 'CC-BY-4.0') {
      errors.push(`${VERSIONS_PATH}: license must be CC-BY-4.0`);
    }
    if (!isOfficialSourceUrl(version.sourceUrl)) {
      errors.push(`${VERSIONS_PATH}: sourceUrl must identify official 1.24 sources`);
    }
  }

  catalogDocuments.forEach((document, documentIndex) => {
    const documentPath = CATALOG_PATHS[documentIndex];
    if (document?.version !== '1.24') {
      errors.push(`${documentPath}: version must be 1.24`);
    }
    validateSource(document?.source, documentPath, errors);
    if (!Array.isArray(document?.entries) || document.entries.length === 0) {
      errors.push(`${documentPath}: entries must be a non-empty array`);
      return;
    }
    document.entries.forEach((entry, entryIndex) => {
      const location = `${documentPath}#entries[${entryIndex}]`;
      validateEntry(entry, location, ids, labels, errors);
      if (entry?.id !== undefined) entriesById.set(entry.id, entry);
    });
  });

  for (const label of REQUIRED_LABELS) {
    if (!labels.has(label)) errors.push(`catalog: missing required label ${label}`);
  }

  if (snippetDocument?.version !== '1.24') {
    errors.push(`${SNIPPET_PATH}: version must be 1.24`);
  }
  validateSource(snippetDocument?.source, SNIPPET_PATH, errors);
  if (!Array.isArray(snippetDocument?.snippets) || snippetDocument.snippets.length === 0) {
    errors.push(`${SNIPPET_PATH}: snippets must be a non-empty array`);
  } else {
    const snippetIds = new Set();
    snippetDocument.snippets.forEach((snippet, snippetIndex) =>
      validateSnippet(
        snippet,
        `${SNIPPET_PATH}#snippets[${snippetIndex}]`,
        entriesById,
        snippetIds,
        errors,
      ),
    );
    for (const entry of entriesById.values()) {
      if (entry.category === 'builtin-function' && !snippetIds.has(entry.id)) {
        errors.push(`${SNIPPET_PATH}: missing built-in function snippet for ${entry.id}`);
      }
    }
  }

  return {
    errors,
    entries: [...entriesById.values()],
    snippets: snippetDocument?.snippets ?? [],
  };
}
