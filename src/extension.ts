import * as vscode from 'vscode';
import { FocusedExplorerDataProvider } from './FocusedExplorerDataProvider';

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

  context.subscriptions.push(addToFocusedExplorer, removeFromFocusedExplorer);
}

export function deactivate() {
  // Clean up if necessary
}
