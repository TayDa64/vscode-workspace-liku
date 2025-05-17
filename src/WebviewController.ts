import * as vscode from 'vscode';
// import * as path from 'path'; // Not strictly needed here if paths constructed with Uri.joinPath
import { ConfigProfile, getAvailableProfiles } from './configManager';
import { setupWorkspaceBasedOnProfile } from './workspaceSetup';

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

export class WebviewController {
    public static currentPanel: WebviewController | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];

    public static readonly viewType = 'workspaceLikuSetup';

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._extensionUri = extensionUri;

        this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'getProfiles':
                        this._panel.webview.postMessage({
                            command: 'profilesLoaded',
                            profiles: getAvailableProfiles(vscode.extensions.getExtension('yourpublisher.yourextensionid')?.extensionPath ? { extensionPath: vscode.extensions.getExtension('yourpublisher.yourextensionid')!.extensionPath } as vscode.ExtensionContext : ({} as vscode.ExtensionContext))
                        });
                        break;
                    case 'applyProfile':
                        if (message.profile) {
                            const profileToApply = message.profile as ConfigProfile;
                            const success = await setupWorkspaceBasedOnProfile(profileToApply, this._extensionUri); // Pass Uri
                            if (success) {
                                vscode.window.showInformationMessage(`Workspace configured with ${profileToApply.name}!`);
                                this._panel.dispose();
                            }
                        }
                        break;
                    case 'showError':
                        if (message.text) {
                            vscode.window.showErrorMessage(message.text);
                        }
                        break;
                }
            },
            null,
            this._disposables
        );
    }

    public static createOrShow(extensionUri: vscode.Uri) {
        const column = vscode.window.activeTextEditor?.viewColumn;

        if (WebviewController.currentPanel) {
            WebviewController.currentPanel._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            WebviewController.viewType,
            'Liku Workspace Setup',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'node_modules', '@vscode', 'webview-ui-toolkit', 'dist'),
                    vscode.Uri.joinPath(extensionUri, 'media'), // For general media assets
                    vscode.Uri.joinPath(extensionUri, 'dist', 'webview')
                ]
            }
        );
        WebviewController.currentPanel = new WebviewController(panel, extensionUri);
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

    private _getHtmlForWebview(webview: vscode.Webview): string {
        const toolkitUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'node_modules', '@vscode', 'webview-ui-toolkit', 'dist', 'toolkit.js'));
        const mainScriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'main.js'));
        const stylesUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'styles.css'));
        const nonce = getNonce();

        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; img-src ${webview.cspSource} https: data:; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <script type="module" nonce="${nonce}" src="${toolkitUri}"></script>
                <link href="${stylesUri}" rel="stylesheet">
                <title>Liku Workspace Setup</title>
            </head>
            <body>
                <div id="app">
                    <h1>Select a Workspace Configuration</h1>
                    <vscode-text-field type="text" id="search-bar" placeholder="Search configurations..."></vscode-text-field>
                    <vscode-dropdown id="profile-dropdown">
                        <vscode-option value="">Select a Profile...</vscode-option>
                    </vscode-dropdown>
                    <div id="profile-details">
                        <h2 id="details-name"></h2>
                        <p id="details-description"></p>
                        <h3>Recommended Extensions:</h3>
                        <ul id="details-extensions"></ul>
                        <h3>Key Settings Snippet:</h3>
                        <pre id="details-settings"></pre>
                    </div>
                    <vscode-button id="apply-button" appearance="primary" disabled>Apply Configuration</vscode-button>
                </div>
                <script nonce="${nonce}" src="${mainScriptUri}"></script>
            </body>
            </html>`;
    }
}