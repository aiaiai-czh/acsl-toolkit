import { describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';

import { AcslCompletionProvider } from '../../src/completion/completionProvider';

// Exercise the real provider and document offsets without a graphical host.
vi.mock('vscode', () => {
  class Position {
    public constructor(public line: number, public character: number) {}
  }
  class Range {
    public constructor(public start: Position, public end: Position) {}
  }
  class CompletionItem {
    public constructor(public label: string, public kind: number) {}
  }
  class CompletionList {
    public constructor(public items: CompletionItem[], public isIncomplete: boolean) {}
  }
  class SnippetString {
    public constructor(public value: string) {}
  }
  class MarkdownString {
    public value = '';
    public appendText(text: string): this { this.value += text; return this; }
    public appendMarkdown(text: string): this { this.value += text; return this; }
  }
  return {
    Position, Range, CompletionItem, CompletionList, SnippetString, MarkdownString,
    CompletionItemKind: { Function: 2, Variable: 5, Keyword: 13, Value: 11, TypeParameter: 24, Snippet: 14 },
  };
});

function request(markedSource: string, cancelled = false): {
  readonly source: string;
  readonly list: vscode.CompletionList | undefined;
  readonly rangeText: (item: vscode.CompletionItem) => string;
} {
  const cursor = markedSource.indexOf('§');
  const source = markedSource.replace('§', '');
  const lines = source.split('\n');
  const offsetAt = (position: vscode.Position) =>
    lines.slice(0, position.line).reduce((offset, line) => offset + line.length + 1, 0) + position.character;
  const positionAt = (offset: number) => {
    const before = source.slice(0, offset).split('\n');
    return new vscode.Position(before.length - 1, before.at(-1)!.length);
  };
  const document = {
    version: 1,
    getText: () => source,
    positionAt,
    offsetAt,
    lineAt: (line: number) => ({ text: lines[line] }),
  } as unknown as vscode.TextDocument;
  const list = new AcslCompletionProvider().provideCompletionItems(
    document,
    positionAt(cursor),
    { isCancellationRequested: cancelled } as vscode.CancellationToken,
  ) as vscode.CompletionList | undefined;
  const rangeText = (item: vscode.CompletionItem) => {
    const range = item.range as vscode.Range;
    return source.slice(offsetAt(range.start), offsetAt(range.end));
  };
  return { source, list, rangeText };
}

describe('ACSL local completion provider', () => {
  it('offers value from v alongside static ACSL candidates', () => {
    const { list, rangeText } = request('/*@ predicate positive(integer value) = v§ > 0; */');
    const value = list!.items.find(({ label }) => label === 'value')!;
    expect(value.kind).toBe(vscode.CompletionItemKind.Variable);
    expect(value.insertText).toBe('value');
    expect(value.detail).toContain('integer');
    expect(rangeText(value)).toBe('v');
    expect(list!.items.some(({ label }) => label === 'variant')).toBe(true);
    expect(list!.isIncomplete).toBe(true);
  });

  it('replaces the complete local identifier when editing mid-word', () => {
    const { list, rangeText } = request('/*@ logic integer double_value(integer value) = va§lue * 2; */');
    expect(rangeText(list!.items.find(({ label }) => label === 'value')!)).toBe('value');
  });

  it('uses the inner type for a shadowed name and emits it only once', () => {
    const { list } = request('/*@ predicate p(integer value) = (\\exists real value; v§ > 0); */');
    const values = list!.items.filter(({ label }) => label === 'value');
    expect(values).toHaveLength(1);
    expect(values[0]!.detail).toContain('exists');
    expect(values[0]!.detail).toContain('real');
  });

  it('does not use a local variable for backslash completion', () => {
    const { list } = request('/*@ predicate p(integer value) = \\va§(p); */');
    expect(list!.items.some(({ label }) => label === 'value')).toBe(false);
    expect(list!.items.some(({ label }) => label === '\\valid')).toBe(true);
  });

  it('uses a single-word local range even when its prefix matches a multiword keyword', () => {
    const { list, rangeText } = request('/*@ logic integer f(integer loop_count) = loo§p_count; */');
    const local = list!.items.find(({ label }) => label === 'loop_count')!;
    expect(rangeText(local)).toBe('loop_count');
  });

  it('bounds an empty-prefix shortlist and keeps locals ahead of catalog entries', () => {
    const { list } = request('/*@ predicate p(integer value) = § */');
    expect(list!.items).toHaveLength(25);
    expect(list!.items[0]!.label).toBe('value');
    expect(list!.isIncomplete).toBe(true);
  });

  it('preserves the following semicolon when inserting a local name', () => {
    const { list, rangeText } = request('/*@ logic integer f(integer value) = v§; */');
    const value = list!.items.find(({ label }) => label === 'value')!;
    expect(rangeText(value)).toBe('v');
    expect(value.insertText).toBe('value');
  });

  it('matches case-sensitive local names and rejects expired scopes', () => {
    expect(request('/*@ predicate p(integer Value) = v§ > 0; */').list!.items
      .some(({ label }) => label === 'Value')).toBe(false);
    expect(request('/*@ predicate p(integer value) = value > 0; lemma q: v§ > 0; */').list!.items
      .some(({ label }) => label === 'value')).toBe(false);
  });

  it.each([
    'int v§;',
    '// predicate p(integer value) = v§;',
    '/*@ predicate p(integer value) = "v§"; */',
    '/*@ predicate p(integer value) = \n // v§\n */',
  ])('excludes non-ACSL and inactive literal/comment positions', (source) => {
    expect(request(source).list).toBeUndefined();
  });

  it('honors cancellation', () => {
    expect(request('/*@ predicate p(integer value) = v§; */', true).list).toBeUndefined();
  });
});

describe('ACSL document symbol completion provider', () => {
  const declaration = '/*@ predicate positive(integer value) = value > 0; logic integer twice(integer value) = value * 2; */\n';
  const documentItems = (list: vscode.CompletionList | undefined) =>
    list!.items.filter(({ detail }) => detail?.startsWith('ACSL document ·'));

  it.each([
    ['p', 'positive', 'positive(${1:value})'],
    ['t', 'twice', 'twice(${1:value})'],
  ])('offers declared %s references from the first letter', (prefix, name, snippet) => {
    const { list, rangeText } = request(`${declaration}/*@ requires ${prefix}§; */`);
    const item = documentItems(list).find(({ label }) => label === name)!;
    expect(item.kind).toBe(vscode.CompletionItemKind.Function);
    expect(item.insertText).toBeInstanceOf(vscode.SnippetString);
    expect((item.insertText as vscode.SnippetString).value).toBe(snippet);
    expect(item.filterText).toBe(name);
    expect(item.detail).toContain('integer value');
    expect(rangeText(item)).toBe(prefix);
    expect(list!.isIncomplete).toBe(true);
  });

  it('replaces the whole name at a mid-identifier cursor and leaves the semicolon', () => {
    const { list, rangeText } = request(`${declaration}//@ assert po§sitive;`);
    const item = documentItems(list)[0]!;
    expect(rangeText(item)).toBe('positive');
    expect((item.insertText as vscode.SnippetString).value).toBe('positive(${1:value})');
  });

  it.each(['(value)', ' {Here}(value)', '<integer>(value)', ' {Here}<integer>(value)', '<list<integer>>(value)', '\n  (value)', ' {Here'])('preserves an existing call suffix %s', (suffix) => {
    const { list, rangeText } = request(`${declaration}/*@ ensures pos§${suffix}; */`);
    const item = documentItems(list)[0]!;
    expect(item.insertText).toBe('positive');
    expect(rangeText(item)).toBe('pos');
  });

  it('does not mistake a less-than comparison for existing generic arguments', () => {
    const { list } = request(`${declaration}/*@ ensures tw§ < 10; */`);
    expect((documentItems(list)[0]!.insertText as vscode.SnippetString).value).toBe('twice(${1:value})');
  });

  it('does not look beyond a line annotation for an existing call', () => {
    const { list } = request(`${declaration}//@ ensures tw§\n(value);`);
    expect((documentItems(list)[0]!.insertText as vscode.SnippetString).value).toBe('twice(${1:value})');
  });

  it('adds editable declared labels before argument placeholders', () => {
    const { list } = request('/*@ predicate changed{Before, After}(integer value) = value > 0; */\n/*@ ensures cha§; */');
    expect((documentItems(list)[0]!.insertText as vscode.SnippetString).value)
      .toBe('changed{${1:Before}, ${2:After}}(${3:value})');
  });

  it('keeps constants and parameterless predicates bare and tolerates explicit empty lists', () => {
    const { list } = request('/*@ logic integer limit = 10; predicate ready = \\true; logic integer empty() = 0; */\n/*@ ensures §; */');
    const items = documentItems(list);
    expect(items.find(({ label }) => label === 'limit')!.insertText).toBe('limit');
    expect(items.find(({ label }) => label === 'ready')!.kind).toBe(vscode.CompletionItemKind.Value);
    expect((items.find(({ label }) => label === 'empty')!.insertText as vscode.SnippetString).value).toBe('empty()');
  });

  it('retains overloads with different signatures but deduplicates declarations and definitions', () => {
    const { list } = request('/*@ axiomatic A { logic integer pick(integer first); logic integer pick(real other); } logic integer pick(integer value) = value; */\n/*@ ensures pi§; */');
    const items = documentItems(list);
    expect(items).toHaveLength(2);
    expect(items.map(({ detail }) => detail).join(' ')).toContain('integer value');
    expect(items.map(({ detail }) => detail).join(' ')).toContain('real other');
  });

  it('lets a local variable shadow a callable name', () => {
    const { list } = request(`${declaration}/*@ predicate p(integer positive) = pos§ > 0; */`);
    const items = list!.items.filter(({ label }) => label === 'positive');
    expect(items).toHaveLength(1);
    expect(items[0]!.kind).toBe(vscode.CompletionItemKind.Variable);
  });

  it('does not suggest document names for a backslash prefix', () => {
    const { list } = request(`${declaration}/*@ ensures \\p§; */`);
    expect(documentItems(list)).toHaveLength(0);
  });

  it('supports recursive and mutually recursive definitions only in the same annotation', () => {
    const { list } = request('/*@ predicate first(integer value) = se§(value); predicate second(integer value) = first(value); */');
    expect(documentItems(list)[0]!.label).toBe('second');
    expect(documentItems(request('/*@ predicate first(integer value) = fi§(value); */').list)[0]!.label).toBe('first');
    expect(documentItems(request('/*@ ensures se§; */\n/*@ predicate second(integer value) = value > 0; */').list)).toHaveLength(0);
  });

  it('uses single-word ranges for names that overlap multiword prefixes', () => {
    const { list, rangeText } = request('/*@ logic integer loop_count(integer x) = x; */\n/*@ ensures loo§p_count; */');
    expect(rangeText(documentItems(list)[0]!)).toBe('loop_count');
  });

  it('excludes fake declarations and an incomplete header', () => {
    const { list } = request('// predicate bogus(integer x);\nconst char *s = "/*@ predicate bogus(integer x); */";\n/*@\n// predicate bogus(integer x);\npredicate broken(integer x\n*/\n/*@ ensures b§; */');
    expect(documentItems(list)).toHaveLength(0);
  });

  it('refreshes cached names after edits and isolates document instances', () => {
    const provider = new AcslCompletionProvider();
    let source = '/*@ predicate first(integer value) = value > 0; */\n/*@ ensures §; */'.replace('§', '');
    const document = {
      version: 1,
      getText: () => source,
      offsetAt: (position: vscode.Position) => source.indexOf('\n') + 1 + position.character,
      positionAt: (offset: number) => offset > source.indexOf('\n')
        ? new vscode.Position(1, offset - source.indexOf('\n') - 1) : new vscode.Position(0, offset),
      lineAt: (line: number) => ({ text: source.split('\n')[line] }),
    } as unknown as vscode.TextDocument;
    const complete = () => provider.provideCompletionItems(document, new vscode.Position(1, 12),
      { isCancellationRequested: false } as vscode.CancellationToken) as vscode.CompletionList;
    expect(documentItems(complete())[0]!.label).toBe('first');
    expect(documentItems(complete())[0]!.label).toBe('first');
    source = source.replace('first', 'second');
    // A changed text snapshot also invalidates a cache with a reused version.
    expect(documentItems(complete())[0]!.label).toBe('second');
    expect(documentItems(request('/*@ ensures fi§; */').list)).toHaveLength(0);
  });
});
