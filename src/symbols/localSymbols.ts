import type { AcslContext } from '../context/acslContext';
import { matchAcslDelimiters, tokenizeAcsl, type AcslToken } from './acslTokens';
import {
  ACSL_TYPE_WORDS, findAcslAngleEnd, readAcslTypedNames, type AcslTypedName,
} from './typedNames';

export type AcslLocalSymbolKind =
  | 'parameter'
  | 'let'
  | 'forall'
  | 'exists'
  | 'lambda'
  | 'comprehension';

export interface AcslLocalSymbol {
  readonly name: string;
  readonly kind: AcslLocalSymbolKind;
  /** Declared text only; no type inference is performed. */
  readonly typeText?: string;
  readonly owner?: string;
  readonly declarationOffset: number;
  readonly scopeStart: number;
  readonly scopeEnd: number;
}

const BINDERS: Readonly<Record<string, AcslLocalSymbolKind>> = {
  '\\let': 'let',
  '\\forall': 'forall',
  '\\exists': 'exists',
  '\\lambda': 'lambda',
  '∀': 'forall',
  '∃': 'exists',
  'λ': 'lambda',
};
const EXPRESSION_END = new Set([';', ',', ')', ']', '}']);
const DEFINITION_END = new Set([';', ')', ']', '}']);
const MAX_NESTING = 128;

function annotationEnd(text: string, context: AcslContext): number {
  if (context.kind === 'block') {
    const end = text.indexOf('*/', context.contentStart);
    return end === -1 ? text.length : end;
  }
  const end = text.slice(context.contentStart).search(/[\r\n]/);
  return end === -1 ? text.length : context.contentStart + end;
}

/**
 * A delimiter-and-binding walker. It records name ranges rather than parsing
 * ACSL types, constructing an AST, or interpreting expressions semantically.
 */
class LocalSymbolCollector {
  private readonly symbols: AcslLocalSymbol[] = [];
  private readonly pairs: ReadonlyMap<number, number>;

  public constructor(
    private readonly tokens: readonly AcslToken[],
    private readonly endOffset: number,
    private readonly cursorOffset: number,
  ) {
    this.pairs = matchAcslDelimiters(tokens);
  }

  private text(index: number): string {
    return this.tokens[index]?.text ?? '';
  }

  private offset(index: number): number {
    return this.tokens[index]?.start ?? this.endOffset;
  }

  private angleEnd(start: number, end: number): number {
    return findAcslAngleEnd(this.tokens, start, end);
  }

  /** Splits typed binders at commas outside array/function/generic types. */
  private declarations(start: number, end: number): AcslTypedName[] {
    return readAcslTypedNames(this.tokens, this.pairs, start, end);
  }

  private add(
    names: readonly AcslTypedName[],
    kind: AcslLocalSymbolKind,
    scopeStart: number,
    endIndex: number,
    owner?: string,
  ): void {
    const scopeEnd = this.offset(endIndex);
    if (this.cursorOffset < scopeStart || this.cursorOffset > scopeEnd) return;
    for (const name of names) {
      this.symbols.push({ ...name, kind, owner, scopeStart, scopeEnd });
    }
  }

  private headerEnd(start: number, end: number): number {
    for (let index = start; index < end; index += 1) {
      if (this.text(index) === ';') return index;
      if (this.pairs.has(index)) index = this.pairs.get(index)!;
      else if ([')', ']', '}'].includes(this.text(index))) return index;
    }
    return end;
  }

  private binding(
    start: number, end: number, stops: ReadonlySet<string>, depth: number,
  ): number {
    const kind = BINDERS[this.text(start)]!;
    let names: AcslTypedName[];
    let separator: number;
    if (kind === 'let') {
      let nameEnd = start + 2;
      if (this.text(start + 1) === '(') {
        nameEnd = (this.pairs.get(start + 1) ?? end) + 1;
      }
      if (this.text(nameEnd) !== '=') return start + 1;
      names = this.tokens.slice(start + 1, nameEnd)
        .filter(({ kind }) => kind === 'identifier')
        .map(({ text, start }) => ({ name: text, declarationOffset: start }));
      // An initializer can itself contain bindings; recursively distinguish
      // their semicolons from this let's initializer/body separator.
      separator = this.expression(nameEnd + 1, end, stops, depth + 1);
    } else {
      separator = this.headerEnd(start + 1, end);
      names = this.declarations(start + 1, separator);
    }
    if (this.text(separator) !== ';') return Math.max(start + 1, separator);

    const bodyEnd = this.expression(separator + 1, end, stops, depth + 1);
    this.add(names, kind, this.tokens[separator]!.end, bodyEnd);
    return bodyEnd;
  }

