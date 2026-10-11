import * as vscode from 'vscode';

const ACSL_DETAIL_PREFIX = 'ACSL ';

function fail(message: string): never {
  throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    fail(`${message}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

function completionLabel(item: vscode.CompletionItem): string {
  return typeof item.label === 'string' ? item.label : item.label.label;
}

function completionSummary(items: readonly vscode.CompletionItem[]): string {
  return items
    .map((item) => `${completionLabel(item)} (${item.detail ?? 'no detail'})`)
    .join(', ');
}

function assertHasLabel(
  items: readonly vscode.CompletionItem[],
  expectedLabel: string,
): void {
  if (!items.some((item) => completionLabel(item) === expectedLabel)) {
    fail(
      `Expected completion ${JSON.stringify(expectedLabel)}; received: ${completionSummary(items)}`,
    );
  }
}

function itemWithLabel(
  items: readonly vscode.CompletionItem[],
  expectedLabel: string,
): vscode.CompletionItem {
  const item = items.find(
    (candidate) => completionLabel(candidate) === expectedLabel,
  );
  if (item === undefined) {
    fail(
      `Expected completion ${JSON.stringify(expectedLabel)}; received: ${completionSummary(items)}`,
    );
  }
  return item;
}

function replacementRange(item: vscode.CompletionItem): vscode.Range {
  if (item.range === undefined) {
    return fail(`Completion ${completionLabel(item)} has no explicit range`);
  }
  return item.range instanceof vscode.Range ? item.range : item.range.replacing;
}

function isAcslCompletion(item: vscode.CompletionItem): boolean {
  return item.detail?.startsWith(ACSL_DETAIL_PREFIX) ?? false;
}

function positionAfter(
  document: vscode.TextDocument,
  text: string,
  occurrence = 1,
): vscode.Position {
  let startOffset = -1;

  for (let index = 0; index < occurrence; index += 1) {
    startOffset = document.getText().indexOf(text, startOffset + 1);
    if (startOffset === -1) {
      fail(
        `Could not find occurrence ${occurrence} of ${JSON.stringify(text)} in ${document.uri.toString()}`,
      );
    }
  }

  return document.positionAt(startOffset + text.length);
}

function workspaceRoot(): vscode.Uri {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (folder === undefined) {
    return fail('The integration-test fixture workspace is not open');
  }

  return folder.uri;
}

async function openFixture(name: string): Promise<vscode.TextDocument> {
  const uri = vscode.Uri.joinPath(workspaceRoot(), name);
  const document = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(document, { preview: false });
  return document;
}

async function requestCompletions(
  document: vscode.TextDocument,
  position: vscode.Position,
  triggerCharacter?: string,
): Promise<readonly vscode.CompletionItem[]> {
  const args: [vscode.Uri, vscode.Position, string?] = [
    document.uri,
    position,
  ];

  if (triggerCharacter !== undefined) {
    args.push(triggerCharacter);
  }

  const completionList =
    await vscode.commands.executeCommand<vscode.CompletionList | undefined>(
      'vscode.executeCompletionItemProvider',
      ...args,
    );

  return completionList?.items ?? [];
}

/**
 * Registers one browser-safe suite. The desktop entry and the bundled web
 * runner both call this function, so the same assertions exercise both hosts.
 */
export function registerCompletionIntegrationSuite(): void {
  suite('ACSL completion integration', () => {
    suiteSetup(async () => {
      const extension = vscode.extensions.getExtension(
        'zehanchen.acsl-toolkit',
      );
      if (extension === undefined) {
        fail('The ACSL Toolkit development extension is not installed');
      }
      await extension.activate();
    });

    teardown(async () => {
      await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    });

    test('provides lexical completion in a C block annotation', async () => {
      const document = await openFixture('contract.c');

      assertEqual(document.languageId, 'c', 'C language id must be preserved');

      const items = await requestCompletions(
        document,
        positionAfter(document, 'req'),
      );

      assertHasLabel(items, 'requires');
    });

    test('provides loop-clause completion inside a function body', async () => {
      const document = await openFixture('contract.c');
      const items = await requestCompletions(
        document,
        positionAfter(document, 'loop'),
      );

      assertHasLabel(items, 'loop invariant');
      assertHasLabel(items, 'loop assigns');
      assertHasLabel(items, 'loop variant');
    });

    test('provides backslash completion in a C++ line annotation', async () => {
      const document = await openFixture('contract.cpp');

      assertEqual(
        document.languageId,
        'cpp',
        'C++ language id must be preserved',
      );

      const items = await requestCompletions(
        document,
        positionAfter(document, '\\va'),
        '\\',
      );

      assertHasLabel(items, '\\valid');
      assertHasLabel(items, '\\valid_read');
    });

    test('does not add ACSL candidates in ordinary C code', async () => {
      const document = await openFixture('ordinary.c');
      const items = await requestCompletions(
        document,
        positionAfter(document, 'req'),
      );

      const acslItems = items.filter(isAcslCompletion);
      assertEqual(
        acslItems.length,
        0,
        `Ordinary C code received ACSL candidates: ${completionSummary(acslItems)}`,
      );
    });

    test('does not add ACSL candidates in an ordinary comment', async () => {
      const document = await openFixture('ordinary-comment.cpp');
      const items = await requestCompletions(
        document,
        positionAfter(document, 'req'),
      );

      const acslItems = items.filter(isAcslCompletion);
      assertEqual(
        acslItems.length,
        0,
        `Ordinary comment received ACSL candidates: ${completionSummary(acslItems)}`,
      );
    });

    test('supports untitled documents without a file-scheme restriction', async () => {
      const document = await vscode.workspace.openTextDocument({
        language: 'c',
        content: '//@ ens',
      });
      await vscode.window.showTextDocument(document, { preview: false });

      assertEqual(
        document.uri.scheme,
        'untitled',
        'The test document must exercise a non-file scheme',
      );

      const items = await requestCompletions(
        document,
        positionAfter(document, 'ens'),
      );

      assertHasLabel(items, 'ensures');
    });

    test('returns one multiline axiomatic snippet with named placeholders', async () => {
      const document = await vscode.workspace.openTextDocument({
        language: 'c',
        content: '/*@\n  axio\n*/',
      });
      await vscode.window.showTextDocument(document, { preview: false });

      const items = await requestCompletions(
        document,
        positionAfter(document, 'axio'),
      );
      const acslAxiomaticItems = items.filter(
        (item) => isAcslCompletion(item) && completionLabel(item) === 'axiomatic',
      );

      assertEqual(
        acslAxiomaticItems.length,
        1,
        'Axiomatic must have one ACSL completion candidate',
      );

      const axiomatic = acslAxiomaticItems[0]!;
      assertEqual(
        axiomatic.kind,
        vscode.CompletionItemKind.Snippet,
        'Axiomatic completion must be a snippet',
      );
      if (!(axiomatic.insertText instanceof vscode.SnippetString)) {
        fail('Axiomatic completion must use SnippetString insertion');
      }
      assertEqual(
        axiomatic.insertText.value,
        'axiomatic ${1:name} {\n\t${2:declarations}\n}',
        'Axiomatic snippet must preserve its multiline block structure',
      );
    });

    test('folds a multiline snippet into one line in a line annotation', async () => {
      const document = await vscode.workspace.openTextDocument({
        language: 'c',
        content: '//@ axio',
      });
      await vscode.window.showTextDocument(document, { preview: false });

      const items = await requestCompletions(
        document,
        positionAfter(document, 'axio'),
      );
      const acslAxiomaticItems = items.filter(
        (item) => isAcslCompletion(item) && completionLabel(item) === 'axiomatic',
      );

      assertEqual(
        acslAxiomaticItems.length,
        1,
        'Axiomatic must remain available in a line annotation',
      );
      const axiomatic = acslAxiomaticItems[0]!;
      if (!(axiomatic.insertText instanceof vscode.SnippetString)) {
        fail('Axiomatic line completion must use SnippetString insertion');
      }
      assertEqual(
        axiomatic.insertText.value,
        'axiomatic ${1:name} { ${2:declarations} }',
        'A multiline snippet must not escape a line annotation',
      );
    });

    test('consumes a stray semicolon after a block snippet prefix', async () => {
      const document = await vscode.workspace.openTextDocument({
        language: 'c',
        content: '/*@ axio; */',
      });
      await vscode.window.showTextDocument(document, { preview: false });

      const items = await requestCompletions(
        document,
        positionAfter(document, 'axio'),
      );
      const axiomatic = itemWithLabel(items.filter(isAcslCompletion), 'axiomatic');

      assertEqual(
        document.getText(replacementRange(axiomatic)),
        'axio;',
        'A block snippet range must consume a stray following semicolon',
      );
    });

    test('replaces the complete token when completion is requested mid-word', async () => {
      const document = await vscode.workspace.openTextDocument({
        language: 'c',
        content: '/*@ requires; */',
      });
      await vscode.window.showTextDocument(document, { preview: false });

      const items = await requestCompletions(
        document,
        positionAfter(document, 'requ'),
      );
      const requires = itemWithLabel(items, 'requires');

      assertEqual(
        document.getText(replacementRange(requires)),
        'requires',
        'Completion range must consume the suffix after the cursor',
      );
    });

    test('uses the native line-comment action inside a block annotation', async () => {
      const activeSource = '/*@\n  req\n*/';
      const document = await vscode.workspace.openTextDocument({
        language: 'c',
        content: activeSource,
      });
      const editor = await vscode.window.showTextDocument(document, {
        preview: false,
      });

      const placeCursorAfterPrefix = (): void => {
        const position = positionAfter(document, 'req');
        editor.selection = new vscode.Selection(position, position);
      };

      placeCursorAfterPrefix();
      await vscode.commands.executeCommand('editor.action.commentLine');
      assertEqual(
        /^\/\/ ?req$/u.test(document.lineAt(1).text.trim()),
        true,
        'The clause line must be commented',
      );

      const disabledItems = await requestCompletions(
        document,
        positionAfter(document, 'req'),
      );
      assertEqual(
        disabledItems.filter(isAcslCompletion).length,
        0,
        'Disabled annotation must not receive ACSL completion',
      );

      placeCursorAfterPrefix();
      await vscode.commands.executeCommand('editor.action.commentLine');
      assertEqual(
        document.getText(),
        activeSource,
        'Running the native action again must restore the clause',
      );

      const restoredItems = await requestCompletions(
        document,
        positionAfter(document, 'req'),
      );
      assertHasLabel(restoredItems, 'requires');
    });
  });
}
