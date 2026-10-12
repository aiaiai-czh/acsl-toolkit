import { describe, expect, it } from 'vitest';

import { ACSL_CATALOG, getAcslCatalogEntry } from '../../src/completion/catalog';
import {
  compareAcslEntries,
  getAcslFilterText,
  getAcslInsertText,
  getAcslSortText,
  hasFollowingAcslCallArguments,
  isAcslCallableSnippet,
  selectAcslCompletionEntries,
  shouldConsumeFollowingSemicolon,
} from '../../src/completion/completionItems';

import type { AcslPrefix } from '../../src/completion/prefix';
import type { AcslCatalogEntry } from '../../src/types/catalog';

const SPEC = {
  version: '1.24',
  section: 'Test fixture',
  sourceUrl: 'https://example.invalid/acsl',
} as const;

function prefix(text: string, mode: AcslPrefix['mode'] = 'word'): AcslPrefix {
  return { text, startOffset: 0, endOffset: text.length, mode };
}

function labels(text: string, mode: AcslPrefix['mode'] = 'word'): string[] {
  return selectAcslCompletionEntries(prefix(text, mode)).entries.map(
    ({ label }) => label,
  );
}

function entry(
  label: string,
  priority: number,
  overrides: Partial<AcslCatalogEntry> = {},
): AcslCatalogEntry {
  return {
    id: `test.${label}`,
    label,
    category: 'keyword',
    detail: 'Test entry',
    documentation: 'Test entry.',
    priority,
    insertion: 'plain',
    spec: SPEC,
    ...overrides,
  };
}

describe('selectAcslCompletionEntries', () => {
  it.each([
    ['req', 'word', ['requires']],
    ['ens', 'word', ['ensures']],
    ['\\res', 'backslash', ['\\result']],
    ['\\fo', 'backslash', ['\\forall']],
    ['loop inv', 'multiword', ['loop invariant']],
  ] as const)(
    'maps %s to the expected lexical completion',
    (text, mode, expected) => {
      expect(labels(text, mode)).toEqual(expected);
    },
  );

  it('returns and orders all valid built-ins for \\va', () => {
    const matches = labels('\\va', 'backslash');

    expect(matches).toEqual(['\\valid', '\\valid_read', '\\valid_function']);
    expect(matches.indexOf('\\valid')).toBeLessThan(
      matches.indexOf('\\valid_read'),
    );
  });

  it('matches backslash and plain-word callable built-ins', () => {
    expect(labels('\\ma', 'backslash')).toEqual(['\\max', '\\match']);
    expect(labels('\\mi', 'backslash')).toEqual(['\\min']);
    expect(labels('\\ab', 'backslash')).toEqual(['\\abs']);
    expect(labels('real_of_fl')).toEqual(['real_of_float']);
    expect(labels('real_of_do')).toEqual(['real_of_double']);
    expect(labels('pow')).toEqual(['pow']);
  });

  it('offers loop clauses from the loop prefix', () => {
    const matches = labels('loop', 'multiword');

    expect(matches).toContain('loop invariant');
    expect(matches).toContain('loop assigns');
    expect(matches).toContain('loop variant');
  });

  it('does not mix backslash constructs into ordinary word completion', () => {
    expect(labels('v', 'word')).not.toContain('\\valid');
  });

  it('matches a normalized multiword alias', () => {
    expect(labels('  LOOP\t INV  ', 'multiword')).toEqual(['loop invariant']);
  });

  it('sorts by priority, then label length, then label text', () => {
    const catalog = [
      entry('beta', 10),
      entry('alpha', 10),
      entry('an', 10),
      entry('zeta', 2),
    ];
    const selection = selectAcslCompletionEntries(prefix(''), catalog, 10);

    expect(selection.entries.map(({ label }) => label)).toEqual([
      'zeta',
      'an',
      'beta',
      'alpha',
    ]);
    expect([...catalog].sort(compareAcslEntries).map(({ label }) => label)).toEqual(
      ['zeta', 'an', 'beta', 'alpha'],
    );
  });

  it('limits an empty-prefix shortlist to 25 and marks it incomplete', () => {
    const selection = selectAcslCompletionEntries(prefix(''));

    expect(selection.entries).toHaveLength(25);
    expect(selection.isIncomplete).toBe(true);
    expect(selection.entries).toEqual(
      [...ACSL_CATALOG].sort(compareAcslEntries).slice(0, 25),
    );
  });

  it('limits the bare-backslash shortlist to 25 built-ins', () => {
    const selection = selectAcslCompletionEntries(prefix('\\', 'backslash'));

    expect(selection.entries).toHaveLength(25);
    expect(selection.isIncomplete).toBe(true);
    expect(selection.entries.every(({ label }) => label.startsWith('\\'))).toBe(
      true,
    );
  });

  it('returns a complete result once a character follows the backslash', () => {
    expect(selectAcslCompletionEntries(prefix('\\v', 'backslash')).isIncomplete).toBe(
      false,
    );
  });

  it('honors an explicit shortlist limit', () => {
    const selection = selectAcslCompletionEntries(prefix(''), ACSL_CATALOG, 3);

    expect(selection.entries).toHaveLength(3);
    expect(selection.isIncomplete).toBe(true);
  });
});

