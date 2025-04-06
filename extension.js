// extension.js
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    console.log('Jekyll Post Creator is now active!');

    let disposable = vscode.commands.registerCommand('jekyll-post-creator.createPost', async function () {
        // Get post title from user
        const postTitle = await vscode.window.showInputBox({
            placeHolder: 'Enter post title',
            prompt: 'The title of your Jekyll post'
        });
        
        if (!postTitle) return; // User canceled
        
        // Get post categories
        const categories = await vscode.window.showInputBox({
            placeHolder: 'category1 category2',
            prompt: 'Enter categories (space separated)'
        });
        
        // Get post tags
        const tags = await vscode.window.showInputBox({
            placeHolder: 'tag1 tag2',
            prompt: 'Enter tags (space separated)'
        });
        
        // Get layout (default to post)
        const layout = await vscode.window.showQuickPick(['post', 'page', 'custom'], {
            placeHolder: 'Select layout',
            title: 'Jekyll Layout'
        }) || 'post';
        
        // Current date in YYYY-MM-DD format using system time
        const date = new Date();
        const dateStr = date.toISOString().split('T')[0];
        
        // Format title for filename (lowercase, spaces to hyphens)
        const filename = `${dateStr}-${postTitle.toLowerCase().replace(/\s+/g, '-').replace(/[^\w\-]+/g, '')}.md`;
        
        // Format date for frontmatter in Jekyll-compatible format (YYYY-MM-DD HH:MM:SS +/-TTTT)
        const formattedDate = date.toLocaleString('en-US', { 
            year: 'numeric', 
            month: '2-digit', 
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        }).replace(/(\d+)\/(\d+)\/(\d+), (\d+):(\d+):(\d+)/, '$3-$1-$2 $4:$5:$6');
        
        // Add timezone offset
        const tzOffset = date.getTimezoneOffset();
        const tzSign = tzOffset <= 0 ? '+' : '-';
        const tzHours = Math.floor(Math.abs(tzOffset) / 60).toString().padStart(2, '0');
        const tzMinutes = (Math.abs(tzOffset) % 60).toString().padStart(2, '0');
        const tzFormatted = `${tzSign}${tzHours}${tzMinutes}`;
        
        // Create frontmatter
        let frontMatter = `---
layout: ${layout}
title: "${postTitle}"
date: ${formattedDate} ${tzFormatted}`;
        
        if (categories && categories.trim() !== '') {
            frontMatter += `
categories: ${formatList(categories)}`;
        }
        
        if (tags && tags.trim() !== '') {
            frontMatter += `
tags: ${formatList(tags)}`;
        }
        
        frontMatter += `
---

<!-- Your content here -->
`;

        // Get workspace folder
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('No workspace folder open');
            return;
        }
        
        // Try to find _posts directory
        const rootPath = workspaceFolder.uri.fsPath;
        let postsDir = path.join(rootPath, '_posts');
        
        if (!fs.existsSync(postsDir)) {
            // _posts directory doesn't exist, ask user where to save
            const answer = await vscode.window.showQuickPick(['Create _posts directory', 'Choose different location'], {
                placeHolder: '_posts directory not found'
            });
            
            if (answer === 'Create _posts directory') {
                fs.mkdirSync(postsDir, { recursive: true });
            } else if (answer === 'Choose different location') {
                const selectedFolder = await vscode.window.showOpenDialog({
                    canSelectFiles: false,
                    canSelectFolders: true,
                    canSelectMany: false,
                    openLabel: 'Select Folder'
                });
                
                if (!selectedFolder || selectedFolder.length === 0) return;
                postsDir = selectedFolder[0].fsPath;
            } else {
                return; // User canceled
            }
        }
        
        // Full path to the new file
        const filePath = path.join(postsDir, filename);
        
        // Write file
        fs.writeFileSync(filePath, frontMatter);
        
        // Open the file in the editor
        const document = await vscode.workspace.openTextDocument(filePath);
        await vscode.window.showTextDocument(document);
        
        vscode.window.showInformationMessage(`Created Jekyll post: ${filename}`);
    });

    context.subscriptions.push(disposable);
}

/**
 * Format a space-separated string as a YAML array
 * @param {string} str Space-separated string
 * @returns {string} YAML formatted array
 */
function formatList(str) {
    const items = str.split(' ').filter(Boolean);
    if (items.length === 0) return '[]';
    
    // Format as JSON-style array: ["item1","item2"]
    return `[${items.map(item => `"${item}"`).join(',')}]`;
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
};