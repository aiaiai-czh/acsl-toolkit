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
  | 'acslBlock';

export interface CLexicalScanResult {
  readonly state: CLexicalState;
  readonly annotationStart: number | undefined;
  readonly contentStart: number | undefined;
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

  let state: CLexicalState = 'code';
  let offset = 0;
  let annotationStart: number | undefined;
  let contentStart: number | undefined;
  let rawStringTerminator = '';

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

            state = startsBlockComment ? 'acslBlock' : 'acslLine';
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
          state = 'code';
          annotationStart = undefined;
          contentStart = undefined;
          offset = consumeLineBreak(text, offset);
        } else {
          offset += 1;
        }
        break;

      case 'acslBlock':
        if (text[offset] === '*' && text[offset + 1] === '/') {
          state = 'code';
          annotationStart = undefined;
          contentStart = undefined;
          offset += 2;
        } else {
          offset += 1;
        }
        break;
    }
  }

  return { state, annotationStart, contentStart };
}
