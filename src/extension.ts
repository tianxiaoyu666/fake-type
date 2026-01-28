import * as vscode from 'vscode';

let statusBarItem: vscode.StatusBarItem;
let enabled = true;
let treeDataProvider: FileContentTreeProvider;
let terminalTreeDataProvider: TerminalCommandTreeProvider;
let webviewView: vscode.WebviewView | undefined;
let extensionContext: vscode.ExtensionContext;
let demoTerminal: vscode.Terminal | undefined;

// 每个文件对应不同的预备内容和进度
interface FileContent {
    content: string;
    index: number;
    fileName: string;
}
const fileContents = new Map<string, FileContent>();

// 终端命令映射
interface TerminalCommand {
    id: string;
    command: string;      // 显示的命令名称
    output: string;       // 预设的输出结果
    delay: number;        // 输出延迟（毫秒）
}
const terminalCommands: TerminalCommand[] = [];
let currentTerminalCommandIndex = 0;
let terminalPrompt = 'PS C:\\Users\\y2171\\Desktop\\xiaoyuan> '; // 终端前缀
let isTyping = false; // 防止并发输入

// 当前选中的目标文件
let selectedTargetFile: { uri: vscode.Uri; fileName: string } | null = null;

// 存储数据的 key
const STORAGE_KEY = 'fakeType.fileContents';
const TERMINAL_STORAGE_KEY = 'fakeType.terminalCommands';
const TERMINAL_PROMPT_KEY = 'fakeType.terminalPrompt';

// 保存数据到持久存储
function saveData() {
    const data: { [key: string]: FileContent } = {};
    fileContents.forEach((value, key) => {
        data[key] = value;
    });
    extensionContext.globalState.update(STORAGE_KEY, data);
}

// 从持久存储加载数据
function loadData() {
    const data = extensionContext.globalState.get<{ [key: string]: FileContent }>(STORAGE_KEY, {});
    fileContents.clear();
    for (const key in data) {
        fileContents.set(key, data[key]);
    }
}

// 保存终端命令到持久存储
function saveTerminalCommands() {
    extensionContext.globalState.update(TERMINAL_STORAGE_KEY, terminalCommands);
}

// 加载终端命令
function loadTerminalCommands() {
    const data = extensionContext.globalState.get<TerminalCommand[]>(TERMINAL_STORAGE_KEY, []);
    terminalCommands.length = 0;
    terminalCommands.push(...data);
}

// 保存终端前缀
function saveTerminalPrompt() {
    extensionContext.globalState.update(TERMINAL_PROMPT_KEY, terminalPrompt);
}

// 加载终端前缀
function loadTerminalPrompt() {
    terminalPrompt = extensionContext.globalState.get<string>(TERMINAL_PROMPT_KEY, 'PS C:\\Users\\y2171\\Desktop\\xiaoyuan> ');
}

// 树视图数据提供者
class FileContentTreeProvider implements vscode.TreeDataProvider<TreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<TreeItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: TreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: TreeItem): TreeItem[] {
        if (element) {
            return [];
        }

        const items: TreeItem[] = [];

        if (fileContents.size === 0) {
            const emptyItem = new TreeItem(
                '暂无映射',
                '在下方添加',
                vscode.TreeItemCollapsibleState.None
            );
            emptyItem.iconPath = new vscode.ThemeIcon('info');
            items.push(emptyItem);
        } else {
            fileContents.forEach((content, filePath) => {
                const remaining = content.content.length - content.index;
                const progress = `${content.index}/${content.content.length}`;
                const preview = content.content.substring(0, 50).replace(/\n/g, '↵') + (content.content.length > 50 ? '...' : '');

                const item = new TreeItem(
                    content.fileName,
                    `剩余 ${remaining} 字符`,
                    vscode.TreeItemCollapsibleState.None
                );
                item.tooltip = `预备内容:\n${preview}\n\n进度: ${progress}\n\n点击跳转到文件`;
                item.iconPath = remaining > 0
                    ? new vscode.ThemeIcon('file-code', new vscode.ThemeColor('charts.green'))
                    : new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.blue'));
                item.contextValue = 'fileMapping';
                item.resourceUri = vscode.Uri.parse(filePath);
                item.command = {
                    command: 'fakeType.jumpToFile',
                    title: '跳转到文件',
                    arguments: [filePath]
                };
                items.push(item);
            });
        }

