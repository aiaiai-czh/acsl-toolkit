#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  loadCatalogData,
  REPOSITORY_ROOT,
  validateCatalogData,
} from './catalog-lib.mjs';

export const GENERATED_GRAMMAR_PATH = path.join(
  REPOSITORY_ROOT,
  'syntaxes/acsl.tmLanguage.json',
);

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function labelsFor(entries, categories) {
  return entries
    .filter((entry) => categories.includes(entry.category))
    .map((entry) => entry.label)
    .sort((left, right) => right.length - left.length || left.localeCompare(right));
}

function tokenPatterns(labels, name) {
  const backslashLabels = labels.filter((label) => label.startsWith('\\'));
  const plainLabels = labels.filter((label) => !label.startsWith('\\'));
  const patterns = [];

  if (backslashLabels.length > 0) {
    patterns.push({
      name,
      match: `(?<![A-Za-z0-9_])(?:${backslashLabels
        .map(escapeRegex)
        .join('|')})(?![A-Za-z0-9_])`,
    });
  }
  if (plainLabels.length > 0) {
    patterns.push({
      name,
      match: `\\b(?:${plainLabels.map(escapeRegex).join('|')})\\b`,
    });
  }

  return patterns;
}

function multiwordPatterns(entries) {
  const alternatives = labelsFor(entries, ['multiword']).map((label) =>
    label.split(/\s+/).map(escapeRegex).join('\\s+'),
  );
  return alternatives.length === 0
    ? []
    : [{ name: 'keyword.control.acsl', match: `\\b(?:${alternatives.join('|')})\\b` }];
}

export function buildGrammar(entries) {
  return {
    $schema:
      'https://raw.githubusercontent.com/martinring/tmlanguage/master/tmlanguage.json',
    name: 'ACSL',
    scopeName: 'source.acsl',
    patterns: [
      { include: '#strings' },
      { include: '#annotation-decoration' },
      { include: '#multiword' },
      { include: '#logic-types' },
      { include: '#clauses' },
      { include: '#keywords' },
      { include: '#builtin-functions' },
      { include: '#builtin-terms' },
      { include: '#c-types' },
      { include: '#numbers' },
      { include: '#operators' },
      { include: '#function-calls' },
      { include: '#unknown-backslash-identifiers' },
      { include: '#punctuation' },
    ],
    repository: {
      strings: {
        patterns: [
          {
            name: 'string.quoted.double.acsl',
            begin: '"',
            beginCaptures: { 0: { name: 'punctuation.definition.string.begin.acsl' } },
            // A C comment terminator always wins, even inside an unfinished
            // ACSL string. Recover at EOL as well so malformed input cannot
            // keep a child string rule alive across the parent annotation.
            end: '(?:"|(?=\\*/)|$)',
            endCaptures: { 0: { name: 'punctuation.definition.string.end.acsl' } },
            patterns: [{ name: 'constant.character.escape.acsl', match: '\\\\.' }],
          },
          {
            name: 'string.quoted.single.acsl',
            begin: "'",
            beginCaptures: { 0: { name: 'punctuation.definition.string.begin.acsl' } },
            end: "(?:'|(?=\\*/)|$)",
            endCaptures: { 0: { name: 'punctuation.definition.string.end.acsl' } },
            patterns: [{ name: 'constant.character.escape.acsl', match: '\\\\.' }],
          },
        ],
      },
      'annotation-decoration': {
        patterns: [
          {
            match: '^\\s*(@)(?=\\s|$)',
            captures: { 1: { name: 'punctuation.definition.comment.acsl' } },
          },
        ],
      },
      multiword: { patterns: multiwordPatterns(entries) },
      'logic-types': {
        patterns: tokenPatterns(labelsFor(entries, ['logic-type']), 'storage.type.acsl'),
      },
      clauses: {
        patterns: tokenPatterns(labelsFor(entries, ['clause']), 'keyword.control.acsl'),
      },
      keywords: {
        patterns: tokenPatterns(labelsFor(entries, ['keyword']), 'keyword.other.acsl'),
      },
      'builtin-functions': {
        patterns: tokenPatterns(
          labelsFor(entries, ['builtin-function', 'builtin-predicate']),
          'support.function.acsl',
        ),
      },
      'builtin-terms': {
        patterns: tokenPatterns(labelsFor(entries, ['builtin-term']), 'constant.language.acsl'),
      },
      'c-types': {
        patterns: [
          {
            name: 'storage.type.c.acsl',
            match:
              '\\b(?:char|short|int|long|signed|unsigned|float|double|void|const|struct|union|enum)\\b',
          },
        ],
      },
      numbers: {
        patterns: [
          {
            name: 'constant.numeric.hex.acsl',
            match:
              '\\b0[xX](?:[0-9A-Fa-f]+(?:\\.[0-9A-Fa-f]*)?|\\.[0-9A-Fa-f]+)(?:[pP][+-]?[0-9]+)?[uUlLfF]*\\b',
          },
          {
            name: 'constant.numeric.acsl',
            match:
              '(?<![A-Za-z0-9_])(?:[0-9]+(?:\\.[0-9]*)?|\\.[0-9]+)(?:[eE][+-]?[0-9]+)?[uUlLfF]*(?![A-Za-z0-9_])',
          },
        ],
      },
      operators: {
        patterns: [
          {
            name: 'keyword.operator.logical.acsl',
            match: '<==>|==>|\\&\\&|\\|\\||\\^\\^|!',
          },
          {
            name: 'keyword.operator.comparison.acsl',
            match: '==|!=|<=|>=|<|>',
          },
          {
            name: 'keyword.operator.set.acsl',
            match: '\\.\\.|\\*\\^|\\^',
          },
          {
            name: 'keyword.operator.arithmetic.acsl',
            match: '-->|<-->|<<|>>|[-+*/%&|~]=?',
          },
        ],
      },
      'function-calls': {
        patterns: [
          {
            name: 'entity.name.function.acsl',
            match: '\\b[A-Za-z_][A-Za-z0-9_]*(?=\\s*\\()',
          },
        ],
      },
      'unknown-backslash-identifiers': {
        patterns: [
          {
            name: 'variable.other.acsl',
            match: '\\\\[A-Za-z_][A-Za-z0-9_]*',
          },
        ],
      },
      punctuation: {
        patterns: [
          {
            name: 'punctuation.separator.acsl',
            match: '[,;:]',
          },
          {
            name: 'punctuation.section.group.acsl',
            match: '[(){}\\[\\]]',
          },
        ],
      },
    },
  };
}

