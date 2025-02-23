"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FocusedExplorerDataProvider = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class FocusedExplorerDataProvider {
    constructor(context) {
        this.context = context;
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        /** Top-level focused paths (relative to the workspace root). */
        this.focusedItems = new Set();
        /** Subpaths that the user wants hidden. */
        this.excludedItems = new Set();
        const savedFocused = context.workspaceState.get('focusedExplorerItems', []);
        this.focusedItems = new Set(savedFocused);
        const savedExcluded = context.workspaceState.get('focusedExplorerExcluded', []);
        this.excludedItems = new Set(savedExcluded);
    }
    getTreeItem(element) {
        const treeItem = new vscode.TreeItem(element.label);
        treeItem.resourceUri = element.resourceUri;
        treeItem.contextValue = 'focusedExplorerItem';
        if (element.isDirectory) {
            treeItem.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
        }
        else {
            treeItem.collapsibleState = vscode.TreeItemCollapsibleState.None;
            treeItem.command = {
                command: 'vscode.open',
                title: 'Open File',
                arguments: [element.resourceUri],
            };
        }
        return treeItem;
    }
    async getChildren(element) {
        if (!vscode.workspace.workspaceFolders) {
            return [];
        }
        const rootPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
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
                return children.filter((child) => child !== null);
            }
            catch (e) {
                return [];
            }
        }
        return [];
    }
    /**
     * Asynchronously creates a FocusedItem given a relative path.
     */
    async createFocusedItemAsync(workspaceRoot, rel) {
        const fullPath = path.join(workspaceRoot, rel);
        let isDirectory = false;
        try {
            const stats = await fs.promises.stat(fullPath);
            isDirectory = stats.isDirectory();
        }
        catch {
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
    add(uri) {
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
    remove(treeItem) {
        if (!treeItem.resourceUri || !vscode.workspace.workspaceFolders) {
            return;
        }
        const rootPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
        const relPath = path.relative(rootPath, treeItem.resourceUri.fsPath);
        if (this.focusedItems.has(relPath)) {
            this.focusedItems.delete(relPath);
        }
        else {
            this.excludedItems.add(relPath);
        }
        this.persist();
    }
    /**
     * Returns the set of top-level (minimal) focused paths.
     * For example, if both "src" and "src/assets" were added,
     * only "src" will be returned.
     */
    getRootPaths() {
        const all = Array.from(this.focusedItems);
        return all.filter((candidate) => {
            return !all.some((other) => other !== candidate && candidate.startsWith(other + path.sep));
        });
    }
    /**
     * Checks whether a given relative path is excluded,
     * either directly or because it’s under an excluded path.
     */
    isExcluded(relPath) {
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
     * then refreshes the tree view.
     */
    persist() {
        this.context.workspaceState.update('focusedExplorerItems', Array.from(this.focusedItems));
        this.context.workspaceState.update('focusedExplorerExcluded', Array.from(this.excludedItems));
        this._onDidChangeTreeData.fire();
    }
}
exports.FocusedExplorerDataProvider = FocusedExplorerDataProvider;
//# sourceMappingURL=FocusedExplorerDataProvider.js.map