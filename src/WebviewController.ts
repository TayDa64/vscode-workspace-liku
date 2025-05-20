// src/WebviewController.ts
import * as vscode from 'vscode';
import { DEFAULT_PROFILES, WorkspaceProfile } from './types';

const USER_PROFILES_KEY = 'likuWorkspaceUserProfiles_v1'; // Added _v1 for potential future migrations

export class WebviewController {
    public static currentPanel: WebviewController | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private readonly _context: vscode.ExtensionContext;
    private _disposables: vscode.Disposable[] = [];

    private _builtInProfiles: WorkspaceProfile[] = DEFAULT_PROFILES.map(p => ({...p, isUserDefined: false}));
    private _userProfiles: WorkspaceProfile[] = [];

    public static createOrShow(extensionUri: vscode.Uri, context: vscode.ExtensionContext) {
        const column = vscode.window.activeTextEditor?.viewColumn;

        if (WebviewController.currentPanel) {
            WebviewController.currentPanel._panel.reveal(column);
            WebviewController.currentPanel.loadUserProfiles(); // Reload profiles
            WebviewController.currentPanel.sendProfilesToWebview(); // Send updated list
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'likuWorkspaceSetup', 'Liku Workspace Setup', column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
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
        this._context = context;

        this.loadUserProfiles();
        this._updateHtml(); // Set initial HTML

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            async message => {
                try {
                    switch (message.command) {
                        case 'getProfiles':
                            this.sendProfilesToWebview();
                            break;
                        case 'applyConfiguration':
                            const profileToApply = [...this._builtInProfiles, ...this._userProfiles]
                                .find(p => p.id === message.profileId);
                            if (profileToApply) {
                                await this.applyProfileConfiguration(profileToApply);
                            } else {
                                vscode.window.showErrorMessage(`Profile ID "${message.profileId}" not found.`);
                            }
                            break;
                        case 'saveUserProfile':
                            await this.saveUserProfile(message.profileData as WorkspaceProfile, message.isEditing as boolean);
                            break;
                        case 'deleteUserProfile':
                            await this.deleteUserProfile(message.profileId as string);
                            break;
                        case 'openMarketplacePage':
                            if (message.extensionId) {
                                vscode.env.openExternal(vscode.Uri.parse(`https://marketplace.visualstudio.com/items?itemName=${message.extensionId}`));
                            }
                            break;
                        case 'showError': vscode.window.showErrorMessage(message.text); break;
                        case 'showInfo': vscode.window.showInformationMessage(message.text); break;
                    }
                } catch (error: any) {
                    console.error("Error processing webview message:", error);
                    vscode.window.showErrorMessage(`An error occurred: ${error.message || String(error)}`);
                }
            },
            null, this._disposables
        );
    }

    private loadUserProfiles() {
        const profiles = this._context.globalState.get<WorkspaceProfile[]>(USER_PROFILES_KEY);
        this._userProfiles = (Array.isArray(profiles) ? profiles : []).map(p => ({...p, isUserDefined: true}));
    }

    private async saveUserProfilesToStorage() {
        try {
            await this._context.globalState.update(USER_PROFILES_KEY, this._userProfiles);
        } catch (error: any) {
            console.error("Error saving user profiles to globalState:", error);
            vscode.window.showErrorMessage(`Failed to save user profiles: ${error.message}`);
            throw error;
        }
    }

    private sendProfilesToWebview() {
        this._panel.webview.postMessage({
            command: 'profilesLoaded',
            builtInProfiles: this._builtInProfiles,
            userProfiles: this._userProfiles
        });
    }

