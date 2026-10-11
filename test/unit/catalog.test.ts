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
