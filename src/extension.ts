import * as vscode from 'vscode';
import { FocusedExplorerDataProvider } from './FocusedExplorerDataProvider';
import * as fs from 'fs';

export function activate(context: vscode.ExtensionContext) {
  const provider = new FocusedExplorerDataProvider(context);

  vscode.window.registerTreeDataProvider('focusedExplorerView', provider);

  const addToFocusedExplorer = vscode.commands.registerCommand(
    'focusedExplorer.add',
    (uri: vscode.Uri) => {
      provider.add(uri);
    }
  );

  const removeFromFocusedExplorer = vscode.commands.registerCommand(
    'focusedExplorer.remove',
    (treeItem: vscode.TreeItem) => {
      provider.remove(treeItem);
    }
  );

  // New command: when an item is clicked in Focused Explorer,
  // open it (if it's a file) and reveal it in the built-in Explorer.
  const openAndReveal = vscode.commands.registerCommand(
    'focusedExplorer.openAndReveal',
    async (uri: vscode.Uri) => {
      try {
        const stat = await fs.promises.stat(uri.fsPath);
        if (stat.isDirectory()) {
          // For directories, reveal in Explorer.
          await vscode.commands.executeCommand('revealInExplorer', uri);
        } else {
          // For files, open the file then reveal it.
          await vscode.commands.executeCommand('vscode.open', uri);
          await vscode.commands.executeCommand('workbench.files.action.showActiveFileInExplorer');
        }
      } catch (err) {
        console.error(err);
      }
    }
  );

  context.subscriptions.push(addToFocusedExplorer, removeFromFocusedExplorer, openAndReveal);
}

export function deactivate() {
  // Cleanup if needed.
}
