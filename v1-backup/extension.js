"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
let statusBarItem;
let enabled = false;
let preparedContent = ''; // 预先准备的内容
let currentIndex = 0; // 当前输出位置
function activate(context) {
    // 创建状态栏项
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    updateStatusBar();
    statusBarItem.command = 'fakeType.toggle';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);
    // 切换启用/禁用
    context.subscriptions.push(vscode.commands.registerCommand('fakeType.toggle', () => {
        enabled = !enabled;
        updateStatusBar();
        vscode.window.showInformationMessage(`Fake Type 已${enabled ? '启用' : '禁用'}`);
    }));
    // 设置预备内容（从剪贴板）
    context.subscriptions.push(vscode.commands.registerCommand('fakeType.setFromClipboard', async () => {
        const clipboardText = await vscode.env.clipboard.readText();
        if (clipboardText) {
            preparedContent = clipboardText;
            currentIndex = 0;
            enabled = true;
            updateStatusBar();
            vscode.window.showInformationMessage(`已加载 ${preparedContent.length} 个字符，开始乱打吧！`);
        }
        else {
            vscode.window.showWarningMessage('剪贴板为空！');
        }
    }));
    // 设置预备内容（从选中文本）
    context.subscriptions.push(vscode.commands.registerCommand('fakeType.setFromSelection', async () => {
        const editor = vscode.window.activeTextEditor;
        if (editor && !editor.selection.isEmpty) {
            preparedContent = editor.document.getText(editor.selection);
            currentIndex = 0;
            enabled = true;
            updateStatusBar();
            vscode.window.showInformationMessage(`已加载 ${preparedContent.length} 个字符，开始乱打吧！`);
        }
        else {
            vscode.window.showWarningMessage('请先选中要准备的文本！');
        }
    }));
    // 重置位置
    context.subscriptions.push(vscode.commands.registerCommand('fakeType.reset', () => {
        currentIndex = 0;
        updateStatusBar();
        vscode.window.showInformationMessage('已重置到开头');
    }));
    // 覆盖 type 命令
    context.subscriptions.push(vscode.commands.registerCommand('type', async (args) => {
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
                }
                else {
                    editBuilder.replace(selection, nextChar);
                }
            }
        });
        // 如果输出完毕，提示用户
        if (currentIndex >= preparedContent.length) {
            vscode.window.showInformationMessage('🎉 内容已全部输出完毕！');
        }
    }));
    vscode.window.showInformationMessage('Fake Type 已就绪！使用命令加载内容后开始表演。');
}
function updateStatusBar() {
    if (!preparedContent) {
        statusBarItem.text = "$(keyboard) 未加载内容";
    }
    else if (!enabled) {
        statusBarItem.text = "$(keyboard) 已暂停";
    }
    else {
        const remaining = preparedContent.length - currentIndex;
        statusBarItem.text = `$(keyboard) 剩余 ${remaining} 字符`;
    }
    statusBarItem.tooltip = "Fake Type - 点击切换";
}
function deactivate() {
    if (statusBarItem) {
        statusBarItem.dispose();
    }
}
//# sourceMappingURL=extension.js.map