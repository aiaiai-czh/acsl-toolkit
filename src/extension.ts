import * as vscode from 'vscode';

import { AcslCompletionProvider } from './completion/completionProvider';

const ACSL_HOST_LANGUAGES: vscode.DocumentSelector = [
  { language: 'c' },
  { language: 'cpp' },
];

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      ACSL_HOST_LANGUAGES,
      new AcslCompletionProvider(),
      '\\',
    ),
  );
}

export function deactivate(): void {
  // No resources live outside context.subscriptions.
}
