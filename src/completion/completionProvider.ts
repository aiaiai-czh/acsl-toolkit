import * as vscode from 'vscode';

import {
  scanAcslContext,
  type AcslAnnotationKind,
} from '../context/acslContext';
import type { AcslCatalogEntry } from '../types/catalog';
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

export class AcslCompletionProvider implements vscode.CompletionItemProvider {
  public constructor(
    private readonly catalog: readonly Readonly<AcslCatalogEntry>[] = ACSL_CATALOG,
  ) {}

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
    const items = selection.entries.map((entry) =>
      createCompletionItem(
        document,
        prefix.startOffset,
        prefix.endOffset,
        entry,
        annotation.kind,
      ),
    );

    return new vscode.CompletionList(items, selection.isIncomplete);
  }
}
