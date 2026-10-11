import builtinsData from '../../data/acsl/1.24/builtins.json';
import clausesData from '../../data/acsl/1.24/clauses.json';
import keywordsData from '../../data/acsl/1.24/keywords.json';
import multiwordData from '../../data/acsl/1.24/multiword.json';
import snippetsData from '../../data/acsl/1.24/snippets.json';
import versionsData from '../../data/acsl/versions.json';

import type {
  AcslCatalogDocument,
  AcslCatalogEntry,
  AcslSnippetDocument,
  AcslVersionMetadata,
  AcslVersionsDocument,
} from '../types/catalog';

const catalogDocuments = [
  clausesData,
  keywordsData,
  builtinsData,
  multiwordData,
] as unknown as readonly AcslCatalogDocument[];

const snippetDocument = snippetsData as unknown as AcslSnippetDocument;
const versionsDocument = versionsData as unknown as AcslVersionsDocument;

export const ACSL_VERSION = versionsDocument.defaultVersion;

const versionMetadata = versionsDocument.versions.find(
  ({ version }) => version === ACSL_VERSION,
);

if (versionMetadata === undefined) {
  throw new Error(`Missing metadata for the default ACSL version ${ACSL_VERSION}.`);
}

export const ACSL_VERSION_METADATA: Readonly<AcslVersionMetadata> = Object.freeze({
  ...versionMetadata,
});

const snippetsByEntryId = new Map(
  snippetDocument.snippets.map((snippet) => [snippet.entryId, snippet] as const),
);

const seenIds = new Set<string>();
const seenLabels = new Set<string>();

function materializeEntry(entry: AcslCatalogEntry): Readonly<AcslCatalogEntry> {
  if (seenIds.has(entry.id)) {
    throw new Error(`Duplicate ACSL catalog id: ${entry.id}`);
  }
  if (seenLabels.has(entry.label)) {
    throw new Error(`Duplicate ACSL catalog label: ${entry.label}`);
  }

  seenIds.add(entry.id);
  seenLabels.add(entry.label);

  const snippet = snippetsByEntryId.get(entry.id);
  if (snippet !== undefined) {
    snippetsByEntryId.delete(entry.id);
  }

  const immutableEntry: AcslCatalogEntry = {
    ...entry,
    ...(entry.aliases === undefined
      ? {}
      : { aliases: Object.freeze([...entry.aliases]) }),
    spec: Object.freeze({ ...entry.spec }),
    insertion: snippet === undefined ? 'plain' : 'snippet',
    ...(snippet === undefined ? {} : { snippetBody: snippet.body }),
  };

  return Object.freeze(immutableEntry);
}

export const ACSL_CATALOG: readonly Readonly<AcslCatalogEntry>[] = Object.freeze(
  catalogDocuments.flatMap(({ entries }) => entries.map(materializeEntry)),
);

if (snippetsByEntryId.size > 0) {
  throw new Error(
    `Unknown ACSL snippet entry ids: ${[...snippetsByEntryId.keys()].join(', ')}`,
  );
}

export const ACSL_CATALOG_BY_ID: ReadonlyMap<string, Readonly<AcslCatalogEntry>> =
  new Map(ACSL_CATALOG.map((entry) => [entry.id, entry]));

export function getAcslCatalog(): readonly Readonly<AcslCatalogEntry>[] {
  return ACSL_CATALOG;
}

export function getAcslCatalogEntry(
  id: string,
): Readonly<AcslCatalogEntry> | undefined {
  return ACSL_CATALOG_BY_ID.get(id);
}

export function getAcslCatalogByCategory(
  category: AcslCatalogEntry['category'],
): readonly Readonly<AcslCatalogEntry>[] {
  return ACSL_CATALOG.filter((entry) => entry.category === category);
}