  private comprehension(open: number, close: number, depth: number): boolean {
    let pipe = -1;
    for (let index = open + 1; index < close; index += 1) {
      if (this.pairs.has(index)) index = this.pairs.get(index)!;
      else if (this.text(index) === '|') {
        pipe = index;
        break;
      }
    }
    if (pipe === -1) return false;
    const separator = this.headerEnd(pipe + 1, close);
    const names = this.declarations(pipe + 1, separator);
    if (names.length === 0) return false;

    // Comprehension variables bind the projection before their declarations
    // as well as the condition after them.
    this.add(names, 'comprehension', this.tokens[open]!.end, close);
    this.expression(open + 1, pipe, EXPRESSION_END, depth + 1);
    if (this.text(separator) === ';') {
      this.expression(separator + 1, close, EXPRESSION_END, depth + 1);
    }
    return true;
  }

  private definition(
    start: number, end: number, depth: number,
  ): number | undefined {
    const keyword = this.text(start);
    if (keyword !== 'predicate' && keyword !== 'logic') return undefined;
    let parameters = -1;
    for (let index = start + 1; index < end; index += 1) {
      const spelling = this.text(index);
      if (spelling === '=' || spelling === ';') break;
      if (spelling === '<') index = this.angleEnd(index, end);
      else if (spelling === '{' || spelling === '[') {
        index = this.pairs.get(index) ?? end;
      } else if (spelling === '(') {
        const previous = this.tokens[index - 1];
        if (previous !== undefined &&
          ((previous.kind === 'identifier' && !ACSL_TYPE_WORDS.has(previous.text)) ||
            ['}', '>'].includes(previous.text))) {
          parameters = index;
          break;
        }
        index = this.pairs.get(index) ?? end;
      }
    }
    if (parameters === -1) return undefined;
    const close = this.pairs.get(parameters);
    if (close === undefined) return end;
    const names = this.declarations(parameters + 1, close);
    // reads lists can contain commas before the definition's = expression.
    const bodyEnd = this.expression(close + 1, end, DEFINITION_END, depth + 1);
    this.add(names, 'parameter', this.tokens[close]!.end, bodyEnd, keyword);
    return bodyEnd;
  }

  private group(open: number, end: number, depth: number): number {
    const close = Math.min(this.pairs.get(open) ?? end, end);
    if (this.text(open) !== '{' || !this.comprehension(open, close, depth)) {
      this.range(open + 1, close, depth + 1);
    }
    return close < end ? close + 1 : end;
  }

  private expression(
    start: number, end: number, stops: ReadonlySet<string>, depth: number,
  ): number {
    if (depth > MAX_NESTING) return end;
    let index = start;
    while (index < end) {
      const token = this.tokens[index]!;
      if (token.kind === 'literal') {
        index += 1;
        continue;
      }
      if (stops.has(token.text)) break;
      if (BINDERS[token.text] !== undefined) {
        index = this.binding(index, end, stops, depth + 1);
      } else if (['(', '[', '{'].includes(token.text)) {
        index = this.group(index, end, depth + 1);
      } else if (token.text === '?') {
        index = this.expression(index + 1, end, new Set([...stops, ':']), depth + 1);
        if (this.text(index) === ':') index += 1;
      } else {
        index += 1;
      }
    }
    return index;
  }

  private range(start: number, end: number, depth: number): void {
    if (depth > MAX_NESTING) return;
    let index = start;
    while (index < end) {
      const definitionEnd = this.definition(index, end, depth);
      const expressionEnd = definitionEnd ?? this.expression(index, end, EXPRESSION_END, depth);
      index = Math.max(index + 1, expressionEnd + 1);
    }
  }

  public collect(): readonly AcslLocalSymbol[] {
    this.range(0, this.tokens.length, 0);
    // Prefer the innermost lexical range and the newest declaration on ties.
    // A comprehension may bind a name declared after the cursor.
    this.symbols.sort((left, right) =>
      (left.scopeEnd - left.scopeStart) - (right.scopeEnd - right.scopeStart) ||
      right.declarationOffset - left.declarationOffset,
    );
    const visible = new Map<string, AcslLocalSymbol>();
    for (const symbol of this.symbols) {
      if (!visible.has(symbol.name)) visible.set(symbol.name, symbol);
    }
    return [...visible.values()];
  }
}

export function collectAcslLocalSymbols(
  text: string,
  context: AcslContext,
): readonly AcslLocalSymbol[] {
  const end = annotationEnd(text, context);
  const tokens = tokenizeAcsl(text, context.contentStart, end);
  return new LocalSymbolCollector(tokens, end, context.cursorOffset).collect();
}