        return items;
    }
}

class TreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly description: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);
        this.description = description;
    }
}

// 终端命令树视图提供者
class TerminalCommandTreeProvider implements vscode.TreeDataProvider<TerminalTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<TerminalTreeItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: TerminalTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(): TerminalTreeItem[] {
        const items: TerminalTreeItem[] = [];

        if (terminalCommands.length === 0) {
            const emptyItem = new TerminalTreeItem(
                '暂无命令',
                '在下方添加',
                vscode.TreeItemCollapsibleState.None,
                ''
            );
            emptyItem.iconPath = new vscode.ThemeIcon('info');
            items.push(emptyItem);
        } else {
            terminalCommands.forEach((cmd, index) => {
                const isCurrent = index === currentTerminalCommandIndex;
                const preview = cmd.output.substring(0, 30).replace(/\n/g, '↵') + (cmd.output.length > 30 ? '...' : '');
                
                const item = new TerminalTreeItem(
                    cmd.command || `命令 ${index + 1}`,
                    isCurrent ? '▶ 当前' : `${cmd.output.length} 字符`,
                    vscode.TreeItemCollapsibleState.None,
                    cmd.id
                );
                item.tooltip = `输出预览:\n${preview}\n\n延迟: ${cmd.delay}ms`;
                item.iconPath = isCurrent
                    ? new vscode.ThemeIcon('debug-start', new vscode.ThemeColor('charts.green'))
                    : new vscode.ThemeIcon('terminal');
                item.contextValue = 'terminalCommand';
                items.push(item);
            });
        }

        return items;
    }
}

class TerminalTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly description: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly commandId: string
    ) {
        super(label, collapsibleState);
        this.description = description;
    }
}

// WebView 提供者 - 粘贴区
class PasteAreaViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'fakeTypePasteArea';

    constructor(private readonly _extensionUri: vscode.Uri) {}

    public resolveWebviewView(
        webviewViewParam: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        webviewView = webviewViewParam;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlContent();

        // 处理来自 WebView 的消息
        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'selectFile':
                    const files = await vscode.window.showOpenDialog({
                        canSelectMany: false,
                        canSelectFolders: false,
                        openLabel: '选择目标文件',
                        title: '选择要映射的文件'
                    });
                    if (files && files.length > 0) {
                        const file = files[0];
                        const fileName = file.fsPath.split(/[/\\]/).pop() || '未知文件';
                        selectedTargetFile = { uri: file, fileName };
                        webviewView?.webview.postMessage({
                            type: 'fileSelected',
                            fileName: fileName
                        });
                    }
                    break;

                case 'saveContent':
                    if (!selectedTargetFile) {
                        vscode.window.showWarningMessage('请先选择目标文件！');
                        return;
                    }
                    const content = data.content;
                    if (!content || !content.trim()) {
                        vscode.window.showWarningMessage('请输入预备内容！');
                        return;
                    }
                    const filePath = selectedTargetFile.uri.toString();
                    fileContents.set(filePath, {
                        content: content,
                        index: 0,
                        fileName: selectedTargetFile.fileName
                    });
                    saveData(); // 保存到持久存储
                    enabled = true;
                    updateStatusBar();
                    treeDataProvider.refresh();
                    vscode.window.showInformationMessage(
                        `✅ 已为 "${selectedTargetFile.fileName}" 添加 ${content.length} 个字符`
                    );
                    // 清空并打开目标文件
                    webviewView?.webview.postMessage({ type: 'clear' });
                    const doc = await vscode.workspace.openTextDocument(selectedTargetFile.uri);
                    await vscode.window.showTextDocument(doc);
                    selectedTargetFile = null;
                    break;

                case 'pasteFromClipboard':
                    const clipboardText = await vscode.env.clipboard.readText();
                    if (clipboardText) {
                        webviewView?.webview.postMessage({
                            type: 'setContent',
                            content: clipboardText
                        });
                    } else {
                        vscode.window.showWarningMessage('剪贴板为空！');
                    }
                    break;
            }
        });
    }

    private _getHtmlContent() {
        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }
        body {
            padding: 10px;
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background: var(--vscode-sideBar-background);
        }
        .section {
            margin-bottom: 12px;
        }
        .label {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 6px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .file-select {
            display: flex;
            gap: 8px;
            align-items: center;
        }
        .file-name {
            flex: 1;
            padding: 6px 10px;
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            color: var(--vscode-input-foreground);
            font-size: 12px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .file-name.placeholder {
            color: var(--vscode-input-placeholderForeground);
        }
        button {
            padding: 6px 12px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            white-space: nowrap;
        }
        button:hover {
            background: var(--vscode-button-hoverBackground);
        }
        button.secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        button.secondary:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }
        .textarea-container {
            position: relative;
        }
        textarea {
            width: 100%;
            height: 200px;
            padding: 10px;
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            color: var(--vscode-input-foreground);
            font-family: var(--vscode-editor-font-family), monospace;
            font-size: 12px;
            resize: vertical;
            line-height: 1.5;
        }
        textarea:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
        }
        textarea::placeholder {
            color: var(--vscode-input-placeholderForeground);
        }
        .char-count {
            position: absolute;
            bottom: 8px;
            right: 10px;
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
            background: var(--vscode-input-background);
            padding: 2px 6px;
            border-radius: 3px;
        }
        .buttons {
            display: flex;
            gap: 8px;
            margin-top: 8px;
        }
        .buttons button {
            flex: 1;
        }
        .tip {
            margin-top: 12px;
            padding: 8px;
            background: var(--vscode-textBlockQuote-background);
            border-left: 3px solid var(--vscode-textLink-foreground);
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            border-radius: 0 4px 4px 0;
        }
    </style>
