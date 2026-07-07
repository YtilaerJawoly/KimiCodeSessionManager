# 进程执行抽象层设计文档

## 背景

Kimi Code Session Manager（ksm）当前有多个模块各自封装 `node:child_process` 调用，导致大量重复的 Promise 包装、stdout/stderr 收集、错误处理与超时控制代码：

- `src/updater.js`：内联 `runWithStdio`、`runPowerShellCommand`、`runCommand`。
- `src/shortcut.js`：内联 PowerShell spawn Promise。
- `src/kimi-version.js`：内联 `kimi.exe --version` spawn Promise。
- `src/actions.js`：`openKimi()` 自行处理 spawn、error、spawn 事件并 `unref()`。

这些重复逻辑增加了维护成本，也让单元测试需要重复 mock 相似的事件流。

## 目标

1. 将子进程启动、输出收集、错误处理、超时控制统一到一个独立模块 `src/process.js`。
2. 让业务模块只关心"执行什么命令"和"拿到什么结果"，不再重复写事件监听。
3. 保持现有公共 API 不变，降低迁移风险。
4. 提升可测试性：新增针对进程抽象层本身的单元测试。

## 非目标

本次重构**不**涉及以下内容：

- TUI 反馈逻辑（`src/tui/index.js`、`src/tui/menus.js`）。
- 国际化文案（`src/i18n.js`）。
- 会话加载/聚合逻辑（`src/loader.js`、`src/store.js`）。
- 配置与单实例锁（`src/config.js`）。
- CLI 入口（`bin/ksm.js`）。
- `actions.js` 中 Windows Terminal 检测、平台分支、临时脚本生成等高层策略。

## 设计

### 新增模块：`src/process.js`

职责：提供进程执行的原语。

#### 接口

```js
import { spawn } from 'node:child_process';

/**
 * 运行命令并等待结束，收集 stdout / stderr。
 *
 * @param {string} cmd 可执行文件
 * @param {string[]} args 参数列表
 * @param {Object} options 透传给 spawn 的选项（cwd、stdio、env 等）
 * @param {Function} spawner 用于测试注入的子进程启动函数，默认 spawn
 * @returns {Promise<{success: boolean, code: number|null, stdout: string, stderr: string, message: string}>}
 */
export function runCommand(cmd, args, options = {}, spawner = spawn);

/**
 * 执行 PowerShell 命令。
 * Windows 使用 powershell.exe，其他平台使用 pwsh。
 *
 * @param {string} command 要执行的 PowerShell 命令
 * @param {Object} options 透传给 spawn 的选项
 * @param {Function} spawner 用于测试注入
 * @returns {Promise<{success: boolean, code: number|null, stdout: string, stderr: string, message: string}>}
 */
export function runPowerShell(command, options = {}, spawner = spawn);

/**
 * 带超时的命令执行。超时后自动 kill 子进程并返回失败。
 *
 * @param {string} cmd
 * @param {string[]} args
 * @param {Object} options
 * @param {number} timeoutMs 超时毫秒数，默认 3000
 * @param {Function} spawner
 * @returns {Promise<{success: boolean, code: number|null, stdout: string, stderr: string, message: string}>}
 */
export function runCommandWithTimeout(cmd, args, options = {}, timeoutMs = 3000, spawner = spawn);

/**
 * 启动分离进程，不等待结束，返回 ChildProcess。
 * 调用方负责 unref 与错误处理。
 *
 * @param {string} cmd
 * @param {string[]} args
 * @param {Object} options
 * @param {Function} spawner
 * @returns {Promise<import('node:child_process').ChildProcess>}
 */
export function spawnDetached(cmd, args, options = {}, spawner = spawn);
```

#### 行为约定

- `runCommand` / `runPowerShell` / `runCommandWithTimeout`：
  - 默认 `stdio: 'pipe'`（可通过 options 覆盖）。
  - `success` 为 `code === 0`。
  - `message` 为 `stdout.trim() || stderr.trim() || 'OK'`（成功时）或 `stderr || stdout || 'exit code ${code}'`（失败时）。
- `runCommandWithTimeout`：
  - 使用 `setTimeout` 在超时后 `child.kill()`。
  - 超时后 resolve `{ success: false, code: null, message: 'timeout' }`。
  - 子进程正常结束时清除 timeout。
- `spawnDetached`：
  - 返回 Promise，在 `spawn` 事件触发时 resolve(child)。
  - 在 `error` 事件触发时 reject(error)。
  - **不**在内部调用 `unref()`，由调用方决定是否需要 unref。

