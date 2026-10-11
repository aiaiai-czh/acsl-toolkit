import { ACSL_CATALOG } from './catalog';
import { normalizeAcslPrefix, type AcslPrefix } from './prefix';

import type { AcslAnnotationKind } from '../context/acslContext';
import type { AcslCatalogEntry } from '../types/catalog';

export interface AcslCompletionSelection {
  readonly entries: readonly Readonly<AcslCatalogEntry>[];
  readonly isIncomplete: boolean;
}

const DEFAULT_SHORTLIST_LIMIT = 25;

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export function compareAcslEntries(
  left: Readonly<AcslCatalogEntry>,
  right: Readonly<AcslCatalogEntry>,
): number {
  return (
    left.priority - right.priority ||
    left.label.length - right.label.length ||
    compareText(left.label, right.label)
  );
}

function entryMatchesPrefix(
  entry: Readonly<AcslCatalogEntry>,
  prefix: AcslPrefix,
): boolean {
  const query = normalizeAcslPrefix(prefix.text);
  const label = normalizeAcslPrefix(entry.label);

  if (prefix.mode === 'backslash') {
    return entry.label.startsWith('\\') && label.startsWith(query);
  }

  if (query.length === 0) {
    return true;
  }

  if (entry.label.startsWith('\\')) {
    return false;
  }

  return [entry.label, ...(entry.aliases ?? [])].some((candidate) =>
    normalizeAcslPrefix(candidate).startsWith(query),
  );
}

export function selectAcslCompletionEntries(
  prefix: AcslPrefix,
  catalog: readonly Readonly<AcslCatalogEntry>[] = ACSL_CATALOG,
  shortlistLimit = DEFAULT_SHORTLIST_LIMIT,
): AcslCompletionSelection {
  const entries = catalog.filter((entry) => entryMatchesPrefix(entry, prefix));
  entries.sort(compareAcslEntries);

  const query = normalizeAcslPrefix(prefix.text);
  const useShortlist = query.length === 0 || prefix.text === '\\';

  return {
    entries: useShortlist ? entries.slice(0, shortlistLimit) : entries,
    isIncomplete: useShortlist,
  };
}

export function getAcslSortText(entry: Readonly<AcslCatalogEntry>): string {
  return `${entry.priority.toString().padStart(3, '0')}:${entry.label.length
    .toString()
    .padStart(3, '0')}:${entry.label}`;
}

export function getAcslFilterText(entry: Readonly<AcslCatalogEntry>): string {
  return [entry.label, ...(entry.aliases ?? [])].join(' ');
}

export function getAcslInsertText(
  entry: Readonly<AcslCatalogEntry>,
  hasFollowingSemicolon: boolean,
  annotationKind: AcslAnnotationKind = 'block',
): string {
  const sourceText = entry.snippetBody ?? entry.label;
  const text =
    annotationKind === 'line'
      ? sourceText.replace(/[ \t]*\r?\n[ \t]*/g, ' ')
      : sourceText;
  return hasFollowingSemicolon ? text.replace(/;$/, '') : text;
}

export function shouldConsumeFollowingSemicolon(
  entry: Readonly<AcslCatalogEntry>,
  hasFollowingSemicolon: boolean,
): boolean {
  const text = entry.snippetBody ?? entry.label;
  return (
    hasFollowingSemicolon &&
    entry.insertion === 'snippet' &&
    !text.endsWith(';')
  );
}
