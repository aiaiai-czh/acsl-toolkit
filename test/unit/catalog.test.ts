import { describe, expect, it } from 'vitest';

import {
  ACSL_CATALOG,
  ACSL_CATALOG_BY_ID,
  ACSL_VERSION,
  ACSL_VERSION_METADATA,
  getAcslCatalog,
  getAcslCatalogByCategory,
  getAcslCatalogEntry,
} from '../../src/completion/catalog';

const BUILTIN_FUNCTION_ARGUMENTS: Readonly<
  Record<string, readonly string[]>
> = {
  'builtin.old': ['expression'],
  'builtin.at': ['expression', 'label'],
  'builtin.union': ['sets'],
  'builtin.inter': ['sets'],
  'builtin.max': ['x', 'y'],
  'builtin.min': ['x', 'y'],
  'builtin.sum': ['lower', 'upper', 'function'],
  'builtin.product': ['lower', 'upper', 'function'],
  'builtin.numof': ['lower', 'upper', 'predicate_function'],
  'builtin.base-addr': ['pointer'],
  'builtin.block-length': ['pointer'],
  'builtin.offset': ['pointer'],
  'builtin.allocation': ['pointer'],
  'builtin.list-cons': ['element', 'tail'],
  'builtin.concat': ['front', 'tail'],
  'builtin.repeat': ['sequence', 'count'],
  'builtin.length': ['sequence'],
  'builtin.nth': ['sequence', 'index'],
  'builtin.abs': ['value'],
  'builtin.sqrt': ['x'],
  'builtin.pow-real': ['base', 'exponent'],
  'builtin.pow-integer': ['base', 'exponent'],
  'builtin.ceil': ['x'],
  'builtin.floor': ['x'],
  'builtin.exp': ['x'],
  'builtin.log': ['x'],
  'builtin.log10': ['x'],
  'builtin.sin': ['x'],
  'builtin.cos': ['x'],
  'builtin.tan': ['x'],
  'builtin.cosh': ['x'],
  'builtin.sinh': ['x'],
  'builtin.tanh': ['x'],
  'builtin.asin': ['x'],
  'builtin.acos': ['x'],
  'builtin.atan': ['x'],
  'builtin.asinh': ['x'],
  'builtin.acosh': ['x'],
  'builtin.atanh': ['x'],
  'builtin.atan2': ['y', 'x'],
  'builtin.hypot': ['x', 'y'],
  'builtin.round-float': ['mode', 'value'],
  'builtin.round-double': ['mode', 'value'],
  'builtin.sign': ['value'],
  'builtin.exact': ['lvalue'],
  'builtin.round-error': ['lvalue'],
  'builtin.real-of-float': ['value'],
  'builtin.real-of-double': ['value'],
};

