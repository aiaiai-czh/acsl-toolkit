import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { loadWASM, OnigScanner, OnigString } from 'vscode-oniguruma';
import {
  INITIAL,
  Registry,
  type IGrammar,
  type IGrammarConfiguration,
  type IRawGrammar,
  type StateStack,
} from 'vscode-textmate';
import { beforeAll, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

function loadRawGrammar(relativeUrl: string): IRawGrammar {
  return JSON.parse(
    readFileSync(new URL(relativeUrl, import.meta.url), 'utf8'),
  ) as IRawGrammar;
}

const acslGrammar = loadRawGrammar('../../syntaxes/acsl.tmLanguage.json');
const injectionGrammar = loadRawGrammar(
  '../../syntaxes/acsl-injection.tmLanguage.json',
);

interface GrammarContribution {
  readonly scopeName: string;
  readonly embeddedLanguages?: Readonly<Record<string, string>>;
  readonly tokenTypes?: Readonly<Record<string, 'other' | 'comment' | 'string'>>;
}

interface ExtensionManifest {
  readonly contributes: {
    readonly grammars: readonly GrammarContribution[];
  };
}

const extensionManifest = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
) as ExtensionManifest;
const injectionContribution = (() => {
  const contribution = extensionManifest.contributes.grammars.find(
    ({ scopeName }) => scopeName === 'acsl.injection',
  );
  if (contribution === undefined) {
    throw new Error('Missing acsl.injection grammar contribution');
  }
  return contribution;
})();

const ACSL_LANGUAGE_ID = 2;
const TOKEN_TYPE_IDS = {
  other: 0,
  comment: 1,
  string: 2,
} as const;

function manifestGrammarConfiguration(): IGrammarConfiguration {
  return {
    embeddedLanguages: Object.fromEntries(
      Object.entries(injectionContribution.embeddedLanguages ?? {}).map(
        ([scope, language]) => {
          if (language !== 'acsl') {
            throw new Error(`Unexpected embedded language ${language}`);
          }
          return [scope, ACSL_LANGUAGE_ID];
        },
      ),
    ) as IGrammarConfiguration['embeddedLanguages'],
    tokenTypes: Object.fromEntries(
      Object.entries(injectionContribution.tokenTypes ?? {}).map(
        ([scope, tokenType]) => [scope, TOKEN_TYPE_IDS[tokenType]],
      ),
    ) as IGrammarConfiguration['tokenTypes'],
  };
}

const hostGrammar: IRawGrammar = {
  scopeName: 'source.c',
  repository: {
    $self: { include: '$self' },
    $base: { include: '$base' },
  },
  patterns: [
    {
      name: 'string.quoted.double.c',
      begin: '"',
      end: '"',
      patterns: [{ name: 'constant.character.escape.c', match: '\\\\.' }],
    },
    { name: 'comment.block.c', begin: '[ \\t]*(/\\*)', end: '\\*/' },
    { name: 'comment.line.double-slash.c', begin: '[ \\t]*(//)', end: '$' },
  ],
};

let grammar: IGrammar;
let configuredGrammar: IGrammar;

beforeAll(async () => {
  const wasm = readFileSync(
    require.resolve('vscode-oniguruma/release/onig.wasm'),
  );
  await loadWASM(
    wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength),
  );

  const grammars = new Map<string, IRawGrammar>([
    ['source.acsl', acslGrammar],
    ['acsl.injection', injectionGrammar],
  ]);
  const registry = new Registry({
    onigLib: Promise.resolve({
      createOnigScanner: (sources) => new OnigScanner(sources),
      createOnigString: (text) => new OnigString(text),
    }),
    loadGrammar: async (scopeName) => grammars.get(scopeName),
  });

  await registry.addGrammar(acslGrammar);
  await registry.addGrammar(injectionGrammar);
  grammar = await registry.addGrammar(hostGrammar, ['acsl.injection']);

  const configuredGrammars = new Map<string, IRawGrammar>([
    ['source.c', hostGrammar],
    ['source.acsl', acslGrammar],
    ['acsl.injection', injectionGrammar],
  ]);
  const configuredRegistry = new Registry({
    onigLib: Promise.resolve({
      createOnigScanner: (sources) => new OnigScanner(sources),
      createOnigString: (text) => new OnigString(text),
    }),
    loadGrammar: async (scopeName) => configuredGrammars.get(scopeName),
    getInjections: (scopeName) =>
      scopeName === 'source.c' ? ['acsl.injection'] : [],
  });
  const loadedGrammar = await configuredRegistry.loadGrammarWithConfiguration(
    'source.c',
    1,
    manifestGrammarConfiguration(),
  );
  if (loadedGrammar === null) {
    throw new Error('Could not load configured C grammar');
  }
  configuredGrammar = loadedGrammar;
});

interface TokenizedLine {
  readonly line: string;
  readonly scopesAt: (needle: string, occurrence?: number) => readonly string[];
  readonly ruleStack: StateStack;
}