</head>
<body>
    <div class="section">
        <div class="label">1. 选择目标文件</div>
        <div class="file-select">
            <div class="file-name placeholder" id="fileName">未选择文件</div>
            <button onclick="selectFile()">选择</button>
        </div>
    </div>

    <div class="section">
        <div class="label">2. 粘贴预备内容</div>
        <div class="textarea-container">
            <textarea id="content" placeholder="在此粘贴要演示的代码...&#10;支持多行、保留格式"></textarea>
            <div class="char-count"><span id="charCount">0</span> 字符</div>
        </div>
        <div class="buttons">
            <button class="secondary" onclick="pasteFromClipboard()">📋 粘贴</button>
            <button onclick="saveContent()">✅ 保存</button>
        </div>
    </div>

    <div class="tip">
        💡 保存后，在目标文件中随便打字就会输出这里的内容。映射会自动保存，重启后仍然有效。
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const fileNameEl = document.getElementById('fileName');
        const contentEl = document.getElementById('content');
        const charCountEl = document.getElementById('charCount');

        contentEl.addEventListener('input', () => {
            charCountEl.textContent = contentEl.value.length;
        });

        function selectFile() {
            vscode.postMessage({ type: 'selectFile' });
        }

        function pasteFromClipboard() {
            vscode.postMessage({ type: 'pasteFromClipboard' });
        }

        function saveContent() {
            vscode.postMessage({ 
                type: 'saveContent', 
                content: contentEl.value 
            });
        }

        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.type) {
                case 'fileSelected':
                    fileNameEl.textContent = message.fileName;
                    fileNameEl.classList.remove('placeholder');
                    break;
                case 'setContent':
                    contentEl.value = message.content;
                    charCountEl.textContent = message.content.length;
                    break;
                case 'clear':
                    contentEl.value = '';
                    charCountEl.textContent = '0';
                    fileNameEl.textContent = '未选择文件';
                    fileNameEl.classList.add('placeholder');
                    break;
            }
        });
    </script>
