import { describe, expect, it } from 'vitest';

import { scanAcslContext } from '../../src/context/acslContext';
import {
  acslDocumentCallSnippet,
  indexAcslDocumentSymbols,
  visibleAcslDocumentSymbols,
} from '../../src/symbols/documentSymbols';

function visible(markedSource: string) {
  const cursorOffset = markedSource.indexOf('§');
  const source = markedSource.replace('§', '');
  const context = scanAcslContext(source, cursorOffset);
  if (context === undefined) throw new Error('Fixture cursor must be in ACSL');
  return visibleAcslDocumentSymbols(indexAcslDocumentSymbols(source), context);
}

function only(source: string) {
  const symbols = indexAcslDocumentSymbols(source);
  expect(symbols).toHaveLength(1);
  return symbols[0]!;
}

describe('indexAcslDocumentSymbols', () => {
  it('indexes predicates and logic functions across distinct annotations', () => {
    const source = '/*@ predicate positive(integer value) = value > 0; */\n'
      + 'int f(int x);\n//@ logic integer twice(integer value) = value * 2;';
    const symbols = indexAcslDocumentSymbols(source);

    expect(symbols.map(({ name, kind }) => ({ name, kind }))).toEqual([
      { name: 'positive', kind: 'predicate' },
      { name: 'twice', kind: 'logic' },
    ]);
    expect(symbols[0]).toMatchObject({
      parameters: [{ name: 'value', typeText: 'integer' }],
      hasParameterList: true,
      annotationStart: source.indexOf('/*@'),
      declarationOffset: source.indexOf('positive'),
      headerEnd: source.indexOf(')') + 1,
      signature: 'predicate positive(integer value)',
    });
    expect(symbols[1]).toMatchObject({
      returnType: 'integer',
      annotationStart: source.indexOf('//@'),
      signature: 'logic integer twice(integer value)',
    });
  });

  it('indexes axiomatic prototypes, reads clauses, and constants', () => {
    const source = '/*@ axiomatic Arithmetic {\n'
      + 'predicate positive(integer x);\n'
      + 'logic integer read_value{L}(int *pointer) reads *pointer;\n'
      + 'logic integer limit;\n'
      + 'axiom bound: limit > 0;\n'
      + 'lemma stable: positive(limit);\n'
      + '} */';
    expect(indexAcslDocumentSymbols(source).map(({ name }) => name)).toEqual([
      'positive', 'read_value', 'limit',
    ]);
  });

  it('extracts prototypes from an unfinished axiomatic block', () => {
    expect(indexAcslDocumentSymbols(
      '/*@ axiomatic Data { logic integer size; predicate good(integer x);',
    ).map(({ name }) => name)).toEqual(['size', 'good']);
  });

  it('preserves a completed header when its expression is unfinished', () => {
    const symbol = only('/*@ predicate positive(integer value) =');
    expect(symbol.name).toBe('positive');
    expect(symbol.parameters.map(({ name }) => name)).toEqual(['value']);
  });

  it.each([
    ['logic integer limit = 7;', 'limit', 'logic', false],
    ['predicate ready = \\true;', 'ready', 'predicate', false],
    ['logic real pi;', 'pi', 'logic', false],
    ['predicate initialized;', 'initialized', 'predicate', false],
    ['logic integer empty() = 0;', 'empty', 'logic', true],
    ['predicate trivial() = \\true;', 'trivial', 'predicate', true],
  ] as const)('supports constants and explicit empty lists: %s', (declaration, name, kind, hasParameterList) => {
    expect(only('/*@ ' + declaration + ' */')).toMatchObject({
      name, kind, parameters: [], hasParameterList,
    });
  });

  it.each([
    ['predicate relation{Before, After}<T>(T value);', ['Before', 'After'], ['T']],
    ['predicate relation<T>{Before, After}(T value);', ['Before', 'After'], ['T']],
    ['logic T relation<T>{L}(T value) = value;', ['L'], ['T']],
    ['logic T relation{L}<T>(T value) = value;', ['L'], ['T']],
    ['predicate relation<A, B>(A first, B second);', [], ['A', 'B']],
  ] as const)('supports labels and type parameters in either order: %s', (declaration, labels, typeParameters) => {
    expect(only('/*@ ' + declaration + ' */')).toMatchObject({
      name: 'relation', labels, typeParameters,
    });
  });

  it('normalizes the signature while retaining all declared parameter names', () => {
    const symbol = only('/*@ logic real\n magnitude { L } < T >\n (T left,\n real right) = right; */');
    expect(symbol.signature).toBe('logic real magnitude<T>{L}(T left, real right)');
    expect(symbol.parameters.map(({ name }) => name)).toEqual(['left', 'right']);
  });

  it.each([
    ['logic (integer -> integer) transform(integer x) = \\lambda integer y; x + y;', 'transform', '( integer -> integer )'],
    ['logic pair<integer, real> pair_value(integer x) = x;', 'pair_value', 'pair<integer, real>'],
    ['logic struct Node* next_node(struct Node *node) = node;', 'next_node', 'struct Node*'],
    ['logic integer[] values(integer x) = x;', 'values', 'integer[]'],
  ] as const)('extracts names after compound return type spellings: %s', (declaration, name, returnType) => {
    expect(only('/*@ ' + declaration + ' */')).toMatchObject({ name, returnType });
  });

  it('retains parameter order through pointer, array, generic, and function types', () => {
    const symbol = only('/*@ predicate applies(int *pointer, integer values[], list<pair<integer, real>> nodes, int (*callback)(int argument)); */');
    expect(symbol.parameters.map(({ name }) => name)).toEqual([
      'pointer', 'values', 'nodes', 'callback',
    ]);
    expect(symbol.parameters.map(({ typeText }) => typeText)).toEqual([
      'int*', 'integer[]', 'list<pair<integer, real>>', 'int (*) ( int argument )',
    ]);
  });

  it('inherits a shared declared parameter type', () => {
    const symbol = only('/*@ predicate ordered(integer first, second, third); */');
    expect(symbol.parameters.map(({ name, typeText }) => ({ name, typeText }))).toEqual([
      { name: 'first', typeText: 'integer' },
      { name: 'second', typeText: 'integer' },
      { name: 'third', typeText: 'integer' },
    ]);
  });

  it('indexes inductive declarations as predicates without indexing their cases', () => {
    const symbols = indexAcslDocumentSymbols('/*@ inductive reachable{L}(integer x) {\n'
      + 'case base: reachable(0);\n'
      + 'case step: \\forall integer value; reachable(value) ==> reachable(value + 1);\n'
      + '} predicate done(integer x) = reachable(x); */');
    expect(symbols.map(({ name, kind }) => ({ name, kind }))).toEqual([
      { name: 'reachable', kind: 'predicate' },
      { name: 'done', kind: 'predicate' },
    ]);
    expect(symbols[0]?.signature).toBe('inductive reachable{L}(integer x)');
  });

  it('supports an inductive predicate without a parameter list', () => {
    expect(only('/*@ inductive ready { case initial: ready; } */')).toMatchObject({
      name: 'ready', kind: 'predicate', hasParameterList: false,
    });
  });

  it('does not index axiom, lemma, type, or behavior labels', () => {
    expect(indexAcslDocumentSymbols('/*@ '
      + 'type shape = Circle | Square; '
      + 'axiom identity: \\true; lemma identity2: \\true; '
      + 'behavior ready: requires \\true; '
      + 'predicate real_predicate(integer x); */').map(({ name }) => name))
      .toEqual(['real_predicate']);
  });

  it.each([
    '// predicate hidden(integer x);',
    '/* predicate hidden(integer x); */',
    '// ordinary /*@ predicate hidden(integer x); */',
    '/* ordinary /*@ predicate hidden(integer x); */',
    'char *s = "/*@ predicate hidden(integer x); */";',
    'char c = \'/*@ predicate hidden(integer x); */\';',
    'char *s = R"tag(/*@ predicate hidden(integer x); */)tag";',
    'char *s = u8R"tag(//@ predicate hidden(integer x);)tag";',
  ])('excludes declarations outside genuine ACSL: %s', (prefix) => {
    expect(indexAcslDocumentSymbols(prefix + '\n/*@ predicate active(integer value); */')
      .map(({ name }) => name)).toEqual(['active']);
  });

  it('excludes disabled declaration lines and quoted declaration-like text', () => {
    expect(indexAcslDocumentSymbols('/*@\n'
      + '// predicate disabled(integer x);\n'
      + '//@ logic integer also_disabled(integer x);\n'
      + 'assert "predicate literal(integer x);" == "x";\n'
      + 'predicate active(integer value);\n'
      + '*/').map(({ name }) => name)).toEqual(['active']);
  });

  it('does not treat expression calls or parameter names as declarations', () => {
    expect(indexAcslDocumentSymbols('/*@ predicate positive(integer value) = value > 0;\n'
      + 'requires positive(value); ensures \\old(positive(value));\n'
      + 'logic integer twice(integer value) = value + value; */')
      .map(({ name }) => name)).toEqual(['positive', 'twice']);
  });

  it.each([
    'predicate ;',
    'predicate missing(integer value',
    'predicate missing(integer value)',
    'predicate missing(integer);',
    'predicate missing(value);',
    'predicate missing{L,}(integer value);',
    'predicate missing{L}{M}(integer value);',
    'predicate missing<T><U>(T value);',
    'predicate missing<T,>(T value);',
    'predicate missing<>(integer value);',
    'predicate missing{L',
    'predicate missing<T',
    'predicate missing(integer value) + value;',
    'predicate missing(, integer value);',
    'predicate missing(integer value,);',
    'predicate missing(integer value, real);',
    'predicate missing(integer value, + other);',
    'predicate missing(integer value,, real other);',
    'logic missing(integer value);',
    'logic integer;',
    'logic integer missing(integer value',
  ])('ignores malformed or incomplete headers: %s', (declaration) => {
    expect(indexAcslDocumentSymbols('/*@ ' + declaration + ' */')).toEqual([]);
  });

  it('continues indexing after an incomplete or invalid declaration', () => {
    const symbols = indexAcslDocumentSymbols('/*@ predicate bad<T,>(T x); '
      + 'predicate good(integer value); */');
    expect(symbols.map(({ name }) => name)).toEqual(['good']);
  });

  it('keeps document offsets for names in CRLF text', () => {
    const source = 'int x;\r\n/*@\r\npredicate present(integer value);\r\n*/';
    expect(only(source)).toMatchObject({
      declarationOffset: source.indexOf('present'),
      annotationStart: source.indexOf('/*@'),
      headerEnd: source.indexOf(')') + 1,
    });
  });

  it('bounds recursion for deeply nested malformed axiomatic blocks', () => {
    const source = '/*@ ' + 'axiomatic Deep { '.repeat(140)
      + 'predicate unreachable(integer value);' + '}'.repeat(140) + ' */';
    expect(indexAcslDocumentSymbols(source)).toEqual([]);
  });
});

