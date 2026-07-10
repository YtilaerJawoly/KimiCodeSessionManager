# README 重制实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有 README 替换为简约风格的英文 `README.md` 和中文 `README-zh.md`，并同步更新 `package.json` 的 `files` 字段。

**Architecture:** 删除重复的旧英文 README，新增中英双语文档，内容仅保留标题、安装、使用、功能、许可证五个部分，去掉目录树、开发说明、依赖列表等冗余章节。

**Tech Stack:** Markdown、Node.js `package.json`。

## Global Constraints

- 文档总长度控制在 60–80 行以内。
- 无徽章、无截图、无目录树、无“分享给他人”、无开发章节。
- 中英文文档结构一致。
- `package.json` 的 `files` 字段必须包含 `README-zh.md`。

---

### Task 1: 删除旧英文 README

**Files:**
- Delete: `README_English.md`

**Interfaces:**
- Consumes: 现有 `README_English.md`
- Produces: 仓库中不再存在 `README_English.md`

- [ ] **Step 1: 删除文件**

  ```bash
  rm README_English.md
  ```

- [ ] **Step 2: 确认删除**

  ```bash
  git status --short
  ```

  Expected: `D README_English.md`

- [ ] **Step 3: Commit**

  ```bash
  git add README_English.md
  git commit -m "chore: remove outdated README_English.md"
  ```

---

### Task 2: 编写新的英文 README

**Files:**
- Create/Overwrite: `README.md`

**Interfaces:**
- Consumes: 项目核心功能与安装方式
- Produces: 简约英文 README

- [ ] **Step 1: 写入 README.md**

  ```markdown
  # Kimi Code Session Manager

  Manage and quickly resume [Kimi Code](https://code.kimi.com/) sessions by project.

  ## Install

  ```bash
  git clone https://github.com/YtilaerJawoly/KimiCodeSessionManager.git
  cd KimiCodeSessionManager
  npm install -g .
  ```

  On Windows, you can also double-click `start.exe`.

  ## Usage

  ```bash
  ksm
  # or specify a custom Kimi home directory
  ksm --home /path/to/.kimi-code
  ```

  ## Features

  - **Quick start**: resume one of the 5 latest sessions from the main menu.
  - **Project-based session grouping**.
  - **One-click resume** of the latest session.
  - **Browse, search, and archive** session history.
  - **Chinese / English UI**.
  - **Update ksm and Kimi Code** from the menu.

  ## License

  MIT
  ```

- [ ] **Step 2: 确认文件内容**

  ```bash
  wc -l README.md
  ```

  Expected: around 40 lines.

- [ ] **Step 3: Commit**

  ```bash
  git add README.md
  git commit -m "docs: rewrite README in minimalist style"
  ```

---

### Task 3: 编写新的中文 README

**Files:**
- Create: `README-zh.md`

**Interfaces:**
- Consumes: 英文 README 的结构与项目功能
- Produces: 简约中文 README

- [ ] **Step 1: 写入 README-zh.md**

  ```markdown
  # Kimi Code Session Manager

  按项目管理和快速恢复 [Kimi Code](https://code.kimi.com/) 会话。

  ## 安装

  ```bash
  git clone https://github.com/YtilaerJawoly/KimiCodeSessionManager.git
  cd KimiCodeSessionManager
  npm install -g .
  ```

  Windows 用户也可以直接双击 `start.exe`。

  ## 使用

  ```bash
  ksm
  # 或指定 Kimi home 目录
  ksm --home /path/to/.kimi-code
  ```

  ## 功能

  - **快速开始**：主菜单直接继续最近 5 个会话。
  - **按项目聚合会话**。
  - **一键继续最新会话**。
  - **浏览、搜索、归档**历史会话。
  - **中 / 英文界面**。
  - **在菜单中更新 ksm 和 Kimi Code**。

  ## 许可证

  MIT
  ```

- [ ] **Step 2: 确认文件内容**

  ```bash
  wc -l README-zh.md
  ```

  Expected: around 40 lines.

- [ ] **Step 3: Commit**

  ```bash
  git add README-zh.md
  git commit -m "docs: add minimalist Chinese README"
  ```

---

### Task 4: 更新 package.json

**Files:**
- Modify: `package.json`

**Interfaces:**
- Consumes: 新的 `README-zh.md` 文件
- Produces: `package.json` 的 `files` 字段包含 `README-zh.md`

- [ ] **Step 1: 修改 files 字段**

  在 `package.json` 的 `files` 数组中加入 `"README-zh.md"`，确保最终类似：

  ```json
  "files": [
    "bin/",
    "src/",
    "scripts/",
    "start.exe",
    "start.ps1",
    "start.sh",
    "README.md",
    "README-zh.md",
    "LICENSE"
  ]
  ```

- [ ] **Step 2: 验证 JSON 格式**

  ```bash
  node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('ok')"
  ```

  Expected: `ok`

- [ ] **Step 3: Commit**

  ```bash
  git add package.json
  git commit -m "chore: include README-zh.md in npm package files"
  ```

---

### Task 5: 验证并运行测试

**Files:**
- Read: `README.md`, `README-zh.md`, `package.json`

**Interfaces:**
- Consumes: 已更新的文档与配置
- Produces: 验证通过的状态

- [ ] **Step 1: 检查仓库状态**

  ```bash
  git status --short
  ```

  Expected: no uncommitted changes besides the plan/design docs if they were committed separately.

- [ ] **Step 2: 运行测试**

  ```bash
  npm test
  ```

  Expected: all tests pass.

- [ ] **Step 3: 检查 README 行数**

  ```bash
  wc -l README.md README-zh.md
  ```

  Expected: both under 50 lines.

---

### Task 6: 最终提交（可选合并）

**Files:**
- N/A

- [ ] **Step 1: 若用户希望单次提交，可软合并之前的提交**

  如果用户之前要求“单次提交”，执行：

  ```bash
  git reset --soft HEAD~4
  git add -A
  git commit -m "docs: redesign READMEs in minimalist style"
  ```

  否则保持已有的细分提交。

- [ ] **Step 2: 推送**

  按用户指示推送到远程。
