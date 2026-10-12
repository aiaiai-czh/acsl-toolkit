import { describe, expect, it } from 'vitest';

import {
  collectAcslAnnotationRanges,
  scanCSourceAtOffset,
} from '../../src/context/cLexicalScanner';

function contents(source: string): readonly string[] {
  return collectAcslAnnotationRanges(source).map((range) =>
    source.slice(range.contentStart, range.contentEnd),
  );
}

describe('collectAcslAnnotationRanges', () => {
  it('returns exact block and line offsets in source order', () => {
    const source = 'int x; /*@ requires x; */\n//@ assert x;\nint y;';
    const blockStart = source.indexOf('/*@');
    const blockEnd = source.indexOf('*/');
    const lineStart = source.indexOf('//@');
    const lineEnd = source.indexOf('\n', lineStart);

    expect(collectAcslAnnotationRanges(source)).toEqual([
      {
        kind: 'block',
        annotationStart: blockStart,
        contentStart: blockStart + 3,
        contentEnd: blockEnd,
      },
      {
        kind: 'line',
        annotationStart: lineStart,
        contentStart: lineStart + 3,
        contentEnd: lineEnd,
      },
    ]);
  });

  it.each(['', '/', '/*', '//', '/* @ logic integer ignored;', '// @ ignored'])(
    'ignores incomplete or non-ACSL markers: %s',
    (source) => {
      expect(collectAcslAnnotationRanges(source)).toEqual([]);
    },
  );

  it.each(['/*@', '//@', '/*@ logic integer value', '//@ predicate valid'])(
    'extends an unfinished annotation through EOF: %s',
    (source) => {
      expect(collectAcslAnnotationRanges(source)).toEqual([
        {
          kind: source.startsWith('/*') ? 'block' : 'line',
          annotationStart: 0,
          contentStart: 3,
          contentEnd: source.length,
        },
      ]);
    },
  );

  it.each(['\n', '\r', '\r\n'])(
    'ends a line annotation at the first line break: %j',
    (lineBreak) => {
      const source = `//@ first${lineBreak}//@ second${lineBreak}`;
      expect(contents(source)).toEqual([' first', ' second']);
    },
  );

  it.each([
    '// ordinary /*@ hidden */\n',
    '/* ordinary /*@ hidden */',
    'const char *s = "/*@ hidden */ //@ hidden";',
    'const char *s = "escaped \\" //@ hidden";',
    "char c = '\\''; char fake = '/*@ hidden */';",
    'const char *s = R"tag(/*@ hidden */\n//@ hidden)tag";',
    'const char *s = u8R"tag(/*@ hidden */)tag";',
    'const char *s = uR"tag(/*@ hidden */)tag";',
    'const char *s = UR"tag(/*@ hidden */)tag";',
    'const char *s = LR"tag(/*@ hidden */)tag";',
  ])('ignores markers hidden by C/C++ lexical states: %s', (prefix) => {
    const source = `${prefix}\n/*@ visible */`;
    expect(contents(source)).toEqual([' visible ']);
  });

  it('does not split a block annotation at inner markers or disabled lines', () => {
    const source = '/*@\n// predicate disabled(integer x);\n//@ hidden\n/*@ inner\npredicate active(integer x);\n*/';
    expect(contents(source)).toEqual([
      '\n// predicate disabled(integer x);\n//@ hidden\n/*@ inner\npredicate active(integer x);\n',
    ]);
  });

  it.each([
    '/*@ // disabled */ /*@ next */',
    '/*@ "literal */ /*@ next */',
    "/*@ 'literal */ /*@ next */",
  ])('keeps the block closing marker authoritative: %s', (source) => {
    expect(collectAcslAnnotationRanges(source)).toHaveLength(2);
    expect(contents(source)[1]).toBe(' next ');
  });

  it.each([
    '//@ // disabled\r\n/*@ next */',
    '//@ "literal\r\n/*@ next */',
    "//@ 'literal\n/*@ next */",
    '//@ "literal\\\r\n/*@ next */',
    "//@ 'literal\\\n/*@ next */",
  ])('ends line annotations inside disabled text or literals: %s', (source) => {
    const ranges = collectAcslAnnotationRanges(source);
    expect(ranges).toHaveLength(2);
    expect(ranges[0]?.contentEnd).toBe(source.search(/[\r\n]/u));
    expect(contents(source)[1]).toBe(' next ');
  });

  it.each([
    '/*@ // disabled',
    '/*@ "unfinished',
    "/*@ 'unfinished",
    '//@ // disabled',
    '//@ "unfinished',
    "//@ 'unfinished",
  ])('includes unfinished annotations in inner lexical states: %s', (source) => {
    expect(collectAcslAnnotationRanges(source)[0]?.contentEnd).toBe(source.length);
  });

  it('preserves multiline annotations containing escaped line breaks', () => {
    const source = '/*@ "text\\\r\npredicate visible(integer x);\n*/';
    expect(contents(source)).toEqual([
      ' "text\\\r\npredicate visible(integer x);\n',
    ]);
  });

  it('uses UTF-16 offsets rather than code points', () => {
    const source = '/* ordinary 😀 */ /*@ predicate p(integer x); */';
    expect(collectAcslAnnotationRanges(source)[0]?.annotationStart).toBe(
      source.indexOf('/*@'),
    );
  });

  it('shares annotation boundaries with cursor scanning', () => {
    const source = '// ignored /*@ */\n/*@ first */ int x; //@ second\r\n/*@ unfinished';
    for (const range of collectAcslAnnotationRanges(source)) {
      const atContentStart = scanCSourceAtOffset(source, range.contentStart);
      expect(atContentStart.annotationStart).toBe(range.annotationStart);
      expect(atContentStart.contentStart).toBe(range.contentStart);
      expect(atContentStart.state).toBe(range.kind === 'block' ? 'acslBlock' : 'acslLine');
      expect(scanCSourceAtOffset(source, range.contentEnd).annotationStart).toBe(
        range.annotationStart,
      );
    }
  });
});
