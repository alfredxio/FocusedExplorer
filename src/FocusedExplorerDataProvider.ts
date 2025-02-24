import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/** Represents one file/folder in the Focused Explorer. */
interface FocusedItem {
  label: string;
  resourceUri: vscode.Uri;
  isDirectory: boolean;
  relativePath: string;
}

export class FocusedExplorerDataProvider
  implements vscode.TreeDataProvider<FocusedItem>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<FocusedItem | undefined | null | void>();
  public readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  /** Top-level focused paths (relative to the workspace root). */
  private focusedItems: Set<string> = new Set();

  /** Subpaths that the user wants hidden. */
  private excludedItems: Set<string> = new Set();

  private fileWatcher: vscode.FileSystemWatcher | undefined;

  constructor(private context: vscode.ExtensionContext) {
    const rootPath = this.getWorkspaceRoot();
    if (rootPath) {
      const focusedKey = `focusedExplorerItems-${rootPath}`;
      const excludedKey = `focusedExplorerExcluded-${rootPath}`;

      const savedFocused = context.workspaceState.get<string[]>(focusedKey, []);
      this.focusedItems = new Set(savedFocused);

      const savedExcluded = context.workspaceState.get<string[]>(excludedKey, []);
      this.excludedItems = new Set(savedExcluded);
    }

    // Watch for file system changes to refresh the tree.
    this.fileWatcher = vscode.workspace.createFileSystemWatcher('**/*');
    this.fileWatcher.onDidCreate(() => this._onDidChangeTreeData.fire());
    this.fileWatcher.onDidDelete(() => this._onDidChangeTreeData.fire());
    this.fileWatcher.onDidChange(() => this._onDidChangeTreeData.fire());
    this.context.subscriptions.push(this.fileWatcher);
  }

  public getTreeItem(element: FocusedItem): vscode.TreeItem {
    const treeItem = new vscode.TreeItem(element.label);
    treeItem.resourceUri = element.resourceUri;
    treeItem.contextValue = 'focusedExplorerItem';

    // Set the command so that clicking any item opens/reveals it in the Explorer.
    treeItem.command = {
      command: 'focusedExplorer.openAndReveal',
      title: 'Open and Reveal',
      arguments: [element.resourceUri]
    };

    if (element.isDirectory) {
      treeItem.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
    } else {
      treeItem.collapsibleState = vscode.TreeItemCollapsibleState.None;
    }
    return treeItem;
  }

  public async getChildren(element?: FocusedItem): Promise<FocusedItem[]> {
    const rootPath = this.getWorkspaceRoot();
    if (!rootPath) {
      return [];
    }

    if (!element) {
      const rootPaths = this.getRootPaths();
      const childrenPromises = rootPaths.map((rel) => this.createFocusedItemAsync(rootPath, rel));
      return Promise.all(childrenPromises);
    }

    if (element.isDirectory) {
      try {
        const fullDirPath = element.resourceUri.fsPath;
        const dirItems = await fs.promises.readdir(fullDirPath);
        const childrenPromises = dirItems.map(async (childName) => {
          const childRel = path.join(element.relativePath, childName);
          if (this.isExcluded(childRel)) {
            return null;
          }
          return await this.createFocusedItemAsync(rootPath, childRel);
        });
        const children = await Promise.all(childrenPromises);
        return children.filter((child): child is FocusedItem => child !== null);
      } catch (e) {
        return [];
      }
    }

    return [];
  }

  private async createFocusedItemAsync(workspaceRoot: string, rel: string): Promise<FocusedItem> {
    const fullPath = path.join(workspaceRoot, rel);
    let isDirectory = false;
    try {
      const stats = await fs.promises.stat(fullPath);
      isDirectory = stats.isDirectory();
    } catch {
      // If error occurs (file might have been deleted), assume not a directory.
    }
    return {
      label: path.basename(rel),
      resourceUri: vscode.Uri.file(fullPath),
      isDirectory,
      relativePath: rel,
    };
  }

  public add(uri: vscode.Uri) {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    if (!workspaceFolder) {
      return;
    }
    const rootPath = workspaceFolder.uri.fsPath;
    const relPath = path.relative(rootPath, uri.fsPath);

    for (const existing of this.focusedItems) {
      if (relPath === existing || relPath.startsWith(existing + path.sep)) {
        return;
      }
    }

    for (const existing of Array.from(this.focusedItems)) {
      if (existing.startsWith(relPath + path.sep)) {
        this.focusedItems.delete(existing);
      }
    }

    this.excludedItems.delete(relPath);
    this.focusedItems.add(relPath);
    this.persist();
  }

  public remove(treeItem: vscode.TreeItem) {
    if (!treeItem.resourceUri) {
      return;
    }
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(treeItem.resourceUri);
    if (!workspaceFolder) {
      return;
    }
    const rootPath = workspaceFolder.uri.fsPath;
    const relPath = path.relative(rootPath, treeItem.resourceUri.fsPath);

    if (this.focusedItems.has(relPath)) {
      this.focusedItems.delete(relPath);
    } else {
      this.excludedItems.add(relPath);
    }
    this.persist();
  }

  private getRootPaths(): string[] {
    const all = Array.from(this.focusedItems);
    return all.filter((candidate) => {
      return !all.some((other) => other !== candidate && candidate.startsWith(other + path.sep));
    });
  }

  private isExcluded(relPath: string): boolean {
    if (this.excludedItems.has(relPath)) {
      return true;
    }
    for (const excluded of this.excludedItems) {
      if (relPath.startsWith(excluded + path.sep)) {
        return true;
      }
    }
    return false;
  }

  private persist() {
    const rootPath = this.getWorkspaceRoot();
    if (!rootPath) {
      return;
    }
    const focusedKey = `focusedExplorerItems-${rootPath}`;
    const excludedKey = `focusedExplorerExcluded-${rootPath}`;

    this.context.workspaceState.update(focusedKey, Array.from(this.focusedItems));
    this.context.workspaceState.update(excludedKey, Array.from(this.excludedItems));

    this._onDidChangeTreeData.fire();
  }

  private getWorkspaceRoot(): string | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  }
}
