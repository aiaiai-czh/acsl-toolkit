import type { AcslContext } from '../context/acslContext';
import { collectAcslAnnotationRanges, type AcslAnnotationRange } from '../context/cLexicalScanner';
import { matchAcslDelimiters, tokenizeAcsl, type AcslToken } from './acslTokens';
import {
  ACSL_TYPE_WORDS, acslTokenText, findAcslAngleEnd, readAcslTypedNames, type AcslTypedName,
} from './typedNames';

export interface AcslDocumentSymbol {
  readonly name: string;
  readonly kind: 'logic' | 'predicate';
  readonly returnType?: string;
  readonly parameters: readonly AcslTypedName[];
  readonly hasParameterList: boolean;
  readonly labels: readonly string[];
  readonly typeParameters: readonly string[];
  readonly signature: string;
  readonly declarationOffset: number;
  readonly headerEnd: number;
  readonly annotationStart: number;
  /** Parameter names do not distinguish an overload from its declaration. */
  readonly overloadKey: string;
}

interface Header {
  readonly symbol: AcslDocumentSymbol;
  readonly next: number;
}

/** Reads declaration spellings, not expressions, types, or a program AST. */
class DocumentSymbolCollector {
  private readonly pairs: ReadonlyMap<number, number>;
  private readonly symbols: AcslDocumentSymbol[] = [];

  public constructor(
    private readonly tokens: readonly AcslToken[],
    private readonly annotation: AcslAnnotationRange,
  ) {
    this.pairs = matchAcslDelimiters(tokens);
  }

  private text(index: number): string { return this.tokens[index]?.text ?? ''; }

  private binderNames(start: number, end: number): readonly string[] | undefined {
    const names: string[] = [];
    for (let index = start; index < end; index += 2) {
      if (this.tokens[index]?.kind !== 'identifier' ||
        (index + 1 < end && this.text(index + 1) !== ',')) return undefined;
      names.push(this.text(index));
    }
    return names.length === 0 || this.text(end - 1) === ',' ? undefined : names;
  }

  private parameterCount(start: number, end: number): number {
    if (start === end) return 0;
    let count = 1;
    for (let index = start; index < end; index += 1) {
      if (this.pairs.has(index)) index = this.pairs.get(index)!;
      else if (this.text(index) === '<') index = findAcslAngleEnd(this.tokens, index, end);
      else if (this.text(index) === ',') count += 1;
    }
    return count;
  }

  private header(start: number, end: number): Header | undefined {
    const keyword = this.text(start);
    if (!['logic', 'predicate', 'inductive'].includes(keyword)) return undefined;
    for (let nameIndex = start + 1; nameIndex < end; nameIndex += 1) {
      const spelling = this.text(nameIndex);
      if ([';', '=', 'reads'].includes(spelling)) break;
      if (spelling === '<' || ['(', '[', '{'].includes(spelling)) {
        const close = spelling === '<'
          ? findAcslAngleEnd(this.tokens, nameIndex, end)
          : this.pairs.get(nameIndex);
        if (close === undefined || close === nameIndex) break;
        nameIndex = close;
        continue;
      }
      const name = this.tokens[nameIndex]!;
      if (name.kind !== 'identifier' || ACSL_TYPE_WORDS.has(name.text)) continue;
      if (keyword !== 'logic' && nameIndex !== start + 1) break;
      const returnType = keyword === 'logic'
        ? acslTokenText(this.tokens, start + 1, nameIndex) : undefined;
      if (returnType === '') continue;

      let next = nameIndex + 1;
      let labels: readonly string[] = [];
      let typeParameters: readonly string[] = [];
      let valid = true;
      while (this.text(next) === '<' || this.text(next) === '{') {
        const isType = this.text(next) === '<';
        const close = isType ? findAcslAngleEnd(this.tokens, next, end) : this.pairs.get(next);
        // An inductive's case block is not a label binder.
        if (keyword === 'inductive' && !isType &&
          (close === undefined || this.binderNames(next + 1, close) === undefined)) break;
        const names = close === undefined || close === next
          ? undefined : this.binderNames(next + 1, close);
        if (names === undefined || (isType ? typeParameters.length > 0 : labels.length > 0)) {
          valid = false;
          break;
        }
        if (isType) typeParameters = names;
        else labels = names;
        next = close! + 1;
      }
      if (!valid) continue;

      const hasParameterList = this.text(next) === '(';
      let parameters: readonly AcslTypedName[] = [];
      if (hasParameterList) {
        const close = this.pairs.get(next);
        if (close === undefined || close >= end) continue;
        parameters = readAcslTypedNames(this.tokens, this.pairs, next + 1, close);
        if (parameters.length !== this.parameterCount(next + 1, close)) continue;
        next = close + 1;
      }
      const terminators = keyword === 'inductive' ? ['{'] : ['=', ';', 'reads'];
      if (!terminators.includes(this.text(next))) continue;

      const kind = keyword === 'logic' ? 'logic' : 'predicate';
      const typeSuffix = typeParameters.length > 0 ? `<${typeParameters.join(', ')}>` : '';
      const labelSuffix = labels.length > 0 ? `{${labels.join(', ')}}` : '';
      const args = parameters.map(({ name, typeText }) => `${typeText} ${name}`).join(', ');
      const signature = `${keyword} ${returnType ? `${returnType} ` : ''}${name.text}${typeSuffix}${labelSuffix}${hasParameterList ? `(${args})` : ''}`;
      // Renaming a bound generic type does not create a different overload.
      const canonicalType = (type: string | undefined) => type?.replace(
        /[A-Za-z_][A-Za-z0-9_]*/g,
        (word) => {
          const position = typeParameters.indexOf(word);
          return position === -1 ? word : `$type${position}`;
        },
      );
      return {
        next,
        symbol: {
          name: name.text, kind, returnType, parameters, hasParameterList, labels, typeParameters,
          signature, declarationOffset: name.start,
          headerEnd: this.tokens[next - 1]!.end,
          annotationStart: this.annotation.annotationStart,
          overloadKey: JSON.stringify([
            kind, name.text, canonicalType(returnType), hasParameterList, typeParameters.length,
            labels.length, parameters.map(({ typeText }) => canonicalType(typeText)),
          ]),
        },
      };
    }
    return undefined;
  }

