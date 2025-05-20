import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    const panel = vscode.window.createWebviewPanel(
        'sampleWebview',
        'Sample Webview',
        vscode.ViewColumn.One,
        {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(context.extensionUri, 'media'),
                vscode.Uri.joinPath(context.extensionUri, 'node_modules', '@vscode/codicons', 'dist')
            ]
        }
    );

    const codiconsUri = panel.webview.asWebviewUri(
        vscode.Uri.joinPath(context.extensionUri, 'node_modules', '@vscode/codicons', 'dist', 'codicon.css')
    );

    panel.webview.html = getWebviewContent(codiconsUri);
}

function getWebviewContent(codiconsUri: vscode.Uri) {
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="${codiconsUri}" rel="stylesheet">
        <title>Sample Webview</title>
    </head>
    <body>
        <h1>Hello from your extension!</h1>
        <span class="codicon codicon-gear"></span> <!-- Example of using a codicon -->
    </body>
    </html>`;
}