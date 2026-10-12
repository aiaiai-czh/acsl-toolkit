import { describe, expect, it } from 'vitest';

import { scanAcslContext } from '../../src/context/acslContext';
import { collectAcslLocalSymbols } from '../../src/symbols/localSymbols';

function symbolsAt(markedSource: string) {
  const cursorOffset = markedSource.indexOf('§');
  if (cursorOffset < 0 || markedSource.indexOf('§', cursorOffset + 1) >= 0) {
    throw new Error('Fixture must contain exactly one § cursor marker');
  }

  const source =
    markedSource.slice(0, cursorOffset) + markedSource.slice(cursorOffset + 1);
  const context = scanAcslContext(source, cursorOffset);
  if (context === undefined) {
    throw new Error('Fixture cursor must be in ACSL annotation content');
  }

  return { source, symbols: collectAcslLocalSymbols(source, context) };
}

function namesAt(markedSource: string): readonly string[] {
  return symbolsAt(markedSource).symbols.map((symbol) => symbol.name).sort();
}

describe('binding recovery and declarator boundaries', () => {
  it.each(['+', '-', '/', '%', '&&', '<', '>'])(
    'does not treat a set expression using %s as a typed comprehension',
    (operator) => {
      expect(namesAt(`/*@ assert {x | y ${operator} z§}; */`)).toEqual([]);
    },
  );

  it('ignores binders inside an escaped CRLF string continuation', () => {
    expect(namesAt('/*@ assert "line\\\r\n\\forall integer fake; fake" != "";\n f§ > 0; */')).toEqual([]);
  });

  it('recognizes a function-pointer parameter without collecting argument types', () => {
    expect(namesAt('/*@ predicate p(int (*callback)(CustomType), integer value) = c§(value); */'))
      .toEqual(['callback', 'value']);
  });

  it('recognizes ACSL array types preceding the parameter name', () => {
    expect(namesAt('/*@ predicate p(integer[] values) = v§[0] > 0; */')).toEqual(['values']);
  });

  it('retains shared pointer types across quantifier declarators', () => {
    const { symbols } = symbolsAt(String.raw`/*@ assert \forall Node *first, *second; s§ != first; */`);
    expect(symbols.find(({ name }) => name === 'second')?.typeText).toBe('Node*');
    const nestedPointers = symbolsAt(String.raw`/*@ assert \forall Node **first, **second; s§ != first; */`).symbols;
    expect(nestedPointers.find(({ name }) => name === 'second')?.typeText).toBe('Node**');
  });

  it('accepts a comprehension with an omitted condition', () => {
    expect(namesAt('/*@ ensures \\result == {i§ | integer index}; */')).toEqual(['index']);
  });

  it('does not bind a name from an incomplete let initializer', () => {
    expect(namesAt('/*@ logic integer f(integer value) = \\let result = v§')).toEqual(['value']);
  });

  it('tolerates unfinished and unmatched delimiter edits', () => {
    expect(() => namesAt('/*@ assert (((((§')).not.toThrow();
    expect(namesAt('/*@ assert ) \\let x = 1; x§; */')).toEqual(['x']);
  });

  it('limits recursion in deeply nested editing buffers', () => {
    const source = `/*@ assert ${'('.repeat(600)}v§${')'.repeat(600)}; */`;
    expect(namesAt(source)).toEqual([]);
  });
});