export function serializeGrammar(grammar) {
  return `${JSON.stringify(grammar, null, 2)}\n`;
}

async function main() {
  const data = await loadCatalogData();
  const validation = validateCatalogData(data);
  if (validation.errors.length > 0) {
    for (const error of validation.errors) console.error(`catalog error: ${error}`);
    process.exitCode = 1;
    return;
  }

  const serialized = serializeGrammar(buildGrammar(validation.entries));
  if (process.argv.includes('--stdout')) {
    process.stdout.write(serialized);
    return;
  }

  if (process.argv.includes('--check')) {
    const current = await readFile(GENERATED_GRAMMAR_PATH, 'utf8').catch(() => '');
    let currentGrammar;
    try {
      currentGrammar = JSON.parse(current);
    } catch {
      currentGrammar = undefined;
    }
    if (JSON.stringify(currentGrammar) !== JSON.stringify(JSON.parse(serialized))) {
      console.error(
        'syntaxes/acsl.tmLanguage.json is stale; run node scripts/generate-grammar.mjs.',
      );
      process.exitCode = 1;
    } else {
      console.log('Generated ACSL grammar is up to date.');
    }
    return;
  }

  const current = await readFile(GENERATED_GRAMMAR_PATH, 'utf8').catch(() => '');
  try {
    if (JSON.stringify(JSON.parse(current)) === JSON.stringify(JSON.parse(serialized))) {
      console.log('Generated ACSL grammar is already up to date.');
      return;
    }
  } catch {
    // A missing or malformed output is replaced below.
  }

  await writeFile(GENERATED_GRAMMAR_PATH, serialized, 'utf8');
  console.log('Generated syntaxes/acsl.tmLanguage.json.');
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
