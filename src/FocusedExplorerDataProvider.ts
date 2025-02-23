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

  constructor(private context: vscode.ExtensionContext) {
    // Load data for the *current* workspace folder (if any).
    const rootPath = this.getWorkspaceRoot();
    if (rootPath) {
      const focusedKey = `focusedExplorerItems-${rootPath}`;
      const excludedKey = `focusedExplorerExcluded-${rootPath}`;

      const savedFocused = context.workspaceState.get<string[]>(focusedKey, []);
      this.focusedItems = new Set(savedFocused);

      const savedExcluded = context.workspaceState.get<string[]>(excludedKey, []);
      this.excludedItems = new Set(savedExcluded);
    }
  }

  public getTreeItem(element: FocusedItem): vscode.TreeItem {
    const treeItem = new vscode.TreeItem(element.label);
    treeItem.resourceUri = element.resourceUri;
    treeItem.contextValue = 'focusedExplorerItem';

    if (element.isDirectory) {
      treeItem.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
    } else {
      treeItem.collapsibleState = vscode.TreeItemCollapsibleState.None;
      treeItem.command = {
        command: 'vscode.open',
        title: 'Open File',
        arguments: [element.resourceUri],
      };
    }
    return treeItem;
  }

  public async getChildren(element?: FocusedItem): Promise<FocusedItem[]> {
    const rootPath = this.getWorkspaceRoot();
    if (!rootPath) {
      return [];
    }

    if (!element) {
      // Return top-level focused items (after filtering for duplicates)
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

  /**
   * Asynchronously creates a FocusedItem given a relative path.
   */
  private async createFocusedItemAsync(workspaceRoot: string, rel: string): Promise<FocusedItem> {
    const fullPath = path.join(workspaceRoot, rel);
    let isDirectory = false;
    try {
      const stats = await fs.promises.stat(fullPath);
      isDirectory = stats.isDirectory();
    } catch {
      // If error occurs (file may have been deleted), assume not a directory.
    }
    return {
      label: path.basename(rel),
      resourceUri: vscode.Uri.file(fullPath),
      isDirectory,
      relativePath: rel,
    };
  }

  /**
   * Adds a new path to the focused items.
   * If a parent is already focused, the new path is ignored.
   * If the new path is a parent of existing items, those items are removed.
   */
  public add(uri: vscode.Uri) {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    if (!workspaceFolder) {
      return;
    }
    const rootPath = workspaceFolder.uri.fsPath;
    const relPath = path.relative(rootPath, uri.fsPath);

    // Check if relPath is already covered by an existing focused item.
    for (const existing of this.focusedItems) {
      if (relPath === existing || relPath.startsWith(existing + path.sep)) {
        // Already covered; ignore.
        return;
      }
    }

    // Remove any focused items that are children of the new path.
    for (const existing of Array.from(this.focusedItems)) {
      if (existing.startsWith(relPath + path.sep)) {
        this.focusedItems.delete(existing);
      }
    }

    // Remove from excluded if present.
    this.excludedItems.delete(relPath);

    // Add the new path.
    this.focusedItems.add(relPath);
    this.persist();
  }

  /**
   * Removes an item from the focused explorer.
   * If the item is a top-level focused item, it is removed.
   * Otherwise, the item is added to the exclusion list.
   */
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

  /**
   * Returns the set of top-level (minimal) focused paths.
   * For example, if both "src" and "src/assets" were added,
   * only "src" will be returned.
   */
  private getRootPaths(): string[] {
    const all = Array.from(this.focusedItems);
    return all.filter((candidate) => {
      return !all.some((other) => other !== candidate && candidate.startsWith(other + path.sep));
    });
  }

  /**
   * Checks whether a given relative path is excluded,
   * either directly or because it’s under an excluded path.
   */
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

  /**
   * Persists both focusedItems and excludedItems to workspaceState,
   * under keys specific to the current workspace root,
   * then refreshes the tree view.
   */
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

  /**
   * Helper to return the first workspace root path (if any).
   * Adjust this if you need multi-root handling.
   */
  private getWorkspaceRoot(): string | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  }
}