describe('ACSL definition parameters', () => {
  it('offers predicate parameters from the first character in its body', () => {
    const { source, symbols } = symbolsAt(
      '/*@ predicate positive(integer value) = v§ > 0; */',
    );
    expect(symbols).toEqual([
      expect.objectContaining({
        name: 'value',
        kind: 'parameter',
        typeText: 'integer',
        declarationOffset: source.indexOf('value'),
      }),
    ]);
  });

  it('offers every parameter of a logic function', () => {
    expect(
      namesAt('/*@ logic real mix(integer count, real scale) = c§ * scale; */'),
    ).toEqual(['count', 'scale']);
  });

  it('supports multiline definition signatures and bodies', () => {
    expect(
      namesAt(
        '/*@\n  predicate bounded(\n    integer value,\n    integer limit\n  ) =\n    v§ <= limit;\n*/',
      ),
    ).toEqual(['limit', 'value']);
  });

  it('excludes formal labels from variable candidates', () => {
    expect(
      namesAt('/*@ predicate changed{Before,After}(integer value) = v§ > 0; */'),
    ).toEqual(['value']);
  });

  it('excludes formal type parameters and accepts labels before types', () => {
    expect(
      namesAt('/*@ predicate same{L}<A,B>(A left, B right) = l§ == right; */'),
    ).toEqual(['left', 'right']);
  });

  it('accepts formal types before labels', () => {
    expect(
      namesAt('/*@ logic A identity<A>{L}(A value) = v§; */'),
    ).toEqual(['value']);
  });

  it('recognizes custom types, pointers, and array parameter names', () => {
    expect(
      namesAt(
        '/*@ predicate available(Node *node, integer values[], struct Item *item) = n§ != item; */',
      ),
    ).toEqual(['item', 'node', 'values']);
  });

  it('does not treat commas inside a polymorphic type as parameter separators', () => {
    expect(
      namesAt(
        '/*@ logic integer size(pair<integer,real> values, integer limit) = v§; */',
      ),
    ).toEqual(['limit', 'values']);
  });

  it('offers parameters inside a reads clause', () => {
    expect(
      namesAt('/*@ logic integer head(integer *values) reads v§[0]; */'),
    ).toEqual(['values']);
  });

  it('keeps parameters across a comma-separated reads list and its body', () => {
    for (const source of [
      '/*@ logic integer f(integer *left, integer *right) reads left[0], r§[0]; */',
      '/*@ logic integer f(integer *left, integer *right) reads left[0], right[0] = r§; */',
    ]) {
      expect(namesAt(source)).toEqual(['left', 'right']);
    }
  });

  it('does not leak parameters past their definition terminator', () => {
    expect(
      namesAt(
        '/*@ predicate first(integer secret) = secret > 0;\n lemma later: s§ > 0; */',
      ),
    ).toEqual([]);
  });

  it('uses only the current definition when several occur in one annotation', () => {
    expect(
      namesAt(
        '/*@ predicate first(integer oldValue) = oldValue > 0;\n logic integer second(integer newValue) = n§; */',
      ),
    ).toEqual(['newValue']);
  });

  it('does not offer parameters before the definition body', () => {
    expect(namesAt('/*@ predicate bounded(integer value, real §')).toEqual([]);
  });

  it('supports an unfinished annotation and definition body', () => {
    expect(namesAt('/*@ logic integer next(integer value) = v§')).toEqual([
      'value',
    ]);
  });

  it('supports parameters inside an axiomatic declaration block', () => {
    expect(
      namesAt(
        '/*@ axiomatic Bounds { predicate bounded(integer value) = v§ > 0; } */',
      ),
    ).toEqual(['value']);
  });
});