describe('visibleAcslDocumentSymbols', () => {
  it('offers declarations from preceding annotations', () => {
    expect(visible('/*@ predicate positive(integer value); */\n'
      + 'int f(int x);\n/*@ requires pos§; */').map(({ name }) => name)).toEqual(['positive']);
  });

  it('excludes declarations in later annotations', () => {
    expect(visible('/*@ requires pos§; */\n'
      + 'int f(int x);\n/*@ predicate positive(integer value); */')).toEqual([]);
  });

  it('supports recursive references in a completed definition body', () => {
    expect(visible('/*@ predicate recursive(integer value) = rec§; */')
      .map(({ name }) => name)).toEqual(['recursive']);
  });

  it('supports mutually recursive declarations within the same annotation', () => {
    expect(visible('/*@ predicate first(integer value) = sec§;\n'
      + 'predicate second(integer value) = first(value); */')
      .map(({ name }) => name)).toEqual(['first', 'second']);
  });

  it('does not offer its own declaration while typing a formal parameter', () => {
    expect(visible('/*@ predicate current(integer val§ue) = value > 0; */')).toEqual([]);
  });

  it('restores the function name at the end of its completed parameter header', () => {
    expect(visible('/*@ predicate current(integer value)§ = value > 0; */')
      .map(({ name }) => name)).toEqual(['current']);
  });

  it('deduplicates prototypes and definitions despite renamed formal parameters', () => {
    const symbols = visible('/*@ predicate positive(integer x); */\n'
      + '/*@ predicate positive(integer value) = value > 0; */\n'
      + '/*@ requires pos§; */');
    expect(symbols).toHaveLength(1);
    expect(symbols[0]?.parameters.map(({ name }) => name)).toEqual(['value']);
  });

  it('preserves overloads having different parameter type spellings', () => {
    const symbols = visible('/*@ predicate positive(integer value);\n'
      + 'predicate positive(real value); */\n/*@ requires pos§; */');
    expect(symbols.map(({ signature }) => signature)).toEqual([
      'predicate positive(integer value)',
      'predicate positive(real value)',
    ]);
  });

  it('preserves distinct arities and return types without choosing a best overload', () => {
    const symbols = visible('/*@ logic integer convert(integer value);\n'
      + 'logic real convert(integer value);\n'
      + 'logic integer convert(integer value, integer base); */\n/*@ ensures con§; */');
    expect(symbols).toHaveLength(3);
    expect(new Set(symbols.map(({ overloadKey }) => overloadKey)).size).toBe(3);
  });

  it('preserves array bounds when distinguishing lexical overload signatures', () => {
    const symbols = visible('/*@ predicate same(integer values[5]);\n'
      + 'predicate same(integer values[10]); */\n/*@ assert sa§; */');
    expect(symbols).toHaveLength(2);
    expect(symbols.map(({ parameters }) => parameters[0]?.typeText)).toEqual([
      'integer[10]', 'integer[5]',
    ]);
  });

  it('retains function-pointer parameter details without capturing nested argument names', () => {
    const symbol = only('/*@ predicate apply(int (*callback)(int inner), int value); */');
    expect(symbol.parameters.map(({ name }) => name)).toEqual(['callback', 'value']);
    expect(symbol.signature).toBe('predicate apply(int (*) ( int inner ) callback, int value)');
  });

  it('deduplicates alpha-renamed generic declarations', () => {
    const symbols = visible('/*@ logic A identity<A>(A original); */\n'
      + '/*@ logic T identity<T>(T value) = value; */\n'
      + '/*@ ensures id§; */');
    expect(symbols).toHaveLength(1);
    expect(symbols[0]?.signature).toBe('logic T identity<T>(T value)');
  });

  it('sorts candidate names deterministically', () => {
    expect(visible('/*@ predicate zed(integer value);\n'
      + 'logic integer alpha(integer value);\n'
      + 'predicate middle(integer value); */\n/*@ assert §; */')
      .map(({ name }) => name)).toEqual(['alpha', 'middle', 'zed']);
  });

  it('returns no candidates for an empty index', () => {
    expect(visible('/*@ requires §; */')).toEqual([]);
  });
});

