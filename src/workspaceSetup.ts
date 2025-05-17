import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ConfigProfile } from './configurations/profiles'; // Ensure this path is correct

export async function setupWorkspaceBasedOnProfile(profile: ConfigProfile, _extensionUriOrPath: vscode.Uri | string): Promise<boolean> {
    // _extensionUriOrPath is not actively used in this version but kept for potential future use
    const options: vscode.OpenDialogOptions = {
        canSelectMany: false,
        openLabel: 'Create Workspace Here',
        canSelectFiles: false,
        canSelectFolders: true,
        title: 'Select Folder for New Liku Workspace'
    };

    const folderUris = await vscode.window.showOpenDialog(options);
    if (folderUris && folderUris[0]) {
        const workspaceRootUri = folderUris[0];
        const workspacePath = workspaceRootUri.fsPath;

        try {
            const vscodeFolderPath = path.join(workspacePath, '.vscode');
            await fs.mkdir(vscodeFolderPath, { recursive: true });

            const settingsPath = path.join(vscodeFolderPath, 'settings.json');
            await fs.writeFile(settingsPath, JSON.stringify(profile.settings, null, 4));

            if (profile.extensions && profile.extensions.length > 0) {
                const extensionsPath = path.join(vscodeFolderPath, 'extensions.json');
                await fs.writeFile(extensionsPath, JSON.stringify({ recommendations: profile.extensions }, null, 4));
            }

            if (profile.files && profile.files.length > 0) {
                for (const file of profile.files) {
                    const filePath = path.join(workspacePath, file.path);
                    const fileDir = path.dirname(filePath);
                    if (fileDir !== workspacePath) { // Avoid trying to create the root workspacePath itself
                        await fs.mkdir(fileDir, { recursive: true });
                    }
                    await fs.writeFile(filePath, file.content);
                }
            }

            const openWorkspace = await vscode.window.showInformationMessage(
                `Workspace '${profile.name}' created at ${workspacePath}. Open it?`,
                { modal: true },
                'Open Workspace'
            );

            if (openWorkspace === 'Open Workspace') {
                await vscode.commands.executeCommand('vscode.openFolder', workspaceRootUri, false);
            }
            return true;
        } catch (error: any) {
            console.error('Error setting up Liku workspace:', error);
            vscode.window.showErrorMessage(`Failed to set up Liku workspace: ${error.message || error}`);
            return false;
        }
    }
    return false;
}