// extension.js
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

// Store the panel reference globally
let currentPanel = undefined;
let contextSubscriptions; // To store subscriptions for panel disposal

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    console.log('Jekyll Post Creator is now active!');
    contextSubscriptions = context.subscriptions; // Store subscriptions

    // Command to show the creator window (Webview)
    let showWindowDisposable = vscode.commands.registerCommand('jekyll-post-creator.showCreatorWindow', () => {
        createPostPanel(context.extensionUri);
    });
    context.subscriptions.push(showWindowDisposable);

    // Original command (now just shows the window)
    let createPostDisposable = vscode.commands.registerCommand('jekyll-post-creator.createPost', async function () {
        vscode.commands.executeCommand('jekyll-post-creator.showCreatorWindow');
    });
    context.subscriptions.push(createPostDisposable);
}

/**
 * Creates and shows a Webview panel for creating a Jekyll post.
 * @param {vscode.Uri} extensionUri The URI of the extension directory.
 */
function createPostPanel(extensionUri) {
    const column = vscode.window.activeTextEditor
        ? vscode.window.activeTextEditor.viewColumn
        : undefined;

    // If we already have a panel, show it.
    if (currentPanel) {
        currentPanel.reveal(column);
        return;
    }

    // Otherwise, create a new panel.
    const panel = vscode.window.createWebviewPanel(
        'jekyllPostCreator', // Identifies the type of the webview. Used internally
        'Jekyll Post Creator', // Title of the panel displayed to the user
        column || vscode.ViewColumn.One, // Editor column to show the new webview panel in.
        {
            // Enable javascript in the webview
            enableScripts: true,

            // Restrict the webview to only loading content from the extension's directories
            localResourceRoots: [
                vscode.Uri.joinPath(extensionUri, 'webview')
                // Add other directories if needed, e.g., vscode.Uri.joinPath(extensionUri, 'media')
            ]
        }
    );

    currentPanel = panel;

    // Set the webview's initial html content
    panel.webview.html = getWebviewContent(panel.webview, extensionUri);

    // Listen for when the panel is disposed
    // This happens when the user closes the panel or when the panel is closed programmatically
    panel.onDidDispose(() => {
        currentPanel = undefined;
    }, null, contextSubscriptions); // Use stored subscriptions

    // Handle messages from the webview
    panel.webview.onDidReceiveMessage(
        async message => {
            switch (message.command) {
                case 'createPost':
                    await createJekyllPost(message.data);
                    // Optionally close the panel after creation
                    // currentPanel?.dispose();
                    return;
                case 'error':
                    vscode.window.showErrorMessage(message.text);
                    return;
            }
        },
        undefined,
        contextSubscriptions // Use stored subscriptions
    );
}

/**
 * Generates the HTML content for the Webview panel by reading an HTML file
 * and replacing placeholders with appropriate URIs and values.
 * @param {vscode.Webview} webview The webview instance.
 * @param {vscode.Uri} extensionUri The URI of the extension directory.
 * @returns {string} HTML content string.
 */
function getWebviewContent(webview, extensionUri) {
    const nonce = getNonce();

    // Construct URIs for local resources
    const scriptPathOnDisk = vscode.Uri.joinPath(extensionUri, 'webview', 'main.js');
    const scriptUri = webview.asWebviewUri(scriptPathOnDisk);

    const stylePathOnDisk = vscode.Uri.joinPath(extensionUri, 'webview', 'style.css');
    const styleUri = webview.asWebviewUri(stylePathOnDisk);

    // Path to the HTML file
    const htmlPath = vscode.Uri.joinPath(extensionUri, 'webview', 'view.html');

    try {
        // Read the HTML file
        let htmlContent = fs.readFileSync(htmlPath.fsPath, 'utf8');

        // Replace placeholders
        htmlContent = htmlContent.replace(/{{cspSource}}/g, webview.cspSource);
        htmlContent = htmlContent.replace(/{{nonce}}/g, nonce);
        htmlContent = htmlContent.replace(/{{styleUri}}/g, styleUri.toString());
        htmlContent = htmlContent.replace(/{{scriptUri}}/g, scriptUri.toString());

        return htmlContent;
    } catch (error) {
        console.error("Error reading or processing webview HTML:", error);
        vscode.window.showErrorMessage('Failed to load the Jekyll Post Creator view.');
        return `<html><body><h1>Error loading view</h1><p>${error.message}</p></body></html>`;
    }
}

/**
 * Creates the Jekyll post file with the provided details.
 * @param {object} postDetails The details for the post.
 * @param {string} postDetails.title Post title.
 * @param {string} postDetails.categories Space-separated categories.
 * @param {string} postDetails.tags Space-separated tags.
 * @param {string} postDetails.layout Jekyll layout.
 * @param {object} [postDetails.additionalOptions] Optional key-value pairs for front matter.
 */