function tokenize(line: string, ruleStack: StateStack = INITIAL): TokenizedLine {
  const result = grammar.tokenizeLine(line, ruleStack);

  return {
    line,
    ruleStack: result.ruleStack,
    scopesAt(needle, occurrence = 1) {
      let offset = -1;
      for (let index = 0; index < occurrence; index += 1) {
        offset = line.indexOf(needle, offset + 1);
      }
      if (offset === -1) throw new Error(`Missing token ${needle} in ${line}`);

      const token = result.tokens.find(
        ({ startIndex, endIndex }) => startIndex <= offset && offset < endIndex,
      );
      if (token === undefined) throw new Error(`No scope at offset ${offset}`);
      return token.scopes;
    },
  };
}

function metadataAt(
  line: string,
  tokens: Uint32Array,
  needle: string,
): { readonly languageId: number; readonly tokenType: number } {
  const offset = line.indexOf(needle);
  if (offset === -1) throw new Error(`Missing token ${needle} in ${line}`);

  for (let index = 0; index < tokens.length; index += 2) {
    const startOffset = tokens[index]!;
    const endOffset =
      index + 2 < tokens.length ? tokens[index + 2]! : line.length;
    if (startOffset <= offset && offset < endOffset) {
      const metadata = tokens[index + 1]!;
      return {
        languageId: metadata & 0xff,
        tokenType: (metadata & 0x300) >>> 8,
      };
    }
  }

  throw new Error(`No binary token metadata at offset ${offset}`);
}

function tokenizeFixture(relativeUrl: string): readonly TokenizedLine[] {
  const source = readFileSync(new URL(relativeUrl, import.meta.url), 'utf8');
  const tokenized: TokenizedLine[] = [];
  let ruleStack = INITIAL;

  for (const line of source.split(/\r?\n/)) {
    const result = tokenize(line, ruleStack);
    tokenized.push(result);
    ruleStack = result.ruleStack;
  }

  return tokenized;
}

function fixtureLine(
  lines: readonly TokenizedLine[],
  needle: string,
): TokenizedLine {
  const line = lines.find((candidate) => candidate.line.includes(needle));
  if (line === undefined) throw new Error(`Missing fixture line containing ${needle}`);
  return line;
}

