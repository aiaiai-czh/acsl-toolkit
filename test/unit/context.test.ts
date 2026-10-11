import { describe, expect, it } from 'vitest';

import {
  isInAcslAnnotation,
  scanAcslContext,
} from '../../src/context/acslContext';

function atCursor(markedSource: string): {
  readonly source: string;
  readonly cursorOffset: number;
} {
  const cursorOffset = markedSource.indexOf('|');
  if (cursorOffset === -1 || markedSource.indexOf('|', cursorOffset + 1) !== -1) {
    throw new Error('Fixture must contain exactly one | cursor marker');
  }

  return {
    source:
      markedSource.slice(0, cursorOffset) + markedSource.slice(cursorOffset + 1),
    cursorOffset,
  };
}

function contextAt(markedSource: string) {
  const { source, cursorOffset } = atCursor(markedSource);
  return scanAcslContext(source, cursorOffset);
}

describe('scanAcslContext', () => {
  it('detects a block annotation', () => {
    expect(contextAt('/*@ req| */')).toEqual({
      kind: 'block',
      annotationStart: 0,
      contentStart: 3,
      cursorOffset: 7,
    });
  });

  it('detects a multiline block annotation', () => {
    expect(contextAt('int x;\n/*@\n  requires x;\n  ens|ures x;\n*/')).toEqual({
      kind: 'block',
      annotationStart: 7,
      contentStart: 10,
      cursorOffset: 30,
    });
  });

  it('detects an unfinished block annotation', () => {
    expect(contextAt('int x;\n/*@\n  req|')).toMatchObject({
      kind: 'block',
      annotationStart: 7,
      contentStart: 10,
    });
  });

  it('detects a line annotation', () => {
    expect(contextAt('int x; //@ req|')).toEqual({
      kind: 'line',
      annotationStart: 7,
      contentStart: 10,
      cursorOffset: 14,
    });
  });

  it('ends a line annotation at LF', () => {
    expect(contextAt('//@ req\nint x|;')).toBeUndefined();
  });

  it('ends a line annotation at CRLF', () => {
    expect(contextAt('//@ req\r\nint x|;')).toBeUndefined();
  });

  it('still detects a line annotation immediately before CRLF', () => {
    expect(contextAt('//@ req|\r\nint x;')).toMatchObject({ kind: 'line' });
  });

  it.each([
    '// req|',
    '/* req| */',
    'int req|;',
  ])('does not trigger in ordinary source: %s', (source) => {
    expect(contextAt(source)).toBeUndefined();
  });

  it('ignores an ACSL marker in an ordinary line comment', () => {
    expect(contextAt('// ordinary /*@ req|')).toBeUndefined();
  });

  it('ignores an ACSL marker in an ordinary block comment', () => {
    expect(contextAt('/* ordinary\n  /*@ req|\n*/')).toBeUndefined();
  });

  it('recognizes an annotation after an ordinary block comment closes', () => {
    expect(contextAt('/* ordinary */ /*@ req|')).toMatchObject({
      kind: 'block',
    });
  });

  it('ignores a block marker in a string literal', () => {
    expect(contextAt('const char *s = "/*@ req| */";')).toBeUndefined();
  });

  it('ignores a line marker after an escaped quote in a string', () => {
    expect(contextAt('const char *s = "escaped \\" //@ req|";')).toBeUndefined();
  });

  it('recognizes an annotation after an escaped-newline string ends', () => {
    expect(contextAt('const char *s = "first\\\r\nsecond"; /*@ req| */')).toMatchObject({
      kind: 'block',
    });
  });

  it('ignores markers in a character literal', () => {
    expect(contextAt("int marker = '/*@ req| */';")).toBeUndefined();
  });

  it('recognizes an annotation after a character literal closes', () => {
    expect(contextAt("char marker = '@'; /*@ req|")).toMatchObject({
      kind: 'block',
    });
  });

  it.each(['"unterminated\n/*@ req|', "'unterminated\n/*@ req|"])(
    'recovers from an unterminated literal at line end: %s',
    (source) => {
      expect(contextAt(source)).toMatchObject({ kind: 'block' });
    },
  );

  it.each([
    'const char *s = R"tag(/*@ req| */)tag";',
    'const char *s = u8R"(/*@ req| */)";',
    'const wchar_t *s = LR"delim(//@ req|)delim";',
  ])('ignores markers in a C++ raw string: %s', (source) => {
    expect(contextAt(source)).toBeUndefined();
  });

  it('recognizes an annotation after a raw string terminator', () => {
    expect(
      contextAt('const char *s = R"tag(text)tag"; /*@ req| */'),
    ).toMatchObject({ kind: 'block' });
  });

  it('selects the annotation containing the cursor when there are several', () => {
    expect(
      contextAt('/*@ first */ int x; //@ second|\n/*@ third */'),
    ).toEqual({
      kind: 'line',
      annotationStart: 20,
      contentStart: 23,
      cursorOffset: 30,
    });
  });

  it('is active immediately after a complete opening marker', () => {
    expect(contextAt('/*@|')).toEqual({
      kind: 'block',
      annotationStart: 0,
      contentStart: 3,
      cursorOffset: 3,
    });
    expect(contextAt('//@|')).toEqual({
      kind: 'line',
      annotationStart: 0,
      contentStart: 3,
      cursorOffset: 3,
    });
  });

  it('is not active inside an opening marker', () => {
    expect(contextAt('/*|@ req */')).toBeUndefined();
    expect(contextAt('//@'.replace('@', '|@'))).toBeUndefined();
  });

  it('is active before a block terminator but not after it', () => {
    expect(contextAt('/*@ req |*/')).toMatchObject({ kind: 'block' });
    expect(contextAt('/*@ req *|/')).toBeUndefined();
    expect(contextAt('/*@ req */|')).toBeUndefined();
  });

  it('does not leak state from a completed annotation', () => {
    expect(contextAt('/*@ req */ int value|;')).toBeUndefined();
  });

  it('uses UTF-16 offsets consistently', () => {
    const fixture = atCursor('const char *s = "😀"; /*@ req| */');
    const context = scanAcslContext(fixture.source, fixture.cursorOffset);

    expect(context?.cursorOffset).toBe(fixture.cursorOffset);
    expect(context?.annotationStart).toBe(fixture.source.indexOf('/*@'));
  });

  it('rejects offsets outside the document', () => {
    expect(() => scanAcslContext('text', -1)).toThrow(RangeError);
    expect(() => scanAcslContext('text', 5)).toThrow(RangeError);
    expect(() => scanAcslContext('text', 1.5)).toThrow(TypeError);
  });
});

describe('isInAcslAnnotation', () => {
  it('provides a boolean convenience API', () => {
    const block = atCursor('/*@ req| */');
    const code = atCursor('int req|;');

    expect(isInAcslAnnotation(block.source, block.cursorOffset)).toBe(true);
    expect(isInAcslAnnotation(code.source, code.cursorOffset)).toBe(false);
  });
});