describe('acslDocumentCallSnippet', () => {
  it('uses declared argument names as editable placeholders without a semicolon', () => {
    expect(acslDocumentCallSnippet(only(
      '/*@ predicate ordered(integer lower, integer upper); */',
    ))).toBe('ordered(${1:lower}, ${2:upper})');
  });

  it('includes optional explicit label arguments before value arguments', () => {
    expect(acslDocumentCallSnippet(only(
      '/*@ logic integer delta{Before, After}(int *pointer, integer offset); */',
    ))).toBe('delta{${1:Before}, ${2:After}}(${3:pointer}, ${4:offset})');
  });

  it('leaves generic type arguments to ordinary inference rather than guessing them', () => {
    expect(acslDocumentCallSnippet(only(
      '/*@ logic T identity<T>(T value); */',
    ))).toBe('identity(${1:value})');
  });

  it.each([
    ['logic integer limit = 7;', 'limit'],
    ['predicate ready = \\true;', 'ready'],
    ['logic integer empty() = 0;', 'empty()'],
    ['predicate trivial() = \\true;', 'trivial()'],
    ['predicate contextual{L} = \\true;', 'contextual{${1:L}}'],
  ])('keeps constants plain and explicit empty lists intact: %s', (declaration, expected) => {
    expect(acslDocumentCallSnippet(only('/*@ ' + declaration + ' */'))).toBe(expected);
  });
});
