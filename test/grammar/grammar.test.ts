import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { ACSL_CATALOG } from '../../src/completion/catalog';

interface GrammarPattern {
  name?: string;
  match?: string;
  begin?: string;
  end?: string;
  include?: string;
  contentName?: string;
  patterns?: GrammarPattern[];
}

interface Grammar {
  scopeName: string;
  injectionSelector?: string;
  patterns: GrammarPattern[];
  repository?: Record<string, { patterns: GrammarPattern[] }>;
}

interface LanguageConfiguration {
  comments?: {
    lineComment?: string;
    blockComment?: readonly [string, string];
  };
}

function loadGrammar(relativeUrl: string): Grammar {
  return JSON.parse(readFileSync(new URL(relativeUrl, import.meta.url), 'utf8')) as Grammar;
}

const coreGrammar = loadGrammar('../../syntaxes/acsl.tmLanguage.json');
const injectionGrammar = loadGrammar('../../syntaxes/acsl-injection.tmLanguage.json');
const languageConfiguration = JSON.parse(
  readFileSync(
    new URL('../../syntaxes/acsl-language-configuration.json', import.meta.url),
    'utf8',
  ),
) as LanguageConfiguration;

function repositoryPatterns(name: string): GrammarPattern[] {
  const patterns = coreGrammar.repository?.[name]?.patterns;
  if (patterns === undefined) throw new Error(`Missing grammar repository ${name}`);
  return patterns;
}

function matchingPattern(patterns: GrammarPattern[], token: string): GrammarPattern | undefined {
  return patterns.find(({ match }) => match !== undefined && new RegExp(`^(?:${match})$`, 'u').test(token));
}

function repositoryForCategory(category: (typeof ACSL_CATALOG)[number]['category']): string {
  switch (category) {
    case 'multiword':
      return 'multiword';
    case 'logic-type':
      return 'logic-types';
    case 'clause':
      return 'clauses';
    case 'keyword':
      return 'keywords';
    case 'builtin-function':
    case 'builtin-predicate':
      return 'builtin-functions';
    case 'builtin-term':
      return 'builtin-terms';
    default: {
      const exhaustiveCategory: never = category;
      throw new Error(`Unsupported catalog category: ${String(exhaustiveCategory)}`);
    }
  }
}

describe('generated ACSL grammar', () => {
  it('uses a dedicated embedded-language scope', () => {
    expect(coreGrammar.scopeName).toBe('source.acsl');
    expect(coreGrammar.patterns.map(({ include }) => include)).toContain('#comments');
    expect(coreGrammar.patterns.map(({ include }) => include)).toContain('#clauses');
    expect(coreGrammar.patterns.map(({ include }) => include)).toContain('#builtin-functions');
  });

  it('uses line comments without contributing unsafe nested block comments', () => {
    expect(languageConfiguration.comments?.lineComment).toBe('//');
    expect(languageConfiguration.comments?.blockComment).toBeUndefined();

    const comments = repositoryPatterns('comments');
    expect(comments).toHaveLength(1);
    expect(comments[0]).toMatchObject({
      name: 'comment.line.double-slash.acsl',
      begin: '//',
      end: '(?=\\*/)|(?=$)',
    });
  });

  it('represents every catalog label in its category repository', () => {
    for (const entry of ACSL_CATALOG) {
      const patterns = repositoryPatterns(repositoryForCategory(entry.category));
      expect(matchingPattern(patterns, entry.label), entry.id).toBeDefined();
    }
  });

  it('assigns expected scopes to representative ACSL tokens', () => {
    expect(matchingPattern(repositoryPatterns('clauses'), 'requires')?.name).toBe(
      'keyword.control.acsl',
    );
    expect(matchingPattern(repositoryPatterns('builtin-terms'), '\\result')?.name).toBe(
      'constant.language.acsl',
    );
    expect(matchingPattern(repositoryPatterns('builtin-functions'), '\\valid')?.name).toBe(
      'support.function.acsl',
    );
    expect(matchingPattern(repositoryPatterns('logic-types'), 'integer')?.name).toBe(
      'storage.type.acsl',
    );
  });

  it('matches full multiword constructs and respects identifier boundaries', () => {
    expect(matchingPattern(repositoryPatterns('multiword'), 'loop invariant')).toBeDefined();
    expect(matchingPattern(repositoryPatterns('multiword'), 'loop   invariant')).toBeDefined();
    expect(matchingPattern(repositoryPatterns('clauses'), 'requires_count')).toBeUndefined();
    expect(
      matchingPattern(repositoryPatterns('builtin-functions'), '\\valid_read_more'),
    ).toBeUndefined();
  });

  it('keeps the longer validity spelling intact', () => {
    const pattern = matchingPattern(repositoryPatterns('builtin-functions'), '\\valid_read');
    expect(pattern).toBeDefined();
    const match = new RegExp(pattern!.match!, 'u').exec('\\valid_read(pointer)');
    expect(match?.[0]).toBe('\\valid_read');
  });
});

describe('C and C++ injection grammar', () => {
  it('injects into existing C and C++ grammars without defining a file grammar', () => {
    expect(injectionGrammar.scopeName).toBe('acsl.injection');
    expect(injectionGrammar.injectionSelector).toContain('L:source.c -comment -string');
    expect(injectionGrammar.injectionSelector).toContain('L:source.cpp -comment -string');
  });

  it('recognizes only the ACSL block marker', () => {
    const block = injectionGrammar.patterns.find(
      ({ contentName }) => contentName === 'meta.embedded.block.acsl',
    );
    expect(block).toBeDefined();
    expect(new RegExp(block!.begin!, 'u').test('/*@')).toBe(true);
    expect(new RegExp(block!.begin!, 'u').test('/* ordinary')).toBe(false);
    expect(block!.end).toBe('\\*/');
    expect(block!.patterns).toEqual([{ include: 'source.acsl' }]);
  });

  it('recognizes the ACSL line marker and ends at the current line boundary', () => {
    const line = injectionGrammar.patterns.find(
      ({ contentName }) => contentName === 'meta.embedded.inline.acsl',
    );
    expect(line).toBeDefined();
    expect(new RegExp(line!.begin!, 'u').test('//@')).toBe(true);
    expect(new RegExp(line!.begin!, 'u').test('// ordinary')).toBe(false);
    expect(line!.end).toBe('(?=$)');
    expect(line!.patterns).toEqual([{ include: 'source.acsl' }]);
  });
});