describe('ACSL expression binders', () => {
  it('offers a forall variable only after its binder semicolon', () => {
    const { symbols } = symbolsAt(String.raw`/*@ assert \forall integer index; i§ >= 0; */`);
    expect(symbols).toEqual([
      expect.objectContaining({ name: 'index', kind: 'forall', typeText: 'integer' }),
    ]);
  });

  it('does not offer a variable in an unfinished forall declaration', () => {
    expect(namesAt(String.raw`/*@ assert \forall integer index§`)).toEqual([]);
  });

  it('offers an exists variable', () => {
    const { symbols } = symbolsAt(String.raw`/*@ assert \exists real value; v§ > 0; */`);
    expect(symbols).toEqual([
      expect.objectContaining({ name: 'value', kind: 'exists', typeText: 'real' }),
    ]);
  });

  it('propagates a shared type through comma-separated forall variables', () => {
    const { symbols } = symbolsAt(String.raw`/*@ assert \forall integer row, column; r§ == column; */`);
    expect(symbols).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'row', typeText: 'integer' }),
        expect.objectContaining({ name: 'column', typeText: 'integer' }),
      ]),
    );
    expect(symbols).toHaveLength(2);
  });

  it('starts a new type group within a quantifier binder list', () => {
    const { symbols } = symbolsAt(String.raw`/*@ assert \forall integer row, column, real factor; f§ > row; */`);
    expect(symbols).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'row', typeText: 'integer' }),
        expect.objectContaining({ name: 'column', typeText: 'integer' }),
        expect.objectContaining({ name: 'factor', typeText: 'real' }),
      ]),
    );
    expect(symbols).toHaveLength(3);
  });

  it('supports pointer and array quantifier declarations', () => {
    expect(
      namesAt(String.raw`/*@ assert \forall Node *first, *second, integer values[]; f§ != second; */`),
    ).toEqual(['first', 'second', 'values']);
  });

  it('offers lambda arguments within a higher-order function', () => {
    const { symbols } = symbolsAt(String.raw`/*@ ensures \sum(0, 9, \lambda integer index; i§ * index) >= 0; */`);
    expect(symbols).toEqual([
      expect.objectContaining({ name: 'index', kind: 'lambda', typeText: 'integer' }),
    ]);
  });

  it('supports multiple lambda arguments', () => {
    expect(
      namesAt(String.raw`/*@ logic integer apply(integer limit) = (\lambda integer row, column; r§ + column); */`),
    ).toEqual(['column', 'limit', 'row']);
  });

  it.each([
    ['∀', 'forall'],
    ['∃', 'exists'],
  ] as const)('supports the %s quantifier spelling', (spelling, kind) => {
    const { symbols } = symbolsAt(`/*@ assert ${spelling} integer value; v§ > 0; */`);
    expect(symbols).toEqual([
      expect.objectContaining({ name: 'value', kind }),
    ]);
  });

  it('combines parameters and nested quantifiers', () => {
    expect(
      namesAt(String.raw`/*@ predicate bounded(integer limit) = \forall integer row; \exists real value; v§ > row + limit; */`),
    ).toEqual(['limit', 'row', 'value']);
  });

  it('keeps a quantifier scope across nested parentheses and commas', () => {
    expect(
      namesAt(String.raw`/*@ assert (\forall integer index; f(g(index, 1), i§) > 0); */`),
    ).toEqual(['index']);
  });

  it('ends a quantifier scope when its enclosing parentheses close', () => {
    expect(
      namesAt(String.raw`/*@ assert (\forall integer privateValue; privateValue > 0) && p§ > 0; */`),
    ).toEqual([]);
  });

  it('ends a lambda scope at the next outer function argument', () => {
    expect(
      namesAt(String.raw`/*@ ensures apply(\lambda integer privateValue; privateValue + 1, p§) > 0; */`),
    ).toEqual([]);
  });

  it('ends an unparenthesized quantifier scope at the next outer function argument', () => {
    expect(
      namesAt(String.raw`/*@ assert either(\forall integer privateValue; privateValue > 0, p§ > 0); */`),
    ).toEqual([]);
  });

  it('keeps a bound variable inside the true branch of a conditional', () => {
    expect(
      namesAt(String.raw`/*@ assert condition ? (\forall integer selected; s§ > 0) : fallback; */`),
    ).toEqual(['selected']);
  });

  it('does not leak a conditional true-branch binding into the false branch', () => {
    expect(
      namesAt(String.raw`/*@ assert condition ? \forall integer selected; selected > 0 : s§ > 0; */`),
    ).toEqual([]);
  });

  it('does not end an outer quantifier at an inner conditional colon', () => {
    expect(
      namesAt(String.raw`/*@ assert \forall integer index; condition ? f(index) : i§ > 0; */`),
    ).toEqual(['index']);
  });

  it('ends binders at the clause terminator rather than a later clause', () => {
    expect(
      namesAt(String.raw`/*@ requires \forall integer privateValue; privateValue > 0; ensures p§ > 0; */`),
    ).toEqual([]);
  });

  it('does not terminate definition parameters at a quantifier binder semicolon', () => {
    expect(
      namesAt(String.raw`/*@ predicate p(integer limit) = \forall integer value; v§ < limit; */`),
    ).toEqual(['limit', 'value']);
  });

  it('supports binders in an inductive case without leaking a previous case binder', () => {
    expect(
      namesAt(String.raw`/*@ inductive reachable(integer value) { case first: \forall integer previous; reachable(previous); case second: \exists integer next; n§ > 0; } */`),
    ).toContain('next');
    expect(
      namesAt(String.raw`/*@ inductive reachable(integer value) { case first: \forall integer previous; reachable(previous); case second: \exists integer next; n§ > 0; } */`),
    ).not.toContain('previous');
  });
});

