// src/WebviewController.ts
import * as vscode from 'vscode';
import { DEFAULT_PROFILES, WorkspaceProfile, RecommendedExtension, KeySetting } from './types';

const USER_PROFILES_KEY = 'likuWorkspaceUserProfiles';

export class WebviewController {
    public static currentPanel: WebviewController | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private readonly _context: vscode.ExtensionContext; // Store context
    private _disposables: vscode.Disposable[] = [];

    private _builtInProfiles: WorkspaceProfile[] = DEFAULT_PROFILES;
    private _userProfiles: WorkspaceProfile[] = [];

    public static createOrShow(extensionUri: vscode.Uri, context: vscode.ExtensionContext) { // Pass context
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (WebviewController.currentPanel) {
            WebviewController.currentPanel._panel.reveal(column);
            WebviewController.currentPanel.loadProfilesAndRefreshWebview(); // Refresh data
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'likuWorkspaceSetup',
            'Liku Workspace Setup',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true, // Keep state even when tab is not visible
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'media'),
                    vscode.Uri.joinPath(extensionUri, 'dist')
                ]
            }
        );

        WebviewController.currentPanel = new WebviewController(panel, extensionUri, context);
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, context: vscode.ExtensionContext) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._context = context; // Store context

        this.loadUserProfiles();
        this._update(); // Initial HTML load

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            async message => {
                try {
                    switch (message.command) {
                        case 'getProfiles': // Requested by webview on load
                            this.sendProfilesToWebview();
                            break;
                        case 'applyConfiguration':
                            const profileId = message.profileId;
                            const allProfiles = [...this._builtInProfiles, ...this._userProfiles];
                            const selectedProfile = allProfiles.find(p => p.id === profileId);
                            if (selectedProfile) {
                                await this.applyProfileConfiguration(selectedProfile);
                            } else {
                                vscode.window.showErrorMessage(`Profile with ID "${profileId}" not found.`);
                            }
                            break;
                        case 'saveUserProfile':
                            await this.saveUserProfile(message.profileData);
                            break;
                        case 'deleteUserProfile':
                            await this.deleteUserProfile(message.profileId);
                            break;
                        case 'openMarketplacePage':
                            if (message.extensionId) {
                                vscode.env.openExternal(vscode.Uri.parse(`https://marketplace.visualstudio.com/items?itemName=${message.extensionId}`));
                            }
                            break;
                        case 'showError': // For webview to send error messages
                            vscode.window.showErrorMessage(message.text);
                            break;
                        case 'showInfo':
                            vscode.window.showInformationMessage(message.text);
                            break;
                    }
                } catch (error: any) {
                    console.error("Error processing webview message:", error);
                    vscode.window.showErrorMessage(`An error occurred: ${error.message || error}`);
                }
            },
            null,
            this._disposables
        );
    }

    private loadUserProfiles() {
        const profiles = this._context.globalState.get<WorkspaceProfile[]>(USER_PROFILES_KEY);
        this._userProfiles = Array.isArray(profiles) ? profiles : [];
    }

    private async saveUserProfiles() {
        try {
            await this._context.globalState.update(USER_PROFILES_KEY, this._userProfiles);
        } catch (error: any) {
            console.error("Error saving user profiles:", error);
            vscode.window.showErrorMessage(`Failed to save user profiles: ${error.message}`);
            throw error; // Re-throw to indicate failure
        }
    }

    private sendProfilesToWebview() {
        this._panel.webview.postMessage({
            command: 'profilesLoaded',
            builtInProfiles: this._builtInProfiles,
            userProfiles: this._userProfiles
        });
    }

    public loadProfilesAndRefreshWebview() {
        this.loadUserProfiles();
        this.sendProfilesToWebview();
    }

    private async saveUserProfile(profileData: any) { // profileData comes from webview
        if (!profileData.name || !profileData.id) {
            vscode.window.showErrorMessage("Profile name and a unique ID are required to save.");
            return;
        }
        // Basic validation - ensure structure matches WorkspaceProfile
        const newProfile: WorkspaceProfile = {
            id: profileData.id.trim().toLowerCase().replace(/\s+/g, '-'), // Sanitize ID
            name: profileData.name.trim(),
            description: profileData.description?.trim() || "",
            recommendedExtensions: Array.isArray(profileData.recommendedExtensions) ? profileData.recommendedExtensions : [],
            keySettingsSnippet: Array.isArray(profileData.keySettingsSnippet) ? profileData.keySettingsSnippet : [],
        };

        const existingIndex = this._userProfiles.findIndex(p => p.id === newProfile.id);
        if (existingIndex > -1) {
            this._userProfiles[existingIndex] = newProfile; // Update existing
        } else {
            // Ensure ID is unique across built-in and user profiles before adding new
            const allIds = [...this._builtInProfiles.map(p => p.id), ...this._userProfiles.map(p => p.id)];
            if (allIds.includes(newProfile.id)) {
                 vscode.window.showErrorMessage(`Profile ID "${newProfile.id}" already exists. Please choose a unique ID.`);
                 this._panel.webview.postMessage({ command: 'profileSaveFailed', message: `Profile ID "${newProfile.id}" already exists.` });
                 return;
            }
            this._userProfiles.push(newProfile);
        }

        try {
            await this.saveUserProfiles();
            vscode.window.showInformationMessage(`Profile "${newProfile.name}" saved.`);
            this.sendProfilesToWebview(); // Refresh list in webview
            this._panel.webview.postMessage({ command: 'profileSavedOrDeleted' });
        } catch (error) {
            // Error already shown by saveUserProfiles
             this._panel.webview.postMessage({ command: 'profileSaveFailed', message: `Failed to save profile.` });
        }
    }

    private async deleteUserProfile(profileId: string) {
        this._userProfiles = this._userProfiles.filter(p => p.id !== profileId);
        try {
            await this.saveUserProfiles();
            vscode.window.showInformationMessage(`Profile deleted.`);
            this.sendProfilesToWebview(); // Refresh list in webview
            this._panel.webview.postMessage({ command: 'profileSavedOrDeleted' });
        } catch (error) {
            // Error already shown
        }
    }


    private async applyProfileConfiguration(profile: WorkspaceProfile) {
        return vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Applying Liku Workspace: ${profile.name}`,
            cancellable: false
        }, async (progress) => {
            try {
                progress.report({ increment: 0, message: "Updating settings..." });
                const config = vscode.workspace.getConfiguration();
                for (const setting of profile.keySettingsSnippet) {
                    try {
                        await config.update(setting.key, setting.value, vscode.ConfigurationTarget.Workspace);
                        progress.report({ message: `Applied setting: ${setting.key}` });
                    } catch (error: any) {
                        console.error(`Failed to update setting ${setting.key}:`, error);
                        vscode.window.showWarningMessage(`Failed to apply setting: ${setting.key}. ${error.message}`);
                    }
                }
                await new Promise(resolve => setTimeout(resolve, 200)); // Brief pause

                progress.report({ increment: 50, message: "Updating workspace recommendations..." });
                const workspaceFolders = vscode.workspace.workspaceFolders;
                if (workspaceFolders && workspaceFolders.length > 0) {
                    const extensionsJsonPath = vscode.Uri.joinPath(workspaceFolders[0].uri, '.vscode', 'extensions.json');
                    let recommendations: { recommendations: string[] } = { recommendations: [] };
                    try {
                        const fileContent = await vscode.workspace.fs.readFile(extensionsJsonPath);
                        recommendations = JSON.parse(Buffer.from(fileContent).toString('utf8'));
                    } catch (error) { /* File might not exist, ignore */ }

                    const existingRecs = new Set(recommendations.recommendations || []);
                    profile.recommendedExtensions.forEach(ext => existingRecs.add(ext.id));
                    recommendations.recommendations = Array.from(existingRecs).sort();

                    try {
                        await vscode.workspace.fs.writeFile(extensionsJsonPath, Buffer.from(JSON.stringify(recommendations, null, 4), 'utf8'));
                        progress.report({ message: ".vscode/extensions.json updated." });
                        vscode.window.showInformationMessage(
                            'Workspace recommendations updated. You might be prompted to install new ones.',
                            'Show Recommendations'
                        ).then(selection => {
                            if (selection === 'Show Recommendations') {
                                vscode.commands.executeCommand('workbench.extensions.action.showWorkspaceRecommendations');
                            }
                        });
                    } catch (error: any) {
                        console.error('Failed to write extensions.json:', error);
                        vscode.window.showErrorMessage(`Failed to update .vscode/extensions.json: ${error.message}`);
                    }
                } else {
                    vscode.window.showWarningMessage("No workspace folder open. Cannot set workspace recommendations.");
                }
                progress.report({ increment: 100, message: "Configuration applied!" });
                vscode.window.showInformationMessage(`Liku Workspace Configuration "${profile.name}" applied successfully!`);

            } catch (error: any) {
                console.error("Error applying profile configuration:", error);
                vscode.window.showErrorMessage(`Failed to apply configuration: ${profile.name}. ${error.message}`);
                progress.report({ increment: 100, message: "Failed to apply configuration." });
            }
        });
    }

    public dispose() {
        WebviewController.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    private _update() {
        this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);
        // Profiles will be sent after webview signals readiness via 'getProfiles' message
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        const nonce = getNonce();
        const webviewScriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview.js'));
        // If you create a dedicated CSS file for webview, bundle it similarly:
        // const webviewStyleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview.css'));

        // For icons from VS Code's theme icons:
        const trashIconUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'trash.svg')); // You'd need to add this SVG
        // Or use codicons directly in HTML: <span class="codicon codicon-trash"></span> if you include codicon.css

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; img-src ${webview.cspSource} https: data:; script-src 'nonce-${nonce}';">
    <title>Liku Workspace Setup</title>
    <style>
        /* More advanced styling using VS Code theme variables */
        body {
            font-family: var(--vscode-font-family);
            font-weight: var(--vscode-font-weight);
            font-size: var(--vscode-font-size);
            line-height: 1.6;
            color: var(--vscode-editor-foreground);
            background-color: var(--vscode-editor-background);
            padding: 20px;
            display: flex;
            flex-direction: column;
            height: 100vh;
            box-sizing: border-box;
        }
        .container {
            display: flex;
            flex-direction: column;
            gap: 20px;
            flex-grow: 1;
            overflow-y: auto; /* Allow content to scroll */
        }
        h1 { font-weight: 300; margin-bottom: 20px; color: var(--vscode-titleBar-activeForeground); }
        label { display: block; margin-bottom: 5px; margin-top: 10px; font-weight: 600; }
        
        input[type="text"], select, textarea {
            width: 100%;
            padding: 10px;
            margin-bottom: 10px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border, var(--vscode-dropdown-border, var(--vscode-settings-textInputBorder, var(--vscode-contrastBorder))));
            border-radius: 3px;
            box-sizing: border-box;
        }
        input[type="text"]:focus, select:focus, textarea:focus {
            border-color: var(--vscode-focusBorder);
            outline: none;
            box-shadow: 0 0 0 1px var(--vscode-focusBorder);
        }
        textarea { min-height: 100px; font-family: var(--vscode-editor-font-family); }

        .profile-selector-group { display: flex; gap: 10px; align-items: flex-end; }
        .profile-selector-group > div { flex-grow: 1; }
        
        .details-section, .edit-profile-section {
            margin-top: 15px;
            padding: 15px;
            background-color: var(--vscode-sideBar-background, var(--vscode-editorWidget-background));
            border: 1px solid var(--vscode-panel-border, var(--vscode-editorWidget-border, var(--vscode-contrastBorder)));
            border-radius: 5px;
        }
        .details-section h3, .edit-profile-section h3 { margin-top: 0; border-bottom: 1px solid var(--vscode-editorGroupHeader-tabsBorder); padding-bottom: 10px; margin-bottom:10px; }
        
        pre {
            background-color: var(--vscode-textCodeBlock-background, var(--vscode-editor-background, #222));
            padding: 10px;
            border-radius: 3px;
            overflow-x: auto;
            white-space: pre-wrap;
            word-wrap: break-word;
            border: 1px solid var(--vscode-panel-border, #333);
            max-height: 200px; /* Limit height */
            overflow-y: auto;
        }
        
        ul#recommendedExtensionsList { list-style: none; padding-left: 0; }
        ul#recommendedExtensionsList li {
            padding: 8px 0;
            border-bottom: 1px solid var(--vscode-editorGroup-border, #333);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        ul#recommendedExtensionsList li:last-child { border-bottom: none; }
        ul#recommendedExtensionsList li a {
            color: var(--vscode-textLink-foreground);
            text-decoration: none;
            cursor: pointer;
        }
        ul#recommendedExtensionsList li a:hover { text-decoration: underline; color: var(--vscode-textLink-activeForeground); }
        
        .button-group { display: flex; gap: 10px; margin-top: 20px; flex-wrap: wrap; }
        button, .button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: 1px solid var(--vscode-button-border, transparent);
            padding: 8px 15px;
            text-align: center;
            text-decoration: none;
            font-size: var(--vscode-font-size);
            cursor: pointer;
            border-radius: 3px;
            transition: background-color 0.1s ease-in-out;
        }
        button:hover, .button:hover { background-color: var(--vscode-button-hoverBackground); }
        button:disabled {
            background-color: var(--vscode-button-secondaryBackground, #555);
            color: var(--vscode-button-secondaryForeground, #aaa);
            cursor: not-allowed;
        }
        button.secondary {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        button.secondary:hover { background-color: var(--vscode-button-secondaryHoverBackground); }
        button.danger { background-color: var(--vscode-errorForeground); color: var(--vscode-button-foreground); }
        button.danger:hover { opacity: 0.8; }

        .hidden { display: none !important; }
        .form-section { margin-bottom: 20px; }
        .profile-actions { display: flex; justify-content: space-between; align-items: center; margin-top: 10px; }

        /* Simple modal for editing (can be improved) */
        .modal-backdrop {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background-color: rgba(0,0,0,0.5); display: flex;
            justify-content: center; align-items: center; z-index: 1000;
        }
        .modal-content {
            background-color: var(--vscode-editorWidget-background);
            padding: 25px; border-radius: 5px;
            width: 80%; max-width: 600px;
            box-shadow: 0 5px 15px rgba(0,0,0,0.3);
            max-height: 80vh; overflow-y: auto;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Liku Workspace Configuration</h1>

        <div class="profile-selector-group">
            <div>
                <label for="searchConfigurations">Search configurations...</label>
                <input type="text" id="searchConfigurations" placeholder="Type to filter profiles...">
            </div>
            <div>
                <label for="profileSelector">Select a Profile...</label>
                <select id="profileSelector">
                    <option value="">-- Select a Profile --</option>
                </select>
            </div>
            <button id="createNewProfileBtn" class="secondary" title="Create New Profile from Scratch or Current Settings">New/Edit Profile</button>
        </div>

        <div id="profileDetails" class="details-section hidden">
            <div class="profile-actions">
                <h3 id="profileName"></h3>
                <div>
                    <button id="editCurrentProfileBtn" class="secondary" title="Edit this selected profile">Edit</button>
                    <button id="deleteCurrentProfileBtn" class="danger" title="Delete this user profile">Delete</button>
                </div>
            </div>
            <p id="profileDescription"></p>
            <h4>Recommended Extensions:</h4>
            <ul id="recommendedExtensionsList"></ul>
            <h4>Key Settings Snippet (JSON):</h4>
            <pre id="keySettingsSnippetContent"></pre>
            <div class="button-group">
                <button id="applyConfigurationButton" disabled>Apply Configuration</button>
            </div>
        </div>
    </div>

    <!-- Modal for Creating/Editing Profile -->
    <div id="editProfileModal" class="modal-backdrop hidden">
        <div class="modal-content">
            <h3 id="modalTitle">Create New Profile</h3>
            <div class="form-section">
                <label for="editProfileId">Profile ID (unique, no spaces, e.g., my-custom-profile)</label>
                <input type="text" id="editProfileId" placeholder="my-custom-profile">
                <small>Leave blank for new profiles to auto-generate from name, or specify for editing.</small>
            </div>
            <div class="form-section">
                <label for="editProfileName">Profile Name</label>
                <input type="text" id="editProfileName" placeholder="My Custom Frontend Setup">
            </div>
            <div class="form-section">
                <label for="editProfileDescription">Description (Optional)</label>
                <textarea id="editProfileDescription" placeholder="A brief description of this profile."></textarea>
            </div>
            <div class="form-section">
                <label for="editRecommendedExtensions">Recommended Extensions (one per line: id,Optional Name)</label>
                <textarea id="editRecommendedExtensions" placeholder="e.g., dbaeumer.vscode-eslint,ESLint\nesbenp.prettier-vscode,Prettier"></textarea>
                <small>Format: <code>extension.id,DisplayName</code> or just <code>extension.id</code>. Name is optional.</small>
            </div>
            <div class="form-section">
                <label for="editKeySettings">Key Settings Snippet (JSON format)</label>
                <textarea id="editKeySettings" placeholder='{\n  "editor.formatOnSave": true,\n  "files.eol": "\\n"\n}'></textarea>
            </div>
            <div class="button-group">
                <button id="saveProfileButton">Save Profile</button>
                <button id="cancelEditProfileButton" class="secondary">Cancel</button>
            </div>
        </div>
    </div>

    <script nonce="${nonce}" src="${webviewScriptUri}"></script>
</body>
</html>`;
    }
}

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}