import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as myExtension from '../extension';

suite('Extension Test Suite', () => {
	let extensionContext: vscode.ExtensionContext;

	suiteSetup(async () => {
		// 创建测试用的ExtensionContext
		extensionContext = {
			subscriptions: [],
			globalState: {
				get: () => {},
				update: () => Promise.resolve(),
				keys: () => [],
				setKeysForSync: () => {}
			},
			workspaceState: {
				get: () => {},
				update: () => Promise.resolve(),
				keys: () => []
			},
			extensionPath: path.join(__dirname, '../../'),
			globalStoragePath: path.join(__dirname, '../../.test-global-storage'),
			logPath: path.join(__dirname, '../../.test-logs'),
			storagePath: path.join(__dirname, '../../.test-storage'),
			extensionUri: vscode.Uri.file(path.join(__dirname, '../../')),
			environmentVariableCollection: {} as any,
			extensionMode: vscode.ExtensionMode.Test,
			secrets: {
				get: () => Promise.resolve(undefined),
				store: () => Promise.resolve(),
				delete: () => Promise.resolve(),
				onDidChange: () => ({ dispose: () => {} })
			},
			asAbsolutePath: (relativePath: string) => path.join(__dirname, '../../', relativePath),
			storageUri: vscode.Uri.file(path.join(__dirname, '../../.test-storage')),
			globalStorageUri: vscode.Uri.file(path.join(__dirname, '../../.test-global-storage')),
			logUri: vscode.Uri.file(path.join(__dirname, '../../.test-logs')),
			extension: {
				id: 'yongutils',
				extensionUri: vscode.Uri.file(path.join(__dirname, '../../')),
				extensionPath: path.join(__dirname, '../../'),
				isActive: true,
				packageJSON: {},
				exports: {},
				extensionKind: vscode.ExtensionKind.Workspace,
				activate: () => Promise.resolve({})
			},
			languageModelAccessInformation: {
				onDidChange: () => ({ dispose: () => {} }),
				canSendRequest: () => true
			}
		};

		await myExtension.activate(extensionContext);
	});

	suiteTeardown(() => {
		// 清理扩展
		myExtension.deactivate();
	});

	test('Extension should be activated', () => {
		assert.ok(extensionContext.subscriptions.length > 0);
	});

	test('Commands should be registered', async () => {
		const commands = await vscode.commands.getCommands();
		const expectedCommands = [
			'yongutils.createEnglishFile',
			'yongutils.sortImports',
			'yongutils.translateEN',
			'yongutils.translate',
			'yongutils.parseToTs',
			'yongutils.generateEnglishNames',
			'yongutils.extractI18nEntry',
			'yongutils.encodeURIComponent',
			'yongutils.decodeURIComponent',
			'yongutils.translateToggle',
			'yongutils.openToolPanel',
			'yongutils.debugLogger',
		];

		for (const command of expectedCommands) {
			assert.ok(
				commands.includes(command),
				`Expected command ${command} to be registered`
			);
		}
	});
});
