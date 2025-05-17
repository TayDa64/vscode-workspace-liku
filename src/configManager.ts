import * as vscode from 'vscode';
import * as Fs from 'fs'; // If reading from external, else use require for bundled
import * as path from 'path';

export interface ConfigFile {
    path: string; // relative to workspace root
    content: string;
}

export interface ConfigProfile {
    id: string;
    name: string;
    description: string;
    icon: string; // Codicon ID
    settings: { [key: string]: any };
    extensions: string[];
    files?: ConfigFile[];
}

export function getAvailableProfiles(context: vscode.ExtensionContext): ConfigProfile[] {
    // For bundled JSON:
    const profilesPath = path.join(context.extensionPath, 'dist', 'profiles.json'); // assuming profiles.json is copied to dist
    try {
        const rawData = Fs.readFileSync(profilesPath, 'utf-8');
        const profiles: ConfigProfile[] = JSON.parse(rawData);
        return profiles;
    } catch (error) {
        console.error("Error loading profiles:", error);
        vscode.window.showErrorMessage("Could not load workspace starter profiles.");
        return [];
    }
}