</body>
</html>`;
    }
}

// WebView 提供者 - 终端命令设置
class TerminalWebViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'fakeTypeTerminal';
    private _view?: vscode.WebviewView;

    constructor(private readonly _extensionUri: vscode.Uri) {}

    public resolveWebviewView(
        webviewViewParam: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewViewParam;

        webviewViewParam.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewViewParam.webview.html = this._getHtmlContent();

        webviewViewParam.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'addCommand':
                    const newCommand: TerminalCommand = {
                        id: Date.now().toString(),
                        command: data.command || '',
                        output: data.output || '',
                        delay: data.delay || 500
                    };
                    terminalCommands.push(newCommand);
                    saveTerminalCommands();
                    terminalTreeDataProvider.refresh();
                    this._view?.webview.postMessage({ type: 'clear' });
                    vscode.window.showInformationMessage(`✅ 已添加终端命令`);
                    break;

                case 'pasteOutput':
                    const clipboardText = await vscode.env.clipboard.readText();
                    if (clipboardText) {
                        this._view?.webview.postMessage({
                            type: 'setOutput',
                            output: clipboardText
                        });
                    } else {
                        vscode.window.showWarningMessage('剪贴板为空！');
                    }
                    break;

                case 'openDemoTerminal':
                    vscode.commands.executeCommand('fakeType.openDemoTerminal');
                    break;

                case 'setPrompt':
                    terminalPrompt = data.prompt || 'PS C:\\> ';
                    saveTerminalPrompt();
                    vscode.window.showInformationMessage(`✅ 已设置终端前缀`);
                    break;
            }
        });
    }

    private _getHtmlContent() {
        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            padding: 10px;
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background: var(--vscode-sideBar-background);
        }
        .section { margin-bottom: 12px; }
        .label {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 6px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        input, textarea {
            width: 100%;
            padding: 8px;
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            color: var(--vscode-input-foreground);
            font-family: var(--vscode-editor-font-family), monospace;
            font-size: 12px;
        }
        input:focus, textarea:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
        }
        textarea { height: 120px; resize: vertical; line-height: 1.4; }
        .row { display: flex; gap: 8px; align-items: center; }
        .row input { flex: 1; }
        button {
            padding: 6px 12px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            white-space: nowrap;
        }
        button:hover { background: var(--vscode-button-hoverBackground); }
        button.secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
        button.full { width: 100%; margin-top: 8px; }
        .buttons { display: flex; gap: 8px; margin-top: 8px; }
        .buttons button { flex: 1; }
        .tip {
            margin-top: 12px;
            padding: 8px;
            background: var(--vscode-textBlockQuote-background);
            border-left: 3px solid var(--vscode-terminal-ansiGreen);
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            border-radius: 0 4px 4px 0;
        }
    </style>
</head>
<body>
    <div class="section">
        <div class="label">终端前缀</div>
        <div class="row">
            <input type="text" id="prompt" value="PS C:\\Users\\y2171\\Desktop\\xiaoyuan> ">
            <button onclick="setPrompt()">设置</button>
        </div>
    </div>

    <div class="section">
        <div class="label">预设终端内容</div>
        <textarea id="output" placeholder="粘贴终端要显示的内容...&#10;包括命令和输出结果&#10;如:&#10;npm run build&#10;Building...&#10;Done!"></textarea>
        <div class="buttons">
            <button class="secondary" onclick="pasteOutput()">📋 粘贴</button>
        </div>
    </div>

    <button class="full" onclick="addCommand()">➕ 添加</button>
    <button class="full secondary" onclick="openTerminal()">🖥️ 打开演示终端</button>

    <div class="tip">
        💡 乱敲键盘，每按一个键显示一个预设字符
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        function setPrompt() {
            const prompt = document.getElementById('prompt').value;
            vscode.postMessage({ type: 'setPrompt', prompt });
        }

        function addCommand() {
            const output = document.getElementById('output').value;
            if (!output.trim()) {
                return;
            }
            vscode.postMessage({ type: 'addCommand', command: '', output, delay: 0 });
        }

        function pasteOutput() {
            vscode.postMessage({ type: 'pasteOutput' });
        }

        function openTerminal() {
            vscode.postMessage({ type: 'openDemoTerminal' });
        }

        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.type) {
                case 'setOutput':
                    document.getElementById('output').value = message.output;
                    break;
                case 'clear':
                    document.getElementById('output').value = '';
                    break;
            }
        });
    </script>
</body>
</html>`;
    }
}