    private async saveUserProfile(profileData: WorkspaceProfile, isEditingExisting: boolean) {
        if (!profileData.id || !profileData.name) {
            vscode.window.showErrorMessage("Profile ID and Name are required.");
            this._panel.webview.postMessage({ command: 'profileSaveFailed', message: "Profile ID and Name are required." });
            return;
        }
        // Ensure ID is clean (already done mostly by webview, but good practice)
        profileData.id = profileData.id.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^\w.-]/g, '');
        profileData.isUserDefined = true; // Explicitly set for profiles saved from UI

        const existingUserIndex = this._userProfiles.findIndex(p => p.id === profileData.id);

        if (isEditingExisting) {
            if (existingUserIndex > -1) {
                this._userProfiles[existingUserIndex] = profileData; // Update existing user profile
            } else {
                // This indicates an attempt to "edit" a profile ID that doesn't exist in user profiles.
                // This could happen if the original ID was changed in the form to something new.
                // Treat as a new profile creation, but first check for ID clashes with built-in or other user profiles.
                const idClash = this._builtInProfiles.some(p => p.id === profileData.id) ||
                                this._userProfiles.some(p => p.id === profileData.id); // Check again if ID changed
                if (idClash) {
                    vscode.window.showErrorMessage(`A profile with ID "${profileData.id}" already exists. Cannot update/create.`);
                    this._panel.webview.postMessage({ command: 'profileSaveFailed', message: `Profile ID "${profileData.id}" already exists.` });
                    return;
                }
                this._userProfiles.push(profileData); // Save as new because original ID for edit wasn't found
            }
        } else { // Saving a new profile (or a clone that results in a new profile)
            const idClash = this._builtInProfiles.some(p => p.id === profileData.id) || (existingUserIndex > -1);
            if (idClash) {
                vscode.window.showErrorMessage(`A profile with ID "${profileData.id}" already exists. Please choose a unique ID for the new profile.`);
                this._panel.webview.postMessage({ command: 'profileSaveFailed', message: `Profile ID "${profileData.id}" already exists.` });
                return;
            }
            this._userProfiles.push(profileData);
        }

        try {
            await this.saveUserProfilesToStorage();
            vscode.window.showInformationMessage(`Profile "${profileData.name}" saved.`);
            this.sendProfilesToWebview(); // Refresh webview list
            this._panel.webview.postMessage({ command: 'profileSavedOrDeleted' });
        } catch (error) {
            this._panel.webview.postMessage({ command: 'profileSaveFailed', message: `Failed to save profile to storage.` });
        }
    }

    private async deleteUserProfile(profileId: string) {
        const initialLength = this._userProfiles.length;
        this._userProfiles = this._userProfiles.filter(p => p.id !== profileId);

        if (this._userProfiles.length < initialLength) {
            try {
                await this.saveUserProfilesToStorage();
                vscode.window.showInformationMessage(`Profile with ID "${profileId}" deleted.`);
                this.sendProfilesToWebview();
                this._panel.webview.postMessage({ command: 'profileSavedOrDeleted' });
            } catch (error) {
                vscode.window.showErrorMessage("Failed to save changes after deletion. Profile might reappear on next load.");
                // Re-load profiles to ensure UI consistency if save failed
                this.loadUserProfiles();
                this.sendProfilesToWebview();
            }
        } else {
            vscode.window.showWarningMessage(`User profile with ID "${profileId}" not found for deletion.`);
        }
    }

    private async applyProfileConfiguration(profile: WorkspaceProfile) {
        return vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Applying Liku Workspace: ${profile.name}`,
            cancellable: false
        }, async (progress) => {
            if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
                vscode.window.showErrorMessage("No workspace folder is open. Please open a folder or workspace to apply configurations.");
                progress.report({ increment: 100, message: "Operation cancelled: No workspace open." });
                return;
            }
            try {
                progress.report({ increment: 0, message: "Updating settings..." });
                const config = vscode.workspace.getConfiguration();
                for (const setting of profile.keySettingsSnippet) {
                    try {
                        await config.update(setting.key, setting.value, vscode.ConfigurationTarget.Workspace);
                        progress.report({ message: `Applied: ${setting.key}` });
                    } catch (error: any) {
                        console.warn(`Failed to update setting ${setting.key}:`, error);
                        vscode.window.showWarningMessage(`Failed to apply setting: ${setting.key}. ${error.message}. Ensure the relevant extension is active if this is an extension-specific setting.`);
                    }
                }
                await new Promise(resolve => setTimeout(resolve, 100));

                progress.report({ increment: 50, message: "Updating workspace recommendations..." });
                const workspaceFolder = vscode.workspace.workspaceFolders[0]; // Checked above
                const extensionsJsonPath = vscode.Uri.joinPath(workspaceFolder.uri, '.vscode', 'extensions.json');
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
                progress.report({ increment: 100, message: "Configuration applied!" });
                vscode.window.showInformationMessage(`Liku Workspace Configuration "${profile.name}" applied successfully!`);

            } catch (error: any) {
                console.error("Error applying profile configuration:", error);
                vscode.window.showErrorMessage(`Failed to apply configuration "${profile.name}": ${error.message}`);
                progress.report({ increment: 100, message: "Failed to apply." });
            }
        });
    }

    public dispose() {
        WebviewController.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) { x.dispose(); }
        }
    }

    private _updateHtml() {
        this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        const nonce = getNonce();
        const webviewScriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview.js'));
        const codiconsUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'node_modules', '@vscode/codicons', 'dist', 'codicon.css')); // If using codicons locally

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; img-src ${webview.cspSource} https: data:; script-src 'nonce-${nonce}';">
    <title>Liku Workspace Setup</title>
    <!-- Codicons stylesheet can be included here if needed. -->
    <style>
        /* Styles from previous response - they are quite extensive, so kept abstract here for brevity */
        body { font-family: var(--vscode-font-family); color: var(--vscode-editor-foreground); background-color: var(--vscode-editor-background); padding: 20px; display: flex; flex-direction: column; height: calc(100vh - 40px); box-sizing: border-box; }
        .container { display: flex; flex-direction: column; gap: 15px; flex-grow: 1; overflow-y: auto; padding-right: 10px; /* For scrollbar */ }
        h1 { font-weight: 300; margin-bottom: 15px; color: var(--vscode-titleBar-activeForeground, var(--vscode-foreground)); }
        label { display: block; margin-bottom: 5px; margin-top: 10px; font-weight: 600; }
        input[type="text"], select, textarea { width: 100%; padding: 8px; margin-bottom: 10px; background-color: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, var(--vscode-dropdown-border, var(--vscode-settings-textInputBorder, var(--vscode-contrastBorder)))); border-radius: 3px; box-sizing: border-box; }
        input[type="text"]:focus, select:focus, textarea:focus { border-color: var(--vscode-focusBorder); outline: none; box-shadow: 0 0 0 1px var(--vscode-focusBorder); }
        textarea { min-height: 80px; font-family: var(--vscode-editor-font-family, var(--vscode-font-family)); font-size: var(--vscode-editor-font-size, var(--vscode-font-size)); }
        .profile-selector-group { display: flex; gap: 10px; align-items: flex-end; margin-bottom: 10px; }
        .profile-selector-group > div { flex-grow: 1; }
        .details-section, .edit-profile-section { margin-top: 10px; padding: 15px; background-color: var(--vscode-sideBar-background, var(--vscode-editorWidget-background)); border: 1px solid var(--vscode-panel-border, var(--vscode-editorWidget-border, var(--vscode-contrastBorder))); border-radius: 5px; }
        .details-section h3, .edit-profile-section h3 { margin-top: 0; border-bottom: 1px solid var(--vscode-editorGroupHeader-tabsBorder, var(--vscode-contrastBorder)); padding-bottom: 8px; margin-bottom:10px; }
        pre { background-color: var(--vscode-textCodeBlock-background, var(--vscode-input-background)); padding: 10px; border-radius: 3px; overflow-x: auto; white-space: pre-wrap; word-wrap: break-word; border: 1px solid var(--vscode-input-border, var(--vscode-contrastBorder)); max-height: 150px; overflow-y: auto; }
        ul#recommendedExtensionsList { list-style: none; padding-left: 0; max-height: 150px; overflow-y: auto; }
        ul#recommendedExtensionsList li { padding: 6px 0; border-bottom: 1px solid var(--vscode-editorGroup-border, var(--vscode-tree-tableColumnsBorder)); display: flex; justify-content: space-between; align-items: center; }
        ul#recommendedExtensionsList li:last-child { border-bottom: none; }
        ul#recommendedExtensionsList li a { color: var(--vscode-textLink-foreground); text-decoration: none; cursor: pointer; }
        ul#recommendedExtensionsList li a:hover { text-decoration: underline; color: var(--vscode-textLink-activeForeground); }
        .button-group { display: flex; gap: 10px; margin-top: 15px; flex-wrap: wrap; }
        button, .button { background-color: var(--vscode-button-background); color: var(--vscode-button-foreground); border: 1px solid var(--vscode-button-border, transparent); padding: 8px 15px; text-align: center; text-decoration: none; font-size: var(--vscode-font-size); cursor: pointer; border-radius: 3px; transition: background-color 0.1s ease-in-out; }
        button:hover, .button:hover { background-color: var(--vscode-button-hoverBackground); }
        button:disabled { background-color: var(--vscode-button-secondaryBackground, #555a); color: var(--vscode-disabledForeground, #aaa); cursor: not-allowed; opacity: 0.7; }
        button.secondary { background-color: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
        button.secondary:hover { background-color: var(--vscode-button-secondaryHoverBackground); }
        button.danger { background-color: var(--vscode-errorForeground); color: var(--vscode-button-foreground); } /* Or specific danger button colors */
        button.danger:hover { opacity: 0.8; }
        .hidden { display: none !important; }
        .form-section { margin-bottom: 15px; }
        .profile-actions { display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;}
        .profile-actions h3 { margin-bottom: 0; border-bottom: none; }
        .modal-backdrop { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.6); display: flex; justify-content: center; align-items: center; z-index: 1000; }
        .modal-content { background-color: var(--vscode-editorWidget-background, var(--vscode-quickInput-background)); padding: 20px 25px; border-radius: 5px; width: 90%; max-width: 700px; box-shadow: 0 5px 15px rgba(0,0,0,0.3); max-height: 85vh; display: flex; flex-direction: column; }
        .modal-body { overflow-y: auto; flex-grow: 1; }
        .modal-content h3 { margin-top: 0; }
        small { color: var(--vscode-descriptionForeground); font-size: calc(var(--vscode-font-size) - 1px); display: block; margin-top: -5px; margin-bottom: 5px;}
    </style>
</head>
<body>
    <div class="container">
        <h1>Liku Workspace Configuration</h1>

        <div class="profile-selector-group">
            <div>
                <label for="searchConfigurations">Search configurations...</label>
                <input type="text" id="searchConfigurations" placeholder="Filter profiles by name or description...">
            </div>
            <div>
                <label for="profileSelector">Select a Profile...</label>
                <select id="profileSelector">
                    <option value="">-- Select a Profile --</option>
                </select>
            </div>
             <button id="createNewProfileBtn" class="secondary" title="Create New Profile">New Profile</button>
        </div>

        <div id="profileDetails" class="details-section hidden">
            <div class="profile-actions">
                <h3 id="profileName"></h3>
                <div class="button-group">
                    <button id="editCurrentProfileBtn" class="secondary" title="Edit this profile">Edit</button>
                    <button id="deleteCurrentProfileBtn" class="danger hidden" title="Delete this user profile">Delete</button>
                </div>
            </div>
            <p id="profileDescription"></p>
            <h4>Recommended Extensions:</h4>
            <ul id="recommendedExtensionsList"></ul>
            <h4>Key Settings Snippet (JSON):</h4>
            <pre id="keySettingsSnippetContent"></pre>
            <div class="button-group">
                <button id="applyConfigurationButton" disabled>Apply Configuration to Workspace</button>
            </div>
        </div>
    </div>

    <div id="editProfileModal" class="modal-backdrop hidden">
        <div class="modal-content">
            <h3 id="modalTitle">Create/Edit Profile</h3>
            <div class="modal-body">
                <div class="form-section">
                    <label for="editProfileName">Profile Name*</label>
                    <input type="text" id="editProfileName" placeholder="My Awesome Setup">
                </div>
                <div class="form-section">
                    <label for="editProfileId">Profile ID* (auto-generated from name if blank for new)</label>
                    <input type="text" id="editProfileId" placeholder="my-awesome-setup">
                    <small>Unique, no spaces. Example: my-custom-profile. For edits, this ID cannot be changed.</small>
                </div>
                <div class="form-section">
                    <label for="editProfileDescription">Description (Optional)</label>
                    <textarea id="editProfileDescription" placeholder="A brief description of this profile."></textarea>
                </div>
                <div class="form-section">
                    <label for="editRecommendedExtensions">Recommended Extensions (one per line: id,Optional Name)</label>
                    <textarea id="editRecommendedExtensions" placeholder="e.g., dbaeumer.vscode-eslint,ESLint\nesbenp.prettier-vscode"></textarea>
                    <small>Format: <code>extension.id,DisplayName</code> or just <code>extension.id</code> (name is optional).</small>
                </div>
                <div class="form-section">
                    <label for="editKeySettings">Key Settings Snippet (JSON format)</label>
                    <textarea id="editKeySettings" placeholder='{\n  "editor.formatOnSave": true,\n  "files.eol": "\\n"\n}'></textarea>
                </div>
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