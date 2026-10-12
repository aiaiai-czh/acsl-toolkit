import * as vscode from 'vscode';

import {
  scanAcslContext,
  type AcslAnnotationKind,
} from '../context/acslContext';
import type { AcslCatalogEntry } from '../types/catalog';
import {
  collectAcslLocalSymbols,
  type AcslLocalSymbol,
} from '../symbols/localSymbols';
import {
  acslDocumentCallSnippet,
  indexAcslDocumentSymbols,
  visibleAcslDocumentSymbols,
  type AcslDocumentSymbol,
} from '../symbols/documentSymbols';
import { ACSL_CATALOG } from './catalog';
import {
  getAcslFilterText,
  getAcslInsertText,
  getAcslSortText,
  hasFollowingAcslCallArguments,
  isAcslCallableSnippet,
  selectAcslCompletionEntries,
  shouldConsumeFollowingSemicolon,
} from './completionItems';
import { extractAcslPrefix } from './prefix';

function completionKind(entry: Readonly<AcslCatalogEntry>): vscode.CompletionItemKind {
  switch (entry.category) {
    case 'builtin-function':
    case 'builtin-predicate':
      return vscode.CompletionItemKind.Function;
    case 'builtin-term':
      return vscode.CompletionItemKind.Value;
    case 'logic-type':
      return vscode.CompletionItemKind.TypeParameter;
    case 'clause':
    case 'keyword':
    case 'multiword':
      return entry.insertion === 'snippet'
        ? vscode.CompletionItemKind.Snippet
        : vscode.CompletionItemKind.Keyword;
  }
}

function completionDocumentation(
  entry: Readonly<AcslCatalogEntry>,
): vscode.MarkdownString {
  const documentation = new vscode.MarkdownString();
  documentation.isTrusted = false;
  documentation.appendText(entry.documentation);
  documentation.appendMarkdown(
    `\n\n_ACSL ${entry.spec.version} · ${entry.spec.section}_`,
  );
  documentation.appendMarkdown(
    `\n\n[Specification source](${entry.spec.sourceUrl})`,
  );
  return documentation;
}

function followingSemicolonEndOffset(
  document: vscode.TextDocument,
  offset: number,
): number | undefined {
  const position = document.positionAt(offset);
  const lineSuffix = document.lineAt(position.line).text.slice(position.character);
  const match = /^[ \t]*;/.exec(lineSuffix);
  return match === null ? undefined : offset + match[0].length;
}

function documentHasFollowingCallArguments(
  document: vscode.TextDocument,
  offset: number,
): boolean {
  const position = document.positionAt(offset);
  const lineSuffix = document.lineAt(position.line).text.slice(position.character);
  return hasFollowingAcslCallArguments(lineSuffix);
}

function createCompletionItem(
  document: vscode.TextDocument,
  startOffset: number,
  endOffset: number,
  entry: Readonly<AcslCatalogEntry>,
  annotationKind: AcslAnnotationKind,
): vscode.CompletionItem {
  const semicolonEndOffset = followingSemicolonEndOffset(document, endOffset);
  const hasFollowingSemicolon = semicolonEndOffset !== undefined;
  const rangeEndOffset =
    semicolonEndOffset !== undefined &&
    shouldConsumeFollowingSemicolon(entry, true)
      ? semicolonEndOffset
      : endOffset;
  const replacementEnd = document.positionAt(rangeEndOffset);
  const item = new vscode.CompletionItem(entry.label, completionKind(entry));
  const followsExistingCall =
    isAcslCallableSnippet(entry) &&
    documentHasFollowingCallArguments(document, endOffset);
  const insertionText = getAcslInsertText(
    entry,
    hasFollowingSemicolon,
    annotationKind,
    followsExistingCall,
  );

  item.detail = entry.detail;
  item.documentation = completionDocumentation(entry);
  item.filterText = getAcslFilterText(entry);
  item.sortText = getAcslSortText(entry);
  item.range = new vscode.Range(document.positionAt(startOffset), replacementEnd);
  item.insertText =
    entry.insertion === 'snippet' && !followsExistingCall
      ? new vscode.SnippetString(insertionText)
      : insertionText;

  return item;
}

function createLocalSymbolItem(
  document: vscode.TextDocument,
  startOffset: number,
  endOffset: number,
  symbol: AcslLocalSymbol,
): vscode.CompletionItem {
  const item = new vscode.CompletionItem(
    symbol.name,
    vscode.CompletionItemKind.Variable,
  );
  const origin = symbol.kind === 'parameter'
    ? `${symbol.owner} parameter`
    : `${symbol.kind} variable`;
  item.detail = `ACSL local · ${origin}${symbol.typeText ? ` · ${symbol.typeText}` : ''}`;
  const documentation = new vscode.MarkdownString();
  documentation.appendText(`Locally declared ${origin}: ${symbol.name}.`);
  item.documentation = documentation;
  item.insertText = symbol.name;
  item.filterText = symbol.name;
  item.sortText = `000:000:${symbol.name}`;
  item.range = new vscode.Range(
    document.positionAt(startOffset),
    document.positionAt(endOffset),
  );
  return item;
}

