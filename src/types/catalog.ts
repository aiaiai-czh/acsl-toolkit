export const ACSL_CATALOG_CATEGORIES = [
  'clause',
  'keyword',
  'logic-type',
  'builtin-term',
  'builtin-function',
  'builtin-predicate',
  'multiword',
] as const;

export type AcslCatalogCategory = (typeof ACSL_CATALOG_CATEGORIES)[number];

export type AcslInsertionKind = 'plain' | 'snippet';

export interface AcslSpecReference {
  version: string;
  section: string;
  sourceUrl: string;
}

export interface AcslCatalogEntry {
  id: string;
  label: string;
  category: AcslCatalogCategory;
  detail: string;
  documentation: string;
  priority: number;
  insertion: AcslInsertionKind;
  snippetBody?: string;
  aliases?: readonly string[];
  introducedIn?: string;
  removedIn?: string;
  spec: AcslSpecReference;
}

export interface AcslCatalogSource {
  title: string;
  version: string;
  tag: string;
  commit: string;
  license: 'CC-BY-4.0';
  url: string;
}

export interface AcslCatalogDocument {
  version: string;
  source: AcslCatalogSource;
  entries: readonly AcslCatalogEntry[];
}

export interface AcslSnippetDefinition {
  entryId: string;
  body: string;
  description: string;
}

export interface AcslSnippetDocument {
  version: string;
  source: AcslCatalogSource;
  snippets: readonly AcslSnippetDefinition[];
}

export interface AcslVersionMetadata {
  version: string;
  release: string;
  tag: string;
  commit: string;
  releaseDate: string;
  sourceUrl: string;
  license: 'CC-BY-4.0';
  licenseUrl: string;
}

export interface AcslVersionsDocument {
  defaultVersion: string;
  versions: readonly AcslVersionMetadata[];
}