describe('ACSL let bindings and shadowing', () => {
  it('offers a let name in its body', () => {
    const { symbols } = symbolsAt(String.raw`/*@ assert \let current = 1; c§ > 0; */`);
    expect(symbols).toEqual([
      expect.objectContaining({ name: 'current', kind: 'let' }),
    ]);
  });

  it('does not expose a let name in its initializer', () => {
    expect(
      namesAt(String.raw`/*@ assert \let current = c§ + 1; current > 0; */`),
    ).toEqual([]);
  });

  it('retains an outer parameter while a same-named let initializer is being edited', () => {
    const { source, symbols } = symbolsAt(String.raw`/*@ predicate p(integer value) = \let value = v§ + 1; value > 0; */`);
    expect(symbols).toEqual([
      expect.objectContaining({
        name: 'value',
        kind: 'parameter',
        declarationOffset: source.indexOf('value'),
      }),
    ]);
  });

  it('returns only the innermost declaration of a shadowed name', () => {
    const { source, symbols } = symbolsAt(String.raw`/*@ predicate p(integer value) = \let value = 1; v§ > 0; */`);
    expect(symbols).toEqual([
      expect.objectContaining({
        name: 'value',
        kind: 'let',
        declarationOffset: source.indexOf('value', source.indexOf('\\let')),
      }),
    ]);
  });

  it('returns the inner quantifier when it shadows a parameter', () => {
    const { symbols } = symbolsAt(String.raw`/*@ predicate p(integer value) = \forall real value; v§ > 0; */`);
    expect(symbols).toEqual([
      expect.objectContaining({ name: 'value', kind: 'forall', typeText: 'real' }),
    ]);
  });

  it('restores a parameter after the shadowing parenthesized expression ends', () => {
    const { symbols } = symbolsAt(String.raw`/*@ predicate p(integer value) = (\exists real value; value > 0) && v§ > 0; */`);
    expect(symbols).toEqual([
      expect.objectContaining({ name: 'value', kind: 'parameter', typeText: 'integer' }),
    ]);
  });

  it('combines successive let bindings without leaking them from parentheses', () => {
    expect(
      namesAt(String.raw`/*@ assert (\let first = 1; \let second = first + 1; s§ > first); */`),
    ).toEqual(['first', 'second']);
    expect(
      namesAt(String.raw`/*@ assert (\let first = 1; first > 0) && f§ > 0; */`),
    ).toEqual([]);
  });

  it('does not mistake an inner lambda binder semicolon for the end of a let initializer', () => {
    expect(
      namesAt(String.raw`/*@ assert \let result = apply(\lambda integer index; i§ + 1); result > 0; */`),
    ).toEqual(['index']);
  });

  it('ends the initializer lambda scope when the let body starts', () => {
    expect(
      namesAt(String.raw`/*@ assert \let result = apply(\lambda integer index; index + 1); r§ > 0; */`),
    ).toEqual(['result']);
  });

  it('offers all destructured tuple let names in the body', () => {
    expect(
      namesAt(String.raw`/*@ assert \let (left, right) = (1, 2); l§ < right; */`),
    ).toEqual(['left', 'right']);
  });

  it('does not expose destructured tuple names in their initializer', () => {
    expect(
      namesAt(String.raw`/*@ assert \let (left, right) = (l§, 2); left < right; */`),
    ).toEqual([]);
  });

  it('supports an unfinished let body', () => {
    expect(namesAt(String.raw`/*@ assert \let result = 1; r§`)).toEqual(['result']);
  });
});

describe('ACSL set comprehensions', () => {
  it('offers set comprehension binders inside the constraint', () => {
    const { symbols } = symbolsAt('/*@ assigns { index | integer index; i§ >= 0 }; */');
    expect(symbols).toEqual([
      expect.objectContaining({ name: 'index', kind: 'comprehension', typeText: 'integer' }),
    ]);
  });

  it('offers set comprehension binders in the mapping expression before their declarations', () => {
    expect(namesAt('/*@ assigns { i§ + 1 | integer index; index >= 0 }; */')).toEqual([
      'index',
    ]);
  });

  it('supports several set comprehension binders sharing a type', () => {
    expect(
      namesAt('/*@ assigns { row + column | integer row, column; r§ > column }; */'),
    ).toEqual(['column', 'row']);
  });

  it('ends comprehension scope at the closing brace', () => {
    expect(
      namesAt(String.raw`/*@ ensures \card({ index | integer index; index > 0 }) > i§; */`),
    ).toEqual([]);
  });

  it('keeps outer quantifier binders visible inside a comprehension', () => {
    expect(
      namesAt(String.raw`/*@ assert \forall integer limit; \card({ index | integer index; i§ < limit }) >= 0; */`),
    ).toEqual(['index', 'limit']);
  });
});

describe('ACSL local symbol isolation', () => {
  it('does not collect parameters from a previous annotation', () => {
    expect(
      namesAt('/*@ predicate p(integer privateValue) = privateValue > 0; */\n//@ assert p§ > 0;'),
    ).toEqual([]);
  });

  it('does not collect declarations from C source or ordinary comments', () => {
    expect(
      namesAt('int value;\n// predicate p(integer hidden) = hidden > 0;\n/*@ assert v§ > 0; */'),
    ).toEqual([]);
  });

  it('ignores declarations inside an ACSL line comment', () => {
    expect(
      namesAt(String.raw`/*@
        // \forall integer hidden; hidden > 0;
        assert h§ > 0;
      */`),
    ).toEqual([]);
  });

  it('ignores binder-like words inside quoted strings', () => {
    expect(
      namesAt(String.raw`/*@ assert "\forall integer hidden;" == "text" && h§ > 0; */`),
    ).toEqual([]);
  });

  it('does not predeclare parameters from a later definition', () => {
    expect(
      namesAt('/*@ lemma current: v§ > 0; predicate later(integer value) = value > 0; */'),
    ).toEqual([]);
  });

  it('supports a line annotation with a local binder', () => {
    expect(namesAt(String.raw`//@ assert \forall integer value; v§ > 0;`)).toEqual([
      'value',
    ]);
  });

  it('keeps scopes consistent across CRLF line endings', () => {
    expect(
      namesAt('/*@\r\n predicate p(integer value) =\r\n   \\forall integer index;\r\n   v§ > index;\r\n*/'),
    ).toEqual(['index', 'value']);
  });
});
