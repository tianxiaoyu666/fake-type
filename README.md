# Fake Type - 演示神器

> 职业院校 PPT 表演大赛神器！预先准备内容，乱打键盘也能输出正确代码。

## 功能特性

### 假装打代码
- 预先准备代码内容
- 在目标文件中随便敲键盘，每按一个键显示一个预设字符
- 支持多文件独立映射
- 回车、Tab 等特殊键正常工作
- 退格键同步回退

### 假终端输出
- 自定义终端前缀（支持 PowerShell 风格）
- 预设终端命令和输出结果
- 乱敲键盘逐字符显示预设内容
- 完美模拟真实终端操作

### 数据持久化
- 映射关系自动保存
- 重启编辑器后自动恢复
- 进度实时保存

## 安装方式

### 方式一：从 VSIX 安装
1. 下载 `.vsix` 文件
2. 在 VS Code/Cursor 中按 `Ctrl+Shift+X` 打开扩展面板
3. 点击右上角 `...` → "从 VSIX 安装..."
4. 选择下载的文件

### 方式二：从源码构建
```bash
git clone https://github.com/your-username/fake-type.git
cd fake-type
npm install
npm run compile
vsce package --allow-missing-repository
```

## 使用方法

### 代码映射

1. 点击左侧活动栏的 **Fake Type** 图标
2. 在"代码映射"区域：
   - 点击"选择"按钮选择目标文件
   - 粘贴要演示的代码
   - 点击"保存"
3. 在目标文件中随便敲键盘，屏幕显示预设代码

### 终端映射

1. 在"终端命令"区域：
   - 设置终端前缀（如 `PS C:\Users\xxx> `）
   - 粘贴完整的终端内容（包括命令和输出）
   - 点击"添加"
2. 点击"打开演示终端"
3. 随便敲键盘，每按一个键显示一个预设字符

## 演示效果

```
你乱敲：asdjfklasjdflk
屏幕显示：console.log("Hello World!");

终端乱敲：wertyuiop
终端显示：npm run build
         Building project...
         Done in 2.3s
```

## 快捷命令

| 命令 | 说明 |
|------|------|
| `Fake Type: 切换启用/禁用` | 暂停/启用功能 |
| `Fake Type: 从剪贴板加载` | 快速为当前文件加载内容 |
| `Fake Type: 重置到开头` | 重置当前文件进度 |
| `Fake Type: 打开演示终端` | 打开演示用的伪终端 |

## 技术栈

- TypeScript
- VS Code Extension API
- Pseudoterminal API

## 开发

```bash
# 安装依赖
npm install

# 编译
npm run compile

# 监听模式
npm run watch

# 打包
vsce package --allow-missing-repository
```

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！

---

**如果这个项目对你有帮助，请给个 Star！**