function createDocumentSymbolItem(
  document: vscode.TextDocument,
  text: string,
  annotationKind: AcslAnnotationKind,
  startOffset: number,
  endOffset: number,
  symbol: AcslDocumentSymbol,
): vscode.CompletionItem {
  const item = new vscode.CompletionItem(
    symbol.name,
    symbol.hasParameterList ? vscode.CompletionItemKind.Function : vscode.CompletionItemKind.Value,
  );
  item.detail = `ACSL document · ${symbol.kind} · ${symbol.signature}`;
  const documentation = new vscode.MarkdownString();
  documentation.appendText(`Declared in this document: ${symbol.signature}. Arguments and labels are editable placeholders, not inferred values.`);
  item.documentation = documentation;
  // Preserve user-written label/type binders as well as existing arguments.
  const suffix = annotationKind === 'line'
    ? document.lineAt(document.positionAt(endOffset).line).text.slice(document.positionAt(endOffset).character)
    : text.slice(endOffset);
  const hasExistingSuffix = hasFollowingAcslReferenceSuffix(suffix);
  const insertion = acslDocumentCallSnippet(symbol);
  item.insertText = hasExistingSuffix || insertion === symbol.name
    ? symbol.name : new vscode.SnippetString(insertion);
  item.filterText = symbol.name;
  item.sortText = `001:${symbol.name.length.toString().padStart(3, '0')}:${symbol.name}:${symbol.signature}`;
  item.range = new vscode.Range(document.positionAt(startOffset), document.positionAt(endOffset));
  return item;
}

function hasFollowingAcslReferenceSuffix(suffix: string): boolean {
  const trimmed = suffix.trimStart();
  if (trimmed.startsWith('(') || trimmed.startsWith('{')) return true;
  // Balance nested generic arguments, but do not interpret a bare '<' in
  // an ordinary comparison as an already-written type argument list.
  if (!trimmed.startsWith('<')) return false;
  let depth = 0;
  for (const character of trimmed) {
    if (character === '<') depth += 1;
    else if (character === '>' && --depth === 0) return true;
    else if ([';', '=', '/'].includes(character)) break;
  }
  return false;
}

interface DocumentSymbolCache {
  readonly version: number;
  readonly text: string;
  readonly symbols: readonly AcslDocumentSymbol[];
}

export class AcslCompletionProvider implements vscode.CompletionItemProvider {
  private readonly documentSymbols = new WeakMap<vscode.TextDocument, DocumentSymbolCache>();

  public constructor(
    private readonly catalog: readonly Readonly<AcslCatalogEntry>[] = ACSL_CATALOG,
  ) {}

  private indexedSymbols(document: vscode.TextDocument, text: string): readonly AcslDocumentSymbol[] {
    const cached = this.documentSymbols.get(document);
    if (cached !== undefined && cached.version === document.version && cached.text === text) return cached.symbols;
    const symbols = indexAcslDocumentSymbols(text);
    this.documentSymbols.set(document, { version: document.version, text, symbols });
    return symbols;
  }

  public provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.CompletionList> {
    if (token.isCancellationRequested) {
      return undefined;
    }

    const text = document.getText();
    const cursorOffset = document.offsetAt(position);
    const annotation = scanAcslContext(text, cursorOffset);
    if (annotation === undefined) {
      return undefined;
    }

    const prefix = extractAcslPrefix(
      text,
      cursorOffset,
      annotation.contentStart,
      this.catalog,
    );
    const selection = selectAcslCompletionEntries(prefix, this.catalog);
    // Local names use their own single-word range: a name that happens to
    // match "loop" or another multiword prefix must replace only that name.
    const localPrefix = extractAcslPrefix(
      text, cursorOffset, annotation.contentStart, [],
    );
    const locals = localPrefix.mode === 'backslash'
      ? []
      : collectAcslLocalSymbols(text, annotation)
        .filter(({ name }) => name.startsWith(localPrefix.text))
        .sort((left, right) =>
          left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
        );
    const localNames = new Set(locals.map(({ name }) => name));
    const references = localPrefix.mode === 'backslash' ? []
      : visibleAcslDocumentSymbols(this.indexedSymbols(document, text), annotation)
        .filter(({ name }) => name.startsWith(localPrefix.text) && !localNames.has(name));
    const declaredNames = new Set([...localNames, ...references.map(({ name }) => name)]);
    const items = locals.map((symbol) => createLocalSymbolItem(
      document, localPrefix.startOffset, localPrefix.endOffset, symbol,
    ));
    items.push(...references.map((symbol) => createDocumentSymbolItem(
      document, text, annotation.kind, localPrefix.startOffset, localPrefix.endOffset, symbol,
    )));
    items.push(
      ...selection.entries
        .filter(({ label }) => !declaredNames.has(label))
        .map((entry) => createCompletionItem(
          document,
          prefix.startOffset,
          prefix.endOffset,
          entry,
          annotation.kind,
        )),
    );

    const useShortlist = prefix.text.length === 0 || prefix.text === '\\';
    return new vscode.CompletionList(
      useShortlist ? items.slice(0, 25) : items,
      selection.isIncomplete || locals.length > 0 || references.length > 0,
    );
  }
}
