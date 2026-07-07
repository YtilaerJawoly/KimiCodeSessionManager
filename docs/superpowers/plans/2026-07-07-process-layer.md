# Process Execution Abstraction Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract a reusable `src/process.js` module that unifies all child-process execution across ksm, then migrate `updater.js`, `shortcut.js`, `kimi-version.js`, and `actions.js` to use it.

**Architecture:** Add a thin promise-based wrapper layer around `node:child_process` that exposes four primitives: `runCommand`, `runPowerShell`, `runCommandWithTimeout`, and `spawnDetached`. Keep platform-specific launch strategy in `actions.js`; only replace low-level spawn/event handling.

**Tech Stack:** Node.js >=20, ES modules, built-in `node:test`/`node:assert/strict`.

## Global Constraints

- Node.js >= 20
- ES modules (`"type": "module"` in `package.json`)
- No new runtime dependencies
- All child-process helper functions must accept an injectable `spawner` for unit testing
- Default `stdio` for `runCommand`/`runPowerShell`/`runCommandWithTimeout` is `'pipe'`
- `spawnDetached` must resolve on `spawn` and reject on `error`; caller decides `unref()`
- Preserve existing public APIs (`updateKimiCode(spawner)`, `updateKsm(cwd, spawner)`, etc.)
- Do not modify TUI feedback logic, i18n, store/loader/config, or `bin/ksm.js`

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/process.js` (new) | Unified child-process primitives: `runCommand`, `runPowerShell`, `runCommandWithTimeout`, `spawnDetached`. |
| `tests/process.test.js` (new) | Unit tests for the four process primitives. |
| `src/updater.js` (modify) | Remove internal `runWithStdio`/`runPowerShellCommand`/`runCommand`; delegate to `src/process.js`. |
| `tests/updater.test.js` (modify) | Update mocks to match new internal delegation while keeping public API assertions. |
| `src/shortcut.js` (modify) | Replace inline PowerShell spawn with `runPowerShell`. |
| `src/kimi-version.js` (modify) | Replace inline `kimi.exe --version` spawn with `runCommand`. |
| `src/actions.js` (modify) | Replace `openKimi` final spawn/unref Promise with `spawnDetached`. |
| `tests/actions.test.js` (modify if needed) | Ensure `openKimi` tests still pass after `spawnDetached` adoption. |

---

## Task 1: Create `src/process.js` and its unit tests

**Files:**
- Create: `src/process.js`
- Create: `tests/process.test.js`

**Interfaces:**
- Produces: `runCommand(cmd, args, options = {}, spawner = spawn)` -> `Promise<{success, code, stdout, stderr, message}>`
- Produces: `runPowerShell(command, options = {}, spawner = spawn)` -> `Promise<{success, code, stdout, stderr, message}>`
- Produces: `runCommandWithTimeout(cmd, args, options = {}, timeoutMs = 3000, spawner = spawn)` -> `Promise<{success, code, stdout, stderr, message}>`
- Produces: `spawnDetached(cmd, args, options = {}, spawner = spawn)` -> `Promise<ChildProcess>`

- [ ] **Step 1: Write the failing test skeleton**

Create `tests/process.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  runCommand,
  runPowerShell,
  runCommandWithTimeout,
  spawnDetached,
} from '../src/process.js';

