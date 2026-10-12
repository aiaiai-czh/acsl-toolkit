export interface AcslToken {
  readonly text: string;
  readonly start: number;
  readonly end: number;
  readonly kind: 'identifier' | 'builtin' | 'literal' | 'punctuation';
}

/** Tokenizes one annotation, retaining document offsets without an AST. */
export function tokenizeAcsl(
  text: string,
  start: number,
  end: number,
): readonly AcslToken[] {
  const tokens: AcslToken[] = [];
  let offset = start;

  while (offset < end) {
    const character = text[offset]!;
    if (/\s/.test(character) || character === '@') {
      offset += 1;
      continue;
    }
    if (character === '/' && text[offset + 1] === '/') {
      while (offset < end && !/[\r\n]/.test(text[offset]!)) {
        offset += 1;
      }
      continue;
    }

    const tokenStart = offset;
    let kind: AcslToken['kind'] = 'punctuation';
    if (character === '"' || character === "'") {
      kind = 'literal';
      offset += 1;
      while (offset < end && !/[\r\n]/.test(text[offset]!)) {
        if (text[offset] === '\\') {
          const length = text[offset + 1] === '\r' && text[offset + 2] === '\n'
            ? 3 : 2;
          offset = Math.min(offset + length, end);
        }
        else if (text[offset++] === character) break;
      }
    } else if (/[A-Za-z_]/.test(character) || character === '\\') {
      kind = character === '\\' ? 'builtin' : 'identifier';
      offset += 1;
      while (offset < end && /[A-Za-z0-9_]/.test(text[offset]!)) offset += 1;
    } else if (/[0-9]/.test(character)) {
      kind = 'literal';
      offset += 1;
      while (offset < end && /[A-Za-z0-9_.]/.test(text[offset]!)) offset += 1;
    } else {
      offset += 1;
    }
    tokens.push({
      text: text.slice(tokenStart, offset),
      start: tokenStart,
      end: offset,
      kind,
    });
  }
  return tokens;
}

export function matchAcslDelimiters(
  tokens: readonly AcslToken[],
): ReadonlyMap<number, number> {
  const matches = new Map<number, number>();
  const stack: number[] = [];
  const openers: Readonly<Record<string, string>> = { ')': '(', ']': '[', '}': '{' };

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    if (token.kind !== 'punctuation') continue;
    if (['(', '[', '{'].includes(token.text)) stack.push(index);
    else if (openers[token.text] !== undefined) {
      const open = stack.at(-1);
      if (open !== undefined && tokens[open]!.text === openers[token.text]) {
        stack.pop();
        matches.set(open, index);
      }
    }
  }
  return matches;
}
