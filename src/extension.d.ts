declare module 'extension' {
    import * as vscode from 'vscode';
    
    export function activate(context: vscode.ExtensionContext): Promise<void>;
    export function deactivate(): void;
}
