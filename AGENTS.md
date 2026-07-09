# AGENTS.md — Kimi Code Session Manager

> 本文件面向 AI 编程助手。如果你刚接触本项目，请先阅读本文件，再动手修改代码。

---

## 1. 项目概述

**Kimi Code Session Manager（ksm）** 是一个用于管理和快速恢复 [Kimi Code](https://code.kimi.com/) 会话的 Node.js CLI/TUI 工具。

- **名称**: `kimi-session-manager`
- **版本**: `1.0.2`（以 `package.json` 为准）
- **作者**: YtilaerJawoly
- **许可证**: MIT
- **仓库**: https://github.com/YtilaerJawoly/KimiCodeSessionManager

核心能力：

- 按项目聚合 Kimi Code 会话。
- 一键继续最近会话，或查看项目历史会话。
- 批量删除/归档旧会话。
- 中英文界面切换。
- 检查并更新 Kimi Code 与 ksm 自身。
- 创建 Windows 桌面快捷方式。

---

## 2. 技术栈

- **运行时**: Node.js >= 20
- **模块规范**: ES modules（`package.json` 中 `"type": "module"`）
- **包管理器**: npm（已提交 `package-lock.json`）
- **CLI 解析**: `commander`
- **TUI 交互**: `@inquirer/prompts`
- **终端样式**: `chalk`
- **模糊搜索**: `fuse.js`
- **测试框架**: Node.js 内置 `node:test` + `node:assert/strict`
- **Windows 启动器**: `start.ps1`（PowerShell 5.1+）+ `start.cs`（C#，编译为 `start.exe`）
- **Unix 启动器**: `start.sh`

本项目**没有**转译、打包或构建步骤，源码直接由 Node.js 运行。

---

## 3. 目录结构与模块划分

```
.
├── bin/ksm.js              CLI 入口：解析参数、注册全局错误处理、启动 TUI
├── src/
│   ├── actions.js          继续/新建 Kimi Code 会话，负责平台相关的启动逻辑
│   ├── cleanup.js          删除或归档会话，并同步维护 session_index.jsonl
│   ├── config.js           Kimi home 解析、配置读写、单实例锁
│   ├── error-handler.js    全局异常兜底与致命错误输出
│   ├── i18n.js             中英文国际化文案与翻译函数
│   ├── kimi-version.js     读取 Kimi Code 本地版本与 latest.json
│   ├── loader.js           从索引/目录加载 Kimi 会话
│   ├── process.js          子进程执行原语（runCommand/runPowerShell/…）
│   ├── quota.js            查询 Kimi Code Plan 额度
│   ├── shortcut.js         创建 Windows 桌面快捷方式
│   ├── store.js            会话按项目分组、排序与查询
│   ├── updater.js          更新 Kimi Code 与 ksm
│   ├── version.js          SemVer 解析、比较、稳定版筛选
│   └── tui/                交互式 TUI
│       ├── helpers.js      主题、字符串/时间格式化、ROOT_DIR 等工具
│       ├── index.js        TUI 入口与主菜单循环
│       ├── menus.js        各子菜单（更新、语言、设置、历史、清理等）
│       └── welcome.js      欢迎横幅渲染
├── tests/                  单元测试，每个 `src/*.js` 对应一个 `tests/*.test.js`
├── scripts/
│   ├── start.cs            start.exe 的 C# 源码
│   └── Get-KimiQuota.ps1   独立的 Kimi 额度查询脚本
├── docs/superpowers/       面向智能体开发的计划/设计文档（非源码）
├── start.ps1               Windows PowerShell 启动脚本（GBK 编码 + CRLF）
├── start.sh                Unix shell 启动脚本
├── start.exe               Windows 可执行启动入口（由 start.cs 编译）
└── package.json
```

---

## 4. 常用命令

```bash
# 安装依赖
npm install

# 本地运行 TUI
npm start
# 或
node bin/ksm.js

# 指定 Kimi home 目录
node bin/ksm.js --home /path/to/.kimi-code

# 本地开发并注册到 PATH
npm link
ksm

# 运行测试
npm test
# 等价于
node --test tests/**/*.test.js
```

当前测试状态（截至探索完成）：

```
ℹ tests 59
ℹ suites 11
ℹ pass 59
ℹ fail 0
```

---

## 5. 代码风格与约定

- **语言**: 源码注释与 `README.md` 主要使用中文；测试文件使用英文描述。
- **模块**: 使用 ESM `import/export`，内置模块统一加 `node:` 前缀（如 `node:fs`、`node:path`）。
- **注释**: 每个模块顶部有中文职责说明；关键导出函数带 JSDoc。
- **错误处理**:
  - 配置、凭证、额度查询等 I/O 失败时**静默降级**，避免 TUI 崩溃。
  - 业务错误（如归档不存在的目录）应抛出明确错误，由 TUI 层显示。
- **依赖注入**: 所有启动子进程的函数接受可选的 `spawner` 参数，便于单元测试 mock。
- **纯函数优先**: 数据转换逻辑（`store.js`、`version.js`）不含 I/O，方便测试。
- **常量**: UI 相关常量使用大写下划线命名，集中在 `src/tui/helpers.js`。
- **路径解析**: `ROOT_DIR` 通过 `fileURLToPath(import.meta.url)` 从 `src/tui/helpers.js` 向上推导得到项目根目录，供更新、快捷方式等使用。

---

## 6. 测试说明

- 测试使用 Node.js 内置 `node:test` 与 `node:assert/strict`。
- 测试文件：`tests/*.test.js`。
- 子进程相关测试通过 `EventEmitter` 构造 mock `ChildProcess`，并注入 `spawner`。
- Windows 专属测试在非 Windows 平台会 `return` 跳过。
- 文件系统测试使用 `os.tmpdir()` 创建临时目录，并在 `afterEach` 中清理。
- 运行测试时不要求真实的 Kimi Code 安装或网络连接。

---

## 7. 运行时架构与关键行为

### 7.1 Kimi home 目录

默认位置：`~/.kimi-code`

可通过以下方式覆盖：

- 命令行参数：`ksm --home /path/to/.kimi-code`
- 环境变量：`KIMI_HOME=/path/to/.kimi-code`

关键子路径：

| 路径 | 说明 |
|------|------|
| `~/.kimi-code/session_index.jsonl` | 会话索引，每行一个 JSON |
| `~/.kimi-code/sessions/wd_<项目名>_<hash>/session_<id>/state.json` | 会话目录与状态 |
| `~/.kimi-code/session-manager-archive/` | 归档会话存放目录 |
| `~/.kimi-code/ksm.lock` | 单实例锁文件，内容为进程 PID |
| `~/.kimi-code/ksm-config.json` | ksm 配置（语言、是否显示额度） |
| `~/.kimi/credentials/kimi-code.json` | Kimi Code 凭证（`access_token`） |

### 7.2 会话加载流程

`loader.js` 先读取 `session_index.jsonl`，再回退扫描 `sessions/` 目录结构，按 `updatedAt` 降序排序，并去重/跳过损坏记录。

### 7.3 TUI 主循环

`src/tui/index.js` 负责：

1. 获取单实例锁。
2. 加载配置并设置语言。
3. 绘制欢迎界面。
4. 若 Kimi Code 未安装，提示安装。
5. 进入主菜单循环，分发到 `src/tui/menus.js` 各子菜单。

### 7.4 启动 Kimi Code

`actions.js` 根据平台决定启动方式：

- **Windows + Windows Terminal**: `wt.exe` 新标签页。
- **Windows 无 WT**: 生成临时 PowerShell 脚本，用 `cmd.exe /c start` 打开独立窗口。
- **类 Unix**: 后台 `spawn`。

临时脚本存放在项目根目录 `tmp/`，执行结束后自动删除。

### 7.5 更新逻辑

- **Kimi Code**: 在 PowerShell 中执行 `irm https://code.kimi.com/kimi-code/install.ps1 | iex`。
- **ksm**: 在项目根目录执行 `git pull`。
- 版本检查：Kimi Code 读取 `updates/latest.json`；ksm 通过 `git ls-remote --tags origin` 解析稳定 tag，超时 3 秒。

---

## 8. 安全注意事项

- **凭证以明文存储**：`~/.kimi/credentials/kimi-code.json` 中保存 `access_token`，无加密。
- **远程脚本执行**：更新 Kimi Code 时会下载并立即执行远程 PowerShell 脚本。
- **git pull 更新**：`updater.js` 直接拉取当前仓库 origin。
- **单实例锁**: 基于 `~/.kimi-code/ksm.lock` 与 `process.kill(pid, 0)`，无法跨用户或强保证原子性。
- 修改与安全相关的文件（凭证、锁、网络请求）时，应保持最小变更并保留降级行为。

---

## 9. 打包与分发

- **npm 全局安装**（推荐）：

  ```bash
  npm install -g .
  ksm
  ```

- **Windows 快捷启动**: 双击 `start.exe`，或在 PowerShell 中运行 `./start.ps1`。
- **Unix 快捷启动**: `./start.sh`。
- **离线分发**: 可将包含 `node_modules`、`start.exe`、`start.ps1` 的完整目录打包为 zip 发送给非技术用户。
- `package.json` 的 `files` 字段控制了 npm 包内容，不包含 `tests/` 和 `docs/`。

> 注意：`start.ps1` 当前为 **GBK 编码 + CRLF 行尾**，直接以 UTF-8 读取会失败。如需编辑，请先正确转码。

---

## 10. 开发工作流

- 不要提交 `node_modules`、`tmp/`、日志、`.worktrees/` 等被 `.gitignore` 忽略的内容。
- 修改子进程逻辑时，优先复用 `src/process.js` 的原语，并保持 `spawner` 注入测试可用。
- 修改 TUI 文案时，同步更新 `src/i18n.js` 的 `zh-CN` 与 `en` 两个 locale。
- `docs/superpowers/` 包含面向智能体的实现计划（例如进程抽象层重构），进行同类型大改动前请先查看是否有对应计划。
- 提交前运行 `npm test` 确保全部测试通过。