describe('completion item metadata helpers', () => {
  it('recognizes existing callable suffixes with labels and type arguments', () => {
    for (const suffix of [
      '(',
      '  (',
      '{Old}(',
      ' {LoopEntry} (',
      '<integer>(',
      ' <A> (',
    ]) {
      expect(hasFollowingAcslCallArguments(suffix), suffix).toBe(true);
    }

    for (const suffix of ['', '{Old}', '<A>', '{Old}\n(', 'value(']) {
      expect(hasFollowingAcslCallArguments(suffix), suffix).toBe(false);
    }
  });

  it('produces deterministic fixed-width sort text', () => {
    const requires = getAcslCatalogEntry('clause.requires');
    expect(requires).toBeDefined();

    expect(getAcslSortText(requires!)).toBe('010:008:requires');
  });

  it('includes aliases in filter text', () => {
    const loopInvariant = getAcslCatalogEntry('multiword.loop-invariant');
    expect(loopInvariant).toBeDefined();

    expect(getAcslFilterText(loopInvariant!)).toBe('loop invariant loop inv');
  });

  it('keeps the snippet semicolon when none follows the cursor', () => {
    const requires = getAcslCatalogEntry('clause.requires');
    expect(requires).toBeDefined();

    expect(getAcslInsertText(requires!, false)).toBe(
      'requires ${1:predicate};',
    );
  });

  it('removes a snippet semicolon when one already follows the cursor', () => {
    const requires = getAcslCatalogEntry('clause.requires');
    expect(requires).toBeDefined();

    expect(getAcslInsertText(requires!, true)).toBe(
      'requires ${1:predicate}',
    );
  });

  it('keeps multiline block structure and line breaks in snippets', () => {
    const axiomatic = getAcslCatalogEntry('keyword.axiomatic');
    const inductive = getAcslCatalogEntry('keyword.inductive');
    const behavior = getAcslCatalogEntry('clause.behavior');

    expect(getAcslInsertText(axiomatic!, false)).toBe(
      'axiomatic ${1:name} {\n\t${2:declarations}\n}',
    );
    expect(getAcslInsertText(inductive!, false)).toBe(
      'inductive ${1:name}(${2:parameters}) {\n\tcase ${3:case_name}: ${4:predicate};\n}',
    );
    expect(getAcslInsertText(behavior!, false)).toBe(
      'behavior ${1:name}:\n\t${2:clauses}',
    );
  });

  it('folds multiline snippets to one valid physical line in line annotations', () => {
    const axiomatic = getAcslCatalogEntry('keyword.axiomatic');
    const behavior = getAcslCatalogEntry('clause.behavior');
    const predicate = getAcslCatalogEntry('keyword.predicate');

    expect(getAcslInsertText(axiomatic!, false, 'line')).toBe(
      'axiomatic ${1:name} { ${2:declarations} }',
    );
    expect(getAcslInsertText(behavior!, false, 'line')).toBe(
      'behavior ${1:name}: ${2:clauses}',
    );
    expect(getAcslInsertText(predicate!, false, 'line')).toBe(
      'predicate ${1:name}(${2:parameters}) = ${3:predicate};',
    );
  });

  it('does not alter plain insertion text when a semicolon follows', () => {
    const result = getAcslCatalogEntry('builtin.result');
    expect(result).toBeDefined();

    expect(getAcslInsertText(result!, true)).toBe('\\result');
  });

  it('inserts parameter placeholders for every callable built-in', () => {
    for (const callable of ACSL_CATALOG.filter(
      ({ category }) => category === 'builtin-function',
    )) {
      expect(isAcslCallableSnippet(callable), callable.id).toBe(true);
      expect(getAcslInsertText(callable, false), callable.id).toBe(
        callable.snippetBody,
      );
    }

    expect(getAcslInsertText(getAcslCatalogEntry('builtin.max')!, false)).toBe(
      '\\max(${1:x}, ${2:y})',
    );
    expect(getAcslInsertText(getAcslCatalogEntry('builtin.at')!, false)).toBe(
      '\\at(${1:expression}, ${2:label})',
    );
    expect(getAcslInsertText(getAcslCatalogEntry('builtin.sum')!, false)).toBe(
      '\\sum(${1:lower}, ${2:upper}, ${3:function})',
    );
    expect(
      getAcslInsertText(getAcslCatalogEntry('builtin.atan2')!, false),
    ).toBe('\\atan2(${1:y}, ${2:x})');
    expect(
      getAcslInsertText(getAcslCatalogEntry('builtin.pow-integer')!, false),
    ).toBe('pow(${1:base}, ${2:exponent})');
    expect(
      getAcslInsertText(getAcslCatalogEntry('builtin.abs')!, false, 'line'),
    ).toBe('\\abs(${1:value})');
  });

  it('keeps existing call parentheses instead of inserting a second pair', () => {
    for (const callable of ACSL_CATALOG.filter(
      ({ category }) => category === 'builtin-function',
    )) {
      expect(
        getAcslInsertText(callable, false, 'block', true),
        callable.id,
      ).toBe(callable.label);
    }
  });

  it('does not consume a following semicolon for callable snippets', () => {
    for (const callable of ACSL_CATALOG.filter(
      ({ category }) => category === 'builtin-function',
    )) {
      expect(shouldConsumeFollowingSemicolon(callable, true), callable.id).toBe(
        false,
      );
    }
  });

  it('consumes a stray following semicolon for non-semicolon snippets', () => {
    const axiomatic = getAcslCatalogEntry('keyword.axiomatic');
    const behavior = getAcslCatalogEntry('clause.behavior');
    const predicate = getAcslCatalogEntry('keyword.predicate');
    const result = getAcslCatalogEntry('builtin.result');

    expect(shouldConsumeFollowingSemicolon(axiomatic!, true)).toBe(true);
    expect(shouldConsumeFollowingSemicolon(behavior!, true)).toBe(true);
    expect(shouldConsumeFollowingSemicolon(predicate!, true)).toBe(false);
    expect(shouldConsumeFollowingSemicolon(result!, true)).toBe(false);
    expect(shouldConsumeFollowingSemicolon(axiomatic!, false)).toBe(false);
  });

  it('has one catalog entry per label, including snippet-backed labels', () => {
    const labelsInCatalog = ACSL_CATALOG.map(({ label }) => label);

    expect(new Set(labelsInCatalog).size).toBe(labelsInCatalog.length);
    expect(labelsInCatalog.filter((label) => label === 'requires')).toHaveLength(1);
    expect(getAcslCatalogEntry('clause.requires')).toMatchObject({
      label: 'requires',
      insertion: 'snippet',
      snippetBody: 'requires ${1:predicate};',
    });
  });
});