describe('TextMate injection tokenization', () => {
  it('highlights block content and exits at the first terminator', () => {
    const line = tokenize('/*@ requires x; */ int requires = 0;');

    expect(line.scopesAt('requires')).toContain('keyword.control.acsl');
    expect(line.scopesAt('requires', 2)).not.toContain('keyword.control.acsl');
    expect(line.scopesAt('int', 1)).not.toContain('meta.embedded.block.acsl');
  });

  it('wins over host comment rules when an annotation is indented', () => {
    const opening = tokenize('    /*@');
    const content = tokenize('      loop inv', opening.ruleStack);
    const closing = tokenize('    */', content.ruleStack);

    expect(opening.scopesAt('/*@')).toContain('comment.block.acsl');
    expect(content.scopesAt('loop inv')).toContain('keyword.control.acsl');
    expect(content.scopesAt('loop inv')).toContain(
      'meta.embedded.block.acsl',
    );
    expect(closing.scopesAt('*/')).toContain('comment.block.acsl');
  });

  it('gives annotation delimiters standard comment scopes', () => {
    const block = tokenize('/*@ requires x; */');
    const line = tokenize('//@ assert x;');

    expect(block.scopesAt('/*@')).toContain('comment.block.acsl');
    expect(block.scopesAt('*/')).toContain('comment.block.acsl');
    expect(line.scopesAt('//@')).toContain('comment.line.double-slash.acsl');
  });

  it('highlights line annotations only through the current line', () => {
    const annotation = tokenize('//@ ensures value > 0;');
    const following = tokenize('int ensures = 0;', annotation.ruleStack);

    expect(annotation.scopesAt('ensures')).toContain('keyword.control.acsl');
    expect(following.scopesAt('ensures')).not.toContain('keyword.control.acsl');
  });

  it('keeps an unfinished block annotation active across lines', () => {
    const opening = tokenize('/*@ requires value > 0;');
    const continuation = tokenize('  ensures \\result > 0;', opening.ruleStack);

    expect(continuation.scopesAt('ensures')).toContain('keyword.control.acsl');
    expect(continuation.scopesAt('\\result')).toContain(
      'constant.language.acsl',
    );
  });

  it('lets a block terminator close an unfinished ACSL string', () => {
    const sameLine = tokenize('/*@ requires "unfinished */ int requires = 0;');

    expect(sameLine.scopesAt('requires')).toContain('keyword.control.acsl');
    expect(sameLine.scopesAt('requires', 2)).not.toContain(
      'keyword.control.acsl',
    );

    const opening = tokenize('/*@ requires "unfinished');
    const closing = tokenize('*/ int requires = 0;', opening.ruleStack);

    expect(closing.scopesAt('requires')).not.toContain('keyword.control.acsl');
    expect(closing.scopesAt('int')).not.toContain('meta.embedded.block.acsl');
  });

  it('lets a block terminator close an unfinished ACSL character literal', () => {
    const line = tokenize("/*@ requires 'x */ int requires = 0;");

    expect(line.scopesAt('requires')).toContain('keyword.control.acsl');
    expect(line.scopesAt('requires', 2)).not.toContain('keyword.control.acsl');
  });

  it('does not inject into ordinary comments or strings', () => {
    const comment = tokenize('/* requires /*@ ensures */');
    const string = tokenize('const char *s = "/*@ requires */";');

    expect(comment.scopesAt('requires')).not.toContain('keyword.control.acsl');
    expect(comment.scopesAt('ensures')).not.toContain('keyword.control.acsl');
    expect(string.scopesAt('requires')).not.toContain('keyword.control.acsl');
  });

  it('scopes // content inside a block annotation as an ordinary comment', () => {
    const opening = tokenize('/*@');
    const commented = tokenize('  // requires old_value;', opening.ruleStack);
    const following = tokenize('  ensures new_value;', commented.ruleStack);

    expect(commented.scopesAt('//')).toContain(
      'comment.line.double-slash.acsl',
    );
    expect(commented.scopesAt('requires')).toContain(
      'comment.line.double-slash.acsl',
    );
    expect(commented.scopesAt('requires')).not.toContain(
      'keyword.control.acsl',
    );
    expect(following.scopesAt('ensures')).toContain('keyword.control.acsl');
  });

  it('ends an inner comment together with its line annotation', () => {
    const annotation = tokenize('//@ assert value; // disabled');
    const following = tokenize(
      'int requires = 0;',
      annotation.ruleStack,
    );

    expect(annotation.scopesAt('disabled')).toContain(
      'comment.line.double-slash.acsl',
    );
    expect(following.scopesAt('requires')).not.toContain(
      'keyword.control.acsl',
    );
    expect(following.scopesAt('int')).not.toContain(
      'meta.embedded.inline.acsl',
    );
  });

  it('keeps embedded ACSL as code but classifies inner // content as comments', () => {
    const opening = configuredGrammar.tokenizeLine2('/*@', INITIAL);
    const codeLine = '  requires active_value;';
    const commentLine = '  // requires old_value;';
    const code = configuredGrammar.tokenizeLine2(
      codeLine,
      opening.ruleStack,
    );
    const comment = configuredGrammar.tokenizeLine2(
      commentLine,
      opening.ruleStack,
    );

    expect(metadataAt(codeLine, code.tokens, 'requires')).toEqual({
      languageId: ACSL_LANGUAGE_ID,
      tokenType: TOKEN_TYPE_IDS.other,
    });
    expect(metadataAt(commentLine, comment.tokens, 'requires')).toEqual({
      languageId: ACSL_LANGUAGE_ID,
      tokenType: TOKEN_TYPE_IDS.comment,
    });
  });

  it('lets the outer terminator close an ACSL line comment', () => {
    const opening = tokenize('/*@');
    const closing = tokenize(
      '  // disabled */ int requires = 0;',
      opening.ruleStack,
    );

    expect(closing.scopesAt('disabled')).toContain(
      'comment.line.double-slash.acsl',
    );
    expect(closing.scopesAt('*/')).toContain('comment.block.acsl');
    expect(closing.scopesAt('requires')).not.toContain(
      'keyword.control.acsl',
    );
    expect(closing.scopesAt('int')).not.toContain(
      'meta.embedded.block.acsl',
    );
  });

  it('treats spaced marker lookalikes as ordinary C comments', () => {
    const block = tokenize('/* @ requires x; */');
    const line = tokenize('// @ assert x;');

    expect(block.scopesAt('requires')).toContain('comment.block.c');
    expect(block.scopesAt('requires')).not.toContain(
      'meta.embedded.block.acsl',
    );
    expect(block.scopesAt('requires')).not.toContain('keyword.control.acsl');
    expect(line.scopesAt('assert')).toContain('comment.line.double-slash.c');
    expect(line.scopesAt('assert')).not.toContain(
      'meta.embedded.inline.acsl',
    );
    expect(line.scopesAt('assert')).not.toContain('keyword.control.acsl');
  });

  it.each([
    ['fixtures/annotations.c', 'requires count', 'requires'],
    ['fixtures/annotations.cpp', 'requires size', 'requires'],
  ] as const)(
    'tokenizes representative host fixture %s',
    (relativeUrl, annotationLine, keyword) => {
      const lines = tokenizeFixture(relativeUrl);
      expect(fixtureLine(lines, annotationLine).scopesAt(keyword)).toContain(
        'keyword.control.acsl',
      );
      const ordinaryScopes = fixtureLine(
        lines,
        'not an annotation',
      ).scopesAt('not');
      expect(ordinaryScopes).not.toContain('meta.embedded.block.acsl');
      expect(ordinaryScopes).not.toContain('meta.embedded.inline.acsl');
    },
  );
});