async function createJekyllPost(postDetails) {
    const { title: postTitle, categories, tags, layout, additionalOptions = {} } = postDetails;

    if (!postTitle) {
        vscode.window.showErrorMessage('Post title cannot be empty.');
        return;
    }

    const date = new Date();
    const dateStr = date.toISOString().split('T')[0];
    const filename = `${dateStr}-${postTitle.toLowerCase().replace(/\s+/g, '-').replace(/[^\w\-]+/g, '')}.md`;
    const formattedDate = date.toLocaleString('en-US', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    }).replace(/(\d+)\/(\d+)\/(\d+), (\d+):(\d+):(\d+)/, '$3-$1-$2 $4:$5:$6');

    const tzOffset = date.getTimezoneOffset();
    const tzSign = tzOffset <= 0 ? '+' : '-';
    const tzHours = Math.floor(Math.abs(tzOffset) / 60).toString().padStart(2, '0');
    const tzMinutes = (Math.abs(tzOffset) % 60).toString().padStart(2, '0');
    const tzFormatted = `${tzSign}${tzHours}${tzMinutes}`;

    let frontMatterLines = [
        `layout: ${layout}`,
        `title: "${postTitle.replace(/"/g, '\\"')}"`,
        `date: ${formattedDate} ${tzFormatted}`
    ];

    if (categories && categories.trim() !== '') {
        frontMatterLines.push(`categories: ${formatList(categories)}`);
    }
    if (tags && tags.trim() !== '') {
        frontMatterLines.push(`tags: ${formatList(tags)}`);
    }

    for (const [key, value] of Object.entries(additionalOptions)) {
        const safeKey = key.trim().replace(/\s+/g, '_').replace(/[^\w_]/g, '');
        if (!safeKey) continue;

        let formattedValue;
        if (typeof value === 'string') {
            formattedValue = `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
        } else if (typeof value === 'boolean' || typeof value === 'number') {
            formattedValue = value;
        } else if (value === null) {
            formattedValue = 'null';
        } else {
            try {
                 formattedValue = JSON.stringify(value);
            } catch (e) {
                 formattedValue = `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
            }
        }
        frontMatterLines.push(`${safeKey}: ${formattedValue}`);
    }

    const frontMatter = `---
${frontMatterLines.join('\n')}
---

<!-- Your content here -->
`;

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('No workspace folder open');
        return;
    }

    const rootPath = workspaceFolder.uri.fsPath;
    let postsDir = path.join(rootPath, '_posts');

    if (!fs.existsSync(postsDir)) {
        const answer = await vscode.window.showQuickPick(['Create _posts directory', 'Choose different location'], {
            placeHolder: '_posts directory not found', title: 'Setup Posts Folder'
        });

        if (answer === 'Create _posts directory') {
            try {
                fs.mkdirSync(postsDir, { recursive: true });
            } catch (err) {
                const errorMessage = err instanceof Error ? err.message : String(err);
                vscode.window.showErrorMessage(`Failed to create _posts directory: ${errorMessage}`);
                return;
            }
        } else if (answer === 'Choose different location') {
            const selectedFolder = await vscode.window.showOpenDialog({
                canSelectFiles: false, canSelectFolders: true, canSelectMany: false,
                openLabel: 'Select Folder for Posts'
            });
            if (!selectedFolder || selectedFolder.length === 0) return;
            postsDir = selectedFolder[0].fsPath;
        } else {
            return;
        }
    }

    const filePath = path.join(postsDir, filename);

    try {
        fs.writeFileSync(filePath, frontMatter);
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Failed to write post file: ${errorMessage}`);
        return;
    }

    try {
        const document = await vscode.workspace.openTextDocument(filePath);
        await vscode.window.showTextDocument(document);
        vscode.window.showInformationMessage(`Created Jekyll post: ${filename}`);
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Failed to open created post file: ${errorMessage}`);
    }
}

/**
 * Format a space-separated string as a YAML array (JSON-style array is valid YAML)
 * @param {string} str Space-separated string
 * @returns {string} YAML formatted array
 */
function formatList(str) {
    const items = str.trim().split(/\s+/).filter(Boolean);
    if (items.length === 0) return '[]';
    return `[${items.map(item => `"${item.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',')}]`;
}

// Helper function for webview security (Content Security Policy)
function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

function deactivate() {
    // Clean up resources if needed
    currentPanel?.dispose();
}

module.exports = {
    activate,
    deactivate
};