describe('ACSL 1.24 catalog', () => {
  it('is pinned to the audited official release', () => {
    expect(ACSL_VERSION).toBe('1.24');
    expect(ACSL_VERSION_METADATA).toMatchObject({
      tag: '1.24',
      commit: '585d28a206a7f7b06987292153cc02ca16b670ba',
      license: 'CC-BY-4.0',
    });
  });

  it('loads a broad catalog without duplicate ids or labels', () => {
    expect(ACSL_CATALOG.length).toBeGreaterThanOrEqual(150);
    expect(new Set(ACSL_CATALOG.map(({ id }) => id)).size).toBe(ACSL_CATALOG.length);
    expect(new Set(ACSL_CATALOG.map(({ label }) => label)).size).toBe(
      ACSL_CATALOG.length,
    );
    expect(ACSL_CATALOG_BY_ID.size).toBe(ACSL_CATALOG.length);
  });

  it('contains the required preview completion vocabulary', () => {
    const labels = new Set(ACSL_CATALOG.map(({ label }) => label));
    for (const label of [
      'requires',
      'ensures',
      'loop invariant',
      'writes',
      '\\valid',
      '\\valid_read',
      '\\result',
      '\\forall',
    ]) {
      expect(labels.has(label), `missing ${label}`).toBe(true);
    }
  });

  it('orders the exact validity predicate ahead of its longer sibling', () => {
    const valid = getAcslCatalogEntry('builtin.valid');
    const validRead = getAcslCatalogEntry('builtin.valid-read');
    expect(valid).toBeDefined();
    expect(validRead).toBeDefined();
    expect(valid!.priority).toBeLessThan(validRead!.priority);
  });

  it('attaches snippets to existing entries instead of duplicating labels', () => {
    expect(getAcslCatalogEntry('clause.requires')).toMatchObject({
      insertion: 'snippet',
      snippetBody: 'requires ${1:predicate};',
    });
    expect(getAcslCatalogEntry('multiword.loop-invariant')).toMatchObject({
      insertion: 'snippet',
      snippetBody: 'loop invariant ${1:predicate};',
    });
    expect(ACSL_CATALOG.filter(({ label }) => label === 'requires')).toHaveLength(1);
  });

  it('provides structured snippets for logic declarations and behaviors', () => {
    const expectedBodies = new Map([
      [
        'keyword.axiomatic',
        'axiomatic ${1:name} {\n\t${2:declarations}\n}',
      ],
      [
        'keyword.predicate',
        'predicate ${1:name}(${2:parameters}) = ${3:predicate};',
      ],
      [
        'keyword.logic',
        'logic ${1:return_type} ${2:name}(${3:parameters}) = ${4:term};',
      ],
      ['keyword.lemma', 'lemma ${1:name}: ${2:predicate};'],
      ['keyword.axiom', 'axiom ${1:name}: ${2:predicate};'],
      ['clause.behavior', 'behavior ${1:name}:\n\t${2:clauses}'],
      [
        'keyword.inductive',
        'inductive ${1:name}(${2:parameters}) {\n\tcase ${3:case_name}: ${4:predicate};\n}',
      ],
      ['keyword.case', 'case ${1:name}: ${2:predicate};'],
      ['keyword.type', 'type ${1:name} = ${2:type_definition};'],
    ]);

    for (const [id, snippetBody] of expectedBodies) {
      expect(getAcslCatalogEntry(id), id).toMatchObject({
        insertion: 'snippet',
        snippetBody,
      });
    }
  });

  it('provides an argument-shaped snippet for every callable built-in', () => {
    const functions = getAcslCatalogByCategory('builtin-function');

    expect(functions).toHaveLength(48);
    expect(functions.map(({ id }) => id).sort()).toEqual(
      Object.keys(BUILTIN_FUNCTION_ARGUMENTS).sort(),
    );

    for (const entry of functions) {
      const parameters = BUILTIN_FUNCTION_ARGUMENTS[entry.id];

      expect(parameters, entry.id).toBeDefined();
      if (parameters === undefined) continue;

      const argumentsText = parameters
        .map((name, index) => `\${${index + 1}:${name}}`)
        .join(', ');
      expect(entry.insertion, entry.id).toBe('snippet');
      expect(entry.snippetBody, entry.id).toBe(
        `${entry.label}(${argumentsText})`,
      );
      expect(entry.snippetBody, entry.id).not.toMatch(/;$/);
      expect(ACSL_CATALOG.filter(({ label }) => label === entry.label)).toHaveLength(
        1,
      );
    }
  });

  it('exposes stable lookup helpers and immutable top-level data', () => {
    expect(getAcslCatalog()).toBe(ACSL_CATALOG);
    expect(getAcslCatalogByCategory('multiword')).toHaveLength(13);
    expect(getAcslCatalogEntry('missing.entry')).toBeUndefined();
    expect(Object.isFrozen(ACSL_CATALOG)).toBe(true);
    expect(Object.isFrozen(ACSL_CATALOG[0])).toBe(true);
    expect(Object.isFrozen(ACSL_CATALOG[0]!.spec)).toBe(true);
  });

  it('carries an official source reference for every entry', () => {
    for (const entry of ACSL_CATALOG) {
      expect(entry.detail.startsWith('ACSL 1.24 · '), entry.id).toBe(true);
      expect(entry.documentation.length, entry.id).toBeGreaterThan(0);
      expect(entry.spec.version, entry.id).toBe('1.24');
      expect(entry.spec.section.length, entry.id).toBeGreaterThan(0);
      expect(entry.spec.sourceUrl, entry.id).toMatch(
        /^https:\/\/github\.com\/acsl-language\/acsl\/blob\/1\.24\//,
      );
    }
  });
});
