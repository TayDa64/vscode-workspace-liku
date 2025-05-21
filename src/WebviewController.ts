// src/WebviewController.ts
import * as vscode from 'vscode';
import { DEFAULT_PROFILES, WorkspaceProfile } from './types';

const USER_PROFILES_KEY = 'likuWorkspaceUserProfiles_v1';

export class WebviewController {
    public static currentPanel: WebviewController | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private readonly _context: vscode.ExtensionContext;
    private _disposables: vscode.Disposable[] = [];

    // Ensure DEFAULT_PROFILES are correctly typed and marked as not user-defined
    private _builtInProfiles: WorkspaceProfile[] = DEFAULT_PROFILES.map(p => ({ ...p, isUserDefined: false }));
    private _userProfiles: WorkspaceProfile[] = [];

    public static createOrShow(extensionUri: vscode.Uri, context: vscode.ExtensionContext) {
        const column = vscode.window.activeTextEditor?.viewColumn;

        if (WebviewController.currentPanel) {
            WebviewController.currentPanel._panel.reveal(column);
            // When revealing an existing panel, ensure its data is fresh
            WebviewController.currentPanel.loadUserProfiles(); // Reload from storage
            WebviewController.currentPanel.sendProfilesToWebview(); // Send all profiles to webview
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'likuWorkspaceSetup', 'Liku Workspace Setup', column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'media'), // If you have images/icons
                    vscode.Uri.joinPath(extensionUri, 'dist')  // For bundled webview.js
                ]
            }
        );
        WebviewController.currentPanel = new WebviewController(panel, extensionUri, context);
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, context: vscode.ExtensionContext) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._context = context;

        this.loadUserProfiles(); // Load user profiles from global state
        this._panel.webview.html = this._getHtmlForWebview(this._panel.webview); // Set initial HTML for the webview

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            async message => {
                try {
                    switch (message.command) {
                        case 'getProfiles': // Webview requests profiles on load
                            this.sendProfilesToWebview();
                            break;
                        case 'applyConfiguration':
                            const profileIdToApply = message.profileId as string;
                            const allProfilesForApply = [...this._builtInProfiles, ...this._userProfiles];
                            const selectedProfileToApply = allProfilesForApply.find(p => p.id === profileIdToApply);
                            if (selectedProfileToApply) {
                                await this.applyProfileConfiguration(selectedProfileToApply);
                            } else {
                                vscode.window.showErrorMessage(`Profile with ID "${profileIdToApply}" not found.`);
                            }
                            break;
                        case 'saveUserProfile':
                            await this.saveUserProfile(message.profileData as WorkspaceProfile, message.isEditingExisting as boolean);
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
                    console.error("[Liku] Error processing webview message:", error);
                    vscode.window.showErrorMessage(`[Liku] An error occurred: ${error.message || String(error)}`);
                }
            },
            null, this._disposables
        );
    }

    private loadUserProfiles() {
        const profilesFromStorage = this._context.globalState.get<WorkspaceProfile[]>(USER_PROFILES_KEY);
        // Ensure loaded profiles are correctly marked as user-defined
        this._userProfiles = (Array.isArray(profilesFromStorage) ? profilesFromStorage : [])
            .map(p => ({ ...p, isUserDefined: true }));
        console.log("[Liku] Loaded user profiles:", this._userProfiles.length);
    }

    private async persistUserProfiles() {
        try {
            // Only store the core data, not the isUserDefined flag if it's always true for these
            const profilesToStore = this._userProfiles.map(({ isUserDefined, ...rest }) => rest);
            await this._context.globalState.update(USER_PROFILES_KEY, profilesToStore);
            console.log("[Liku] User profiles persisted to globalState.");
        } catch (error: any) {
            console.error("[Liku] Error persisting user profiles:", error);
            vscode.window.showErrorMessage(`[Liku] Failed to save user profiles: ${error.message}`);
            throw error; // Re-throw to indicate failure to caller
        }
    }

    private sendProfilesToWebview() {
        this.loadUserProfiles(); // Ensure _userProfiles is fresh from storage before sending
                                 // This might be redundant if called after every mod, but safe.
                                 // More optimal: only call loadUserProfiles on init or if expecting external changes.
                                 // For now, this ensures consistency.
        console.log("[Liku] Sending profiles to webview. Built-in:", this._builtInProfiles.length, "User:", this._userProfiles.length);
        this._panel.webview.postMessage({
            command: 'profilesLoaded',
            builtInProfiles: this._builtInProfiles.map(p => ({ ...p, isUserDefined: false })), // Ensure flag
            userProfiles: this._userProfiles.map(p => ({ ...p, isUserDefined: true }))       // Ensure flag
        });
    }

    private async saveUserProfile(profileDataFromWebview: WorkspaceProfile, isEditingExisting: boolean) {
        // Basic validation
        if (!profileDataFromWebview.id || !profileDataFromWebview.name) {
            vscode.window.showErrorMessage("[Liku] Profile ID and Name are required.");
            this._panel.webview.postMessage({ command: 'profileSaveFailed', message: "Profile ID and Name are required." });
            return;
        }
        // Ensure profileData from webview is correctly formed as a user profile
        const userProfileToSave: WorkspaceProfile = {
            ...profileDataFromWebview,
            id: profileDataFromWebview.id.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^\w.-]/g, ''),
            isUserDefined: true // All profiles saved via UI are user-defined
        };

        const existingUserIndex = this._userProfiles.findIndex(p => p.id === userProfileToSave.id);

        if (isEditingExisting) { // Trying to update an existing user profile
            if (existingUserIndex > -1) {
                this._userProfiles[existingUserIndex] = userProfileToSave;
                console.log(`[Liku] Updated user profile: ${userProfileToSave.id}`);
            } else {
                // This means webview thought it was editing, but the ID doesn't match any existing user profile.
                // This could happen if the ID was changed in the form (which should be prevented by webview for edits).
                // For safety, treat as potential new profile, but check for ID clashes.
                const idClash = this._builtInProfiles.some(p => p.id === userProfileToSave.id) ||
                                this._userProfiles.some(p => p.id === userProfileToSave.id); // Re-check just in case
                if (idClash) {
                    vscode.window.showErrorMessage(`[Liku] Profile ID "${userProfileToSave.id}" already exists. Cannot update/create.`);
                    this._panel.webview.postMessage({ command: 'profileSaveFailed', message: `Profile ID "${userProfileToSave.id}" already exists.` });
                    return;
                }
                this._userProfiles.push(userProfileToSave); // Add as new if no clash after ID mismatch in edit
                console.log(`[Liku] Saved as new (was edit intent, ID mismatch): ${userProfileToSave.id}`);
            }
        } else { // Saving a completely new profile (or a clone operation resulting in a new profile)
            const idClashWithBuiltIn = this._builtInProfiles.some(p => p.id === userProfileToSave.id);
            const idClashWithUser = existingUserIndex > -1; // Check if this ID already exists in user profiles

            if (idClashWithBuiltIn || idClashWithUser) {
                vscode.window.showErrorMessage(`[Liku] Profile ID "${userProfileToSave.id}" already exists. Please choose a unique ID.`);
                this._panel.webview.postMessage({ command: 'profileSaveFailed', message: `Profile ID "${userProfileToSave.id}" already exists.` });
                return;
            }
            this._userProfiles.push(userProfileToSave);
            console.log(`[Liku] Added new user profile: ${userProfileToSave.id}`);
        }

        try {
            await this.persistUserProfiles();
            vscode.window.showInformationMessage(`[Liku] Profile "${userProfileToSave.name}" saved successfully.`);
            this.sendProfilesToWebview(); // Send updated lists to webview
            this._panel.webview.postMessage({ command: 'profileSavedOrDeleted' }); // Signal success
        } catch (error) {
            // persistUserProfiles already shows an error
            this._panel.webview.postMessage({ command: 'profileSaveFailed', message: `Failed to persist profile to storage.` });
        }
    }

    private async applyProfileConfiguration(profile: WorkspaceProfile) {
        return vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Applying Liku Workspace: ${profile.name}`,
            cancellable: false
        }, async (progress) => {
            if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
                vscode.window.showErrorMessage("[Liku] No workspace folder is open. Please Open a Folder or Save an Untitled Workspace before applying a Liku configuration.");
                progress.report({ increment: 100, message: "Operation cancelled: No workspace open." });
                return;
            }
            // ... (rest of the applyProfileConfiguration logic from previous response - seems mostly okay) ...
            // Ensure errors within the loop are handled with `vscode.window.showWarningMessage`
            // and don't stop the whole process unless critical.
            try {
                progress.report({ increment: 0, message: "Updating settings..." });
                const config = vscode.workspace.getConfiguration();
                for (const setting of profile.keySettingsSnippet) {
                    try {
                        await config.update(setting.key, setting.value, vscode.ConfigurationTarget.Workspace);
                        progress.report({ message: `Applied: ${setting.key}` });
                    } catch (error: any) {
                        console.warn(`[Liku] Failed to update setting ${setting.key}:`, error);
                        vscode.window.showWarningMessage(`[Liku] Failed to apply setting: ${setting.key}. ${error.message}. Ensure the relevant extension is active if this is an extension-specific setting.`);
                    }
                }
                await new Promise(resolve => setTimeout(resolve, 100)); // Brief pause

                progress.report({ increment: 50, message: "Updating workspace recommendations..." });
                const workspaceFolder = vscode.workspace.workspaceFolders[0];
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
                        '[Liku] Workspace recommendations updated. You might be prompted to install new ones.',
                        'Show Recommendations'
                    ).then(selection => {
                        if (selection === 'Show Recommendations') {
                            vscode.commands.executeCommand('workbench.extensions.action.showWorkspaceRecommendations');
                        }
                    });
                } catch (error: any) {
                    console.error('[Liku] Failed to write extensions.json:', error);
                    vscode.window.showErrorMessage(`[Liku] Failed to update .vscode/extensions.json: ${error.message}`);
                }
                progress.report({ increment: 100, message: "Configuration applied!" });
                vscode.window.showInformationMessage(`[Liku] Workspace Configuration "${profile.name}" applied successfully!`);

            } catch (error: any) {
                console.error("[Liku] Error applying profile configuration:", error);
                vscode.window.showErrorMessage(`[Liku] Failed to apply configuration "${profile.name}": ${error.message}`);
                progress.report({ increment: 100, message: "Failed to apply." });
            }
        });
    }

    // src/WebviewController.ts
// ... (imports, USER_PROFILES_KEY, class definition, static members, constructor, load/persist/send profiles, etc.) ...

// Make sure this is the version of deleteUserProfile we settled on:
    private async deleteUserProfile(profileIdToDelete: string) {
        console.log(`[Liku Controller] Attempting to delete user profile ID: ${profileIdToDelete}`);
        const initialLength = this._userProfiles.length;
        this._userProfiles = this._userProfiles.filter(p => p.id !== profileIdToDelete);

        if (this._userProfiles.length < initialLength) {
            try {
                await this.persistUserProfiles();
                vscode.window.showInformationMessage(`[Liku] User profile "${profileIdToDelete}" deleted.`);
                this.sendProfilesToWebview(); // This sends 'profilesLoaded' with the updated list
                this._panel.webview.postMessage({ command: 'profileActionCompleted', action: 'delete', id: profileIdToDelete });
            } catch (error) {
                vscode.window.showErrorMessage("[Liku] Failed to save changes after deletion. Profile may reappear.");
                this.loadUserProfiles(); // Revert in-memory change if save failed
                this.sendProfilesToWebview();
            }
        } else {
            vscode.window.showWarningMessage(`[Liku] User profile with ID "${profileIdToDelete}" not found for deletion.`);
            this.sendProfilesToWebview(); // Send current state back
        }
    }

// ... (applyProfileConfiguration, dispose, _updateHtmlForWebview) ...

    private _getHtmlForWebview(webview: vscode.Webview): string {
        const nonce = getNonce();
        const webviewScriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'main.js'));

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; img-src ${webview.cspSource} https: data:; script-src 'nonce-${nonce}';">
    <title>Liku Workspace Setup</title>
    <style>
        /* Body and container styles */
        body { font-family: var(--vscode-font-family); color: var(--vscode-editor-foreground); background-color: var(--vscode-editor-background); padding: 20px; display: flex; flex-direction: column; height: calc(100vh - 40px); box-sizing: border-box; }
        .container { display: flex; flex-direction: column; gap: 15px; flex-grow: 1; overflow-y: auto; padding-right: 10px; }
        h1 { font-weight: 300; margin-bottom: 15px; color: var(--vscode-titleBar-activeForeground, var(--vscode-foreground)); }
        
        /* General form styles (retained for modal) */
        label { display: block; margin-bottom: 5px; margin-top: 10px; font-weight: 600; }
        input[type="text"], select, textarea { /* Select style might be unused now */ width: 100%; padding: 8px; margin-bottom: 10px; background-color: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, var(--vscode-dropdown-border, var(--vscode-settings-textInputBorder, var(--vscode-contrastBorder)))); border-radius: 3px; box-sizing: border-box; }
        input[type="text"]:focus, select:focus, textarea:focus { border-color: var(--vscode-focusBorder); outline: none; box-shadow: 0 0 0 1px var(--vscode-focusBorder); }
        textarea { min-height: 80px; font-family: var(--vscode-editor-font-family, var(--vscode-font-family)); font-size: var(--vscode-editor-font-size, var(--vscode-font-size)); }
        
        /* Combo Search/Select Specific Styles */
        .profile-selection-area { display: flex; gap: 10px; align-items: flex-end; margin-bottom: 10px; }
        .combo-search-select-container { position: relative; flex-grow: 1; }
        .combo-search-input-wrapper { display: flex; align-items: center; border: 1px solid var(--vscode-input-border, var(--vscode-dropdown-border)); border-radius: 3px; background-color: var(--vscode-input-background); }
        .combo-search-input-wrapper:focus-within { border-color: var(--vscode-focusBorder); box-shadow: 0 0 0 1px var(--vscode-focusBorder); }
        #comboSearchInput { flex-grow: 1; border: none; padding: 8px; margin-bottom: 0; background-color: transparent; outline: none; color: var(--vscode-input-foreground); }
        #comboToggleBtn { background-color: transparent; border: none; padding: 0 8px; cursor: pointer; color: var(--vscode-input-placeholderForeground); height: 100%; display: flex; align-items: center; justify-content: center; }
        #comboToggleBtn svg { width: 1em; height: 1em; }
        #comboToggleBtn:hover { color: var(--vscode-input-foreground); }
        .combo-results-list { list-style: none; padding: 0; margin: 2px 0 0 0; position: absolute; width: 100%; background-color: var(--vscode-menu-background, var(--vscode-quickInput-background)); border: 1px solid var(--vscode-menu-border, var(--vscode-quickInputList-focusBackground)); border-radius: 3px; max-height: 250px; overflow-y: auto; z-index: 100; box-shadow: 0 4px 8px rgba(0,0,0,0.1); }
        .combo-results-list.hidden { display: none; }
        .combo-results-list li[role="option"] { padding: 8px 12px; cursor: pointer; color: var(--vscode-menu-foreground, var(--vscode-quickInput-foreground)); }
        .combo-results-list li[role="option"]:hover, .combo-results-list li[role="option"].active-suggestion { background-color: var(--vscode-menu-selectionBackground, var(--vscode-quickInputList-focusBackground)); color: var(--vscode-menu-selectionForeground, var(--vscode-quickInputList-focusForeground)); }
        .combo-results-list .group-label { padding: 6px 12px; font-weight: bold; color: var(--vscode-descriptionForeground); background-color: var(--vscode-menu-separatorBackground, var(--vscode-editorGroupHeader-tabsBackground)); border-top: 1px solid var(--vscode-menu-border, var(--vscode-contrastBorder)); border-bottom: 1px solid var(--vscode-menu-border, var(--vscode-contrastBorder)); margin-top: -1px; cursor: default; }
        .combo-results-list .group-label:first-child { border-top: none; margin-top: 0; }
        .combo-results-list .no-results { padding: 8px 12px; color: var(--vscode-disabledForeground); font-style: italic; cursor: default; }

        /* Details Section and Modal Styles (largely unchanged) */
        .details-section { margin-top: 10px; padding: 15px; background-color: var(--vscode-sideBar-background, var(--vscode-editorWidget-background)); border: 1px solid var(--vscode-panel-border, var(--vscode-editorWidget-border, var(--vscode-contrastBorder))); border-radius: 5px; }
        .details-section h3 { margin-top: 0; border-bottom: 1px solid var(--vscode-editorGroupHeader-tabsBorder, var(--vscode-contrastBorder)); padding-bottom: 8px; margin-bottom:10px; }
        pre { background-color: var(--vscode-textCodeBlock-background, var(--vscode-input-background)); padding: 10px; border-radius: 3px; overflow-x: auto; white-space: pre-wrap; word-wrap: break-word; border: 1px solid var(--vscode-input-border, var(--vscode-contrastBorder)); max-height: 150px; overflow-y: auto; }
        ul#recommendedExtensionsList { list-style: none; padding-left: 0; max-height: 150px; overflow-y: auto; }
        ul#recommendedExtensionsList li { padding: 6px 0; border-bottom: 1px solid var(--vscode-editorGroup-border, var(--vscode-tree-tableColumnsBorder)); display: flex; justify-content: space-between; align-items: center; }
        ul#recommendedExtensionsList li:last-child { border-bottom: none; }
        ul#recommendedExtensionsList li a { color: var(--vscode-textLink-foreground); text-decoration: none; cursor: pointer; }
        ul#recommendedExtensionsList li a:hover { text-decoration: underline; color: var(--vscode-textLink-activeForeground); }
        .button-group { display: flex; gap: 10px; margin-top: 15px; flex-wrap: wrap; }
        button { background-color: var(--vscode-button-background); color: var(--vscode-button-foreground); border: 1px solid var(--vscode-button-border, transparent); padding: 8px 15px; text-align: center; text-decoration: none; font-size: var(--vscode-font-size); cursor: pointer; border-radius: 3px; transition: background-color 0.1s ease-in-out; }
        button:hover { background-color: var(--vscode-button-hoverBackground); }
        button:disabled { background-color: var(--vscode-button-secondaryBackground, #555a); color: var(--vscode-disabledForeground, #aaa); cursor: not-allowed; opacity: 0.7; }
        button.secondary { background-color: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
        button.secondary:hover { background-color: var(--vscode-button-secondaryHoverBackground); }
        button.danger { background-color: var(--vscode-errorForeground); color: var(--vscode-button-foreground); }
        button.danger:hover { opacity: 0.8; }
        .hidden { display: none !important; }
        .form-section { margin-bottom: 15px; }
        .profile-actions { display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;}
        .profile-actions h3 { margin-bottom: 0; border-bottom: none; }
        .modal-backdrop { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.6); display: flex; justify-content: center; align-items: center; z-index: 1000; }
        .modal-content { background-color: var(--vscode-editorWidget-background, var(--vscode-quickInput-background)); padding: 20px 25px; border-radius: 5px; width: 90%; max-width: 700px; box-shadow: 0 5px 15px rgba(0,0,0,0.3); max-height: 85vh; display: flex; flex-direction: column; }
        .modal-body { overflow-y: auto; flex-grow: 1; padding-right: 5px; /* space for scrollbar */ }
        .modal-content h3 { margin-top: 0; }
        small { color: var(--vscode-descriptionForeground); font-size: calc(var(--vscode-font-size) - 1px); display: block; margin-top: -5px; margin-bottom: 5px;}
    </style>
</head>
<body>
    <div class="container">
        <h1>Liku Workspace Configuration</h1>
        <div class="profile-selection-area">
            <div class="combo-search-select-container">
                <label for="comboSearchInput">Search or Select Profile</label>
                <div class="combo-search-input-wrapper">
                    <input type="text" id="comboSearchInput" placeholder="Type to find or select..." autocomplete="off">
                    <button id="comboToggleBtn" aria-label="Toggle profile list" title="Show all profiles">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" width="16" height="16"><path d="M12.78 5.22a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L3.22 6.28a.75.75 0 0 1 1.06-1.06L8 8.94l3.72-3.72a.75.75 0 0 1 1.06 0Z"/></svg>
                    </button>
                </div>
                <ul id="comboResultsList" class="combo-results-list hidden" role="listbox" aria-label="Available profiles">
                    <!-- Options will be populated by JavaScript -->
                </ul>
            </div>
            <button id="createNewProfileBtn" class="secondary" title="Create New Profile">New Profile</button>
        </div>

        <div id="profileDetails" class="details-section hidden">
            <div class="profile-actions">
                <h3 id="profileName"></h3>
                <div class="button-group">
                    <button id="cloneCurrentProfileBtn" class="secondary hidden" title="Create a copy of this profile">Clone</button>
                    <button id="editCurrentProfileBtn" class="secondary hidden" title="Edit this profile">Edit</button>
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

    <!-- Modal (same as before) -->
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
                    <small>Unique, no spaces. Example: my-custom-profile. For edits of user profiles, this ID cannot be changed.</small>
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
    // Dispose method to clean up resources
    public dispose() {
        WebviewController.currentPanel = undefined;

        // Dispose of all disposables
        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }

        // Dispose the panel itself
        this._panel.dispose();
    }
}

// ... (rest of WebviewController)

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}