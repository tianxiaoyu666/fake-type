import * as vscode from 'vscode';

let statusBarItem: vscode.StatusBarItem;
let enabled = false;
let preparedContent = '';  // 预先准备的内容
let currentIndex = 0;      // 当前输出位置

export function activate(context: vscode.ExtensionContext) {
    // 创建状态栏项
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    updateStatusBar();
    statusBarItem.command = 'fakeType.toggle';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // 切换启用/禁用
    context.subscriptions.push(
        vscode.commands.registerCommand('fakeType.toggle', () => {
            enabled = !enabled;
            updateStatusBar();
            vscode.window.showInformationMessage(`Fake Type 已${enabled ? '启用' : '禁用'}`);
        })
    );

    // 设置预备内容（从剪贴板）
    context.subscriptions.push(
        vscode.commands.registerCommand('fakeType.setFromClipboard', async () => {
            const clipboardText = await vscode.env.clipboard.readText();
            if (clipboardText) {
                preparedContent = clipboardText;
                currentIndex = 0;
                enabled = true;
                updateStatusBar();
                vscode.window.showInformationMessage(`已加载 ${preparedContent.length} 个字符，开始乱打吧！`);
            } else {
                vscode.window.showWarningMessage('剪贴板为空！');
            }
        })
    );

    // 设置预备内容（从选中文本）
    context.subscriptions.push(
        vscode.commands.registerCommand('fakeType.setFromSelection', async () => {
            const editor = vscode.window.activeTextEditor;
            if (editor && !editor.selection.isEmpty) {
                preparedContent = editor.document.getText(editor.selection);
                currentIndex = 0;
                enabled = true;
                updateStatusBar();
                vscode.window.showInformationMessage(`已加载 ${preparedContent.length} 个字符，开始乱打吧！`);
            } else {
                vscode.window.showWarningMessage('请先选中要准备的文本！');
            }
        })
    );

    // 重置位置
    context.subscriptions.push(
        vscode.commands.registerCommand('fakeType.reset', () => {
            currentIndex = 0;
            updateStatusBar();
            vscode.window.showInformationMessage('已重置到开头');
        })
    );

    // 覆盖 type 命令
    context.subscriptions.push(
        vscode.commands.registerCommand('type', async (args: { text: string }) => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                return;
            }

            // 如果禁用或没有预备内容，使用默认行为
            if (!enabled || !preparedContent || currentIndex >= preparedContent.length) {
                await vscode.commands.executeCommand('default:type', args);
                return;
            }

            // 获取下一个要输出的字符
            const nextChar = preparedContent[currentIndex];
            currentIndex++;
            updateStatusBar();

            // 插入预备的字符（而不是用户实际按的键）
            await editor.edit(editBuilder => {
                for (const selection of editor.selections) {
                    if (selection.isEmpty) {
                        editBuilder.insert(selection.start, nextChar);
                    } else {
                        editBuilder.replace(selection, nextChar);
                    }
                }
            });

            // 如果输出完毕，提示用户
            if (currentIndex >= preparedContent.length) {
                vscode.window.showInformationMessage('🎉 内容已全部输出完毕！');
            }
        })
    );

    vscode.window.showInformationMessage('Fake Type 已就绪！使用命令加载内容后开始表演。');
}

function updateStatusBar() {
    if (!preparedContent) {
        statusBarItem.text = "$(keyboard) 未加载内容";
    } else if (!enabled) {
        statusBarItem.text = "$(keyboard) 已暂停";
    } else {
        const remaining = preparedContent.length - currentIndex;
        statusBarItem.text = `$(keyboard) 剩余 ${remaining} 字符`;
    }
    statusBarItem.tooltip = "Fake Type - 点击切换";
}

export function deactivate() {
    if (statusBarItem) {
        statusBarItem.dispose();
    }
}

