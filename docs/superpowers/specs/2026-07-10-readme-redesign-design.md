# README 重制设计文档

## 目标
将现有 `README.md`（中文）和 `README_English.md` 替换为更简约、更符合优秀 GitHub 项目风格的文档。

## 文件结构

- `README.md`：英文，作为 GitHub 默认展示语言。
- `README-zh.md`：中文。
- 删除 `README_English.md`，避免重复与混淆。
- 更新 `package.json` 的 `files` 字段，加入 `README-zh.md`。

## 内容结构（中英文一致）

1. **标题 + 一句话描述**
   - 主标题：`Kimi Code Session Manager`
   - 副标题：说明这是一个用于管理和快速恢复 Kimi Code 会话的 CLI/TUI 工具。

2. **安装**
   - 首选：`npm install -g kimi-session-manager`
   - 备用：`git clone` + `npm install -g .`
   - Windows 快捷方式：双击 `start.exe` 或运行 `./start.ps1`

3. **使用**
   - 运行 `ksm`
   - 可选参数 `ksm --home <path>`
   - 主菜单功能一句话概括

4. **功能**
   - 用 4–6 个精简 bullet 列出核心功能
   - 不展开详细说明

5. **许可证**
   - `MIT`

## 风格约束

- 无徽章、无截图、无目录树、无“分享给他人”、无开发章节。
- 每段不超过 3 行。
- 代码块优先于文字说明。
- 总长度控制在 60–80 行以内。

## 成功标准

- 新的 README 比现有版本减少至少 50% 行数。
- 安装和使用步骤一目了然。
- 中英文文档内容对应，无信息丢失。
- `package.json` 正确包含新的中文 README。
