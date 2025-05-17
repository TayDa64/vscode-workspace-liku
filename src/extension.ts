import * as vscode from 'vscode';
import { WebviewController } from './WebviewController'; // Will create this file

class LikuWorkspaceTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: vscode.TreeItem): Thenable<vscode.TreeItem[]> {
        if (element) {
            return Promise.resolve([]);
        } else {
            const setupItem = new vscode.TreeItem("New Workspace with Liku...", vscode.TreeItemCollapsibleState.None);
            setupItem.command = {
                command: "workspace-liku.setupWorkspace",
                title: "New Workspace with Liku...",
                tooltip: "Launch the Liku workspace configuration setup"
            };
            setupItem.iconPath = new vscode.ThemeIcon("rocket");
            return Promise.resolve([setupItem]);
        }
    }
}

export function activate(context: vscode.ExtensionContext) {
    console.log('vscode-workspace-liku is now active!');

    const likuWorkspaceProvider = new LikuWorkspaceTreeDataProvider();
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider("workspace-liku.activityView", likuWorkspaceProvider)
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('workspace-liku.setupWorkspace', () => {
            WebviewController.createOrShow(context.extensionUri);
        })
    );
}

export function deactivate() {}