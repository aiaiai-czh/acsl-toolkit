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

function isDocumentCompletion(item: vscode.CompletionItem): boolean {
  return item.detail?.startsWith('ACSL document ·') ?? false;
}

function snippetBody(item: vscode.CompletionItem): string {
  if (!(item.insertText instanceof vscode.SnippetString)) {
    return fail(`${completionLabel(item)} must use SnippetString insertion`);
  }
  return item.insertText.value;
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

    test('provides a parameter snippet for a mathematical built-in', async () => {
      const document = await vscode.workspace.openTextDocument({
        language: 'c',
        content: '/*@ assert \\ma; */',
      });
      await vscode.window.showTextDocument(document, { preview: false });

      const items = await requestCompletions(
        document,
        positionAfter(document, '\\ma'),
      );
      const maxItems = items.filter(
        (item) => isAcslCompletion(item) && completionLabel(item) === '\\max',
      );

      assertEqual(maxItems.length, 1, '\\max must have one ACSL candidate');
      const max = maxItems[0]!;
      assertEqual(
        max.kind,
        vscode.CompletionItemKind.Function,
        '\\max must remain a function completion',
      );
      if (!(max.insertText instanceof vscode.SnippetString)) {
        fail('\\max must use SnippetString insertion when no call exists');
      }
      assertEqual(
        max.insertText.value,
        '\\max(${1:x}, ${2:y})',
        '\\max must provide two ordered argument placeholders',
      );
      assertEqual(
        document.getText(replacementRange(max)),
        '\\ma',
        '\\max replacement must preserve the following semicolon',
      );
    });

    test('preserves audited aggregate and variadic argument shapes', async () => {
      const cases = [
        {
          prefix: '\\su',
          label: '\\sum',
          body: '\\sum(${1:lower}, ${2:upper}, ${3:function})',
        },
        {
          prefix: '\\un',
          label: '\\union',
          body: '\\union(${1:sets})',
        },
      ] as const;

      for (const testCase of cases) {
        const document = await vscode.workspace.openTextDocument({
          language: 'c',
          content: `/*@ assert ${testCase.prefix}; */`,
        });
        await vscode.window.showTextDocument(document, { preview: false });

        const items = await requestCompletions(
          document,
          positionAfter(document, testCase.prefix),
        );
        const item = itemWithLabel(
          items.filter(isAcslCompletion),
          testCase.label,
        );

        if (!(item.insertText instanceof vscode.SnippetString)) {
          fail(`${testCase.label} must use SnippetString insertion`);
        }
        assertEqual(
          item.insertText.value,
          testCase.body,
          `${testCase.label} must preserve its audited parameter shape`,
        );
      }
    });

    test('provides a unary built-in snippet in a line annotation', async () => {
      const document = await vscode.workspace.openTextDocument({
        language: 'c',
        content: '//@ assert \\ab > 0;',
      });
      await vscode.window.showTextDocument(document, { preview: false });

      const items = await requestCompletions(
        document,
        positionAfter(document, '\\ab'),
      );
      const abs = itemWithLabel(items.filter(isAcslCompletion), '\\abs');

      if (!(abs.insertText instanceof vscode.SnippetString)) {
        fail('\\abs must use SnippetString insertion');
      }
      assertEqual(
        abs.insertText.value,
        '\\abs(${1:value})',
        '\\abs must provide one argument placeholder',
      );
    });

    test('provides a parameter snippet for a plain-word built-in function', async () => {
      const document = await vscode.workspace.openTextDocument({
        language: 'c',
        content: '/*@ assert real_of_fl == 0.0; */',
      });
      await vscode.window.showTextDocument(document, { preview: false });

      const items = await requestCompletions(
        document,
        positionAfter(document, 'real_of_fl'),
      );
      const realOfFloat = itemWithLabel(
        items.filter(isAcslCompletion),
        'real_of_float',
      );

      assertEqual(
        realOfFloat.kind,
        vscode.CompletionItemKind.Function,
        'A plain-word built-in must remain a function completion',
      );
      if (!(realOfFloat.insertText instanceof vscode.SnippetString)) {
        fail('real_of_float must use SnippetString insertion');
      }
      assertEqual(
        realOfFloat.insertText.value,
        'real_of_float(${1:value})',
        'real_of_float must provide its value placeholder',
      );
    });

    test('does not duplicate existing built-in call parentheses', async () => {
      const document = await vscode.workspace.openTextDocument({
        language: 'c',
        content: '/*@ assert \\max (x, y) > 0; */',
      });
      await vscode.window.showTextDocument(document, { preview: false });

      const items = await requestCompletions(
        document,
        positionAfter(document, '\\ma'),
      );
      const max = itemWithLabel(items.filter(isAcslCompletion), '\\max');

      assertEqual(
        document.getText(replacementRange(max)),
        '\\max',
        'Mid-token completion must replace the complete built-in name',
      );
      assertEqual(
        max.insertText,
        '\\max',
        'Existing call arguments must remain untouched',
      );
    });

    test('preserves existing label and type arguments before a call', async () => {
      const cases = [
        {
          source: '/*@ assert \\base_addr{Old}(pointer) != \\null; */',
          prefix: '\\base_a',
          label: '\\base_addr',
        },
        {
          source: '/*@ assert \\length(\\Cons<A>(head, tail)) > 0; */',
          prefix: '\\Co',
          label: '\\Cons',
        },
      ] as const;

      for (const testCase of cases) {
        const document = await vscode.workspace.openTextDocument({
          language: 'c',
          content: testCase.source,
        });
        await vscode.window.showTextDocument(document, { preview: false });

        const items = await requestCompletions(
          document,
          positionAfter(document, testCase.prefix),
        );
        const item = itemWithLabel(
          items.filter(isAcslCompletion),
          testCase.label,
        );

        assertEqual(
          document.getText(replacementRange(item)),
          testCase.label,
          'Completion must replace only the complete callable name',
        );
        assertEqual(
          item.insertText,
          testCase.label,
          'Existing label or type arguments must remain untouched',
        );
      }
    });

    test('preserves an existing call for a plain-word built-in', async () => {
      const document = await vscode.workspace.openTextDocument({
        language: 'c',
        content: '/*@ assert pow (x, y) > 0; */',
      });
      await vscode.window.showTextDocument(document, { preview: false });

      const items = await requestCompletions(
        document,
        positionAfter(document, 'po'),
      );
      const pow = itemWithLabel(items.filter(isAcslCompletion), 'pow');

      assertEqual(
        document.getText(replacementRange(pow)),
        'pow',
        'Mid-token completion must replace the complete plain-word name',
      );
      assertEqual(
        pow.insertText,
        'pow',
        'Existing plain-word call arguments must remain untouched',
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

    test('completes declaration parameters after their first letter', async () => {
      const cases = [
        {
          language: 'c',
          source: '/*@ predicate positive(integer value) = v > 0; */',
          prefix: '= v',
        },
        {
          language: 'cpp',
          source: '/*@ logic integer doubled(integer value) = v * 2; */',
          prefix: '= v',
        },
      ] as const;

      for (const testCase of cases) {
        const document = await vscode.workspace.openTextDocument({
          language: testCase.language,
          content: testCase.source,
        });
        await vscode.window.showTextDocument(document, { preview: false });

        const items = await requestCompletions(
          document,
          positionAfter(document, testCase.prefix),
        );
        const value = itemWithLabel(items.filter(isAcslCompletion), 'value');

        assertEqual(
          value.kind,
          vscode.CompletionItemKind.Variable,
          'A declaration parameter must be a variable completion',
        );
        assertEqual(value.insertText, 'value', 'Insert the declared name only');
        assertEqual(
          document.getText(replacementRange(value)),
          'v',
          'The replacement range must contain the typed parameter prefix',
        );
        assertEqual(
          document.languageId,
          testCase.language,
          'Local completion must preserve the host language id',
        );
      }
    });

    test('uses only case-local bindings in inductive definitions', async () => {
      const cases = [
        {
          source:
            '/*@ inductive positive(integer value) { case base: v > 0; } */',
          prefix: ': v',
          expectedValue: false,
        },
        {
          source:
            '/*@ inductive positive(integer argument) { case base: \\forall integer value; v > 0 ==> positive(value); } */',
          prefix: '; v',
          expectedValue: true,
        },
        {
          source:
            '/*@ inductive positive(integer argument) { case base: \\let value = 1; v > 0 ==> positive(value); } */',
          prefix: '; v',
          expectedValue: true,
        },
      ] as const;

      for (const testCase of cases) {
        const document = await vscode.workspace.openTextDocument({
          language: 'c',
          content: testCase.source,
        });
        await vscode.window.showTextDocument(document, { preview: false });

        const items = await requestCompletions(
          document,
          positionAfter(document, testCase.prefix),
        );
        assertEqual(
          items.some(
            (item) => isAcslCompletion(item) && completionLabel(item) === 'value',
          ),
          testCase.expectedValue,
          'An inductive case must use its own bindings rather than header names',
        );
      }
    });

    test('completes local let, quantifier, and lambda bindings', async () => {
      const cases = [
        {
          source: '//@ assert \\let local_value = 1; loc > 0;',
          prefix: '; loc',
          label: 'local_value',
        },
        {
          source: '/*@ assert \\forall integer local_value; loc > 0; */',
          prefix: '; loc',
          label: 'local_value',
        },
        {
          source: '/*@ assert \\exists integer local_value; loc > 0; */',
          prefix: '; loc',
          label: 'local_value',
        },
        {
          source:
            '/*@ assert \\sum(0, 10, \\lambda integer element; el) > 0; */',
          prefix: '; el',
          label: 'element',
        },
      ] as const;

      for (const testCase of cases) {
        const document = await vscode.workspace.openTextDocument({
          language: 'c',
          content: testCase.source,
        });
        await vscode.window.showTextDocument(document, { preview: false });

        const items = await requestCompletions(
          document,
          positionAfter(document, testCase.prefix),
        );
        const item = itemWithLabel(
          items.filter(isAcslCompletion),
          testCase.label,
        );
        assertEqual(
          item.kind,
          vscode.CompletionItemKind.Variable,
          'A local binding must be a variable completion',
        );
      }
    });

    test('replaces the complete parameter token without consuming a semicolon', async () => {
      const document = await vscode.workspace.openTextDocument({
        language: 'c',
        content: '/*@ logic integer identity(integer value) = value; */',
      });
      await vscode.window.showTextDocument(document, { preview: false });

      const items = await requestCompletions(
        document,
        positionAfter(document, '= va'),
      );
      const value = itemWithLabel(items.filter(isAcslCompletion), 'value');

      assertEqual(
        document.getText(replacementRange(value)),
        'value',
        'Mid-word parameter completion must replace the full identifier',
      );
      assertEqual(value.insertText, 'value', 'A variable does not insert a snippet');
    });

    test('keeps local variables and catalog completions in the same list', async () => {
      const document = await vscode.workspace.openTextDocument({
        language: 'c',
        content: '/*@ predicate p(integer predicate_value) = pred > 0; */',
      });
      await vscode.window.showTextDocument(document, { preview: false });

      const items = (await requestCompletions(
        document,
        positionAfter(document, '= pred'),
      )).filter(isAcslCompletion);

      assertHasLabel(items, 'predicate_value');
      assertHasLabel(items, 'predicate');
    });

    test('returns one candidate for a shadowed local name', async () => {
      const document = await vscode.workspace.openTextDocument({
        language: 'c',
        content:
          '/*@ predicate p(integer value) = (\\forall real value; va > 0); */',
      });
      await vscode.window.showTextDocument(document, { preview: false });

      const items = await requestCompletions(
        document,
        positionAfter(document, '; va'),
      );
      const valueItems = items.filter(
        (item) => isAcslCompletion(item) && completionLabel(item) === 'value',
      );

      assertEqual(valueItems.length, 1, 'A shadowed name must not be duplicated');
      assertEqual(
        valueItems[0]!.kind,
        vscode.CompletionItemKind.Variable,
        'The visible local name must remain a variable',
      );
    });

    test('does not leak locals out of their declaration or binder scope', async () => {
      const cases = [
        {
          source:
            '/*@ predicate p(integer local_value) = local_value > 0; assert loc > 0; */',
          prefix: 'assert loc',
        },
        {
          source:
            '/*@ assert (\\forall integer local_value; local_value > 0) && loc > 0; */',
          prefix: '&& loc',
        },
        {
          source:
            '/*@ assert \\exists integer local_value; local_value > 0; assert loc > 0; */',
          prefix: 'assert loc',
        },
        {
          source:
            '/*@ predicate p(integer local_value) = local_value > 0; */\n//@ assert loc > 0;',
          prefix: 'assert loc',
        },
      ] as const;

      for (const testCase of cases) {
        const document = await vscode.workspace.openTextDocument({
          language: 'c',
          content: testCase.source,
        });
        await vscode.window.showTextDocument(document, { preview: false });

        const items = await requestCompletions(
          document,
          positionAfter(document, testCase.prefix),
        );
        assertEqual(
          items.some(
            (item) =>
              isAcslCompletion(item) && completionLabel(item) === 'local_value',
          ),
          false,
          'A completed scope must not expose its local names',
        );
      }
    });

    test('excludes local variables from backslash-prefixed completion', async () => {
      const document = await vscode.workspace.openTextDocument({
        language: 'c',
        content: '/*@ predicate p(integer valid_value) = \\va; */',
      });
      await vscode.window.showTextDocument(document, { preview: false });

      const items = (await requestCompletions(
        document,
        positionAfter(document, '\\va'),
        '\\',
      )).filter(isAcslCompletion);

      assertHasLabel(items, '\\valid');
      assertEqual(
        items.some((item) => completionLabel(item) === 'valid_value'),
        false,
        'A backslash prefix must not offer a plain local name',
      );
    });

    test('excludes parameter completions inside comments and strings', async () => {
      const cases = [
        {
          source: '/*@ predicate p(integer value) =\n  // v\n  value > 0; */',
          prefix: '// v',
        },
        {
          source: '/*@ predicate p(integer value) = "v"; */',
          prefix: '"v',
        },
      ] as const;

      for (const testCase of cases) {
        const document = await vscode.workspace.openTextDocument({
          language: 'c',
          content: testCase.source,
        });
        await vscode.window.showTextDocument(document, { preview: false });

        const items = await requestCompletions(
          document,
          positionAfter(document, testCase.prefix),
        );
        assertEqual(
          items.filter(isAcslCompletion).length,
          0,
          'Comments and strings must not receive ACSL parameter candidates',
        );
      }
    });

    test('completes user-defined predicate and logic calls across annotations', async () => {
      const cases = [
        {
          language: 'c',
          source:
            '/*@ predicate positive(integer value) = value > 0; */\n/*@ requires po; */',
          prefix: 'requires po',
          label: 'positive',
          body: 'positive(${1:value})',
        },
        {
          language: 'cpp',
          source:
            '/*@ logic integer doubled(integer value) = value * 2; */\n//@ assert dou > 0;',
          prefix: 'assert dou',
          label: 'doubled',
          body: 'doubled(${1:value})',
        },
        {
          language: 'c',
          source:
            '/*@ axiomatic Helpers { predicate between(integer value, integer lower, integer upper); } */\n//@ assert bet;',
          prefix: 'assert bet',
          label: 'between',
          body: 'between(${1:value}, ${2:lower}, ${3:upper})',
        },
      ] as const;

      for (const testCase of cases) {
        const document = await vscode.workspace.openTextDocument({
          language: testCase.language,
          content: testCase.source,
        });
        await vscode.window.showTextDocument(document, { preview: false });

        const items = (await requestCompletions(
          document,
          positionAfter(document, testCase.prefix),
        )).filter(isDocumentCompletion);
        const item = itemWithLabel(items, testCase.label);

        assertEqual(
          item.kind,
          vscode.CompletionItemKind.Function,
          'A user-defined callable must use the function completion kind',
        );
        assertEqual(
          snippetBody(item),
          testCase.body,
          'Argument placeholders must follow the declaration',
        );
        assertEqual(
          document.getText(replacementRange(item)),
          testCase.prefix.split(' ').at(-1),
          'The replacement range must preserve clause text and punctuation',
        );
        assertEqual(
          document.languageId,
          testCase.language,
          'Document-name completion must preserve the host language id',
        );
      }
    });

    test('permits recursive and mutually recursive references in one annotation', async () => {
      const cases = [
        {
          source: '/*@ predicate positive(integer value) = po(value - 1); */',
          prefix: '= po',
          label: 'positive',
        },
        {
          source:
            '/*@ predicate first(integer value) = sec(value); predicate second(integer value) = first(value); */',
          prefix: '= sec',
          label: 'second',
        },
      ] as const;

      for (const testCase of cases) {
        const document = await vscode.workspace.openTextDocument({
          language: 'c',
          content: testCase.source,
        });
        await vscode.window.showTextDocument(document, { preview: false });
        const items = (await requestCompletions(
          document,
          positionAfter(document, testCase.prefix),
        )).filter(isDocumentCompletion);

        assertHasLabel(items, testCase.label);
      }
    });

    test('excludes declarations in later annotations and incomplete headers', async () => {
      const cases = [
        {
          source:
            '//@ assert pos;\n/*@ predicate positive(integer value) = value > 0; */',
          prefix: 'assert pos',
        },
        {
          source: '/*@ predicate positive(integer value',
          prefix: 'pos',
        },
      ] as const;

      for (const testCase of cases) {
        const document = await vscode.workspace.openTextDocument({
          language: 'c',
          content: testCase.source,
        });
        await vscode.window.showTextDocument(document, { preview: false });
        const items = (await requestCompletions(
          document,
          positionAfter(document, testCase.prefix),
        )).filter(isDocumentCompletion);

        assertEqual(
          items.some((item) => completionLabel(item) === 'positive'),
          false,
          'An incomplete header or later annotation must not expose its name',
        );
      }
    });

    test('shows separate user-defined overload signatures without duplicate prototypes', async () => {
      const document = await vscode.workspace.openTextDocument({
        language: 'c',
        content:
          '/*@ logic integer identity(integer value); logic real identity(real value); logic integer identity(integer value) = value; */\n//@ assert ide > 0;',
      });
      await vscode.window.showTextDocument(document, { preview: false });

      const items = (await requestCompletions(
        document,
        positionAfter(document, 'assert ide'),
      )).filter(
        (item) => isDocumentCompletion(item) && completionLabel(item) === 'identity',
      );

      assertEqual(items.length, 2, 'Each distinct overload must appear once');
      assertEqual(
        new Set(items.map((item) => item.detail)).size,
        2,
        'Overload details must identify separate signatures',
      );
      assertEqual(
        items.some((item) => item.detail?.includes('integer')),
        true,
        'The integer overload must expose its declared type',
      );
      assertEqual(
        items.some((item) => item.detail?.includes('real')),
        true,
        'The real overload must expose its declared type',
      );
      for (const item of items) {
        assertEqual(
          snippetBody(item),
          'identity(${1:value})',
          'Each overload must retain its declaration-based call template',
        );
      }
    });

    test('gives a same-name local binding precedence over document declarations', async () => {
      const document = await vscode.workspace.openTextDocument({
        language: 'c',
        content:
          '/*@ logic integer value(integer input) = input; */\n/*@ predicate p(integer value) = va > 0; */',
      });
      await vscode.window.showTextDocument(document, { preview: false });

      const items = (await requestCompletions(
        document,
        positionAfter(document, '= va'),
      )).filter((item) => isAcslCompletion(item) && completionLabel(item) === 'value');

      assertEqual(items.length, 1, 'A visible local name must not be duplicated');
      assertEqual(
        items[0]!.kind,
        vscode.CompletionItemKind.Variable,
        'The local binding must take precedence over a callable with the same name',
      );
      assertEqual(items[0]!.insertText, 'value', 'A shadowing variable inserts no call');
    });

    test('preserves user-defined call arguments, label arguments, and type arguments', async () => {
      const cases = [
        {
          source:
            '/*@ predicate positive(integer value) = value > 0; */\n//@ assert positive (input);',
          prefix: 'assert po',
          label: 'positive',
        },
        {
          source:
            '/*@ predicate unchanged{L}(integer *pointer) reads *pointer; */\n//@ assert unchanged{Old}(buffer);',
          prefix: 'assert unc',
          label: 'unchanged',
        },
        {
          source:
            '/*@ logic T identity<T>(T value) = value; */\n//@ assert identity<integer>(input) > 0;',
          prefix: 'assert ide',
          label: 'identity',
        },
      ] as const;

      for (const testCase of cases) {
        const document = await vscode.workspace.openTextDocument({
          language: 'c',
          content: testCase.source,
        });
        await vscode.window.showTextDocument(document, { preview: false });
        const items = (await requestCompletions(
          document,
          positionAfter(document, testCase.prefix),
        )).filter(isDocumentCompletion);
        const item = itemWithLabel(items, testCase.label);

        assertEqual(
          document.getText(replacementRange(item)),
          testCase.label,
          'Mid-word completion must replace only the complete identifier',
        );
        assertEqual(
          item.insertText,
          testCase.label,
          'Existing user-defined call arguments must remain unchanged',
        );
      }
    });

    test('distinguishes declarations without parameters from explicit empty calls', async () => {
      const cases = [
        {
          source: '/*@ logic integer limit = 10; */\n//@ assert lim > 0;',
          prefix: 'assert lim',
          label: 'limit',
          insertion: 'limit',
          isSnippet: false,
        },
        {
          source: '/*@ predicate ready = \\true; */\n//@ assert rea;',
          prefix: 'assert rea',
          label: 'ready',
          insertion: 'ready',
          isSnippet: false,
        },
        {
          source: '/*@ logic integer count() = 10; */\n//@ assert cou > 0;',
          prefix: 'assert cou',
          label: 'count',
          insertion: 'count()',
          isSnippet: true,
        },
      ] as const;

      for (const testCase of cases) {
        const document = await vscode.workspace.openTextDocument({
          language: 'c',
          content: testCase.source,
        });
        await vscode.window.showTextDocument(document, { preview: false });
        const items = (await requestCompletions(
          document,
          positionAfter(document, testCase.prefix),
        )).filter(isDocumentCompletion);
        const item = itemWithLabel(items, testCase.label);
        const insertion = testCase.isSnippet ? snippetBody(item) : item.insertText;

        assertEqual(
          insertion,
          testCase.insertion,
          'Insertion must match the presence or absence of a declared parameter list',
        );
      }
    });

    test('does not index fake or disabled user-defined declarations', async () => {
      const source = [
        '/* predicate bogus_plain(integer value); */',
        '/* ordinary /*@ predicate bogus_nested(integer value); */',
        'const char *text = "/*@ predicate bogus_string(integer value); */";',
        'const char *raw = R"tag(/*@ predicate bogus_raw(integer value); */)tag";',
        'int bogus_code(int value);',
        '/*@',
        '  // predicate bogus_disabled(integer value);',
        '*/',
        '//@ assert bog;',
      ].join('\n');
      const document = await vscode.workspace.openTextDocument({
        language: 'cpp',
        content: source,
      });
      await vscode.window.showTextDocument(document, { preview: false });

      const items = (await requestCompletions(
        document,
        positionAfter(document, 'assert bog'),
      )).filter(isDocumentCompletion);

      assertEqual(items.length, 0, 'Only genuine active ACSL declarations are indexed');
    });

    test('keeps document declarations out of other open documents', async () => {
      const declarationDocument = await vscode.workspace.openTextDocument({
        language: 'c',
        content: '/*@ predicate external_positive(integer value) = value > 0; */',
      });
      await vscode.window.showTextDocument(declarationDocument, { preview: false });
      const referenceDocument = await vscode.workspace.openTextDocument({
        language: 'c',
        content: '//@ assert external_po;',
      });
      await vscode.window.showTextDocument(referenceDocument, { preview: false });

      const items = (await requestCompletions(
        referenceDocument,
        positionAfter(referenceDocument, 'external_po'),
      )).filter(isDocumentCompletion);

      assertEqual(items.length, 0, 'Other open documents must not supply document declarations');
    });

    test('refreshes document declarations after editing the document', async () => {
      const source = '/*@ predicate positive(integer value) = value > 0; */\n//@ assert po;';
      const document = await vscode.workspace.openTextDocument({
        language: 'c',
        content: source,
      });
      await vscode.window.showTextDocument(document, { preview: false });
      const originalItems = (await requestCompletions(
        document,
        positionAfter(document, 'assert po'),
      )).filter(isDocumentCompletion);
      assertHasLabel(originalItems, 'positive');

      const edit = new vscode.WorkspaceEdit();
      edit.replace(
        document.uri,
        new vscode.Range(document.positionAt(0), document.positionAt(source.length)),
        '/*@ predicate negative(integer value) = value < 0; */\n//@ assert ne;',
      );
      assertEqual(await vscode.workspace.applyEdit(edit), true, 'The test edit must apply');
      const editedItems = (await requestCompletions(
        document,
        positionAfter(document, 'assert ne'),
      )).filter(isDocumentCompletion);

      assertHasLabel(editedItems, 'negative');
      assertEqual(
        editedItems.some((item) => completionLabel(item) === 'positive'),
        false,
        'A removed declaration must not survive in the document index',
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
