import {
  scanCSourceAtOffset,
  type CLexicalScanResult,
} from './cLexicalScanner';

export type AcslAnnotationKind = 'block' | 'line';

export interface AcslContext {
  readonly kind: AcslAnnotationKind;
  readonly annotationStart: number;
  readonly contentStart: number;
  readonly cursorOffset: number;
}

function toAcslContext(
  scan: CLexicalScanResult,
  cursorOffset: number,
): AcslContext | undefined {
  if (
    (scan.state !== 'acslBlock' && scan.state !== 'acslLine') ||
    scan.annotationStart === undefined ||
    scan.contentStart === undefined
  ) {
    return undefined;
  }

  return {
    kind: scan.state === 'acslBlock' ? 'block' : 'line',
    annotationStart: scan.annotationStart,
    contentStart: scan.contentStart,
    cursorOffset,
  };
}

/**
 * Returns ACSL annotation metadata when `cursorOffset` is inside ACSL content.
 * Returns `undefined` for C/C++ code, ordinary comments, and literals.
 */
export function scanAcslContext(
  text: string,
  cursorOffset: number,
): AcslContext | undefined {
  return toAcslContext(scanCSourceAtOffset(text, cursorOffset), cursorOffset);
}

export function isInAcslAnnotation(
  text: string,
  cursorOffset: number,
): boolean {
  return scanAcslContext(text, cursorOffset) !== undefined;
}
