import { describe, expect, it } from 'vitest';

import {
  extractAcslPrefix,
  normalizeAcslPrefix,
} from '../../src/completion/prefix';

interface MarkedSource {
  readonly source: string;
  readonly cursorOffset: number;
}

function atCursor(markedSource: string): MarkedSource {
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

function prefixAt(markedSource: string, annotationMarker = '/*@') {
  const fixture = atCursor(markedSource);
  const annotationStart = fixture.source.indexOf(annotationMarker);
  if (annotationStart === -1) {
    throw new Error(`Fixture does not contain ${annotationMarker}`);
  }

  return extractAcslPrefix(
    fixture.source,
    fixture.cursorOffset,
    annotationStart + annotationMarker.length,
  );
}

describe('normalizeAcslPrefix', () => {
  it('trims, collapses horizontal whitespace, and normalizes case', () => {
    expect(normalizeAcslPrefix('  Loop\t  INV  ')).toBe('loop inv');
  });
});

describe('extractAcslPrefix', () => {
  it.each([
    ['/*@ req| */', 'req', 4],
    ['/*@ ens| */', 'ens', 4],
    ['int x; //@ req|', 'req', 11],
  ])(
    'extracts an ordinary word from %s',
    (markedSource, expectedText, expectedStartOffset) => {
      const annotationMarker = markedSource.includes('//@') ? '//@' : '/*@';

      expect(prefixAt(markedSource, annotationMarker)).toEqual({
        text: expectedText,
        startOffset: expectedStartOffset,
        endOffset: expectedStartOffset + expectedText.length,
        mode: 'word',
      });
    },
  );

  it.each([
    ['/*@ \\va| */', '\\va'],
    ['/*@ \\res| */', '\\res'],
    ['/*@ \\fo| */', '\\fo'],
    ['/*@ \\| */', '\\'],
  ])('includes the leading backslash in %s', (markedSource, expectedText) => {
    expect(prefixAt(markedSource)).toEqual({
      text: expectedText,
      startOffset: 4,
      endOffset: 4 + expectedText.length,
      mode: 'backslash',
    });
  });

  it('extracts a complete multiword replacement range', () => {
    const fixture = atCursor('int x;\n/*@\n  loop inv|\n*/');
    const result = extractAcslPrefix(
      fixture.source,
      fixture.cursorOffset,
      fixture.source.indexOf('/*@') + 3,
    );

    expect(result).toEqual({
      text: 'loop inv',
      startOffset: fixture.source.indexOf('loop inv'),
      endOffset: fixture.cursorOffset,
      mode: 'multiword',
    });
    expect(fixture.source.slice(result.startOffset, fixture.cursorOffset)).toBe(
      'loop inv',
    );
  });

  it('preserves a trailing space while a multiword construct is being typed', () => {
    const result = prefixAt('/*@ loop |*/');

    expect(result).toEqual({
      text: 'loop ',
      startOffset: 4,
      endOffset: result.startOffset + result.text.length,
      mode: 'multiword',
    });
  });

  it('recognizes multiword aliases with flexible horizontal whitespace', () => {
    const result = prefixAt('/*@ loop\t inv| */');

    expect(result).toEqual({
      text: 'loop\t inv',
      startOffset: 4,
      endOffset: result.startOffset + result.text.length,
      mode: 'multiword',
    });
  });

  it('does not cross an LF line boundary', () => {
    const fixture = atCursor('/*@ loop\n  inv| */');
    const result = extractAcslPrefix(fixture.source, fixture.cursorOffset, 3);

    expect(result).toEqual({
      text: 'inv',
      startOffset: fixture.source.indexOf('inv'),
      endOffset: fixture.cursorOffset,
      mode: 'word',
    });
  });

  it('does not cross a CRLF line boundary', () => {
    const fixture = atCursor('/*@ loop\r\n  inv| */');
    const result = extractAcslPrefix(fixture.source, fixture.cursorOffset, 3);

    expect(result).toEqual({
      text: 'inv',
      startOffset: fixture.source.indexOf('inv'),
      endOffset: fixture.cursorOffset,
      mode: 'word',
    });
  });

  it('does not include text before the annotation content boundary', () => {
    const fixture = atCursor('loop /*@ inv| */');
    const contentStart = fixture.source.indexOf('/*@') + 3;
    const result = extractAcslPrefix(
      fixture.source,
      fixture.cursorOffset,
      contentStart,
    );

    expect(result).toEqual({
      text: 'inv',
      startOffset: fixture.source.indexOf('inv'),
      endOffset: fixture.cursorOffset,
      mode: 'word',
    });
    expect(result.startOffset).toBeGreaterThanOrEqual(contentStart);
  });

  it('returns an empty range after unrelated trailing whitespace', () => {
    const fixture = atCursor('/*@ requires x;  |*/');

    expect(extractAcslPrefix(fixture.source, fixture.cursorOffset, 3)).toEqual({
      text: '',
      startOffset: fixture.cursorOffset,
      endOffset: fixture.cursorOffset,
      mode: 'word',
    });
  });

  it('extracts only the final word after punctuation', () => {
    const fixture = atCursor('/*@ x + req| */');

    expect(extractAcslPrefix(fixture.source, fixture.cursorOffset, 3)).toEqual({
      text: 'req',
      startOffset: fixture.source.indexOf('req'),
      endOffset: fixture.cursorOffset,
      mode: 'word',
    });
  });

  it.each([
    ['/*@ requ|ires */', 'word', 'requires'],
    ['/*@ \\va|lid */', 'backslash', '\\valid'],
    ['/*@ lo|op invariant */', 'multiword', 'loop invariant'],
    ['/*@ loop inv|ariant */', 'multiword', 'loop invariant'],
  ] as const)(
    'extends the replacement range through the token suffix in %s',
    (markedSource, expectedMode, expectedReplacement) => {
      const fixture = atCursor(markedSource);
      const result = extractAcslPrefix(fixture.source, fixture.cursorOffset, 3);

      expect(result.mode).toBe(expectedMode);
      expect(
        fixture.source.slice(result.startOffset, result.endOffset),
      ).toBe(expectedReplacement);
    },
  );

  it('rejects invalid and non-integer offsets', () => {
    expect(() => extractAcslPrefix('/*@ req */', -1, 0)).toThrow(RangeError);
    expect(() => extractAcslPrefix('/*@ req */', 3, 4)).toThrow(RangeError);
    expect(() => extractAcslPrefix('/*@ req */', 20, 0)).toThrow(RangeError);
    expect(() => extractAcslPrefix('/*@ req */', 4.5, 0)).toThrow(TypeError);
    expect(() => extractAcslPrefix('/*@ req */', 4, 1.5)).toThrow(TypeError);
  });
});
