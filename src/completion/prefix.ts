import { ACSL_CATALOG } from './catalog';

import type { AcslCatalogEntry } from '../types/catalog';

export type AcslPrefixMode = 'word' | 'backslash' | 'multiword';

export interface AcslPrefix {
  readonly text: string;
  readonly startOffset: number;
  readonly endOffset: number;
  readonly mode: AcslPrefixMode;
}

type PartialAcslPrefix = Omit<AcslPrefix, 'endOffset'>;

const BACKSLASH_PREFIX = /\\(?:[A-Za-z_][A-Za-z0-9_]*)?$/;
const TRAILING_WORDS =
  /[A-Za-z_][A-Za-z0-9_]*(?:[ \t]+[A-Za-z_][A-Za-z0-9_]*){0,2}$/;
const WORD = /[A-Za-z_][A-Za-z0-9_]*/g;

export function normalizeAcslPrefix(text: string): string {
  return text.trim().replace(/[ \t]+/g, ' ').toLowerCase();
}

function lineStartOffset(text: string, cursorOffset: number): number {
  return Math.max(
    text.lastIndexOf('\n', cursorOffset - 1),
    text.lastIndexOf('\r', cursorOffset - 1),
  ) + 1;
}

function multiwordForms(
  catalog: readonly Readonly<AcslCatalogEntry>[],
): readonly string[] {
  return catalog
    .filter(({ category }) => category === 'multiword')
    .flatMap(({ label, aliases = [] }) => [label, ...aliases])
    .map(normalizeAcslPrefix);
}

function replacementEndOffset(
  text: string,
  cursorOffset: number,
  prefix: PartialAcslPrefix,
  catalog: readonly Readonly<AcslCatalogEntry>[],
): number {
  if (prefix.text.length === 0) {
    return cursorOffset;
  }

  if (prefix.mode !== 'multiword') {
    let endOffset = cursorOffset;
    while (/[A-Za-z0-9_]/.test(text[endOffset] ?? '')) {
      endOffset += 1;
    }
    return endOffset;
  }

  const forms = multiwordForms(catalog);
  let candidateEnd = cursorOffset;
  let lastNonWhitespaceMatch = cursorOffset;

  while (candidateEnd < text.length) {
    const character = text[candidateEnd];
    if (character === undefined || !/[A-Za-z0-9_ \t]/.test(character)) {
      break;
    }

    candidateEnd += 1;
    const candidate = normalizeAcslPrefix(
      text.slice(prefix.startOffset, candidateEnd),
    );
    if (!forms.some((form) => form.startsWith(candidate))) {
      break;
    }

    if (!/[ \t]/.test(character)) {
      lastNonWhitespaceMatch = candidateEnd;
    }
  }

  return lastNonWhitespaceMatch;
}

function validatesOffsets(
  text: string,
  cursorOffset: number,
  contentStart: number,
): void {
  if (!Number.isInteger(cursorOffset) || !Number.isInteger(contentStart)) {
    throw new TypeError('cursorOffset and contentStart must be integers');
  }
  if (
    contentStart < 0 ||
    cursorOffset < contentStart ||
    cursorOffset > text.length
  ) {
    throw new RangeError('Expected 0 <= contentStart <= cursorOffset <= text.length');
  }
}

/**
 * Extracts the replaceable ACSL prefix immediately before the cursor.
 * Prefixes never cross a line boundary or the opening annotation marker.
 */
export function extractAcslPrefix(
  text: string,
  cursorOffset: number,
  contentStart: number,
  catalog: readonly Readonly<AcslCatalogEntry>[] = ACSL_CATALOG,
): AcslPrefix {
  validatesOffsets(text, cursorOffset, contentStart);

  const scanStart = Math.max(contentStart, lineStartOffset(text, cursorOffset));
  const linePrefix = text.slice(scanStart, cursorOffset);
  const finish = (prefix: PartialAcslPrefix): AcslPrefix => ({
    ...prefix,
    endOffset: replacementEndOffset(text, cursorOffset, prefix, catalog),
  });
  const backslashMatch = BACKSLASH_PREFIX.exec(linePrefix);

  if (backslashMatch !== null) {
    return finish({
      text: backslashMatch[0],
      startOffset: scanStart + backslashMatch.index,
      mode: 'backslash',
    });
  }

  const trailingWhitespace = /[ \t]*$/.exec(linePrefix)?.[0] ?? '';
  const withoutTrailingWhitespace = linePrefix.slice(
    0,
    linePrefix.length - trailingWhitespace.length,
  );
  const trailingWords = TRAILING_WORDS.exec(withoutTrailingWhitespace);

  if (trailingWords === null) {
    return finish({ text: '', startOffset: cursorOffset, mode: 'word' });
  }

  const words = [...trailingWords[0].matchAll(WORD)];
  const forms = multiwordForms(catalog);

  for (let wordIndex = 0; wordIndex < words.length; wordIndex += 1) {
    const word = words[wordIndex];
    if (word === undefined || words.length - wordIndex > 3) {
      continue;
    }

    const localStart = word.index;
    const candidate = `${trailingWords[0].slice(localStart)}${trailingWhitespace}`;
    const normalized = normalizeAcslPrefix(candidate);
    if (
      normalized.length > 0 &&
      forms.some((form) => form.startsWith(normalized))
    ) {
      return finish({
        text: candidate,
        startOffset: scanStart + trailingWords.index + localStart,
        mode: 'multiword',
      });
    }
  }

  if (trailingWhitespace.length > 0) {
    return finish({ text: '', startOffset: cursorOffset, mode: 'word' });
  }

  const lastWord = words.at(-1);
  if (lastWord === undefined) {
    return finish({ text: '', startOffset: cursorOffset, mode: 'word' });
  }

  return finish({
    text: lastWord[0],
    startOffset: scanStart + trailingWords.index + lastWord.index,
    mode: 'word',
  });
}