  private range(start: number, end: number, depth: number): void {
    if (depth > 128) return;
    let index = start;
    while (index < end) {
      if (this.text(index) === 'axiomatic' && this.tokens[index + 1]?.kind === 'identifier' &&
        this.text(index + 2) === '{') {
        const close = Math.min(this.pairs.get(index + 2) ?? end, end);
        this.range(index + 3, close, depth + 1);
        index = close + 1;
        continue;
      }
      const header = this.header(index, end);
      if (header !== undefined) {
        this.symbols.push(header.symbol);
        index = header.next;
        if (this.text(index) === '{') {
          index = (this.pairs.get(index) ?? end) + 1;
          continue;
        }
      }
      // Ignore expressions (including quoted strings and nested groups) rather
      // than treating identifiers occurring in calls as fresh declarations.
      while (index < end && this.text(index) !== ';') {
        index = (this.pairs.get(index) ?? index) + 1;
      }
      index += 1;
    }
  }

  public collect(): readonly AcslDocumentSymbol[] {
    this.range(0, this.tokens.length, 0);
    return this.symbols;
  }
}

export function indexAcslDocumentSymbols(text: string): readonly AcslDocumentSymbol[] {
  return collectAcslAnnotationRanges(text).flatMap((annotation) =>
    new DocumentSymbolCollector(
      tokenizeAcsl(text, annotation.contentStart, annotation.contentEnd), annotation,
    ).collect(),
  );
}

export function visibleAcslDocumentSymbols(
  symbols: readonly AcslDocumentSymbol[], context: AcslContext,
): readonly AcslDocumentSymbol[] {
  const visible = new Map<string, AcslDocumentSymbol>();
  for (const symbol of symbols) {
    // A single bunch of logic declarations is implicitly mutually recursive.
    // Other annotations are made available only after their declaration.
    if (symbol.annotationStart > context.annotationStart ||
      (symbol.declarationOffset <= context.cursorOffset && context.cursorOffset < symbol.headerEnd)) continue;
    visible.set(symbol.overloadKey, symbol);
  }
  return [...visible.values()].sort((left, right) =>
    left.name.localeCompare(right.name, 'en') || left.signature.localeCompare(right.signature, 'en'),
  );
}

export function acslDocumentCallSnippet(symbol: AcslDocumentSymbol): string {
  let placeholder = 0;
  const editable = (name: string) => `\${${++placeholder}:${name}}`;
  const labels = symbol.labels.length > 0 ? `{${symbol.labels.map(editable).join(', ')}}` : '';
  const parameters = symbol.hasParameterList
    ? `(${symbol.parameters.map(({ name }) => editable(name)).join(', ')})` : '';
  return `${symbol.name}${labels}${parameters}`;
}
