# Kimi Code Session Manager

一个用于管理和快速恢复 Kimi Code 会话的 Node.js CLI/TUI 工具。支持按项目聚合会话、一键继续最近会话、批量清理与归档、中英文界面切换，以及 Kimi Code / ksm 自身更新。

仓库地址：https://github.com/YtilaerJawoly/KimiCodeSessionManager

---

## 功能特性

- **快速开始**：主菜单直接列出最近的 5 个会话，一键继续。
- **按项目聚合会话**：自动扫描 `~/.kimi-code/sessions`，把同一工作目录的会话归为一个项目。
- **一键继续最近会话**：进入项目后默认高亮“继续最新会话”。
- **浏览与搜索历史**：在项目内查看全部历史会话，支持按项目名/路径模糊搜索。
- **新建会话**：为指定项目快速启动新的 Kimi Code 会话。
- **批量清理与归档**：多选旧会话，选择删除释放空间，或归档到 `~/.kimi-code/session-manager-archive`。
- **中英文切换**：主菜单新增“语言”选项，切换后即时生效并持久化到配置。
- **更新检查**：主菜单集成更新入口，可分别更新 ksm 自身与 Kimi Code。
- **快捷设置**：一键在桌面创建 `start.exe` 快捷方式。

---

## 安装

### 通过 GitHub 安装（推荐）

```bash
git clone https://github.com/YtilaerJawoly/KimiCodeSessionManager.git
cd KimiCodeSessionManager
npm install -g .
```

### 本地开发

```bash
npm link
ksm
```

### Windows 快捷启动

直接双击 `start.exe`，或在 PowerShell 中运行：

```powershell
./start.ps1
```

---

## 使用

安装到 PATH 后，在终端运行：

```bash
ksm
# 指定 Kimi 主目录
ksm --home /path/to/.kimi-code
```

启动后进入交互式 TUI：

1. **继续最近会话**：搜索并选择项目，继续该项目的最新 Kimi Code 会话。
2. **更新**：更新 ksm 或 Kimi Code。
3. **语言**：切换 中文 / English。
4. **查看历史消息**：查看启动时检测到的版本更新等提示。
5. **快捷设置**：创建桌面快捷方式。
6. **退出**：关闭 ksm。

## 分享给他人

1. 把仓库地址发给对方：
   ```
   https://github.com/YtilaerJawoly/KimiCodeSessionManager
   ```
2. 对方执行：
   ```bash
   git clone https://github.com/YtilaerJawoly/KimiCodeSessionManager.git
   cd KimiCodeSessionManager
   npm install -g .
   ksm
   ```

如果对方不会使用命令行，也可以把项目目录（包含 `node_modules`、`start.exe`、`start.ps1` 等文件）打包成 zip 发送，Windows 用户解压后双击 `start.exe` 即可。

```
.
├── bin/ksm.js          CLI 入口
├── src/
│   ├── actions.js      会话继续/新建操作
│   ├── cleanup.js      会话删除与归档
│   ├── config.js       配置、单实例锁
│   ├── error-handler.js全局错误处理
│   ├── i18n.js         中英文国际化
│   ├── kimi-version.js Kimi Code 版本读取
│   ├── loader.js       会话扫描与加载
│   ├── process.js      子进程执行封装
│   ├── shortcut.js     桌面快捷方式
│   ├── store.js        项目聚合与查询
│   ├── tui/            交互式 TUI
│   │   ├── helpers.js  TUI 工具与主题
│   │   ├── index.js    TUI 入口与主菜单
│   │   ├── menus.js    子菜单集合
│   │   └── welcome.js  欢迎界面
│   ├── updater.js      更新逻辑
│   └── version.js      版本比较与稳定版解析
├── scripts/
│   └── start.cs        Windows start.exe 源码
├── tests/              单元测试
├── start.ps1           Windows PowerShell 启动脚本
└── start.exe           Windows 可执行启动入口
```

---

## 开发

本地开发与调试：

```bash
npm link
ksm
```

运行测试：

```bash
npm test
```

---

## 依赖

- Node.js >= 20
- `@inquirer/prompts`
- `chalk`
- `commander`
- `fuse.js`

---

## 版本

当前版本：`v1.0.2`

---

## 许可证

MIT
