# Focused Explorer Extension for VS Code

Focused Explorer is a Visual Studio Code extension that provides a dedicated file navigation pane where you can add frequently used files or directories. It lets you maintain a clean, merged hierarchical view by combining parent and child entries, while also offering the ability to hide specific subfolders or files.

![image](https://github.com/user-attachments/assets/76a39670-7776-459e-a0ae-58b02e55f783)

## Overview

The extension offers a new tree view—**Focused Explorer**—integrated into the VS Code sidebar. It allows you to:
- **Add items:** Right-click any file or folder in the standard Explorer and select **"Add to Focused Explorer"**.
- **View a merged hierarchy:** If you add a parent folder and its child, the extension merges them so that you only see the parent folder with its complete contents.
- **Remove/hide items:** Right-click an item in the Focused Explorer to remove it. If the item is a subfolder, it is hidden via an exclusion mechanism rather than being removed from the parent folder.

Your selections are persisted across sessions using VS Code's workspace state, so you always have quick access to your most important items.

## Features

- **Custom Focused Explorer View:** A new tree view panel that displays only your selected files/folders.
- **Context Menu Integration:** Easily add items to Focused Explorer via the right-click menu in the standard Explorer.
- **Merged Hierarchy:** Prevents duplicate or redundant listings—if a parent is added, its children are merged and not displayed separately.
- **Exclusion Mechanism:** Hide specific subpaths without removing the parent folder.
- **Dynamic File Reading:** Uses asynchronous file system APIs to efficiently read large directories.
- **Persistence:** Saves your focused and excluded items across sessions.

## Installation

### Prerequisites

- [Node.js](https://nodejs.org/en/download/) (v14 or later recommended)
- [Visual Studio Code](https://code.visualstudio.com/)

### Using the Focused Explorer

**Add Items**  
In the standard Explorer, right-click on any file or folder and select **"Add to Focused Explorer"**.

**View Merged Hierarchy**  
Open the **Focused Explorer** view in the sidebar. If you add a parent folder (e.g., `src`), it displays its entire hierarchy (including `src/assets`, etc.). If you add a child folder (e.g., `src/a`) after the parent, the extension ignores the duplicate and merges the hierarchy.

**Remove/Hide Items**  
In the Focused Explorer, right-click on an item and select **"Remove from Focused Explorer"**.

- For **top-level items**, this removes the item entirely.  
- For **sub-items**, the item is added to an exclusion list so it is hidden without affecting the parent folder's display.