describe('process', () => {
  it('runCommand collects stdout on success', async () => {
    const spawn = makeMockSpawn({ code: 0, stdout: 'ok' });
    const result = await runCommand('cmd', ['arg'], {}, spawn);
    assert.equal(result.success, true);
    assert.equal(result.code, 0);
    assert.equal(result.stdout, 'ok');
    assert.equal(result.message, 'ok');
  });

  it('runCommand collects stderr on failure', async () => {
    const spawn = makeMockSpawn({ code: 1, stderr: 'err' });
    const result = await runCommand('cmd', ['arg'], {}, spawn);
    assert.equal(result.success, false);
    assert.equal(result.code, 1);
    assert.equal(result.stderr, 'err');
    assert.equal(result.message, 'err');
  });

  it('runCommand returns failure on spawn error', async () => {
    const spawn = () => {
      const child = new EventEmitter();
      process.nextTick(() => child.emit('error', new Error('spawn err')));
      return child;
    };
    const result = await runCommand('cmd', ['arg'], {}, spawn);
    assert.equal(result.success, false);
    assert.equal(result.message, 'spawn err');
  });

  it('runPowerShell uses powershell.exe on Windows and pwsh elsewhere', async () => {
    const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
    let captured;
    const spawn = (cmd, args) => {
      captured = { cmd, args };
      return makeMockSpawn({ code: 0, stdout: 'done' })();
    };

    Object.defineProperty(process, 'platform', { value: 'win32' });
    await runPowerShell('Get-Date', {}, spawn);
    assert.equal(captured.cmd, 'powershell.exe');

    Object.defineProperty(process, 'platform', { value: 'darwin' });
    await runPowerShell('Get-Date', {}, spawn);
    assert.equal(captured.cmd, 'pwsh');

    Object.defineProperty(process, 'platform', originalPlatform);
  });

  it('runCommandWithTimeout kills child and returns failure on timeout', async () => {
    const spawn = () => {
      const child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.kill = () => {};
      // never emits close
      return child;
    };
    const result = await runCommandWithTimeout('cmd', ['arg'], {}, 50, spawn);
    assert.equal(result.success, false);
    assert.equal(result.message, 'timeout');
  });

  it('runCommandWithTimeout returns result when child finishes before timeout', async () => {
    const spawn = makeMockSpawn({ code: 0, stdout: 'fast' });
    const result = await runCommandWithTimeout('cmd', ['arg'], {}, 1000, spawn);
    assert.equal(result.success, true);
    assert.equal(result.message, 'fast');
  });

  it('spawnDetached resolves with child on spawn', async () => {
    const spawn = () => {
      const child = new EventEmitter();
      process.nextTick(() => child.emit('spawn'));
      return child;
    };
    const child = await spawnDetached('cmd', ['arg'], {}, spawn);
    assert.ok(child);
  });

  it('spawnDetached rejects on spawn error', async () => {
    const spawn = () => {
      const child = new EventEmitter();
      process.nextTick(() => child.emit('error', new Error('boom')));
      return child;
    };
    await assert.rejects(() => spawnDetached('cmd', ['arg'], {}, spawn), /boom/);
  });
});

function makeMockSpawn({ code = 0, error = null, stdout = '', stderr = '' } = {}) {
  return (cmd, args, options) => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => {};
    process.nextTick(() => {
      if (error) {
        child.emit('error', error);
        return;
      }
      if (stdout) child.stdout.emit('data', stdout);
      if (stderr) child.stderr.emit('data', stderr);
      child.emit('close', code);
    });
    return child;
  };
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
npm test
```
Expected: FAIL — `runCommand` and other functions are not defined.

- [ ] **Step 3: Implement `src/process.js`**

Create `src/process.js`:

```js
import { spawn } from 'node:child_process';
import { platform } from 'node:os';

/**
 * 运行命令并等待结束，收集 stdout / stderr。
 */
export function runCommand(cmd, args, options = {}, spawner = spawn) {
  return runWithStdio(cmd, args, { stdio: 'pipe', ...options }, spawner);
}

/**
 * 在当前平台执行 PowerShell 命令。
 */
export function runPowerShell(command, options = {}, spawner = spawn) {
  const shell = platform() === 'win32' ? 'powershell.exe' : 'pwsh';
  return runWithStdio(shell, ['-Command', command], { stdio: 'pipe', ...options }, spawner);
}

/**
 * 带超时的命令执行。
 */
export function runCommandWithTimeout(cmd, args, options = {}, timeoutMs = 3000, spawner = spawn) {
  return new Promise((resolve) => {
    const child = spawner(cmd, args, { stdio: 'pipe', ...options });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill(); } catch {}
      resolve({ success: false, code: null, stdout, stderr, message: 'timeout' });
    }, timeoutMs);

    child.stdout?.on('data', (data) => { stdout += data; });
    child.stderr?.on('data', (data) => { stderr += data; });
    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ success: false, code: null, stdout, stderr, message: err.message });
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(buildResult(code, stdout, stderr));
    });
  });
}

/**
 * 启动分离进程，不等待结束，返回 ChildProcess。
 */
export function spawnDetached(cmd, args, options = {}, spawner = spawn) {
  return new Promise((resolve, reject) => {
    const child = spawner(cmd, args, options);
    let settled = false;

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    });
    child.on('spawn', () => {
      if (settled) return;
      settled = true;
      resolve(child);
    });
  });
}

function runWithStdio(cmd, args, options, spawner) {
  return new Promise((resolve) => {
    const child = spawner(cmd, args, options);
    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => { stdout += data; });
    child.stderr?.on('data', (data) => { stderr += data; });
    child.on('error', (err) => resolve({
      success: false, code: null, stdout, stderr, message: err.message,
    }));
    child.on('close', (code) => resolve(buildResult(code, stdout, stderr)));
  });
}

