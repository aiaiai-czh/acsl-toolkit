/**
 * The lexical states that matter when deciding whether a cursor is in ACSL.
 *
 * This intentionally is not a C/C++ parser. It only models constructs that can
 * hide comment delimiters, plus the two ACSL annotation delimiters.
 */
export type CLexicalState =
  | 'code'
  | 'lineComment'
  | 'blockComment'
  | 'string'
  | 'char'
  | 'rawString'
  | 'acslLine'
  | 'acslBlock'
  | 'acslInnerLineComment'
  | 'acslString'
  | 'acslChar';

export interface CLexicalScanResult {
  readonly state: CLexicalState;
  readonly annotationStart: number | undefined;
  readonly contentStart: number | undefined;
}

/** A half-open ACSL content range, excluding its opening and closing markers. */
export interface AcslAnnotationRange {
  readonly kind: 'block' | 'line';
  readonly annotationStart: number;
  readonly contentStart: number;
  readonly contentEnd: number;
}

interface RawStringStart {
  readonly end: number;
  readonly terminator: string;
}

const RAW_STRING_PREFIXES = ['u8R"', 'uR"', 'UR"', 'LR"', 'R"'] as const;
const IDENTIFIER_CONTINUATION = /[A-Za-z0-9_$]/;

function isLineBreak(character: string | undefined): boolean {
  return character === '\r' || character === '\n';
}

function consumeLineBreak(text: string, offset: number): number {
  return text[offset] === '\r' && text[offset + 1] === '\n'
    ? offset + 2
    : offset + 1;
}

function isValidRawDelimiter(delimiter: string): boolean {
  if (delimiter.length > 16) {
    return false;
  }

  // C++ d-char excludes whitespace, parentheses, and backslash.
  return !/[\s()\\]/.test(delimiter);
}

function tryReadRawStringStart(
  text: string,
  offset: number,
): RawStringStart | undefined {
  if (offset > 0 && IDENTIFIER_CONTINUATION.test(text[offset - 1] ?? '')) {
    return undefined;
  }

  for (const prefix of RAW_STRING_PREFIXES) {
    if (!text.startsWith(prefix, offset)) {
      continue;
    }

    const delimiterStart = offset + prefix.length;
    const delimiterEnd = text.indexOf('(', delimiterStart);
    if (delimiterEnd === -1) {
      return undefined;
    }

    const delimiter = text.slice(delimiterStart, delimiterEnd);
    if (!isValidRawDelimiter(delimiter)) {
      return undefined;
    }

    return {
      end: delimiterEnd + 1,
      terminator: `)${delimiter}"`,
    };
  }

  return undefined;
}

function consumeEscapedCharacter(text: string, offset: number): number {
  const nextOffset = offset + 1;
  if (text[nextOffset] === '\r' && text[nextOffset + 1] === '\n') {
    return offset + 3;
  }

  return Math.min(offset + 2, text.length);
}

/**
 * Scans C/C++ source through `cursorOffset` and returns the lexical state at
 * that position. Offsets use JavaScript UTF-16 code units, matching VS Code.
 *
 * Delimiters are treated atomically: a completed `/*@` or `//@` starts ACSL
 * content, while a cursor inside either opening marker is not yet in ACSL.
 */
export function scanCSourceAtOffset(
  text: string,
  cursorOffset: number,
): CLexicalScanResult {
  if (!Number.isInteger(cursorOffset)) {
    throw new TypeError('cursorOffset must be an integer');
  }

  if (cursorOffset < 0 || cursorOffset > text.length) {
    throw new RangeError(
      `cursorOffset must be between 0 and ${text.length}, received ${cursorOffset}`,
    );
  }

  return scanCSource(text, cursorOffset);
}

/**
 * Enumerates genuine ACSL annotations in one lexical pass. The same scanner
 * used for cursor detection excludes markers hidden by C/C++ literals and
 * ordinary comments. An unfinished annotation extends through EOF.
 */
export function collectAcslAnnotationRanges(
  text: string,
): readonly AcslAnnotationRange[] {
  const annotations: AcslAnnotationRange[] = [];
  scanCSource(text, text.length, (annotation) => annotations.push(annotation));
  return annotations;
}