### 现有模块迁移

#### `src/updater.js`

删除以下内部辅助函数：

- `runWithStdio`
- `runPowerShellCommand`
- `runCommand`

替换为对 `src/process.js` 的调用：

```js
import { spawn } from 'node:child_process';
import { runCommand, runPowerShell, runCommandWithTimeout } from './process.js';

export async function updateKimiCode(spawner = spawn) {
  return runPowerShell(
    'irm https://code.kimi.com/kimi-code/install.ps1 | iex',
    {},
    spawner
  );
}

export async function updateKsm(cwd, spawner = spawn) {
  return runCommand('git', ['pull'], { cwd }, spawner);
}
```

`getRemoteKsmVersion` 改为：

```js
const result = await runCommandWithTimeout(
  'git', ['ls-remote', '--tags', 'origin'], { cwd }, 3000, spawner
);
if (!result.success) return '';
// 解析 stdout 中的 tag...
```

#### `src/shortcut.js`

将内联的 `spawn('powershell.exe', ['-Command', ps], { stdio: 'pipe' })` Promise 替换为：

```js
import { runPowerShell } from './process.js';

const result = await runPowerShell(ps, { stdio: 'pipe' });
if (result.success) {
  return { success: true, message: lnk };
}
return { success: false, message: result.stderr.trim() || `exit code ${result.code}` };
```

#### `src/kimi-version.js`

将 `getKimiInstalledVersion` 中的内联 spawn 替换为：

```js
import { runCommand } from './process.js';

const result = await runCommand(exe, ['--version']);
if (!result.success) return '';
const output = result.stdout.trim() || result.stderr.trim();
const match = output.match(/(?:kimi\s+)?v?(\d+\.\d+(?:\.\d+)?)/i);
return match ? match[1] : output;
```

#### `src/actions.js`

`openKimi` 的平台分支逻辑（WT 检测、参数构造、临时脚本生成）保持不变。

将最后的 Promise 构造：

```js
return new Promise((resolve, reject) => {
  const child = spawner(cmd, cmdArgs, options);
  let settled = false;

  child.on('error', (err) => { ... });
  child.on('spawn', () => { child.unref(); resolve(child); });
});
```

替换为复用 `spawnDetached`：

```js
import { spawnDetached } from './process.js';

return spawnDetached(cmd, cmdArgs, options, spawner)
  .then((child) => {
    child.unref();
    return child;
  })
  .catch(async (err) => {
    await cleanupTempScript(scriptPath).catch(() => {});
    throw new Error(`无法启动 Kimi Code (${cmd} ${cmdArgs.join(' ')}): ${err.message}`);
  });
```

### 测试计划

1. **新增 `tests/process.test.js`**
   - `runCommand` 成功时返回 stdout。
   - `runCommand` 非零退出码时返回 stderr 和 code。
   - `runCommand` spawn error 时返回失败。
   - `runPowerShell` 在 Windows 上调用 powershell.exe。
   - `runCommandWithTimeout` 正常结束时返回结果。
   - `runCommandWithTimeout` 超时时 kill 子进程并返回失败。
   - `spawnDetached` spawn 成功时返回 ChildProcess。
   - `spawnDetached` spawn 失败时 reject。

2. **更新 `tests/updater.test.js`**
   - 公共 API 不变（仍接受 `spawner` 注入），现有测试结构可基本保留。
   - 断言重点从"内部如何 spawn"转向"调用方看到的 `{success, message}`"。

3. **可选新增**
   - `tests/shortcut.test.js`：mock `runPowerShell`。
   - `tests/kimi-version.test.js`：mock `runCommand`。

### 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| `getRemoteKsmVersion` 超时行为不一致 | `runCommandWithTimeout` 严格复现现有逻辑：超时 kill、resolve 空字符串。 |
| `actions.js` 引入回归 | 只替换最后的 spawn/unref 包装，不改动平台策略与参数构造。 |
| 测试覆盖率下降 | 新增 `tests/process.test.js` 覆盖新模块，原有测试保持或增强。 |
| 接口设计过度抽象 | options 完全透传给 spawn，不隐藏 `cwd`、`stdio`、`env`、`detached` 等参数。 |

## 验收标准

- `src/process.js` 存在并通过新增单元测试。
- `npm test` 全部通过。
- `src/updater.js`、`src/shortcut.js`、`src/kimi-version.js` 不再内联 spawn Promise 包装。
- `src/actions.js` 的 `openKimi` 使用 `spawnDetached` 启动子进程。
- 没有改动非目标模块的接口或行为。