function buildResult(code, stdout, stderr) {
  const success = code === 0;
  const message = success
    ? stdout.trim() || stderr.trim() || 'OK'
    : (stderr || stdout).trim() || `exit code ${code}`;
  return { success, code, stdout, stderr, message };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
npm test
```
Expected: PASS for all `process` tests.

- [ ] **Step 5: Commit**

```bash
git add src/process.js tests/process.test.js
git commit -m "feat(process): add unified child-process execution primitives"
```

---

## Task 2: Migrate `src/updater.js` and update its tests

**Files:**
- Modify: `src/updater.js`
- Modify: `tests/updater.test.js`

**Interfaces:**
- Consumes: `runCommand`, `runPowerShell`, `runCommandWithTimeout` from `src/process.js`
- Produces: Same public API — `updateKimiCode(spawner)`, `updateKsm(cwd, spawner)`, `checkKimiCodeVersion(env)`, `checkKsmVersion(cwd, spawner)`

- [ ] **Step 1: Modify `src/updater.js`**

Replace the top imports and helper functions. Final file should look like:

```js
import { spawn } from 'node:child_process';
import { platform } from 'node:os';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { getKimiHome } from './config.js';
import { readKimiLatestVersion, getKimiInstalledVersion } from './kimi-version.js';
import { findLatestStable, isNewer } from './version.js';
import { runCommand, runPowerShell, runCommandWithTimeout } from './process.js';

/**
 * 更新器模块 ... (keep existing module comment)
 */

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

// ... keep checkKimiCodeVersion and checkKsmVersion unchanged except getRemoteKsmVersion ...

async function getRemoteKsmVersion(cwd, spawner) {
  const result = await runCommandWithTimeout(
    'git', ['ls-remote', '--tags', 'origin'], { cwd }, 3000, spawner
  );
  if (!result.success) return '';

  const tags = [];
  for (const line of result.stdout.trim().split('\n')) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 2) continue;
    const ref = parts[1];
    const match = ref.match(/^refs\/tags\/(v\d+\.\d+\.\d+(?:-[a-zA-Z0-9.]+)?)$/);
    if (match) tags.push(match[1]);
  }
  return findLatestStable(tags) || '';
}
```

Remove `runPowerShellCommand`, `runCommand`, and `runWithStdio`.

- [ ] **Step 2: Update `tests/updater.test.js`**

Keep the public API assertions. Since `updateKimiCode` now delegates to `runPowerShell`, the mock spawner still receives `powershell.exe` / `-Command` / install script. Update the test name and assertions:

```js
it('updateKimiCode runs installer in current terminal', async () => {
  let captured;
  const spawn = (cmd, args, options) => {
    captured = { cmd, args, options };
    return makeMockSpawn({ code: 0, stdout: 'installed' })();
  };
  const result = await updateKimiCode(spawn);
  assert.equal(result.success, true);
  assert.equal(result.message, 'installed');
  assert.equal(captured.cmd, 'powershell.exe');
  assert.equal(captured.args[0], '-Command');
  assert.ok(captured.args[1].includes('irm https://code.kimi.com/kimi-code/install.ps1 | iex'));
  assert.equal(captured.options.stdio, 'pipe');
});
```

Other tests can remain mostly unchanged; just ensure `makeMockSpawn` returns children with `stdout`/`stderr` EventEmitters.

- [ ] **Step 3: Run tests**

```bash
npm test
```
Expected: PASS for `updater` suite.

- [ ] **Step 4: Commit**

```bash
git add src/updater.js tests/updater.test.js
git commit -m "refactor(updater): use process.js primitives"
```

---

## Task 3: Migrate `src/shortcut.js`

**Files:**
- Modify: `src/shortcut.js`

**Interfaces:**
- Consumes: `runPowerShell` from `src/process.js`
- Produces: Same public API — `createDesktopShortcut(startExePath)` -> `Promise<{success, message}>`

- [ ] **Step 1: Modify `src/shortcut.js`**

Replace inline spawn with `runPowerShell`:

```js
import { spawn } from 'node:child_process';
import { platform, homedir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { runPowerShell } from './process.js';

export async function createDesktopShortcut(startExePath, spawner = spawn) {
  if (platform() !== 'win32') {
    return { success: false, message: '当前只支持 Windows 桌面快捷方式' };
  }

  const target = resolve(startExePath);
  if (!existsSync(target)) {
    return { success: false, message: `找不到 start.exe: ${target}` };
  }

  const desktop = join(homedir(), 'Desktop');
  const lnk = join(desktop, 'Kimi Code Session Manager.lnk');

  const ps = `
    $WshShell = New-Object -ComObject WScript.Shell
    $Shortcut = $WshShell.CreateShortcut('${lnk.replace(/'/g, "''")}')
    $Shortcut.TargetPath = '${target.replace(/'/g, "''")}'
    $Shortcut.WorkingDirectory = '${dirname(target).replace(/'/g, "''")}'
    $Shortcut.Save()
  `.trim();

  const result = await runPowerShell(ps, {}, spawner);
  if (result.success) {
    return { success: true, message: lnk };
  }
  return { success: false, message: result.message || `exit code ${result.code}` };
}
```

- [ ] **Step 2: Run tests**

```bash
npm test
```
Expected: No `shortcut` tests exist yet; existing suites still PASS.

- [ ] **Step 3: Commit**

```bash
git add src/shortcut.js
git commit -m "refactor(shortcut): use runPowerShell from process.js"
```

---

## Task 4: Migrate `src/kimi-version.js`

**Files:**
- Modify: `src/kimi-version.js`

**Interfaces:**
- Consumes: `runCommand` from `src/process.js`
- Produces: Same public API — `readKimiLatestVersion(home)`, `getKimiInstalledVersion(home)`

- [ ] **Step 1: Modify `src/kimi-version.js`**

```js
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { runCommand } from './process.js';

// readKimiLatestVersion stays unchanged

export async function getKimiInstalledVersion(home, spawner) {
  const exe = join(home, 'bin', 'kimi.exe');
  if (!existsSync(exe)) return '';

  const result = await runCommand(exe, ['--version'], {}, spawner);
  if (!result.success) return '';

  const output = result.stdout.trim() || result.stderr.trim();
  if (!output) return '';
  const match = output.match(/(?:kimi\s+)?v?(\d+\.\d+(?:\.\d+)?)/i);
  return match ? match[1] : output;
}
```

- [ ] **Step 2: Run tests**

```bash
npm test
```
Expected: Existing suites still PASS.

- [ ] **Step 3: Commit**

```bash
git add src/kimi-version.js
git commit -m "refactor(kimi-version): use runCommand from process.js"
```

---

## Task 5: Migrate `src/actions.js` final spawn to `spawnDetached`

**Files:**
- Modify: `src/actions.js`

**Interfaces:**
- Consumes: `spawnDetached` from `src/process.js`
- Produces: Same public API — `continueSession(session, spawner, env)`, `createSession(projectPath, projectName, spawner, env)`, `openKimi(args, cwd, projectName, spawner, env)`

- [ ] **Step 1: Modify `src/actions.js`**

Add import:
```js
import { spawnDetached } from './process.js';
```

Replace the `return new Promise(...)` block at the end of `openKimi`:

```js
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

- [ ] **Step 2: Run tests**

```bash
npm test
```
Expected: `actions` suite PASS.

- [ ] **Step 3: Commit**

```bash
git add src/actions.js
git commit -m "refactor(actions): use spawnDetached from process.js"
```

---

## Task 6: Final verification and integration commit

**Files:**
- All changed files

- [ ] **Step 1: Run full test suite**

```bash
npm test
```
Expected: All 51+ tests pass, including new `process` tests.

- [ ] **Step 2: Check git diff for unintended changes**

```bash
git diff --stat
```
Expected changes only in: `src/process.js`, `tests/process.test.js`, `src/updater.js`, `tests/updater.test.js`, `src/shortcut.js`, `src/kimi-version.js`, `src/actions.js`, plus the earlier `.gitignore` commit from the worktree setup.

- [ ] **Step 3: Final commit if any remaining changes**

If no remaining uncommitted changes, skip. Otherwise:

```bash
git add -A
git commit -m "refactor: migrate child-process handling to process.js"
```

---

## Self-Review Checklist

1. **Spec coverage:**
   - `src/process.js` created with four primitives ✅
   - `updater.js` migrated ✅
   - `shortcut.js` migrated ✅
   - `kimi-version.js` migrated ✅
   - `actions.js` `openKimi` uses `spawnDetached` ✅
   - TUI/i18n/config/loader/store/bin untouched ✅

2. **Placeholder scan:**
   - No TBD/TODO ✅
   - Code blocks contain actual code ✅
   - Commands and expected outputs included ✅

3. **Type consistency:**
   - `runCommand`/`runPowerShell`/`runCommandWithTimeout` return `{success, code, stdout, stderr, message}` consistently ✅
   - `spawnDetached` returns `Promise<ChildProcess>` ✅
   - Public APIs keep existing signatures ✅
