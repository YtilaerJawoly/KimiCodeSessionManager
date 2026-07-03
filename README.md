# Kimi Code 会话管理器

一个 Node.js CLI/TUI 工具，用于按项目聚合、浏览并一键继续 Kimi Code 会话。

## 功能

- 按项目聚合会话，快速继续最近会话
- 查看每个项目的历史会话并任选继续
- 为指定项目新建会话
- 批量删除或归档旧会话
- 模糊搜索项目名称/路径

## 安装

```bash
npm install -g .
```

本地开发时也可以使用 `npm link`：

```bash
npm link
```

## 使用

```bash
ksm
# 或指定 Kimi 主目录
ksm --home /path/to/.kimi-code
```

启动后将进入交互式 TUI，可选择项目、浏览历史会话并继续。

## 目录结构

- `bin/ksm.js`：CLI 入口
- `src/`：核心模块（配置、加载、聚合、操作、清理、TUI）
- `tests/`：单元测试

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

## 依赖

- Node.js >= 20
- `@inquirer/prompts`
- `chalk`
- `commander`
- `fuse.js`