function scanCSource(
  text: string,
  cursorOffset: number,
  onAnnotation?: (annotation: AcslAnnotationRange) => void,
): CLexicalScanResult {
  let state: CLexicalState = 'code';
  let offset = 0;
  let annotationStart: number | undefined;
  let contentStart: number | undefined;
  let rawStringTerminator = '';
  let acslContainer: 'acslBlock' | 'acslLine' | undefined;

  function endAnnotation(contentEnd: number): void {
    // This helper is called only while an ACSL container is open, so both
    // offsets are present even when its content is a string or inner comment.
    onAnnotation?.({
      kind: acslContainer === 'acslBlock' ? 'block' : 'line',
      annotationStart: annotationStart as number,
      contentStart: contentStart as number,
      contentEnd,
    });
    state = 'code';
    acslContainer = undefined;
    annotationStart = undefined;
    contentStart = undefined;
  }

  while (offset < cursorOffset) {
    switch (state) {
      case 'code': {
        const character = text[offset];

        if (character === '/') {
          const nextCharacter = text[offset + 1];
          const startsBlockComment = nextCharacter === '*';
          const startsLineComment = nextCharacter === '/';

          if (
            (startsBlockComment || startsLineComment) &&
            text[offset + 2] === '@'
          ) {
            if (cursorOffset < offset + 3) {
              offset = cursorOffset;
              break;
            }

            acslContainer = startsBlockComment ? 'acslBlock' : 'acslLine';
            state = acslContainer;
            annotationStart = offset;
            contentStart = offset + 3;
            offset += 3;
            break;
          }

          if (startsBlockComment) {
            state = 'blockComment';
            offset += 2;
            break;
          }

          if (startsLineComment) {
            state = 'lineComment';
            offset += 2;
            break;
          }
        }

        if (
          character === 'R' ||
          character === 'u' ||
          character === 'U' ||
          character === 'L'
        ) {
          const rawString = tryReadRawStringStart(text, offset);
          if (rawString !== undefined) {
            state = 'rawString';
            rawStringTerminator = rawString.terminator;
            offset = rawString.end;
            break;
          }
        }

        if (character === '"') {
          state = 'string';
        } else if (character === "'") {
          state = 'char';
        }
        offset += 1;
        break;
      }

      case 'lineComment':
        if (isLineBreak(text[offset])) {
          state = 'code';
          offset = consumeLineBreak(text, offset);
        } else {
          offset += 1;
        }
        break;

      case 'blockComment':
        if (text[offset] === '*' && text[offset + 1] === '/') {
          state = 'code';
          offset += 2;
        } else {
          offset += 1;
        }
        break;

      case 'string':
        if (text[offset] === '\\') {
          offset = consumeEscapedCharacter(text, offset);
        } else if (text[offset] === '"') {
          state = 'code';
          offset += 1;
        } else if (isLineBreak(text[offset])) {
          // Recover from an invalid, unterminated ordinary string at EOL.
          state = 'code';
          offset = consumeLineBreak(text, offset);
        } else {
          offset += 1;
        }
        break;

      case 'char':
        if (text[offset] === '\\') {
          offset = consumeEscapedCharacter(text, offset);
        } else if (text[offset] === "'") {
          state = 'code';
          offset += 1;
        } else if (isLineBreak(text[offset])) {
          // Recover from an invalid, unterminated character literal at EOL.
          state = 'code';
          offset = consumeLineBreak(text, offset);
        } else {
          offset += 1;
        }
        break;

      case 'rawString':
        if (text.startsWith(rawStringTerminator, offset)) {
          const terminatorLength = rawStringTerminator.length;
          state = 'code';
          rawStringTerminator = '';
          offset += terminatorLength;
        } else {
          offset += 1;
        }
        break;

      case 'acslLine':
        if (isLineBreak(text[offset])) {
          endAnnotation(offset);
          offset = consumeLineBreak(text, offset);
        } else if (text[offset] === '/' && text[offset + 1] === '/') {
          state = 'acslInnerLineComment';
          offset += 2;
        } else if (text[offset] === '"') {
          state = 'acslString';
          offset += 1;
        } else if (text[offset] === "'") {
          state = 'acslChar';
          offset += 1;
        } else {
          offset += 1;
        }
        break;

      case 'acslBlock':
        if (text[offset] === '*' && text[offset + 1] === '/') {
          endAnnotation(offset);
          offset += 2;
        } else if (text[offset] === '/' && text[offset + 1] === '/') {
          state = 'acslInnerLineComment';
          offset += 2;
        } else if (text[offset] === '"') {
          state = 'acslString';
          offset += 1;
        } else if (text[offset] === "'") {
          state = 'acslChar';
          offset += 1;
        } else {
          offset += 1;
        }
        break;

      case 'acslInnerLineComment':
        if (
          acslContainer === 'acslBlock' &&
          text[offset] === '*' &&
          text[offset + 1] === '/'
        ) {
          endAnnotation(offset);
          offset += 2;
        } else if (isLineBreak(text[offset])) {
          if (acslContainer === 'acslBlock') {
            state = 'acslBlock';
          } else {
            endAnnotation(offset);
          }
          offset = consumeLineBreak(text, offset);
        } else {
          offset += 1;
        }
        break;

      case 'acslString':
      case 'acslChar': {
        const quote = state === 'acslString' ? '"' : "'";

        if (
          acslContainer === 'acslBlock' &&
          text[offset] === '*' &&
          text[offset + 1] === '/'
        ) {
          endAnnotation(offset);
          offset += 2;
        } else if (text[offset] === '\\') {
          const escapedOffset = offset + 1;
          if (isLineBreak(text[escapedOffset])) {
            if (acslContainer === 'acslBlock') {
              state = 'acslBlock';
            } else {
              endAnnotation(escapedOffset);
            }
            offset = consumeLineBreak(text, escapedOffset);
          } else {
            offset = consumeEscapedCharacter(text, offset);
          }
        } else if (text[offset] === quote) {
          state = acslContainer ?? 'code';
          offset += 1;
        } else if (isLineBreak(text[offset])) {
          if (acslContainer === 'acslBlock') {
            state = 'acslBlock';
          } else {
            endAnnotation(offset);
          }
          offset = consumeLineBreak(text, offset);
        } else {
          offset += 1;
        }
        break;
      }
    }
  }

  if (onAnnotation !== undefined && annotationStart !== undefined) {
    endAnnotation(text.length);
  }

  return { state, annotationStart, contentStart };
}
