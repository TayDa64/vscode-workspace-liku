// src/extension.ts
import * as vscode from 'vscode';
import { WebviewController } from './WebviewController';

// *** THIS CLASS DEFINITION WAS MISSING IN THE PREVIOUS RESPONSE ***
class LikuWorkspaceTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: vscode.TreeItem): Thenable<vscode.TreeItem[]> {
        if (element) {
            // If you wanted to have sub-items under the main Liku item,
            // you would handle that here. For now, it's flat.
            return Promise.resolve([]);
        } else {
            // This is the root item in your custom view
            const setupItem = new vscode.TreeItem("New Workspace with Liku...", vscode.TreeItemCollapsibleState.None);
            setupItem.command = {
                command: "workspace-liku.setupWorkspace",
                title: "New Workspace with Liku...", // Title for the command
                tooltip: "Launch the Liku workspace configuration setup" // Tooltip for the tree item
            };
            // Use a built-in VS Code icon (see https://code.visualstudio.com/api/references/icons-in-labels)
            setupItem.iconPath = new vscode.ThemeIcon("rocket");
            // You could add more items here if needed, e.g., "Manage Profiles", "Settings"
            return Promise.resolve([setupItem]);
        }
    }

    // Optional: If your tree view data can change, implement an event emitter
    // private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | null | void> = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
    // readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    // refresh(): void {
    //  this._onDidChangeTreeData.fire();
    // }
}
// ********************************************************************

export function activate(context: vscode.ExtensionContext) {
    console.log('vscode-workspace-liku is now active!');

    // Register the TreeDataProvider for the custom view
    // Ensure "workspace-liku.activityView" matches the "id" in package.json's "views" contribution
    const likuWorkspaceProvider = new LikuWorkspaceTreeDataProvider();
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider("workspace-liku.activityView", likuWorkspaceProvider)
    );

    // Register the command that opens the webview
    context.subscriptions.push(
        vscode.commands.registerCommand('workspace-liku.setupWorkspace', () => {
            // Pass the extension's context to the WebviewController
            // so it can access globalState for storing user profiles.
            WebviewController.createOrShow(context.extensionUri, context);
        })
    );

    // Example of another command you might add later
    // context.subscriptions.push(
    //  vscode.commands.registerCommand('workspace-liku.manageProfiles', () => {
    //      // Potentially open the webview to a specific "manage profiles" section
    //      WebviewController.createOrShow(context.extensionUri, context, 'manage');
    //  })
    // );
}

export function deactivate() {
    // Dispose of the webview panel if it exists when the extension is deactivated
    if (WebviewController.currentPanel) {
        WebviewController.currentPanel.dispose();
    }
}