export function activate(context: vscode.ExtensionContext) {
    extensionContext = context;

    // 加载保存的数据
    loadData();
    loadTerminalCommands();
    loadTerminalPrompt();

    // 注册粘贴区 WebView
    const pasteAreaProvider = new PasteAreaViewProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            PasteAreaViewProvider.viewType,
            pasteAreaProvider
        )
    );

    // 注册终端命令 WebView
    const terminalWebViewProvider = new TerminalWebViewProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            TerminalWebViewProvider.viewType,
            terminalWebViewProvider
        )
    );

    // 创建终端命令树视图
    terminalTreeDataProvider = new TerminalCommandTreeProvider();
    const terminalTreeView = vscode.window.createTreeView('fakeTypeTerminalCommands', {
        treeDataProvider: terminalTreeDataProvider,
        showCollapseAll: false
    });
    context.subscriptions.push(terminalTreeView);

    // 创建树视图
    treeDataProvider = new FileContentTreeProvider();
    const treeView = vscode.window.createTreeView('fakeTypeFiles', {
        treeDataProvider: treeDataProvider,
        showCollapseAll: false
    });
    context.subscriptions.push(treeView);

    // 创建状态栏项
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    updateStatusBar();
    statusBarItem.command = 'fakeType.toggle';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // 监听编辑器切换
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(() => {
            updateStatusBar();
        })
    );

    // 删除映射
    context.subscriptions.push(
        vscode.commands.registerCommand('fakeType.deleteMapping', async (item: TreeItem) => {
            if (!item.resourceUri) return;

            const filePath = item.resourceUri.toString();
            const fileContent = fileContents.get(filePath);
            if (!fileContent) return;

            const confirm = await vscode.window.showQuickPick(
                ['确认删除', '取消'],
                { placeHolder: `确定删除 "${fileContent.fileName}" 的映射吗？` }
            );

            if (confirm === '确认删除') {
                fileContents.delete(filePath);
                saveData(); // 保存到持久存储
                treeDataProvider.refresh();
                updateStatusBar();
                vscode.window.showInformationMessage('已删除映射');
            }
        })
    );

    // 重置映射进度
    context.subscriptions.push(
        vscode.commands.registerCommand('fakeType.resetMapping', async (item: TreeItem) => {
            if (!item.resourceUri) return;

            const filePath = item.resourceUri.toString();
            const fileContent = fileContents.get(filePath);
            if (!fileContent) return;

            fileContent.index = 0;
            saveData(); // 保存到持久存储
            treeDataProvider.refresh();
            updateStatusBar();
            vscode.window.showInformationMessage(`"${fileContent.fileName}" 已重置到开头`);
        })
    );

    // 删除终端命令
    context.subscriptions.push(
        vscode.commands.registerCommand('fakeType.deleteTerminalCommand', async (item: TerminalTreeItem) => {
            if (!item.commandId) return;

            const index = terminalCommands.findIndex(cmd => cmd.id === item.commandId);
            if (index === -1) return;

            const confirm = await vscode.window.showQuickPick(
                ['确认删除', '取消'],
                { placeHolder: `确定删除该终端命令吗？` }
            );

            if (confirm === '确认删除') {
                terminalCommands.splice(index, 1);
                if (currentTerminalCommandIndex >= terminalCommands.length) {
                    currentTerminalCommandIndex = Math.max(0, terminalCommands.length - 1);
                }
                saveTerminalCommands();
                terminalTreeDataProvider.refresh();
                vscode.window.showInformationMessage('已删除终端命令');
            }
        })
    );

    // 重置终端命令进度
    context.subscriptions.push(
        vscode.commands.registerCommand('fakeType.resetTerminalCommands', () => {
            currentTerminalCommandIndex = 0;
            terminalTreeDataProvider.refresh();
            vscode.window.showInformationMessage('已重置终端命令进度');
        })
    );

    // 清除所有终端命令
    context.subscriptions.push(
        vscode.commands.registerCommand('fakeType.clearAllTerminalCommands', async () => {
            const confirm = await vscode.window.showQuickPick(
                ['确认清除所有', '取消'],
                { placeHolder: '确定清除所有终端命令吗？' }
            );
            if (confirm === '确认清除所有') {
                terminalCommands.length = 0;
                currentTerminalCommandIndex = 0;
                saveTerminalCommands();
                terminalTreeDataProvider.refresh();
                vscode.window.showInformationMessage('已清除所有终端命令');
            }
        })
    );

    // 打开演示终端
    context.subscriptions.push(
        vscode.commands.registerCommand('fakeType.openDemoTerminal', () => {
            // 关闭旧终端，创建新终端
            if (demoTerminal) {
                demoTerminal.dispose();
                demoTerminal = undefined;
            }

            // 重置索引
            currentTerminalCommandIndex = 0;

            const writeEmitter = new vscode.EventEmitter<string>();
            let commandCharIndex = 0;  // 当前输出到哪个字符
            let displayedText = ''; // 已显示的文本

            const pty: vscode.Pseudoterminal = {
                onDidWrite: writeEmitter.event,
                open: () => {
                    // 显示初始前缀
                    writeEmitter.fire(terminalPrompt);
                    terminalTreeDataProvider.refresh();
                },
                close: () => {
                    demoTerminal = undefined;
                },
                handleInput: (data: string) => {
                    if (terminalCommands.length === 0 || currentTerminalCommandIndex >= terminalCommands.length) {
                        // 没有预设命令，正常输入
                        if (data === '\r') {
                            writeEmitter.fire('\r\n' + terminalPrompt);
                            displayedText = '';
                        } else if (data === '\x7f') {
                            if (displayedText.length > 0) {
                                displayedText = displayedText.slice(0, -1);
                                writeEmitter.fire('\x1b[D\x1b[K');
                            }
                        } else {
                            displayedText += data;
                            writeEmitter.fire(data);
                        }
                        return;
                    }

                    const cmd = terminalCommands[currentTerminalCommandIndex];
                    const fullOutput = cmd.output;

                    if (data === '\x7f') { // 退格键
                        if (commandCharIndex > 0) {
                            commandCharIndex--;
                            writeEmitter.fire('\x1b[D\x1b[K');
                        }
                    } else {
                        // 任意按键都显示预设输出的下一个字符
                        if (commandCharIndex < fullOutput.length) {
                            const nextChar = fullOutput[commandCharIndex];
                            commandCharIndex++;
                            
                            if (nextChar === '\n') {
                                writeEmitter.fire('\r\n');
                            } else {
                                writeEmitter.fire(nextChar);
                            }
                        }
                        
                        // 输出完毕，切换到下一个命令
                        if (commandCharIndex >= fullOutput.length) {
                            currentTerminalCommandIndex++;
                            commandCharIndex = 0;
                            terminalTreeDataProvider.refresh();
                            writeEmitter.fire('\r\n' + terminalPrompt);
                        }
                    }
                }
            };

            demoTerminal = vscode.window.createTerminal({
                name: 'PowerShell',
                pty: pty
            });
            demoTerminal.show();
        })
    );

    // 跳转到文件
    context.subscriptions.push(
        vscode.commands.registerCommand('fakeType.jumpToFile', async (filePath: string) => {
            try {
                const uri = vscode.Uri.parse(filePath);
                const doc = await vscode.workspace.openTextDocument(uri);
                await vscode.window.showTextDocument(doc);
            } catch {
                vscode.window.showWarningMessage('无法打开文件');
            }
        })
    );

    // 切换启用/禁用
    context.subscriptions.push(
        vscode.commands.registerCommand('fakeType.toggle', () => {
            enabled = !enabled;
            updateStatusBar();
            vscode.window.showInformationMessage(`Fake Type 已${enabled ? '启用' : '禁用'}`);
        })
    );

    // 从剪贴板加载（快捷方式）
    context.subscriptions.push(
        vscode.commands.registerCommand('fakeType.setFromClipboard', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('请先打开一个文件！');
                return;
            }

            const clipboardText = await vscode.env.clipboard.readText();
            if (clipboardText) {
                const filePath = editor.document.uri.toString();
                const fileName = editor.document.fileName.split(/[/\\]/).pop() || '未知';
                fileContents.set(filePath, { content: clipboardText, index: 0, fileName });
                saveData(); // 保存到持久存储
                enabled = true;
                updateStatusBar();
                treeDataProvider.refresh();
                vscode.window.showInformationMessage(`已为 "${fileName}" 加载 ${clipboardText.length} 个字符`);
            } else {
                vscode.window.showWarningMessage('剪贴板为空！');
            }
        })
    );

    // 重置当前文件
    context.subscriptions.push(
        vscode.commands.registerCommand('fakeType.reset', () => {
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                const filePath = editor.document.uri.toString();
                const fileContent = fileContents.get(filePath);
                if (fileContent) {
                    fileContent.index = 0;
                    saveData(); // 保存到持久存储
                    updateStatusBar();
                    treeDataProvider.refresh();
                    vscode.window.showInformationMessage('已重置到开头');
                }
            }
        })
    );

    // 清除所有
    context.subscriptions.push(
        vscode.commands.registerCommand('fakeType.clearAll', async () => {
            const confirm = await vscode.window.showQuickPick(
                ['确认清除所有', '取消'],
                { placeHolder: '确定清除所有映射吗？' }
            );
            if (confirm === '确认清除所有') {
                fileContents.clear();
                saveData(); // 保存到持久存储
                updateStatusBar();
                treeDataProvider.refresh();
                vscode.window.showInformationMessage('已清除所有映射');
            }
        })
    );

    // 输入队列
    const typeQueue: { text: string }[] = [];
    let processingQueue = false;

    async function processTypeQueue() {
        if (processingQueue || typeQueue.length === 0) {
            return;
        }
        processingQueue = true;

        while (typeQueue.length > 0) {
            const args = typeQueue.shift()!;
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                continue;
}

            const filePath = editor.document.uri.toString();
            const fileContent = fileContents.get(filePath);

            // 如果禁用、当前文件没有预备内容、或已输出完毕，使用默认行为
            if (!enabled || !fileContent || fileContent.index >= fileContent.content.length) {
                await vscode.commands.executeCommand('default:type', args);
                continue;
            }

            // 获取下一个要输出的字符
            const nextChar = fileContent.content[fileContent.index];
            fileContent.index++;

            // 插入预备的字符
            const success = await editor.edit(editBuilder => {
                for (const selection of editor.selections) {
                    if (selection.isEmpty) {
                        editBuilder.insert(selection.start, nextChar);
                    } else {
                        editBuilder.replace(selection, nextChar);
                    }
                }
            }, { undoStopBefore: false, undoStopAfter: false });

            if (!success) {
                // 如果编辑失败，回退索引
                fileContent.index--;
            }

            // 每50个字符保存一次进度
            if (fileContent.index % 50 === 0) {
                saveData();
            }

            updateStatusBar();

            // 每20个字符刷新一次树视图
            if (fileContent.index % 20 === 0 || fileContent.index >= fileContent.content.length) {
                treeDataProvider.refresh();
            }

            // 如果输出完毕
            if (fileContent.index >= fileContent.content.length) {
                saveData();
                vscode.window.showInformationMessage(`🎉 "${fileContent.fileName}" 内容已全部输出完毕！`);
                treeDataProvider.refresh();
            }
        }

        processingQueue = false;
    }

    // 覆盖 type 命令
    context.subscriptions.push(
        vscode.commands.registerCommand('type', async (args: { text: string }) => {
            // 回车、Tab 等特殊键使用默认行为
            if (args.text === '\n' || args.text === '\r\n' || args.text === '\r' || args.text === '\t') {
                await vscode.commands.executeCommand('default:type', args);
                return;
            }

            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                return;
            }

            const filePath = editor.document.uri.toString();
            const fileContent = fileContents.get(filePath);

            // 如果禁用或没有映射，直接使用默认行为
            if (!enabled || !fileContent || fileContent.index >= fileContent.content.length) {
                await vscode.commands.executeCommand('default:type', args);
                return;
            }

            // 添加到队列并处理
            typeQueue.push(args);
            processTypeQueue();
        })
    );

    // 处理删除操作 - Backspace
    context.subscriptions.push(
        vscode.commands.registerCommand('deleteLeft', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                return;
            }

            const filePath = editor.document.uri.toString();
            const fileContent = fileContents.get(filePath);

            // 如果有映射且索引大于0，回退索引
            if (enabled && fileContent && fileContent.index > 0) {
                fileContent.index--;
                updateStatusBar();
                if (fileContent.index % 10 === 0) {
                    treeDataProvider.refresh();
                }
            }

            // 执行删除操作
            await editor.edit(editBuilder => {
                    for (const selection of editor.selections) {
                    if (selection.isEmpty) {
                        // 删除光标前一个字符
                        const position = selection.start;
                        if (position.character > 0) {
                            const deleteRange = new vscode.Range(
                                position.line,
                                position.character - 1,
                                position.line,
                                position.character
                            );
                            editBuilder.delete(deleteRange);
                        } else if (position.line > 0) {
                            // 在行首，删除上一行的换行符
                            const prevLine = editor.document.lineAt(position.line - 1);
                            const deleteRange = new vscode.Range(
                                position.line - 1,
                                prevLine.text.length,
                                position.line,
                                0
                            );
                            editBuilder.delete(deleteRange);
                    }
                    } else {
                        // 有选中内容，删除选中部分
                        editBuilder.delete(selection);
                    }
            }
        });
        })
    );

    // 处理删除操作 - Delete
    context.subscriptions.push(
        vscode.commands.registerCommand('deleteRight', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                return;
            }

            const filePath = editor.document.uri.toString();
            const fileContent = fileContents.get(filePath);

            // 如果有映射且索引大于0，回退索引
            if (enabled && fileContent && fileContent.index > 0) {
                fileContent.index--;
                updateStatusBar();
                if (fileContent.index % 10 === 0) {
                    treeDataProvider.refresh();
                }
            }

            // 执行删除操作
            await editor.edit(editBuilder => {
                for (const selection of editor.selections) {
                    if (selection.isEmpty) {
                        // 删除光标后一个字符
                        const position = selection.start;
                        const line = editor.document.lineAt(position.line);
                        if (position.character < line.text.length) {
                            const deleteRange = new vscode.Range(
                                position.line,
                                position.character,
                                position.line,
                                position.character + 1
                            );
                            editBuilder.delete(deleteRange);
                        } else if (position.line < editor.document.lineCount - 1) {
                            // 在行尾，删除换行符
                            const deleteRange = new vscode.Range(
                                position.line,
                                position.character,
                                position.line + 1,
                                0
                            );
                            editBuilder.delete(deleteRange);
                        }
                    } else {
                        // 有选中内容，删除选中部分
                        editBuilder.delete(selection);
                    }
                }
            });
        })
    );

    // 如果有保存的映射，显示提示
    if (fileContents.size > 0) {
        vscode.window.showInformationMessage(`Fake Type: 已加载 ${fileContents.size} 个映射`);
    }
}

function updateStatusBar() {
    const editor = vscode.window.activeTextEditor;

    if (!editor) {
        statusBarItem.text = "$(keyboard) Fake Type";
        statusBarItem.tooltip = "Fake Type - 请打开文件";
        return;
    }

    const filePath = editor.document.uri.toString();
    const fileContent = fileContents.get(filePath);

    if (!fileContent) {
        statusBarItem.text = "$(keyboard) 未映射";
        statusBarItem.tooltip = "当前文件没有预备内容，点击切换";
    } else if (!enabled) {
        statusBarItem.text = "$(keyboard) 已暂停";
        statusBarItem.tooltip = "点击启用";
    } else {
        const remaining = fileContent.content.length - fileContent.index;
        statusBarItem.text = `$(keyboard) ${remaining} 字符`;
        statusBarItem.tooltip = `剩余 ${remaining}/${fileContent.content.length} 字符`;
    }
}

export function deactivate() {
    // 退出时保存数据
    saveData();
    if (statusBarItem) {
        statusBarItem.dispose();
    }
}
